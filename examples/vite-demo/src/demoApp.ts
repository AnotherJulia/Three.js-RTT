/**
 * A small, self-contained "fake OS" test page — deliberately exercises every requirement
 * the real target (GridLinkOS) needs: a clickable counter, real text input/IME focus,
 * a :hover-only CSS rule (to honestly demonstrate the documented limitation), a CSS
 * @keyframes animation (proves continuously-live rendering, not a frozen snapshot),
 * a <video> fed by canvas.captureStream() (self-contained, no external asset to source),
 * and an independently-animating nested <canvas> (mirrors GridLinkOS's minimap case).
 */
export interface DemoApp {
  root: HTMLElement;
  dispose(): void;
}

const STYLE = `
  .demo-root {
    width: 640px;
    height: 480px;
    background: #071a12;
    color: #baffd9;
    font: 15px/1.4 ui-monospace, "SF Mono", monospace;
    box-sizing: border-box;
    padding: 18px;
    overflow: hidden;
  }
  .demo-root h1 { margin: 0 0 10px; font-size: 18px; color: #6dffb8; }
  .demo-root .row { display: flex; gap: 10px; align-items: center; margin-bottom: 12px; }
  .demo-root button {
    background: #123b28; color: #baffd9; border: 1px solid #2fa86a;
    padding: 6px 12px; font: inherit; cursor: pointer; border-radius: 4px;
  }
  .demo-root button.hover-demo:hover { background: #2fa86a; color: #05130c; }
  .demo-root input, .demo-root textarea {
    background: #04120a; color: #d9ffec; border: 1px solid #2fa86a; border-radius: 4px;
    padding: 6px 8px; font: inherit; width: 220px;
  }
  .demo-root textarea { width: 100%; height: 60px; resize: none; }
  .demo-root .pulse {
    display: inline-block; width: 12px; height: 12px; border-radius: 50%;
    background: #ff5d5d; animation: demo-pulse 1.1s ease-in-out infinite;
  }
  @keyframes demo-pulse {
    0%, 100% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.6); opacity: 0.35; }
  }
  .demo-root .media-row { display: flex; gap: 10px; margin-top: 12px; }
  .demo-root video, .demo-root canvas.minimap {
    border: 1px solid #2fa86a; border-radius: 4px; background: #000;
  }
  .demo-root .hint { margin-top: 12px; font-size: 12px; opacity: 0.7; }
`;

let styleInjected = false;
function ensureStyle(): void {
  if (styleInjected) return;
  const styleEl = document.createElement("style");
  styleEl.textContent = STYLE;
  document.head.appendChild(styleEl);
  styleInjected = true;
}

export function createDemoApp(label: string): DemoApp {
  ensureStyle();

  const root = document.createElement("div");
  root.className = "demo-root";
  root.innerHTML = `
    <h1>${label} <span class="pulse"></span></h1>
    <div class="row">
      <button class="counter-btn">clicks: <span class="count">0</span></button>
      <button class="hover-demo">hover me</button>
    </div>
    <div class="row">
      <input type="text" placeholder="type here (real focus/IME)" />
    </div>
    <textarea placeholder="...and here"></textarea>
    <div class="media-row">
      <video autoplay muted loop width="140" height="90"></video>
      <canvas class="minimap" width="140" height="90"></canvas>
    </div>
    <div class="hint">click the counter · type in the fields · orbit the camera</div>
  `;

  // Video source: an animated source canvas via captureStream(), so the demo needs no
  // external video asset while still exercising the <video> live-element special-case.
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = 140;
  sourceCanvas.height = 90;
  const sourceCtx = sourceCanvas.getContext("2d")!;
  const stream = sourceCanvas.captureStream(30);
  const video = root.querySelector("video") as HTMLVideoElement;
  video.srcObject = stream;

  // Independently-animating nested canvas (bouncing ball), mirrors GridLinkOS's minimap.
  const minimap = root.querySelector("canvas.minimap") as HTMLCanvasElement;
  const minimapCtx = minimap.getContext("2d")!;
  let ballX = 20;
  let ballY = 20;
  let velocityX = 90;
  let velocityY = 65;
  let lastTime = performance.now();

  let disposed = false;
  function animate(now: number): void {
    if (disposed) return;
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    // Source canvas: a moving gradient sweep, feeding the captureStream video.
    const hue = (now / 20) % 360;
    sourceCtx.fillStyle = `hsl(${hue}, 70%, 45%)`;
    sourceCtx.fillRect(0, 0, sourceCanvas.width, sourceCanvas.height);
    sourceCtx.fillStyle = "rgba(255,255,255,0.85)";
    sourceCtx.font = "12px monospace";
    sourceCtx.fillText("live video", 8, sourceCanvas.height / 2);

    // Minimap canvas: bouncing ball.
    ballX += velocityX * dt;
    ballY += velocityY * dt;
    if (ballX < 6 || ballX > minimap.width - 6) velocityX *= -1;
    if (ballY < 6 || ballY > minimap.height - 6) velocityY *= -1;
    minimapCtx.fillStyle = "#04120a";
    minimapCtx.fillRect(0, 0, minimap.width, minimap.height);
    minimapCtx.fillStyle = "#6dffb8";
    minimapCtx.beginPath();
    minimapCtx.arc(ballX, ballY, 6, 0, Math.PI * 2);
    minimapCtx.fill();

    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);

  const counterBtn = root.querySelector(".counter-btn") as HTMLButtonElement;
  const countLabel = root.querySelector(".count") as HTMLSpanElement;
  let count = 0;
  counterBtn.addEventListener("click", () => {
    count += 1;
    countLabel.textContent = String(count);
  });

  return {
    root,
    dispose() {
      disposed = true;
      for (const track of stream.getTracks()) track.stop();
      root.remove();
    },
  };
}
