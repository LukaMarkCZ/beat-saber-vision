/**
 * Beat Saber Vision - Main Application Orchestrator
 */

import { WorldEnvironment } from './game/worldEnvironment';
import { ParticleSystem } from './game/particleSystem';
import { SaberManager } from './game/saberManager';
import { CubeManager } from './game/cubeManager';
import { BombManager } from './game/bombManager';
import { handTracker } from './vision/handTracker';
import { CameraPreview } from './vision/cameraPreview';
import { musicEngine } from './audio/musicEngine';
import { soundSynth } from './audio/soundSynth';
import { gameState } from './game/gameState';
import { GameHUD } from './ui/hud';
import { MainMenu } from './ui/menu';
import { PauseOverlay } from './ui/pauseOverlay';
import { type SongTrack, PRESET_TRACKS } from './audio/beatmaps';

export type AppState = 'MENU' | 'PLAYING' | 'PAUSED' | 'GAMEOVER' | 'VICTORY';

class BeatSaberApp {
  private appState: AppState = 'MENU';
  private currentTrack: SongTrack = PRESET_TRACKS[0];

  // Game Systems
  private world: WorldEnvironment;
  private particleSystem: ParticleSystem;
  private saberManager: SaberManager;
  private cubeManager: CubeManager;
  private bombManager: BombManager;

  // Vision & UI
  private cameraPreview: CameraPreview;
  private hud: GameHUD;
  private menu: MainMenu;
  private overlay: PauseOverlay;

  // Loop timing
  private lastTime = 0;
  private appRoot: HTMLElement;

  constructor() {
    this.appRoot = document.getElementById('app')!;
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    const video = document.getElementById('webcam-video') as HTMLVideoElement;

    // 1. Initialize 3D Engine & Systems
    this.world = new WorldEnvironment(canvas);
    this.particleSystem = new ParticleSystem(800);
    this.world.scene.add(this.particleSystem.mesh);

    this.saberManager = new SaberManager(this.world.scene);
    this.cubeManager = new CubeManager(this.world.scene, this.particleSystem);
    this.bombManager = new BombManager(this.world.scene, this.particleSystem);

    // 2. Initialize Camera Preview & Vision
    this.cameraPreview = new CameraPreview(this.appRoot);

    // Initialize webcam in background
    handTracker.initWebcam(video).then((hasWebcam) => {
      console.log('Webcam initialization status:', hasWebcam ? 'Ready' : 'Fallback to Mouse mode');
    });

    // 3. Initialize UI Components
    this.hud = new GameHUD(this.appRoot);
    this.hud.setVisible(false);

    this.menu = new MainMenu(this.appRoot);
    this.overlay = new PauseOverlay(this.appRoot);

    // 4. Connect Event Handlers
    this.setupEventHandlers();

    // 5. Start Render & Game Loop
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.gameLoop(t));
  }

  private setupEventHandlers() {
    // Menu: Start Game
    this.menu.setOnStartGame((track) => {
      this.startGame(track);
    });

    this.menu.onSpeedChange = (mult: number) => {
      this.cubeManager.speedMultiplier = mult;
    };

    // HUD: Pause
    this.hud.setOnPause(() => {
      this.pauseGame();
    });

    // Overlay buttons: Resume, Restart, Menu
    this.overlay.setCallbacks(
      () => this.resumeGame(),
      () => this.restartGame(),
      () => this.quitToMenu()
    );

    // Keyboard shortcuts: ESC or Space to pause
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' || e.code === 'Space') {
        if (this.appState === 'PLAYING') {
          this.pauseGame();
        } else if (this.appState === 'PAUSED') {
          this.resumeGame();
        }
      }
    });
  }

  private startGame(track: SongTrack) {
    this.currentTrack = track;
    this.appState = 'PLAYING';

    gameState.reset();
    this.hud.setTrackInfo(track.title);
    this.hud.setVisible(true);
    this.menu.setVisible(false);
    this.overlay.hideAll();

    this.cubeManager.setNotes(track.notes, track.speed);
    this.bombManager.setNotes(track.notes, track.speed);

    musicEngine.playTrack(track);
  }

  private pauseGame() {
    if (this.appState !== 'PLAYING') return;
    this.appState = 'PAUSED';
    musicEngine.pause();
    this.overlay.showPause();
  }

  private resumeGame() {
    if (this.appState !== 'PAUSED') return;
    this.appState = 'PLAYING';
    this.overlay.hideAll();
    musicEngine.play();
  }

  private restartGame() {
    this.cubeManager.clearAll();
    this.bombManager.clearAll();
    this.startGame(this.currentTrack);
  }

  private quitToMenu() {
    this.appState = 'MENU';
    musicEngine.stop();
    this.cubeManager.clearAll();
    this.bombManager.clearAll();

    this.hud.setVisible(false);
    this.overlay.hideAll();
    this.menu.setVisible(true);
  }

  private gameLoop(timestamp: number) {
    requestAnimationFrame((t) => this.gameLoop(t));

    const dt = Math.min(0.1, (timestamp - this.lastTime) / 1000);
    this.lastTime = timestamp;
    const timeSec = timestamp / 1000;

    // 1. Audio bands & beat reactivity
    const audioBands = musicEngine.getBands();

    // 2. 3D World background animation
    this.world.update(timeSec, dt, audioBands);

    // 3. Laser Sabers tracking update
    this.saberManager.update(dt);

    // 4. Gameplay Logic
    if (this.appState === 'PLAYING') {
      const songTime = musicEngine.getCurrentTime();
      const songDuration = musicEngine.getDuration();

      // Update notes and bombs
      this.cubeManager.update(songTime, dt, this.saberManager);
      this.bombManager.update(songTime, dt, this.saberManager);

      // Update HUD progress bar
      this.hud.updateTimeline(songTime, songDuration);

      // Check Game Over (health <= 0)
      if (gameState.isGameOver) {
        this.appState = 'GAMEOVER';
        musicEngine.stop();
        soundSynth.playBomb();
        this.overlay.showGameOver();
      }

      // Check Track Victory (song finished)
      if (songTime >= songDuration && songDuration > 0) {
        this.appState = 'VICTORY';
        musicEngine.stop();
        this.overlay.showVictory();
      }
    }

    // 5. Particles update
    this.particleSystem.update(dt);

    // 6. PIP Camera Preview update
    this.cameraPreview.render();

    // 7. Render 3D Scene with Bloom postprocessing
    this.world.render();
  }
}

// Start application on page load
window.addEventListener('DOMContentLoaded', () => {
  new BeatSaberApp();
});
