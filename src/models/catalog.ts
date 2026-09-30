// Lightweight manifest. GLTF data and textures remain separately fetched public assets.
// Audited against every GLTF in public/models/monsters; see catalog.test.ts.
export const MONSTER_CATALOG = [
  { modelId: 'alien', displayName: 'Alien', modelPath: '/models/monsters/Alien.gltf' },
  { modelId: 'cthulhu', displayName: 'Cthulhu', modelPath: '/models/monsters/Cthulhu.gltf' },
  { modelId: 'cyclops', displayName: 'Cyclops', modelPath: '/models/monsters/Cyclops.gltf' },
  { modelId: 'demon', displayName: 'Demon', modelPath: '/models/monsters/Demon.gltf' },
  { modelId: 'ghost', displayName: 'Ghost', modelPath: '/models/monsters/Ghost.gltf' },
  { modelId: 'yeti', displayName: 'Yeti', modelPath: '/models/monsters/Yeti.gltf' },
] as const;
