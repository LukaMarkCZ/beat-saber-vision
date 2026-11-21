/**
 * Cyberpunk Main Menu, Track Selection, and Settings Modal
 */

import { PRESET_TRACKS, type SongTrack } from '../audio/beatmaps';
import { handTracker } from '../vision/handTracker';
import { soundSynth } from '../audio/soundSynth';
import { musicEngine } from '../audio/musicEngine';

export class MainMenu {
  private container: HTMLDivElement;
  private selectedTrack: SongTrack = PRESET_TRACKS[0];
  private onStartGameCallback: ((track: SongTrack) => void) | null = null;

  private settingsModal: HTMLDivElement;

  constructor(parentEl: HTMLElement) {
    this.container = document.createElement('div');
    this.container.className = 'main-menu-screen';

    this.container.innerHTML = `
      <div class="menu-content-wrap">
        <!-- Brand Header -->
        <header class="menu-header">
          <div class="brand-title-wrap">
            <h1 class="brand-title">
              <span class="neon-red">BEAT</span> <span class="neon-cyan">SABER</span>
            </h1>
            <div class="brand-subtitle">CYBER VISION // WEBCAM HAND TRACKING</div>
          </div>
          <div class="header-actions">
            <button id="menu-settings-btn" class="cyber-btn-secondary" title="Settings & Calibration">
              ⚙ SETTINGS
            </button>
          </div>
        </header>

        <!-- Input Mode Selection Pill -->
        <div class="input-mode-selector-wrap">
          <span class="selector-label">CONTROL SCHEME:</span>
          <div class="input-mode-tabs">
            <button id="mode-webcam-btn" class="mode-tab-btn active">
              <span class="dot-indicator red"></span>
              WEBCAM HAND TRACKING
            </button>
            <button id="mode-mouse-btn" class="mode-tab-btn">
              <span class="dot-indicator blue"></span>
              MOUSE / TOUCH SABER
            </button>
          </div>
        </div>

        <!-- Track Selection Grid -->
        <div class="tracks-section">
          <div class="section-title-wrap">
            <h2 class="section-title">SELECT TRACK</h2>
            <label class="custom-upload-btn cyber-btn-secondary">
              📁 LOAD CUSTOM AUDIO
              <input id="custom-audio-input" type="file" accept="audio/*" style="display:none" />
            </label>
          </div>

          <div id="tracks-cards-list" class="tracks-cards-list"></div>
        </div>

        <!-- Start Game CTA Button -->
        <footer class="menu-footer">
          <div class="selected-track-summary">
            <span class="summary-label">READY TO SLICE:</span>
            <span id="selected-summary-title" class="summary-title">${this.selectedTrack.title}</span>
            <span id="selected-summary-diff" class="badge-diff diff-normal">${this.selectedTrack.difficulty}</span>
          </div>
          <button id="menu-start-game-btn" class="cyber-btn-primary pulse-btn">
            ⚡ START TRACK
          </button>
        </footer>
      </div>

      <!-- Settings & Calibration Modal -->
      <div id="settings-modal" class="settings-modal-backdrop" style="display: none;">
        <div class="settings-modal-card">
          <div class="modal-header">
            <h3>CALIBRATION & SETTINGS</h3>
            <button id="settings-close-btn" class="close-modal-btn">✕</button>
          </div>
          <div class="settings-body">
            <div class="setting-item">
              <label>Mirror Camera View</label>
              <input id="setting-mirror-chk" type="checkbox" checked />
            </div>
            <div class="setting-item">
              <label>Saber Reach Sensitivity</label>
              <input id="setting-sensitivity-range" type="range" min="1.8" max="4.5" step="0.1" value="3.2" />
              <span id="setting-sensitivity-val">3.2x</span>
            </div>
            <div class="setting-item">
              <label>Music Volume</label>
              <input id="setting-music-vol" type="range" min="0" max="1" step="0.05" value="0.75" />
            </div>
            <div class="setting-item">
              <label>Sound FX Volume</label>
              <input id="setting-sfx-vol" type="range" min="0" max="1" step="0.05" value="0.7" />
            </div>
          </div>
          <div class="modal-footer">
            <button id="settings-save-btn" class="cyber-btn-primary">SAVE & CLOSE</button>
          </div>
        </div>
      </div>
    `;

    parentEl.appendChild(this.container);

    this.settingsModal = this.container.querySelector('#settings-modal')!;

    this.renderTrackCards();
    this.setupEventListeners();
  }

  public setOnStartGame(cb: (track: SongTrack) => void) {
    this.onStartGameCallback = cb;
  }

  public setVisible(visible: boolean) {
    this.container.style.display = visible ? 'flex' : 'none';
  }

  private renderTrackCards() {
    const listEl = this.container.querySelector('#tracks-cards-list')!;
    listEl.innerHTML = '';

    PRESET_TRACKS.forEach((track) => {
      const isSelected = track.id === this.selectedTrack.id;
      const card = document.createElement('div');
      card.className = `track-card ${isSelected ? 'selected' : ''}`;
      card.innerHTML = `
        <div class="card-glow-edge"></div>
        <div class="card-content">
          <div class="card-top">
            <span class="track-bpm">${track.bpm} BPM</span>
            <span class="badge-diff diff-${track.difficulty.toLowerCase()}">${track.difficulty}</span>
          </div>
          <div class="track-info">
            <h3 class="track-card-title">${track.title}</h3>
            <span class="track-card-artist">${track.artist}</span>
          </div>
          <div class="card-meta">
            <span>⏱ ${Math.floor(track.duration / 60)}:${(track.duration % 60).toString().padStart(2, '0')}</span>
            <span>⚡ ${track.notes.length} Notes</span>
          </div>
        </div>
      `;

      card.addEventListener('click', () => {
        soundSynth.playClick();
        this.selectedTrack = track;
        this.renderTrackCards();
        this.updateSelectedSummary();
      });

      listEl.appendChild(card);
    });
  }

  private updateSelectedSummary() {
    const titleEl = this.container.querySelector('#selected-summary-title')!;
    const diffEl = this.container.querySelector('#selected-summary-diff')!;
    titleEl.textContent = this.selectedTrack.title;
    diffEl.textContent = this.selectedTrack.difficulty;
    diffEl.className = `badge-diff diff-${this.selectedTrack.difficulty.toLowerCase()}`;
  }

  private setupEventListeners() {
    // Mode toggles
    const webcamBtn = this.container.querySelector('#mode-webcam-btn') as HTMLButtonElement;
    const mouseBtn = this.container.querySelector('#mode-mouse-btn') as HTMLButtonElement;

    webcamBtn.addEventListener('click', () => {
      soundSynth.playClick();
      handTracker.setInputMode('WEBCAM');
      webcamBtn.classList.add('active');
      mouseBtn.classList.remove('active');
    });

    mouseBtn.addEventListener('click', () => {
      soundSynth.playClick();
      handTracker.setInputMode('MOUSE');
      mouseBtn.classList.add('active');
      webcamBtn.classList.remove('active');
    });

    // Custom audio file upload
    const customInput = this.container.querySelector('#custom-audio-input') as HTMLInputElement;
    customInput.addEventListener('change', async () => {
      if (customInput.files && customInput.files[0]) {
        const file = customInput.files[0];
        try {
          const track = await musicEngine.loadCustomAudioFile(file);
          this.selectedTrack = track;
          this.updateSelectedSummary();
          soundSynth.playComboMilestone(2);
        } catch (e) {
          console.error('Failed to load custom audio:', e);
          alert('Could not load this audio file. Please try a valid MP3, WAV or OGG.');
        }
      }
    });

    // Start Game CTA
    const startBtn = this.container.querySelector('#menu-start-game-btn') as HTMLButtonElement;
    startBtn.addEventListener('click', () => {
      soundSynth.init();
      soundSynth.playClick();
      if (this.onStartGameCallback) {
        this.onStartGameCallback(this.selectedTrack);
      }
    });

    // Settings Modal
    const settingsBtn = this.container.querySelector('#menu-settings-btn') as HTMLButtonElement;
    const closeBtn = this.container.querySelector('#settings-close-btn') as HTMLButtonElement;
    const saveBtn = this.container.querySelector('#settings-save-btn') as HTMLButtonElement;

    const openSettings = () => {
      soundSynth.playClick();
      this.settingsModal.style.display = 'flex';
    };
    const closeSettings = () => {
      soundSynth.playClick();
      this.settingsModal.style.display = 'none';
    };

    settingsBtn.addEventListener('click', openSettings);
    closeBtn.addEventListener('click', closeSettings);
    saveBtn.addEventListener('click', closeSettings);

    // Settings controls
    const mirrorChk = this.container.querySelector('#setting-mirror-chk') as HTMLInputElement;
    mirrorChk.addEventListener('change', () => {
      handTracker.setMirror(mirrorChk.checked);
    });

    const sensRange = this.container.querySelector('#setting-sensitivity-range') as HTMLInputElement;
    const sensVal = this.container.querySelector('#setting-sensitivity-val') as HTMLSpanElement;
    sensRange.addEventListener('input', () => {
      const val = parseFloat(sensRange.value);
      handTracker.sensitivityX = val;
      handTracker.sensitivityY = val * 0.75;
      sensVal.textContent = `${val.toFixed(1)}x`;
    });

    const musicVol = this.container.querySelector('#setting-music-vol') as HTMLInputElement;
    musicVol.addEventListener('input', () => {
      musicEngine.setVolume(parseFloat(musicVol.value));
    });

    const sfxVol = this.container.querySelector('#setting-sfx-vol') as HTMLInputElement;
    sfxVol.addEventListener('input', () => {
      soundSynth.setVolume(parseFloat(sfxVol.value));
    });
  }
}
