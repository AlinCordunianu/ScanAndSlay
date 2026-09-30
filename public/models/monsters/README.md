The downloaded pack contains seven playable GLTFs: Alien, Cthulhu, Cyclops, Demon, Ghost, Skull, and Yeti. Keep their referenced textures alongside them. No model copies or generated replacements are needed.

The lightweight manifest is `src/models/catalog.ts`. Add one stable ID, display name, and URL per unique playable model when extending the pack, then run `npm test` to check manifest coverage and referenced assets. Only the selected hunt's GLTF is loaded at runtime.

Playable models require a renderable mesh and positive-duration HitRecieve (or HitReceive) and Death clips, matched case-insensitively. After the reveal, a clip containing Dance is preferred, then Idle, then Flying; a missing loop is allowed. All current models use Dance except Cthulhu, which uses Flying.
