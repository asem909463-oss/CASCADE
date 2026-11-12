export const COLORS = {
  ink: '#172324',
  inkSoft: '#465454',
  paper: '#F7F3EA',
  paperBright: '#FFFCF6',
  panel: '#EFE9DD',
  line: '#DED6C8',
  coral: '#F06B57',
  coralDeep: '#D85043',
  gold: '#F4BD56',
  mint: '#6FB99E',
  blue: '#6E9DCA',
  violet: '#9D83C7',
  white: '#FFFFFF',
  muted: '#8A928B',
  shadow: '#273837',
} as const;

export const TILE_PALETTE = {
  coral: { fill: COLORS.coral, edge: '#CF5549', highlight: '#FFAA8E', symbol: '●' },
  gold: { fill: COLORS.gold, edge: '#D59B35', highlight: '#FFDB8B', symbol: '◆' },
  mint: { fill: COLORS.mint, edge: '#4D977C', highlight: '#A4D9BD', symbol: '✦' },
  blue: { fill: COLORS.blue, edge: '#4F80B0', highlight: '#A9C9E6', symbol: '■' },
  violet: { fill: COLORS.violet, edge: '#7961A9', highlight: '#C5B3E2', symbol: '✿' },
} as const;

export const TYPE = {
  display: 'Georgia',
  body: 'System',
  mono: 'Menlo',
} as const;
