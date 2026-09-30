import { useEffect, useState } from 'react';
import { restoreRound, saveRound } from './game/game';
import type { Round } from './game/game';
import { MONSTER_CATALOG } from './models/catalog';
import type { Scanner as ScannerComponent } from './camera/Scanner';
import tokenFull from './assets/ui/monster-token-full.png';
import tokenEmpty from './assets/ui/monster-token-empty.png';

export type AppScreen = 'landing' | 'scanner';
export function App() {
  const [screen, setScreen] = useState<AppScreen>('landing');
  const [round, setRound] = useState<Round>(() => restoreRound());
  const [storageError, setStorageError] = useState(false);
  const [Scanner, setScanner] = useState<typeof ScannerComponent | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState('');
  async function startHunt() {
    if (starting) return;
    setStarting(true);
    setStartError('');
    try {
      const module = await import('./camera/Scanner');
      setScanner(() => module.Scanner);
      setScreen('scanner');
    } catch {
      setStartError('The hunt could not load. Check your connection and try again.');
    } finally {
      setStarting(false);
    }
  }
  useEffect(() => {
    setStorageError(!saveRound(round));
  }, [round]);
  function leave() {
    setRound((r) => ({
      ...r,
      monsters: r.monsters.map((m) =>
        m.status === 'encounter' ? { ...m, health: 4, status: 'scanning' } : m,
      ),
    }));
    setScreen('landing');
  }
  if (screen === 'scanner' && Scanner)
    return (
      <Scanner round={round} setRound={setRound} storageError={storageError} onLeave={leave} />
    );
  return (
    <main className="landing">
      <picture className="landing-art" aria-hidden="true">
        <source media="(min-width: 768px)" srcSet="/art/start-bg-desktop.png" />
        <img src="/art/start-bg-mobile.png" alt="" fetchPriority="high" />
      </picture>
      <div className="grain" aria-hidden="true" />
      <div className="landing-content">
        <h1 className="brand-logo">
          Scan <span>&amp;</span> Slay
        </h1>
        <h2>
          Your home has a<br />
          monster problem.
        </h2>
        <p className="landing-description">
          Follow a clue, scan the object, then tap the creature four times before it escapes.
        </p>
        <div className="landing-progress">
          
          <small>
            Collection: {round.almanacIds.length} / {MONSTER_CATALOG.length} unique monsters
          </small>
          <div
            className="monster-progress-tokens"
            role="img"
            aria-label={`${round.progress} of ${round.monsters.length} monsters caught`}
          >
            {Array.from({ length: round.monsters.length }, (_, index) => {
              const isCollected = index < round.progress;
              return (
                <img
                  key={index}
                  className={`monster-progress-token ${
                    isCollected ? 'monster-progress-token--full' : 'monster-progress-token--empty'
                  }`}
                  src={isCollected ? tokenFull : tokenEmpty}
                  alt=""
                  aria-hidden="true"
                  width={32}
                  height={32}
                />
              );
            })}
          </div>
        </div>
        <button
          className="hunt-cta"
          onClick={() => void startHunt()}
          disabled={starting}
          aria-busy={starting}
        >
          {starting ? 'Loading the hunt…' : 'Start the hunt'}
        </button>
        {startError && (
          <p role="alert" className="notice">
            {startError}
          </p>
        )}
        <small className="camera-note">Camera stays off until you begin.</small>
        {storageError && (
          <p role="alert" className="notice">
            Browser storage is unavailable. Progress will last for this visit only.
          </p>
        )}
      </div>
    </main>
  );
}
