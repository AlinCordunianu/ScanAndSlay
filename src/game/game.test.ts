import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  collectionComplete,
  restartRound,
  newRound,
  reduceRound,
  replacement,
  restoreRound,
  saveRound,
} from './game';
import { MONSTER_CATALOG } from '../models/catalog';
import { Confirmation } from '../detection/confirmation';
import { coverBox } from '../camera/geometry';
import { cameraError } from '../camera/useCamera';

test('cover coordinates account for horizontal and vertical cropping and front-camera mirroring', () => {
  assert.deepEqual(coverBox([400, 100, 200, 100], 1280, 720, 360, 720, false), {
    left: -60,
    top: 100,
    width: 200,
    height: 100,
  });
  assert.deepEqual(coverBox([400, 100, 200, 100], 1280, 720, 360, 720, true), {
    left: 220,
    top: 100,
    width: 200,
    height: 100,
  });
  assert.deepEqual(coverBox([100, 400, 100, 200], 720, 1280, 720, 360, false), {
    left: 100,
    top: -60,
    width: 100,
    height: 200,
  });
  assert.deepEqual(coverBox([100, 50, 200, 100], 1280, 720, 640, 360, false), {
    left: 50,
    top: 25,
    width: 100,
    height: 50,
  });
});
test('camera errors retain distinct recovery states', () => {
  assert.equal(cameraError({ name: 'NotAllowedError' }), 'denied');
  assert.equal(cameraError({ name: 'NotFoundError' }), 'not-found');
  assert.equal(cameraError({ name: 'NotReadableError' }), 'in-use');
  assert.equal(cameraError(new Error('Unexpected failure')), 'error');
});
test('six unique assignments; skips never repeat and stop when exhausted', () => {
  let round = newRound();
  assert.equal(new Set(round.monsters.map((m) => m.assignedObject)).size, 6);
  const seen = new Set([round.monsters[0].assignedObject]);
  while (replacement(round, round.monsters[0])) {
    round = reduceRound(round, { type: 'skip' });
    assert.ok(!seen.has(round.monsters[0].assignedObject));
    seen.add(round.monsters[0].assignedObject);
    assert.equal(new Set(round.monsters.map((m) => m.assignedObject)).size, 6);
  }
  assert.equal(seen.size, 10);
});
test('encounter locks selection and progress waits for death completion', () => {
  let round = reduceRound(newRound(), { type: 'encounter' });
  assert.equal(reduceRound(round, { type: 'select', id: 'monster-2' }), round);
  for (let i = 0; i < 5; i++) round = reduceRound(round, { type: 'hit' });
  assert.equal(round.monsters[0].health, 0);
  assert.equal(round.progress, 0);
  round = reduceRound(round, { type: 'defeated' });
  assert.equal(round.progress, 1);
  round = reduceRound(round, { type: 'defeated' });
  assert.equal(round.progress, 1);
  const used = round.monsters[0].assignedObject;
  round = reduceRound(round, { type: 'return' });
  for (let i = 0; i < 20; i++) {
    round = reduceRound(round, { type: 'skip' });
    assert.notEqual(round.monsters[1].assignedObject, used);
  }
});
test('confirmation requires consecutive matching confident results; selects score then area', () => {
  const gate = new Confirmation();
  const box = {
    class: 'cup',
    score: 0.7,
    bbox: [0, 0, 10, 10] as [number, number, number, number],
  };
  assert.equal(gate.push([box], 'cup'), null);
  assert.equal(gate.push([{ ...box, class: 'bottle' }], 'cup'), null);
  assert.equal(gate.push([box], 'cup'), null);
  assert.equal(gate.push([{ ...box, score: 0.54 }], 'cup'), null);
  assert.equal(gate.push([box], 'cup'), null);
  assert.equal(gate.push([box], 'cup'), null);
  const large = { ...box, bbox: [0, 0, 20, 20] as [number, number, number, number] };
  assert.equal(gate.push([box, large, { ...large, score: 0.6 }], 'cup'), large);
});
test('six completed encounters produce victory and persist defeated slots', () => {
  let stored: string | null = null;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: () => stored,
      setItem: (_key: string, value: string) => {
        stored = value;
      },
    },
  });
  let round = newRound();
  round = reduceRound(round, { type: 'skip' });
  for (let slot = 0; slot < 6; slot++) {
    round = reduceRound(round, { type: 'encounter' });
    for (let hit = 0; hit < 4; hit++) round = reduceRound(round, { type: 'hit' });
    round = reduceRound(round, { type: 'defeated' });
    round = reduceRound(round, { type: 'return' });
  }
  assert.equal(round.progress, 6);
  assert.equal(round.activeMonsterId, null);
  assert.equal(saveRound(round), true);
  assert.deepEqual(restoreRound(), round);
  stored = '{invalid';
  assert.equal(restoreRound().progress, 0);
});
test('refresh retains assignments and skips but restarts an unfinished encounter', () => {
  let stored: string | null = null;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: () => stored,
      setItem: (_key: string, value: string) => {
        stored = value;
      },
    },
  });
  let round = reduceRound(newRound(), { type: 'skip' });
  round = reduceRound(round, { type: 'encounter' });
  round = reduceRound(round, { type: 'hit' });
  saveRound(round);
  const restored = restoreRound();
  assert.equal(restored.monsters[0].health, 4);
  assert.equal(restored.monsters[0].status, 'scanning');
  assert.equal(restored.monsters[0].assignedObject, round.monsters[0].assignedObject);
  assert.deepEqual(restored.monsters[0].skippedObjects, round.monsters[0].skippedObjects);
  assert.deepEqual(
    restored.monsters.map((m) => m.modelId),
    round.monsters.map((m) => m.modelId),
  );
});

function finishActive(round: ReturnType<typeof newRound>) {
  round = reduceRound(round, { type: 'encounter' });
  for (let i = 0; i < 4; i++) round = reduceRound(round, { type: 'hit' });
  return reduceRound(round, { type: 'defeated' });
}

test('rounds reserve six random distinct species; only Death completion records a catch', () => {
  const assignments = new Set<string>();
  for (let i = 0; i < 20; i++) {
    const round = newRound();
    assert.equal(new Set(round.monsters.map((m) => m.modelId)).size, 6);
    assignments.add(round.monsters.map((m) => m.modelId).join(','));
    assert.equal(restartRound(round).progress, 0);
  }
  assert.ok(assignments.size > 1);
  let round = reduceRound(newRound(), { type: 'encounter' });
  for (let i = 0; i < 4; i++) round = reduceRound(round, { type: 'hit' });
  assert.deepEqual(round.caughtIds, []);
  round = reduceRound(round, { type: 'defeated' });
  assert.deepEqual(round.caughtIds, [round.monsters[0].modelId]);
  assert.deepEqual(reduceRound(round, { type: 'defeated' }).caughtIds, round.caughtIds);
});

test('continuing a round excludes previous catches; explicit restart preserves the almanac', () => {
  let round = newRound();
  for (let i = 0; i < 6; i++) {
    round = finishActive(round);
    round = reduceRound(round, { type: 'return' });
  }
  const firstIds = [...round.caughtIds];
  round = newRound(round.caughtIds, round.almanacIds);
  assert.equal(round.monsters.length, 1);
  assert.ok(!firstIds.includes(round.monsters[0].modelId));
  assert.deepEqual(round.caughtIds, firstIds);
  round = finishActive(round);
  assert.equal(collectionComplete(round), true);
  assert.equal(round.caughtIds.length, MONSTER_CATALOG.length);
  const restarted = restartRound(round);
  assert.equal(restarted.progress, 0);
  assert.equal(collectionComplete(restarted), false);
  assert.deepEqual(restarted.almanacIds, round.almanacIds);
  assert.equal(restarted.monsters[0].modelId, round.monsters[0].modelId);
  saveRound(round);
  assert.equal(collectionComplete(restoreRound()), true);
});

test('Restart Hunt clears catches, damage and skips from the current round and survives reload', () => {
  let stored: string | null = null;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: () => stored,
      setItem: (_key: string, value: string) => {
        stored = value;
      },
    },
  });
  let round = finishActive(newRound());
  const caught = round.monsters[0].modelId;
  round = reduceRound(round, { type: 'return' });
  round = reduceRound(round, { type: 'skip' });
  round = reduceRound(round, { type: 'encounter' });
  round = reduceRound(round, { type: 'hit' });
  const restarted = restartRound(round);
  assert.equal(restarted.progress, 0);
  assert.deepEqual(restarted.caughtIds, []);
  assert.deepEqual(restarted.almanacIds, [caught]);
  assert.ok(
    restarted.monsters.every(
      (m) =>
        m.health === 4 &&
        m.skippedObjects.length === 0 &&
        m.status !== 'defeated' &&
        m.status !== 'encounter',
    ),
  );
  saveRound(restarted);
  assert.deepEqual(restoreRound(), restarted);
});

test('legacy duplicate Alien victories retain mission credit without inventing caught species', () => {
  let stored = JSON.stringify({
    version: 1,
    activeMonsterId: 'monster-4',
    monsters: newRound().monsters.map((m, i) => ({
      ...m,
      modelId: undefined,
      modelPath: '/models/monsters/Alien.gltf',
      status: i < 3 ? 'defeated' : 'hidden',
      health: i < 3 ? 0 : 4,
    })),
  });
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: () => stored,
      setItem: (_key: string, value: string) => {
        stored = value;
      },
    },
  });
  const migrated = restoreRound();
  assert.equal(migrated.progress, 3);
  assert.deepEqual(migrated.caughtIds, ['alien']);
  const pending = migrated.monsters.filter((m) => m.status !== 'defeated');
  assert.equal(new Set(pending.map((m) => m.modelId)).size, 3);
  assert.ok(pending.every((m) => m.modelId !== 'alien'));
  saveRound(migrated);
  assert.deepEqual(restoreRound(), migrated);
});

test('damaged mission data does not discard a valid saved collection', () => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: () =>
        JSON.stringify({ version: 2, caughtIds: ['alien', 'cthulhu'], monsters: null }),
    },
  });
  const restored = restoreRound();
  assert.deepEqual(restored.caughtIds, ['alien', 'cthulhu']);
  assert.equal(restored.monsters.length, 5);
  assert.ok(restored.monsters.every((m) => !restored.caughtIds.includes(m.modelId)));
});
