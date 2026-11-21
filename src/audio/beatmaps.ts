/**
 * Beatmap definitions and algorithmic track generator
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

/**
 * Procedural beatmap builder with natural hand flow:
 * Alternates cut directions (e.g. DOWN then UP) and keeps red on left, blue on right with occasional cross-hands.
 */
export function generateProceduralBeatmap(
  bpm: number,
  durationSeconds: number,
  difficulty: 'EASY' | 'NORMAL' | 'EXPERT' = 'NORMAL'
): BeatNote[] {
  const notes: BeatNote[] = [];
  const beatInterval = 60 / bpm;
  const leadInTime = 3.0; // Seconds before first note arrives

  // Density factor
  const step = difficulty === 'EASY' ? 2 : difficulty === 'NORMAL' ? 1 : 0.5;
  const totalBeats = Math.floor((durationSeconds - leadInTime - 2) / (beatInterval * step));

  let lastRedDir: CutDirection = 'DOWN';
  let lastBlueDir: CutDirection = 'DOWN';

  const oppositeDir = (dir: CutDirection): CutDirection => {
    switch (dir) {
      case 'DOWN': return 'UP';
      case 'UP': return 'DOWN';
      case 'LEFT': return 'RIGHT';
      case 'RIGHT': return 'LEFT';
      default: return 'DOWN';
    }
  };

  for (let b = 0; b < totalBeats; b++) {
    const t = leadInTime + b * beatInterval * step;
    const beatIndex = b * step;

    // Skip some beats for musical phrasing / breathing room
    if (b % 16 === 14 || b % 16 === 15) continue;

    // Pattern distribution based on beat
    const isQuarterBeat = Math.floor(beatIndex) === beatIndex;
    if (!isQuarterBeat && difficulty === 'EASY') continue;

    const patternType = Math.floor(beatIndex / 4) % 4;

    if (patternType === 0) {
      // Alternating Red & Blue on subsequent beats
      if (b % 2 === 0) {
        lastRedDir = oppositeDir(lastRedDir);
        notes.push({
          time: t,
          lineIndex: Math.random() > 0.4 ? 1 : 0,
          lineLayer: Math.random() > 0.5 ? 0 : 1,
          type: 'red',
          cutDirection: lastRedDir
        });
      } else {
        lastBlueDir = oppositeDir(lastBlueDir);
        notes.push({
          time: t,
          lineIndex: Math.random() > 0.4 ? 2 : 3,
          lineLayer: Math.random() > 0.5 ? 0 : 1,
          type: 'blue',
          cutDirection: lastBlueDir
        });
      }
    } else if (patternType === 1) {
      // Simultaneous Double Hits (both hands together)
      lastRedDir = oppositeDir(lastRedDir);
      lastBlueDir = oppositeDir(lastBlueDir);

      notes.push({
        time: t,
        lineIndex: 0,
        lineLayer: 0,
        type: 'red',
        cutDirection: lastRedDir
      });
      notes.push({
        time: t,
        lineIndex: 3,
        lineLayer: 0,
        type: 'blue',
        cutDirection: lastBlueDir
      });
    } else if (patternType === 2) {
      // Inward / Outward Slices (LEFT & RIGHT)
      const redDir: CutDirection = b % 2 === 0 ? 'LEFT' : 'RIGHT';
      const blueDir: CutDirection = b % 2 === 0 ? 'RIGHT' : 'LEFT';
      notes.push({
        time: t,
        lineIndex: 1,
        lineLayer: 1,
        type: 'red',
        cutDirection: redDir
      });
      notes.push({
        time: t,
        lineIndex: 2,
        lineLayer: 1,
        type: 'blue',
        cutDirection: blueDir
      });
    } else {
      // Dynamic mix with occasional bomb dodge
      if (difficulty !== 'EASY' && b % 8 === 7) {
        notes.push({
          time: t,
          lineIndex: 1,
          lineLayer: 0,
          type: 'bomb',
          cutDirection: 'ANY'
        });
      } else {
        const isRed = Math.random() > 0.5;
        const dir = (['DOWN', 'UP', 'ANY'] as CutDirection[])[Math.floor(Math.random() * 3)];
        notes.push({
          time: t,
          lineIndex: isRed ? (Math.random() > 0.5 ? 0 : 1) : (Math.random() > 0.5 ? 2 : 3),
          lineLayer: Math.random() > 0.5 ? 0 : 1,
          type: isRed ? 'red' : 'blue',
          cutDirection: dir
        });
      }
    }
  }

  return notes;
}

/** Pre-packaged tracks */
export const PRESET_TRACKS: SongTrack[] = [
  {
    id: 'track-cyberwave',
    title: 'Cyberpunk Neon Pulse',
    artist: 'Antigravity Synth Lab',
    bpm: 128,
    difficulty: 'NORMAL',
    duration: 75,
    speed: 21,
    notes: generateProceduralBeatmap(128, 75, 'NORMAL')
  },
  {
    id: 'track-hyperdrive',
    title: 'Hyperdrive 2088',
    artist: 'Overdrive X',
    bpm: 140,
    difficulty: 'EXPERT',
    duration: 65,
    speed: 25,
    notes: generateProceduralBeatmap(140, 65, 'EXPERT')
  },
  {
    id: 'track-chillwave',
    title: 'Tokyo Midnight Dream',
    artist: 'Neon Sunset',
    bpm: 105,
    difficulty: 'EASY',
    duration: 80,
    speed: 17,
    notes: generateProceduralBeatmap(105, 80, 'EASY')
  }
];
