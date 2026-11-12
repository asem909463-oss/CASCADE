export const BOARD_SIZE = 8;
export const DAILY_RULESET_VERSION = 1;
/** Safety guard for pathological deterministic refills; leftover groups remain playable. Tune with product approval. */
export const MAX_CHAIN_WAVES = 7;
/** Prototype scoring defaults pending owner playtesting and approval. */
export const POINTS_PER_TILE = 10;
export const GROUP_BONUS_PER_TILE_OVER_FOUR = 5;
export const TILE_COLORS = ['coral', 'gold', 'mint', 'blue', 'violet'] as const;
export type TileColor = (typeof TILE_COLORS)[number];
export type Cell = TileColor | null;
export type Board = Cell[][];
export type Position = { row: number; col: number };
export type RandomSource = () => number;
export type StatefulRandom = RandomSource & { getState: () => number };

export type MoveResult = {
  board: Board;
  removed: number;
  basePoints: number;
  chainCount: number;
  chainPoints: number;
  totalPoints: number;
  gameOver: boolean;
  removedByColor: Partial<Record<TileColor, number>>;
};

const inBounds = (row: number, col: number) =>
  row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
const neighbors = (row: number, col: number): Position[] => [
  { row: row - 1, col },
  { row: row + 1, col },
  { row, col: col - 1 },
  { row, col: col + 1 },
].filter(({ row: r, col: c }) => inBounds(r, c));

export function mulberry32(seed: number): StatefulRandom {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  return Object.assign(next, { getState: () => state });
}

export function restoreRandom(state: number): StatefulRandom {
  return mulberry32(state);
}

export function seedFromDate(date = new Date()): number {
  const day = date.toISOString().slice(0, 10);
  let hash = 2166136261;
  for (const char of `cascade-ruleset-${DAILY_RULESET_VERSION}-${day}`) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createBoard(random: RandomSource = Math.random): Board {
  return Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, () =>
      TILE_COLORS[Math.floor(random() * TILE_COLORS.length)],
    ),
  );
}

export function cloneBoard(board: Board): Board {
  return board.map((row) => [...row]);
}

export function findGroup(board: Board, start: Position): Position[] {
  if (!inBounds(start.row, start.col)) return [];
  const color = board[start.row]?.[start.col];
  if (color === null || color === undefined) return [];

  const stack = [start];
  const seen = new Set<string>([`${start.row},${start.col}`]);
  const group: Position[] = [];
  while (stack.length) {
    const position = stack.pop()!;
    group.push(position);
    for (const next of neighbors(position.row, position.col)) {
      const key = `${next.row},${next.col}`;
      if (!seen.has(key) && board[next.row][next.col] === color) {
        seen.add(key);
        stack.push(next);
      }
    }
  }
  return group;
}

export function findAllGroups(board: Board): Position[][] {
  const visited = new Set<string>();
  const groups: Position[][] = [];
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      const key = `${row},${col}`;
      if (visited.has(key) || board[row][col] === null) continue;
      const group = findGroup(board, { row, col });
      for (const position of group) visited.add(`${position.row},${position.col}`);
      groups.push(group);
    }
  }
  return groups;
}

export function hasValidMove(board: Board): boolean {
  return findAllGroups(board).some((group) => group.length >= 2);
}

type Settled = { board: Board; fresh: Set<string> };

function settleAndRefill(board: Board, random: RandomSource): Settled {
  const columns: Cell[][] = [];
  for (let col = 0; col < BOARD_SIZE; col += 1) {
    const remaining: Cell[] = [];
    for (let row = BOARD_SIZE - 1; row >= 0; row -= 1) {
      const cell = board[row][col];
      if (cell !== null) remaining.push(cell);
    }
    if (remaining.length) columns.push(remaining);
  }

  const next = Array.from({ length: BOARD_SIZE }, () => Array<Cell>(BOARD_SIZE).fill(null));
  const fresh = new Set<string>();
  for (let col = 0; col < BOARD_SIZE; col += 1) {
    const existing = columns[col] ?? [];
    let row = BOARD_SIZE - 1;
    for (const cell of existing) next[row--][col] = cell;
    while (row >= 0) {
      next[row][col] = TILE_COLORS[Math.floor(random() * TILE_COLORS.length)];
      fresh.add(`${row},${col}`);
      row -= 1;
    }
  }
  return { board: next, fresh };
}

function clearPositions(board: Board, positions: Position[]): Board {
  const next = cloneBoard(board);
  for (const { row, col } of positions) next[row][col] = null;
  return next;
}

export function playMove(
  board: Board,
  start: Position,
  random: RandomSource = Math.random,
): MoveResult | null {
  const group = findGroup(board, start);
  if (group.length < 2) return null;

  let current = settleAndRefill(clearPositions(board, group), random);
  const basePoints = group.length * POINTS_PER_TILE +
    Math.max(0, group.length - 4) * GROUP_BONUS_PER_TILE_OVER_FOUR;
  let removed = group.length;
  const removedByColor: Partial<Record<TileColor, number>> = {};
  for (const { row, col } of group) {
    const color = board[row][col] as TileColor;
    removedByColor[color] = (removedByColor[color] ?? 0) + 1;
  }
  let chainCount = 0;
  let chainPoints = 0;

  // A cascade only fires when freshly spawned tiles join two or more matching tiles.
  // This prevents unrelated groups elsewhere on the board from auto-clearing.
  for (let cascade = 1; cascade <= MAX_CHAIN_WAVES; cascade += 1) {
    const cascadingGroups = findAllGroups(current.board).filter(
      (candidate) =>
        candidate.length >= 2 &&
        candidate.some(({ row, col }) => current.fresh.has(`${row},${col}`)),
    );
    if (!cascadingGroups.length) break;
    const cascadeCells = cascadingGroups.flat();
    const cascadeSize = cascadeCells.length;
    for (const { row, col } of cascadeCells) {
      const color = current.board[row][col] as TileColor;
      removedByColor[color] = (removedByColor[color] ?? 0) + 1;
    }
    chainCount = cascade;
    chainPoints += cascadeSize * POINTS_PER_TILE * (cascade + 1);
    removed += cascadeSize;
    current = settleAndRefill(clearPositions(current.board, cascadeCells), random);
  }

  return {
    board: current.board,
    removed,
    basePoints,
    chainCount,
    chainPoints,
    totalPoints: basePoints + chainPoints,
    gameOver: !hasValidMove(current.board),
    removedByColor,
  };
}

export function formatDailyDate(date = new Date()): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
