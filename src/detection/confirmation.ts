import type { ObjectClass } from '../game/game';
export interface Detection {
  class: string;
  score: number;
  bbox: [number, number, number, number];
}
export class Confirmation {
  private streak = 0;
  get progress() {
    return Math.min(3, this.streak);
  }
  reset() {
    this.streak = 0;
  }
  push(results: Detection[], target: ObjectClass): Detection | null {
    const best = results
      .filter((r) => r.class === target && r.score >= 0.55)
      .sort((a, b) => b.score - a.score || b.bbox[2] * b.bbox[3] - a.bbox[2] * a.bbox[3])[0];
    this.streak = best ? this.streak + 1 : 0;
    return this.streak >= 3 ? best : null;
  }
}
