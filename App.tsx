import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import {
  Animated,
  AccessibilityInfo,
  Alert,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  View,
  useWindowDimensions,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { BoardGrid } from './src/components/BoardGrid';
import {
  Board,
  createBoard,
  DAILY_RULESET_VERSION,
  formatDailyDate,
  hasValidMove,
  findGroup,
  mulberry32,
  playMove,
  Position,
  restoreRandom,
  seedFromDate,
  StatefulRandom,
} from './src/game/engine';
import { DEFAULT_SAVE, GameSnapshot, loadSave, saveData, SaveData } from './src/storage/save';
import { COLORS, TYPE } from './src/theme/tokens';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const ButtonFeedbackContext = React.createContext<() => void>(() => undefined);
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const DAILY_MOVES = 20;
const DAILY_GOAL = 10_000;
type Screen = 'home' | 'game' | 'stats' | 'help' | 'settings' | 'privacy' | 'result';
type Mode = 'endless' | 'daily';

export default function App() {
  const { width: screenWidth } = useWindowDimensions();
  const boardWidth = Math.min(screenWidth - 36, 430);
  const popSound = useAudioPlayer(require('./assets/pop.wav'));
  const chainSound = useAudioPlayer(require('./assets/chain.wav'));
  const [screen, setScreen] = useState<Screen>('home');
  const [mode, setMode] = useState<Mode>('endless');
  const [board, setBoard] = useState<Board>(() => createBoard());
  const [score, setScore] = useState(0);
  const [chain, setChain] = useState(0);
  const [movesLeft, setMovesLeft] = useState(DAILY_MOVES);
  const [gameDate, setGameDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [inputLocked, setInputLocked] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [save, setSave] = useState<SaveData>({ ...DEFAULT_SAVE });
  const [hydrated, setHydrated] = useState(false);
  const [lastClear, setLastClear] = useState<{ points: number; chain: number } | null>(null);
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null);
  const randomRef = useRef<StatefulRandom>(mulberry32(1));
  const finishedRef = useRef(false);
  const inputLockedRef = useRef(false);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tilesClearedRef = useRef(0);
  const bestAtStartRef = useRef(0);
  const clearFade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let alive = true;
    loadSave().then((loaded) => {
      if (alive) {
        setSave(loaded);
        setHydrated(true);
      }
    });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (alive) setReduceMotion(enabled);
    }).catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { alive = false; subscription.remove(); };
  }, []);

  useEffect(() => {
    void setAudioModeAsync({ playsInSilentMode: false }).catch(() => undefined);
  }, []);

  useEffect(() => () => {
    if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);

  useEffect(() => {
    if (hydrated) void saveData(save);
  }, [hydrated, save]);

  const buttonFeedback = useCallback(() => {
    if (save.hapticsEnabled) void Haptics.selectionAsync();
    if (save.soundEnabled) {
      void popSound.seekTo(0).then(() => popSound.play()).catch(() => undefined);
    }
  }, [popSound, save.hapticsEnabled, save.soundEnabled]);

  const feedback = useCallback((kind: 'clear' | 'chain' | 'invalid' | 'inspect') => {
    if (save.hapticsEnabled) {
      if (kind === 'chain') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      else if (kind === 'clear') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      else void Haptics.selectionAsync();
    }
    if (save.soundEnabled && (kind === 'clear' || kind === 'chain' || kind === 'inspect')) {
      const player = kind === 'chain' ? chainSound : popSound;
      void player.seekTo(0).then(() => player.play()).catch(() => undefined);
    }
  }, [chainSound, popSound, save.hapticsEnabled, save.soundEnabled]);

  const startGame = useCallback((nextMode: Mode) => {
    const now = new Date();
    const challengeDate = now.toISOString().slice(0, 10);
    const seed = nextMode === 'daily' ? seedFromDate(now) : Math.floor(Math.random() * 0x1_0000_0000);
    const random = mulberry32(seed);
    randomRef.current = random;
    const nextBoard = createBoard(random);
    setMode(nextMode);
    setBoard(nextBoard);
    setScore(0);
    tilesClearedRef.current = 0;
    bestAtStartRef.current = save.highScore;
    setGameDate(challengeDate);
    setChain(0);
    setLastClear(null);
    setSelectedPosition(null);
    setMovesLeft(DAILY_MOVES);
    if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    inputLockedRef.current = false;
    setInputLocked(false);
    finishedRef.current = false;
    const snapshot: GameSnapshot = {
      rulesetVersion: DAILY_RULESET_VERSION,
      mode: nextMode,
      board: nextBoard,
      score: 0,
      movesLeft: nextMode === 'daily' ? DAILY_MOVES : null,
      tilesCleared: 0,
      rngState: random.getState(),
      challengeDate,
      bestAtStart: save.highScore,
    };
    setSave((current) => ({ ...current, currentRun: snapshot }));
    setScreen('game');
  }, [save.highScore]);

  const resumeGame = useCallback(() => {
    const run = save.currentRun;
    if (!run) return;
    if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    inputLockedRef.current = false;
    setInputLocked(false);
    randomRef.current = restoreRandom(run.rngState);
    setMode(run.mode);
    setBoard(run.board);
    setScore(run.score);
    setMovesLeft(run.movesLeft ?? DAILY_MOVES);
    setGameDate(run.challengeDate);
    tilesClearedRef.current = run.tilesCleared;
    bestAtStartRef.current = run.bestAtStart;
    setChain(0);
    setLastClear(null);
    setSelectedPosition(null);
    finishedRef.current = false;
    setScreen('game');
  }, [save.currentRun]);

  const requestStartGame = useCallback((nextMode: Mode) => {
    if (!save.currentRun) {
      startGame(nextMode);
      return;
    }
    const currentMode = save.currentRun.mode === 'daily' ? 'daily challenge' : 'endless run';
    Alert.alert(
      'Start a new run?',
      `Your unfinished ${currentMode} will be replaced by the new game.`,
      [
        { text: 'Keep current run', style: 'cancel' },
        { text: 'Start new run', style: 'destructive', onPress: () => startGame(nextMode) },
      ],
    );
  }, [save.currentRun, startGame]);

  const finishGame = useCallback((finalScore: number, tilesCleared: number) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setSave((current) => ({
      ...current,
      highScore: Math.max(current.highScore, finalScore),
      gamesPlayed: current.gamesPlayed + 1,
      totalTilesCleared: current.totalTilesCleared + tilesCleared,
      ...(mode === 'daily'
        ? {
            dailyDate: gameDate,
            dailyStreak: current.lastDailyCompleted === gameDate
              ? current.dailyStreak
              : current.lastDailyCompleted === new Date(new Date(`${gameDate}T00:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10)
                ? current.dailyStreak + 1
                : 1,
            lastDailyCompleted: gameDate,
            dailyBest: Math.max(current.dailyBest, finalScore),
            dailyScores: {
              ...current.dailyScores,
              [gameDate]: Math.max(current.dailyScores[gameDate] ?? 0, finalScore),
            },
          }
        : {}),
      currentRun: null,
    }));
    setScreen('result');
  }, [gameDate, mode]);

  const onTilePress = useCallback((position: Position) => {
    if (finishedRef.current || inputLockedRef.current) return;
    const group = findGroup(board, position);
    if (group.length < 2) {
      setSelectedPosition(null);
      feedback('invalid');
      return;
    }
    const alreadyInspected = selectedPosition !== null && group.some(
      ({ row, col }) => row === selectedPosition.row && col === selectedPosition.col,
    );
    if (!alreadyInspected) {
      setSelectedPosition(position);
      feedback('inspect');
      return;
    }
    const result = playMove(board, position, randomRef.current);
    if (!result) return;
    setSelectedPosition(null);
    inputLockedRef.current = true;
    setInputLocked(true);
    transitionTimerRef.current = setTimeout(() => {
      inputLockedRef.current = false;
      setInputLocked(false);
      transitionTimerRef.current = null;
    }, reduceMotion ? 120 : 320);
    if (!reduceMotion) {
      LayoutAnimation.configureNext({
        duration: 250,
        create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
        update: { type: LayoutAnimation.Types.spring, springDamping: 0.83 },
        delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
      });
    }
    setBoard(result.board);
    tilesClearedRef.current += result.removed;
    const nextScore = score + result.totalPoints;
    setScore(nextScore);
    setChain(result.chainCount);
    setLastClear({ points: result.totalPoints, chain: result.chainCount });
    clearFade.setValue(0);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    if (reduceMotion) {
      clearFade.setValue(1);
      toastTimerRef.current = setTimeout(() => {
        clearFade.setValue(0);
        toastTimerRef.current = null;
      }, 850);
    } else {
      Animated.sequence([
        Animated.timing(clearFade, { toValue: 1, duration: 150, useNativeDriver: true }),
        Animated.delay(600),
        Animated.timing(clearFade, { toValue: 0, duration: 250, useNativeDriver: true }),
      ]).start();
    }
    feedback(result.chainCount > 0 ? 'chain' : 'clear');

    let nextMovesLeft: number | null = null;
    if (mode === 'daily') {
      const left = movesLeft - 1;
      nextMovesLeft = left;
      setMovesLeft(left);
      if (left <= 0 || result.gameOver) {
        finishGame(nextScore, tilesClearedRef.current);
        return;
      }
    } else if (result.gameOver || !hasValidMove(result.board)) {
      finishGame(nextScore, tilesClearedRef.current);
      return;
    }
    const snapshot: GameSnapshot = {
      rulesetVersion: DAILY_RULESET_VERSION,
      mode,
      board: result.board,
      score: nextScore,
      movesLeft: nextMovesLeft,
      tilesCleared: tilesClearedRef.current,
      rngState: randomRef.current.getState(),
      challengeDate: gameDate,
      bestAtStart: bestAtStartRef.current,
    };
    setSave((current) => ({
      ...current,
      currentRun: snapshot,
    }));
  }, [board, clearFade, feedback, finishGame, gameDate, mode, movesLeft, reduceMotion, score, selectedPosition]);

  const playAgain = () => startGame(mode);
  const backToHome = () => setScreen('home');
  const togglePreference = (key: 'soundEnabled' | 'hapticsEnabled') => {
    setSave((current) => ({ ...current, [key]: !current[key] }));
  };

  return (
    <SafeAreaProvider>
      <ButtonFeedbackContext.Provider value={buttonFeedback}>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <StatusBar style="dark" />
      {!hydrated ? (
        <View style={styles.loadingPage}>
          <BrandMark />
          <Text style={styles.loadingCopy}>Picking up your puzzle…</Text>
        </View>
      ) : (
        <>
      {screen === 'home' && (
        <HomeScreen
          width={screenWidth}
          save={save}
          onResume={resumeGame}
          onPlay={() => requestStartGame('endless')}
          onDaily={() => requestStartGame('daily')}
          onStats={() => setScreen('stats')}
          onHelp={() => setScreen('help')}
          onSettings={() => setScreen('settings')}
        />
      )}
      {screen === 'game' && (
        <GameScreen
          width={screenWidth}
          boardWidth={boardWidth}
          board={board}
          mode={mode}
          dailyDate={gameDate}
          score={score}
          best={save.highScore}
          chain={chain}
          movesLeft={movesLeft}
          lastClear={lastClear}
          selectedPosition={selectedPosition}
          clearFade={clearFade}
          inputLocked={inputLocked}
          reduceMotion={reduceMotion}
          onTilePress={onTilePress}
          onBack={backToHome}
        />
      )}
      {screen === 'result' && (
        <ResultScreen
          mode={mode}
          score={score}
          isNewBest={score > bestAtStartRef.current}
          dailyDate={gameDate}
          dailyBest={save.dailyScores[gameDate] ?? 0}
          onAgain={playAgain}
          onHome={backToHome}
        />
      )}
      {screen === 'stats' && <StatsScreen save={save} onBack={backToHome} />}
      {screen === 'help' && <HelpScreen onBack={backToHome} />}
      {screen === 'settings' && (
        <SettingsScreen save={save} onBack={backToHome} onToggle={togglePreference} onPrivacy={() => setScreen('privacy')} />
      )}
      {screen === 'privacy' && <PrivacyScreen onBack={() => setScreen('settings')} />}
        </>
      )}
      </SafeAreaView>
      </ButtonFeedbackContext.Provider>
    </SafeAreaProvider>
  );
}

function HomeScreen({
  width,
  save,
  onResume,
  onPlay,
  onDaily,
  onStats,
  onHelp,
  onSettings,
}: {
  width: number;
  save: SaveData;
  onResume: () => void;
  onPlay: () => void;
  onDaily: () => void;
  onStats: () => void;
  onHelp: () => void;
  onSettings: () => void;
}) {
  const artWidth = Math.min(206, width * 0.52);
  return (
    <ScrollView contentContainerStyle={styles.homeContent} showsVerticalScrollIndicator={false}>
      <View style={styles.homeHeader}>
        <BrandMark />
        <View style={styles.headerActions}>
          <IconButton label="How to play" icon="?" onPress={onHelp} />
          <IconButton label="Settings" icon="⚙" onPress={onSettings} />
        </View>
      </View>
      <View style={styles.homeHero}>
        <View style={styles.eyebrowRow}>
          <View style={styles.eyebrowDot} />
          <Text style={styles.eyebrow}>A MOMENT OF FLOW</Text>
        </View>
        <Text style={styles.wordmark}>CASCADE</Text>
        <Text style={styles.homeSubtitle}>{save.gamesPlayed === 0 ? 'Your first little cascade starts here.' : 'Clear a little space. Find your rhythm.'}</Text>
      </View>
      <MiniMosaic width={artWidth} />
      <View style={styles.dailyStreakBanner}>
        <Text style={styles.dailyStreakSpark}>✦</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.dailyStreakTitle}>THE DAILY SPARK</Text>
          <Text style={styles.dailyStreakCopy}>{save.dailyStreak > 0 ? `${save.dailyStreak} day${save.dailyStreak === 1 ? '' : 's'} in a row — keep your rhythm` : 'A fresh little challenge, every day'}</Text>
        </View>
        <Text style={styles.dailyStreakCount}>{save.dailyStreak}</Text>
      </View>
      <View style={styles.menuActions}>
        {save.currentRun && (
          <Pressable
            onPress={onResume}
            accessibilityRole="button"
            accessibilityLabel={save.currentRun.mode === 'daily' ? 'Resume daily puzzle' : 'Resume endless run'}
            style={({ pressed }) => [styles.resumeCard, pressed && styles.pressed]}
          >
            <View style={styles.resumeMark}><Text style={styles.resumeMarkText}>↻</Text></View>
            <View style={styles.resumeCopy}>
              <Text style={styles.resumeTitle}>{save.currentRun.mode === 'daily' ? 'Resume daily puzzle' : 'Continue your run'}</Text>
              <Text style={styles.resumeSubtitle}>
                {save.currentRun.score.toLocaleString()} pts
                {save.currentRun.mode === 'daily'
                  ? ` · ${formatDailyDate(new Date(`${save.currentRun.challengeDate}T00:00:00Z`))} · ${save.currentRun.movesLeft} moves left`
                  : ' · saved on this device'}
              </Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        )}
        <PrimaryButton title="Play endless" subtitle="Your next high score awaits" onPress={onPlay} />
        <Pressable onPress={onDaily} style={({ pressed }) => [styles.dailyCard, pressed && styles.pressed]}>
          <View style={styles.dailySeal}><Text style={styles.dailySealText}>D</Text></View>
          <View style={styles.dailyTextWrap}>
            <Text style={styles.dailyTitle}>Daily puzzle</Text>
            <Text style={styles.dailySubtitle}>{formatDailyDate()} · same board for everyone</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
      </View>
      <View style={styles.homeFooter}>
        <Pressable onPress={onStats} style={styles.recordPill} accessibilityRole="button" accessibilityLabel={`Personal best ${save.highScore}`}>
          <Text style={styles.recordLabel}>BEST</Text>
          <Text style={styles.recordValue}>{save.highScore.toLocaleString()}</Text>
        </Pressable>
        <View style={styles.footerDivider} />
        <View style={styles.footerStat}>
          <Text style={styles.recordLabel}>PUZZLES</Text>
          <Text style={styles.recordValue}>{save.gamesPlayed}</Text>
        </View>
        <Text style={styles.statsLink} onPress={onStats}>Your journey ↗</Text>
      </View>
      <Text style={styles.offlineNote}>MADE FOR THE LITTLE PAUSES</Text>
    </ScrollView>
  );
}

function BrandMark() {
  return (
    <View style={styles.brandLockup}>
      <View style={styles.brandIcon}>
        <View style={[styles.brandStone, styles.stoneTop]} />
        <View style={[styles.brandStone, styles.stoneMid]} />
        <View style={[styles.brandStone, styles.stoneLow]} />
      </View>
      <Text style={styles.brandName}>CASCADE</Text>
    </View>
  );
}

function MiniMosaic({ width }: { width: number }) {
  const colors = ['#F06B57', '#F4BD56', '#6FB99E', '#6E9DCA', '#9D83C7'];
  const sequence = [0, 2, 1, 3, 1, 0, 4, 2, 3, 4, 0, 2, 1, 3, 4, 0];
  return (
    <View style={[styles.mosaicWrap, { width, height: width * 0.68 }]}>
      <View style={[styles.mosaicOrb, { width: width * 0.72, height: width * 0.72, borderRadius: width }]} />
      <View style={styles.mosaicGrid}>
        {sequence.map((color, index) => (
          <View key={index} style={[styles.mosaicTile, { backgroundColor: colors[color], transform: [{ rotate: `${(index % 3 - 1) * 3}deg` }] }]}>
            <View style={styles.mosaicGlint} />
          </View>
        ))}
      </View>
      <View style={styles.sparkOne}><Text style={styles.sparkText}>✦</Text></View>
      <View style={styles.sparkTwo}><Text style={styles.sparkTextSmall}>·</Text></View>
    </View>
  );
}

function GameScreen({
  width,
  boardWidth,
  board,
  mode,
  dailyDate,
  score,
  best,
  chain,
  movesLeft,
  lastClear,
  selectedPosition,
  clearFade,
  inputLocked,
  reduceMotion,
  onTilePress,
  onBack,
}: {
  width: number;
  boardWidth: number;
  board: Board;
  mode: Mode;
  dailyDate: string;
  score: number;
  best: number;
  chain: number;
  movesLeft: number;
  lastClear: { points: number; chain: number } | null;
  selectedPosition: Position | null;
  clearFade: Animated.Value;
  inputLocked: boolean;
  reduceMotion: boolean;
  onTilePress: (position: Position) => void;
  onBack: () => void;
}) {
  const compact = width < 375;
  return (
    <View style={styles.gamePage}>
      <View style={styles.gameHeader}>
        <IconButton label="Return to menu" icon="‹" onPress={onBack} />
        <View style={styles.modeChip}>
          <View style={[styles.modeDot, mode === 'daily' && { backgroundColor: COLORS.gold }]} />
          <Text style={styles.modeText}>{mode === 'daily'
            ? `DAILY · ${formatDailyDate(new Date(`${dailyDate}T00:00:00Z`)).toUpperCase()}`
            : 'ENDLESS'}</Text>
        </View>
        <View style={styles.levelCount}><Text style={styles.levelText}>08 × 08</Text></View>
      </View>
      <View style={styles.scorePanel}>
        <View style={styles.scoreMain}>
          <Text style={styles.scoreLabel}>{mode === 'daily' ? 'CHALLENGE SCORE' : 'YOUR SCORE'}</Text>
          <Text style={styles.scoreNumber}>{score.toLocaleString()}</Text>
        </View>
        <View style={styles.scoreSide}>
          {mode === 'daily' ? (
            <><Text style={styles.scoreSideLabel}>MOVES LEFT</Text><Text style={styles.scoreSideValue}>{String(movesLeft).padStart(2, '0')}</Text></>
          ) : (
            <><Text style={styles.scoreSideLabel}>PERSONAL BEST</Text><Text style={styles.scoreSideValue}>{best.toLocaleString()}</Text></>
          )}
        </View>
      </View>
      {mode === 'daily' && (
        <View style={styles.goalRow}>
          <Text style={styles.goalText}>CHALLENGE MARK</Text>
          <View style={styles.goalTrack}><View style={[styles.goalFill, { width: `${Math.min(100, (score / DAILY_GOAL) * 100)}%` }]} /></View>
          <Text style={styles.goalValue}>{DAILY_GOAL.toLocaleString()}</Text>
        </View>
      )}
      <View style={styles.boardStage}>
        <BoardGrid board={board} width={boardWidth} onTap={onTilePress} previewPositions={selectedPosition ? findGroup(board, selectedPosition) : []} disabled={inputLocked} reduceMotion={reduceMotion} />
        {!!lastClear && (
          <Animated.View pointerEvents="none" style={[styles.clearToast, { opacity: clearFade, transform: [{ translateY: clearFade.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }]}>
            <Text style={styles.clearToastText}>+{lastClear.points.toLocaleString()}</Text>
            {lastClear.chain > 0 && <Text style={styles.chainToast}>CHAIN ×{lastClear.chain + 1}</Text>}
          </Animated.View>
        )}
      </View>
      <View style={styles.gameHint}>
        <View style={styles.hintGlyph}><Text style={styles.hintGlyphText}>✦</Text></View>
        <Text style={[styles.hintCopy, compact && { fontSize: 12 }]}>
          {selectedPosition
            ? `${findGroup(board, selectedPosition).length} stones · +${(findGroup(board, selectedPosition).length * 10 + Math.max(0, findGroup(board, selectedPosition).length - 4) * 5).toLocaleString()} · tap again to clear`
            : `Inspect a group, then commit your move${mode === 'daily' ? ' · 20 moves' : ''}`}
        </Text>
        {chain > 0 ? <Text style={styles.chainTag}>CHAIN ×{chain + 1}</Text> : <Text style={styles.hintRight}>{selectedPosition ? 'READY?' : 'CHOOSE CAREFULLY'}</Text>}
      </View>
      <View style={styles.colorLegend}>
        <View style={[styles.legendDot, { backgroundColor: COLORS.coral }]} />
        <View style={[styles.legendDot, { backgroundColor: COLORS.gold }]} />
        <View style={[styles.legendDot, { backgroundColor: COLORS.mint }]} />
        <View style={[styles.legendDot, { backgroundColor: COLORS.blue }]} />
        <View style={[styles.legendDot, { backgroundColor: COLORS.violet }]} />
        <Text style={styles.legendCopy}>FIVE COLORS · ONE GOOD RHYTHM</Text>
      </View>
    </View>
  );
}

function ResultScreen({
  mode,
  dailyDate,
  score,
  isNewBest,
  dailyBest,
  onAgain,
  onHome,
}: {
  mode: Mode;
  dailyDate: string;
  score: number;
  isNewBest: boolean;
  dailyBest: number;
  onAgain: () => void;
  onHome: () => void;
}) {
  const isCurrentDaily = dailyDate === new Date().toISOString().slice(0, 10);
  return (
    <View style={styles.simplePage}>
      <View style={styles.resultMark}><Text style={styles.resultMarkText}>{mode === 'daily' ? 'D' : '✦'}</Text></View>
      <Text style={styles.resultEyebrow}>{mode === 'daily'
        ? `DAILY · ${formatDailyDate(new Date(`${dailyDate}T00:00:00Z`)).toUpperCase()} · COMPLETE`
        : 'A LOVELY LITTLE RUN'}</Text>
      <Text style={styles.resultTitle}>{isNewBest ? 'New personal best.' : 'Nicely done.'}</Text>
      <Text style={styles.resultScore}>{score.toLocaleString()}</Text>
      <Text style={styles.resultCaption}>{mode === 'daily' ? 'points in this daily challenge' : 'points · every little chain counts'}</Text>
      {mode === 'daily' && <Text style={styles.dailyRecord}>CHALLENGE BEST · {dailyBest.toLocaleString()}</Text>}
      <View style={styles.resultDecor}><MiniMosaic width={176} /></View>
      <View style={styles.resultButtons}>
        <PrimaryButton
          title={mode === 'daily' ? (isCurrentDaily ? 'Play today again' : 'Start today’s challenge') : 'Play another round'}
          onPress={onAgain}
        />
        <SecondaryButton title="Back to home" onPress={onHome} />
      </View>
    </View>
  );
}

function StatsScreen({ save, onBack }: { save: SaveData; onBack: () => void }) {
  return (
    <SimpleShell title="Your journey" eyebrow="LITTLE BY LITTLE" onBack={onBack}>
      <View style={styles.statHero}>
        <Text style={styles.statHeroLabel}>PERSONAL BEST</Text>
        <Text style={styles.statHeroNumber}>{save.highScore.toLocaleString()}</Text>
        <Text style={styles.statHeroNote}>Your brightest run so far</Text>
      </View>
      <View style={styles.statGrid}>
        <StatCard label="PUZZLES PLAYED" value={save.gamesPlayed.toLocaleString()} accent={COLORS.coral} />
        <StatCard label="TILES CLEARED" value={save.totalTilesCleared.toLocaleString()} accent={COLORS.mint} />
        <StatCard label="ALL-TIME DAILY BEST" value={save.dailyBest.toLocaleString()} accent={COLORS.gold} />
        <StatCard
          label="LAST DAILY"
          value={save.dailyDate
            ? new Date(`${save.dailyDate}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
            : 'No daily yet'}
          accent={COLORS.violet}
        />
      </View>
      <StatCard label="DAILY SPARK STREAK" value={`${save.dailyStreak} days`} accent={COLORS.coral} />
      <Text style={styles.localNote}>Your progress lives on this device. No account needed.</Text>
    </SimpleShell>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statAccent, { backgroundColor: accent }]} />
      <Text style={styles.statCardLabel}>{label}</Text>
      <Text style={styles.statCardValue}>{value}</Text>
    </View>
  );
}

function HelpScreen({ onBack }: { onBack: () => void }) {
  return (
    <SimpleShell title="How to play" eyebrow="THE SIMPLE JOY OF IT" onBack={onBack}>
      <View style={styles.helpCard}>
        <HelpStep number="01" title="Spot a little cluster" body="Look for two or more same-color tiles sharing an edge. Diagonals don’t connect." color={COLORS.coral} />
        <HelpStep number="02" title="Inspect, then commit" body="Tap once to outline the whole group and preview its points. Tap any tile in that same group again to clear it. Tap a different group to reconsider." color={COLORS.gold} />
        <HelpStep number="03" title="Let gravity do its thing" body="Tiles fall, empty columns close up, and fresh colors tumble in from above." color={COLORS.mint} />
        <HelpStep number="04" title="Chase the cascade" body="New tiles can join old neighbors. Those chain reactions earn bonus points." color={COLORS.violet} last />
      </View>
      <View style={styles.helpModes}>
        <Text style={styles.helpModesTitle}>TWO WAYS TO WANDER</Text>
        <Text style={styles.helpModesBody}><Text style={styles.bold}>Endless</Text> · Keep going until no pairs remain.{"\n"}<Text style={styles.bold}>Daily</Text> · The same seeded board, 20 moves, every day.</Text>
      </View>
    </SimpleShell>
  );
}

function HelpStep({ number, title, body, color, last = false }: { number: string; title: string; body: string; color: string; last?: boolean }) {
  return (
    <View style={[styles.helpStep, last && { borderBottomWidth: 0 }]}>
      <View style={[styles.helpStepDot, { backgroundColor: color }]}><Text style={styles.helpStepNumber}>{number}</Text></View>
      <View style={styles.helpStepText}>
        <Text style={styles.helpStepTitle}>{title}</Text>
        <Text style={styles.helpStepBody}>{body}</Text>
      </View>
    </View>
  );
}

function SettingsScreen({
  save,
  onBack,
  onToggle,
  onPrivacy,
}: {
  save: SaveData;
  onBack: () => void;
  onToggle: (key: 'soundEnabled' | 'hapticsEnabled') => void;
  onPrivacy: () => void;
}) {
  return (
    <SimpleShell title="A few comforts" eyebrow="MAKE IT YOURS" onBack={onBack}>
      <View style={styles.settingsCard}>
        <PreferenceRow title="Sound effects" description="Soft little pops and chain chimes" enabled={save.soundEnabled} onPress={() => onToggle('soundEnabled')} />
        <PreferenceRow title="Haptic touch" description="A gentle tap when tiles clear" enabled={save.hapticsEnabled} onPress={() => onToggle('hapticsEnabled')} last />
      </View>
      <View style={{ marginTop: 14 }}>
        <SecondaryButton title="Read privacy policy" onPress={onPrivacy} />
      </View>
      <View style={styles.settingsAbout}>
        <BrandMark />
        <Text style={styles.aboutCopy}>CASCADE is a tiny puzzle made for the quiet spaces in your day. Your score and settings stay right here on your device.</Text>
        <Text style={styles.versionText}>VERSION 1.0.0 · PLAY OFFLINE, ANYTIME</Text>
      </View>
    </SimpleShell>
  );
}

function PrivacyScreen({ onBack }: { onBack: () => void }) {
  return (
    <SimpleShell title="Privacy, plainly." eyebrow="YOUR DATA STAYS YOURS" onBack={onBack}>
      <View style={styles.helpModes}>
        <Text style={styles.helpModesTitle}>THE SHORT VERSION</Text>
        <Text style={styles.helpModesBody}>CASCADE works offline. It does not ask you to create an account, and it does not send your scores or settings to us.</Text>
      </View>
      {[
        ['Information we store', 'Your high score, game history, daily challenge results, unfinished run, and sound and haptic preferences are saved locally on your device so the game can remember your progress.'],
        ['Information we collect', 'CASCADE does not include advertising, analytics, tracking, account registration, or a game server. We do not receive your gameplay data or use it to build a profile.'],
        ['Device permissions', 'The game uses optional audio playback for its sound effects and the device haptic feedback feature when enabled. It does not need access to your contacts, photos, location, microphone, or camera.'],
        ['Third-party services', 'The app is built with Expo and React Native. Apple, your device operating system, and app distribution services may process information under their own privacy terms when you download or use apps. CASCADE does not send gameplay data to those services.'],
        ['Your choices and deletion', 'You can turn sound and haptics off in Settings. Your local game data can be removed by deleting CASCADE from your device; device backups may be governed by your operating-system settings.'],
        ['Children and families', 'CASCADE has no account system, advertising, or social features. Parents can manage app access and device data through the controls provided by their device platform.'],
        ['Policy updates and contact', 'If the app’s data practices change, this policy will be updated before or alongside the relevant app release. For privacy questions, contact the developer through the CASCADE GitHub repository: github.com/asem909463-oss/CASCADE.'],
      ].map(([heading, body]) => (
        <View key={heading} style={styles.helpModes}>
          <Text style={styles.helpModesTitle}>{heading.toUpperCase()}</Text>
          <Text style={styles.helpModesBody}>{body}</Text>
        </View>
      ))}
      <Text style={styles.versionText}>LAST UPDATED · 12 NOVEMBER 2026</Text>
    </SimpleShell>
  );
}

function PreferenceRow({ title, description, enabled, onPress, last = false }: { title: string; description: string; enabled: boolean; onPress: () => void; last?: boolean }) {
  return (
    <View style={[styles.preferenceRow, last && { borderBottomWidth: 0 }]}>
      <View style={styles.preferenceCopy}>
        <Text style={styles.preferenceTitle}>{title}</Text>
        <Text style={styles.preferenceDescription}>{description}</Text>
      </View>
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: enabled }}
        accessibilityLabel={title}
        onPress={onPress}
        style={[styles.switchTrack, enabled && styles.switchOn]}
      >
        <View style={[styles.switchThumb, enabled && styles.switchThumbOn]} />
      </Pressable>
    </View>
  );
}

function SimpleShell({ title, eyebrow, onBack, children }: { title: string; eyebrow: string; onBack: () => void; children: React.ReactNode }) {
  return (
    <ScrollView contentContainerStyle={styles.simpleContent} showsVerticalScrollIndicator={false}>
      <View style={styles.simpleHeader}>
        <IconButton label="Back" icon="‹" onPress={onBack} />
        <Text style={styles.simpleEyebrow}>{eyebrow}</Text>
        <View style={{ width: 46 }} />
      </View>
      <Text style={styles.simpleTitle}>{title}</Text>
      {children}
    </ScrollView>
  );
}

function IconButton({ label, icon, onPress }: { label: string; icon: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
      <Text style={[styles.iconButtonText, icon === '‹' && styles.backGlyph]}>{icon}</Text>
    </Pressable>
  );
}

function PrimaryButton({ title, subtitle, onPress }: { title: string; subtitle?: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryPressed]}>
      <View style={styles.primaryTextWrap}>
        <Text style={styles.primaryTitle}>{title}</Text>
        {!!subtitle && <Text style={styles.primarySubtitle}>{subtitle}</Text>}
      </View>
      <View style={styles.primaryArrow}><Text style={styles.primaryArrowText}>↗</Text></View>
    </Pressable>
  );
}

function SecondaryButton({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
      <Text style={styles.secondaryTitle}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.paper },
  loadingPage: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 15 },
  loadingCopy: { color: COLORS.inkSoft, fontFamily: TYPE.display, fontStyle: 'italic', fontSize: 16 },
  homeContent: { flexGrow: 1, paddingHorizontal: 22, paddingBottom: 20 },
  homeHeader: { height: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brandLockup: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  brandIcon: { width: 28, height: 27, justifyContent: 'center', alignItems: 'center' },
  brandStone: { position: 'absolute', width: 12, height: 8, borderRadius: 4, backgroundColor: COLORS.coral, transform: [{ rotate: '-34deg' }] },
  stoneTop: { top: 3, left: 10, backgroundColor: COLORS.gold },
  stoneMid: { top: 10, left: 5, backgroundColor: COLORS.mint },
  stoneLow: { top: 17, left: 11, backgroundColor: COLORS.coral },
  brandName: { fontSize: 13, color: COLORS.ink, fontWeight: '900', letterSpacing: 2.1 },
  headerActions: { flexDirection: 'row', gap: 8 },
  iconButton: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F0EADD', borderWidth: 1, borderColor: COLORS.line },
  iconButtonText: { fontSize: 20, color: COLORS.ink, fontWeight: '500', marginTop: -1 },
  backGlyph: { fontSize: 35, fontWeight: '300', lineHeight: 39, marginTop: -6 },
  homeHero: { alignItems: 'center', marginTop: 22 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 9 },
  eyebrowDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.coral },
  eyebrow: { fontSize: 9, letterSpacing: 2.3, fontWeight: '800', color: COLORS.inkSoft },
  wordmark: { fontFamily: TYPE.display, fontSize: 42, letterSpacing: 3.1, color: COLORS.ink, lineHeight: 49 },
  homeSubtitle: { marginTop: 8, textAlign: 'center', fontFamily: TYPE.display, fontStyle: 'italic', fontSize: 17, color: COLORS.inkSoft, lineHeight: 24 },
  mosaicWrap: { alignSelf: 'center', marginTop: 12, marginBottom: 3, alignItems: 'center', justifyContent: 'center' },
  mosaicOrb: { position: 'absolute', backgroundColor: '#EFE9DD', opacity: 0.92 },
  mosaicGrid: { width: '67%', aspectRatio: 1, flexDirection: 'row', flexWrap: 'wrap', padding: 5, gap: 4, transform: [{ rotate: '-4deg' }], zIndex: 1 },
  mosaicTile: { width: '22%', height: '22%', borderRadius: 8, borderBottomWidth: 2.5, borderBottomColor: 'rgba(40,40,40,0.18)', alignItems: 'center', justifyContent: 'center' },
  mosaicGlint: { position: 'absolute', top: 3, left: 4, right: 4, height: 2, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.65)' },
  sparkOne: { position: 'absolute', right: '7%', top: '15%', zIndex: 2 },
  sparkTwo: { position: 'absolute', left: '9%', bottom: '16%', zIndex: 2 },
  sparkText: { color: COLORS.coral, fontSize: 23 },
  sparkTextSmall: { color: COLORS.gold, fontSize: 30, fontWeight: '900' },
  menuActions: { gap: 11, marginTop: 5 },
  resumeCard: { minHeight: 63, borderRadius: 18, backgroundColor: '#EFE9DD', paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 11 },
  resumeMark: { width: 36, height: 36, borderRadius: 13, backgroundColor: COLORS.paperBright, alignItems: 'center', justifyContent: 'center' },
  resumeMarkText: { color: COLORS.ink, fontSize: 22, fontWeight: '700', marginTop: -2 },
  resumeCopy: { flex: 1, gap: 3 },
  resumeTitle: { color: COLORS.ink, fontSize: 13, fontWeight: '800' },
  resumeSubtitle: { color: COLORS.muted, fontSize: 10.5 },
  primaryButton: { minHeight: 67, borderRadius: 20, backgroundColor: COLORS.ink, paddingHorizontal: 19, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', shadowColor: COLORS.shadow, shadowOpacity: 0.15, shadowOffset: { width: 0, height: 5 }, shadowRadius: 11, elevation: 3 },
  primaryPressed: { transform: [{ scale: 0.987 }], backgroundColor: '#243536' },
  primaryTextWrap: { gap: 3 },
  primaryTitle: { color: COLORS.paperBright, fontSize: 16, fontWeight: '800', letterSpacing: 0.2 },
  primarySubtitle: { color: '#C8D0C9', fontSize: 11 },
  primaryArrow: { width: 34, height: 34, borderRadius: 12, backgroundColor: COLORS.coral, alignItems: 'center', justifyContent: 'center' },
  primaryArrowText: { color: COLORS.white, fontSize: 18, fontWeight: '800', marginTop: -2 },
  dailyCard: { minHeight: 66, borderRadius: 19, backgroundColor: COLORS.paperBright, borderWidth: 1, borderColor: COLORS.line, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 11 },
  dailySeal: { width: 36, height: 36, borderRadius: 13, backgroundColor: '#FAE8BF', alignItems: 'center', justifyContent: 'center' },
  dailySealText: { color: '#9F7024', fontFamily: TYPE.display, fontWeight: '700', fontSize: 19 },
  dailyTextWrap: { flex: 1, gap: 4 },
  dailyTitle: { color: COLORS.ink, fontSize: 14, fontWeight: '800' },
  dailySubtitle: { color: COLORS.muted, fontSize: 10.5 },
  chevron: { color: COLORS.inkSoft, fontSize: 27, fontWeight: '300', marginTop: -4 },
  pressed: { opacity: 0.75 },
  homeFooter: { marginTop: 22, minHeight: 57, borderTopWidth: 1, borderColor: COLORS.line, flexDirection: 'row', alignItems: 'center', gap: 13 },
  recordPill: { minWidth: 57 },
  recordLabel: { color: COLORS.muted, fontSize: 8, fontWeight: '800', letterSpacing: 1.2 },
  recordValue: { marginTop: 3, color: COLORS.ink, fontFamily: TYPE.mono, fontSize: 14, fontWeight: '700' },
  footerDivider: { width: 1, height: 26, backgroundColor: COLORS.line },
  footerStat: { minWidth: 52 },
  statsLink: { marginLeft: 'auto', color: COLORS.inkSoft, fontSize: 11, fontWeight: '700' },
  offlineNote: { textAlign: 'center', color: '#A9A69D', fontSize: 8, fontWeight: '700', letterSpacing: 1.6, marginTop: 10 },
  gamePage: { flex: 1, paddingHorizontal: 18, paddingBottom: 10, justifyContent: 'space-between' },
  gameHeader: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modeChip: { height: 29, borderRadius: 12, paddingHorizontal: 10, backgroundColor: '#EFE9DD', flexDirection: 'row', alignItems: 'center', gap: 6 },
  modeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.coral },
  modeText: { color: COLORS.inkSoft, fontSize: 9, fontWeight: '900', letterSpacing: 1.3 },
  levelCount: { minWidth: 42, alignItems: 'flex-end' },
  levelText: { color: COLORS.muted, fontFamily: TYPE.mono, fontSize: 10, fontWeight: '700' },
  scorePanel: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, paddingHorizontal: 7 },
  scoreMain: { gap: 2 },
  scoreLabel: { color: COLORS.muted, fontSize: 9, fontWeight: '800', letterSpacing: 1.5 },
  scoreNumber: { color: COLORS.ink, fontFamily: TYPE.mono, fontSize: 34, fontWeight: '800', letterSpacing: -1.5 },
  scoreSide: { minWidth: 98, paddingLeft: 15, borderLeftWidth: 1, borderColor: COLORS.line, alignItems: 'flex-end', gap: 3 },
  scoreSideLabel: { color: COLORS.muted, fontSize: 8, fontWeight: '800', letterSpacing: 1 },
  scoreSideValue: { color: COLORS.inkSoft, fontFamily: TYPE.mono, fontSize: 14, fontWeight: '700' },
  goalRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 7, marginBottom: 5 },
  goalText: { color: COLORS.inkSoft, fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },
  goalTrack: { flex: 1, height: 4, borderRadius: 9, overflow: 'hidden', backgroundColor: '#E8DFD0' },
  goalFill: { height: 4, borderRadius: 8, backgroundColor: COLORS.coral },
  goalValue: { color: COLORS.muted, fontFamily: TYPE.mono, fontSize: 9 },
  boardStage: { alignItems: 'center', justifyContent: 'center', position: 'relative' },
  clearToast: { position: 'absolute', top: -14, alignSelf: 'center', paddingHorizontal: 13, paddingVertical: 7, minWidth: 62, borderRadius: 13, backgroundColor: COLORS.ink, alignItems: 'center', zIndex: 10, shadowColor: COLORS.shadow, shadowOpacity: 0.16, shadowOffset: { width: 0, height: 3 }, shadowRadius: 6, elevation: 4 },
  clearToastText: { color: COLORS.white, fontFamily: TYPE.mono, fontWeight: '800', fontSize: 13 },
  chainToast: { marginTop: 2, color: '#FFCB70', fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  gameHint: { minHeight: 45, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 3 },
  hintGlyph: { width: 25, height: 25, borderRadius: 9, backgroundColor: '#F3E8D5', alignItems: 'center', justifyContent: 'center' },
  hintGlyphText: { color: COLORS.coral, fontSize: 14 },
  hintCopy: { color: COLORS.inkSoft, fontWeight: '700', fontSize: 13, flex: 1 },
  hintRight: { color: '#A6A298', fontSize: 8, letterSpacing: 1, fontWeight: '800' },
  chainTag: { color: COLORS.coralDeep, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  colorLegend: { height: 31, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  legendDot: { width: 7, height: 7, borderRadius: 3.5, marginRight: 1 },
  legendCopy: { color: '#A6A298', fontSize: 7.5, letterSpacing: 1.25, fontWeight: '800', marginLeft: 5 },
  simplePage: { flex: 1, paddingHorizontal: 25, alignItems: 'center', justifyContent: 'center' },
  simpleContent: { flexGrow: 1, paddingHorizontal: 22, paddingBottom: 35 },
  simpleHeader: { minHeight: 52, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  simpleEyebrow: { fontSize: 9, color: COLORS.muted, fontWeight: '900', letterSpacing: 1.7 },
  simpleTitle: { marginTop: 12, marginBottom: 24, fontFamily: TYPE.display, color: COLORS.ink, fontSize: 32 },
  resultMark: { width: 58, height: 58, borderRadius: 21, backgroundColor: '#F5E4CB', alignItems: 'center', justifyContent: 'center', marginBottom: 21 },
  resultMarkText: { color: COLORS.coral, fontFamily: TYPE.display, fontSize: 25, fontWeight: '700' },
  resultEyebrow: { color: COLORS.muted, fontSize: 9, fontWeight: '900', letterSpacing: 1.8 },
  resultTitle: { color: COLORS.ink, fontFamily: TYPE.display, fontSize: 28, textAlign: 'center', marginTop: 9 },
  resultScore: { color: COLORS.ink, fontFamily: TYPE.mono, fontSize: 54, fontWeight: '800', marginTop: 16 },
  resultCaption: { color: COLORS.inkSoft, fontSize: 13, marginTop: 2 },
  dailyRecord: { color: COLORS.coralDeep, fontSize: 10, fontWeight: '900', letterSpacing: 1, marginTop: 14 },
  resultDecor: { height: 162, alignItems: 'center', justifyContent: 'center' },
  resultButtons: { width: '100%', gap: 9 },
  secondaryButton: { height: 52, borderRadius: 17, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.paperBright, alignItems: 'center', justifyContent: 'center' },
  secondaryTitle: { color: COLORS.inkSoft, fontSize: 14, fontWeight: '800' },
  statHero: { padding: 22, borderRadius: 22, backgroundColor: COLORS.ink, marginBottom: 14 },
  statHeroLabel: { color: '#BFC9C1', fontSize: 9, fontWeight: '800', letterSpacing: 1.6 },
  statHeroNumber: { color: COLORS.paperBright, fontFamily: TYPE.mono, fontSize: 39, fontWeight: '800', marginTop: 9 },
  statHeroNote: { color: '#BFC9C1', fontSize: 12, marginTop: 3 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard: { width: '48%', minHeight: 104, borderRadius: 17, padding: 13, backgroundColor: COLORS.paperBright, borderWidth: 1, borderColor: COLORS.line, flexGrow: 1 },
  statAccent: { width: 17, height: 4, borderRadius: 5, marginBottom: 10 },
  statCardLabel: { color: COLORS.muted, fontSize: 8, fontWeight: '900', letterSpacing: 1.2 },
  statCardValue: { color: COLORS.ink, fontSize: 18, fontWeight: '800', marginTop: 7 },
  localNote: { marginTop: 20, color: COLORS.muted, fontSize: 12, textAlign: 'center', lineHeight: 18 },
  helpCard: { borderRadius: 21, backgroundColor: COLORS.paperBright, borderWidth: 1, borderColor: COLORS.line, paddingHorizontal: 16, paddingVertical: 2 },
  helpStep: { flexDirection: 'row', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderColor: '#EEE9DF' },
  helpStepDot: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  helpStepNumber: { color: COLORS.white, fontSize: 9, fontFamily: TYPE.mono, fontWeight: '800' },
  helpStepText: { flex: 1, gap: 3 },
  helpStepTitle: { color: COLORS.ink, fontSize: 14, fontWeight: '800' },
  helpStepBody: { color: COLORS.inkSoft, fontSize: 12, lineHeight: 17 },
  helpModes: { marginTop: 17, borderRadius: 18, backgroundColor: '#EFE9DD', padding: 16 },
  helpModesTitle: { color: COLORS.ink, fontSize: 9, fontWeight: '900', letterSpacing: 1.4, marginBottom: 8 },
  helpModesBody: { color: COLORS.inkSoft, fontSize: 12, lineHeight: 20 },
  bold: { color: COLORS.ink, fontWeight: '900' },
  settingsCard: { borderRadius: 21, backgroundColor: COLORS.paperBright, borderWidth: 1, borderColor: COLORS.line, paddingHorizontal: 16 },
  preferenceRow: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderColor: '#EEE9DF' },
  preferenceCopy: { flex: 1, gap: 4 },
  preferenceTitle: { color: COLORS.ink, fontWeight: '800', fontSize: 14 },
  preferenceDescription: { color: COLORS.muted, fontSize: 11 },
  switchTrack: { width: 47, height: 29, borderRadius: 15, backgroundColor: '#DED8CC', justifyContent: 'center', padding: 3 },
  switchOn: { backgroundColor: COLORS.mint },
  switchThumb: { width: 23, height: 23, borderRadius: 12, backgroundColor: COLORS.white },
  switchThumbOn: { alignSelf: 'flex-end' },
  settingsAbout: { marginTop: 30, alignItems: 'center', gap: 15 },
  aboutCopy: { color: COLORS.inkSoft, fontFamily: TYPE.display, fontStyle: 'italic', textAlign: 'center', fontSize: 16, lineHeight: 24, paddingHorizontal: 9 },
  versionText: { color: '#A6A298', fontSize: 8, fontWeight: '800', letterSpacing: 1.2 },
});
