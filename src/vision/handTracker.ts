/**
 * Input Manager: MediaPipe Hands, Mouse, and Dual-Touch Saber Control
 * 
 * Three input modes:
 * - WEBCAM: MediaPipe hand tracking with 60/120 FPS interpolation
 * - MOUSE:  Single pointer controls both sabers
 * - TOUCH:  Left half of screen = Red saber, Right half = Blue saber (best for tablets!)
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

export type InputMode = 'WEBCAM' | 'MOUSE' | 'TOUCH';

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

  // === DUAL TOUCH STATE ===
  private touchLeftActive = false;
  private touchRightActive = false;
  private touchLeftPos = { x: -0.5, y: 1.2 };
  private touchRightPos = { x: 0.5, y: 1.2 };
  private touchLeftPrev = { x: -0.5, y: 1.2 };
  private touchRightPrev = { x: 0.5, y: 1.2 };
  private touchLeftId: number | null = null;
  private touchRightId: number | null = null;

  // Callback on results
  private onResultsCallback: ((results: any) => void) | null = null;

  constructor() {
    this.setupMouseFallback();
    this.setupTouchControls();
  }

  public setInputMode(mode: InputMode) {
    this.inputMode = mode;
    // Reset touch state when switching modes
    if (mode !== 'TOUCH') {
      this.touchLeftActive = false;
      this.touchRightActive = false;
      this.touchLeftId = null;
      this.touchRightId = null;
    }
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
    if (this.inputMode === 'TOUCH') return this.touchLeftActive || this.touchRightActive;
    if (this.inputMode === 'MOUSE') return true;
    return this.leftSaber.isTracking || this.rightSaber.isTracking;
  }

  public get isSingleHandMode(): boolean {
    if (this.inputMode === 'TOUCH') {
      return (this.touchLeftActive !== this.touchRightActive);
    }
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
      console.warn('Webcam access failed or denied. Falling back to touch/mouse saber mode.', err);
      // Auto-detect: if touch device, default to TOUCH mode
      if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
        this.inputMode = 'TOUCH';
      } else {
        this.inputMode = 'MOUSE';
      }
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
      console.warn('MediaPipe Hands library could not be loaded. Operating in touch/mouse mode.');
      if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
        this.inputMode = 'TOUCH';
      } else {
        this.inputMode = 'MOUSE';
      }
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
   * Mouse Fallback mode (single pointer controls both sabers)
   */
  private setupMouseFallback() {
    window.addEventListener('mousemove', (e) => {
      if (this.inputMode !== 'MOUSE') return;
      const normX = e.clientX / window.innerWidth;
      const normY = e.clientY / window.innerHeight;

      this.mousePos.x = (normX - 0.5) * 3.0;
      this.mousePos.y = (1.0 - normY) * 2.0 + 0.3;
    });
  }

  /**
   * DUAL TOUCH CONTROLS — The key tablet playability feature!
   * 
   * Left half of screen → Red saber (left hand)
   * Right half of screen → Blue saber (right hand)
   * 
   * Each finger independently controls its saber with full velocity tracking.
   * Swiping generates high speed → easy to trigger hits.
   */
  private setupTouchControls() {
    const mapTouchToWorld = (clientX: number, clientY: number) => {
      const normX = clientX / window.innerWidth;
      const normY = clientY / window.innerHeight;
      return {
        x: (normX - 0.5) * 3.2,
        y: (1.0 - normY) * 2.4 + 0.2
      };
    };

    window.addEventListener('touchstart', (e) => {
      if (this.inputMode !== 'TOUCH') return;
      e.preventDefault();

      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        const halfW = window.innerWidth / 2;
        const worldPos = mapTouchToWorld(touch.clientX, touch.clientY);

        if (touch.clientX < halfW) {
          // Left side → Red saber
          this.touchLeftId = touch.identifier;
          this.touchLeftActive = true;
          this.touchLeftPrev.x = worldPos.x;
          this.touchLeftPrev.y = worldPos.y;
          this.touchLeftPos.x = worldPos.x;
          this.touchLeftPos.y = worldPos.y;
        } else {
          // Right side → Blue saber
          this.touchRightId = touch.identifier;
          this.touchRightActive = true;
          this.touchRightPrev.x = worldPos.x;
          this.touchRightPrev.y = worldPos.y;
          this.touchRightPos.x = worldPos.x;
          this.touchRightPos.y = worldPos.y;
        }
      }
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
      if (this.inputMode !== 'TOUCH') return;
      e.preventDefault();

      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        const worldPos = mapTouchToWorld(touch.clientX, touch.clientY);

        if (touch.identifier === this.touchLeftId) {
          this.touchLeftPrev.x = this.touchLeftPos.x;
          this.touchLeftPrev.y = this.touchLeftPos.y;
          this.touchLeftPos.x = worldPos.x;
          this.touchLeftPos.y = worldPos.y;
        } else if (touch.identifier === this.touchRightId) {
          this.touchRightPrev.x = this.touchRightPos.x;
          this.touchRightPrev.y = this.touchRightPos.y;
          this.touchRightPos.x = worldPos.x;
          this.touchRightPos.y = worldPos.y;
        }
      }
    }, { passive: false });

    const handleTouchEnd = (e: TouchEvent) => {
      if (this.inputMode !== 'TOUCH') return;

      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier === this.touchLeftId) {
          this.touchLeftActive = false;
          this.touchLeftId = null;
        } else if (touch.identifier === this.touchRightId) {
          this.touchRightActive = false;
          this.touchRightId = null;
        }
      }
    };

    window.addEventListener('touchend', handleTouchEnd);
    window.addEventListener('touchcancel', handleTouchEnd);
  }

  /**
   * Update called every frame in game loop
   */
  public update(dt: number) {
    if (this.inputMode === 'TOUCH') {
      this.updateTouchSabers(dt);
      return;
    }

    if (this.inputMode === 'MOUSE') {
      this.updateMouseSabers(dt);
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

  /**
   * Mouse mode: single pointer, both sabers follow mouse with offset
   */
  private updateMouseSabers(dt: number) {
    const targetLeftX = this.mousePos.x - 0.45;
    const targetRightX = this.mousePos.x + 0.45;
    const targetY = this.mousePos.y;

    const updateSaber = (saber: SaberPose, prevPos: { x: number; y: number; z: number }, targetX: number) => {
      const vx = (targetX - saber.position.x) / Math.max(0.001, dt);
      const vy = (targetY - saber.position.y) / Math.max(0.001, dt);

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

    updateSaber(this.leftSaber, this.prevLeftPos, targetLeftX);
    updateSaber(this.rightSaber, this.prevRightPos, targetRightX);
  }

  /**
   * TOUCH mode: Independent dual-touch saber control
   * Each touch is tracked separately — left side = red, right side = blue
   * Swipe velocity directly maps to saber speed for satisfying hits
   */
  private updateTouchSabers(dt: number) {
    const safeDt = Math.max(0.001, dt);

    // LEFT saber (Red)
    if (this.touchLeftActive) {
      const targetX = this.touchLeftPos.x;
      const targetY = this.touchLeftPos.y;

      // Smooth approach (responsive but not jerky)
      const lerpFactor = 0.75;
      this.leftSaber.position.x += (targetX - this.leftSaber.position.x) * lerpFactor;
      this.leftSaber.position.y += (targetY - this.leftSaber.position.y) * lerpFactor;
      this.leftSaber.position.z = 0.1;

      // Velocity from touch delta
      const vx = (this.touchLeftPos.x - this.touchLeftPrev.x) / safeDt;
      const vy = (this.touchLeftPos.y - this.touchLeftPrev.y) / safeDt;

      this.leftSaber.velocity.x += (vx - this.leftSaber.velocity.x) * 0.5;
      this.leftSaber.velocity.y += (vy - this.leftSaber.velocity.y) * 0.5;
      this.leftSaber.velocity.z = 0;
      // Touch gives generous speed — swipes feel powerful
      this.leftSaber.speed = Math.hypot(this.leftSaber.velocity.x, this.leftSaber.velocity.y) * 1.5;

      // Direction follows swipe
      this.leftSaber.direction.x = vx * 0.06;
      this.leftSaber.direction.y = 0.3 + vy * 0.06;
      this.leftSaber.direction.z = -0.92;
      const len = Math.hypot(this.leftSaber.direction.x, this.leftSaber.direction.y, this.leftSaber.direction.z) || 1;
      this.leftSaber.direction.x /= len;
      this.leftSaber.direction.y /= len;
      this.leftSaber.direction.z /= len;

      this.leftSaber.isTracking = true;
      this.prevLeftPos.x = this.leftSaber.position.x;
      this.prevLeftPos.y = this.leftSaber.position.y;
      this.prevLeftPos.z = this.leftSaber.position.z;
    } else {
      this.leftSaber.isTracking = false;
      this.leftSaber.speed = 0;
    }

    // RIGHT saber (Blue)
    if (this.touchRightActive) {
      const targetX = this.touchRightPos.x;
      const targetY = this.touchRightPos.y;

      const lerpFactor = 0.75;
      this.rightSaber.position.x += (targetX - this.rightSaber.position.x) * lerpFactor;
      this.rightSaber.position.y += (targetY - this.rightSaber.position.y) * lerpFactor;
      this.rightSaber.position.z = 0.1;

      const vx = (this.touchRightPos.x - this.touchRightPrev.x) / safeDt;
      const vy = (this.touchRightPos.y - this.touchRightPrev.y) / safeDt;

      this.rightSaber.velocity.x += (vx - this.rightSaber.velocity.x) * 0.5;
      this.rightSaber.velocity.y += (vy - this.rightSaber.velocity.y) * 0.5;
      this.rightSaber.velocity.z = 0;
      this.rightSaber.speed = Math.hypot(this.rightSaber.velocity.x, this.rightSaber.velocity.y) * 1.5;

      this.rightSaber.direction.x = vx * 0.06;
      this.rightSaber.direction.y = 0.3 + vy * 0.06;
      this.rightSaber.direction.z = -0.92;
      const len = Math.hypot(this.rightSaber.direction.x, this.rightSaber.direction.y, this.rightSaber.direction.z) || 1;
      this.rightSaber.direction.x /= len;
      this.rightSaber.direction.y /= len;
      this.rightSaber.direction.z /= len;

      this.rightSaber.isTracking = true;
      this.prevRightPos.x = this.rightSaber.position.x;
      this.prevRightPos.y = this.rightSaber.position.y;
      this.prevRightPos.z = this.rightSaber.position.z;
    } else {
      this.rightSaber.isTracking = false;
      this.rightSaber.speed = 0;
    }
  }
}

export const handTracker = new HandTracker();
