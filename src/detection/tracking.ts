import type { ObjectClass } from '../game/game';
import type { Detection } from './confirmation';

export const INFERENCE_INTERVAL_MS = 200;
export const LOST_AFTER_MS = 600;
export interface Capture {
  detection: Detection;
  width: number;
  height: number;
}

/** Spatial association, not physical identity: COCO-SSD supplies boxes, not IDs. */
export class ObjectTracker {
  private previous: Detection | null = null;
  private misses = 0;
  private lastSeen = 0;
  visible = false;

  constructor(private target: ObjectClass) {}

  update(results: Detection[], now: number): Detection | null {
    const matches = results.filter((r) => r.class === this.target && r.score >= 0.55);
    let best: Detection | undefined;
    if (!this.previous) {
      best = matches.sort((a, b) => b.score - a.score)[0];
    } else {
      const [x, y, w, h] = this.previous.bbox;
      let bestCost = Infinity;
      for (const candidate of matches) {
        const [cx, cy, cw, ch] = candidate.bbox;
        const distance = Math.hypot(cx + cw / 2 - x - w / 2, cy + ch / 2 - y - h / 2);
        const ratio = Math.max(cw / w, w / cw, ch / h, h / ch);
        // Reject implausible jumps to a different instance of the same class.
        if (distance > Math.max(0.12, Math.hypot(w, h) * 1.2) || ratio > 2.5) continue;
        const overlap =
          Math.max(0, Math.min(x + w, cx + cw) - Math.max(x, cx)) *
          Math.max(0, Math.min(y + h, cy + ch) - Math.max(y, cy));
        const iou = overlap / (w * h + cw * ch - overlap);
        const cost =
          distance / Math.max(0.05, Math.hypot(w, h)) + (1 - iou) + Math.log(ratio) * 0.5;
        if (cost < bestCost) {
          best = candidate;
          bestCost = cost;
        }
      }
    }
    if (best) {
      this.previous = best;
      this.misses = 0;
      this.lastSeen = now;
      this.visible = true;
      return best;
    }
    this.misses++;
    if (this.misses >= 3 || now - this.lastSeen >= LOST_AFTER_MS) this.visible = false;
    return null;
  }
}

export interface Detector {
  detect(video: HTMLVideoElement, maxBoxes: number, minScore: number): Promise<Detection[]>;
  dispose(): void;
}

/** Owns one model, including a single-flight guard across target/loop changes. */
export class DetectorSession {
  private model: Detector | null = null;
  private loading: Promise<Detector> | null = null;
  private busy = false;
  private closed = false;
  private lastStart = -Infinity;
  get ready() {
    return this.model !== null;
  }
  nextDelay(now: number) {
    return this.busy
      ? INFERENCE_INTERVAL_MS
      : Math.max(1, Math.ceil(INFERENCE_INTERVAL_MS - (now - this.lastStart)));
  }

  async load(factory: () => Promise<Detector>): Promise<void> {
    if (this.closed) return;
    if (this.model) return;
    if (!this.loading) this.loading = factory();
    const pending = this.loading;
    try {
      const model = await pending;
      if (this.loading !== pending) return;
      this.loading = null;
      if (this.closed) model.dispose();
      else this.model = model;
    } catch (error) {
      if (this.loading === pending) this.loading = null;
      throw error;
    }
  }

  async detect(video: HTMLVideoElement, now: number): Promise<Detection[] | null> {
    if (this.closed || !this.model || this.busy || now - this.lastStart < INFERENCE_INTERVAL_MS)
      return null;
    this.busy = true;
    this.lastStart = now;
    try {
      return await this.model.detect(video, 20, 0.55);
    } finally {
      this.busy = false;
      if (this.closed) this.release();
    }
  }
  dispose() {
    this.closed = true;
    if (!this.busy) this.release();
  }
  private release() {
    this.model?.dispose();
    this.model = null;
  }
}
