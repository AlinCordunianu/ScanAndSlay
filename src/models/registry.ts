import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Mesh, Texture } from 'three';
import type { MonsterDefinition } from '../game/game';
import { MONSTER_CATALOG } from './catalog';
import { monsterClips } from './animations';

export interface LoadedMonster {
  definition: MonsterDefinition;
  gltf: GLTF;
}

export function disposeMonster({ gltf }: LoadedMonster) {
  const resources = new Set<{ dispose(): void }>();
  gltf.scene.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    resources.add(node.geometry);
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      resources.add(material);
      for (const value of Object.values(material)) {
        if (value instanceof Texture) resources.add(value);
      }
    }
  });
  resources.forEach((resource) => resource.dispose());
}

export async function loadMonster(modelId: string): Promise<LoadedMonster> {
  const definition = MONSTER_CATALOG.find((model) => model.modelId === modelId);
  if (!definition) throw new Error('This monster is not in the catalog.');
  const gltf = await new GLTFLoader().loadAsync(definition.modelPath);
  const result = { definition, gltf };
  const clips = monsterClips(gltf.animations);
  let hasMesh = false;
  gltf.scene.traverse((node) => {
    if (node instanceof Mesh) hasMesh = true;
  });
  if (!hasMesh || !clips.hit || !clips.death) {
    disposeMonster(result);
    throw new Error(`${definition.displayName} needs a mesh, HitRecieve/HitReceive, and Death.`);
  }
  return result;
}
