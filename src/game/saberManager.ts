/**
 * Laser Saber Manager: Hilts, Glowing Plasma Blades, Collision Segments, and Motion Trails
 */

import * as THREE from 'three';
import { handTracker, type SaberPose } from '../vision/handTracker';
import { soundSynth } from '../audio/soundSynth';

export interface SaberSegment {
  base: THREE.Vector3;
  tip: THREE.Vector3;
  prevBase: THREE.Vector3;
  prevTip: THREE.Vector3;
  direction: THREE.Vector3;
  velocity: THREE.Vector3;
  speed: number;
}

class SingleSaber {
  public group: THREE.Group;
  public hilt: THREE.Mesh;
  public bladeCore: THREE.Mesh;
  public bladeGlow: THREE.Mesh;
  public tipLight: THREE.PointLight;

  // Trail ribbon geometry
  private trailMesh: THREE.Mesh;
  private trailGeometry: THREE.BufferGeometry;
  private trailPositions: Float32Array;
  private trailAlphas: Float32Array;
  private trailHistory: { base: THREE.Vector3; tip: THREE.Vector3 }[] = [];
  private maxTrailSteps = 14;

  public colorType: 'red' | 'blue';
  public bladeLength = 1.15;
  private primaryColor: THREE.Color;

  // Collision state
  public segment: SaberSegment = {
    base: new THREE.Vector3(),
    tip: new THREE.Vector3(),
    prevBase: new THREE.Vector3(),
    prevTip: new THREE.Vector3(),
    direction: new THREE.Vector3(0, 0, -1),
    velocity: new THREE.Vector3(),
    speed: 0
  };

  private lastWhooshTime = 0;

  constructor(colorType: 'red' | 'blue', scene: THREE.Scene) {
    this.colorType = colorType;
    this.primaryColor = colorType === 'red' ? new THREE.Color(0xff1053) : new THREE.Color(0x00f0ff);
    this.group = new THREE.Group();

    // 1. Ergonomic dark titanium hilt
    const hiltGeo = new THREE.CylinderGeometry(0.024, 0.026, 0.22, 16);
    hiltGeo.translate(0, -0.11, 0); // hilt extends backward from handle point
    const hiltMat = new THREE.MeshStandardMaterial({
      color: 0x111318,
      roughness: 0.3,
      metalness: 0.85
    });
    this.hilt = new THREE.Mesh(hiltGeo, hiltMat);

    // Emitter guard ring
    const guardGeo = new THREE.CylinderGeometry(0.034, 0.034, 0.03, 16);
    guardGeo.translate(0, 0, 0);
    const guardMat = new THREE.MeshBasicMaterial({ color: this.primaryColor });
    const guard = new THREE.Mesh(guardGeo, guardMat);
    this.hilt.add(guard);

    this.group.add(this.hilt);

    // 2. Laser Blade Core (crisp, narrow filament)
    const coreGeo = new THREE.CylinderGeometry(0.007, 0.007, this.bladeLength, 12);
    coreGeo.translate(0, this.bladeLength / 2, 0);
    const coreMat = new THREE.MeshBasicMaterial({
      color: colorType === 'red' ? 0xffe0e8 : 0xe0ffff
    });
    this.bladeCore = new THREE.Mesh(coreGeo, coreMat);
    this.group.add(this.bladeCore);

    // 3. Laser Blade Outer Plasma Glow (rich color, controlled glow)
    const glowGeo = new THREE.CylinderGeometry(0.022, 0.022, this.bladeLength, 16);
    glowGeo.translate(0, this.bladeLength / 2, 0);
    const glowMat = new THREE.MeshBasicMaterial({
      color: this.primaryColor,
      transparent: true,
      opacity: 0.65,
      blending: THREE.NormalBlending,
      depthWrite: false
    });
    this.bladeGlow = new THREE.Mesh(glowGeo, glowMat);
    this.group.add(this.bladeGlow);

    // Subtle tip light
    this.tipLight = new THREE.PointLight(this.primaryColor, 0.35, 1.2);
    this.tipLight.position.set(0, this.bladeLength, 0);
    this.group.add(this.tipLight);

    // 4. Glowing Plasma Hand Orb (visualizes exact hand position in 3D)
    const handOrbGeo = new THREE.SphereGeometry(0.065, 16, 16);
    const handOrbMat = new THREE.MeshBasicMaterial({
      color: this.primaryColor,
      transparent: true,
      opacity: 0.8
    });
    const handOrb = new THREE.Mesh(handOrbGeo, handOrbMat);
    this.group.add(handOrb);

    scene.add(this.group);

    // 5. Dynamic Motion Trail Ribbon
    const vertexCount = this.maxTrailSteps * 2;
    this.trailPositions = new Float32Array(vertexCount * 3);
    this.trailAlphas = new Float32Array(vertexCount);

    this.trailGeometry = new THREE.BufferGeometry();
    this.trailGeometry.setAttribute('position', new THREE.BufferAttribute(this.trailPositions, 3));
    this.trailGeometry.setAttribute('alpha', new THREE.BufferAttribute(this.trailAlphas, 1));

    // Custom shader for smooth alpha fading ribbon
    const trailMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: this.primaryColor }
      },
      vertexShader: `
        attribute float alpha;
        varying float vAlpha;
        void main() {
          vAlpha = alpha;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        varying float vAlpha;
        void main() {
          gl_FragColor = vec4(uColor, vAlpha * 0.4);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    this.trailMesh = new THREE.Mesh(this.trailGeometry, trailMaterial);
    this.trailMesh.frustumCulled = false;
    scene.add(this.trailMesh);
  }

  public update(pose: SaberPose, now: number) {
    this.group.visible = pose.isTracking;
    this.trailMesh.visible = pose.isTracking;

    // 1. Update position
    this.group.position.set(pose.position.x, pose.position.y, pose.position.z);

    // 2. Orient blade towards direction vector
    const dir = new THREE.Vector3(pose.direction.x, pose.direction.y, pose.direction.z).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const quat = new THREE.Quaternion().setFromUnitVectors(up, dir);
    this.group.setRotationFromQuaternion(quat);

    // 3. Compute world space base and tip
    this.segment.prevBase.copy(this.segment.base);
    this.segment.prevTip.copy(this.segment.tip);

    const baseWorld = this.group.position.clone();
    const tipWorld = baseWorld.clone().add(dir.clone().multiplyScalar(this.bladeLength));

    this.segment.base.copy(baseWorld);
    this.segment.tip.copy(tipWorld);
    this.segment.direction.copy(dir);
    this.segment.velocity.set(pose.velocity.x, pose.velocity.y, pose.velocity.z);
    this.segment.speed = pose.speed;

    // 4. Trigger air slice whoosh if fast swing
    if (pose.speed > 5.5 && now - this.lastWhooshTime > 280) {
      soundSynth.playWhoosh(Math.min(1.0, pose.speed / 15.0));
      this.lastWhooshTime = now;
    }

    // 5. Update trail history
    this.trailHistory.unshift({ base: baseWorld.clone(), tip: tipWorld.clone() });
    if (this.trailHistory.length > this.maxTrailSteps) {
      this.trailHistory.pop();
    }

    this.updateTrailMesh();
  }

  private updateTrailMesh() {
    const posAttr = this.trailGeometry.attributes.position as THREE.BufferAttribute;
    const alphaAttr = this.trailGeometry.attributes.alpha as THREE.BufferAttribute;

    const count = this.trailHistory.length;
    for (let i = 0; i < this.maxTrailSteps; i++) {
      const pIdx = i * 2;
      const vIdx = pIdx * 3;

      if (i < count) {
        const step = this.trailHistory[i];
        const alpha = Math.pow(1.0 - i / this.maxTrailSteps, 2.0);

        // Base vertex
        this.trailPositions[vIdx]     = step.base.x;
        this.trailPositions[vIdx + 1] = step.base.y;
        this.trailPositions[vIdx + 2] = step.base.z;
        this.trailAlphas[pIdx]        = alpha * 0.4;

        // Tip vertex
        this.trailPositions[vIdx + 3] = step.tip.x;
        this.trailPositions[vIdx + 4] = step.tip.y;
        this.trailPositions[vIdx + 5] = step.tip.z;
        this.trailAlphas[pIdx + 1]    = alpha;
      } else {
        // Degenerate triangles if not enough history
        const fallback = this.trailHistory[count - 1] || { base: this.group.position, tip: this.group.position };
        this.trailPositions[vIdx]     = fallback.base.x;
        this.trailPositions[vIdx + 1] = fallback.base.y;
        this.trailPositions[vIdx + 2] = fallback.base.z;
        this.trailAlphas[pIdx]        = 0;

        this.trailPositions[vIdx + 3] = fallback.tip.x;
        this.trailPositions[vIdx + 4] = fallback.tip.y;
        this.trailPositions[vIdx + 5] = fallback.tip.z;
        this.trailAlphas[pIdx + 1]    = 0;
      }
    }

    posAttr.needsUpdate = true;
    alphaAttr.needsUpdate = true;
  }
}

export class SaberManager {
  public leftSaber: SingleSaber;
  public rightSaber: SingleSaber;

  constructor(scene: THREE.Scene) {
    this.leftSaber = new SingleSaber('red', scene);
    this.rightSaber = new SingleSaber('blue', scene);
  }

  public update(dt: number) {
    handTracker.update(dt);
    const now = performance.now();

    this.leftSaber.update(handTracker.leftSaber, now);
    this.rightSaber.update(handTracker.rightSaber, now);
  }
}
