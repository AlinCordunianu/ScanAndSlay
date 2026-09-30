import { Matrix4, Vector3 } from 'three';

// The seven models in this pack face +Z in their unanimated GLTF scene.
// A future model facing another axis can supply its rest-pose yaw here.
export function initialFacingYaw(cameraWorld: Matrix4, spawnWorld: Vector3, modelForwardYaw = 0) {
  const direction = new Vector3().setFromMatrixPosition(cameraWorld).sub(spawnWorld);
  if (Math.hypot(direction.x, direction.z) < 1e-6) {
    // Camera's local +Z points back toward the viewer, even under a rotated parent.
    direction.set(0, 0, 1).transformDirection(cameraWorld);
  }
  return Math.atan2(direction.x, direction.z) - modelForwardYaw;
}
