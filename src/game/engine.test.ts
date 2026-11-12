import { describe, expect, it } from 'vitest';
import { calculateScore, createBoard, createRandom, findGroup, hasLegalMove, playMove, removeGroup, type Board } from './engine';

const board = (rows: string[]): Board => rows.map(row => row.split('') as Board[number]);

describe('CASCADE board engine', () => {
  it('creates a reproducible board from a seed', () => {
    expect(createBoard(createRandom(42))).toEqual(createBoard(createRandom(42)));
  });

  it('finds orthogonal groups and excludes diagonals', () => {
    const fixture = board(['ABBBBBBB','ABCCCCCC','DDDDDDDD','EEEEEEEE','AAAAAAAA','BBBBBBBB','CCCCCCCC','DDDDDDDD']);
    expect(findGroup(fixture, 0, 0)).toHaveLength(2);
    expect(findGroup(fixture, 0, 0)).not.toContainEqual({ row: 1, col: 1 });
  });

  it('does not allow a single tile as a move', () => {
    const fixture = board(['ABCDEFGH','HGFEDCBA','ABCDEFGH','HGFEDCBA','ABCDEFGH','HGFEDCBA','ABCDEFGH','HGFEDCBA']);
    expect(playMove(fixture, 0, 0, createRandom(1))).toBeNull();
  });

  it('scores larger groups more generously', () => {
    expect(calculateScore(4)).toBeGreaterThan(calculateScore(2));
    expect(calculateScore(1)).toBe(0);
  });

  it('removes a group, applies gravity and restores an 8 by 8 board', () => {
    const fixture = board(['AABBBBBB','AACCCCCC','DDDDDDDD','EEEEEEEE','AAAAAAAA','BBBBBBBB','CCCCCCCC','DDDDDDDD']);
    const group = findGroup(fixture, 0, 0);
    const next = removeGroup(fixture, group, createRandom(9));
    expect(next).toHaveLength(8);
    expect(next.every(row => row.length === 8)).toBe(true);
    expect(next.flat()).toHaveLength(64);
  });

  it('detects whether a board has a legal move', () => {
    const dead = board(['ABCDEFGH','HGFEDCBA','ABCDEFGH','HGFEDCBA','ABCDEFGH','HGFEDCBA','ABCDEFGH','HGFEDCBA']);
    const live = board(['AABCDEFG','HGFEDCBA','ABCDEFGH','HGFEDCBA','ABCDEFGH','HGFEDCBA','ABCDEFGH','HGFEDCBA']);
    expect(hasLegalMove(dead)).toBe(false);
    expect(hasLegalMove(live)).toBe(true);
  });

  it('preserves surviving vertical order after gravity', () => {
    const fixture = board([
      'ABBBBBBB',
      'ACCCCCCC',
      'DEFGHABC',
      'EFGHABCD',
      'FGHABCDE',
      'GHABCDEF',
      'HABCDEFG',
      'BCDEFGHA',
    ]);
    const original = fixture.map(row => [...row]);
    const group = findGroup(fixture, 0, 0);
    expect(group).toHaveLength(2);
    const next = removeGroup(fixture, group, createRandom(7));
    expect(next.slice(2).map(row => row[0])).toEqual(original.slice(2).map(row => row[0]));
    for (let col = 1; col < 8; col += 1) {
      expect(next.map(row => row[col])).toEqual(original.map(row => row[col]));
    }
  });

  it('collapses an emptied left column and refills only the right edge', () => {
    const fixture = board(Array.from({ length: 8 }, () => 'ABCDEFGH'));
    const group = findGroup(fixture, 0, 0);
    expect(group).toHaveLength(8);
    const next = removeGroup(fixture, group, createRandom(11));
    for (let row = 0; row < 8; row += 1) {
      for (let col = 0; col < 7; col += 1) {
        expect(next[row][col]).toBe(fixture[row][col + 1]);
      }
    }
    expect(next.every(line => line.length === 8)).toBe(true);
  });

  it('does not mutate the original board when applying a move', () => {
    const fixture = board(['AABBBBBB','AACCCCCC','DDDDDDDD','EEEEEEEE','AAAAAAAA','BBBBBBBB','CCCCCCCC','DDDDDDDD']);
    const snapshot = fixture.map(row => [...row]);
    removeGroup(fixture, findGroup(fixture, 0, 0), createRandom(5));
    expect(fixture).toEqual(snapshot);
  });

  it('returns an empty group for out-of-range coordinates', () => {
    const fixture = board(['ABCDEFGH','HGFEDCBA','ABCDEFGH','HGFEDCBA','ABCDEFGH','HGFEDCBA','ABCDEFGH','HGFEDCBA']);
    expect(findGroup(fixture, 8, 8)).toHaveLength(0);
    expect(findGroup(fixture, -1, 0)).toHaveLength(0);
  });

});
