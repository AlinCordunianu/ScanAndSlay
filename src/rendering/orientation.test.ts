import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { initialFacingYaw } from './orientation';
import { caughtMonsters, MONSTER_LORE } from '../models/almanac';
import { MONSTER_CATALOG } from '../models/catalog';

test('almanac filters saved catches, deduplicates IDs, and has individual descriptions', () => {
  assert.deepEqual(caughtMonsters([]), []);
  assert.deepEqual(
    caughtMonsters(['alien', 'alien', 'unknown']).map((m) => m.modelId),
    ['alien'],
  );
  assert.equal(new Set(Object.values(MONSTER_LORE)).size, MONSTER_CATALOG.length);
  assert.ok(MONSTER_CATALOG.every((m) => MONSTER_LORE[m.modelId].length > 60));
});

test('initial facing uses camera world position and the model forward axis', () => {
  assert.equal(initialFacingYaw(new Matrix4().makeTranslation(0, 0, 5), new Vector3()), 0);
  assert.equal(
    initialFacingYaw(new Matrix4().makeTranslation(5, 0, 0), new Vector3()),
    Math.PI / 2,
  );
  assert.equal(
    initialFacingYaw(new Matrix4().makeTranslation(0, 0, 5), new Vector3(2, 0, 0)),
    Math.atan2(-2, 5),
  );
  assert.equal(
    initialFacingYaw(new Matrix4().makeTranslation(0, 0, 5), new Vector3(), Math.PI),
    -Math.PI,
  );
});

test('snapshot survives changes to the camera and handles a rotated camera at the same X/Z', () => {
  const world = new Matrix4().makeTranslation(2, 3, 5);
  const snapshot = world.clone();
  const yaw = initialFacingYaw(snapshot, new Vector3());
  world.makeTranslation(-8, 3, 1);
  assert.equal(initialFacingYaw(snapshot, new Vector3()), yaw);
  const rotated = new Matrix4().compose(
    new Vector3(0, 3, 0),
    new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2),
    new Vector3(1, 1, 1),
  );
  assert.ok(Math.abs(initialFacingYaw(rotated, new Vector3()) - Math.PI / 2) < 1e-6);
});
