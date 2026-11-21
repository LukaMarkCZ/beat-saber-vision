/**
 * Pause, Game Over, and Track Victory Summary Overlays
 */

import { gameState } from '../game/gameState';
import { soundSynth } from '../audio/soundSynth';

export class PauseOverlay {
  private container: HTMLDivElement;
  private pauseModal: HTMLDivElement;
  private gameOverModal: HTMLDivElement;
  private victoryModal: HTMLDivElement;

  private onResumeCb: (() => void) | null = null;
  private onRestartCb: (() => void) | null = null;
  private onMenuCb: (() => void) | null = null;

  constructor(parentEl: HTMLElement) {
    this.container = document.createElement('div');
    this.container.className = 'overlay-manager';

    this.container.innerHTML = `
      <!-- Pause Modal -->
      <div id="modal-pause" class="cyber-modal-backdrop" style="display: none;">
        <div class="cyber-modal-card">
          <h2 class="modal-title neon-cyan">TRACK PAUSED</h2>
          <div class="modal-actions">
            <button id="btn-pause-resume" class="cyber-btn-primary">RESUME SLICING</button>
            <button id="btn-pause-restart" class="cyber-btn-secondary">RESTART TRACK</button>
            <button id="btn-pause-menu" class="cyber-btn-secondary">QUIT TO MENU</button>
          </div>
        </div>
      </div>

      <!-- Game Over Modal -->
      <div id="modal-gameover" class="cyber-modal-backdrop" style="display: none;">
        <div class="cyber-modal-card failure-card">
          <div class="glitch-title neon-red">SHIELD DEPLETED</div>
          <p class="modal-sub">Your laser shield ran out of energy. Calibrate your hands and try again!</p>
          <div class="gameover-stats">
            <div>Score: <span id="gameover-score">0</span></div>
            <div>Max Combo: <span id="gameover-combo">0</span></div>
          </div>
          <div class="modal-actions">
            <button id="btn-gameover-restart" class="cyber-btn-primary">TRY AGAIN</button>
            <button id="btn-gameover-menu" class="cyber-btn-secondary">CHOOSE ANOTHER TRACK</button>
          </div>
        </div>
      </div>

      <!-- Victory Recap Modal -->
      <div id="modal-victory" class="cyber-modal-backdrop" style="display: none;">
        <div class="cyber-modal-card victory-card">
          <div class="victory-header">
            <span class="victory-tag">TRACK COMPLETED</span>
            <div id="victory-rank-badge" class="rank-large-badge">SSS</div>
          </div>

          <div class="victory-main-score">
            <span class="score-sub">FINAL SCORE</span>
            <span id="victory-final-score" class="score-num">1,480,250</span>
          </div>

          <div class="victory-stats-grid">
            <div class="stat-box">
              <span class="box-label">ACCURACY</span>
              <span id="victory-accuracy" class="box-val">98.4%</span>
            </div>
            <div class="stat-box">
              <span class="box-label">MAX COMBO</span>
              <span id="victory-max-combo" class="box-val">142</span>
            </div>
            <div class="stat-box">
              <span class="box-label">PERFECT CUTS</span>
              <span id="victory-perfect" class="box-val text-cyan">94</span>
            </div>
            <div class="stat-box">
              <span class="box-label">MISSED</span>
              <span id="victory-missed" class="box-val text-red">2</span>
            </div>
          </div>

          <div class="modal-actions">
            <button id="btn-victory-restart" class="cyber-btn-primary">PLAY AGAIN</button>
            <button id="btn-victory-menu" class="cyber-btn-secondary">SONG SELECT</button>
          </div>
        </div>
      </div>
    `;

    parentEl.appendChild(this.container);

    this.pauseModal = this.container.querySelector('#modal-pause')!;
    this.gameOverModal = this.container.querySelector('#modal-gameover')!;
    this.victoryModal = this.container.querySelector('#modal-victory')!;

    this.setupListeners();
  }

  public setCallbacks(onResume: () => void, onRestart: () => void, onMenu: () => void) {
    this.onResumeCb = onResume;
    this.onRestartCb = onRestart;
    this.onMenuCb = onMenu;
  }

  public showPause() {
    this.hideAll();
    this.pauseModal.style.display = 'flex';
  }

  public showGameOver() {
    this.hideAll();
    const scoreEl = this.container.querySelector('#gameover-score')!;
    const comboEl = this.container.querySelector('#gameover-combo')!;
    scoreEl.textContent = gameState.score.toLocaleString();
    comboEl.textContent = gameState.maxCombo.toString();

    this.gameOverModal.style.display = 'flex';
  }

  public showVictory() {
    this.hideAll();
    const rankEl = this.container.querySelector('#victory-rank-badge')!;
    const scoreEl = this.container.querySelector('#victory-final-score')!;
    const accEl = this.container.querySelector('#victory-accuracy')!;
    const comboEl = this.container.querySelector('#victory-max-combo')!;
    const perfEl = this.container.querySelector('#victory-perfect')!;
    const missEl = this.container.querySelector('#victory-missed')!;

    const rank = gameState.getRank();
    rankEl.textContent = rank;
    rankEl.className = `rank-large-badge rank-${rank.toLowerCase()}`;

    scoreEl.textContent = gameState.score.toLocaleString();
    accEl.textContent = `${gameState.getAccuracy().toFixed(1)}%`;
    comboEl.textContent = gameState.maxCombo.toString();
    perfEl.textContent = gameState.perfectCuts.toString();
    missEl.textContent = gameState.missedNotes.toString();

    soundSynth.playComboMilestone(4);
    this.victoryModal.style.display = 'flex';
  }

  public hideAll() {
    this.pauseModal.style.display = 'none';
    this.gameOverModal.style.display = 'none';
    this.victoryModal.style.display = 'none';
  }

  private setupListeners() {
    // Pause buttons
    this.container.querySelector('#btn-pause-resume')?.addEventListener('click', () => {
      soundSynth.playClick();
      this.hideAll();
      if (this.onResumeCb) this.onResumeCb();
    });

    this.container.querySelector('#btn-pause-restart')?.addEventListener('click', () => {
      soundSynth.playClick();
      this.hideAll();
      if (this.onRestartCb) this.onRestartCb();
    });

    this.container.querySelector('#btn-pause-menu')?.addEventListener('click', () => {
      soundSynth.playClick();
      this.hideAll();
      if (this.onMenuCb) this.onMenuCb();
    });

    // Game Over buttons
    this.container.querySelector('#btn-gameover-restart')?.addEventListener('click', () => {
      soundSynth.playClick();
      this.hideAll();
      if (this.onRestartCb) this.onRestartCb();
    });

    this.container.querySelector('#btn-gameover-menu')?.addEventListener('click', () => {
      soundSynth.playClick();
      this.hideAll();
      if (this.onMenuCb) this.onMenuCb();
    });

    // Victory buttons
    this.container.querySelector('#btn-victory-restart')?.addEventListener('click', () => {
      soundSynth.playClick();
      this.hideAll();
      if (this.onRestartCb) this.onRestartCb();
    });

    this.container.querySelector('#btn-victory-menu')?.addEventListener('click', () => {
      soundSynth.playClick();
      this.hideAll();
      if (this.onMenuCb) this.onMenuCb();
    });
  }
}
