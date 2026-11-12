import { Board, createBoard, hasValidMove, mulberry32, TILE_COLORS } from './engine';

export const CAMPAIGN_LEVEL_COUNT = 500;
export const LEVELS_PER_CHAPTER = 50;

export const CAMPAIGN_CHAPTERS = [
  'First Steps', 'Pattern Sense', 'Falling Lines', 'Chain Workshop', 'Colour Logic',
  'Careful Clears', 'Deep Combos', 'Board Control', 'Expert Patterns', 'Cascade Mastery',
] as const;

export type CampaignLevel = {
  number: number;
  chapter: number;
  chapterName: string;
  title: string;
  targetScore: number;
  moveLimit: number;
  seed: number;
  objective: 'score' | 'tiles' | 'chain' | 'color';
  objectiveTarget: number;
  objectiveColor: (typeof TILE_COLORS)[number] | null;
};

function levelSeed(level: number): number {
  let hash = 2166136261;
  for (const char of `cascade-campaign-v1-${level}`) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function getCampaignLevel(level: number): CampaignLevel {
  const safeLevel = Math.max(1, Math.min(CAMPAIGN_LEVEL_COUNT, Math.floor(level)));
  const chapter = Math.floor((safeLevel - 1) / LEVELS_PER_CHAPTER);
  const chapterLevel = ((safeLevel - 1) % LEVELS_PER_CHAPTER) + 1;
  return {
    number: safeLevel,
    chapter: chapter + 1,
    chapterName: CAMPAIGN_CHAPTERS[chapter],
    title: chapterLevel % 10 === 0 ? 'Pattern test' : chapterLevel % 5 === 0 ? 'Combo test' : 'Puzzle',
    targetScore: 350 + safeLevel * 10,
    moveLimit: Math.max(10, 18 - Math.floor((safeLevel - 1) / 125)),
    seed: levelSeed(safeLevel),
    objective: safeLevel % 7 === 0 ? 'color' : safeLevel % 5 === 0 ? 'chain' : safeLevel % 3 === 0 ? 'tiles' : 'score',
    objectiveTarget: safeLevel % 7 === 0 ? 10 + Math.floor(safeLevel / 100) : safeLevel % 5 === 0 ? (safeLevel >= 250 ? 2 : 1) : safeLevel % 3 === 0 ? 18 + Math.floor(safeLevel / 12) : 0,
    objectiveColor: safeLevel % 7 === 0 ? TILE_COLORS[Math.floor(safeLevel / 7) % TILE_COLORS.length] : null,
  };
}

export function createCampaignBoard(level: number): Board {
  const { seed } = getCampaignLevel(level);
  let attempt = 0;
  while (attempt < 32) {
    const board = createBoard(mulberry32((seed + attempt) >>> 0));
    if (hasValidMove(board)) return board;
    attempt += 1;
  }
  // A guaranteed legal fallback: every row contains horizontal same-colour pairs.
  return Array.from({ length: 8 }, (_, row) =>
    Array.from({ length: 8 }, (_, col) => TILE_COLORS[(row + Math.floor(col / 2)) % TILE_COLORS.length]),
  );
}

export function isCampaignObjectiveComplete(
  level: CampaignLevel,
  score: number,
  tilesCleared: number,
  lastChainCount: number,
  targetColorTilesCleared = 0,
): boolean {
  if (level.objective === 'score') return score >= level.targetScore;
  if (level.objective === 'tiles') return tilesCleared >= level.objectiveTarget;
  if (level.objective === 'color') return targetColorTilesCleared >= level.objectiveTarget;
  return lastChainCount >= level.objectiveTarget;
}

export function campaignObjectiveLabel(level: CampaignLevel): string {
  if (level.objective === 'score') return `Reach ${level.targetScore.toLocaleString()} points`;
  if (level.objective === 'tiles') return `Clear ${level.objectiveTarget} tiles`;
  if (level.objective === 'color') return `Clear ${level.objectiveTarget} ${level.objectiveColor} tiles`;
  return `Trigger a chain of ${level.objectiveTarget} wave${level.objectiveTarget === 1 ? '' : 's'}`;
}

export function starsForCampaignScore(score: number, targetScore: number): number {
  if (score < targetScore) return 0;
  if (score >= Math.ceil(targetScore * 1.75)) return 3;
  if (score >= Math.ceil(targetScore * 1.3)) return 2;
  return 1;
}

/** Any completed objective earns at least one star, even when it is not score-based. */
export function starsForCampaignWin(score: number, targetScore: number): number {
  return Math.max(1, starsForCampaignScore(score, targetScore));
}
