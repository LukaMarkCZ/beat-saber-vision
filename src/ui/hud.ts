/**
 * Futuristic Glassmorphic HUD with Floating 3D Hit Ratings and Telemetry
 */

import { gameState, type HitResult } from '../game/gameState';
import { handTracker } from '../vision/handTracker';

export class GameHUD {
  private container: HTMLDivElement;
  private scoreEl: HTMLElement;
  private accuracyEl: HTMLElement;
  private multiplierEl: HTMLElement;
  private comboEl: HTMLElement;
  private rankEl: HTMLElement;
  private healthBarEl: HTMLElement;
  private progressFillEl: HTMLElement;
  private timeDisplayEl: HTMLElement;
  private trackTitleEl: HTMLElement;
  private handStatusEl: HTMLElement;

  private floatingTagsContainer: HTMLDivElement;

  constructor(parentEl: HTMLElement) {
    this.container = document.createElement('div');
    this.container.className = 'game-hud-overlay';
    this.container.innerHTML = `
      <!-- Top Track Progress Bar -->
      <div class="hud-top-bar">
        <div class="hud-track-info">
          <span class="track-badge">TRACK</span>
          <span id="hud-track-name" class="track-name">Cyberpunk Neon Pulse</span>
        </div>
        <div id="hud-hand-badge" class="hud-hand-status-badge ready">⚡ RUCE AKTIVNÍ (READY)</div>
        <div class="hud-timeline-wrap">
          <div class="hud-timeline-track">
            <div id="hud-timeline-fill" class="hud-timeline-fill"></div>
          </div>
          <span id="hud-time-display" class="hud-time-display">0:00 / 1:15</span>
        </div>
        <button id="hud-pause-btn" class="hud-icon-btn" title="Pause Game">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="4" width="4" height="16" rx="1"/>
            <rect x="14" y="4" width="4" height="16" rx="1"/>
          </svg>
        </button>
      </div>

      <!-- Center Gameplay Floating Notifiers -->
      <div id="hud-floating-tags" class="hud-floating-tags-container"></div>

      <!-- Bottom Main Telemetry Bar -->
      <div class="hud-bottom-telemetry">
        <!-- Left: Score & Multiplier -->
        <div class="hud-panel hud-panel-left">
          <div class="hud-score-label">SCORE</div>
          <div id="hud-score" class="hud-score-val">0</div>
          <div class="hud-sub-stats">
            <div class="hud-acc-wrap">
              <span class="stat-label">ACCURACY</span>
              <span id="hud-accuracy" class="stat-value">100.0%</span>
            </div>
            <div id="hud-multiplier-pill" class="hud-multiplier-pill">x1</div>
          </div>
        </div>

        <!-- Center: Health / Battery Energy Bar -->
        <div class="hud-panel-center">
          <div class="energy-label">SHIELD ENERGY</div>
          <div class="energy-gauge-bg">
            <div id="hud-health-fill" class="energy-gauge-fill" style="width: 50%;"></div>
            <div class="energy-gauge-ticks"></div>
          </div>
        </div>

        <!-- Right: Combo & Rank -->
        <div class="hud-panel hud-panel-right">
          <div class="combo-label">COMBO STREAK</div>
          <div id="hud-combo" class="combo-value">0</div>
          <div class="hud-rank-wrap">
            <span class="rank-label">CURRENT RANK</span>
            <div id="hud-rank" class="rank-badge rank-s">SSS</div>
          </div>
        </div>
      </div>
    `;

    parentEl.appendChild(this.container);

    this.scoreEl = this.container.querySelector('#hud-score')!;
    this.accuracyEl = this.container.querySelector('#hud-accuracy')!;
    this.multiplierEl = this.container.querySelector('#hud-multiplier-pill')!;
    this.comboEl = this.container.querySelector('#hud-combo')!;
    this.rankEl = this.container.querySelector('#hud-rank')!;
    this.healthBarEl = this.container.querySelector('#hud-health-fill')!;
    this.progressFillEl = this.container.querySelector('#hud-timeline-fill')!;
    this.timeDisplayEl = this.container.querySelector('#hud-time-display')!;
    this.trackTitleEl = this.container.querySelector('#hud-track-name')!;
    this.handStatusEl = this.container.querySelector('#hud-hand-badge')!;
    this.floatingTagsContainer = this.container.querySelector('#hud-floating-tags')!;

    // Listen to game state events
    gameState.setOnStateChange(() => this.updateStateDisplay());
    gameState.setOnHit((hit) => this.showFloatingHitScore(hit));
  }

  public setTrackInfo(title: string) {
    this.trackTitleEl.textContent = title;
  }

  public setOnPause(cb: () => void) {
    const pauseBtn = this.container.querySelector('#hud-pause-btn') as HTMLButtonElement;
    pauseBtn.addEventListener('click', cb);
  }

  public setVisible(visible: boolean) {
    this.container.style.display = visible ? 'flex' : 'none';
  }

  public updateHandStatus(hasHands: boolean) {
    if (this.handStatusEl) {
      const mode = handTracker.getInputMode();
      if (mode === 'TOUCH') {
        this.handStatusEl.textContent = '👆 DOTYKOVÉ OVLÁDÁNÍ';
        this.handStatusEl.className = 'hud-hand-status-badge ready';
      } else if (mode === 'MOUSE') {
        this.handStatusEl.textContent = '🖱 MYŠ AKTIVNÍ';
        this.handStatusEl.className = 'hud-hand-status-badge ready';
      } else if (hasHands) {
        this.handStatusEl.textContent = '⚡ RUCE AKTIVNÍ (READY)';
        this.handStatusEl.className = 'hud-hand-status-badge ready';
      } else {
        this.handStatusEl.textContent = '📷 ZVEDNĚTE RUCE PŘED KAMERU';
        this.handStatusEl.className = 'hud-hand-status-badge waiting';
      }
    }
  }

  public updateTimeline(currentTime: number, duration: number) {
    const progress = Math.min(100, Math.max(0, (currentTime / (duration || 1)) * 100));
    this.progressFillEl.style.width = `${progress.toFixed(1)}%`;

    const formatTime = (secs: number) => {
      const m = Math.floor(secs / 60);
      const s = Math.floor(secs % 60);
      return `${m}:${s < 10 ? '0' : ''}${s}`;
    };

    this.timeDisplayEl.textContent = `${formatTime(currentTime)} / ${formatTime(duration)}`;
  }

  private updateStateDisplay() {
    this.scoreEl.textContent = gameState.score.toLocaleString();
    this.accuracyEl.textContent = `${gameState.getAccuracy().toFixed(1)}%`;

    // Multiplier
    this.multiplierEl.textContent = `x${gameState.multiplier}`;
    this.multiplierEl.className = `hud-multiplier-pill mult-${gameState.multiplier}`;

    // Combo
    this.comboEl.textContent = gameState.combo.toString();
    if (gameState.combo > 0 && gameState.combo % 10 === 0) {
      this.comboEl.classList.remove('pulse-combo');
      void this.comboEl.offsetWidth; // reflow
      this.comboEl.classList.add('pulse-combo');
    }

    // Rank
    const rank = gameState.getRank();
    this.rankEl.textContent = rank;
    this.rankEl.className = `rank-badge rank-${rank.toLowerCase()}`;

    // Health
    const healthPercent = Math.max(0, Math.min(100, gameState.health));
    this.healthBarEl.style.width = `${healthPercent}%`;
    if (healthPercent < 25) {
      this.healthBarEl.classList.add('critical');
    } else {
      this.healthBarEl.classList.remove('critical');
    }
  }

  /**
   * Floating +115 PERFECT / +100 GREAT tag in center screen
   */
  private showFloatingHitScore(hit: HitResult) {
    const tag = document.createElement('div');
    tag.className = `floating-hit-tag hit-${hit.rating.toLowerCase()} color-${hit.color}`;

    const label = hit.rating === 'PERFECT' ? '⚡ 115 PERFECT' : hit.rating === 'GREAT' ? `✨ ${hit.score} GREAT` : `👍 ${hit.score}`;
    tag.textContent = label;

    // Slight random scatter around center
    const rx = (Math.random() - 0.5) * 80;
    const ry = (Math.random() - 0.5) * 40;
    tag.style.transform = `translate(${rx}px, ${ry}px)`;

    this.floatingTagsContainer.appendChild(tag);

    setTimeout(() => {
      tag.classList.add('fade-up');
    }, 10);

    setTimeout(() => {
      if (tag.parentNode) tag.parentNode.removeChild(tag);
    }, 650);
  }
}
