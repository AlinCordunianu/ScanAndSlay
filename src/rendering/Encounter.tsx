import {
  Component,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Center } from '@react-three/drei/core/Center';
import { AnimationMixer, Box3, LoopOnce, LoopRepeat, SkinnedMesh, Vector3 } from 'three';
import type { AnimationAction, Group, Matrix4 } from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { LoadedMonster } from '../models/registry';
import type { Capture } from '../detection/useDetection';
import { monsterAnchor } from '../camera/geometry';
import { monsterClips, revealTransform } from '../models/animations';
import { initialFacingYaw } from './orientation';
import { SpawnStars } from './SpawnStars';
interface ActorProps {
  asset: LoadedMonster;
  enabled: boolean;
  onHit: () => void;
  onDefeated: () => void;
}
function Actor({ asset, enabled, onHit, onDefeated }: ActorProps) {
  const scene = useMemo(() => clone(asset.gltf.scene), [asset]);
  const scale = useMemo(() => {
    const size = new Box3().setFromObject(scene).getSize(new Vector3());
    return 2.5 / Math.max(size.x, size.y, size.z, 0.01);
  }, [scene]);
  const mixer = useMemo(() => new AnimationMixer(scene), [scene]);
  const hitRef = useRef<() => void>(() => {});
  const reveal = useRef<Group>(null);
  const revealTime = useRef(0);
  const tick = useRef<(delta: number) => void>(() => {});
  useEffect(() => {
    const actions = new Map<string, AnimationAction>(
      asset.gltf.animations
        .filter((clip) => clip.duration > 0)
        .map((clip) => [clip.name, mixer.clipAction(clip)]),
    );
    const clips = monsterClips(asset.gltf.animations);
    const idle = clips.loop ? actions.get(clips.loop.name) : undefined;
    const hit = actions.get(clips.hit!.name)!;
    const death = actions.get(clips.death!.name)!;
    let health = 4;
    let phase: 'reveal' | 'idle' | 'hit' | 'death' | 'done' = 'reveal';
    revealTime.current = 0;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    tick.current = (delta) => {
      if (phase !== 'reveal' || !reveal.current) return;
      revealTime.current += delta;
      const transform = revealTransform(reducedMotion ? 1 : revealTime.current);
      reveal.current.scale.setScalar(transform.scale);
      reveal.current.rotation.y = reducedMotion || transform.done ? 0 : transform.rotation;
      if (transform.done) {
        phase = 'idle';
        idle?.reset().setLoop(LoopRepeat, Infinity).play();
      }
    };
    function playOnce(action: AnimationAction) {
      mixer.stopAllAction();
      action.reset();
      action.setLoop(LoopOnce, 1);
      action.clampWhenFinished = true;
      action.play();
    }
    hitRef.current = () => {
      if (health <= 0 || phase !== 'idle') return;
      health--;
      phase = 'hit';
      playOnce(hit);
      onHit();
    };
    const finished = (event: { action: AnimationAction }) => {
      if (event.action === hit && phase === 'hit') {
        if (health === 0) {
          phase = 'death';
          playOnce(death);
        } else {
          phase = 'idle';
          mixer.stopAllAction();
          idle?.reset().setLoop(LoopRepeat, Infinity).play();
        }
      } else if (event.action === death && phase === 'death') {
        phase = 'done';
        onDefeated();
      }
    };
    mixer.addEventListener('finished', finished);
    return () => {
      hitRef.current = () => {};
      tick.current = () => {};
      mixer.removeEventListener('finished', finished);
      mixer.stopAllAction();
      mixer.uncacheRoot(scene);
      scene.traverse((node) => {
        if (node instanceof SkinnedMesh) node.skeleton.dispose();
      });
    };
  }, [asset, mixer, scene, onHit, onDefeated]);
  useFrame((_, delta) => {
    tick.current(delta);
    mixer.update(delta);
  });
  return (
    <>
      <SpawnStars elapsed={revealTime} />
      <group ref={reveal} scale={0.001}>
        <Center top>
          <primitive
            object={scene}
            scale={scale}
            onPointerDown={(event: { stopPropagation: () => void }) => {
              event.stopPropagation();
              if (enabled) hitRef.current();
            }}
          />
        </Center>
      </group>
    </>
  );
}
function TrackedActor({
  capture,
  spawnCapture,
  mirrored,
  visible,
  children,
}: {
  capture: Capture;
  spawnCapture: Capture;
  mirrored: boolean;
  visible: boolean;
  children: ReactNode;
}) {
  const group = useRef<Group>(null);
  const initialized = useRef(false);
  const facing = useRef<Group>(null);
  const initialCamera = useRef<Matrix4 | null>(null);
  const origin = useMemo(() => new Vector3(), []);
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const viewportState = useThree((state) => state.viewport);
  useLayoutEffect(() => {
    if (initialCamera.current || !facing.current) return;
    camera.updateWorldMatrix(true, false);
    initialCamera.current = camera.matrixWorld.clone();
    const viewport = viewportState.getCurrentViewport(camera, origin);
    const spawn = monsterAnchor(spawnCapture, size.width, size.height, mirrored);
    const spawnWorld = new Vector3(
      (spawn.x / size.width - 0.5) * viewport.width,
      (0.5 - spawn.y / size.height) * viewport.height,
      0,
    );
    facing.current.rotation.y = initialFacingYaw(initialCamera.current, spawnWorld);
  }, [camera, viewportState, size.width, size.height, spawnCapture, mirrored, origin]);
  useFrame((state, delta) => {
    if (!group.current) return;
    const anchor = monsterAnchor(capture, state.size.width, state.size.height, mirrored);
    const viewport = state.viewport.getCurrentViewport(state.camera, origin);
    const x = (anchor.x / state.size.width - 0.5) * viewport.width;
    const y = (0.5 - anchor.y / state.size.height) * viewport.height;
    const scale = ((anchor.size / state.size.height) * viewport.height) / 2.5;
    const positionBlend = initialized.current ? 1 - Math.exp(-12 * delta) : 1;
    const scaleBlend = initialized.current ? 1 - Math.exp(-5 * delta) : 1;
    group.current.position.x += (x - group.current.position.x) * positionBlend;
    group.current.position.y += (y - group.current.position.y) * positionBlend;
    group.current.scale.setScalar(
      group.current.scale.x + (scale - group.current.scale.x) * scaleBlend,
    );
    initialized.current = true;
  });
  return (
    <group ref={group} visible={visible}>
      <group ref={facing} name="encounter-facing">
        {children}
      </group>
    </group>
  );
}
class RenderBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <p role="alert" className="render-error">
        The 3D renderer could not start. Return to the landing screen from the menu and try a
        WebGL-capable browser.
      </p>
    ) : (
      this.props.children
    );
  }
}
export function Encounter({
  asset,
  capture,
  spawnCapture,
  visible,
  mirrored,
  enabled,
  onHit,
  onDefeated,
}: ActorProps & { capture: Capture; spawnCapture: Capture; visible: boolean; mirrored: boolean }) {
  const [contextLost, setContextLost] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const onLost = useCallback(() => setContextLost(true), []);
  useEffect(
    () => () => {
      canvasRef.current?.removeEventListener('webglcontextlost', onLost);
    },
    [onLost],
  );
  return (
    <div className="monster-stage" data-tracking-visible={visible}>
      <RenderBoundary>
        <Canvas
          gl={{ alpha: true }}
          dpr={[1, 2]}
          camera={{ position: [0, 0, 5], fov: 40 }}
          onCreated={({ gl }) => {
            gl.setClearColor(0x000000, 0);
            canvasRef.current = gl.domElement;
            gl.domElement.addEventListener('webglcontextlost', onLost);
          }}
        >
          <ambientLight intensity={1.7} />
          <directionalLight position={[3, 5, 4]} intensity={3} />
          <TrackedActor
            capture={capture}
            spawnCapture={spawnCapture}
            mirrored={mirrored}
            visible={visible}
          >
            <Actor
              asset={asset}
              enabled={enabled && visible}
              onHit={onHit}
              onDefeated={onDefeated}
            />
          </TrackedActor>
        </Canvas>
      </RenderBoundary>
      {contextLost && (
        <p className="render-error" role="alert">
          3D context lost. Return to the landing screen from the menu and try again.
        </p>
      )}
    </div>
  );
}
