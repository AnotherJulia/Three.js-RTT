import {
  CanvasTexture,
  Color,
  LinearFilter,
  LinearMipMapLinearFilter,
  SRGBColorSpace,
  type ColorSpace,
  type Material,
  type MagnificationTextureFilter,
  type Mesh,
  type MinificationTextureFilter,
} from "three";
import { assert } from "../utils/assert";

export interface ScreenTextureOptions {
  mesh: Mesh;
  /** For multi-material meshes: index into mesh.material array, or a material name to match. */
  materialSlot?: number | string;
  colorSpace?: ColorSpace;
  minFilter?: MinificationTextureFilter;
  magFilter?: MagnificationTextureFilter;
  /** Default false: crisp text over a screen viewed up close beats mipmapped blur. */
  generateMipmaps?: boolean;
  anisotropy?: number;
  /** three's CanvasTexture defaults to flipY=true (DOM top-left origin); verify empirically
   * per asset — an authored UV unwrap may expect the opposite. */
  flipY?: boolean;
  /** Self-lit "glowing tube" look: also assign the texture as emissiveMap. */
  applyAsEmissive?: boolean;
  /** Escape hatch: replace the material entirely instead of patching map/emissiveMap. */
  materialFactory?: (original: Material) => Material;
}

function resolveMaterial(mesh: Mesh, slot: number | string | undefined): Material {
  const material = mesh.material;
  if (!Array.isArray(material)) return material;

  assert(material.length > 0, "mesh has an empty material array");
  if (slot === undefined) return material[0]!;
  if (typeof slot === "number") {
    const resolved = material[slot];
    assert(resolved, `no material at index ${slot}`);
    return resolved;
  }
  const named = material.find((candidate) => candidate.name === slot);
  assert(named, `no material named "${slot}"`);
  return named;
}

/**
 * Wires a live-updating <canvas> (from DomCompositor) onto a mesh's material as its
 * map/emissiveMap. Deliberately never touches geometry or UVs: curvature support falls
 * out of the normal WebGL pipeline interpolating the mesh's own UV attribute per-triangle,
 * exactly as it would for any authored/baked texture.
 */
export class ScreenTexture {
  readonly texture: CanvasTexture;
  private readonly mesh: Mesh;
  private readonly options: ScreenTextureOptions;
  private originalMaterial: Material | Material[] | null = null;
  private appliedMaterial: Material | null = null;

  constructor(canvas: HTMLCanvasElement, options: ScreenTextureOptions) {
    this.mesh = options.mesh;
    this.options = options;

    this.texture = new CanvasTexture(canvas);
    this.texture.colorSpace = options.colorSpace ?? SRGBColorSpace;
    this.texture.generateMipmaps = options.generateMipmaps ?? false;
    this.texture.minFilter = options.minFilter ?? (this.texture.generateMipmaps ? LinearMipMapLinearFilter : LinearFilter);
    this.texture.magFilter = options.magFilter ?? LinearFilter;
    if (options.anisotropy !== undefined) this.texture.anisotropy = options.anisotropy;
    if (options.flipY !== undefined) this.texture.flipY = options.flipY;
  }

  /** Call once from DomCompositor.onFrame — cheap: only marks the GPU upload dirty. */
  markDirty(): void {
    this.texture.needsUpdate = true;
  }

  attach(): void {
    assert(!this.appliedMaterial, "ScreenTexture already attached");
    this.originalMaterial = this.mesh.material;
    const source = resolveMaterial(this.mesh, this.options.materialSlot);

    const target = this.options.materialFactory ? this.options.materialFactory(source) : (source.clone() as Material);
    this.assignTextureSlots(target);

    if (Array.isArray(this.mesh.material)) {
      const materials = this.mesh.material.slice();
      const index = materials.indexOf(source);
      assert(index !== -1, "resolved material not found in mesh.material array");
      materials[index] = target;
      this.mesh.material = materials;
    } else {
      this.mesh.material = target;
    }
    this.appliedMaterial = target;
  }

  private assignTextureSlots(material: Material): void {
    const withMap = material as Material & {
      map?: CanvasTexture | null;
      emissiveMap?: CanvasTexture | null;
      emissive?: Color;
    };
    withMap.map = this.texture;
    if (this.options.applyAsEmissive && "emissiveMap" in material) {
      withMap.emissiveMap = this.texture;
      // Emissive maps are multiplied by this color; standard materials start
      // black, which otherwise makes the documented glowing-screen option dark.
      withMap.emissive?.setRGB(1, 1, 1);
    }
    material.needsUpdate = true;
  }

  detach(): void {
    if (this.originalMaterial) this.mesh.material = this.originalMaterial;
    this.appliedMaterial?.dispose();
    this.appliedMaterial = null;
    this.originalMaterial = null;
  }

  dispose(): void {
    this.detach();
    this.texture.dispose();
  }
}
