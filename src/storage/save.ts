import AsyncStorage from '@react-native-async-storage/async-storage';
import { BOARD_SIZE, COLORS, type Board } from '../game/engine';

const BEST_SCORE_KEY = 'cascade.bestScore.v1';
const GAME_STATE_KEY = 'cascade.gameState.v1';

export type SavedGame = {
  version: 1;
  board: Board;
  score: number;
  moves: number;
};

export async function loadBestScore(): Promise<number> {
  try {
    const value = await AsyncStorage.getItem(BEST_SCORE_KEY);
    const score = Number(value ?? 0);
    return Number.isFinite(score) && score >= 0 ? score : 0;
  } catch {
    return 0;
  }
}

export async function saveBestScore(score: number): Promise<void> {
  if (!Number.isFinite(score) || score < 0) return;
  try {
    await AsyncStorage.setItem(BEST_SCORE_KEY, String(Math.floor(score)));
  } catch {
    // A failed local write must never interrupt an active game.
  }
}

function isSavedGame(value: unknown): value is SavedGame {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<SavedGame>;
  if (candidate.version !== 1 || !Array.isArray(candidate.board)) return false;
  if (candidate.board.length !== BOARD_SIZE) return false;
  if (!Number.isFinite(candidate.score) || (candidate.score ?? -1) < 0) return false;
  if (!Number.isInteger(candidate.moves) || (candidate.moves ?? -1) < 0) return false;
  return candidate.board.every(row =>
    Array.isArray(row) &&
    row.length === BOARD_SIZE &&
    row.every(tile => COLORS.includes(tile))
  );
}

export async function loadGameState(): Promise<SavedGame | null> {
  try {
    const raw = await AsyncStorage.getItem(GAME_STATE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isSavedGame(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function saveGameState(board: Board, score: number, moves: number): Promise<void> {
  const state: SavedGame = { version: 1, board, score, moves };
  try {
    await AsyncStorage.setItem(GAME_STATE_KEY, JSON.stringify(state));
  } catch {
    // Preserve active play if storage is unavailable or full.
  }
}
