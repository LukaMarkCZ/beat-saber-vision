/**
 * Music Engine with Synthesized Electronic Tracker, Custom Audio Loader, and FFT Analyser
 */

import { soundSynth } from './soundSynth';
import { generateProceduralBeatmap, type SongTrack } from './beatmaps';

export interface AudioBands {
  subBass: number;
  bass: number;
  mid: number;
  treble: number;
  isBeat: boolean;
  rawFrequencies: Uint8Array;
}

export class MusicEngine {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private masterGain: GainNode | null = null;
  private freqData: Uint8Array = new Uint8Array(128);
  private history: number[] = [];

  private isPlaying = false;
  private startTime = 0;
  private pauseOffset = 0;
  private currentTrack: SongTrack | null = null;

  // Custom audio element mode
  private customAudio: HTMLAudioElement | null = null;
  private customSource: MediaElementAudioSourceNode | null = null;

  // Synthesized tracker scheduler timer
  private synthTimer: number | null = null;
  private nextBeatIndex = 0;
  private volume = 0.75;

  constructor() {
    // Lazy initialized
  }

  private initAudio() {
    if (!this.ctx) {
      this.ctx = soundSynth.getAudioContext() || new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.8;

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);

      this.analyser.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);

      this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    }
    if (this.customAudio) {
      this.customAudio.volume = this.volume;
    }
  }

  public getCurrentTime(): number {
    if (!this.isPlaying) return this.pauseOffset;
    if (this.customAudio) {
      return this.customAudio.currentTime;
    }
    if (this.ctx) {
      return this.ctx.currentTime - this.startTime + this.pauseOffset;
    }
    return 0;
  }

  public getDuration(): number {
    if (this.customAudio && !isNaN(this.customAudio.duration)) {
      return this.customAudio.duration;
    }
    return this.currentTrack ? this.currentTrack.duration : 60;
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  public playTrack(track: SongTrack) {
    this.initAudio();
    this.stop();

    this.currentTrack = track;
    this.isPlaying = true;
    this.startTime = this.ctx!.currentTime;
    this.pauseOffset = 0;
    this.nextBeatIndex = 0;

    // Start procedural synth tracker loop
    this.scheduleSynthBeats();
  }

  /** Load and play custom user audio file */
  public async loadCustomAudioFile(file: File): Promise<SongTrack> {
    this.initAudio();
    this.stop();

    const objectUrl = URL.createObjectURL(file);
    const audio = new Audio();
    audio.src = objectUrl;
    audio.crossOrigin = 'anonymous';
    audio.volume = this.volume;

    await new Promise<void>((resolve, reject) => {
      audio.onloadedmetadata = () => resolve();
      audio.onerror = (e) => reject(e);
    });

    if (!this.customSource && this.analyser) {
      this.customSource = this.ctx!.createMediaElementSource(audio);
      this.customSource.connect(this.analyser);
    }

    this.customAudio = audio;

    // Estimate BPM or use 128 as fallback
    const estimatedBpm = 125;
    const duration = audio.duration || 60;

    const track: SongTrack = {
      id: 'custom-' + Date.now(),
      title: file.name.replace(/\.[^/.]+$/, ''),
      artist: 'Custom Audio',
      bpm: estimatedBpm,
      difficulty: 'NORMAL',
      duration: duration,
      speed: 21,
      notes: generateProceduralBeatmap(estimatedBpm, duration, 'NORMAL')
    };

    this.currentTrack = track;
    return track;
  }

  public play() {
    this.initAudio();
    if (this.isPlaying) return;
    this.isPlaying = true;

    if (this.customAudio) {
      this.customAudio.play();
    } else {
      this.startTime = this.ctx!.currentTime;
      this.scheduleSynthBeats();
    }
  }

  public pause() {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    this.pauseOffset = this.getCurrentTime();

    if (this.customAudio) {
      this.customAudio.pause();
    }
    if (this.synthTimer) {
      clearTimeout(this.synthTimer);
      this.synthTimer = null;
    }
  }

  public stop() {
    this.isPlaying = false;
    this.pauseOffset = 0;
    this.nextBeatIndex = 0;

    if (this.customAudio) {
      this.customAudio.pause();
      this.customAudio.currentTime = 0;
    }
    if (this.synthTimer) {
      clearTimeout(this.synthTimer);
      this.synthTimer = null;
    }
  }

  /**
   * Procedural Cyberpunk Synthesizer:
   * Generates Kick, Snare, Hi-hats, Bassline, and Melody on the fly!
   */
  private scheduleSynthBeats() {
    if (!this.isPlaying || !this.ctx || !this.currentTrack || this.customAudio) return;

    const bpm = this.currentTrack.bpm;
    const beatInterval = 60 / bpm;
    const sixteenthInterval = beatInterval / 4;
    const lookahead = 0.2; // seconds

    const currentTime = this.getCurrentTime();

    while (this.nextBeatIndex * sixteenthInterval < currentTime + lookahead) {
      const beatTime = this.startTime - this.pauseOffset + this.nextBeatIndex * sixteenthInterval;
      if (beatTime >= this.ctx.currentTime) {
        this.renderSynthStep(this.nextBeatIndex, beatTime);
      }
      this.nextBeatIndex++;
    }

    if (currentTime >= this.currentTrack.duration) {
      this.stop();
      return;
    }

    this.synthTimer = window.setTimeout(() => this.scheduleSynthBeats(), 50);
  }

  private renderSynthStep(stepIndex: number, time: number) {
    if (!this.ctx || !this.analyser) return;

    const stepInBar = stepIndex % 16;
    const barIndex = Math.floor(stepIndex / 16);

    // 1. Kick drum on 0, 4, 8, 12 (4-on-the-floor beat)
    if (stepInBar % 4 === 0) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(140, time);
      osc.frequency.exponentialRampToValueAtTime(38, time + 0.12);

      gain.gain.setValueAtTime(0.7, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.14);

      osc.connect(gain);
      gain.connect(this.analyser);
      osc.start(time);
      osc.stop(time + 0.15);
    }

    // 2. Snare / Clap on beats 4 and 12
    if (stepInBar === 4 || stepInBar === 12) {
      // Noise burst
      const bufSize = Math.floor(this.ctx.sampleRate * 0.12);
      const buffer = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufSize * 0.3));

      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(900, time);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.3, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.analyser);

      noise.start(time);
      noise.stop(time + 0.13);
    }

    // 3. Hi-hat on offbeats (2, 6, 10, 14) and 16ths
    if (stepInBar % 2 === 0) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(8000, time);

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(6500, time);

      const isAccent = stepInBar % 4 === 2;
      gain.gain.setValueAtTime(isAccent ? 0.08 : 0.035, time);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.04);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.analyser);

      osc.start(time);
      osc.stop(time + 0.045);
    }

    // 4. Synthwave Arpeggio Bassline (16th note rolls)
    // Scale: D minor [D2, F2, G2, A2, C3]
    const rootD = 73.42; // D2
    const f2 = 87.31;
    const g2 = 98.00;
    const a2 = 110.00;
    const c3 = 130.81;
    const bassNotes = [rootD, rootD, f2, rootD, g2, rootD, a2, c3];
    const bassPitch = bassNotes[stepInBar % 8] * (barIndex % 4 === 3 ? 1.189 : 1.0); // chord shift

    const bassOsc = this.ctx.createOscillator();
    const bassFilter = this.ctx.createBiquadFilter();
    const bassGain = this.ctx.createGain();

    bassOsc.type = 'sawtooth';
    bassOsc.frequency.setValueAtTime(bassPitch, time);

    bassFilter.type = 'lowpass';
    bassFilter.frequency.setValueAtTime(450 + (stepInBar % 4) * 200, time);
    bassFilter.Q.value = 4.0;

    bassGain.gain.setValueAtTime(0.25, time);
    bassGain.gain.exponentialRampToValueAtTime(0.001, time + 0.11);

    bassOsc.connect(bassFilter);
    bassFilter.connect(bassGain);
    bassGain.connect(this.analyser);

    bassOsc.start(time);
    bassOsc.stop(time + 0.12);

    // 5. Synth Lead Chords on bar boundaries
    if (stepInBar === 0 && barIndex >= 2) {
      const chords = [
        [293.66, 349.23, 440.00], // Dm (D4, F4, A4)
        [261.63, 329.63, 392.00], // C (C4, E4, G4)
        [246.94, 311.13, 369.99], // Bb (Bb3, D4, F4)
        [220.00, 277.18, 329.63]  // A (A3, C#4, E4)
      ];
      const chord = chords[barIndex % chords.length];

      chord.forEach((freq) => {
        if (!this.ctx || !this.analyser) return;
        const leadOsc = this.ctx.createOscillator();
        const leadGain = this.ctx.createGain();
        leadOsc.type = 'sawtooth';
        leadOsc.frequency.setValueAtTime(freq, time);

        leadGain.gain.setValueAtTime(0.045, time);
        leadGain.gain.exponentialRampToValueAtTime(0.0001, time + 1.8);

        leadOsc.connect(leadGain);
        leadGain.connect(this.analyser);

        leadOsc.start(time);
        leadOsc.stop(time + 1.9);
      });
    }
  }

  /**
   * Real-time FFT Frequency Data for 3D visual reactivity
   */
  public getBands(): AudioBands {
    if (!this.analyser) {
      return {
        subBass: 0,
        bass: 0,
        mid: 0,
        treble: 0,
        isBeat: false,
        rawFrequencies: this.freqData
      };
    }

    this.analyser.getByteFrequencyData(this.freqData as any);

    const getAverage = (startBin: number, endBin: number) => {
      let sum = 0;
      for (let i = startBin; i <= endBin; i++) sum += this.freqData[i];
      return sum / (endBin - startBin + 1) / 255;
    };

    const subBass = getAverage(1, 4);
    const bass = getAverage(5, 14);
    const mid = getAverage(15, 60);
    const treble = getAverage(61, 110);

    // Peak beat detection
    let isBeat = false;
    const currentBass = (subBass * 1.2 + bass) / 2;
    this.history.push(currentBass);
    if (this.history.length > 30) this.history.shift();

    const avgHistory = this.history.reduce((a, b) => a + b, 0) / this.history.length;
    if (currentBass > avgHistory * 1.35 && currentBass > 0.42) {
      isBeat = true;
    }

    return {
      subBass,
      bass,
      mid,
      treble,
      isBeat,
      rawFrequencies: this.freqData
    };
  }
}

export const musicEngine = new MusicEngine();
