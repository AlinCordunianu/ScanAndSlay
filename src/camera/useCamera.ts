import { useCallback, useEffect, useRef, useState } from 'react';

export type CameraStatus =
  'idle' | 'requesting' | 'granted' | 'denied' | 'not-found' | 'in-use' | 'unsupported' | 'error';
export function cameraError(error: unknown): CameraStatus {
  const name = error && typeof error === 'object' && 'name' in error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
  if (name === 'NotFoundError') return 'not-found';
  if (name === 'NotReadableError' || name === 'AbortError') return 'in-use';
  return 'error';
}

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const generation = useRef(0);
  const pending = useRef(false);
  const [status, setStatus] = useState<CameraStatus>('idle');
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [mirrored, setMirrored] = useState(false);
  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);
  useEffect(
    () => () => {
      generation.current++;
      pending.current = false;
      stop();
    },
    [stop],
  );

  const request = useCallback(
    async (nextFacing: 'environment' | 'user' = facing) => {
      if (pending.current) return false;
      pending.current = true;
      const attempt = ++generation.current;
      stop();
      setStatus('requesting');
      setFacing(nextFacing);
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setStatus('unsupported');
          return false;
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: nextFacing }, width: { ideal: 1280 } },
          audio: false,
        });
        if (attempt !== generation.current) {
          stream.getTracks().forEach((track) => track.stop());
          return false;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) {
          stop();
          return false;
        }
        video.srcObject = stream;
        await video.play();
        if (attempt !== generation.current) return false;
        const track = stream.getVideoTracks()[0];
        setMirrored((track?.getSettings().facingMode ?? nextFacing) === 'user');
        if (track)
          track.onended = () => {
            stop();
            setStatus('error');
          };
        setStatus('granted');
        return true;
      } catch (error) {
        if (attempt === generation.current) {
          stop();
          setStatus(cameraError(error));
        }
        return false;
      } finally {
        if (attempt === generation.current) pending.current = false;
      }
    },
    [facing, stop],
  );
  return { videoRef, status, request, facing, mirrored };
}
