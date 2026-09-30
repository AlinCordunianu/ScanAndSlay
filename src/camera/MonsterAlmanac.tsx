import { useState } from 'react';
import { MONSTER_CATALOG } from '../models/catalog';
import { MONSTER_LORE, caughtMonsters } from '../models/almanac';
import { MonsterPreview } from '../rendering/MonsterPreview';

export function MonsterAlmanac({
  caughtIds,
  onClose,
}: {
  caughtIds: string[];
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const caught = caughtMonsters(caughtIds);
  return (
    <>
      <header className="almanac-heading">
        <div>
          <h2 id="almanac-title">Monster Almanac</h2>
          <p>
            {caught.length} of {MONSTER_CATALOG.length} monsters caught
          </p>
        </div>
        <button autoFocus className="secondary" onClick={onClose}>
          Back to hunts
        </button>
      </header>
      {caught.length === 0 ? (
        <div className="almanac-empty">
          <h3>No residents yet!</h3>
          <p>
            Your almanac is suspiciously quiet. Follow a clue and catch your first household
            troublemaker.
          </p>
        </div>
      ) : (
        <ul className="almanac-grid">
          {caught.map((monster) => (
            <li className="almanac-card" key={monster.modelId}>
              <h3>
                {monster.displayName} <span aria-label="Caught">✓</span>
              </h3>
              <p>{MONSTER_LORE[monster.modelId]}</p>
              <button
                className="secondary"
                aria-expanded={selected === monster.modelId}
                aria-controls={`preview-${monster.modelId}`}
                onClick={() => setSelected(selected === monster.modelId ? null : monster.modelId)}
              >
                {selected === monster.modelId ? 'Close preview' : `Preview ${monster.displayName}`}
              </button>
              <div id={`preview-${monster.modelId}`}>
                {selected === monster.modelId && (
                  <MonsterPreview
                    key={monster.modelId}
                    modelId={monster.modelId}
                    name={monster.displayName}
                  />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
