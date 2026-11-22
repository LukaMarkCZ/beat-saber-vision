/**
 * Beatmap definitions and Musical Track Generator
 * 
 * Generates beat-quantized note patterns with natural hand flow:
 * - Notes land on actual musical beats (quantized to beat grid)
 * - Alternating left/right in musical phrases
 * - Difficulty ramp within each song (intro → build → peak → cooldown)
 * - Ergonomic hand movement patterns that feel good to play
 */

export type CutDirection = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT' | 'ANY';
export type NoteType = 'red' | 'blue' | 'bomb';

export interface BeatNote {
  time: number;          // Target arrival time at player in seconds
  lineIndex: number;     // 0, 1, 2, 3 (horizontal column)
  lineLayer: number;     // 0 = bottom, 1 = top
  type: NoteType;        // 'red' | 'blue' | 'bomb'
  cutDirection: CutDirection;
}

export interface ObstacleWall {
  time: number;
  duration: number;
  lineIndex: number;     // 0 or 2
  width: number;         // 1 or 2
}

export interface SongTrack {
  id: string;
  title: string;
  artist: string;
  bpm: number;
  difficulty: 'EASY' | 'NORMAL' | 'EXPERT';
  duration: number;      // in seconds
  speed: number;         // travel velocity towards player
  notes: BeatNote[];
  obstacles?: ObstacleWall[];
}

// ============================================================
//  MUSICAL PATTERNS — ergonomic hand flow sequences
// ============================================================

/** Pre-designed note patterns that feel musical and natural to play */
interface Pattern {
  name: string;
  /** Array of [beatOffset, lineIndex, lineLayer, type, cutDirection] */
  notes: [number, number, number, NoteType, CutDirection][];
}

// All patterns assume: Red = lanes 0-1 (left), Blue = lanes 2-3 (right)

const ALTERNATING_DOWN_UP: Pattern = {
  name: 'alt-down-up',
  notes: [
    [0,   1, 0, 'red',  'DOWN'],
    [1,   2, 0, 'blue', 'DOWN'],
    [2,   1, 1, 'red',  'UP'],
    [3,   2, 1, 'blue', 'UP'],
  ]
};

const DOUBLE_HIT_DOWN: Pattern = {
  name: 'double-down',
  notes: [
    [0, 0, 0, 'red',  'DOWN'],
    [0, 3, 0, 'blue', 'DOWN'],
  ]
};

const DOUBLE_HIT_UP: Pattern = {
  name: 'double-up',
  notes: [
    [0, 0, 1, 'red',  'UP'],
    [0, 3, 1, 'blue', 'UP'],
  ]
};

const INWARD_SLASH: Pattern = {
  name: 'inward',
  notes: [
    [0, 1, 1, 'red',  'RIGHT'],
    [0, 2, 1, 'blue', 'LEFT'],
  ]
};

const OUTWARD_SLASH: Pattern = {
  name: 'outward',
  notes: [
    [0, 0, 1, 'red',  'LEFT'],
    [0, 3, 1, 'blue', 'RIGHT'],
  ]
};

const QUICK_BURST_RED: Pattern = {
  name: 'burst-red',
  notes: [
    [0,   1, 0, 'red', 'DOWN'],
    [0.5, 0, 1, 'red', 'UP'],
    [1,   1, 0, 'red', 'DOWN'],
  ]
};

const QUICK_BURST_BLUE: Pattern = {
  name: 'burst-blue',
  notes: [
    [0,   2, 0, 'blue', 'DOWN'],
    [0.5, 3, 1, 'blue', 'UP'],
    [1,   2, 0, 'blue', 'DOWN'],
  ]
};

const WAVE_PATTERN: Pattern = {
  name: 'wave',
  notes: [
    [0,   0, 0, 'red',  'DOWN'],
    [1,   1, 1, 'red',  'UP'],
    [2,   2, 1, 'blue', 'UP'],
    [3,   3, 0, 'blue', 'DOWN'],
  ]
};

const CROSS_HANDS: Pattern = {
  name: 'cross',
  notes: [
    [0, 2, 0, 'red',  'DOWN'],  // Red on blue side
    [0, 1, 0, 'blue', 'DOWN'],  // Blue on red side
  ]
};

const STAIRCASE_UP: Pattern = {
  name: 'staircase-up',
  notes: [
    [0, 0, 0, 'red',  'UP'],
    [1, 1, 0, 'blue', 'UP'],
    [2, 2, 1, 'red',  'UP'],
    [3, 3, 1, 'blue', 'UP'],
  ]
};

const FLICK_PATTERN: Pattern = {
  name: 'flick',
  notes: [
    [0,   1, 0, 'red',  'ANY'],
    [0.5, 2, 0, 'blue', 'ANY'],
    [1,   1, 1, 'red',  'ANY'],
    [1.5, 2, 1, 'blue', 'ANY'],
  ]
};

// Difficulty-based pattern pools
const EASY_PATTERNS = [
  ALTERNATING_DOWN_UP,
  DOUBLE_HIT_DOWN,
  DOUBLE_HIT_UP,
  FLICK_PATTERN,
];

const NORMAL_PATTERNS = [
  ALTERNATING_DOWN_UP,
  DOUBLE_HIT_DOWN,
  DOUBLE_HIT_UP,
  INWARD_SLASH,
  OUTWARD_SLASH,
  WAVE_PATTERN,
  FLICK_PATTERN,
];

const EXPERT_PATTERNS = [
  ALTERNATING_DOWN_UP,
  DOUBLE_HIT_DOWN,
  DOUBLE_HIT_UP,
  INWARD_SLASH,
  OUTWARD_SLASH,
  QUICK_BURST_RED,
  QUICK_BURST_BLUE,
  WAVE_PATTERN,
  CROSS_HANDS,
  STAIRCASE_UP,
  FLICK_PATTERN,
];

// ============================================================
//  SONG STRUCTURE — intro, build, peak, cooldown, outro
// ============================================================

interface SongSection {
  startBeat: number;
  endBeat: number;
  intensity: number;      // 0.0 (silent) to 1.0 (peak)
  noteDensity: number;    // Beats between notes (higher = more sparse)
}

function generateSongStructure(totalBeats: number): SongSection[] {
  const sections: SongSection[] = [];
  
  // Musical song structure percentages:
  // 0-10% = Intro (sparse, easy)
  // 10-30% = Build (increasing density)
  // 30-55% = Peak 1 (high density)
  // 55-65% = Breakdown (sparse again)
  // 65-85% = Peak 2 (highest density)
  // 85-95% = Cooldown
  // 95-100% = Outro (almost empty)

  const mark = (pct: number) => Math.floor(totalBeats * pct);

  sections.push({ startBeat: mark(0),    endBeat: mark(0.10), intensity: 0.2,  noteDensity: 4 });
  sections.push({ startBeat: mark(0.10), endBeat: mark(0.30), intensity: 0.5,  noteDensity: 2 });
  sections.push({ startBeat: mark(0.30), endBeat: mark(0.55), intensity: 0.85, noteDensity: 1 });
  sections.push({ startBeat: mark(0.55), endBeat: mark(0.65), intensity: 0.35, noteDensity: 4 });
  sections.push({ startBeat: mark(0.65), endBeat: mark(0.85), intensity: 1.0,  noteDensity: 1 });
  sections.push({ startBeat: mark(0.85), endBeat: mark(0.95), intensity: 0.4,  noteDensity: 3 });
  sections.push({ startBeat: mark(0.95), endBeat: totalBeats,  intensity: 0.15, noteDensity: 8 });

  return sections;
}

function getSectionForBeat(beat: number, sections: SongSection[]): SongSection {
  for (const s of sections) {
    if (beat >= s.startBeat && beat < s.endBeat) return s;
  }
  return sections[sections.length - 1];
}

// ============================================================
//  MAIN GENERATOR
// ============================================================

/**
 * Generate a musical, beat-quantized beatmap with natural hand flow.
 * Notes always land on actual beats. Patterns vary by song section intensity.
 */
export function generateProceduralBeatmap(
  bpm: number,
  durationSeconds: number,
  difficulty: 'EASY' | 'NORMAL' | 'EXPERT' = 'NORMAL'
): BeatNote[] {
  const notes: BeatNote[] = [];
  const beatInterval = 60 / bpm;
  const leadInTime = 3.5; // Seconds before first note arrives (breathing room)
  
  const totalBeats = Math.floor((durationSeconds - leadInTime - 2) / beatInterval);
  if (totalBeats <= 0) return notes;

  // Choose pattern pool based on difficulty
  const patterns = difficulty === 'EASY' ? EASY_PATTERNS
                 : difficulty === 'NORMAL' ? NORMAL_PATTERNS
                 : EXPERT_PATTERNS;

  // Song structure
  const sections = generateSongStructure(totalBeats);

  // Density multiplier per difficulty
  const diffDensityMult = difficulty === 'EASY' ? 2.0 : difficulty === 'NORMAL' ? 1.0 : 0.5;

  // Deterministic RNG seeded from BPM + duration for consistent maps
  let rngState = bpm * 1000 + durationSeconds;
  const rng = () => {
    rngState = (rngState * 1664525 + 1013904223) & 0x7fffffff;
    return rngState / 0x7fffffff;
  };

  // Pattern scheduling
  let beat = 0;
  let lastPatternIdx = -1;

  while (beat < totalBeats) {
    const section = getSectionForBeat(beat, sections);
    const effectiveDensity = Math.max(1, Math.round(section.noteDensity * diffDensityMult));

    // Skip beats in low-intensity sections with probability
    if (rng() > section.intensity * 1.3) {
      beat += effectiveDensity;
      continue;
    }

    // Pick a pattern (avoid repeating the same pattern twice in a row)
    let patIdx = Math.floor(rng() * patterns.length);
    if (patIdx === lastPatternIdx && patterns.length > 1) {
      patIdx = (patIdx + 1) % patterns.length;
    }
    lastPatternIdx = patIdx;
    const pattern = patterns[patIdx];

    // Place pattern notes at this beat position
    for (const [beatOff, lineIdx, lineLayer, type, cutDir] of pattern.notes) {
      const noteBeat = beat + beatOff;
      if (noteBeat >= totalBeats) break;

      // Skip bombs in Easy/Normal
      if (type === 'bomb' && difficulty !== 'EXPERT') continue;

      const time = leadInTime + noteBeat * beatInterval;
      notes.push({
        time,
        lineIndex: lineIdx,
        lineLayer: lineLayer,
        type,
        cutDirection: cutDir
      });
    }

    // Advance past the pattern + breathing room
    const patternDuration = Math.max(...pattern.notes.map(n => n[0])) + 1;
    beat += Math.max(effectiveDensity, Math.ceil(patternDuration));

    // Musical phrasing: add extra gap at phrase boundaries (every 16 beats)
    if (beat % 16 >= 14) {
      beat = Math.ceil(beat / 16) * 16;
    }
  }

  // Sort by time
  notes.sort((a, b) => a.time - b.time);

  return notes;
}

/** Pre-packaged tracks with tuned playable speeds */
export const PRESET_TRACKS: SongTrack[] = [
  {
    id: 'track-chillwave',
    title: 'Tokyo Midnight Dream',
    artist: 'Neon Sunset',
    bpm: 105,
    difficulty: 'EASY',
    duration: 80,
    speed: 9.5,
    notes: generateProceduralBeatmap(105, 80, 'EASY')
  },
  {
    id: 'track-cyberwave',
    title: 'Cyberpunk Neon Pulse',
    artist: 'Antigravity Synth Lab',
    bpm: 128,
    difficulty: 'NORMAL',
    duration: 75,
    speed: 11.8,
    notes: generateProceduralBeatmap(128, 75, 'NORMAL')
  },
  {
    id: 'track-hyperdrive',
    title: 'Hyperdrive 2088',
    artist: 'Overdrive X',
    bpm: 140,
    difficulty: 'EXPERT',
    duration: 65,
    speed: 14.5,
    notes: generateProceduralBeatmap(140, 65, 'EXPERT')
  }
];
