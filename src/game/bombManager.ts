/**
 * Spiked Cyber Bombs & Obstacles Manager
 */

import * as THREE from 'three';
import type { BeatNote } from '../audio/beatmaps';
import { SaberManager, type SaberSegment } from './saberManager';
import { ParticleSystem } from './particleSystem';
import { soundSynth } from '../audio/soundSynth';
import { gameState } from './gameState';
import { CubeManager } from './cubeManager';

export interface ActiveBomb {
  note: BeatNote;
  mesh: THREE.Group;
  coreMesh: THREE.Mesh;
  isHit: boolean;
}

export class BombManager {
  private scene: THREE.Scene;
  private particleSystem: ParticleSystem;

  private allNotes: BeatNote[] = [];
  private activeBombs: ActiveBomb[] = [];
  private nextBombIndex = 0;
  public trackSpeed = 21.0;
  private spawnZ = -45.0;

  constructor(scene: THREE.Scene, particleSystem: ParticleSystem) {
    this.scene = scene;
    this.particleSystem = particleSystem;
  }

  public setNotes(notes: BeatNote[], speed: number) {
    this.clearAll();
    this.allNotes = notes.filter((n) => n.type === 'bomb').sort((a, b) => a.time - b.time);
    this.trackSpeed = speed;
    this.nextBombIndex = 0;
  }

  public clearAll() {
    for (const bomb of this.activeBombs) {
      this.scene.remove(bomb.mesh);
    }
    this.activeBombs = [];
    this.nextBombIndex = 0;
  }

  private createBombMesh(): { group: THREE.Group; core: THREE.Mesh } {
    const group = new THREE.Group();

    // Central dark sphere
    const sphereGeo = new THREE.SphereGeometry(0.24, 16, 16);
    const sphereMat = new THREE.MeshStandardMaterial({
      color: 0x11131a,
      roughness: 0.3,
      metalness: 0.9,
      emissive: 0xff0033,
      emissiveIntensity: 0.4
    });
    const core = new THREE.Mesh(sphereGeo, sphereMat);
    group.add(core);

    // Glowing spikes protruding outward
    const spikeGeo = new THREE.ConeGeometry(0.045, 0.22, 8);
    spikeGeo.translate(0, 0.18, 0);
    const spikeMat = new THREE.MeshBasicMaterial({ color: 0xff0044 });

    const directions = [
      [1, 0, 0], [-1, 0, 0],
      [0, 1, 0], [0, -1, 0],
      [0, 0, 1], [0, 0, -1],
      [0.7, 0.7, 0], [-0.7, -0.7, 0]
    ];

    for (const [x, y, z] of directions) {
      const spike = new THREE.Mesh(spikeGeo, spikeMat);
      const v = new THREE.Vector3(x, y, z).normalize();
      spike.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v);
      group.add(spike);
    }

    return { group, core };
  }

  public update(songTime: number, dt: number, saberManager: SaberManager) {
    const leadTime = Math.abs(this.spawnZ) / this.trackSpeed;

    // Spawn bombs
    while (
      this.nextBombIndex < this.allNotes.length &&
      this.allNotes[this.nextBombIndex].time <= songTime + leadTime
    ) {
      const note = this.allNotes[this.nextBombIndex];
      this.nextBombIndex++;

      const { group, core } = this.createBombMesh();
      const laneX = CubeManager.LANE_X[Math.min(3, Math.max(0, note.lineIndex))];
      const laneY = CubeManager.LANE_Y[Math.min(1, Math.max(0, note.lineLayer))];

      group.position.set(laneX, laneY, this.spawnZ);
      this.scene.add(group);

      this.activeBombs.push({
        note,
        mesh: group,
        coreMesh: core,
        isHit: false
      });
    }

    // Move & collide
    for (let i = this.activeBombs.length - 1; i >= 0; i--) {
      const bomb = this.activeBombs[i];
      const timeRemaining = bomb.note.time - songTime;
      bomb.mesh.position.z = -timeRemaining * this.trackSpeed;

      // Spin bomb
      bomb.mesh.rotation.x += 1.8 * dt;
      bomb.mesh.rotation.y += 2.2 * dt;

      // Pulse red glow
      const pulse = 0.4 + Math.sin(performance.now() * 0.01) * 0.35;
      (bomb.coreMesh.material as THREE.MeshStandardMaterial).emissiveIntensity = pulse;

      // Collision check with sabers
      if (!bomb.isHit && bomb.mesh.position.z >= -1.2 && bomb.mesh.position.z <= 0.8) {
        this.checkBombIntersection(bomb, saberManager.leftSaber.segment, i);
        if (!bomb.isHit) {
          this.checkBombIntersection(bomb, saberManager.rightSaber.segment, i);
        }
      }

      // Past player
      if (!bomb.isHit && bomb.mesh.position.z > 2.5) {
        this.scene.remove(bomb.mesh);
        this.activeBombs.splice(i, 1);
      }
    }
  }

  private checkBombIntersection(bomb: ActiveBomb, saber: SaberSegment, index: number) {
    const bombPos = bomb.mesh.position;
    const bombRadius = 0.32;

    const segDir = saber.tip.clone().sub(saber.base);
    const segLen = segDir.length();
    if (segLen === 0) return;
    segDir.normalize();

    const toBomb = bombPos.clone().sub(saber.base);
    const projection = toBomb.dot(segDir);
    const clampedProj = Math.max(0, Math.min(segLen, projection));
    const closestPoint = saber.base.clone().add(segDir.multiplyScalar(clampedProj));

    if (closestPoint.distanceTo(bombPos) <= bombRadius) {
      bomb.isHit = true;
      gameState.registerBombHit();
      soundSynth.playBomb();

      this.particleSystem.burst(bombPos.x, bombPos.y, bombPos.z, 'white', 50, 8.5);

      this.scene.remove(bomb.mesh);
      this.activeBombs.splice(index, 1);
    }
  }
}
