/**
 * Web Audio API Sound Effects Synthesizer for Beat Saber
 * Zero external audio files required - ultra-low latency synthesized audio.
 */

export class SoundSynth {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxVolume = 0.7;

  constructor() {
    // Lazily initialized on first user gesture
  }

  public init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.sfxVolume, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public setVolume(volume: number) {
    this.sfxVolume = Math.max(0, Math.min(1, volume));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.sfxVolume, this.ctx.currentTime);
    }
  }

  public getAudioContext(): AudioContext | null {
    this.init();
    return this.ctx;
  }

  /**
   * Crisp, satisfying laser slice impact sound
   * @param color 'red' or 'blue' (different harmonic pitch)
   * @param isGoodCut whether slice direction and saber color matched
   */
  public playSlice(color: 'red' | 'blue' = 'blue', isGoodCut = true) {
    this.init();
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    const baseFreq = color === 'red' ? (isGoodCut ? 580 : 320) : (isGoodCut ? 720 : 380);

    // 1. High crisp laser transient (metallic blade impact)
    const osc1 = this.ctx.createOscillator();
    const gain1 = this.ctx.createGain();
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(baseFreq * 2.2, now);
    osc1.frequency.exponentialRampToValueAtTime(baseFreq * 0.4, now + 0.08);

    gain1.gain.setValueAtTime(isGoodCut ? 0.35 : 0.18, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc1.connect(gain1);
    gain1.connect(this.masterGain);
    osc1.start(now);
    osc1.stop(now + 0.09);

    // 2. Punchy body thud
    const osc2 = this.ctx.createOscillator();
    const gain2 = this.ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(190, now);
    osc2.frequency.exponentialRampToValueAtTime(45, now + 0.12);

    gain2.gain.setValueAtTime(isGoodCut ? 0.45 : 0.25, now);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc2.connect(gain2);
    gain2.connect(this.masterGain);
    osc2.start(now);
    osc2.stop(now + 0.13);

    // 3. Harmonic chime if perfect cut
    if (isGoodCut) {
      const chimeFreq = color === 'red' ? 1046.5 : 1318.51; // C6 or E6
      const osc3 = this.ctx.createOscillator();
      const gain3 = this.ctx.createGain();
      osc3.type = 'sine';
      osc3.frequency.setValueAtTime(chimeFreq, now);

      gain3.gain.setValueAtTime(0.12, now);
      gain3.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

      osc3.connect(gain3);
      gain3.connect(this.masterGain);
      osc3.start(now);
      osc3.stop(now + 0.19);
    }
  }

  /**
   * Air slicing swoosh when waving the saber fast
   */
  public playWhoosh(speedRatio = 0.5) {
    this.init();
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    const startF = 180 + speedRatio * 320;
    osc.frequency.setValueAtTime(startF, now);
    osc.frequency.exponentialRampToValueAtTime(70, now + 0.14);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(startF * 1.5, now);
    filter.Q.value = 3.0;

    const vol = Math.min(0.25, 0.06 + speedRatio * 0.18);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.linearRampToValueAtTime(0.001, now + 0.14);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.15);
  }

  /**
   * Bomb explosion sound
   */
  public playBomb() {
    this.init();
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;

    // Distorted noise burst
    const bufferSize = this.ctx.sampleRate * 0.4;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.08));
    }

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, now);
    filter.frequency.exponentialRampToValueAtTime(60, now + 0.35);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.6, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

    whiteNoise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    whiteNoise.start(now);
    whiteNoise.stop(now + 0.4);

    // Heavy low sub kick
    const subOsc = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(130, now);
    subOsc.frequency.exponentialRampToValueAtTime(30, now + 0.35);

    subGain.gain.setValueAtTime(0.7, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    subOsc.connect(subGain);
    subGain.connect(this.masterGain);
    subOsc.start(now);
    subOsc.stop(now + 0.36);
  }

  /**
   * Dull miss thud / missed note sound
   */
  public playMiss() {
    this.init();
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.15);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.16);
  }

  /**
   * Combo streak achievement chime (10x, 25x, 50x, 100x)
   */
  public playComboMilestone(tier = 1) {
    this.init();
    if (!this.ctx || !this.masterGain) return;

    const baseNotes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    const multiplier = tier >= 4 ? 1.5 : tier >= 3 ? 1.25 : 1.0;

    baseNotes.forEach((freq, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const startT = this.ctx.currentTime + idx * 0.055;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq * multiplier, startT);

      gain.gain.setValueAtTime(0.15, startT);
      gain.gain.exponentialRampToValueAtTime(0.0001, startT + 0.28);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(startT);
      osc.stop(startT + 0.3);
    });
  }

  /**
   * UI tactile click
   */
  public playClick() {
    this.init();
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.03);

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.035);
  }
}

export const soundSynth = new SoundSynth();
