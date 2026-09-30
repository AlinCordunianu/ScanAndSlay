import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { ObjectClass } from '../game/game';
import { Confirmation } from './confirmation';
import type { Detection } from './confirmation';
import { coverBox } from '../camera/geometry';
import { DetectorSession, INFERENCE_INTERVAL_MS, ObjectTracker } from './tracking';
import type { Capture } from './tracking';
export type { Capture } from './tracking';

type ModelStatus = 'idle' | 'loading' | 'ready' | 'error';
export function useDetection(
  videoRef: RefObject<HTMLVideoElement | null>,
  target: ObjectClass | undefined,
  cameraReady: boolean,
  enabled: boolean,
  mirrored: boolean,
  retryKey: number,
  onCapture: (capture: Capture) => void,
  paused = false,
) {
  const sessionRef = useRef<DetectorSession | null>(null);
  const pausedRef = useRef(paused);
  const refreshLoop = useRef<(() => void) | null>(null);
  useEffect(() => {
    pausedRef.current = paused;
    refreshLoop.current?.();
  }, [paused]);
  const [modelStatus, setModelStatus] = useState<ModelStatus>('idle');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [progress, setProgress] = useState(0);
  const [box, setBox] = useState<ReturnType<typeof coverBox> | null>(null);
  const [capture, setCapture] = useState<Capture | null>(null);
  const [visible, setVisible] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const session = new DetectorSession();
    sessionRef.current = session;
    return () => session.dispose();
  }, []);

  // Loading belongs to the camera session, not an individual hunt or combat stage.
  useEffect(() => {
    if (!cameraReady) return;
    const session = sessionRef.current!;
    let cancelled = false;
    if (session.ready) {
      setModelStatus('ready');
      return;
    }
    setModelStatus('loading');
    void session
      .load(async () => {
        const [tf, coco] = await Promise.all([
          import('@tensorflow/tfjs'),
          import('@tensorflow-models/coco-ssd'),
        ]);
        await tf.ready();
        return coco.load({ base: 'lite_mobilenet_v2' });
      })
      .then(() => {
        if (!cancelled) setModelStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setModelStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [cameraReady, loadAttempt]);

  useEffect(() => {
    setProgress(0);
    setBox(null);
    setCapture(null);
    setVisible(false);
    setConfirmed(false);
    setError('');
    if (!enabled || !target || modelStatus !== 'ready') return;
    const session = sessionRef.current!;
    const tracker = new ObjectTracker(target);
    const confirmation = new Confirmation();
    let cancelled = false;
    let busy = false;
    let found = false;
    let visibilityEpoch = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    function schedule(delay: number) {
      clearTimeout(timer);
      if (!cancelled && !document.hidden && !pausedRef.current)
        timer = setTimeout(() => {
          void detect();
        }, delay);
    }
    async function detect() {
      if (cancelled || busy || document.hidden || pausedRef.current) return;
      const video = videoRef.current;
      if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
        schedule(INFERENCE_INTERVAL_MS);
        return;
      }
      busy = true;
      const start = performance.now();
      const epoch = visibilityEpoch;
      try {
        const results = await session.detect(video, start);
        if (
          cancelled ||
          document.hidden ||
          pausedRef.current ||
          epoch !== visibilityEpoch ||
          !results
        )
          return;
        const rect = video.getBoundingClientRect();
        const visibleResults = results.filter((result) => {
          const b = coverBox(
            result.bbox,
            video.videoWidth,
            video.videoHeight,
            rect.width,
            rect.height,
            mirrored,
          );
          return (
            b.left + b.width / 2 >= 0 &&
            b.left + b.width / 2 <= rect.width &&
            b.top + b.height / 2 >= 0 &&
            b.top + b.height / 2 <= rect.height
          );
        });
        // Associate in normalized source coordinates, independent of crop, mirror, or orientation.
        const normalized = visibleResults.map((result) => ({
          ...result,
          bbox: [
            result.bbox[0] / video.videoWidth,
            result.bbox[1] / video.videoHeight,
            result.bbox[2] / video.videoWidth,
            result.bbox[3] / video.videoHeight,
          ] as Detection['bbox'],
        }));
        const match = tracker.update(normalized, performance.now());
        setVisible(tracker.visible);
        setError('');
        if (match) {
          const detection = {
            ...match,
            bbox: [
              match.bbox[0] * video.videoWidth,
              match.bbox[1] * video.videoHeight,
              match.bbox[2] * video.videoWidth,
              match.bbox[3] * video.videoHeight,
            ] as Detection['bbox'],
          };
          const next = { detection, width: video.videoWidth, height: video.videoHeight };
          setCapture(next);
          setBox(
            coverBox(detection.bbox, next.width, next.height, rect.width, rect.height, mirrored),
          );
          if (!found && confirmation.push([match], target!)) {
            found = true;
            setConfirmed(true);
            onCapture(next);
          }
        } else {
          if (!tracker.visible) setBox(null);
          if (!found) confirmation.reset();
        }
        setProgress(confirmation.progress);
      } catch {
        if (!cancelled && !pausedRef.current && epoch === visibilityEpoch) {
          setVisible(false);
          setError('Object tracking was interrupted. Retrying…');
        }
      } finally {
        busy = false;
        schedule(session.nextDelay(performance.now()));
      }
    }
    function onVisibility() {
      visibilityEpoch++;
      clearTimeout(timer);
      if (!document.hidden) schedule(0);
    }
    document.addEventListener('visibilitychange', onVisibility);
    // Pause scheduling without rebuilding the tracker, confirmation streak, or encounter.
    refreshLoop.current = onVisibility;
    schedule(0);
    return () => {
      cancelled = true;
      refreshLoop.current = null;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled, target, mirrored, retryKey, modelStatus, videoRef, onCapture]);

  const message =
    modelStatus !== 'ready'
      ? ''
      : error ||
        (enabled && confirmed
          ? visible
            ? 'Monster tracking object'
            : 'Object out of view. Bring it back to continue.'
          : enabled && target
            ? `Searching for a ${target}…`
            : '');
  function retryModel() {
    if (modelStatus !== 'error') return;
    setModelStatus('loading');
    setLoadAttempt((attempt) => attempt + 1);
  }
  return { progress, box, capture, visible, message, modelStatus, retryModel };
}
