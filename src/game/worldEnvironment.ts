/**
 * 3D Cyberpunk Environment with Audio-Reactive Visualizers and Bloom Pipeline
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type { AudioBands } from '../audio/musicEngine';

export class WorldEnvironment {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  public composer: EffectComposer;
  public bloomPass: UnrealBloomPass;
  public isMobile: boolean;

  // Visual elements
  private archGates: THREE.Group[] = [];
  private equalizerBarsLeft: THREE.Mesh[] = [];
  private equalizerBarsRight: THREE.Mesh[] = [];
  private runwayLinesMaterial!: THREE.ShaderMaterial;

  constructor(canvas: HTMLCanvasElement) {
    // Detect mobile / tablet for performance scaling
    this.isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
      (navigator.maxTouchPoints > 0 && window.innerWidth < 1400);

    // 1. Renderer setup — clamp pixel ratio harder on mobile
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !this.isMobile, // Disable AA on mobile for performance
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.isMobile ? 1.5 : 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;

    // 2. Scene & Fog
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x060714, 0.025);

    // 3. Camera (player eye level)
    this.camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 100);
    this.camera.position.set(0, 1.6, 2.8);

    // 4. Lights
    const ambientLight = new THREE.AmbientLight(0x181a28, 1.0);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.7);
    dirLight.position.set(0, 8, 4);
    this.scene.add(dirLight);

    // 5. Post-processing Bloom (Tuned: crisp, subtle neon, no overexposure)
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      this.isMobile ? 0.3 : 0.45, // Lighter bloom on mobile
      0.35, // Radius
      0.82  // Threshold (only high-emissive objects glow)
    );
    // On mobile, start with bloom off for best performance — user can enable in settings
    if (this.isMobile) {
      this.bloomPass.enabled = false;
    }
    this.composer.addPass(this.bloomPass);

    // 6. Build scenery
    this.runwayLinesMaterial = this.createRunway();
    this.createGridFloor();
    this.createPlayerPlatform();
    this.createNeonArchGates();
    this.createEqualizerTowers();

    window.addEventListener('resize', () => this.onResize());
  }

  private createRunway(): THREE.ShaderMaterial {
    // Runway track geometry
    const trackGeo = new THREE.PlaneGeometry(3.6, 80);
    trackGeo.rotateX(-Math.PI / 2);

    const runwayShader = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSpeed: { value: 12.0 },
        uColor1: { value: new THREE.Color(0xff1053) },
        uColor2: { value: new THREE.Color(0x00f0ff) },
        uBassPulse: { value: 0.0 }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uSpeed;
        uniform vec3 uColor1;
        uniform vec3 uColor2;
        uniform float uBassPulse;
        varying vec2 vUv;

        void main() {
          float movingY = fract(vUv.y * 18.0 - uTime * 2.2);
          
          // Edge glow lines
          float edgeDist = min(vUv.x, 1.0 - vUv.x);
          float edgeLine = smoothstep(0.04, 0.0, edgeDist);

          // Center lane divider dashes
          float centerLine = smoothstep(0.015, 0.0, abs(vUv.x - 0.5)) * step(0.45, movingY);
          float leftLane = smoothstep(0.01, 0.0, abs(vUv.x - 0.25)) * step(0.6, movingY);
          float rightLane = smoothstep(0.01, 0.0, abs(vUv.x - 0.75)) * step(0.6, movingY);

          vec3 baseDark = vec3(0.015, 0.02, 0.04);
          vec3 neonCyan = uColor2 * (0.8 + uBassPulse * 0.4);
          vec3 neonRed = uColor1 * (0.8 + uBassPulse * 0.4);

          vec3 col = baseDark;
          col += (edgeLine * (vUv.x < 0.5 ? neonRed : neonCyan) * 0.9);
          col += centerLine * vec3(0.5, 0.6, 0.8) * 0.8;
          col += (leftLane * neonRed * 0.4) + (rightLane * neonCyan * 0.4);

          // Distance fade
          float alpha = smoothstep(0.0, 0.15, vUv.y) * smoothstep(1.0, 0.85, vUv.y);
          gl_FragColor = vec4(col, alpha * 0.85);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    const runwayTrack = new THREE.Mesh(trackGeo, runwayShader);
    runwayTrack.position.set(0, 0.01, -25);
    this.scene.add(runwayTrack);

    return runwayShader;
  }

  private createGridFloor(): THREE.GridHelper {
    const grid = new THREE.GridHelper(120, 80, 0x00f0ff, 0x111633);
    grid.position.set(0, -0.05, -20);
    this.scene.add(grid);
    return grid;
  }

  private createPlayerPlatform() {
    // Hexagonal glowing pedestal where player stands
    const platformGeo = new THREE.CylinderGeometry(1.6, 1.8, 0.1, 6);
    const platformMat = new THREE.MeshStandardMaterial({
      color: 0x0a0e20,
      roughness: 0.2,
      metalness: 0.8,
      emissive: 0x00f0ff,
      emissiveIntensity: 0.15
    });
    const platform = new THREE.Mesh(platformGeo, platformMat);
    platform.position.set(0, -0.05, 2.5);
    this.scene.add(platform);

    // Glowing feet position reticles (Left red, Right blue)
    const footRingGeo = new THREE.RingGeometry(0.18, 0.24, 24);
    footRingGeo.rotateX(-Math.PI / 2);

    const leftFootMat = new THREE.MeshBasicMaterial({ color: 0xff1053, side: THREE.DoubleSide });
    const rightFootMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, side: THREE.DoubleSide });

    const leftFoot = new THREE.Mesh(footRingGeo, leftFootMat);
    leftFoot.position.set(-0.35, 0.01, 2.4);
    this.scene.add(leftFoot);

    const rightFoot = new THREE.Mesh(footRingGeo, rightFootMat);
    rightFoot.position.set(0.35, 0.01, 2.4);
    this.scene.add(rightFoot);
  }

  private createNeonArchGates() {
    // Glowing neon hexagon rings along the tunnel that pulse with the music
    const gateCount = this.isMobile ? 5 : 8;
    const gateSpacing = 6.5;

    for (let i = 0; i < gateCount; i++) {
      const group = new THREE.Group();
      const radius = 3.6;

      // Hexagon ring
      const ringGeo = new THREE.TorusGeometry(radius, 0.025, 6, 6);
      const isRed = i % 2 === 0;
      const ringMat = new THREE.MeshBasicMaterial({
        color: isRed ? 0x991033 : 0x0099bb,
        transparent: true,
        opacity: 0.25
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.rotation.z = Math.PI / 6;

      group.add(ringMesh);
      group.position.set(0, 2.0, -i * gateSpacing - 5);
      this.scene.add(group);
      this.archGates.push(group);
    }
  }

  private createEqualizerTowers() {
    // Subtle neon equalizer pillars flanking the runway
    // Fewer pillars on mobile for performance
    const barCount = this.isMobile ? 8 : 16;
    const barSpacing = this.isMobile ? 4.8 : 2.4;
    const barWidth = 0.25;

    for (let i = 0; i < barCount; i++) {
      const zPos = -i * barSpacing - 2;

      // Left bar (Red)
      const geoLeft = new THREE.BoxGeometry(barWidth, 1.0, barWidth);
      geoLeft.translate(0, 0.5, 0); // bottom origin
      const matLeft = new THREE.MeshBasicMaterial({
        color: 0xaa0a30,
        transparent: true,
        opacity: 0.3
      });
      const meshLeft = new THREE.Mesh(geoLeft, matLeft);
      meshLeft.position.set(-2.5, 0, zPos);
      this.scene.add(meshLeft);
      this.equalizerBarsLeft.push(meshLeft);

      // Right bar (Blue)
      const geoRight = new THREE.BoxGeometry(barWidth, 1.0, barWidth);
      geoRight.translate(0, 0.5, 0);
      const matRight = new THREE.MeshBasicMaterial({
        color: 0x0088aa,
        transparent: true,
        opacity: 0.3
      });
      const meshRight = new THREE.Mesh(geoRight, matRight);
      meshRight.position.set(2.5, 0, zPos);
      this.scene.add(meshRight);
      this.equalizerBarsRight.push(meshRight);
    }
  }

  public update(time: number, dt: number, audioBands: AudioBands) {
    // 1. Update shader uniforms
    this.runwayLinesMaterial.uniforms.uTime.value = time;
    this.runwayLinesMaterial.uniforms.uBassPulse.value = audioBands.bass;

    // 2. Animate arch gates: forward travel + pulse with bass
    const bassScale = 1.0 + audioBands.bass * 0.22;
    for (let i = 0; i < this.archGates.length; i++) {
      const gate = this.archGates[i];
      gate.position.z += 8.0 * dt;
      if (gate.position.z > 5) {
        gate.position.z -= this.archGates.length * 6.5;
      }
      gate.scale.set(bassScale, bassScale, 1.0);
    }

    // 3. Animate equalizer towers with audio frequencies
    const raw = audioBands.rawFrequencies;
    for (let i = 0; i < this.equalizerBarsLeft.length; i++) {
      const freqIdx = Math.min(raw.length - 1, i * 4 + 2);
      const val = (raw[freqIdx] || 0) / 255;
      const targetHeight = Math.max(0.15, val * 4.5);

      const barL = this.equalizerBarsLeft[i];
      const barR = this.equalizerBarsRight[i];

      barL.scale.y += (targetHeight - barL.scale.y) * 0.35;
      barR.scale.y += (targetHeight - barR.scale.y) * 0.35;
    }

    // 4. Subtle camera sway on heavy beat kicks
    if (audioBands.isBeat) {
      this.camera.position.y = 1.6 + (Math.random() - 0.5) * 0.04;
    } else {
      this.camera.position.y += (1.6 - this.camera.position.y) * 0.15;
    }
  }

  public render() {
    this.composer.render();
  }

  public setBloomMode(mode: 'off' | 'subtle' | 'high') {
    if (mode === 'off') {
      this.bloomPass.enabled = false;
    } else if (mode === 'subtle') {
      this.bloomPass.enabled = true;
      this.bloomPass.strength = 0.35;
      this.bloomPass.threshold = 0.85;
    } else {
      this.bloomPass.enabled = true;
      this.bloomPass.strength = 0.6;
      this.bloomPass.threshold = 0.75;
    }
  }

  private onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.bloomPass.setSize(w, h);
  }
}
