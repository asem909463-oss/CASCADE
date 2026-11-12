import { describe, expect, it } from 'vitest';
import { CAMPAIGN_LEVEL_COUNT, CAMPAIGN_CHAPTERS, createCampaignBoard, getCampaignLevel, isCampaignObjectiveComplete, starsForCampaignScore } from '../game/campaign';
import { hasValidMove } from '../game/engine';

describe('CASCADE campaign', () => {
  it('defines 500 levels across ten chapters', () => {
    expect(CAMPAIGN_LEVEL_COUNT).toBe(500);
    expect(CAMPAIGN_CHAPTERS).toHaveLength(10);
    expect(getCampaignLevel(500).chapter).toBe(10);
  });

  it('creates a deterministic playable board for each level', () => {
    for (const level of [1, 2, 50, 51, 250, 500]) {
      expect(createCampaignBoard(level)).toEqual(createCampaignBoard(level));
      expect(hasValidMove(createCampaignBoard(level))).toBe(true);
    }
  });

  it('increases score goals and maintains bounded move limits', () => {
    expect(getCampaignLevel(500).targetScore).toBeGreaterThan(getCampaignLevel(1).targetScore);
    expect(getCampaignLevel(1).moveLimit).toBe(18);
    expect(getCampaignLevel(500).moveLimit).toBeGreaterThanOrEqual(10);
  });

  it('varies campaign objectives between score, tile-clearing and chain puzzles', () => {
    const scoreLevel = getCampaignLevel(1);
    const tileLevel = getCampaignLevel(3);
    const chainLevel = getCampaignLevel(5);
    expect(scoreLevel.objective).toBe('score');
    expect(tileLevel.objective).toBe('tiles');
    expect(chainLevel.objective).toBe('chain');
    expect(isCampaignObjectiveComplete(scoreLevel, scoreLevel.targetScore, 0, 0)).toBe(true);
    expect(isCampaignObjectiveComplete(tileLevel, 0, tileLevel.objectiveTarget, 0)).toBe(true);
    expect(isCampaignObjectiveComplete(chainLevel, 0, 0, chainLevel.objectiveTarget)).toBe(true);
  });

  it('awards stars only after the score goal is met', () => {
    const goal = getCampaignLevel(1).targetScore;
    expect(starsForCampaignScore(goal - 1, goal)).toBe(0);
    expect(starsForCampaignScore(goal, goal)).toBe(1);
    expect(starsForCampaignScore(Math.ceil(goal * 1.3), goal)).toBe(2);
    expect(starsForCampaignScore(Math.ceil(goal * 1.75), goal)).toBe(3);
  });
});
