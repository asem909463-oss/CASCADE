import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import {
  Animated,
  AccessibilityInfo,
  AppState,
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
  GROUP_BONUS_PER_TILE_OVER_FOUR,
  POINTS_PER_TILE,
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
import { completeDailyChallenge, DEFAULT_SAVE, GameSnapshot, getActiveDailyStreak, loadSave, saveData, SaveData } from './src/storage/save';
import { COLORS, TYPE } from './src/theme/tokens';
import { CAMPAIGN_CHAPTERS, CAMPAIGN_LEVEL_COUNT, campaignObjectiveLabel, createCampaignBoard, getCampaignLevel, isCampaignObjectiveComplete, starsForCampaignWin } from './src/game/campaign';
import { completeCampaignLevel } from './src/storage/save';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const ButtonFeedbackContext = React.createContext<() => void>(() => undefined);
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const DAILY_MOVES = 20;
const DAILY_GOAL = 10_000;
type Screen = 'home' | 'campaign' | 'game' | 'stats' | 'help' | 'settings' | 'privacy' | 'result';
type Mode = 'endless' | 'daily' | 'campaign';

export default function App() {
  const { width: screenWidth } = useWindowDimensions();
  const boardWidth = Math.min(screenWidth - 36, 430);
  const popSound = useAudioPlayer(require('./assets/pop.wav'));
  const chainSound = useAudioPlayer(require('./assets/chain.wav'));
  const [screen, setScreen] = useState<Screen>('home');
  const [mode, setMode] = useState<Mode>('endless');
  const [campaignLevel, setCampaignLevel] = useState(1);
  const [campaignWon, setCampaignWon] = useState(false);
  const [board, setBoard] = useState<Board>(() => createBoard());
  const [score, setScore] = useState(0);
  const [chain, setChain] = useState(0);
  const [movesLeft, setMovesLeft] = useState(DAILY_MOVES);
  const [gameDate, setGameDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [inputLocked, setInputLocked] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [save, setSave] = useState<SaveData>({ ...DEFAULT_SAVE });
  const saveRef = useRef(save);
  saveRef.current = save;
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

  useEffect(() => {
    if (!hydrated) return;
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'inactive' || nextState === 'background') {
        void saveData(saveRef.current);
      }
    });
    return () => subscription.remove();
  }, [hydrated]);

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

  const startGame = useCallback((nextMode: Mode, requestedLevel = campaignLevel) => {
    const now = new Date();
    const challengeDate = now.toISOString().slice(0, 10);
    const level = getCampaignLevel(requestedLevel);
    const seed = nextMode === 'daily' ? seedFromDate(now) : nextMode === 'campaign' ? level.seed : Math.floor(Math.random() * 0x1_0000_0000);
    const random = mulberry32(seed);
    randomRef.current = random;
    const nextBoard = nextMode === 'campaign' ? createCampaignBoard(requestedLevel) : createBoard(random);
    if (nextMode === 'campaign') { setCampaignLevel(level.number); setCampaignWon(false); }
    setMode(nextMode);
    setBoard(nextBoard);
    setScore(0);
    tilesClearedRef.current = 0;
    bestAtStartRef.current = save.highScore;
    setGameDate(challengeDate);
    setChain(0);
    setLastClear(null);
    setSelectedPosition(null);
    setMovesLeft(nextMode === 'campaign' ? level.moveLimit : DAILY_MOVES);
    if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    inputLockedRef.current = false;
    setInputLocked(false);
    finishedRef.current = false;
    if (nextMode !== 'campaign') {
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
    } else {
      setSave((current) => ({ ...current, currentRun: null }));
    }
    setScreen('game');
  }, [campaignLevel, save.highScore]);

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

  const finishGame = useCallback((finalScore: number, tilesCleared: number, campaignSuccess = false) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    const level = mode === 'campaign' ? getCampaignLevel(campaignLevel) : null;
    const wonCampaign = !!level && campaignSuccess;
    if (mode === 'campaign') setCampaignWon(wonCampaign);
    setSave((current) => ({
      ...current,
      highScore: Math.max(current.highScore, finalScore),
      gamesPlayed: current.gamesPlayed + 1,
      totalTilesCleared: current.totalTilesCleared + tilesCleared,
      ...(mode === 'daily'
        ? {
            dailyDate: gameDate,
            ...completeDailyChallenge(current, gameDate),
            dailyBest: Math.max(current.dailyBest, finalScore),
            dailyScores: {
              ...current.dailyScores,
              [gameDate]: Math.max(current.dailyScores[gameDate] ?? 0, finalScore),
            },
          }
        : {}),
      ...(wonCampaign && level ? completeCampaignLevel(current, level.number, finalScore, starsForCampaignWin(finalScore, level.targetScore)) : {}),
      currentRun: null,
    }));
    setScreen('result');
  }, [campaignLevel, gameDate, mode]);

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
    if (mode === 'daily' || mode === 'campaign') {
      const left = movesLeft - 1;
      nextMovesLeft = left;
      setMovesLeft(left);
      const levelGoalReached = mode === 'campaign' && isCampaignObjectiveComplete(getCampaignLevel(campaignLevel), nextScore, tilesClearedRef.current, result.chainCount);
      if (levelGoalReached || left <= 0 || result.gameOver) {
        finishGame(nextScore, tilesClearedRef.current, levelGoalReached);
        return;
      }
    } else if (result.gameOver || !hasValidMove(result.board)) {
      finishGame(nextScore, tilesClearedRef.current);
      return;
    }
    if (mode !== 'campaign') {
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
      setSave((current) => ({ ...current, currentRun: snapshot }));
    }
  }, [board, campaignLevel, clearFade, feedback, finishGame, gameDate, mode, movesLeft, reduceMotion, score, selectedPosition]);

  const playAgain = () => startGame(mode, mode === 'campaign' && campaignWon ? Math.min(500, campaignLevel + 1) : campaignLevel);
  const startCampaignLevel = (level: number) => {
    if (!save.currentRun) { startGame('campaign', level); return; }
    Alert.alert('Start a campaign puzzle?', 'Your unfinished run will be replaced by this puzzle.', [
      { text: 'Keep current run', style: 'cancel' },
      { text: 'Start puzzle', style: 'destructive', onPress: () => startGame('campaign', level) },
    ]);
  };
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
      <ScreenEntrance key={screen} reduceMotion={reduceMotion}>
      {screen === 'home' && (
        <HomeScreen
          width={screenWidth}
          save={save}
          onResume={resumeGame}
          onCampaign={() => setScreen('campaign')}
          onPlay={() => requestStartGame('endless')}
          onDaily={() => requestStartGame('daily')}
          onStats={() => setScreen('stats')}
          onHelp={() => setScreen('help')}
          onSettings={() => setScreen('settings')}
        />
      )}
      {screen === 'campaign' && <CampaignScreen save={save} onBack={backToHome} onStart={startCampaignLevel} />}
      {screen === 'game' && (
        <GameScreen
          width={screenWidth}
          boardWidth={boardWidth}
          board={board}
          mode={mode}
          dailyDate={gameDate}
          campaignLevel={campaignLevel}
          score={score}
          best={save.highScore}
          campaignObjective={mode === 'campaign' ? campaignObjectiveLabel(getCampaignLevel(campaignLevel)) : ''}
          campaignProgress={mode !== 'campaign' ? 0 : getCampaignLevel(campaignLevel).objective === 'score' ? score / getCampaignLevel(campaignLevel).targetScore : getCampaignLevel(campaignLevel).objective === 'tiles' ? tilesClearedRef.current / getCampaignLevel(campaignLevel).objectiveTarget : chain / getCampaignLevel(campaignLevel).objectiveTarget}
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
          campaignLevel={campaignLevel}
          campaignWon={campaignWon}
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
      </ScreenEntrance>
        </>
      )}
      </SafeAreaView>
      </ButtonFeedbackContext.Provider>
    </SafeAreaProvider>
  );
}

function HomeScreen({
  width,
  onCampaign,
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
  onCampaign: () => void;
  onResume: () => void;
  onPlay: () => void;
  onDaily: () => void;
  onStats: () => void;
  onHelp: () => void;
  onSettings: () => void;
}) {
  const previewWidth = Math.min(width - 64, 246);
  const activeDailyStreak = getActiveDailyStreak(save);
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
          <Text style={styles.eyebrow}>{save.gamesPlayed === 0 ? 'WELCOME TO YOUR FIRST CASCADE' : 'A MOMENT OF FLOW'}</Text>
        </View>
        <Text style={styles.wordmark}>CASCADE</Text>
        <Text style={styles.homeSubtitle}>{save.gamesPlayed === 0 ? 'Your first little cascade starts here.' : 'Clear a little space. Find your rhythm.'}</Text>
      </View>
      <View style={styles.previewSection}>
        <View style={styles.previewHeading}>
          <Text style={styles.previewKicker}>THE BOARD IS YOURS</Text>
          <Text style={styles.previewCaption}>Find a group. Preview the points. Make your move.</Text>
        </View>
        <BoardGrid
          board={HOME_PREVIEW_BOARD}
          width={previewWidth}
          onTap={() => undefined}
          previewPositions={HOME_PREVIEW_GROUP}
          disabled
          reduceMotion
        />
      </View>
      <View style={styles.dailyStreakBanner}>
        <Text style={styles.dailyStreakSpark}>✦</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.dailyStreakTitle}>THE DAILY SPARK</Text>
          <Text style={styles.dailyStreakCopy}>{activeDailyStreak > 0 ? `${activeDailyStreak} day${activeDailyStreak === 1 ? '' : 's'} in a row — keep your rhythm` : 'Complete today’s puzzle to start a new streak'}</Text>
        </View>
        <Text style={styles.dailyStreakCount}>{activeDailyStreak}</Text>
      </View>
      <View style={styles.menuActions}>
        {save.currentRun && (
          <GameButton
            onPress={onResume}
            accessibilityLabel={save.currentRun.mode === 'daily' ? 'Resume daily puzzle' : 'Resume endless run'}
            style={styles.resumeCard}
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
          </GameButton>
        )}
        <PrimaryButton title="Puzzle journey" subtitle={`${save.campaignUnlockedLevel - 1} of 500 levels completed · Continue your campaign`} onPress={onCampaign} />
        <SecondaryButton title="Play endless instead" onPress={onPlay} />
        <GameButton onPress={onDaily} style={styles.dailyCard}>
          <View style={styles.dailySeal}><Text style={styles.dailySealText}>D</Text></View>
          <View style={styles.dailyTextWrap}>
            <Text style={styles.dailyTitle}>Daily puzzle</Text>
            <Text style={styles.dailySubtitle}>{save.dailyScores[new Date().toISOString().slice(0, 10)] !== undefined ? 'Today complete · replay to beat your score' : `${formatDailyDate()} · same board for everyone`}</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </GameButton>
      </View>
      <View style={styles.homeFooter}>
        <GameButton onPress={onStats} style={styles.recordPill} accessibilityLabel={`Personal best ${save.highScore}`}>
          <Text style={styles.recordLabel}>BEST</Text>
          <Text style={styles.recordValue}>{save.highScore.toLocaleString()}</Text>
        </GameButton>
        <View style={styles.footerDivider} />
        <View style={styles.footerStat}>
          <Text style={styles.recordLabel}>PUZZLES</Text>
          <Text style={styles.recordValue}>{save.gamesPlayed}</Text>
        </View>
        <GameButton onPress={onStats} style={styles.statsLinkButton}><Text style={styles.statsLink}>Your journey ↗</Text></GameButton>
      </View>
      <Text style={styles.offlineNote}>MADE FOR THE LITTLE PAUSES</Text>
    </ScrollView>
  );
}

const HOME_PREVIEW_BOARD = createBoard(mulberry32(0xca5cade));
const HOME_PREVIEW_GROUP = (() => {
  for (let row = 0; row < HOME_PREVIEW_BOARD.length; row += 1) {
    for (let col = 0; col < HOME_PREVIEW_BOARD[row].length; col += 1) {
      const group = findGroup(HOME_PREVIEW_BOARD, { row, col });
      if (group.length >= 3) return group;
    }
  }
  return [];
})();


function CampaignScreen({ save, onBack, onStart }: { save: SaveData; onBack: () => void; onStart: (level: number) => void }) {
  return (
    <SimpleShell title="Puzzle journey" eyebrow="500 PUZZLES · 10 CHAPTERS" onBack={onBack}>
      <View style={styles.campaignIntro}>
        <Text style={styles.campaignIntroTitle}>Think ahead. Make every move count.</Text>
        <Text style={styles.campaignIntroCopy}>Every puzzle has its own objective. Read the board, plan your clears, and earn up to three stars before your moves run out.</Text>
        <View style={styles.campaignProgressRow}>
          <Text style={styles.campaignProgress}>{Math.min(500, save.campaignUnlockedLevel - 1)} / 500 COMPLETED</Text>
          <Text style={styles.campaignProgressPercent}>{Math.round((Math.min(500, save.campaignUnlockedLevel - 1) / 500) * 100)}%</Text>
        </View>
        <View style={styles.campaignProgressTrack}>
          <View style={[styles.campaignProgressFill, { width: `${(Math.min(500, save.campaignUnlockedLevel - 1) / 500) * 100}%` }]} />
        </View>
      </View>
      {CAMPAIGN_CHAPTERS.map((chapter, chapterIndex) => {
        const first = chapterIndex * 50 + 1;
        const completed = Math.max(0, Math.min(50, save.campaignUnlockedLevel - first));
        return (
          <View key={chapter} style={styles.chapterBlock}>
            <View style={styles.chapterHeading}>
              <Text style={styles.chapterNumber}>CHAPTER {String(chapterIndex + 1).padStart(2, '0')}</Text>
              <Text style={styles.chapterTitle}>{chapter}</Text>
              <Text style={styles.chapterProgress}>{completed}/50</Text>
            </View>
            <View style={styles.chapterProgressTrack}>
              <View style={[styles.chapterProgressFill, { width: `${(completed / 50) * 100}%` }]} />
            </View>
            <View style={styles.levelGrid}>
              {Array.from({ length: 50 }, (_, index) => {
                const level = first + index;
                const unlocked = level <= save.campaignUnlockedLevel;
                const stars = save.campaignStars[String(level)] ?? 0;
                return (
                  <GameButton key={level} disabled={!unlocked} onPress={() => onStart(level)} style={[styles.levelCell, stars > 0 && styles.levelComplete, !unlocked && styles.levelLocked, level === save.campaignUnlockedLevel && styles.levelCurrent]}>
                    <Text style={[styles.levelCellText, !unlocked && styles.levelLockedText]}>{unlocked ? level : '·'}</Text>
                    <Text style={styles.levelStars}>{stars ? '★'.repeat(stars) : unlocked ? '○' : ''}</Text>
                  </GameButton>
                );
              })}
            </View>
          </View>
        );
      })}
    </SimpleShell>
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
  const float = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const motion = Animated.loop(Animated.sequence([
      Animated.timing(float, { toValue: 1, duration: 1900, useNativeDriver: true }),
      Animated.timing(float, { toValue: 0, duration: 1900, useNativeDriver: true }),
    ]));
    motion.start();
    return () => motion.stop();
  }, [float]);
  const colors = [COLORS.coral, COLORS.gold, COLORS.mint, COLORS.blue, COLORS.violet];
  const sequence = [0, 2, 1, 3, 1, 0, 4, 2, 3, 4, 0, 2, 1, 3, 4, 0];
  return (
    <View style={[styles.mosaicWrap, { width, height: width * 0.68 }]}>
      <View style={[styles.mosaicOrb, { width: width * 0.72, height: width * 0.72, borderRadius: width }]} />
      <Animated.View style={{ transform: [
        { translateY: float.interpolate({ inputRange: [0, 1], outputRange: [0, -7] }) },
        { scale: float.interpolate({ inputRange: [0, 1], outputRange: [1, 1.025] }) },
      ] }}>
      <View style={styles.mosaicGrid}>
        {sequence.map((color, index) => (
          <View key={index} style={[styles.mosaicTile, { backgroundColor: colors[color], transform: [{ rotate: `${(index % 3 - 1) * 3}deg` }] }]}>
            <View style={styles.mosaicGlint} />
          </View>
        ))}
      </View>
      </Animated.View>
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
  campaignLevel,
  campaignObjective,
  campaignProgress,
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
  campaignLevel: number;
  campaignObjective: string;
  campaignProgress: number;
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
            : mode === 'campaign' ? `JOURNEY · LEVEL ${campaignLevel}` : 'ENDLESS'}</Text>
        </View>
        <View style={styles.levelCount}><Text style={styles.levelText}>08 × 08</Text></View>
      </View>
      <View style={styles.scorePanel}>
        <View style={styles.scoreMain}>
          <Text style={styles.scoreLabel}>{mode === 'daily' ? 'CHALLENGE SCORE' : 'YOUR SCORE'}</Text>
          <Text style={styles.scoreNumber}>{score.toLocaleString()}</Text>
        </View>
        <View style={styles.scoreSide}>
          {mode === 'daily' || mode === 'campaign' ? (
            <><Text style={styles.scoreSideLabel}>MOVES LEFT</Text><Text style={styles.scoreSideValue}>{String(movesLeft).padStart(2, '0')}</Text></>
          ) : (
            <><Text style={styles.scoreSideLabel}>PERSONAL BEST</Text><Text style={styles.scoreSideValue}>{best.toLocaleString()}</Text></>
          )}
        </View>
      </View>
      {(mode === 'daily' || mode === 'campaign') && (
        <View style={styles.goalPanel}>
          <View style={styles.goalMeta}>
            <Text style={styles.goalText}>{mode === 'campaign' ? 'LEVEL OBJECTIVE' : 'DAILY TARGET'}</Text>
            <Text style={styles.goalValue}>{mode === 'campaign' ? campaignObjective : DAILY_GOAL.toLocaleString()}</Text>
          </View>
          <View style={styles.goalTrack}>
            <View style={[styles.goalFill, { width: `${Math.min(100, (mode === 'campaign' ? campaignProgress : score / DAILY_GOAL) * 100)}%` }]} />
          </View>
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
            ? `${findGroup(board, selectedPosition).length} stones · +${(findGroup(board, selectedPosition).length * POINTS_PER_TILE + Math.max(0, findGroup(board, selectedPosition).length - 4) * GROUP_BONUS_PER_TILE_OVER_FOUR).toLocaleString()} · tap again to clear`
            : `Inspect a group, then commit your move${mode === 'daily' ? ' · 20 moves' : mode === 'campaign' ? ` · goal ${getCampaignLevel(campaignLevel).targetScore.toLocaleString()}` : ''}`}
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
  campaignLevel,
  campaignWon,
  score,
  isNewBest,
  dailyBest,
  onAgain,
  onHome,
}: {
  mode: Mode;
  dailyDate: string;
  campaignLevel: number;
  campaignWon: boolean;
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
        : mode === 'campaign' ? `PUZZLE JOURNEY · LEVEL ${campaignLevel}` : 'A LOVELY LITTLE RUN'}</Text>
      <Text style={styles.resultTitle}>{mode === 'campaign' ? (campaignWon ? 'Puzzle solved!' : 'Not quite yet.') : isNewBest ? 'New personal best.' : 'Nicely done.'}</Text>
      <Text style={styles.resultScore}>{score.toLocaleString()}</Text>
      <Text style={styles.resultCaption}>{mode === 'campaign' ? (campaignWon ? `${starsForCampaignWin(score, getCampaignLevel(campaignLevel).targetScore)} stars earned · new puzzle unlocked` : `Objective: ${campaignObjectiveLabel(getCampaignLevel(campaignLevel))}`) : mode === 'daily' ? 'points in this daily challenge' : 'points · every little chain counts'}</Text>
      {mode === 'daily' && <Text style={styles.dailyRecord}>CHALLENGE BEST · {dailyBest.toLocaleString()}</Text>}
      <View style={styles.resultDecor}><MiniMosaic width={176} /></View>
      <View style={styles.resultButtons}>
        <PrimaryButton
          title={mode === 'campaign' ? (campaignWon ? (campaignLevel >= 500 ? 'Replay final puzzle' : 'Next puzzle') : 'Try this puzzle again') : mode === 'daily' ? (isCurrentDaily ? 'Play today again' : 'Start today’s challenge') : 'Play another round'}
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
      <StatCard label="DAILY SPARK STREAK" value={`${getActiveDailyStreak(save)} days`} accent={COLORS.coral} />
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
      <GameButton
        accessibilityRole="switch"
        accessibilityState={{ checked: enabled }}
        accessibilityLabel={title}
        onPress={onPress}
        style={[styles.switchTrack, enabled && styles.switchOn]}
      >
        <View style={[styles.switchThumb, enabled && styles.switchThumbOn]} />
      </GameButton>
    </View>
  );
}

function ScreenEntrance({ children, reduceMotion }: { children: React.ReactNode; reduceMotion: boolean }) {
  const progress = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  useEffect(() => {
    if (reduceMotion) { progress.setValue(1); return; }
    progress.setValue(0);
    Animated.spring(progress, { toValue: 1, speed: 17, bounciness: 3, useNativeDriver: true }).start();
  }, [progress, reduceMotion]);
  return <Animated.View style={{ flex: 1, opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }}>{children}</Animated.View>;
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
    <GameButton accessibilityLabel={label} onPress={onPress} style={styles.iconButton}>
      <Text style={[styles.iconButtonText, icon === '‹' && styles.backGlyph]}>{icon}</Text>
    </GameButton>
  );
}

function PrimaryButton({ title, subtitle, onPress }: { title: string; subtitle?: string; onPress: () => void }) {
  return (
    <GameButton onPress={onPress} style={styles.primaryButton}>
      <View style={styles.primaryTextWrap}>
        <Text style={styles.primaryTitle}>{title}</Text>
        {!!subtitle && <Text style={styles.primarySubtitle}>{subtitle}</Text>}
      </View>
      <View style={styles.primaryArrow}><Text style={styles.primaryArrowText}>↗</Text></View>
    </GameButton>
  );
}

function SecondaryButton({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <GameButton onPress={onPress} style={styles.secondaryButton}>
      <Text style={styles.secondaryTitle}>{title}</Text>
    </GameButton>
  );
}

function GameButton({
  children,
  onPress,
  style,
  accessibilityLabel,
  accessibilityRole = 'button',
  accessibilityState,
  disabled = false,
}: {
  children: React.ReactNode;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityRole?: 'button' | 'switch';
  accessibilityState?: { checked?: boolean; disabled?: boolean; selected?: boolean; expanded?: boolean; busy?: boolean };
  disabled?: boolean;
}) {
  const playFeedback = React.useContext(ButtonFeedbackContext);
  const scale = useRef(new Animated.Value(1)).current;
  const pressIn = () => Animated.spring(scale, { toValue: 0.965, speed: 28, bounciness: 5, useNativeDriver: true }).start();
  const pressOut = () => Animated.spring(scale, { toValue: 1, speed: 24, bounciness: 5, useNativeDriver: true }).start();
  return (
    <AnimatedPressable
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={accessibilityState}
      disabled={disabled}
      onPressIn={pressIn}
      onPressOut={pressOut}
      onPress={() => { playFeedback(); onPress(); }}
      style={[style, { transform: [{ scale }] }]}
    >
      {children}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.paper },
  loadingPage: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 15 },
  loadingCopy: { color: COLORS.inkSoft, fontFamily: TYPE.display, fontStyle: 'italic', fontSize: 16 },
  homeContent: { flexGrow: 1, paddingHorizontal: 22, paddingBottom: 20 },
  campaignIntro: { backgroundColor: '#FFF0D6', padding: 17, marginBottom: 18, borderRadius: 20, borderWidth: 1, borderColor: '#FFE2B2' },
  campaignIntroTitle: { color: COLORS.ink, fontSize: 18, fontWeight: '900', letterSpacing: -0.25 },
  campaignIntroCopy: { color: COLORS.inkSoft, fontSize: 12, lineHeight: 18, marginTop: 7 },
  campaignProgressRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, marginBottom: 7 },
  campaignProgress: { color: COLORS.coralDeep, fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  campaignProgressPercent: { color: COLORS.inkSoft, fontFamily: TYPE.mono, fontSize: 10, fontWeight: '800' },
  campaignProgressTrack: { height: 7, borderRadius: 8, overflow: 'hidden', backgroundColor: '#F6DDB8' },
  campaignProgressFill: { height: 7, borderRadius: 8, backgroundColor: COLORS.coral },
  chapterBlock: { marginBottom: 16, padding: 13, borderRadius: 19, backgroundColor: COLORS.paperBright, borderWidth: 1, borderColor: COLORS.line },
  chapterHeading: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 8 },
  chapterProgressTrack: { height: 4, borderRadius: 8, backgroundColor: '#F2E9DC', overflow: 'hidden', marginBottom: 12 },
  chapterProgressFill: { height: 4, borderRadius: 8, backgroundColor: COLORS.mint },
  chapterNumber: { color: COLORS.coralDeep, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  chapterTitle: { flex: 1, color: COLORS.ink, fontSize: 16, fontWeight: '800' },
  chapterProgress: { color: COLORS.muted, fontSize: 10, fontWeight: '800' },
  levelGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  levelCell: { width: '17%', minWidth: 43, aspectRatio: 1, backgroundColor: COLORS.paperBright, borderRadius: 12, borderWidth: 1, borderColor: COLORS.line, alignItems: 'center', justifyContent: 'center' },
  levelCurrent: { backgroundColor: '#FFE1D5', borderColor: COLORS.coral, borderWidth: 2 },
  levelComplete: { backgroundColor: '#FFF3D5', borderColor: '#F2D28A' },
  levelLocked: { backgroundColor: '#F1EAE0', opacity: 0.75 },
  levelCellText: { color: COLORS.ink, fontSize: 12, fontWeight: '900' },
  levelLockedText: { color: COLORS.muted },
  levelStars: { color: '#D69A36', fontSize: 7, minHeight: 9, letterSpacing: 0.2 },
  homeHeader: { height: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brandLockup: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  brandIcon: { width: 28, height: 27, justifyContent: 'center', alignItems: 'center' },
  brandStone: { position: 'absolute', width: 12, height: 8, borderRadius: 4, backgroundColor: COLORS.coral, transform: [{ rotate: '-34deg' }] },
  stoneTop: { top: 3, left: 10, backgroundColor: COLORS.gold },
  stoneMid: { top: 10, left: 5, backgroundColor: COLORS.mint },
  stoneLow: { top: 17, left: 11, backgroundColor: COLORS.coral },
  brandName: { fontSize: 13, color: COLORS.ink, fontWeight: '900', letterSpacing: 2.1 },
  headerActions: { flexDirection: 'row', gap: 8 },
  iconButton: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF0DF', borderWidth: 1, borderColor: COLORS.line },
  iconButtonText: { fontSize: 20, color: COLORS.ink, fontWeight: '500', marginTop: -1 },
  backGlyph: { fontSize: 35, fontWeight: '300', lineHeight: 39, marginTop: -6 },
  homeHero: { alignItems: 'center', marginTop: 22 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 9 },
  eyebrowDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.coral },
  eyebrow: { fontSize: 10, letterSpacing: 2.0, fontWeight: '800', color: COLORS.inkSoft },
  wordmark: { fontFamily: TYPE.display, fontSize: 42, letterSpacing: 3.1, color: COLORS.ink, lineHeight: 49 },
  homeSubtitle: { marginTop: 8, textAlign: 'center', fontFamily: TYPE.display, fontStyle: 'italic', fontSize: 17, color: COLORS.inkSoft, lineHeight: 24 },
  previewSection: { alignItems: 'center', marginTop: 17, marginBottom: 14 },
  previewHeading: { width: '100%', alignItems: 'center', marginBottom: 10 },
  previewKicker: { color: COLORS.coralDeep, fontSize: 10, fontWeight: '900', letterSpacing: 1.7 },
  previewCaption: { color: COLORS.inkSoft, fontSize: 12, marginTop: 4, textAlign: 'center' },
  mosaicWrap: { alignSelf: 'center', marginTop: 12, marginBottom: 3, alignItems: 'center', justifyContent: 'center' },
  firstRunCard: { minHeight: 68, borderRadius: 19, paddingHorizontal: 15, paddingVertical: 11, backgroundColor: '#FFE4D9', borderWidth: 1, borderColor: '#FFC6B6', marginTop: 5, marginBottom: 7, position: 'relative', justifyContent: 'center' },
  firstRunKicker: { color: '#D96B58', fontSize: 9, fontWeight: '900', letterSpacing: 1.5 },
  firstRunCopy: { color: '#89665A', fontSize: 11, marginTop: 5, paddingRight: 28 },
  firstRunSpark: { position: 'absolute', right: 15, top: 16, color: '#F4A83E', fontSize: 25 },
  dailyStreakBanner: { marginTop: 7, marginBottom: 8, minHeight: 58, borderRadius: 18, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFF0D6', borderWidth: 1, borderColor: '#FFE0AA' },
  dailyStreakSpark: { color: '#F29B38', fontSize: 25, fontWeight: '900' },
  dailyStreakTitle: { color: '#B87531', fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  dailyStreakCopy: { color: '#8F725B', fontSize: 11, marginTop: 3 },
  dailyStreakCount: { color: '#E99C3E', fontFamily: TYPE.mono, fontSize: 23, fontWeight: '900' },
  mosaicOrb: { position: 'absolute', backgroundColor: '#FFF0DF', opacity: 0.92 },
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
  primaryButton: { minHeight: 67, borderRadius: 20, backgroundColor: COLORS.coral, paddingHorizontal: 19, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', shadowColor: COLORS.shadow, shadowOpacity: 0.15, shadowOffset: { width: 0, height: 5 }, shadowRadius: 11, elevation: 3 },
  primaryTextWrap: { gap: 3 },
  primaryTitle: { color: COLORS.white, fontSize: 16, fontWeight: '800', letterSpacing: 0.2 },
  primarySubtitle: { color: '#FFF0E7', fontSize: 11 },
  primaryArrow: { width: 34, height: 34, borderRadius: 12, backgroundColor: COLORS.gold, alignItems: 'center', justifyContent: 'center' },
  primaryArrowText: { color: '#9B5A27', fontSize: 18, fontWeight: '800', marginTop: -2 },
  dailyCard: { minHeight: 66, borderRadius: 19, backgroundColor: COLORS.paperBright, borderWidth: 1, borderColor: COLORS.line, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 11 },
  dailySeal: { width: 36, height: 36, borderRadius: 13, backgroundColor: '#FFE6B2', alignItems: 'center', justifyContent: 'center' },
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
  statsLinkButton: { marginLeft: 'auto', paddingVertical: 10, paddingHorizontal: 4 },
  statsLink: { color: COLORS.inkSoft, fontSize: 11, fontWeight: '700' },
  offlineNote: { textAlign: 'center', color: '#A9A69D', fontSize: 8, fontWeight: '700', letterSpacing: 1.6, marginTop: 10 },
  gamePage: { flex: 1, paddingHorizontal: 18, paddingBottom: 10, justifyContent: 'space-between' },
  gameHeader: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modeChip: { height: 29, borderRadius: 12, paddingHorizontal: 10, backgroundColor: '#EFE9DD', flexDirection: 'row', alignItems: 'center', gap: 6 },
  modeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.coral },
  modeText: { color: COLORS.inkSoft, fontSize: 9, fontWeight: '900', letterSpacing: 1.3 },
  levelCount: { minWidth: 42, alignItems: 'flex-end' },
  levelText: { color: COLORS.muted, fontFamily: TYPE.mono, fontSize: 10, fontWeight: '700' },
  scorePanel: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 15, marginTop: 3, marginBottom: 7, backgroundColor: COLORS.paperBright, borderRadius: 18, borderWidth: 1, borderColor: COLORS.line },
  scoreMain: { gap: 2 },
  scoreLabel: { color: COLORS.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  scoreNumber: { color: COLORS.ink, fontFamily: TYPE.mono, fontSize: 34, fontWeight: '800', letterSpacing: -1.5 },
  scoreSide: { minWidth: 98, paddingLeft: 15, borderLeftWidth: 1, borderColor: COLORS.line, alignItems: 'flex-end', gap: 3 },
  scoreSideLabel: { color: COLORS.muted, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  scoreSideValue: { color: COLORS.inkSoft, fontFamily: TYPE.mono, fontSize: 14, fontWeight: '700' },
  goalPanel: { paddingHorizontal: 13, paddingVertical: 10, marginBottom: 8, borderRadius: 15, backgroundColor: '#FFF1E2', borderWidth: 1, borderColor: '#F4DFC8', gap: 8 },
  goalMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  goalText: { color: COLORS.coralDeep, fontSize: 9, fontWeight: '900', letterSpacing: 0.9 },
  goalTrack: { height: 6, borderRadius: 9, overflow: 'hidden', backgroundColor: '#E8DFD0' },
  goalFill: { height: 6, borderRadius: 8, backgroundColor: COLORS.coral },
  goalValue: { color: COLORS.inkSoft, fontFamily: TYPE.mono, fontSize: 10, fontWeight: '700', flexShrink: 1, textAlign: 'right' },
  boardStage: { alignItems: 'center', justifyContent: 'center', position: 'relative' },
  clearToast: { position: 'absolute', top: -14, alignSelf: 'center', paddingHorizontal: 13, paddingVertical: 7, minWidth: 62, borderRadius: 13, backgroundColor: COLORS.coral, alignItems: 'center', zIndex: 10, shadowColor: COLORS.shadow, shadowOpacity: 0.16, shadowOffset: { width: 0, height: 3 }, shadowRadius: 6, elevation: 4 },
  clearToastText: { color: COLORS.white, fontFamily: TYPE.mono, fontWeight: '800', fontSize: 13 },
  chainToast: { marginTop: 2, color: '#FFCB70', fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  gameHint: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 15, backgroundColor: COLORS.paperBright, borderWidth: 1, borderColor: COLORS.line },
  hintGlyph: { width: 25, height: 25, borderRadius: 9, backgroundColor: '#F3E8D5', alignItems: 'center', justifyContent: 'center' },
  hintGlyphText: { color: COLORS.coral, fontSize: 14 },
  hintCopy: { color: COLORS.inkSoft, fontWeight: '700', fontSize: 13, flex: 1 },
  hintRight: { color: '#A6A298', fontSize: 8, letterSpacing: 1, fontWeight: '800' },
  chainTag: { color: COLORS.coralDeep, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  colorLegend: { height: 31, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  legendDot: { width: 7, height: 7, borderRadius: 3.5, marginRight: 1 },
  legendCopy: { color: '#A6A298', fontSize: 9, letterSpacing: 1.25, fontWeight: '800', marginLeft: 5 },
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
  statHero: { padding: 22, borderRadius: 22, backgroundColor: '#FFE7C4', marginBottom: 14 },
  statHeroLabel: { color: '#A9794B', fontSize: 9, fontWeight: '800', letterSpacing: 1.6 },
  statHeroNumber: { color: '#76533E', fontFamily: TYPE.mono, fontSize: 39, fontWeight: '800', marginTop: 9 },
  statHeroNote: { color: '#9A755A', fontSize: 12, marginTop: 3 },
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
