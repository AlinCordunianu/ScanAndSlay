import { Component, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { Center } from '@react-three/drei/core/Center';
import { Box3, SkinnedMesh, Vector3 } from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { LoadedMonster } from '../models/registry';

function PreviewModel({ asset }: { asset: LoadedMonster }) {
  const scene = useMemo(() => clone(asset.gltf.scene), [asset]);
  const scale = useMemo(() => {
    const size = new Box3().setFromObject(scene).getSize(new Vector3());
    return 2.5 / Math.max(size.x, size.y, size.z, 0.01);
  }, [scene]);
  useEffect(
    () => () => {
      scene.traverse((node) => {
        if (node instanceof SkinnedMesh) node.skeleton.dispose();
      });
    },
    [scene],
  );
  return (
    <Center>
      <primitive object={scene} scale={scale} />
    </Center>
  );
}

export class PreviewBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <p role="status">Preview unavailable. This monster is still safely in your collection.</p>
    ) : (
      this.props.children
    );
  }
}

export function MonsterPreview({ modelId, name }: { modelId: string; name: string }) {
  const [asset, setAsset] = useState<LoadedMonster | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let release: (() => void) | undefined;
    void import('../models/registry')
      .then(async ({ loadMonster, disposeMonster }) => {
        if (cancelled) return;
        const loaded = await loadMonster(modelId);
        if (cancelled) disposeMonster(loaded);
        else {
          release = () => disposeMonster(loaded);
          setAsset(loaded);
        }
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
      release?.();
    };
  }, [modelId]);
  if (error) return <p role="status">Preview could not load. Close it and try again.</p>;
  if (!asset) return <p role="status">Loading {name} preview…</p>;
  return (
    <PreviewBoundary>
      <div className="almanac-preview" role="img" aria-label={`3D preview of ${name}`}>
        <Canvas frameloop="demand" dpr={[1, 1.5]} camera={{ position: [0, 0, 5], fov: 40 }}>
          <ambientLight intensity={1.7} />
          <directionalLight position={[3, 5, 4]} intensity={3} />
          <PreviewModel asset={asset} />
        </Canvas>
      </div>
    </PreviewBoundary>
  );
}
