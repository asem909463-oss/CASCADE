export const BOARD_SIZE = 8;
export const COLORS = ['coral', 'amber', 'mint', 'blue', 'violet'] as const;
export type TileColor = (typeof COLORS)[number];
export type Board = TileColor[][];
export type Cell = { row: number; col: number };

export type MoveResult = {
  board: Board;
  removed: number;
  score: number;
  gameOver: boolean;
};

export function createRandom(seed?: number): () => number {
  if (seed === undefined) return Math.random;
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function createBoard(random: () => number = Math.random): Board {
  let board = Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, () => COLORS[Math.floor(random() * COLORS.length)])
  );
  // Avoid an immediately dead starting board.
  let attempts = 0;
  while (!hasLegalMove(board) && attempts < 100) {
    board = Array.from({ length: BOARD_SIZE }, () =>
      Array.from({ length: BOARD_SIZE }, () => COLORS[Math.floor(random() * COLORS.length)])
    );
    attempts += 1;
  }
  return board;
}

export function findGroup(board: Board, row: number, col: number): Cell[] {
  const color = board[row]?.[col];
  if (!color) return [];
  const visited = new Set<string>();
  const group: Cell[] = [];
  const stack: Cell[] = [{ row, col }];

  while (stack.length) {
    const cell = stack.pop()!;
    const key = cell.row + ':' + cell.col;
    if (visited.has(key)) continue;
    visited.add(key);
    if (board[cell.row]?.[cell.col] !== color) continue;
    group.push(cell);
    if (cell.row > 0) stack.push({ row: cell.row - 1, col: cell.col });
    if (cell.row < BOARD_SIZE - 1) stack.push({ row: cell.row + 1, col: cell.col });
    if (cell.col > 0) stack.push({ row: cell.row, col: cell.col - 1 });
    if (cell.col < BOARD_SIZE - 1) stack.push({ row: cell.row, col: cell.col + 1 });
  }
  return group;
}

export function hasLegalMove(board: Board): boolean {
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      const color = board[row]?.[col];
      if (!color) continue;
      if (row + 1 < BOARD_SIZE && board[row + 1][col] === color) return true;
      if (col + 1 < BOARD_SIZE && board[row][col + 1] === color) return true;
    }
  }
  return false;
}

export function removeGroup(board: Board, group: Cell[], random: () => number = Math.random): Board {
  if (group.length < 2) return board.map(row => [...row]);
  const removed = new Set(group.map(cell => cell.row + ':' + cell.col));
  const columns: TileColor[][] = [];

  for (let col = 0; col < BOARD_SIZE; col += 1) {
    const survivors: TileColor[] = [];
    for (let row = 0; row < BOARD_SIZE; row += 1) {
      const color = board[row][col];
      if (color && !removed.has(row + ':' + col)) survivors.push(color);
    }
    if (survivors.length) columns.push(survivors);
  }

  while (columns.length < BOARD_SIZE) {
    columns.push(Array.from({ length: BOARD_SIZE }, () => COLORS[Math.floor(random() * COLORS.length)]));
  }

  const next: Board = Array.from({ length: BOARD_SIZE }, () => Array<TileColor>(BOARD_SIZE));
  columns.slice(0, BOARD_SIZE).forEach((column, col) => {
    const padding = BOARD_SIZE - column.length;
    for (let row = 0; row < BOARD_SIZE; row += 1) {
      next[row][col] = row < padding
        ? COLORS[Math.floor(random() * COLORS.length)]
        : column[row - padding];
    }
  });
  return next;
}

export function calculateScore(groupSize: number): number {
  if (groupSize < 2) return 0;
  // Tunable prototype curve: larger groups grow disproportionately.
  return groupSize * groupSize * 10;
}

export function playMove(board: Board, row: number, col: number, random: () => number = Math.random): MoveResult | null {
  const group = findGroup(board, row, col);
  if (group.length < 2) return null;
  const nextBoard = removeGroup(board, group, random);
  return {
    board: nextBoard,
    removed: group.length,
    score: calculateScore(group.length),
    gameOver: !hasLegalMove(nextBoard),
  };
}
