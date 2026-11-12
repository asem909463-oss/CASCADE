import { describe, expect, it } from 'vitest';
import {
  BOARD_SIZE,
  Board,
  TileColor,
  createBoard,
  formatDailyDate,
  findGroup,
  hasValidMove,
  mulberry32,
  playMove,
  restoreRandom,
  seedFromDate,
  MAX_CHAIN_WAVES,
} from '../game/engine';

const COLORS: Record<string, TileColor> = {
  A: 'coral', B: 'gold', C: 'mint', D: 'blue', E: 'violet',
};
const boardOf = (rows: string[]): Board => rows.map((row) => [...row].map((cell) =>
  cell === '.' ? null : COLORS[cell],
));

describe('CASCADE puzzle engine', () => {
  it('generates an 8×8 board reproducibly from the same random seed', () => {
    const first = createBoard(mulberry32(41));
    const second = createBoard(mulberry32(41));
    expect(first).toEqual(second);
    expect(first).toHaveLength(BOARD_SIZE);
    expect(first.every((row) => row.length === BOARD_SIZE && row.every(Boolean))).toBe(true);
  });

  it('uses the same stable UTC-day seed for a daily challenge', () => {
    expect(seedFromDate(new Date('2026-11-12T00:01:00Z')))
      .toBe(seedFromDate(new Date('2026-11-12T23:59:00Z')));
    expect(seedFromDate(new Date('2026-11-12T00:00:00Z'))).toBe(1692951522);
    expect(seedFromDate(new Date('2026-11-12T00:00:00Z')))
      .not.toBe(seedFromDate(new Date('2026-11-13T00:00:00Z')));
    expect(formatDailyDate(new Date('2026-11-12T23:30:00-11:00'))).toBe('Fri, Nov 13');
  });

  it('restores the next value from a saved PRNG checkpoint', () => {
    const random = mulberry32(seedFromDate(new Date('2026-11-12T00:00:00Z')));
    random();
    random();
    const restored = restoreRandom(random.getState());
    expect(restored()).toBe(random());
  });

  it('finds only orthogonally connected matching tiles', () => {
    const board = boardOf(['AB....CD', 'A...B...', '........', '........', '........', '........', '........', '........']);
    expect(findGroup(board, { row: 0, col: 0 })).toHaveLength(2);
    expect(findGroup(board, { row: 0, col: 1 })).toHaveLength(1);
    expect(findGroup(board, { row: -1, col: 0 })).toHaveLength(0);
  });

  it('collects a whole 3+ orthogonal group but not diagonal or separated matches', () => {
    const threeConnected = boardOf(['A.......', 'AA......', '........', '........', '........', '........', '........', '........']);
    const diagonalOnly = boardOf(['A.......', '.A......', '........', '........', '........', '........', '........', '........']);
    const separated = boardOf(['ABA.....', '........', '........', '........', '........', '........', '........', '........']);

    expect(findGroup(threeConnected, { row: 0, col: 0 })).toHaveLength(3);
    expect(findGroup(diagonalOnly, { row: 0, col: 0 })).toHaveLength(1);
    expect(findGroup(separated, { row: 0, col: 0 })).toHaveLength(1);
  });

  it('rewards larger groups more than smaller groups', () => {
    const small = playMove(boardOf(['AA......', '........', '........', '........', '........', '........', '........', '........']), { row: 0, col: 0 }, () => 0.99);
    const large = playMove(boardOf(['AAAAA...', '........', '........', '........', '........', '........', '........', '........']), { row: 0, col: 0 }, () => 0.99);
    expect(large!.basePoints).toBeGreaterThan(small!.basePoints);
  });

  it('ignores a single-tile tap without mutating the board', () => {
    const board = boardOf(['AB......', '........', '........', '........', '........', '........', '........', '........']);
    const before = structuredClone(board);
    expect(playMove(board, { row: 0, col: 0 }, () => 0)).toBeNull();
    expect(board).toEqual(before);
  });

  it('clears a group, applies gravity, collapses empty columns, and refills every cell', () => {
    const board = boardOf([
      'AAB.....', 'AB......', 'BB......', '........',
      '........', '........', '........', '........',
    ]);
    const result = playMove(board, { row: 0, col: 0 }, () => 0.99);
    expect(result).not.toBeNull();
    expect(result!.removed).toBeGreaterThanOrEqual(2);
    expect(result!.totalPoints).toBeGreaterThan(0);
    expect(result!.board).toHaveLength(8);
    expect(result!.board.every((row) => row.length === 8 && row.every(Boolean))).toBe(true);
    expect(result!.board[7][0]).toBe('gold');
    expect(result!.board[7][1]).toBe('gold');
    expect(result!.board[7][2]).toBe('gold');
    expect(board[0][0]).toBe('coral');
  });

  it('awards additional chain points when newly spawned tiles connect', () => {
    // A two-tile selection opens a top cell; deterministic refill paints the new cell coral,
    // joining a pair of surviving coral tiles into a new clearable group.
    const board = boardOf([
      'BA......', 'BA......', '........', '........',
      '........', '........', '........', '........',
    ]);
    let calls = 0;
    const random = () => {
      calls += 1;
      return calls % 2 === 0 ? 0 : 0.01;
    };
    const result = playMove(board, { row: 0, col: 0 }, random);
    expect(result).not.toBeNull();
    expect(result!.chainCount).toBeGreaterThan(0);
    expect(result!.chainPoints).toBeGreaterThan(0);
    expect(result!.totalPoints).toBe(result!.basePoints + result!.chainPoints);
  });

  it('stops at the explicit cascade safety ceiling and leaves remaining groups playable', () => {
    const board = boardOf([
      'BA......', 'BA......', '........', '........',
      '........', '........', '........', '........',
    ]);
    const result = playMove(board, { row: 0, col: 0 }, () => 0);

    expect(result).not.toBeNull();
    expect(result!.chainCount).toBe(MAX_CHAIN_WAVES);
    expect(hasValidMove(result!.board)).toBe(true);
  });

  it('collapses a cleared column to the left while preserving surviving tile order', () => {
    const cycle = ['B', 'C', 'D', 'E'];
    const rows = Array.from({ length: 8 }, (_, row) =>
      'A' + Array.from({ length: 7 }, (_, col) => cycle[(row + col) % cycle.length]).join(''),
    );
    const board = boardOf(rows);
    const expectedLeftColumn = board.map((row) => row[1]);
    const result = playMove(board, { row: 0, col: 0 }, () => 0.99);

    expect(result).not.toBeNull();
    expect(result!.board.map((row) => row[0])).toEqual(expectedLeftColumn);
  });

  it('detects whether any connected move remains', () => {
    const board = boardOf(['ABCDEABC', 'BCDEABCD', 'ABCDEABC', 'BCDEABCD', 'ABCDEABC', 'BCDEABCD', 'ABCDEABC', 'BCDEABCD']);
    expect(hasValidMove(board)).toBe(false);
    expect(hasValidMove(boardOf(['AAB.....', '........', '........', '........', '........', '........', '........', '........']))).toBe(true);
  });
});
