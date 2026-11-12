import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DAILY_RULESET_VERSION, TILE_COLORS } from '../game/engine';

const storage = vi.hoisted(() => ({
  getItem: vi.fn(),
  setItem: vi.fn(),
}));

vi.mock('@react-native-async-storage/async-storage', () => ({ default: storage }));

import { DEFAULT_SAVE, loadSave, saveData } from '../storage/save';

const validRun = {
  rulesetVersion: DAILY_RULESET_VERSION,
  mode: 'daily',
  board: Array.from({ length: 8 }, (_, row) =>
    Array.from({ length: 8 }, (_, col) => TILE_COLORS[(row + col) % TILE_COLORS.length]),
  ),
  score: 420,
  movesLeft: 11,
  tilesCleared: 37,
  rngState: 24680,
  challengeDate: '2026-11-12',
  bestAtStart: 300,
};

describe('local save schema', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    storage.getItem.mockResolvedValue(null);
    storage.setItem.mockResolvedValue(undefined);
  });

  it('returns safe defaults when there is no stored save', async () => {
    await expect(loadSave()).resolves.toEqual(DEFAULT_SAVE);
  });

  it('recovers safely from malformed JSON', async () => {
    storage.getItem.mockResolvedValueOnce('{not valid json');
    await expect(loadSave()).resolves.toEqual(DEFAULT_SAVE);
  });

  it('migrates legacy counters and preferences while rejecting malformed date and boolean fields', async () => {
    storage.getItem.mockResolvedValueOnce(null).mockResolvedValueOnce(JSON.stringify({
      version: 1,
      highScore: 1234,
      gamesPlayed: 7,
      totalTilesCleared: 300,
      dailyDate: '2026-02-31',
      dailyBest: 800,
      soundEnabled: 'false',
      hapticsEnabled: false,
      inventedField: 'ignored',
    }));

    const save = await loadSave();
    expect(save.version).toBe(2);
    expect(save.highScore).toBe(1234);
    expect(save.gamesPlayed).toBe(7);
    expect(save.dailyDate).toBeNull();
    expect(save.soundEnabled).toBe(true);
    expect(save.hapticsEnabled).toBe(false);
    expect(save.currentRun).toBeNull();
    expect('inventedField' in save).toBe(false);
    expect(storage.getItem).toHaveBeenNthCalledWith(1, '@cascade/save-v2');
    expect(storage.getItem).toHaveBeenNthCalledWith(2, '@cascade/save-v1');
  });

  it('restores a valid run snapshot and date-keyed daily scores', async () => {
    storage.getItem.mockResolvedValue(JSON.stringify({
      ...DEFAULT_SAVE,
      dailyDate: '2026-11-12',
      dailyBest: 1500,
      dailyScores: { '2026-11-12': 1500, '2026-11-11': 900, '2026-02-31': 9999 },
      currentRun: validRun,
    }));

    const save = await loadSave();
    expect(save.currentRun).toEqual(validRun);
    expect(save.dailyScores).toEqual({ '2026-11-12': 1500, '2026-11-11': 900 });
  });

  it('drops malformed or unsupported resumable runs without losing safe scores', async () => {
    storage.getItem.mockResolvedValue(JSON.stringify({
      ...DEFAULT_SAVE,
      highScore: 2200,
      currentRun: { ...validRun, challengeDate: 'not-a-date' },
    }));

    const save = await loadSave();
    expect(save.highScore).toBe(2200);
    expect(save.currentRun).toBeNull();
  });

  it('drops a resumable run created by a different ruleset version', async () => {
    storage.getItem.mockResolvedValue(JSON.stringify({
      ...DEFAULT_SAVE,
      currentRun: { ...validRun, rulesetVersion: DAILY_RULESET_VERSION + 1 },
    }));
    await expect(loadSave()).resolves.toMatchObject({ currentRun: null });
  });

  it('writes the normalized local save payload through AsyncStorage', async () => {
    await saveData(DEFAULT_SAVE);
    expect(storage.setItem).toHaveBeenCalledWith('@cascade/save-v2', JSON.stringify(DEFAULT_SAVE));
  });
});
