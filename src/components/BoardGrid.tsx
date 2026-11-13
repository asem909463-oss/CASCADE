import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Board, Position, TileColor } from '../game/engine';
import { COLORS, TILE_PALETTE } from '../theme/tokens';

const GAP = 4;
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = {
  board: Board;
  width: number;
  onTap: (position: Position) => void;
  previewPositions?: Position[];
  disabled?: boolean;
  reduceMotion?: boolean;
};

export function BoardGrid({ board, width, onTap, previewPositions = [], disabled = false, reduceMotion = false }: Props) {
  const previewKeys = new Set(previewPositions.map(({ row, col }) => `${row},${col}`));
  const tileWidth = (width - 8 - GAP * 16) / 8;
  return (
    <View
      style={[styles.frame, { width, height: width }]}
    >
      {board.map((row, rowIndex) => (
        <View key={`row-${rowIndex}`} style={styles.row}>
          {row.map((color, colIndex) => (
            <BoardTile
              key={`${rowIndex}-${colIndex}`}
              color={color}
              preview={previewKeys.has(`${rowIndex},${colIndex}`)}
              size={tileWidth}
              onPress={() => onTap({ row: rowIndex, col: colIndex })}
              disabled={disabled}
              reduceMotion={reduceMotion}
              label={`Row ${rowIndex + 1}, column ${colIndex + 1}`}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

function BoardTile({
  color,
  preview,
  size,
  onPress,
  disabled,
  reduceMotion,
  label,
}: {
  color: TileColor | null;
  preview: boolean;
  size: number;
  onPress: () => void;
  disabled: boolean;
  reduceMotion: boolean;
  label: string;
}) {
  const entryScale = useRef(new Animated.Value(1)).current;
  const previousColor = useRef(color);
  const pressScale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (previousColor.current !== color) {
      previousColor.current = color;
      if (reduceMotion) {
        entryScale.setValue(1);
        return;
      }
      entryScale.setValue(0.72);
      Animated.spring(entryScale, {
        toValue: 1,
        speed: 19,
        bounciness: 4,
        useNativeDriver: true,
      }).start();
    }
  }, [color, entryScale, reduceMotion]);
  if (!color) {
    return <View style={{ width: size, height: size, margin: GAP }} />;
  }
  const palette = TILE_PALETTE[color];
  return (
    <Animated.View style={{ width: size, height: size, margin: GAP, transform: [{ scale: entryScale }] }}>
      <AnimatedPressable
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${color} tile`}
        accessibilityHint={preview ? 'Selected group. Tap any tile in this group again to clear it.' : 'Tap to inspect this connected group before clearing it.'}
        accessibilityState={{ selected: preview, disabled }}
        disabled={disabled}
        onPressIn={() => {
          if (!reduceMotion) Animated.spring(pressScale, { toValue: 0.92, speed: 30, bounciness: 5, useNativeDriver: true }).start();
        }}
        onPressOut={() => {
          if (!reduceMotion) Animated.spring(pressScale, { toValue: 1, speed: 25, bounciness: 5, useNativeDriver: true }).start();
        }}
        onPress={onPress}
        style={[styles.tile, preview && styles.preview, { width: size, height: size, backgroundColor: palette.fill, borderColor: palette.edge, transform: [{ scale: pressScale }] }]}
      >
        <View style={[styles.glint, { backgroundColor: palette.highlight }]} />
        <Text style={[styles.symbol, { color: palette.symbolColor, fontSize: Math.max(10, size * 0.34) }]}>{palette.symbol}</Text>
      </AnimatedPressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  frame: {
    backgroundColor: '#FFF6EC',
    borderColor: '#EFD5BA',
    borderWidth: 1.5,
    borderRadius: 24,
    padding: 4,
    alignSelf: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: COLORS.shadow,
    shadowOpacity: 0.16,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tile: {
    borderRadius: 9,
    borderWidth: 1,
    borderBottomWidth: 3.5,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  preview: {
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    shadowColor: '#C48D69',
    shadowOpacity: 0.35,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 0 },
    elevation: 5,
  },
  glint: {
    position: 'absolute',
    top: 3,
    left: 4,
    right: 4,
    height: 2,
    opacity: 0.72,
    borderRadius: 99,
  },
  symbol: {
    fontWeight: '900',
    opacity: 0.92,
    textAlign: 'center',
    textShadowColor: 'rgba(43,38,31,0.18)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
});
