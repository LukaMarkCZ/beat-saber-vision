/**
 * Beat Saber Cube Manager: Note Spawning, Collision Detection, 
 * Approach Visual Cues, and Half-Cut Physics Separation
 */

import * as THREE from 'three';
import type { BeatNote, CutDirection } from '../audio/beatmaps';
import { SaberManager, type SaberSegment } from './saberManager';
import { ParticleSystem } from './particleSystem';
import { soundSynth } from '../audio/soundSynth';
import { gameState } from './gameState';
import { handTracker } from '../vision/handTracker';

export interface ActiveCube {
  note: BeatNote;
  mesh: THREE.Group;
  initialZ: number;
  isHit: boolean;
  box: THREE.Box3;
  // Approach indicator ring
  approachRing: THREE.Mesh | null;
}

export interface CutHalfMesh {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  rotVelocity: THREE.Vector3;
  life: number;
  maxLife: number;
}

export class CubeManager {
  private scene: THREE.Scene;
  private particleSystem: ParticleSystem;

  private allNotes: BeatNote[] = [];
  private activeCubes: ActiveCube[] = [];
  private cutHalves: CutHalfMesh[] = [];

  private nextNoteIndex = 0;
  public trackSpeed = 21.0;
  private spawnZ = -45.0;

  // Material & Texture caching
  private redMat: THREE.MeshStandardMaterial;
  private blueMat: THREE.MeshStandardMaterial;
  private arrowTextures: Map<string, THREE.CanvasTexture> = new Map();
  private approachRingGeo: THREE.RingGeometry;
  private approachRedMat: THREE.MeshBasicMaterial;
  private approachBlueMat: THREE.MeshBasicMaterial;

  // Lane coordinates: 4 horizontal columns x 2 vertical rows (optimized for human arm wingspan)
  public static LANE_X = [-0.85, -0.28, 0.28, 0.85];
  public static LANE_Y = [0.95, 1.45];
  public speedMultiplier = 1.0;

  constructor(scene: THREE.Scene, particleSystem: ParticleSystem) {
    this.scene = scene;
    this.particleSystem = particleSystem;

    this.redMat = new THREE.MeshStandardMaterial({
      color: 0xff1053,
      emissive: 0x880525,
      emissiveIntensity: 0.25,
      roughness: 0.35,
      metalness: 0.6
    });

    this.blueMat = new THREE.MeshStandardMaterial({
      color: 0x00d0ff,
      emissive: 0x005588,
      emissiveIntensity: 0.25,
      roughness: 0.35,
      metalness: 0.6
    });

    // Pre-create approach ring geometry and materials (shared)
    this.approachRingGeo = new THREE.RingGeometry(0.28, 0.32, 24);
    this.approachRedMat = new THREE.MeshBasicMaterial({
      color: 0xff1053,
      transparent: true,
      opacity: 0.0,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.approachBlueMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.0,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    this.pregenerateArrowTextures();
  }

  private pregenerateArrowTextures() {
    const directions: CutDirection[] = ['UP', 'DOWN', 'LEFT', 'RIGHT', 'ANY'];
    for (const dir of directions) {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext('2d')!;

      // Dark background
      ctx.fillStyle = '#0e111d';
      ctx.fillRect(0, 0, 128, 128);

      // Glowing border
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 6;
      ctx.strokeRect(6, 6, 116, 116);

      ctx.save();
      ctx.translate(64, 64);

      if (dir === 'UP') ctx.rotate(0);
      else if (dir === 'DOWN') ctx.rotate(Math.PI);
      else if (dir === 'LEFT') ctx.rotate(-Math.PI / 2);
      else if (dir === 'RIGHT') ctx.rotate(Math.PI / 2);

      if (dir === 'ANY') {
        // Glowing center dot
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(0, 0, 26, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // High contrast chevron arrow
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(0, -38);
        ctx.lineTo(36, 18);
        ctx.lineTo(16, 18);
        ctx.lineTo(0, -8);
        ctx.lineTo(-16, 18);
        ctx.lineTo(-36, 18);
        ctx.closePath();
        ctx.fill();
      }

      ctx.restore();

      const texture = new THREE.CanvasTexture(canvas);
      this.arrowTextures.set(dir, texture);
    }
  }

  public setNotes(notes: BeatNote[], speed: number) {
    this.clearAll();
    this.allNotes = [...notes].sort((a, b) => a.time - b.time);
    this.trackSpeed = speed;
    this.nextNoteIndex = 0;
  }

  public clearAll() {
    for (const cube of this.activeCubes) {
      this.scene.remove(cube.mesh);
    }
    this.activeCubes = [];

    for (const half of this.cutHalves) {
      this.scene.remove(half.mesh);
    }
    this.cutHalves = [];
    this.nextNoteIndex = 0;
  }

  /**
   * Create a single 3D Beat Cube with neon shell and arrow face
   */
  private createCubeMesh(type: 'red' | 'blue', direction: CutDirection): THREE.Group {
    const group = new THREE.Group();
    const size = 0.44;

    // 1. Core cube
    const cubeGeo = new THREE.BoxGeometry(size, size, size);
    const primaryMat = type === 'red' ? this.redMat : this.blueMat;

    // Front face with directional arrow texture
    const arrowTex = this.arrowTextures.get(direction) || this.arrowTextures.get('ANY')!;
    const frontMat = new THREE.MeshBasicMaterial({ map: arrowTex });

    const materials = [
      primaryMat,   // +X right
      primaryMat,   // -X left
      primaryMat,   // +Y top
      primaryMat,   // -Y bottom
      frontMat,     // +Z front (facing player)
      primaryMat    // -Z back
    ];

    const cubeMesh = new THREE.Mesh(cubeGeo, materials);
    group.add(cubeMesh);

    // 2. Beveled wireframe neon accent lines
    const wireGeo = new THREE.EdgesGeometry(cubeGeo);
    const wireMat = new THREE.LineBasicMaterial({
      color: type === 'red' ? 0xff4070 : 0x40ffff,
      linewidth: 2
    });
    const wireMesh = new THREE.LineSegments(wireGeo, wireMat);
    group.add(wireMesh);

    return group;
  }

  /**
   * Create an approach indicator ring (subtle visual depth cue)
   */
  private createApproachRing(type: 'red' | 'blue'): THREE.Mesh {
    const mat = (type === 'red' ? this.approachRedMat : this.approachBlueMat).clone();
    const ring = new THREE.Mesh(this.approachRingGeo, mat);
    ring.rotation.x = -Math.PI / 2; // Face upward on the runway
    return ring;
  }

  /**
   * Spawn halves when cube is cut cleanly
   */
  private spawnCutHalves(cube: ActiveCube, cutDir: CutDirection) {
    const halfWidth = cutDir === 'LEFT' || cutDir === 'RIGHT' ? 0.44 : 0.22;
    const halfHeight = cutDir === 'UP' || cutDir === 'DOWN' ? 0.44 : 0.22;
    const halfGeo = new THREE.BoxGeometry(halfWidth, halfHeight, 0.44);

    const mat = cube.note.type === 'red' ? this.redMat : this.blueMat;

    // Determine outward impulse direction based on slice plane
    const isHorizontalCut = cutDir === 'LEFT' || cutDir === 'RIGHT';

    for (let i = 0; i < 2; i++) {
      const sign = i === 0 ? -1 : 1;
      const halfMesh = new THREE.Mesh(halfGeo, mat);

      halfMesh.position.copy(cube.mesh.position);
      if (isHorizontalCut) {
        halfMesh.position.y += sign * 0.12;
      } else {
        halfMesh.position.x += sign * 0.12;
      }

      const velX = (isHorizontalCut ? (Math.random() - 0.5) * 2.0 : sign * (3.5 + Math.random() * 2.0));
      const velY = (isHorizontalCut ? sign * (3.5 + Math.random() * 2.0) : (2.0 + Math.random() * 2.0));
      const velZ = (Math.random() - 0.5) * 2.0;

      const rotVel = new THREE.Vector3(
        (Math.random() - 0.5) * 12,
        (Math.random() - 0.5) * 12,
        (Math.random() - 0.5) * 12
      );

      this.scene.add(halfMesh);
      this.cutHalves.push({
        mesh: halfMesh,
        velocity: new THREE.Vector3(velX, velY, velZ),
        rotVelocity: rotVel,
        life: 0.65,
        maxLife: 0.65
      });
    }
  }

  public update(songTime: number, dt: number, saberManager: SaberManager) {
    // 1. Spawn notes whose arrival time matches current song time + travel duration
    const leadTime = Math.abs(this.spawnZ) / this.trackSpeed;

    while (
      this.nextNoteIndex < this.allNotes.length &&
      this.allNotes[this.nextNoteIndex].time <= songTime + leadTime
    ) {
      const note = this.allNotes[this.nextNoteIndex];
      this.nextNoteIndex++;

      // Skip bombs in cubeManager (handled by bombManager)
      if (note.type === 'bomb') continue;

      const mesh = this.createCubeMesh(note.type, note.cutDirection);
      const laneX = CubeManager.LANE_X[Math.min(3, Math.max(0, note.lineIndex))];
      const laneY = CubeManager.LANE_Y[Math.min(1, Math.max(0, note.lineLayer))];

      mesh.position.set(laneX, laneY, this.spawnZ);
      this.scene.add(mesh);

      // Create approach indicator ring on the runway floor
      const approachRing = this.createApproachRing(note.type);
      approachRing.position.set(laneX, 0.02, 0); // Fixed at strike zone Z=0 on the floor
      this.scene.add(approachRing);

      this.activeCubes.push({
        note,
        mesh,
        initialZ: this.spawnZ,
        isHit: false,
        box: new THREE.Box3().setFromObject(mesh),
        approachRing
      });
    }

    // Determine speed threshold based on input mode
    // Touch mode gets much lower threshold since swiping is different from waving hands
    const isTouchMode = handTracker.getInputMode() === 'TOUCH';
    const isMouseMode = handTracker.getInputMode() === 'MOUSE';
    const speedThreshold = isTouchMode ? 0.3 : isMouseMode ? 0.4 : 0.65;

    // 2. Move active cubes towards player & test collision
    for (let i = this.activeCubes.length - 1; i >= 0; i--) {
      const cube = this.activeCubes[i];

      // Exact Z position based on song time & speed multiplier
      const effectiveSpeed = this.trackSpeed * this.speedMultiplier;
      const timeRemaining = cube.note.time - songTime;
      const targetZ = -timeRemaining * effectiveSpeed;
      cube.mesh.position.z = targetZ;

      // Update bounding box
      cube.box.setFromObject(cube.mesh);

      // === APPROACH RING VISUAL CUE ===
      // Ring glows brighter as cube approaches Z=0 (strike zone)
      if (cube.approachRing) {
        const distToStrike = Math.abs(targetZ);
        const approachZone = 8.0; // Start showing ring at this Z distance
        
        if (distToStrike < approachZone && targetZ < 0) {
          const progress = 1.0 - (distToStrike / approachZone);
          const ringMat = cube.approachRing.material as THREE.MeshBasicMaterial;
          ringMat.opacity = progress * 0.5; // Subtle, max 50% opacity
          
          // Ring shrinks as cube approaches (like a timing circle in rhythm games)
          const ringScale = 1.0 + (1.0 - progress) * 1.5;
          cube.approachRing.scale.set(ringScale, ringScale, 1);
        } else if (targetZ >= 0) {
          // Past strike zone — hide ring
          const ringMat = cube.approachRing.material as THREE.MeshBasicMaterial;
          ringMat.opacity = 0;
        }
      }

      // Check collision with both sabers in calibrated slice zone (wider window for playability)
      if (!cube.isHit && cube.mesh.position.z >= -1.2 && cube.mesh.position.z <= 1.0) {
        this.checkSaberIntersection(cube, saberManager.leftSaber.segment, 'red', i, speedThreshold);
        if (!cube.isHit) {
          this.checkSaberIntersection(cube, saberManager.rightSaber.segment, 'blue', i, speedThreshold);
        }
      }

      // Check for missed note (passes behind player)
      if (!cube.isHit && cube.mesh.position.z > 2.5) {
        cube.isHit = true;
        this.scene.remove(cube.mesh);
        if (cube.approachRing) this.scene.remove(cube.approachRing);
        this.activeCubes.splice(i, 1);

        gameState.registerMiss();
        soundSynth.playMiss();
      }
    }

    // 3. Update physics on cut halves
    const gravity = -14.0;
    for (let i = this.cutHalves.length - 1; i >= 0; i--) {
      const half = this.cutHalves[i];
      half.life -= dt;

      if (half.life <= 0) {
        this.scene.remove(half.mesh);
        this.cutHalves.splice(i, 1);
        continue;
      }

      half.velocity.y += gravity * dt;
      half.mesh.position.addScaledVector(half.velocity, dt);

      half.mesh.rotation.x += half.rotVelocity.x * dt;
      half.mesh.rotation.y += half.rotVelocity.y * dt;
      half.mesh.rotation.z += half.rotVelocity.z * dt;

      // Scale down slightly as it fades
      const progress = half.life / half.maxLife;
      half.mesh.scale.setScalar(progress);
    }
  }

  /**
   * Distance test between saber line segment and cube center
   */
  private distSegmentToPoint(base: THREE.Vector3, tip: THREE.Vector3, point: THREE.Vector3): number {
    const segDir = tip.clone().sub(base);
    const segLen = segDir.length();
    if (segLen === 0) return base.distanceTo(point);
    segDir.normalize();

    const toPoint = point.clone().sub(base);
    const projection = toPoint.dot(segDir);
    const clampedProj = Math.max(0, Math.min(segLen, projection));
    const closestPoint = base.clone().add(segDir.multiplyScalar(clampedProj));

    return closestPoint.distanceTo(point);
  }

  /**
   * Continuous swept collision detection: tests current frame, previous frame, midpoint, and hand base
   * Requires ACTIVE tracking and MOTION (configurable speed threshold)
   */
  private checkSaberIntersection(
    cube: ActiveCube,
    saber: SaberSegment,
    saberColor: 'red' | 'blue',
    cubeIndex: number,
    speedThreshold: number
  ) {
    // 1. Must be actively tracked
    if (!saber.isTracking) return;

    // 2. Must be actively in motion (prevent auto-destroying cubes while doing nothing)
    if (saber.speed < speedThreshold) return;

    const cubePos = cube.mesh.position;
    const cubeRadius = 0.40; // Slightly more generous for playability

    // 1. Current frame blade distance
    const distCurr = this.distSegmentToPoint(saber.base, saber.tip, cubePos);

    // 2. Previous frame blade distance (prevents fast tunneling)
    const distPrev = this.distSegmentToPoint(saber.prevBase, saber.prevTip, cubePos);

    // 3. Midpoint swept blade segment
    const midBase = saber.base.clone().add(saber.prevBase).multiplyScalar(0.5);
    const midTip = saber.tip.clone().add(saber.prevTip).multiplyScalar(0.5);
    const distMid = this.distSegmentToPoint(midBase, midTip, cubePos);

    // 4. Hand fist base distance (punching forward with fist hits directly!)
    const distHand = Math.min(
      saber.base.distanceTo(cubePos),
      saber.prevBase.distanceTo(cubePos)
    );

    const minDist = Math.min(distCurr, distPrev, distMid, distHand);

    if (minDist <= cubeRadius) {
      cube.isHit = true;

      // Remove approach ring
      if (cube.approachRing) {
        this.scene.remove(cube.approachRing);
      }

      // Color match or single-hand play
      const isMatchingColor = (cube.note.type === saberColor) || handTracker.isSingleHandMode;
      const isFastSlash = (saber.speed > 1.8);

      // Hit quality: PERFECT for color match or fast slash, GREAT for any other hit
      const isPerfect = isMatchingColor || isFastSlash;
      const rating = isPerfect ? 'PERFECT' : 'GREAT';

      gameState.registerHit(
        rating,
        saberColor,
        { x: cubePos.x, y: cubePos.y, z: cubePos.z }
      );

      soundSynth.playSlice(saberColor, isPerfect);

      // Spawn glowing cut halves and spark explosion
      this.spawnCutHalves(cube, cube.note.cutDirection || 'ANY');
      this.particleSystem.burst(
        cubePos.x,
        cubePos.y,
        cubePos.z,
        saberColor,
        isPerfect ? 50 : 30,
        isPerfect ? 7.0 : 4.5
      );

      // Remove sliced cube from scene
      this.scene.remove(cube.mesh);
      this.activeCubes.splice(cubeIndex, 1);
    }
  }
}
