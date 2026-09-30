import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DetectorSession, ObjectTracker } from './tracking';
import type { Detector } from './tracking';
import type { Detection } from './confirmation';
import { coverBox, monsterAnchor } from '../camera/geometry';

const box = (x: number, score = 0.8): Detection => ({
  class: 'cup',
  score,
  bbox: [x, 0.5, 0.1, 0.2],
});
test('association follows position and size rather than a higher-confidence neighboring object', () => {
  const tracker = new ObjectTracker('cup');
  assert.equal(tracker.update([box(0.2), box(0.7, 0.7)], 0)?.bbox[0], 0.2);
  assert.equal(tracker.update([box(0.7, 0.99), box(0.22, 0.6)], 200)?.bbox[0], 0.22);
  assert.equal(tracker.update([box(0.75)], 400), null);
  assert.equal(tracker.visible, true);
  assert.equal(tracker.update([{ ...box(0.23), class: 'bottle' }], 600), null);
  assert.equal(tracker.visible, true);
  assert.equal(tracker.update([box(0.24, 0.54)], 800), null);
  assert.equal(tracker.visible, false);
  assert.equal(tracker.update([box(0.24), box(0.75, 0.99)], 1000)?.bbox[0], 0.24);
  assert.equal(tracker.visible, true);
});
test('grace tolerates one miss but expires at 600ms even at a slow inference rate', () => {
  const tracker = new ObjectTracker('cup');
  tracker.update([box(0.3)], 0);
  tracker.update([], 200);
  assert.equal(tracker.visible, true);
  tracker.update([], 600);
  assert.equal(tracker.visible, false);
  tracker.update([box(0.31)], 800);
  assert.equal(tracker.visible, true);
});
test('anchor stays above the mapped box under cover cropping and front-camera mirroring', () => {
  const capture = {
    detection: { ...box(0), bbox: [600, 360, 160, 120] as Detection['bbox'] },
    width: 1280,
    height: 720,
  };
  for (const [width, height] of [
    [390, 844],
    [1440, 900],
  ]) {
    const b = coverBox(capture.detection.bbox, capture.width, capture.height, width, height, false);
    const rear = monsterAnchor(capture, width, height, false);
    const front = monsterAnchor(capture, width, height, true);
    assert.ok(Math.abs(rear.x - (b.left + b.width / 2)) < 0.001);
    assert.ok(rear.y < b.top);
    assert.ok(Math.abs(front.x - (width - rear.x)) < 0.001);
    assert.equal(front.y, rear.y);
    assert.equal(front.size, rear.size);
  }
});
test('one model is reused, calls do not overlap, and start times are at least 200ms apart', async () => {
  const session = new DetectorSession();
  let loads = 0,
    calls = 0,
    disposed = 0;
  let finish!: (results: Detection[]) => void;
  const model: Detector = {
    detect: () => {
      calls++;
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
    dispose: () => {
      disposed++;
    },
  };
  const factory = async () => {
    loads++;
    return model;
  };
  await session.load(factory);
  await session.load(factory);
  assert.equal(loads, 1);
  const video = {} as HTMLVideoElement;
  const pending = session.detect(video, 0);
  assert.equal(await session.detect(video, 250), null);
  finish([]);
  await pending;
  assert.equal(await session.detect(video, 199), null);
  const second = session.detect(video, 200);
  assert.equal(calls, 2);
  session.dispose();
  assert.equal(disposed, 0, 'do not dispose tensors during inference');
  finish([]);
  await second;
  assert.equal(disposed, 1);
  assert.equal(await session.detect(video, 800), null);
});
test('model finishing its load after leaving is disposed without starting inference', async () => {
  const session = new DetectorSession();
  let finish!: (model: Detector) => void;
  let disposed = 0;
  const pending = session.load(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  session.dispose();
  finish({
    detect: async () => {
      throw new Error('must not run');
    },
    dispose: () => {
      disposed++;
    },
  });
  await pending;
  assert.equal(disposed, 1);
  assert.equal(session.ready, false);
});
