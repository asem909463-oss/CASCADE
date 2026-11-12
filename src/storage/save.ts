import AsyncStorage from '@react-native-async-storage/async-storage';

const BEST_SCORE_KEY = 'cascade.bestScore.v1';

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
