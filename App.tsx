import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Pressable, StatusBar, StyleSheet, Text, View, useWindowDimensions,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, createBoard, createRandom, findGroup, playMove, type Board, type TileColor } from './src/game/engine';
import { loadBestScore, loadGameState, saveBestScore, saveGameState } from './src/storage/save';

const PALETTE: Record<TileColor, string> = {
  coral: '#FF6B70', amber: '#FFBE55', mint: '#50D6B0', blue: '#5B9CFF', violet: '#A78BFA',
};
const LABELS: Record<TileColor, string> = {
  coral: 'Coral', amber: 'Amber', mint: 'Mint', blue: 'Blue', violet: 'Violet',
};
const GAP = 5;

export default function App() {
  const { width } = useWindowDimensions();
  const boardWidth = Math.min(width - 36, 430);
  const [board, setBoard] = useState<Board>(() => createBoard());
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [selected, setSelected] = useState<{ row: number; col: number } | null>(null);
  const [moves, setMoves] = useState(0);
  const [over, setOver] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    Promise.all([loadBestScore(), loadGameState()]).then(([savedBest, savedGame]) => {
      setBest(savedBest);
      if (savedGame) {
        setBoard(savedGame.board);
        setScore(savedGame.score);
        setMoves(savedGame.moves);
        setOver(false);
      }
      setReady(true);
    }).catch(() => setReady(true));
  }, []);

  useEffect(() => {
    if (score > best) {
      setBest(score);
      saveBestScore(score);
    }
  }, [score, best]);

  useEffect(() => {
    if (ready) saveGameState(board, score, moves);
  }, [board, score, moves, ready]);

  const selectedGroup = useMemo(
    () => selected ? findGroup(board, selected.row, selected.col) : [],
    [board, selected],
  );
  const selectedKeys = useMemo(
    () => new Set(selectedGroup.map(cell => cell.row + ':' + cell.col)),
    [selectedGroup],
  );

  const startNewGame = useCallback(() => {
    setBoard(createBoard());
    setScore(0);
    setMoves(0);
    setSelected(null);
    setOver(false);
  }, []);

  const onTilePress = useCallback(async (row: number, col: number) => {
    if (over) return;
    const group = findGroup(board, row, col);
    if (group.length < 2) {
      setSelected({ row, col });
      await Haptics.selectionAsync().catch(() => undefined);
      return;
    }
    const result = playMove(board, row, col, createRandom());
    if (!result) return;
    setBoard(result.board);
    setScore(current => current + result.score);
    setMoves(current => current + 1);
    setSelected(null);
    setOver(result.gameOver);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
  }, [board, over]);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <View style={styles.container}>
        <View style={styles.topLine}>
          <View>
            <Text style={styles.eyebrow}>A LITTLE FLOW STATE</Text>
            <Text style={styles.logo}>CASCADE<Text style={styles.logoDot}>.</Text></Text>
          </View>
          <Pressable onPress={startNewGame} style={styles.newButton}>
            <Text style={styles.newButtonText}>NEW GAME ↻</Text>
          </Pressable>
        </View>

        <View style={styles.scoreRow}>
          <View style={styles.scoreCard}>
            <Text style={styles.statLabel}>CURRENT SCORE</Text>
            <Text style={styles.scoreValue}>{score.toLocaleString()}</Text>
          </View>
          <View style={[styles.scoreCard, styles.bestCard]}>
            <Text style={styles.statLabel}>PERSONAL BEST</Text>
            <Text style={styles.bestValue}>{best.toLocaleString()}</Text>
          </View>
        </View>

        <View style={styles.instructionRow}>
          <View style={styles.liveDot} />
          <Text style={styles.instruction}>Tap matching neighbours to make them disappear.</Text>
        </View>

        <View style={styles.boardFrame}>
          <View style={styles.board}>
            {board.map((line, row) => (
              <View key={row} style={styles.boardRow}>
                {line.map((color, col) => {
                  const isSelected = selectedKeys.has(row + ':' + col);
                  return (
                    <Pressable
                      key={col}
                      accessibilityRole="button"
                      accessibilityLabel={`${LABELS[color]} tile, row ${row + 1}, column ${col + 1}`}
                      onPress={() => onTilePress(row, col)}
                      style={[
                        styles.tile,
                        { backgroundColor: PALETTE[color] },
                        isSelected && styles.tileSelected,
                      ]}
                    >
                      <View style={[styles.tileShine, { backgroundColor: 'rgba(255,255,255,0.23)' }]} />
                      <View style={styles.tileCore} />
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
          {over && (
            <View style={styles.gameOverOverlay}>
              <Text style={styles.gameOverEyebrow}>NO MORE MOVES</Text>
              <Text style={styles.gameOverTitle}>Beautiful run.</Text>
              <Text style={styles.gameOverScore}>{score.toLocaleString()} points</Text>
              <Pressable onPress={startNewGame} style={styles.playAgain}>
                <Text style={styles.playAgainText}>PLAY AGAIN</Text>
              </Pressable>
            </View>
          )}
        </View>

        <View style={styles.footer}>
          <View style={styles.footerStat}>
            <Text style={styles.footerNumber}>{moves}</Text>
            <Text style={styles.footerLabel}>MOVES</Text>
          </View>
          <View style={styles.colorLegend}>
            {COLORS.map(color => <View key={color} style={[styles.legendDot, { backgroundColor: PALETTE[color] }]} />)}
          </View>
          <View style={styles.footerStat}>
            <Text style={styles.footerNumber}>8×8</Text>
            <Text style={styles.footerLabel}>BOARD</Text>
          </View>
        </View>
        <Text style={styles.hint}>BIGGER GROUPS. BIGGER SCORES.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#10121D' },
  container: { flex: 1, alignItems: 'center', paddingHorizontal: 18, paddingTop: 16, justifyContent: 'space-between' },
  topLine: { width: '100%', maxWidth: 430, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { color: '#85899D', fontSize: 9, letterSpacing: 2.6, fontWeight: '800', marginBottom: 4 },
  logo: { color: '#F7F6F2', fontSize: 32, letterSpacing: 3.4, fontWeight: '900' },
  logoDot: { color: '#7FE0C0' },
  newButton: { borderWidth: 1, borderColor: '#34384B', borderRadius: 20, paddingVertical: 10, paddingHorizontal: 14 },
  newButtonText: { color: '#D6D8E3', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  scoreRow: { width: '100%', maxWidth: BOARD_WIDTH, flexDirection: 'row', gap: 10, marginTop: 14 },
  scoreCard: { flex: 1, backgroundColor: '#1A1D2B', borderRadius: 17, padding: 15, borderWidth: 1, borderColor: '#292D40' },
  bestCard: { backgroundColor: '#1B242B', borderColor: '#2B3A3B' },
  statLabel: { color: '#85899D', fontSize: 8, letterSpacing: 1.5, fontWeight: '800' },
  scoreValue: { color: '#F7F6F2', fontSize: 25, fontWeight: '900', marginTop: 5, fontVariant: ['tabular-nums'] },
  bestValue: { color: '#7FE0C0', fontSize: 25, fontWeight: '900', marginTop: 5, fontVariant: ['tabular-nums'] },
  instructionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 15 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#7FE0C0' },
  instruction: { color: '#B1B4C3', fontSize: 11, letterSpacing: 0.2 },
  boardFrame: { width: boardWidth, aspectRatio: 1, padding: 8, borderRadius: 22, backgroundColor: '#1A1D2B', borderWidth: 1, borderColor: '#303449' },
  board: { flex: 1, gap: GAP },
  boardRow: { flex: 1, flexDirection: 'row', gap: GAP },
  tile: { flex: 1, borderRadius: 7, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' },
  tileSelected: { borderWidth: 2.5, borderColor: '#FFFFFF', transform: [{ scale: 0.91 }] },
  tileShine: { position: 'absolute', top: 3, left: 3, right: 3, height: '28%', borderRadius: 5 },
  tileCore: { width: '22%', aspectRatio: 1, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.16)' },
  gameOverOverlay: { ...StyleSheet.absoluteFillObject, margin: 8, borderRadius: 16, backgroundColor: 'rgba(13,15,25,0.94)', alignItems: 'center', justifyContent: 'center' },
  gameOverEyebrow: { color: '#7FE0C0', fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  gameOverTitle: { color: '#F7F6F2', fontSize: 29, fontWeight: '900', marginTop: 9 },
  gameOverScore: { color: '#B1B4C3', fontSize: 14, marginTop: 7, marginBottom: 22 },
  playAgain: { backgroundColor: '#7FE0C0', borderRadius: 24, paddingHorizontal: 27, paddingVertical: 14 },
  playAgainText: { color: '#111925', fontSize: 11, fontWeight: '900', letterSpacing: 1.3 },
  footer: { width: '100%', maxWidth: BOARD_WIDTH, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, marginTop: 17 },
  footerStat: { alignItems: 'center', minWidth: 48 },
  footerNumber: { color: '#F7F6F2', fontSize: 16, fontWeight: '800' },
  footerLabel: { color: '#777C91', fontSize: 8, letterSpacing: 1.5, fontWeight: '800', marginTop: 3 },
  colorLegend: { flexDirection: 'row', gap: 8 },
  legendDot: { width: 8, height: 8, borderRadius: 5 },
  hint: { color: '#686D82', fontSize: 8, letterSpacing: 2.1, fontWeight: '800', marginBottom: 12, marginTop: 14 },
});
