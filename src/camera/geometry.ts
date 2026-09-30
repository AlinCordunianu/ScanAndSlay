import type { Detection } from '../detection/confirmation';
import type { Capture } from '../detection/tracking';

export function monsterAnchor(capture: Capture, width: number, height: number, mirrored: boolean) {
  const box = coverBox(
    capture.detection.bbox,
    capture.width,
    capture.height,
    width,
    height,
    mirrored,
  );
  return {
    x: box.left + box.width / 2,
    y: box.top - Math.max(8, box.height * 0.04),
    size: Math.max(60, Math.min(box.width * 0.85, width * 0.45, height * 0.35, 260)),
  };
}

/** Map source pixels through centered object-fit: cover and optional mirroring. */
export function coverBox(
  bbox: Detection['bbox'],
  sourceWidth: number,
  sourceHeight: number,
  width: number,
  height: number,
  mirrored: boolean,
) {
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const [x, y, w, h] = bbox;
  const left = x * scale - (sourceWidth * scale - width) / 2;
  return {
    left: mirrored ? width - left - w * scale : left,
    top: y * scale - (sourceHeight * scale - height) / 2,
    width: w * scale,
    height: h * scale,
  };
}
