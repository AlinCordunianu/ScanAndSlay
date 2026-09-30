import { useMemo, useRef } from 'react';
import type { RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { Shape } from 'three';
import type { Group, Mesh, MeshBasicMaterial } from 'three';
import { REVEAL_SECONDS } from '../models/animations';

const PARTICLES = Array.from({ length: 8 }, (_, i) => ({
  angle: (i * Math.PI) / 4,
  lift: 0.5 + (i % 3) * 0.25,
  color: i % 2 ? '#f5c451' : '#c3fa75',
}));

export function SpawnStars({ elapsed }: { elapsed: RefObject<number> }) {
  const group = useRef<Group>(null);
  const reducedMotion = useMemo(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );
  const shape = useMemo(() => {
    const star = new Shape();
    for (let i = 0; i < 10; i++) {
      const angle = Math.PI / 2 + (i * Math.PI) / 5;
      const radius = i % 2 ? 0.42 : 1;
      if (i === 0) star.moveTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
      else star.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
    }
    star.closePath();
    return star;
  }, []);
  useFrame(() => {
    if (!group.current) return;
    const t = Math.min(1, elapsed.current / REVEAL_SECONDS);
    group.current.visible = !reducedMotion && t > 0 && t < 1;
    if (!group.current.visible) return;
    group.current.children.forEach((child, i) => {
      const mesh = child as Mesh;
      const particle = PARTICLES[i];
      const angle = particle.angle + t * 1.4;
      const radius = 0.15 + t * 0.95;
      mesh.position.set(Math.cos(angle) * radius, t * particle.lift, Math.sin(angle) * radius);
      mesh.rotation.set(t * 2, particle.angle + t * 3, t * 5);
      mesh.scale.setScalar(0.53 * Math.sin(Math.PI * t));
      (mesh.material as MeshBasicMaterial).opacity = Math.min(1, t * 8) * (1 - t);
    });
  });
  return (
    <group ref={group} name="spawn-stars" visible={false}>
      {PARTICLES.map((particle, i) => (
        <mesh key={i} raycast={() => {}}>
          <extrudeGeometry args={[shape, { depth: 0.2, bevelEnabled: false }]} />
          <meshBasicMaterial
            color={particle.color}
            transparent
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}
