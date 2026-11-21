/**
 * Picture-in-Picture camera preview with hand skeleton overlays
 */

import { handTracker, type HandLandmark } from './handTracker';

export class CameraPreview {
  private container: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private statusLeft: HTMLSpanElement;
  private statusRight: HTMLSpanElement;
  private isMinimized = false;

  // Hand skeleton connection pairs
  private static CONNECTIONS = [
    // Thumb
    [0, 1], [1, 2], [2, 3], [3, 4],
    // Index finger
    [0, 5], [5, 6], [6, 7], [7, 8],
    // Middle finger
    [9, 10], [10, 11], [11, 12],
    // Ring finger
    [13, 14], [14, 15], [15, 16],
    // Pinky
    [0, 17], [17, 18], [18, 19], [19, 20],
    // Palm base
    [5, 9], [9, 13], [13, 17]
  ];

  constructor(parentEl: HTMLElement) {
    this.container = document.createElement('div');
    this.container.className = 'camera-pip-panel';

    this.container.innerHTML = `
      <div class="pip-header">
        <div class="pip-title">
          <span class="pip-indicator"></span>
          <span>WEBCAM VISION</span>
        </div>
        <div class="pip-badges">
          <span id="pip-left-badge" class="badge badge-red">LEFT: OFF</span>
          <span id="pip-right-badge" class="badge badge-blue">RIGHT: OFF</span>
          <button id="pip-toggle-btn" class="pip-btn" title="Toggle Size">⤢</button>
        </div>
      </div>
      <div class="pip-canvas-wrap">
        <canvas id="pip-canvas" width="320" height="240"></canvas>
      </div>
    `;

    parentEl.appendChild(this.container);

    this.canvas = this.container.querySelector('#pip-canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
    this.statusLeft = this.container.querySelector('#pip-left-badge') as HTMLSpanElement;
    this.statusRight = this.container.querySelector('#pip-right-badge') as HTMLSpanElement;

    const toggleBtn = this.container.querySelector('#pip-toggle-btn') as HTMLButtonElement;
    toggleBtn.addEventListener('click', () => {
      this.isMinimized = !this.isMinimized;
      this.container.classList.toggle('minimized', this.isMinimized);
    });
  }

  public render() {
    const video = handTracker.getVideoElement();
    const w = this.canvas.width;
    const h = this.canvas.height;

    this.ctx.clearRect(0, 0, w, h);

    if (video && video.readyState >= 2) {
      this.ctx.save();
      // Mirror horizontally
      this.ctx.translate(w, 0);
      this.ctx.scale(-1, 1);
      this.ctx.drawImage(video, 0, 0, w, h);
      this.ctx.restore();

      // Subtle dark tint to make skeleton pop
      this.ctx.fillStyle = 'rgba(10, 15, 30, 0.35)';
      this.ctx.fillRect(0, 0, w, h);
    } else {
      // Standby pattern
      this.ctx.fillStyle = '#0a0d18';
      this.ctx.fillRect(0, 0, w, h);
      this.ctx.fillStyle = '#4a5568';
      this.ctx.font = '12px monospace';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(
        handTracker.getInputMode() === 'MOUSE' ? 'MOUSE SABER MODE ACTIVE' : 'INITIALIZING WEBCAM...',
        w / 2,
        h / 2
      );
    }

    // Render left hand skeleton (RED)
    if (handTracker.rawLandmarksLeft) {
      this.drawHandSkeleton(handTracker.rawLandmarksLeft, '#ff1053', '#ff5983', w, h);
      this.statusLeft.textContent = 'LEFT: TRACKING';
      this.statusLeft.className = 'badge badge-red active';
    } else {
      this.statusLeft.textContent = 'LEFT: WAITING';
      this.statusLeft.className = 'badge badge-red';
    }

    // Render right hand skeleton (CYAN/BLUE)
    if (handTracker.rawLandmarksRight) {
      this.drawHandSkeleton(handTracker.rawLandmarksRight, '#00f0ff', '#80f8ff', w, h);
      this.statusRight.textContent = 'RIGHT: TRACKING';
      this.statusRight.className = 'badge badge-blue active';
    } else {
      this.statusRight.textContent = 'RIGHT: WAITING';
      this.statusRight.className = 'badge badge-blue';
    }
  }

  private drawHandSkeleton(landmarks: HandLandmark[], lineColor: string, dotColor: string, w: number, h: number) {
    this.ctx.save();

    // Draw connection lines
    this.ctx.strokeStyle = lineColor;
    this.ctx.lineWidth = 2.5;
    this.ctx.shadowColor = lineColor;
    this.ctx.shadowBlur = 8;
    this.ctx.beginPath();

    for (const [i1, i2] of CameraPreview.CONNECTIONS) {
      const p1 = landmarks[i1];
      const p2 = landmarks[i2];
      if (!p1 || !p2) continue;

      // Invert X because video is mirrored
      const x1 = (1.0 - p1.x) * w;
      const y1 = p1.y * h;
      const x2 = (1.0 - p2.x) * w;
      const y2 = p2.y * h;

      this.ctx.moveTo(x1, y1);
      this.ctx.lineTo(x2, y2);
    }
    this.ctx.stroke();

    // Draw joints
    this.ctx.fillStyle = dotColor;
    for (let i = 0; i < landmarks.length; i++) {
      const p = landmarks[i];
      const x = (1.0 - p.x) * w;
      const y = p.y * h;
      const radius = i === 8 || i === 4 ? 4 : 2.5; // Larger for fingertips

      this.ctx.beginPath();
      this.ctx.arc(x, y, radius, 0, Math.PI * 2);
      this.ctx.fill();
    }

    this.ctx.restore();
  }
}
