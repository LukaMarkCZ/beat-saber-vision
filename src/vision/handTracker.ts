/**
 * MediaPipe Hands Tracker with Exponential Smoothing and 3D Vector Mapping
 */

export interface HandLandmark {
  x: number;
  y: number;
  z: number;
}

export interface SaberPose {
  position: { x: number; y: number; z: number };
  direction: { x: number; y: number; z: number }; // Normalized blade pointing vector
  velocity: { x: number; y: number; z: number };
  speed: number;
  isTracking: boolean;
}

export type InputMode = 'WEBCAM' | 'MOUSE';

export class HandTracker {
  private videoElement: HTMLVideoElement | null = null;
  private isRunning = false;
  private inputMode: InputMode = 'WEBCAM';
  private mirror = true;

  // Sensitivity & calibration offsets
  public sensitivityX = 4.2;
  public sensitivityY = 3.2;
  public offsetX = 0.0;
  public offsetY = 1.2;
  public offsetZ = 0.15;

  // Internal state for Left and Right hands
  public leftSaber: SaberPose = {
    position: { x: -0.5, y: 1.2, z: 0.2 },
    direction: { x: 0, y: 0.3, z: -1 },
    velocity: { x: 0, y: 0, z: 0 },
    speed: 0,
    isTracking: false
  };

  public rightSaber: SaberPose = {
    position: { x: 0.5, y: 1.2, z: 0.2 },
    direction: { x: 0, y: 0.3, z: -1 },
    velocity: { x: 0, y: 0, z: 0 },
    speed: 0,
    isTracking: false
  };

  private prevLeftPos = { x: -0.5, y: 1.2, z: 0.2 };
  private prevRightPos = { x: 0.5, y: 1.2, z: 0.2 };

  // 60/120 FPS Interpolation targets
  private targetLeftPos = { x: -0.5, y: 1.2, z: 0.15 };
  private targetLeftDir = { x: 0, y: 0.2, z: -0.92 };
  private targetRightPos = { x: 0.5, y: 1.2, z: 0.15 };
  private targetRightDir = { x: 0, y: 0.2, z: -0.92 };

  // Raw landmarks for PIP camera rendering
  public rawLandmarksLeft: HandLandmark[] | null = null;
  public rawLandmarksRight: HandLandmark[] | null = null;

  // Mouse fallback coordinates
  private mousePos = { x: 0, y: 1.2 };

  // Callback on results
  private onResultsCallback: ((results: any) => void) | null = null;

  constructor() {
    this.setupMouseFallback();
  }

  public setInputMode(mode: InputMode) {
    this.inputMode = mode;
  }

  public getInputMode(): InputMode {
    return this.inputMode;
  }

  public setMirror(mirror: boolean) {
    this.mirror = mirror;
  }

  public setOnResults(cb: (results: any) => void) {
    this.onResultsCallback = cb;
  }

  public getVideoElement(): HTMLVideoElement | null {
    return this.videoElement;
  }

  public get hasAnyHand(): boolean {
    return this.leftSaber.isTracking || this.rightSaber.isTracking;
  }

  public get isSingleHandMode(): boolean {
    return (this.leftSaber.isTracking !== this.rightSaber.isTracking);
  }

  /**
   * Initializes webcam and MediaPipe Hands
   */
  public async initWebcam(videoEl: HTMLVideoElement): Promise<boolean> {
    this.videoElement = videoEl;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user'
        },
        audio: false
      });

      this.videoElement.srcObject = stream;
      await this.videoElement.play();

      await this.initMediaPipe();
      this.isRunning = true;
      return true;
    } catch (err) {
      console.warn('Webcam access failed or denied. Falling back to mouse saber mode.', err);
      this.inputMode = 'MOUSE';
      return false;
    }
  }

  private async initMediaPipe() {
    // Check if MediaPipe Hands is loaded globally or load dynamically
    const win = window as any;
    if (!win.Hands) {
      await this.loadMediaPipeScripts();
    }

    if (!win.Hands) {
      console.warn('MediaPipe Hands library could not be loaded. Operating in mouse mode.');
      this.inputMode = 'MOUSE';
      return;
    }

    const hands = new win.Hands({
      locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${file}`
    });

    hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 0, // 0 = ultra-fast mobile optimized model
      minDetectionConfidence: 0.38,
      minTrackingConfidence: 0.38
    });

    hands.onResults((results: any) => this.processMediaPipeResults(results));

    // Non-blocking single-frame inference lock to eliminate queue congestion & lag spikes
    let isProcessing = false;

    // Camera utility loop
    if (win.Camera && this.videoElement) {
      const camera = new win.Camera(this.videoElement, {
        onFrame: async () => {
          if (!this.isRunning || !this.videoElement || this.inputMode !== 'WEBCAM') return;
          if (isProcessing) return; // Drop frame if previous is still computing!
          isProcessing = true;
          try {
            await hands.send({ image: this.videoElement });
          } catch (e) {
            console.warn('MediaPipe error:', e);
          } finally {
            isProcessing = false;
          }
        },
        width: 480,
        height: 360
      });
      camera.start();
    } else {
      // Fallback manual requestAnimationFrame loop
      const detectLoop = async () => {
        if (this.isRunning && this.videoElement && this.inputMode === 'WEBCAM') {
          if (this.videoElement.readyState >= 2 && !isProcessing) {
            isProcessing = true;
            try {
              await hands.send({ image: this.videoElement });
            } catch (e) {
              console.warn('MediaPipe error:', e);
            } finally {
              isProcessing = false;
            }
          }
        }
        requestAnimationFrame(detectLoop);
      };
      requestAnimationFrame(detectLoop);
    }
  }

  private async loadMediaPipeScripts(): Promise<void> {
    const loadScript = (url: string) =>
      new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = url;
        script.crossOrigin = 'anonymous';
        script.onload = () => resolve();
        script.onerror = (e) => reject(e);
        document.head.appendChild(script);
      });

    try {
      await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js');
      await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js');
    } catch (err) {
      console.error('Failed to load MediaPipe from CDN:', err);
    }
  }

  /**
   * Process landmarks received from MediaPipe Hands
   */
  private processMediaPipeResults(results: any) {
    if (this.onResultsCallback) {
      this.onResultsCallback(results);
    }

    this.rawLandmarksLeft = null;
    this.rawLandmarksRight = null;
    let foundLeft = false;
    let foundRight = false;

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      const detected = results.multiHandLandmarks.map((lm: HandLandmark[], idx: number) => {
        const avgX = (lm[0].x + lm[5].x + lm[9].x) / 3;
        const normX = this.mirror ? 1.0 - avgX : avgX;
        return { lm, normX, idx };
      });

      if (detected.length >= 2) {
        // Sort by horizontal position: left-most hand is Left (Red), right-most is Right (Blue)
        detected.sort((a: { normX: number }, b: { normX: number }) => a.normX - b.normX);

        foundLeft = true;
        this.rawLandmarksLeft = detected[0].lm;
        this.recordHandTarget(this.targetLeftPos, this.targetLeftDir, detected[0].lm);

        foundRight = true;
        this.rawLandmarksRight = detected[1].lm;
        this.recordHandTarget(this.targetRightPos, this.targetRightDir, detected[1].lm);
      } else if (detected.length === 1) {
        const single = detected[0];
        if (single.normX < 0.5) {
          foundLeft = true;
          this.rawLandmarksLeft = single.lm;
          this.recordHandTarget(this.targetLeftPos, this.targetLeftDir, single.lm);
        } else {
          foundRight = true;
          this.rawLandmarksRight = single.lm;
          this.recordHandTarget(this.targetRightPos, this.targetRightDir, single.lm);
        }
      }
    }

    this.leftSaber.isTracking = foundLeft;
    this.rightSaber.isTracking = foundRight;
  }

  /**
   * Records target hand position and direction from MediaPipe landmarks
   * Uses Metacarpal bones (wrist to middle knuckle) so clenching fists never twitches angle!
   */
  private recordHandTarget(
    targetPos: { x: number; y: number; z: number },
    targetDir: { x: number; y: number; z: number },
    landmarks: HandLandmark[]
  ) {
    const wrist = landmarks[0];
    const indexMcp = landmarks[5];
    const middleMcp = landmarks[9];

    // Palm center
    const palmX = (wrist.x + indexMcp.x + middleMcp.x) / 3;
    const palmY = (wrist.y + indexMcp.y + middleMcp.y) / 3;

    // Map normalized [0, 1] screen coordinates to 3D world space
    const normX = this.mirror ? 1.0 - palmX : palmX;
    const normY = palmY;

    // Convert to world space
    targetPos.x = (normX - 0.5) * this.sensitivityX + this.offsetX;
    targetPos.y = (1.0 - normY) * this.sensitivityY + (this.offsetY - this.sensitivityY * 0.5);
    targetPos.z = this.offsetZ;

    // Knuckle vector: rigid palm bone, never collapses when making a fist
    const rawDx = (this.mirror ? -(middleMcp.x - wrist.x) : (middleMcp.x - wrist.x));
    const rawDy = -(middleMcp.y - wrist.y);

    const dirX = rawDx * 1.6;
    const dirY = rawDy * 1.6 + 0.15;
    const dirZ = -0.92;

    const len = Math.hypot(dirX, dirY, dirZ) || 1;
    targetDir.x = dirX / len;
    targetDir.y = dirY / len;
    targetDir.z = dirZ / len;
  }

  /**
   * Recalibrate center: sets offset so current hand positions are centered at chest height
   */
  public calibrate() {
    if (this.rawLandmarksLeft && this.rawLandmarksRight) {
      const avgY = (this.rawLandmarksLeft[0].y + this.rawLandmarksRight[0].y) / 2;
      this.offsetY = (1.0 - avgY) * this.sensitivityY;
    } else if (this.rawLandmarksLeft) {
      this.offsetY = (1.0 - this.rawLandmarksLeft[0].y) * this.sensitivityY;
    } else if (this.rawLandmarksRight) {
      this.offsetY = (1.0 - this.rawLandmarksRight[0].y) * this.sensitivityY;
    }
  }

  /**
   * Mouse and Touch Fallback mode
   */
  private setupMouseFallback() {
    window.addEventListener('mousemove', (e) => {
      if (this.inputMode !== 'MOUSE') return;
      const normX = e.clientX / window.innerWidth;
      const normY = e.clientY / window.innerHeight;

      this.mousePos.x = (normX - 0.5) * 3.0;
      this.mousePos.y = (1.0 - normY) * 2.0 + 0.3;
    });

    window.addEventListener('touchmove', (e) => {
      if (this.inputMode !== 'MOUSE' || e.touches.length === 0) return;
      const touch = e.touches[0];
      const normX = touch.clientX / window.innerWidth;
      const normY = touch.clientY / window.innerHeight;

      this.mousePos.x = (normX - 0.5) * 3.0;
      this.mousePos.y = (1.0 - normY) * 2.0 + 0.3;
    }, { passive: true });
  }

  /**
   * Update called every frame in game loop
   */
  public update(dt: number) {
    if (this.inputMode === 'MOUSE') {
      // In mouse mode, position left and right sabers centered or controlled
      const targetLeftX = this.mousePos.x - 0.45;
      const targetRightX = this.mousePos.x + 0.45;
      const targetY = this.mousePos.y;

      const updateMouseSaber = (saber: SaberPose, prevPos: { x: number; y: number; z: number }, targetX: number) => {
        const vx = (targetX - saber.position.x) / dt;
        const vy = (targetY - saber.position.y) / dt;

        saber.position.x += (targetX - saber.position.x) * 0.7;
        saber.position.y += (targetY - saber.position.y) * 0.7;
        saber.position.z = 0.1;

        saber.velocity.x = vx;
        saber.velocity.y = vy;
        saber.velocity.z = 0;
        saber.speed = Math.sqrt(vx * vx + vy * vy);

        // Blade angles forward and slightly upright
        saber.direction.x = vx * 0.04;
        saber.direction.y = 0.35 + vy * 0.04;
        saber.direction.z = -0.92;
        const len = Math.sqrt(saber.direction.x ** 2 + saber.direction.y ** 2 + saber.direction.z ** 2);
        saber.direction.x /= len;
        saber.direction.y /= len;
        saber.direction.z /= len;

        saber.isTracking = true;
        prevPos.x = saber.position.x;
        prevPos.y = saber.position.y;
        prevPos.z = saber.position.z;
      };

      updateMouseSaber(this.leftSaber, this.prevLeftPos, targetLeftX);
      updateMouseSaber(this.rightSaber, this.prevRightPos, targetRightX);
      return;
    }

    // WEBCAM 60/120 FPS CONTINUOUS BUTTERY SMOOTH LERP INTERPOLATION
    const updateWebcamSaber = (
      saber: SaberPose,
      targetPos: { x: number; y: number; z: number },
      targetDir: { x: number; y: number; z: number },
      prevPos: { x: number; y: number; z: number }
    ) => {
      if (!saber.isTracking) return;

      const dist = Math.hypot(targetPos.x - saber.position.x, targetPos.y - saber.position.y);

      // Adaptive response: 18/s when steady (filters all hand tremor), up to 50/s on rapid swings (zero lag)
      const lerpSpeed = Math.min(50.0, 18.0 + dist * 32.0);
      const alpha = 1.0 - Math.exp(-lerpSpeed * dt);

      saber.position.x += (targetPos.x - saber.position.x) * alpha;
      saber.position.y += (targetPos.y - saber.position.y) * alpha;
      saber.position.z += (targetPos.z - saber.position.z) * alpha;

      // Rotational filter: silky smooth angle transitions without twitching
      const rotAlpha = 1.0 - Math.exp(-14.0 * dt);
      saber.direction.x += (targetDir.x - saber.direction.x) * rotAlpha;
      saber.direction.y += (targetDir.y - saber.direction.y) * rotAlpha;
      saber.direction.z += (targetDir.z - saber.direction.z) * rotAlpha;

      const dLen = Math.hypot(saber.direction.x, saber.direction.y, saber.direction.z) || 1;
      saber.direction.x /= dLen;
      saber.direction.y /= dLen;
      saber.direction.z /= dLen;

      // Continuous 60/120 FPS velocity estimation
      const safeDt = Math.max(0.001, dt);
      const vx = (saber.position.x - prevPos.x) / safeDt;
      const vy = (saber.position.y - prevPos.y) / safeDt;
      const vz = (saber.position.z - prevPos.z) / safeDt;

      saber.velocity.x += (vx - saber.velocity.x) * 0.45;
      saber.velocity.y += (vy - saber.velocity.y) * 0.45;
      saber.velocity.z += (vz - saber.velocity.z) * 0.45;
      saber.speed = Math.hypot(saber.velocity.x, saber.velocity.y, saber.velocity.z);

      prevPos.x = saber.position.x;
      prevPos.y = saber.position.y;
      prevPos.z = saber.position.z;
    };

    updateWebcamSaber(this.leftSaber, this.targetLeftPos, this.targetLeftDir, this.prevLeftPos);
    updateWebcamSaber(this.rightSaber, this.targetRightPos, this.targetRightDir, this.prevRightPos);
  }
}

export const handTracker = new HandTracker();
