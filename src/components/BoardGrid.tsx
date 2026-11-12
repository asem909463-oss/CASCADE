import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Board, Position, TileColor } from '../game/engine';
import { COLORS, TILE_PALETTE } from '../theme/tokens';

const GAP = 4;

type Props = {
  board: Board;
  width: number;
  onTap: (position: Position) => void;
  disabled?: boolean;
  reduceMotion?: boolean;
};

export function BoardGrid({ board, width, onTap, disabled = false, reduceMotion = false }: Props) {
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
  size,
  onPress,
  disabled,
  reduceMotion,
  label,
}: {
  color: TileColor | null;
  size: number;
  onPress: () => void;
  disabled: boolean;
  reduceMotion: boolean;
  label: string;
}) {
  const entryScale = useRef(new Animated.Value(1)).current;
  const previousColor = useRef(color);
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
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${color} tile`}
        accessibilityHint="Clears the connected group if it contains at least two tiles"
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [
          styles.tile,
          {
            width: size,
            height: size,
            backgroundColor: palette.fill,
            borderColor: palette.edge,
            transform: [{ translateY: pressed ? 1.5 : 0 }, { scale: pressed ? 0.94 : 1 }],
            opacity: pressed ? 0.83 : 1,
          },
        ]}
      >
        <View style={[styles.glint, { backgroundColor: palette.highlight }]} />
        <Text style={[styles.symbol, { fontSize: Math.max(10, size * 0.31) }]}>{palette.symbol}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  frame: {
    backgroundColor: '#E9E1D4',
    borderColor: '#D6CCBC',
    borderWidth: 1,
    borderRadius: 25,
    padding: 4,
    alignSelf: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: COLORS.shadow,
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
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
    borderBottomWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
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
    color: '#FFF9EF',
    fontWeight: '900',
    opacity: 0.76,
    textAlign: 'center',
    textShadowColor: 'rgba(43,38,31,0.18)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
});
