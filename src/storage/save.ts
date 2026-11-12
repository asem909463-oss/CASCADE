import AsyncStorage from '@react-native-async-storage/async-storage';
import { Board, DAILY_RULESET_VERSION, TILE_COLORS } from '../game/engine';

const STORAGE_KEY = '@cascade/save-v2';
const LEGACY_STORAGE_KEY = '@cascade/save-v1';
const DAILY_MOVES = 20;

export type GameSnapshot = {
  rulesetVersion: number;
  mode: 'endless' | 'daily';
  board: Board;
  score: number;
  movesLeft: number | null;
  tilesCleared: number;
  rngState: number;
  challengeDate: string;
  bestAtStart: number;
};

export type SaveData = {
  version: 2;
  highScore: number;
  gamesPlayed: number;
  totalTilesCleared: number;
  dailyDate: string | null;
  dailyBest: number;
  dailyScores: Record<string, number>;
  dailyStreak: number;
  lastDailyCompleted: string | null;
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  currentRun: GameSnapshot | null;
};

export const DEFAULT_SAVE: SaveData = {
  version: 2,
  highScore: 0,
  gamesPlayed: 0,
  totalTilesCleared: 0,
  dailyDate: null,
  dailyBest: 0,
  dailyScores: {},
  dailyStreak: 0,
  lastDailyCompleted: null,
  soundEnabled: true,
  hapticsEnabled: true,
  currentRun: null,
};

function isDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

function nonNegativeInteger(value: unknown, fallback = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return fallback;
  return Math.min(Number.MAX_SAFE_INTEGER, Math.floor(value));
}

function isBoard(value: unknown): value is Board {
  return Array.isArray(value) && value.length === 8 && value.every((row) =>
    Array.isArray(row) && row.length === 8 && row.every((cell) =>
      typeof cell === 'string' && TILE_COLORS.includes(cell as (typeof TILE_COLORS)[number]),
    ),
  );
}

function validRun(value: unknown): GameSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const run = value as Partial<GameSnapshot>;
  if (run.rulesetVersion !== DAILY_RULESET_VERSION) return null;
  if (run.mode !== 'endless' && run.mode !== 'daily') return null;
  if (!isBoard(run.board) || !isDateKey(run.challengeDate)) return null;
  if (typeof run.rngState !== 'number' || !Number.isInteger(run.rngState) || run.rngState < 0 || run.rngState > 0xffffffff) return null;
  if (typeof run.score !== 'number' || !Number.isSafeInteger(run.score) || run.score < 0) return null;
  if (typeof run.tilesCleared !== 'number' || !Number.isSafeInteger(run.tilesCleared) || run.tilesCleared < 0) return null;
  if (typeof run.bestAtStart !== 'number' || !Number.isSafeInteger(run.bestAtStart) || run.bestAtStart < 0) return null;
  if (run.mode === 'daily') {
    if (typeof run.movesLeft !== 'number' || !Number.isInteger(run.movesLeft) || run.movesLeft < 1 || run.movesLeft > DAILY_MOVES) return null;
  } else if (run.movesLeft !== null) {
    return null;
  }
  return run as GameSnapshot;
}

function validDailyScores(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const scores: Record<string, number> = {};
  for (const [date, score] of Object.entries(value)) {
    if (isDateKey(date) && typeof score === 'number' && Number.isSafeInteger(score) && score >= 0) {
      scores[date] = score;
    }
  }
  return scores;
}

export async function loadSave(): Promise<SaveData> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY) ?? await AsyncStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SAVE };
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ...DEFAULT_SAVE };
    const dailyDate = isDateKey(parsed.dailyDate) ? parsed.dailyDate : null;
    const dailyScores = validDailyScores(parsed.dailyScores);
    const dailyBest = nonNegativeInteger(parsed.dailyBest);
    if (dailyDate && dailyBest > 0 && dailyScores[dailyDate] === undefined) dailyScores[dailyDate] = dailyBest;
    return {
      version: 2,
      highScore: nonNegativeInteger(parsed.highScore),
      gamesPlayed: nonNegativeInteger(parsed.gamesPlayed),
      totalTilesCleared: nonNegativeInteger(parsed.totalTilesCleared),
      dailyDate,
      dailyBest,
      dailyScores,
      dailyStreak: nonNegativeInteger(parsed.dailyStreak),
      lastDailyCompleted: isDateKey(parsed.lastDailyCompleted) ? parsed.lastDailyCompleted : null,
      soundEnabled: typeof parsed.soundEnabled === 'boolean' ? parsed.soundEnabled : DEFAULT_SAVE.soundEnabled,
      hapticsEnabled: typeof parsed.hapticsEnabled === 'boolean' ? parsed.hapticsEnabled : DEFAULT_SAVE.hapticsEnabled,
      currentRun: validRun(parsed.currentRun),
    };
  } catch {
    return { ...DEFAULT_SAVE };
  }
}

export async function saveData(data: SaveData): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // The game remains playable if local storage is temporarily unavailable.
  }
}
