import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { collectionComplete, newRound, restartRound, reduceRound, replacement } from '../game/game';
import { MONSTER_CATALOG } from '../models/catalog';
import type { Round } from '../game/game';
import type { LoadedMonster } from '../models/registry';
import { Encounter } from '../rendering/Encounter';
import { useCamera } from './useCamera';
import type { CameraStatus } from './useCamera';
import { useDetection } from '../detection/useDetection';
import type { Capture } from '../detection/useDetection';
import { MonsterAlmanac } from './MonsterAlmanac';

export type HuntStage =
  'choose-target' | 'searching' | 'monster-found' | 'combat' | 'defeated' | 'victory';
interface Props {
  round: Round;
  setRound: Dispatch<SetStateAction<Round>>;
  storageError: boolean;
  onLeave: () => void;
}
function Modal({
  children,
  label,
  className = '',
  dismissible = true,
  onClose,
}: {
  children: ReactNode;
  label: string;
  className?: string;
  dismissible?: boolean;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={label}
      className={className}
      onKeyDown={(event) => {
        if (!dismissible && event.key === 'Escape') event.preventDefault();
      }}
      onCancel={(event) => {
        event.preventDefault();
        if (dismissible) onClose();
      }}
      onClick={(event) => {
        if (className === 'drawer' && event.target === event.currentTarget) {
          const r = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < r.left ||
            event.clientX > r.right ||
            event.clientY < r.top ||
            event.clientY > r.bottom
          )
            onClose();
        }
      }}
    >
      {children}
    </dialog>
  );
}
function permissionCopy(status: CameraStatus) {
  switch (status) {
    case 'denied':
      return {
        title: 'The camera is still hiding.',
        text: 'Your browser blocked camera access. Allow it in this site’s permissions, then try again.',
      };
    case 'not-found':
      return { title: 'No camera found', text: 'Connect or enable a camera, then try again.' };
    case 'in-use':
      return {
        title: 'Camera is unavailable',
        text: 'Another app or tab may be using your camera. Close it, check your device camera settings, then try again.',
      };
    case 'unsupported':
      return {
        title: 'Camera is not supported here',
        text: 'Open this site over HTTPS (or localhost) in a browser that supports camera access.',
      };
    case 'error':
      return {
        title: 'Something interrupted the camera',
        text: 'The camera could not start or was disconnected. Check the connection and your device permissions, then try again.',
      };
    default:
      return {
        title: 'Ready to start the hunt?',
        text: 'Camera access lets you scan household objects and find the monsters hiding nearby. Video is processed locally in your browser.',
      };
  }
}
export function Scanner({ round, setRound, storageError, onLeave }: Props) {
  const camera = useCamera();
  const [stage, setStage] = useState<HuntStage>('choose-target');
  const [instructionsAccepted, setInstructionsAccepted] = useState(false);
  const [panel, setPanel] = useState<'drawer' | 'almanac' | null>(null);
  const drawer = panel === 'drawer';
  const previousProgress = useRef(round.progress);
  const [capture, setCapture] = useState<Capture | null>(null);
  const [searchAttempt, setSearchAttempt] = useState(0);
  const menuRef = useRef<HTMLButtonElement>(null);
  const almanacEntry = useRef<HTMLButtonElement>(null);
  const active = round.monsters.find((m) => m.id === round.activeMonsterId);
  const encounter = stage === 'monster-found' || stage === 'combat';
  const complete = collectionComplete(round);
  const requestedModelId =
    instructionsAccepted && camera.status === 'granted' && (stage === 'searching' || encounter)
      ? active?.modelId
      : undefined;
  const [loadedAsset, setLoadedAsset] = useState<LoadedMonster | null>(null);
  const [assetError, setAssetError] = useState('');
  const asset = loadedAsset?.definition.modelId === requestedModelId ? loadedAsset : null;
  useEffect(() => {
    setLoadedAsset(null);
    setAssetError('');
    if (!requestedModelId) return;
    let cancelled = false;
    let release: (() => void) | undefined;
    void import('../models/registry')
      .then(async ({ loadMonster, disposeMonster }) => {
        if (cancelled) return;
        const result = await loadMonster(requestedModelId);
        if (cancelled) disposeMonster(result);
        else {
          release = () => disposeMonster(result);
          setLoadedAsset(result);
        }
      })
      .catch(() => {
        if (!cancelled)
          setAssetError(
            'Monster could not load. Open the menu and select this hunt again to retry.',
          );
      });
    return () => {
      cancelled = true;
      release?.();
    };
  }, [requestedModelId, searchAttempt]);
  const onCapture = useCallback(
    (origin: Capture) => {
      setCapture(origin);
      setPanel(null);
      setStage('monster-found');
      setRound((r) => reduceRound(r, { type: 'encounter' }));
    },
    [setRound],
  );
  const detection = useDetection(
    camera.videoRef,
    active?.assignedObject,
    camera.status === 'granted',
    instructionsAccepted &&
      camera.status === 'granted' &&
      (stage === 'searching' || encounter) &&
      !!asset,
    camera.mirrored,
    searchAttempt,
    onCapture,
    panel === 'almanac',
  );
  const onHit = useCallback(() => setRound((r) => reduceRound(r, { type: 'hit' })), [setRound]);
  const onDefeated = useCallback(() => {
    setRound((r) => reduceRound(r, { type: 'defeated' }));
    setStage('defeated');
  }, [setRound]);
  useEffect(() => {
    if (stage !== 'monster-found') return;
    const timer = setTimeout(() => setStage('combat'), 1100);
    return () => clearTimeout(timer);
  }, [stage]);
  useEffect(() => {
    if ((complete || round.progress === round.monsters.length) && camera.status === 'granted') {
      setStage('victory');
      if (previousProgress.current < round.progress)
        setPanel((current) => (current === 'almanac' ? current : 'drawer'));
    }
    previousProgress.current = round.progress;
  }, [round.progress, round.monsters.length, complete, camera.status]);
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);
  function closeDrawer() {
    setPanel(null);
    // Wait until the native modal has closed and the HUD is no longer inert.
    requestAnimationFrame(() => menuRef.current?.focus());
  }
  function closeAlmanac() {
    setPanel('drawer');
    requestAnimationFrame(() => almanacEntry.current?.focus());
  }
  async function startCamera(switchCamera = false) {
    setPanel(null);
    setCapture(null);
    setStage('choose-target');
    setRound((r) => ({
      ...r,
      monsters: r.monsters.map((m) =>
        m.status === 'encounter' ? { ...m, status: 'scanning', health: 4 } : m,
      ),
    }));
    if (
      (await camera.request(
        switchCamera ? (camera.facing === 'user' ? 'environment' : 'user') : camera.facing,
      )) &&
      switchCamera
    )
      setPanel('drawer');
  }
  function select(id: string) {
    if (!instructionsAccepted || encounter) return;
    setRound((r) => reduceRound(r, { type: 'select', id }));
    setCapture(null);
    setStage('searching');
    setSearchAttempt((n) => n + 1);
    closeDrawer();
  }
  function reset(nextRound = false) {
    setRound((r) => (nextRound ? newRound(r.caughtIds, r.almanacIds) : restartRound(r)));
    setSearchAttempt((attempt) => attempt + 1);
    previousProgress.current = 0;
    setCapture(null);
    setStage('choose-target');
    setPanel('drawer');
  }
  const copy = permissionCopy(camera.status);
  const ready = camera.status === 'granted';
  const detectorBlocked = ready && detection.modelStatus !== 'ready';
  return (
    <main className="scanner-screen">
      <video
        ref={camera.videoRef}
        autoPlay
        muted
        playsInline
        className={camera.mirrored ? 'camera-video mirrored' : 'camera-video'}
      />
      <div className="grain" aria-hidden="true" />
      {!ready && (
        <picture className="permission-art" aria-hidden="true">
          <source media="(min-width: 768px)" srcSet="/art/start-bg-desktop.png" />
          <img src="/art/start-bg-mobile.png" alt="" />
        </picture>
      )}
      {ready && instructionsAccepted && (
        <>
          <div className="reticle" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </div>
          {stage === 'searching' && detection.box && (
            <div className="target-outline" style={detection.box} aria-hidden="true" />
          )}
          <div
            className="hud-progress"
            aria-label={`${round.progress} of ${round.monsters.length} monsters collected`}
          >
            {round.progress} <span>/ {round.monsters.length}</span>
          </div>
          <button
            ref={menuRef}
            className="menu-toggle"
            aria-label="Open hunt menu"
            aria-expanded={drawer}
            aria-controls="hunt-menu"
            onClick={() => setPanel('drawer')}
          >
            <span aria-hidden="true">☰</span>
          </button>
          <section
            className={`stage-card ${stage === 'victory' ? 'victory-card' : ''}`}
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {stage === 'choose-target' && (
              <>
                <h2>Choose your next hunt</h2>
                <p>Open the menu and select one of the remaining clues.</p>
              </>
            )}
            {stage === 'searching' && (
              <>
                <h2>Find a {active?.assignedObject}</h2>
                <p>Point the camera at a {active?.assignedObject} and hold steady.</p>
                <div
                  className="detection-progress"
                  aria-label={`${detection.progress} of 3 consecutive detections`}
                >
                  {[0, 1, 2].map((n) => (
                    <span key={n} className={n < detection.progress ? 'full' : ''} />
                  ))}
                </div>
              </>
            )}
            {stage === 'monster-found' && (
              <>
                <h2>Monster found</h2>
                <p>Get ready.</p>
              </>
            )}
            {stage === 'combat' && (
              <>
                <h2>{active?.displayName}</h2>
                <p>{active?.health ? 'Tap the monster to attack' : 'Finishing move…'}</p>
                <div className="health" aria-label={`${active?.health ?? 0} of 4 health`}>
                  {[0, 1, 2, 3].map((n) => (
                    <span key={n} className={n < (active?.health ?? 0) ? 'full' : ''} />
                  ))}
                </div>
              </>
            )}
            {stage === 'defeated' && (
              <>
                <span className="defeated-check" aria-hidden="true">
                  ✓
                </span>
                <h2>Monster defeated</h2>
                <p>Choose another hunt from the menu.</p>
              </>
            )}
            {stage === 'victory' && (
              <>
                <span className="victory-symbol" aria-hidden="true">
                  ✦
                </span>
                <h2>House cleared</h2>
                <p>
                  {round.caughtIds.length} / {MONSTER_CATALOG.length} unique monsters collected.
                </p>
                <p>
                  {complete
                    ? 'Your collection is complete. Return to the landing screen from the menu.'
                    : 'Open the menu to hunt the remaining monsters or return to the landing screen.'}
                </p>
              </>
            )}
            {(stage === 'choose-target' || stage === 'searching' || encounter) && (
              <small>
                {assetError ||
                  (requestedModelId && !asset ? 'Loading monster…' : detection.message)}
              </small>
            )}
          </section>
          {encounter && capture && active && asset && (
            <Encounter
              key={active.id}
              asset={asset}
              capture={detection.capture ?? capture}
              spawnCapture={capture}
              visible={detection.visible}
              mirrored={camera.mirrored}
              enabled={stage === 'combat' && !panel && detection.visible}
              onHit={onHit}
              onDefeated={onDefeated}
            />
          )}
        </>
      )}
      {!ready && (
        <Modal
          label="camera-title"
          className={`permission-modal${camera.status === 'denied' ? ' permission-modal--denied' : ''}`}
          onClose={onLeave}
        >
          <h2 id="camera-title">{copy.title}</h2>
          <p>{copy.text}</p>
          {camera.status === 'denied' && (
            <div className="permission-help">
              <p>
                In Chrome or Edge, select the camera or lock icon beside the address bar, allow
                camera access, then return here. Also check your device’s camera privacy settings.
              </p>
            </div>
          )}
          <button
            autoFocus
            disabled={camera.status === 'requesting'}
            onClick={() => void startCamera()}
          >
            {camera.status === 'requesting'
              ? 'Requesting camera access…'
              : camera.status === 'idle'
                ? 'Turn on camera'
                : 'Try again'}
          </button>
          <button className="secondary" onClick={onLeave}>
            {camera.status === 'idle' || camera.status === 'requesting' ? 'Back' : 'Back to start'}
          </button>
          {camera.status === 'idle' && (
            <p className="permission-note">Your camera stays off until you start.</p>
          )}
          {camera.status === 'requesting' && (
            <p role="status">Waiting for your browser. Respond to its camera permission prompt.</p>
          )}
        </Modal>
      )}
      {ready && instructionsAccepted && !detectorBlocked && drawer && (
        <Modal label="menu-title" className="drawer" onClose={closeDrawer}>
          <div id="hunt-menu">
            <div className="drawer-heading">
              <div>
                <span className="eyebrow brand-logo">SCAN &amp; SLAY</span>
                <h2 id="menu-title" className={stage === 'victory' ? 'victory-heading' : undefined}>
                  {stage === 'victory' ? 'House cleared' : 'Your hunts'}
                </h2>
              </div>
              <button
                autoFocus
                className="secondary close-menu"
                aria-label="Close hunt menu"
                onClick={closeDrawer}
              >
                ×
              </button>
            </div>
            <div className="collection-progress">
              <strong>
                {round.progress} / {round.monsters.length}
              </strong>
              <span> monsters collected</span>
              <progress
                value={round.progress}
                max={round.monsters.length}
                aria-label="Collection progress"
              />
            </div>
            <div className="slots">
              {round.monsters.map((m, i) => (
                <button
                  className={`slot ${m.status === 'defeated' ? 'collected' : ''}`}
                  aria-pressed={m.id === active?.id && stage !== 'choose-target'}
                  key={m.id}
                  disabled={encounter || m.status === 'defeated'}
                  onClick={() => select(m.id)}
                >
                  <span className="slot-number">0{i + 1}</span>
                  <strong>
                    {m.status === 'defeated' ? '✓ ' + m.displayName : 'Find a ' + m.assignedObject}
                  </strong>
                  <small>
                    {m.status === 'defeated' ? m.assignedObject + ' · defeated' : 'Hidden monster'}
                  </small>
                </button>
              ))}
            </div>
            {stage !== 'victory' && (
              <div className="drawer-hint">
                <span className="eyebrow">CURRENT HINT</span>
                <p>
                  {active && active.status !== 'defeated'
                    ? `Something is hiding near a ${active.assignedObject}. Point your camera at it and hold steady.`
                    : 'Select a remaining clue to continue your hunt.'}
                </p>
                <button
                  className="primary"
                  disabled={
                    encounter ||
                    !active ||
                    active.status === 'defeated' ||
                    !replacement(round, active)
                  }
                  onClick={() => {
                    setRound((r) => reduceRound(r, { type: 'skip' }));
                    setStage('searching');
                    setSearchAttempt((n) => n + 1);
                    closeDrawer();
                  }}
                >
                  Find another hiding place
                </button>
              </div>
            )}
            {assetError && (
              <p className="notice" role="alert">
                {assetError}
              </p>
            )}
            {requestedModelId && !asset && !assetError && <p role="status">Loading monster…</p>}
            {storageError && (
              <p className="notice">
                Storage is unavailable. Progress will last for this visit only.
              </p>
            )}
            <div className="drawer-actions">
              <button ref={almanacEntry} className="primary" onClick={() => setPanel('almanac')}>
                Monster Almanac
              </button>
              {stage === 'victory' ? (
                <>
                  <p>
                    {complete
                      ? 'Your collection is complete. Every monster caught.'
                      : 'Round complete. More monsters are waiting.'}
                  </p>
                  {!complete && <button onClick={() => reset(true)}>Start a new round</button>}
                </>
              ) : (
                <>
                  <button className="secondary" onClick={() => void startCamera(true)}>
                    Switch to {camera.facing === 'user' ? 'rear' : 'front'} camera
                  </button>
                </>
              )}
              <button className="secondary" onClick={() => reset()}>
                Reset Hunt
              </button>
              <button className="secondary" onClick={onLeave}>
                Return to landing screen
              </button>
            </div>
          </div>
        </Modal>
      )}
      {ready && instructionsAccepted && !detectorBlocked && panel === 'almanac' && (
        <Modal label="almanac-title" className="almanac-dialog" onClose={closeAlmanac}>
          <MonsterAlmanac caughtIds={round.almanacIds} onClose={closeAlmanac} />
        </Modal>
      )}
      {ready && !detectorBlocked && !instructionsAccepted && (
        <Modal
          label="instructions-title"
          className="permission-modal instructions-modal"
          dismissible={false}
          onClose={() => {}}
        >
          <h2 id="instructions-title">How to hunt</h2>
          <ol>
            <li>Follow the clue to find the suggested object.</li>
            <li>Keep the object in frame until a monster appears.</li>
            <li>Tap the monster four times to defeat it.</li>
            <li>Collect all six monsters to complete the hunt.</li>
          </ol>
          <button
            autoFocus
            onClick={() => {
              setInstructionsAccepted(true);
              requestAnimationFrame(() => menuRef.current?.focus());
            }}
          >
            Got it, start hunting
          </button>
        </Modal>
      )}
      {detectorBlocked && (
        <Modal
          label="detector-title"
          className="permission-modal detector-modal"
          dismissible={false}
          onClose={() => {}}
        >
          {detection.modelStatus === 'error' ? (
            <>
              <h2 id="detector-title">Object detector could not start</h2>
              <p role="alert">Check your internet connection and try again.</p>
              <button autoFocus onClick={detection.retryModel}>
                Retry
              </button>
            </>
          ) : (
            <div role="status" aria-live="polite">
              <span className="detector-spinner" aria-hidden="true" />
              <h2 id="detector-title">The hunt is being prepared.…</h2>
              <p>Loading object detector</p>
            </div>
          )}
          <button className="secondary" onClick={onLeave}>
            Back to start
          </button>
        </Modal>
      )}
    </main>
  );
}
