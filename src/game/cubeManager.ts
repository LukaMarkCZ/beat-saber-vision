/**
 * Beat Saber Cube Manager: Note Spawning, Collision Detection, and Half-Cut Physics Separation
 */

import * as THREE from 'three';
import type { BeatNote, CutDirection } from '../audio/beatmaps';
import { SaberManager, type SaberSegment } from './saberManager';
import { ParticleSystem } from './particleSystem';
import { soundSynth } from '../audio/soundSynth';
import { gameState } from './gameState';

export interface ActiveCube {
  note: BeatNote;
  mesh: THREE.Group;
  initialZ: number;
  isHit: boolean;
  box: THREE.Box3;
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

      this.activeCubes.push({
        note,
        mesh,
        initialZ: this.spawnZ,
        isHit: false,
        box: new THREE.Box3().setFromObject(mesh)
      });
    }

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

      // Check collision with both sabers in an expanded slice zone
      if (!cube.isHit && cube.mesh.position.z >= -1.8 && cube.mesh.position.z <= 1.1) {
        this.checkSaberIntersection(cube, saberManager.leftSaber.segment, 'red', i);
        if (!cube.isHit) {
          this.checkSaberIntersection(cube, saberManager.rightSaber.segment, 'blue', i);
        }
      }

      // Check for missed note (passes behind player)
      if (!cube.isHit && cube.mesh.position.z > 2.2) {
        cube.isHit = true;
        this.scene.remove(cube.mesh);
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
   * Swept continuous collision detection: tests current frame, previous frame, and midpoint
   */
  private checkSaberIntersection(
    cube: ActiveCube,
    saber: SaberSegment,
    saberColor: 'red' | 'blue',
    cubeIndex: number
  ) {
    const cubePos = cube.mesh.position;
    const cubeRadius = 0.58; // Forgiving hit radius to ensure crisp, satisfying cuts

    // 1. Current frame distance
    const distCurr = this.distSegmentToPoint(saber.base, saber.tip, cubePos);

    // 2. Previous frame distance (prevent fast tunneling)
    const distPrev = this.distSegmentToPoint(saber.prevBase, saber.prevTip, cubePos);

    // 3. Midpoint swept segment
    const midBase = saber.base.clone().add(saber.prevBase).multiplyScalar(0.5);
    const midTip = saber.tip.clone().add(saber.prevTip).multiplyScalar(0.5);
    const distMid = this.distSegmentToPoint(midBase, midTip, cubePos);

    const minDist = Math.min(distCurr, distPrev, distMid);

    if (minDist <= cubeRadius) {
      cube.isHit = true;

      // 1. Validate saber color
      const isCorrectColor = cube.note.type === saberColor;

      // 2. Validate cut direction with vector dot product
      const vx = saber.velocity.x;
      const vy = saber.velocity.y;
      const swingSpeed = saber.speed;

      let isCorrectDirection = false;
      const reqDir = cube.note.cutDirection;

      if (reqDir === 'ANY') {
        isCorrectDirection = true;
      } else {
        const velLen = Math.hypot(vx, vy);
        if (velLen > 0.2) {
          const nx = vx / velLen;
          const ny = vy / velLen;

          let targetX = 0;
          let targetY = 0;
          if (reqDir === 'DOWN') targetY = -1;
          else if (reqDir === 'UP') targetY = 1;
          else if (reqDir === 'LEFT') targetX = -1;
          else if (reqDir === 'RIGHT') targetX = 1;

          const dot = nx * targetX + ny * targetY;
          // Generous angle tolerance: accept cut as long as it's not backwards
          if (dot > -0.25) {
            isCorrectDirection = true;
          }
        } else if (swingSpeed > 1.2) {
          // If swinging with good speed, accept
          isCorrectDirection = true;
        }
      }

      if (isCorrectColor && isCorrectDirection) {
        // Good cut!
        gameState.registerCut(
          saberColor,
          { x: cubePos.x, y: cubePos.y, z: cubePos.z },
          swingSpeed,
          Math.max(0.6, 1.0 - minDist / cubeRadius)
        );
        soundSynth.playSlice(saberColor, true);

        // Spawn glowing cut halves and spark explosion
        this.spawnCutHalves(cube, reqDir);
        this.particleSystem.burst(cubePos.x, cubePos.y, cubePos.z, saberColor, 55, 7.5);
      } else {
        // Bad cut (wrong color or inverted slice)
        gameState.registerBadCut(cube.note.type as 'red' | 'blue', { x: cubePos.x, y: cubePos.y, z: cubePos.z });
        soundSynth.playSlice(saberColor, false);
        this.spawnCutHalves(cube, reqDir);
        this.particleSystem.burst(cubePos.x, cubePos.y, cubePos.z, 'yellow', 30, 4.0);
      }

      // Remove sliced cube from scene
      this.scene.remove(cube.mesh);
      this.activeCubes.splice(cubeIndex, 1);
    }
  }
}
