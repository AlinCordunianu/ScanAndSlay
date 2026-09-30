import { MONSTER_CATALOG } from '../models/catalog';

export const OBJECTS = [
  'cup',
  'bottle',
  'book',
  'cell phone',
  'potted plant',
  'laptop',
  'keyboard',
  'mouse',
  'remote',
  'chair',
  'clock',
  'vase',
  'bowl',
  'toothbrush',
  'teddy bear',
] as const;
export type ObjectClass = (typeof OBJECTS)[number];
export type MonsterStatus = 'hidden' | 'scanning' | 'encounter' | 'defeated';
export interface MonsterDefinition {
  modelId: string;
  displayName: string;
  modelPath: string;
}
export interface Monster extends MonsterDefinition {
  id: string;
  assignedObject: ObjectClass;
  skippedObjects: ObjectClass[];
  maxHealth: 4;
  health: number;
  status: MonsterStatus;
}
export interface Round {
  version: 3;
  caughtIds: string[];
  almanacIds: string[];
  monsters: Monster[];
  activeMonsterId: string | null;
  progress: number;
}
export type Action =
  | { type: 'select'; id: string }
  | { type: 'skip' }
  | { type: 'encounter' }
  | { type: 'hit' }
  | { type: 'defeated' }
  | { type: 'return' };
function shuffle<T>(values: readonly T[]): T[] {
  const pool = [...values];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}
export function newRound(caughtIds: string[] = [], almanacIds: string[] = caughtIds): Round {
  const pool = shuffle(OBJECTS);
  const models = shuffle(MONSTER_CATALOG.filter((m) => !caughtIds.includes(m.modelId))).slice(0, 6);
  return {
    version: 3,
    caughtIds: [...caughtIds],
    almanacIds: [...new Set([...almanacIds, ...caughtIds])],
    progress: 0,
    activeMonsterId: models.length ? 'monster-1' : null,
    monsters: models.map((definition, i) => ({
      ...definition,
      id: `monster-${i + 1}`,
      assignedObject: pool[i],
      skippedObjects: [],
      maxHealth: 4,
      health: 4,
      status: i === 0 ? 'scanning' : 'hidden',
    })),
  };
}
export function collectionComplete(round: Round) {
  return MONSTER_CATALOG.every((m) => round.caughtIds.includes(m.modelId));
}
export function restartRound(round: Round): Round {
  // Explicit restart releases this round's catches, but never erases the almanac.
  const currentIds = new Set(round.monsters.map((m) => m.modelId));
  return newRound(
    round.caughtIds.filter((id) => !currentIds.has(id)),
    round.almanacIds,
  );
}
export function replacement(round: Round, monster: Monster): ObjectClass | undefined {
  return OBJECTS.find(
    (object) =>
      !round.monsters.some((item) => item.assignedObject === object) &&
      !monster.skippedObjects.includes(object),
  );
}
export function reduceRound(round: Round, action: Action): Round {
  const active = round.monsters.find((m) => m.id === round.activeMonsterId);
  if (action.type === 'select') {
    if (
      active?.status === 'encounter' ||
      !round.monsters.some((m) => m.id === action.id && m.status !== 'defeated')
    )
      return round;
    return {
      ...round,
      activeMonsterId: action.id,
      monsters: round.monsters.map((m) => ({
        ...m,
        status: m.status === 'defeated' ? 'defeated' : m.id === action.id ? 'scanning' : 'hidden',
      })),
    };
  }
  if (action.type === 'return') {
    if (active?.status !== 'defeated') return round;
    const next = round.monsters.find((m) => m.status !== 'defeated');
    return {
      ...round,
      activeMonsterId: next?.id ?? null,
      monsters: round.monsters.map((m) => (m.id === next?.id ? { ...m, status: 'scanning' } : m)),
    };
  }
  if (!active) return round;
  let updated = active;
  if (action.type === 'skip' && active.status === 'scanning') {
    const object = replacement(round, active);
    if (object)
      updated = {
        ...active,
        assignedObject: object,
        skippedObjects: [...active.skippedObjects, active.assignedObject],
      };
  }
  if (action.type === 'encounter' && active.status === 'scanning')
    updated = { ...active, status: 'encounter' };
  if (action.type === 'hit' && active.status === 'encounter' && active.health > 0)
    updated = { ...active, health: active.health - 1 };
  if (action.type === 'defeated' && active.status === 'encounter' && active.health === 0)
    updated = { ...active, status: 'defeated' };
  const monsters = round.monsters.map((m) => (m.id === active.id ? updated : m));
  const caughtIds =
    updated.status === 'defeated' && !round.caughtIds.includes(updated.modelId)
      ? [...round.caughtIds, updated.modelId]
      : round.caughtIds;
  return {
    ...round,
    monsters,
    caughtIds,
    almanacIds: [...new Set([...round.almanacIds, ...caughtIds])],
    progress: monsters.filter((m) => m.status === 'defeated').length,
  };
}
const KEY = 'scan-and-slay.round.v1';
export function saveRound(round: Round): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(round));
    return true;
  } catch {
    return false;
  }
}
export function restoreRound(): Round {
  let caughtIds: string[] = [];
  let almanacIds: string[] = [];
  try {
    const data: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (
      !data ||
      typeof data !== 'object' ||
      !('version' in data) ||
      (data.version !== 1 && data.version !== 2 && data.version !== 3)
    )
      return newRound();
    const knownId = (id: unknown): id is string =>
      typeof id === 'string' && MONSTER_CATALOG.some((m) => m.modelId === id);
    if ('caughtIds' in data && Array.isArray(data.caughtIds))
      caughtIds = [...new Set(data.caughtIds.filter(knownId))];
    almanacIds = [
      ...new Set([
        ...caughtIds,
        ...('almanacIds' in data && Array.isArray(data.almanacIds)
          ? data.almanacIds.filter(knownId)
          : []),
      ]),
    ];
    if (!('monsters' in data) || !Array.isArray(data.monsters) || data.monsters.length > 6)
      return newRound(caughtIds, almanacIds);
    // Old saves recorded repeated Alien missions. Retain those completed slots without
    // inventing catches for other species. All new/live assignments are distinct.
    if (data.version === 1) {
      for (const value of data.monsters) {
        if (value?.status !== 'defeated') continue;
        const model =
          MONSTER_CATALOG.find((m) => m.modelPath === value.modelPath) ?? MONSTER_CATALOG[0];
        if (!caughtIds.includes(model.modelId)) caughtIds.push(model.modelId);
      }
    }
    const available = shuffle(MONSTER_CATALOG.filter((m) => !caughtIds.includes(m.modelId)));
    const reserved = new Set<string>();
    const monsters: Monster[] = [];
    for (const value of data.monsters as unknown[]) {
      if (!value || typeof value !== 'object') return newRound(caughtIds, almanacIds);
      const m = value as Record<string, unknown>;
      if (
        typeof m.id !== 'string' ||
        !OBJECTS.includes(m.assignedObject as ObjectClass) ||
        !Array.isArray(m.skippedObjects) ||
        !m.skippedObjects.every((o: unknown) => OBJECTS.includes(o as ObjectClass)) ||
        !['hidden', 'scanning', 'encounter', 'defeated'].includes(String(m.status)) ||
        typeof m.health !== 'number' ||
        !Number.isInteger(m.health) ||
        m.health < 0 ||
        m.health > 4 ||
        m.maxHealth !== 4 ||
        (m.status === 'defeated' && m.health !== 0)
      )
        return newRound(caughtIds, almanacIds);
      let definition: MonsterDefinition | undefined;
      if (data.version === 1) {
        definition =
          m.status === 'defeated'
            ? (MONSTER_CATALOG.find((model) => model.modelPath === m.modelPath) ??
              MONSTER_CATALOG[0])
            : available.pop();
      } else {
        definition = MONSTER_CATALOG.find((model) => model.modelId === m.modelId);
      }
      if (
        !definition ||
        (m.status !== 'defeated' &&
          (caughtIds.includes(definition.modelId) || reserved.has(definition.modelId)))
      )
        return newRound(caughtIds, almanacIds);
      reserved.add(definition.modelId);
      if (m.status === 'defeated' && !caughtIds.includes(definition.modelId))
        caughtIds.push(definition.modelId);
      monsters.push({
        ...definition,
        id: m.id,
        assignedObject: m.assignedObject as ObjectClass,
        skippedObjects: m.skippedObjects as ObjectClass[],
        maxHealth: 4,
        health: m.status === 'defeated' ? 0 : 4,
        status: m.status === 'defeated' ? 'defeated' : 'hidden',
      });
    }
    if (
      new Set(monsters.map((m) => m.id)).size !== monsters.length ||
      new Set(monsters.map((m) => m.assignedObject)).size !== monsters.length
    )
      return newRound(caughtIds, almanacIds);
    if (!monsters.length && caughtIds.length < MONSTER_CATALOG.length)
      return newRound(caughtIds, almanacIds);
    const savedId = 'activeMonsterId' in data ? data.activeMonsterId : null;
    const active =
      monsters.find((m) => m.id === savedId && m.status !== 'defeated') ??
      monsters.find((m) => m.status !== 'defeated');
    if (active) active.status = 'scanning';
    return {
      version: 3,
      caughtIds,
      almanacIds: [...new Set([...almanacIds, ...caughtIds])],
      monsters,
      activeMonsterId: active?.id ?? null,
      progress: monsters.filter((m) => m.status === 'defeated').length,
    };
  } catch {
    return newRound(caughtIds, almanacIds);
  }
}
