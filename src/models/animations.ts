export function monsterClips<T extends { name: string; duration: number }>(clips: readonly T[]) {
  const valid = clips.filter((clip) => clip.duration > 0);
  const exact = (name: string) => valid.find((clip) => clip.name.toLowerCase() === name);
  return {
    loop: valid.find((clip) => /dance/i.test(clip.name)) ?? exact('idle') ?? exact('flying'),
    hit: exact('hitrecieve') ?? exact('hitreceive'),
    death: exact('death'),
  };
}

export const REVEAL_SECONDS = 0.7;
export function revealTransform(elapsed: number) {
  const progress = Math.min(1, Math.max(0, elapsed / REVEAL_SECONDS));
  const eased = 1 - (1 - progress) ** 3;
  return { scale: 0.001 + 0.999 * eased, rotation: 4 * Math.PI * eased, done: progress === 1 };
}
