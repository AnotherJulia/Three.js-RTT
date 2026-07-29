import {
  AmbientLight,
  CanvasTexture,
  Clock,
  DirectionalLight,
  Group,
  Mesh,
  MeshPhongMaterial,
  PerspectiveCamera,
  PointLight,
  Raycaster,
  Scene,
  Vector2,
  WebGLRenderer,
} from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { ScreenSurfaceRegistry, type ScreenSurface } from "three-rtt";
import { createDemoApp } from "./demoApp";
import { createUvCheckerTexture } from "./uvChecker";

const FBX_SCALE = 0.01; // Blender export in cm -> metres, matching OperatorOS's convention.
const SCREEN_RESOLUTION = { width: 640, height: 480 };

const canvas = document.getElementById("app-canvas") as HTMLCanvasElement;
const hud = document.getElementById("hud") as HTMLDivElement;

const renderer = new WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new Scene();
const camera = new PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.05, 50);
// Box_Monitor (the curved desk CRT) is the hero: framed front-and-center, orbiting
// about its screen center. Projector_Monitor sits off to the right, out of the
// default frame, since it's ~3x the physical scale and would dwarf the CRT if both
// had to fit the initial shot.
camera.position.set(-0.338, 0.34, 0.72);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(-0.55, 0.19, 0);
controls.enableDamping = true;

scene.add(new AmbientLight(0x8fa8ff, 0.75));

// Steady key light so the screens themselves (not just the chassis) read clearly —
// the sweep light alone leaves the monitors legible only while it's nearby.
const keyLight = new DirectionalLight(0xffffff, 1.4);
keyLight.position.set(0.5, 2, 2);
scene.add(keyLight);

// Orbiting point light: with a true render-to-texture screen, real specular highlights
// should visibly sweep across the curved Box_Monitor glass as this moves — something a
// CSS-3D DOM overlay could never do.
const sweepLight = new PointLight(0xffffff, 6, 6);
scene.add(sweepLight);

const loader = new FBXLoader();

async function loadScreenMesh(url: string, screenMeshName: string): Promise<{ group: Group; screen: Mesh }> {
  const group = await loader.loadAsync(url);
  group.scale.setScalar(FBX_SCALE);
  group.traverse((child) => {
    if (child instanceof Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  const screen = group.getObjectByName(screenMeshName);
  if (!(screen instanceof Mesh)) {
    throw new Error(`Expected a mesh named "${screenMeshName}" in ${url}`);
  }
  // Deliberately NOT removed (unlike OperatorOS's current fbx-model.tsx) — ScreenTexture
  // attaches directly to this authored mesh so curvature comes from its real geometry.
  return { group, screen };
}

interface DemoMonitor {
  id: string;
  surface: ScreenSurface;
  liveMap: CanvasTexture | null;
  checkerApplied: boolean;
}

async function main(): Promise<void> {
  const registry = new ScreenSurfaceRegistry();
  const monitors: DemoMonitor[] = [];
  const checkerTexture = createUvCheckerTexture();

  const [box, projector] = await Promise.all([
    loadScreenMesh("/models/Box_Monitor_Seperated.fbx", "Box_Monitor_Screen"),
    loadScreenMesh("/models/Projector_Monitor_Seperated.fbx", "Projector_Monitor_Screen"),
  ]);

  box.group.position.set(-0.55, 0, 0);
  projector.group.position.set(1.35, 0, 0);
  scene.add(box.group, projector.group);

  const demoApps = [createDemoApp("BOX MONITOR (curved)"), createDemoApp("PROJECTOR (flat)")];

  // Roots must stay real, connected, laid-out DOM nodes (never display:none) so CSS
  // animation/<video>/<canvas> children keep rendering. Stacked behind the opaque WebGL
  // canvas (z-index) so the player only ever sees the textured mesh, never the DOM itself.
  const hiddenLayer = document.createElement("div");
  // pointer-events:none here is belt-and-suspenders (the opaque canvas above already
  // intercepts every real pointer event via z-index) — each root re-enables it, since
  // CSS pointer-events is inherited and the hit-test snapshot checks computed style.
  hiddenLayer.style.cssText = "position: fixed; inset: 0; z-index: 0; pointer-events: none;";
  for (const app of demoApps) {
    app.root.style.position = "fixed";
    app.root.style.left = "0";
    app.root.style.top = "0";
    app.root.style.pointerEvents = "auto";
    hiddenLayer.appendChild(app.root);
  }
  document.body.appendChild(hiddenLayer);
  canvas.style.zIndex = "1";

  const configs: Array<{ id: string; mesh: Mesh; root: HTMLElement }> = [
    { id: "box-monitor", mesh: box.screen, root: demoApps[0]!.root },
    { id: "projector-monitor", mesh: projector.screen, root: demoApps[1]!.root },
  ];

  for (const config of configs) {
    const surface = registry.register({
      id: config.id,
      mesh: config.mesh,
      root: config.root,
      resolution: SCREEN_RESOLUTION,
      compositor: { fps: 30 },
      // Self-lit, so the live content reads clearly regardless of scene lighting —
      // a screen should look like it's emitting light, not reflecting it. The
      // materialFactory neutralizes the FBX-authored base color/emissive (whatever
      // baked look the model shipped with) so the live map isn't tinted or dimmed.
      texture: {
        generateMipmaps: false,
        applyAsEmissive: true,
        materialFactory: (original) => {
          // FBXLoader hands back MeshPhongMaterial with a bright authored specular
          // (#cccccc, shininess 25) — on a flat/curved screen that catches the sweep
          // light as a hard, aliased glint that reads as a stray lightning-bolt streak
          // across the live content. Zeroed out: a self-lit screen shouldn't reflect
          // scene lights at all, it should only show its emissive live map.
          const material = (original as MeshPhongMaterial).clone();
          material.color.set("#ffffff");
          material.emissive.set("#ffffff");
          material.specular.set("#000000");
          material.shininess = 0;
          return material;
        },
      },
      input: { camera, domElement: renderer.domElement },
    });
    monitors.push({ id: config.id, surface, liveMap: surface.screenTexture.texture, checkerApplied: false });
  }

  if (import.meta.env.DEV) {
    // Dev-only harness hook: precise camera control for scripted screenshots.
    (window as unknown as Record<string, unknown>).__frameCamera = (
      pos: [number, number, number],
      target: [number, number, number],
    ) => {
      camera.position.set(...pos);
      controls.target.set(...target);
      controls.update();
    };

    // Dev-only harness hook: exercises the exact InputBridge.handleHit path a real
    // raycast hit would use, without depending on precise on-screen pixel picking
    // (useful for automated verification of the input-forwarding pipeline itself).
    (window as unknown as Record<string, unknown>).__debugClickUv = (id: string, u: number, v: number) => {
      const monitor = monitors.find((m) => m.id === id);
      if (!monitor?.surface.input) return false;
      const fakeDown = new PointerEvent("pointerdown", { pointerId: 1, pointerType: "mouse", button: 0, buttons: 1 });
      const target = monitor.surface.input.handleHit(new Vector2(u, v), "pointerdown", fakeDown);
      target?.click();
      return Boolean(target);
    };

    // Dev-only harness hook: finds the on-screen pixel whose raycast hits a given
    // monitor mesh at a target UV, for automated tests driving a *real* mouse click
    // (as opposed to __debugClickUv, which bypasses raycasting entirely).
    (window as unknown as Record<string, unknown>).__findScreenPixelForUv = (id: string, targetU: number, targetV: number) => {
      const monitor = monitors.find((m) => m.id === id);
      if (!monitor) return null;
      const mesh = monitor.surface.mesh;
      const raycaster = new Raycaster();
      const ndc = new Vector2();

      const uvAt = (px: number, py: number): Vector2 | null => {
        ndc.set((px / window.innerWidth) * 2 - 1, -(py / window.innerHeight) * 2 + 1);
        raycaster.setFromCamera(ndc, camera);
        const [hit] = raycaster.intersectObject(mesh, false);
        return hit?.uv ?? null;
      };

      let best: { px: number; py: number; dist: number } | null = null;
      const step = 8;
      for (let py = 0; py < window.innerHeight; py += step) {
        for (let px = 0; px < window.innerWidth; px += step) {
          const uv = uvAt(px, py);
          if (!uv) continue;
          const dist = Math.hypot(uv.x - targetU, uv.y - targetV);
          if (!best || dist < best.dist) best = { px, py, dist };
        }
      }
      if (!best) return null;

      for (let radius = step; radius >= 1; radius = Math.floor(radius / 2)) {
        const center = best;
        for (let py: number = center.py - radius; py <= center.py + radius; py += 1) {
          for (let px: number = center.px - radius; px <= center.px + radius; px += 1) {
            const uv = uvAt(px, py);
            if (!uv) continue;
            const dist = Math.hypot(uv.x - targetU, uv.y - targetV);
            if (dist < best.dist) best = { px, py, dist };
          }
        }
        if (radius === 1) break;
      }
      return best;
    };
  }

  // Demo-only glue: while a pointer drag starts on a monitor's screen, suspend
  // OrbitControls so dragging inside the live app doesn't also spin the camera.
  const raycastTargets = configs.map((c) => c.mesh);
  renderer.domElement.addEventListener("pointerdown", (event) => {
    const ndcX = (event.clientX / window.innerWidth) * 2 - 1;
    const ndcY = -(event.clientY / window.innerHeight) * 2 + 1;
    controls.enabled = !rayHitsAny(ndcX, ndcY, raycastTargets);
  });
  window.addEventListener("pointerup", () => {
    controls.enabled = true;
  });

  window.addEventListener("keydown", (event) => {
    if (event.key.toLowerCase() !== "u") return;
    for (const monitor of monitors) {
      monitor.checkerApplied = !monitor.checkerApplied;
      const material = monitor.surface.mesh.material as MeshPhongMaterial;
      material.map = monitor.checkerApplied ? checkerTexture : monitor.liveMap;
      material.needsUpdate = true;
    }
  });

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const clock = new Clock();
  function animate(): void {
    requestAnimationFrame(animate);
    const t = clock.getElapsedTime();
    sweepLight.position.set(Math.sin(t * 0.6) * 1.2, 0.6 + Math.sin(t * 0.3) * 0.3, Math.cos(t * 0.6) * 1.2);
    controls.update();
    renderer.render(scene, camera);
    updateHud();
  }

  function updateHud(): void {
    const lines = [
      "three-rtt demo",
      "Orbit to confirm no billboarding + curved specular sweep.",
      "Click a screen to type/click inside it. Press U to toggle UV checker.",
      "",
    ];
    for (const monitor of monitors) {
      lines.push(
        `${monitor.id.padEnd(18)} capture ${monitor.surface.compositor.lastCaptureDurationMs.toFixed(1)}ms`,
      );
    }
    hud.textContent = lines.join("\n");
  }

  animate();
}

function rayHitsAny(ndcX: number, ndcY: number, targets: Mesh[]): boolean {
  const raycaster = new Raycaster();
  raycaster.setFromCamera(new Vector2(ndcX, ndcY), camera);
  return raycaster.intersectObjects(targets, false).length > 0;
}

main().catch((error) => {
  console.error(error);
  hud.textContent = `Failed to load demo: ${(error as Error).message}`;
});
