/**
 * High-performance flat-buffer 3D particle system for Three.js
 * Zero GC allocations during gameplay loop.
 */

import * as THREE from 'three';

export class ParticleSystem {
  private maxParticles: number;
  private count = 0;
  private stride = 10; // x, y, z, vx, vy, vz, life, maxLife, size, colorIndex

  // Flat data buffer
  private data: Float32Array;

  // Three.js Points representation
  private geometry: THREE.BufferGeometry;
  private material: THREE.PointsMaterial;
  public mesh: THREE.Points;

  private posArray: Float32Array;
  private colArray: Float32Array;

  // Pre-cached colors
  private redColor = new THREE.Color(0xff1053);
  private blueColor = new THREE.Color(0x00f0ff);
  private yellowColor = new THREE.Color(0xffdd00);
  private whiteColor = new THREE.Color(0xffffff);

  constructor(maxParticles = 800) {
    this.maxParticles = maxParticles;
    this.data = new Float32Array(maxParticles * this.stride);

    this.posArray = new Float32Array(maxParticles * 3);
    this.colArray = new Float32Array(maxParticles * 3);

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.posArray, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colArray, 3));

    // Glow spark texture (radial gradient)
    const sparkCanvas = document.createElement('canvas');
    sparkCanvas.width = 32;
    sparkCanvas.height = 32;
    const ctx = sparkCanvas.getContext('2d')!;
    const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.8)');
    gradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.2)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 32, 32);

    const texture = new THREE.CanvasTexture(sparkCanvas);

    this.material = new THREE.PointsMaterial({
      size: 0.18,
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      map: texture
    });

    this.mesh = new THREE.Points(this.geometry, this.material);
    this.mesh.frustumCulled = false;
  }

  /**
   * Spawn a burst of sparkling slice particles at hit location
   */
  public burst(
    x: number,
    y: number,
    z: number,
    colorType: 'red' | 'blue' | 'yellow' | 'white' = 'blue',
    count = 45,
    spreadVelocity = 6.0
  ) {
    const cIdx = colorType === 'red' ? 0 : colorType === 'blue' ? 1 : colorType === 'yellow' ? 2 : 3;

    for (let i = 0; i < count; i++) {
      if (this.count >= this.maxParticles) break;

      const idx = this.count * this.stride;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      const speed = (0.3 + Math.random() * 0.7) * spreadVelocity;

      const life = 0.4 + Math.random() * 0.45; // 0.4 to 0.85s

      this.data[idx]     = x;
      this.data[idx + 1] = y;
      this.data[idx + 2] = z;

      this.data[idx + 3] = Math.sin(phi) * Math.cos(theta) * speed; // vx
      this.data[idx + 4] = Math.sin(phi) * Math.sin(theta) * speed + 1.5; // vy (upward kick)
      this.data[idx + 5] = Math.cos(phi) * speed;                  // vz

      this.data[idx + 6] = life;                                   // remaining
      this.data[idx + 7] = life;                                   // maxLife
      this.data[idx + 8] = 0.12 + Math.random() * 0.15;            // size
      this.data[idx + 9] = cIdx;                                   // color index

      this.count++;
    }
  }

  /**
   * Update particle positions, apply gravity & drag, and update Three.js buffers
   */
  public update(dt: number) {
    let aliveCount = 0;
    const gravity = -9.8;
    const drag = Math.pow(0.92, dt * 60);

    const posAttr = this.geometry.attributes.position as THREE.BufferAttribute;
    const colAttr = this.geometry.attributes.color as THREE.BufferAttribute;

    for (let i = 0; i < this.count; i++) {
      const idx = i * this.stride;

      this.data[idx + 6] -= dt; // decrement life

      if (this.data[idx + 6] > 0) {
        // Physics update
        this.data[idx + 3] *= drag;
        this.data[idx + 4] = (this.data[idx + 4] + gravity * dt) * drag;
        this.data[idx + 5] *= drag;

        this.data[idx]     += this.data[idx + 3] * dt;
        this.data[idx + 1] += this.data[idx + 4] * dt;
        this.data[idx + 2] += this.data[idx + 5] * dt;

        const progress = this.data[idx + 6] / this.data[idx + 7]; // 1 down to 0
        const alpha = Math.max(0, progress);

        // Update render buffers for alive particle
        const pIdx = aliveCount * 3;
        this.posArray[pIdx]     = this.data[idx];
        this.posArray[pIdx + 1] = this.data[idx + 1];
        this.posArray[pIdx + 2] = this.data[idx + 2];

        const cIdx = this.data[idx + 9];
        const baseColor = cIdx === 0 ? this.redColor : cIdx === 1 ? this.blueColor : cIdx === 2 ? this.yellowColor : this.whiteColor;

        this.colArray[pIdx]     = baseColor.r * alpha;
        this.colArray[pIdx + 1] = baseColor.g * alpha;
        this.colArray[pIdx + 2] = baseColor.b * alpha;

        // Compact flat array if dead particles were skipped
        if (aliveCount !== i) {
          const target = aliveCount * this.stride;
          for (let s = 0; s < this.stride; s++) {
            this.data[target + s] = this.data[idx + s];
          }
        }

        aliveCount++;
      }
    }

    this.count = aliveCount;

    // Zero out remaining positions so they don't render
    for (let i = aliveCount; i < this.maxParticles; i++) {
      const pIdx = i * 3;
      this.posArray[pIdx] = 0;
      this.posArray[pIdx + 1] = -100; // place under floor
      this.posArray[pIdx + 2] = 0;
    }

    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  }
}
