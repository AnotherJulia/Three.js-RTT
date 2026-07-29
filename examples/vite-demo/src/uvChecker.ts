import { CanvasTexture, SRGBColorSpace } from "three";

/**
 * Procedural UV-checker texture: the first thing to toggle on (press "U") before
 * trusting the live compositor output, to confirm each FBX *_Screen submesh has a
 * clean, non-mirrored 0-1 unwrap.
 */
export function createUvCheckerTexture(size = 512, tiles = 8): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const tileSize = size / tiles;

  for (let y = 0; y < tiles; y += 1) {
    for (let x = 0; x < tiles; x += 1) {
      ctx.fillStyle = (x + y) % 2 === 0 ? "#ff5d5d" : "#1c2733";
      ctx.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
    }
  }

  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, size - 4, size - 4);

  ctx.fillStyle = "#ffffff";
  ctx.font = `${Math.round(size / 14)}px monospace`;
  ctx.fillText("V=1 (top)", 10, size / 14 + 4);
  ctx.fillText("V=0 (bottom)", 10, size - 10);
  ctx.save();
  ctx.translate(size - 10, size / 2);
  ctx.rotate(Math.PI / 2);
  ctx.fillText("U: 0 -> 1", -40, 0);
  ctx.restore();

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}
