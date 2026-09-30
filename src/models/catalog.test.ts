import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { MONSTER_CATALOG } from './catalog';
import { monsterClips, revealTransform } from './animations';

test('manifest covers every unique playable model and all referenced local assets exist', () => {
  const files = readdirSync('public/models/monsters').filter((name) => /\.(gltf|glb)$/.test(name));
  assert.deepEqual(MONSTER_CATALOG.map((m) => m.modelPath.split('/').at(-1)).sort(), files.sort());
  assert.equal(new Set(MONSTER_CATALOG.map((m) => m.modelId)).size, files.length);
  for (const model of MONSTER_CATALOG) {
    const data = JSON.parse(readFileSync(`public${model.modelPath}`, 'utf8'));
    assert.ok(data.meshes.length && data.scenes.length, model.displayName);
    const clips = data.animations.map(
      (animation: { name: string; samplers: { input: number }[] }) => ({
        name: animation.name,
        duration: Math.max(...animation.samplers.map(({ input }) => data.accessors[input].max[0])),
      }),
    );
    const selected = monsterClips(clips);
    assert.ok(selected.hit && selected.death, `${model.displayName} is playable`);
    assert.equal(selected.loop?.name, model.modelId === 'cthulhu' ? 'Flying' : 'Dance');
    for (const resource of [...data.buffers, ...data.images]) {
      if (resource.uri && !resource.uri.startsWith('data:')) {
        assert.ok(existsSync(`public/models/monsters/${resource.uri}`), resource.uri);
      }
    }
  }
});

test('animation choice is case insensitive, preserves original names, and tolerates no loop', () => {
  const clip = (name: string) => ({ name, duration: 1 });
  assert.equal(
    monsterClips(['IDLE', 'Flying', 'Victory_DANCE'].map(clip)).loop?.name,
    'Victory_DANCE',
  );
  assert.equal(monsterClips(['IDLE', 'Flying'].map(clip)).loop?.name, 'IDLE');
  assert.equal(monsterClips([clip('fLyInG')]).loop?.name, 'fLyInG');
  assert.equal(monsterClips([clip('Death')]).loop, undefined);
  assert.equal(monsterClips([clip('HitReceive')]).hit?.name, 'HitReceive');
  assert.equal(monsterClips([clip('HitRecieve')]).hit?.name, 'HitRecieve');
  assert.equal(monsterClips([{ name: 'Dance', duration: 0 }, clip('Idle')]).loop?.name, 'Idle');
});

test('700ms reveal starts tiny, eases out to target scale, and completes two turns', () => {
  assert.equal(revealTransform(0).scale, 0.001);
  assert.ok(revealTransform(0.35).scale > 0.5);
  assert.deepEqual(revealTransform(0.7), { scale: 1, rotation: Math.PI * 4, done: true });
  assert.deepEqual(revealTransform(10), revealTransform(0.7));
});
