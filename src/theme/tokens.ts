export const COLORS = {
  ink: '#58443D',
  inkSoft: '#846C60',
  paper: '#FFF8EE',
  paperBright: '#FFFEFA',
  panel: '#FFF0DF',
  line: '#F1DCC8',
  coral: '#FF766B',
  coralDeep: '#E85F55',
  gold: '#FFD166',
  mint: '#78D7B6',
  blue: '#76C8EF',
  violet: '#C09AF2',
  white: '#FFFFFF',
  muted: '#A98F80',
  shadow: '#B98F75',
} as const;

export const TILE_PALETTE = {
  coral: { fill: COLORS.coral, edge: '#F05F57', highlight: '#FFC0A8', symbol: '●', symbolColor: '#FFF9EF' },
  gold: { fill: COLORS.gold, edge: '#E6AB3E', highlight: '#FFE5A2', symbol: '◆', symbolColor: '#79511C' },
  mint: { fill: COLORS.mint, edge: '#54B995', highlight: '#B5F1D8', symbol: '✦', symbolColor: '#1D6C52' },
  blue: { fill: COLORS.blue, edge: '#54A8D5', highlight: '#B7E8FF', symbol: '■', symbolColor: '#174F70' },
  violet: { fill: COLORS.violet, edge: '#A17AD8', highlight: '#E0CCFF', symbol: '✿', symbolColor: '#543A7A' },
} as const;

export const TYPE = {
  display: 'Georgia',
  body: 'System',
  mono: 'Menlo',
} as const;
