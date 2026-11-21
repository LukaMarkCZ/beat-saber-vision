/**
 * Game state management: score, combo, multiplier, health, and cut ratings
 */

export interface HitResult {
  score: number;
  rating: 'PERFECT' | 'GREAT' | 'GOOD' | 'BAD';
  color: 'red' | 'blue';
  position: { x: number; y: number; z: number };
}

export class GameState {
  public score = 0;
  public combo = 0;
  public maxCombo = 0;
  public multiplier = 1;
  public health = 50; // 0 to 100
  public maxHealth = 100;

  // Hit statistics
  public perfectCuts = 0;
  public greatCuts = 0;
  public goodCuts = 0;
  public badCuts = 0;
  public missedNotes = 0;
  public totalNotes = 0;

  public isGameOver = false;
  public isVictory = false;
  public noFailMode = true; // Enabled by default for practice & webcam tolerance!

  private onStateChange: (() => void) | null = null;
  private onHitCallback: ((hit: HitResult) => void) | null = null;

  constructor() {
    this.reset();
  }

  public setOnStateChange(cb: () => void) {
    this.onStateChange = cb;
  }

  public setOnHit(cb: (hit: HitResult) => void) {
    this.onHitCallback = cb;
  }

  public reset() {
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.multiplier = 1;
    this.health = 50;
    this.perfectCuts = 0;
    this.greatCuts = 0;
    this.goodCuts = 0;
    this.badCuts = 0;
    this.missedNotes = 0;
    this.totalNotes = 0;
    this.isGameOver = false;
    this.isVictory = false;

    if (this.onStateChange) this.onStateChange();
  }

  public getAccuracy(): number {
    const hits = this.perfectCuts + this.greatCuts + this.goodCuts;
    const total = hits + this.badCuts + this.missedNotes;
    if (total === 0) return 100;
    return Math.round((hits / total) * 1000) / 10;
  }

  public getRank(): 'SSS' | 'SS' | 'S' | 'A' | 'B' | 'C' | 'D' {
    const acc = this.getAccuracy();
    if (acc >= 98 && this.missedNotes === 0) return 'SSS';
    if (acc >= 93) return 'SS';
    if (acc >= 85) return 'S';
    if (acc >= 75) return 'A';
    if (acc >= 65) return 'B';
    if (acc >= 50) return 'C';
    return 'D';
  }

  /**
   * Register a successful slice with Beat Saber scoring model:
   * Up to 70 for swing pre-angle/speed, 15 for cut accuracy, 30 for follow-through!
   */
  public registerCut(
    color: 'red' | 'blue',
    position: { x: number; y: number; z: number },
    swingSpeed: number,
    angleAccuracy: number
  ) {
    this.combo++;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;

    // Multiplier progression: 1x -> 2x (at 2) -> 4x (at 6) -> 8x (at 14)
    if (this.combo >= 14) {
      this.multiplier = 8;
    } else if (this.combo >= 6) {
      this.multiplier = 4;
    } else if (this.combo >= 2) {
      this.multiplier = 2;
    } else {
      this.multiplier = 1;
    }

    // Base score between 80 and 115
    const preSwingScore = Math.min(70, Math.round(35 + Math.min(swingSpeed * 3, 35)));
    const cutAccuracyScore = Math.min(15, Math.round(angleAccuracy * 15));
    const followThroughScore = 30;

    const baseScore = preSwingScore + cutAccuracyScore + followThroughScore;
    const earnedScore = baseScore * this.multiplier;
    this.score += earnedScore;

    // Health recovery
    this.health = Math.min(this.maxHealth, this.health + 4.5);

    let rating: 'PERFECT' | 'GREAT' | 'GOOD' = 'GOOD';
    if (baseScore >= 110) {
      rating = 'PERFECT';
      this.perfectCuts++;
    } else if (baseScore >= 95) {
      rating = 'GREAT';
      this.greatCuts++;
    } else {
      rating = 'GOOD';
      this.goodCuts++;
    }

    if (this.onHitCallback) {
      this.onHitCallback({
        score: earnedScore,
        rating,
        color,
        position
      });
    }

    if (this.onStateChange) this.onStateChange();
  }

  public registerBadCut(color: 'red' | 'blue', position: { x: number; y: number; z: number }) {
    this.combo = 0;
    this.multiplier = 1;
    this.badCuts++;
    this.score += 20;
    if (!this.noFailMode) {
      this.health = Math.max(0, this.health - 4);
      if (this.health <= 0) this.isGameOver = true;
    }

    if (this.onHitCallback) {
      this.onHitCallback({
        score: 20,
        rating: 'BAD',
        color,
        position
      });
    }

    if (this.onStateChange) this.onStateChange();
  }

  public registerMiss() {
    this.combo = 0;
    this.multiplier = 1;
    this.missedNotes++;
    if (!this.noFailMode) {
      this.health = Math.max(0, this.health - 6);
      if (this.health <= 0) this.isGameOver = true;
    }

    if (this.onStateChange) this.onStateChange();
  }

  public registerBombHit() {
    this.combo = 0;
    this.multiplier = 1;
    if (!this.noFailMode) {
      this.health = Math.max(0, this.health - 15);
      if (this.health <= 0) this.isGameOver = true;
    }

    if (this.onStateChange) this.onStateChange();
  }
}

export const gameState = new GameState();
