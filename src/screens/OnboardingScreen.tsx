import React, { useState, useRef, useMemo, useEffect, useId } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Dimensions,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  MicroscopeIcon as Microscope,
  ShieldCheckIcon as ShieldCheck,
  ArrowRightIcon as ArrowRight,
  LightningIcon as Lightning,
  FireIcon as Fire,
  BrainIcon as Brain,
  HeartIcon as Heart,
  CaretLeftIcon as CaretLeft,
  DropIcon as Drop,
  GrainsIcon as Grains,
  ScalesIcon as Scales,
  CheckCircleIcon as CheckCircle,
  CircleIcon as Circle,
  CheckIcon as Check,
  PulseIcon as Pulse,
  MoonIcon as Moon,
  WindIcon as Wind,
  ClockIcon as ClockPh,
  ChartLineIcon as ChartLine,
  DnaIcon as Dna,
  SquaresFourIcon as SquaresFour,
  StackIcon as Stack,
  LockKeyIcon as LockKey,
} from 'phosphor-react-native';
import * as Linking from 'expo-linking';
import Svg, {
  Path,
  Circle as SvgCircle,
  Line as SvgLine,
  Text as SvgText,
  Defs,
  LinearGradient,
  Stop,
} from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import * as SecureStore from 'expo-secure-store';
import { saveUserProfile } from '../utils/userProfile';
import { saveDailyGoals } from '../utils/goals';
import {
  computeDailyGoalsFromMetabolicInputs,
  METABOLIC_INPUTS_KEY,
  ACTIVITY_LABELS,
  type MetabolicInputs,
  type Sex,
  type CalorieGoalMode,
  type ActivityKey,
} from '../utils/tdee';
import { fetchLatestWeightKg, requestHealthPermissions } from '../utils/health';
import { useColors, AppColors } from '../theme';
import { TERMS_URL, PRIVACY_URL } from '../constants/legal';
import { ScreenEnterAnimation } from '../components/ScreenEnterAnimation';

const { width: SCREEN_W } = Dimensions.get('window');

// ─── Slide definitions ────────────────────────────────────────────────────────

const SLIDES = [
  {
    id: 'welcome',
    type: 'welcome' as const,
    title: 'Most “healthy” food is silently damaging your body.',
    subtitle: 'We show you what actually happens after eating.',
  },
  {
    id: 'curiosity_hook',
    type: 'curiosity' as const,
    title: 'Have you ever felt this after eating?',
    subtitle: 'Tap any that apply — or skip with “None.”',
    options: [
      { id: 'tired', label: 'Tired / sleepy', icon: 'moon', color: '#6366F1' },
      { id: 'bloated', label: 'Bloated', icon: 'wind', color: '#0EA5E9' },
      { id: 'hungry_again', label: 'Hungry again quickly', icon: 'clock', color: '#F59E0B' },
      { id: 'brain_fog', label: 'Brain fog', icon: 'brain', color: '#8B5CF6' },
      { id: 'none', label: 'None', icon: 'shield', color: '#94A3B8' },
    ],
  },
  {
    id: 'reframe',
    type: 'reframe' as const,
    title: 'It’s not about calories.\nIt’s about how your body reacts.',
    subtitle: 'The same meal can produce very different glucose curves — sleep, stress, and microbiome all change the response.',
  },
  {
    id: 'authority',
    type: 'authority' as const,
    title: 'We simulate what happens inside the body after every meal.',
    subtitle: '',
  },
  {
    id: 'goal_selection',
    type: 'question' as const,
    title: "What's your main goal?",
    subtitle: 'We tune every scan around this — your alerts, your insights, your targets.',
    options: [
      { id: 'weight_loss', label: 'Reach a healthy weight', desc: 'Smart calorie tracking with body-composition focus.', icon: 'scale', color: '#0EA5E9' },
      { id: 'metabolic', label: 'Balance blood sugar & energy', desc: 'Reduce crashes, manage insulin, feel steady.', icon: 'zap', color: '#F59E0B' },
      { id: 'gut', label: 'Heal my gut & digestion', desc: 'Reduce bloating, identify triggers, restore microbiome.', icon: 'flame', color: '#10B981' },
      { id: 'cognitive', label: 'Sharpen focus & mental clarity', desc: 'Reduce neuro-inflammation, fuel the brain better.', icon: 'brain', color: '#6366F1' },
      { id: 'longevity', label: 'Long-term health & longevity', desc: 'Reduce cellular damage and chronic disease risk.', icon: 'heart', color: '#EF4444' },
    ],
  },
  {
    id: 'challenge',
    type: 'question' as const,
    title: "What's been your biggest challenge?",
    subtitle: 'Be honest — this calibrates what we flag and how we explain your scans.',
    options: [
      { id: 'energy_crashes', label: 'Energy crashes after meals', desc: 'Fatigue, brain fog, needing caffeine to function.', icon: 'zap', color: '#F59E0B' },
      { id: 'dont_know', label: "Not knowing what's actually healthy", desc: 'Conflicting advice, confusing labels, hidden ingredients.', icon: 'brain', color: '#6366F1' },
      { id: 'weight_stuck', label: 'Weight that won\'t move', desc: 'Eating "right" but not seeing results.', icon: 'scale', color: '#0EA5E9' },
      { id: 'gut_issues', label: 'Bloating or digestive discomfort', desc: 'Pain, sluggishness, or reactivity after eating.', icon: 'flame', color: '#10B981' },
      { id: 'blood_sugar', label: 'Blood sugar swings or cravings', desc: 'Constant hunger, mood dips, prediabetes concern.', icon: 'droplets', color: '#EF4444' },
    ],
  },
  {
    id: 'sensitivity',
    type: 'multi_select' as const,
    title: 'Any food triggers?',
    subtitle: 'Select all that apply. We flag these as Critical Alerts in every scan.',
    options: [
      { id: 'dairy', label: 'Dairy / Lactose', desc: 'Casein, lactose, inflammatory milk proteins.', icon: 'milk', color: '#94A3B8' },
      { id: 'gluten', label: 'Gluten / Wheat', desc: 'Gliadin, gluten-containing grains.', icon: 'wheat', color: '#94A3B8' },
      { id: 'sodium', label: 'High Sodium', desc: 'Excess salt, cardiovascular risk.', icon: 'droplets', color: '#94A3B8' },
      { id: 'none', label: 'No specific triggers', desc: 'Analyse for general vitality only.', icon: 'shield', color: '#10B981' },
    ],
  },
  {
    id: 'body_stats',
    type: 'body_stats' as const,
    title: 'Your basics',
    subtitle: 'Used to compute your personal calorie & macro targets. Edit anytime in Profile.',
  },
  {
    id: 'personalizing',
    type: 'personalizing' as const,
  },
  {
    id: 'ai_consent',
    type: 'consent' as const,
  },
  {
    id: 'demo_scan',
    type: 'demo_scan' as const,
  },
];

/** Pre-paywall “wow” step — mirrors real scan overview layout (not persisted). */
const DEMO_SCAN_FOOD = 'Grilled Chicken Salad';
const DEMO_SCAN_SCORE = '7.9';
const DEMO_SCAN_INSIGHT = 'Good for metabolism, but slightly high sodium';

/** Static preview data for onboarding demo charts (not persisted). */
const DEMO_SYSTEM_IMPACT = [
  { label: 'Metabolic', score: 8.2 },
  { label: 'Gut', score: 7.5 },
  { label: 'Cardiovascular', score: 7.9 },
  { label: 'Immune', score: 7.2 },
];
const DEMO_ORGAN_IMPACT = [
  { label: 'Liver', score: 8.0 },
  { label: 'Pancreas', score: 7.6 },
  { label: 'Kidneys', score: 7.8 },
];
/** Longevity score -4..+10 mapped 0..1 on bar */
const DEMO_LONGEVITY_SCORE = 2.6;
const DEMO_GLUCOSE_CURVE: [number, number][] = [
  [0, 92],
  [22, 124],
  [48, 134],
  [72, 108],
  [100, 93],
];

const PERSONALIZING_MESSAGES = [
  'Calibrating your metabolic baseline…',
  'Building your personalised protocol…',
  'Computing daily calorie & macro targets…',
  'Your Nouriva profile is ready',
];

const GOAL_LABELS: Record<string, string> = {
  weight_loss: 'Reach a healthy weight',
  metabolic: 'Balance blood sugar & energy',
  gut: 'Heal my gut & digestion',
  cognitive: 'Sharpen focus & mental clarity',
  longevity: 'Long-term health & longevity',
};

const ACTIVITY_KEYS = Object.keys(ACTIVITY_LABELS) as ActivityKey[];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getScoreColorForNumeric(scoreNum: number, C: AppColors): string {
  if (!Number.isFinite(scoreNum)) return C.textSecondary;
  if (scoreNum < 4.5) return C.scoreLow;
  if (scoreNum < 7.0) return C.scoreMid;
  return C.scoreHigh;
}

function isValidBodyStats(sex: Sex, age: string, heightCm: string, weightKg: string): boolean {
  const a = parseInt(age, 10);
  const h = parseFloat(heightCm);
  const w = parseFloat(weightKg);
  if (sex !== 'male' && sex !== 'female') return false;
  if (!Number.isFinite(a) || a < 14 || a > 100) return false;
  if (!Number.isFinite(h) || h < 100 || h > 250) return false;
  if (!Number.isFinite(w) || w < 30 || w > 300) return false;
  return true;
}

function SlideIcon({ icon, color, size = 20 }: { icon: string; color: string; size?: number }) {
  switch (icon) {
    case 'microscope': return <Microscope size={size} color={color} weight="duotone" />;
    case 'zap': return <Lightning size={size} color={color} weight="duotone" />;
    case 'flame': return <Fire size={size} color={color} weight="duotone" />;
    case 'brain': return <Brain size={size} color={color} weight="duotone" />;
    case 'heart': return <Heart size={size} color={color} weight="duotone" />;
    case 'shield': return <ShieldCheck size={size} color={color} weight="duotone" />;
    case 'activity': return <Pulse size={size} color={color} weight="bold" />;
    case 'milk': return <Drop size={size} color={color} weight="duotone" />;
    case 'wheat': return <Grains size={size} color={color} weight="duotone" />;
    case 'droplets': return <Drop size={size} color={color} weight="duotone" />;
    case 'scale': return <Scales size={size} color={color} weight="duotone" />;
    case 'moon': return <Moon size={size} color={color} weight="duotone" />;
    case 'wind': return <Wind size={size} color={color} weight="duotone" />;
    case 'clock': return <ClockPh size={size} color={color} weight="duotone" />;
    default: return <ShieldCheck size={size} color={color} weight="duotone" />;
  }
}

function DemoStaggerCard({
  anim,
  children,
}: {
  anim: Animated.Value;
  children: React.ReactNode;
}) {
  return (
    <Animated.View
      style={{
        opacity: anim,
        transform: [
          {
            translateY: anim.interpolate({
              inputRange: [0, 1],
              outputRange: [16, 0],
            }),
          },
        ],
        marginBottom: 14,
      }}
    >
      {children}
    </Animated.View>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

interface OnboardingScreenProps {
  onComplete: () => void;
}

export default function OnboardingScreen({ onComplete }: OnboardingScreenProps) {
  const C = useColors();
  const styles = useMemo(() => makeStyles(C), [C]);
  const demoRingGradientId = useId().replace(/:/g, '_');

  const [currentSlide, setCurrentSlide] = useState(0);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [sensitivityMulti, setSensitivityMulti] = useState<string[]>([]);
  const [curiosityMulti, setCuriosityMulti] = useState<string[]>([]);

  // Body stats
  const [bodySex, setBodySex] = useState<Sex>('male');
  const [bodyAge, setBodyAge] = useState('35');
  const [bodyHeightCm, setBodyHeightCm] = useState('175');
  const [bodyWeightKg, setBodyWeightKg] = useState('75');
  const [bodyActivity, setBodyActivity] = useState<ActivityKey>('moderate');
  const [bodyWeightLoading, setBodyWeightLoading] = useState(false);
  const [heightUnit, setHeightUnit] = useState<'cm' | 'in'>('cm');
  const [weightUnit, setWeightUnit] = useState<'kg' | 'lbs'>('kg');

  const heightDisplayValue = heightUnit === 'cm'
    ? bodyHeightCm
    : String(Math.round(parseFloat(bodyHeightCm || '0') / 2.54 * 10) / 10);
  const weightDisplayValue = weightUnit === 'kg'
    ? bodyWeightKg
    : String(Math.round(parseFloat(bodyWeightKg || '0') * 2.20462 * 10) / 10);

  const handleHeightChange = (val: string) => {
    if (heightUnit === 'cm') {
      setBodyHeightCm(val);
    } else {
      const cm = Math.round(parseFloat(val || '0') * 2.54 * 10) / 10;
      setBodyHeightCm(isNaN(cm) ? '' : String(cm));
    }
  };
  const handleWeightChange = (val: string) => {
    if (weightUnit === 'kg') {
      setBodyWeightKg(val);
    } else {
      const kg = Math.round(parseFloat(val || '0') / 2.20462 * 10) / 10;
      setBodyWeightKg(isNaN(kg) ? '' : String(kg));
    }
  };
  const toggleHeightUnit = (unit: 'cm' | 'in') => { Haptics.selectionAsync(); setHeightUnit(unit); };
  const toggleWeightUnit = (unit: 'kg' | 'lbs') => { Haptics.selectionAsync(); setWeightUnit(unit); };

  // Personalizing slide
  const [personalizingStage, setPersonalizingStage] = useState(0);
  const [personalizingDone, setPersonalizingDone] = useState(false);
  const [computedCalories, setComputedCalories] = useState<number | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const personalizingStarted = useRef(false);

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;
  const checkScale = useRef(new Animated.Value(0)).current;
  const demoChartAnims = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;

  const slide = SLIDES[currentSlide];

  // When we arrive at the personalizing slide, start the animation + save
  useEffect(() => {
    if (slide.type !== 'personalizing' || personalizingStarted.current) return;
    personalizingStarted.current = true;

    const goal = selections['goal_selection'];
    const calorieGoal: CalorieGoalMode = goal === 'weight_loss' ? 'mild_loss' : 'maintain';
    const metabolicInput: MetabolicInputs = {
      sex: bodySex,
      ageYears: parseInt(bodyAge, 10),
      heightCm: parseFloat(bodyHeightCm),
      weightKg: parseFloat(bodyWeightKg),
      activity: bodyActivity,
      calorieGoal,
    };
    const goals = computeDailyGoalsFromMetabolicInputs(metabolicInput);
    setComputedCalories(goals.calories);

    // Save everything in background while animation plays
    void (async () => {
      try {
        const profileUpdate: Record<string, unknown> = {};
        if (goal) {
          await SecureStore.setItemAsync('healthGoal', goal);
          profileUpdate.health_goal = goal;
        }
        if (curiosityMulti.length > 0) {
          await SecureStore.setItemAsync('onboardingCuriositySignals', JSON.stringify(curiosityMulti));
        }
        await saveDailyGoals(goals);
        await SecureStore.setItemAsync(METABOLIC_INPUTS_KEY, JSON.stringify(metabolicInput));
        profileUpdate.daily_goals = goals;
        profileUpdate.metabolic_inputs = metabolicInput;

        const validSensitivities = sensitivityMulti.filter(s => s !== 'none');
        if (validSensitivities.length > 0) {
          const existing = await SecureStore.getItemAsync('medicalConditions');
          const current: string[] = existing ? JSON.parse(existing) : [];
          const sensitivitySlide = SLIDES.find(s => s.id === 'sensitivity');
          const labels = validSensitivities.map(id =>
            sensitivitySlide?.options?.find(o => o.id === id)?.label ?? id
          );
          const updated = [...new Set([...current, ...labels])];
          await SecureStore.setItemAsync('medicalConditions', JSON.stringify(updated));
          profileUpdate.medical_conditions = updated;
        }
        if (Object.keys(profileUpdate).length > 0) {
          await saveUserProfile(profileUpdate as any);
        }
      } catch (e) {
        console.error('Profile save error:', e);
      }
    })();

    // Animate through stages
    const STAGE_MS = 850;
    [1, 2, 3].forEach((stage, i) => {
      setTimeout(() => {
        setPersonalizingStage(stage);
        if (stage === 3) {
          setTimeout(() => {
            setPersonalizingDone(true);
            Animated.spring(checkScale, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }).start();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }, 400);
        }
      }, (i + 1) * STAGE_MS);
    });
  }, [slide.type]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (slide.type !== 'demo_scan') {
      demoChartAnims.forEach((v) => v.setValue(0));
      return;
    }
    demoChartAnims.forEach((v) => v.setValue(0));
    demoChartAnims.forEach((v, i) => {
      Animated.timing(v, {
        toValue: 1,
        duration: 520,
        delay: 260 + i * 530,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished && i === demoChartAnims.length - 1) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
      });
    });
  }, [slide.type]);

  function animateToSlide(nextSlide: number) {
    if (isTransitioning) return;
    setIsTransitioning(true);
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: -20, duration: 180, useNativeDriver: true }),
    ]).start(() => {
      fadeAnim.setValue(0);
      slideAnim.setValue(20);
      setCurrentSlide(nextSlide);

      // Wait for React to commit the new slide before fading back in.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          Animated.parallel([
            Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
            Animated.timing(slideAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
          ]).start(() => setIsTransitioning(false));
        });
      });
    });
  }

  const handleNext = async () => {
    Haptics.selectionAsync();
    // Persist consent when leaving the consent slide
    if (slide.type === 'consent') {
      try {
        await SecureStore.setItemAsync('aiConsentGiven', 'true');
      } catch (e) {
        console.error('Failed to save consent:', e);
      }
    }
    if (currentSlide < SLIDES.length - 1) {
      animateToSlide(currentSlide + 1);
    } else {
      onComplete();
    }
  };

  const handleBack = () => {
    if (currentSlide === 0) return;
    Haptics.selectionAsync();
    animateToSlide(currentSlide - 1);
  };

  const toggleSensitivity = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (id === 'none') {
      setSensitivityMulti(prev => prev.includes('none') ? [] : ['none']);
      return;
    }
    setSensitivityMulti(prev => {
      const withoutNone = prev.filter(s => s !== 'none');
      return withoutNone.includes(id) ? withoutNone.filter(s => s !== id) : [...withoutNone, id];
    });
  };

  const toggleCuriosity = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (id === 'none') {
      setCuriosityMulti((prev) => (prev.includes('none') ? [] : ['none']));
      return;
    }
    setCuriosityMulti((prev) => {
      const withoutNone = prev.filter((s) => s !== 'none');
      return withoutNone.includes(id) ? withoutNone.filter((s) => s !== id) : [...withoutNone, id];
    });
  };

  const selectOption = (slideId: string, optionId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelections({ ...selections, [slideId]: optionId });
  };

  const fillWeightFromHealth = async () => {
    if (Platform.OS === 'web') return;
    setBodyWeightLoading(true);
    try {
      let w = await fetchLatestWeightKg();
      if (w == null) {
        const ok = await requestHealthPermissions();
        if (ok) w = await fetchLatestWeightKg();
      }
      if (w != null) setBodyWeightKg(String(w));
    } finally {
      setBodyWeightLoading(false);
    }
  };

  const canProceed = useMemo(() => {
    if (slide.type === 'welcome') return true;
    if (slide.type === 'curiosity') return true;
    if (slide.type === 'reframe') return true;
    if (slide.type === 'authority') return true;
    if (slide.type === 'question') return !!selections[slide.id];
    if (slide.type === 'multi_select') return true; // "none" is a valid answer; allow proceeding
    if (slide.type === 'body_stats') return isValidBodyStats(bodySex, bodyAge, bodyHeightCm, bodyWeightKg);
    if (slide.type === 'personalizing') return personalizingDone;
    if (slide.type === 'consent') return true;
    if (slide.type === 'demo_scan') return true;
    return false;
  }, [slide, selections, sensitivityMulti, bodySex, bodyAge, bodyHeightCm, bodyWeightKg, personalizingDone]);

  const ctaLabel = useMemo(() => {
    if (slide.type === 'welcome') return 'See what my food is doing';
    if (slide.type === 'reframe' || slide.type === 'authority') return 'Continue';
    if (slide.type === 'body_stats') return 'Build My Plan';
    if (slide.type === 'personalizing') return 'Continue';
    if (slide.type === 'consent') return 'I Agree — Continue';
    if (slide.type === 'demo_scan') return 'Unlock full body analysis';
    if (currentSlide === SLIDES.length - 1) return 'Start Scanning';
    return 'Continue';
  }, [slide.type, currentSlide]);

  const demoAvgScoreNum = parseFloat(DEMO_SCAN_SCORE);
  const demoScoreColor = getScoreColorForNumeric(demoAvgScoreNum, C);
  const demoLongevityMarkerPct = ((DEMO_LONGEVITY_SCORE + 10) / 20) * 100;
  const demoGlucoseGeom = useMemo(() => {
    const gw = Math.min(SCREEN_W - 48, 320) - 32;
    const gh = 82;
    const pl = 10;
    const pr = 10;
    const pt = 8;
    const pb = 20;
    const iw = gw - pl - pr;
    const ih = gh - pt - pb;
    const gMin = 78;
    const gMax = 138;
    const gx = (t: number) => pl + (t / 100) * iw;
    const gy = (g: number) => pt + (1 - (g - gMin) / (gMax - gMin)) * ih;
    const d = DEMO_GLUCOSE_CURVE.reduce((acc, [t, g], i) => {
      const x = gx(t);
      const y = gy(g);
      return acc + (i === 0 ? `M ${x.toFixed(1)} ${y.toFixed(1)}` : ` L ${x.toFixed(1)} ${y.toFixed(1)}`);
    }, '');
    const y140 = gy(140);
    const [pkT, pkG] = DEMO_GLUCOSE_CURVE[2];
    const peakCx = gx(pkT);
    const peakCy = gy(pkG);
    return { gw, gh, d, y140, pl, iw, pt, peakCx, peakCy };
  }, []);

  const renderDemoVitalityRing = (ringSize = 120) => {
    const strokeWidth = 9;
    const center = ringSize / 2;
    const radius = center - strokeWidth / 2;
    const circumference = 2 * Math.PI * radius;
    const scoreNum = Math.max(0, Math.min(10, demoAvgScoreNum));
    const strokeDashoffset = circumference - (scoreNum / 10) * circumference;
    return (
      <View style={{ width: ringSize, height: ringSize }}>
        <Svg width={ringSize} height={ringSize} style={{ position: 'absolute' }}>
          <Defs>
            <LinearGradient id={demoRingGradientId} x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor={demoScoreColor} stopOpacity="0.5" />
              <Stop offset="100%" stopColor={demoScoreColor} stopOpacity="1" />
            </LinearGradient>
          </Defs>
          <SvgCircle cx={center} cy={center} r={radius} stroke={C.bgSecondary} strokeWidth={strokeWidth} fill="none" />
          <SvgCircle
            cx={center}
            cy={center}
            r={radius}
            stroke={`url(#${demoRingGradientId})`}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            fill="none"
            transform={`rotate(-90 ${center} ${center})`}
          />
        </Svg>
        <View style={{ width: ringSize, height: ringSize, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={styles.demoScoreLabel}>VITALITY</Text>
          <Text style={[styles.demoScoreTextMain, { color: demoScoreColor }]}>{DEMO_SCAN_SCORE}</Text>
          <Text style={styles.demoScoreScale}>/10</Text>
        </View>
      </View>
    );
  };

  // Don't show progress bar or back button on welcome, personalizing, or consent
  const showChrome = slide.type !== 'welcome' && slide.type !== 'personalizing' && slide.type !== 'consent';
  const isLastInput = slide.type === 'body_stats';

  const reframeChart = useMemo(() => {
    const chartW = Math.min(SCREEN_W - 48, 360);
    const chartH = 168;
    const padL = 40;
    const padR = 12;
    const padT = 12;
    const padB = 36;
    const iw = chartW - padL - padR;
    const ih = chartH - padT - padB;
    const gMin = 78;
    const gMax = 188;
    const gx = (t: number) => padL + (t / 100) * iw;
    const gy = (g: number) => padT + (1 - (g - gMin) / (gMax - gMin)) * ih;
    const badPts: [number, number][] = [
      [0, 92], [12, 98], [24, 135], [36, 172], [48, 178], [58, 168], [72, 138], [86, 105], [100, 91],
    ];
    const goodPts: [number, number][] = [
      [0, 92], [18, 100], [36, 118], [52, 114], [68, 102], [86, 94], [100, 91],
    ];
    const line = (pts: [number, number][]) =>
      pts.reduce((d, [t, g], i) => {
        const x = gx(t);
        const y = gy(g);
        return d + (i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`);
      }, '');
    return { chartW, chartH, badPath: line(badPts), goodPath: line(goodPts), padL, padT, iw, ih, gx, gy };
  }, []);

  // Sensitivity slide: selected goal label for context
  const goalLabel = GOAL_LABELS[selections['goal_selection']] ?? '';

  // Personalizing slide context
  const triggerCount = sensitivityMulti.filter(s => s !== 'none').length;
  const sensitivitySlideData = SLIDES.find(s => s.id === 'sensitivity');
  const triggerLabels = sensitivityMulti
    .filter(s => s !== 'none')
    .map(id => sensitivitySlideData?.options?.find(o => o.id === id)?.label ?? id);

  return (
    <ScreenEnterAnimation variant="fadeDown" delayMs={80} durationMs={420}>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: C.bg }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <SafeAreaView style={styles.container}>
          {/* Top chrome: back button + progress */}
          {showChrome && (
            <View style={styles.topBar}>
              <TouchableOpacity
                style={[styles.backBtn, currentSlide === 0 && { opacity: 0 }]}
                onPress={handleBack}
                disabled={currentSlide === 0 || isTransitioning}
              >
                <CaretLeft size={20} color={C.textSecondary} weight="bold" />
              </TouchableOpacity>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${
                        slide.type === 'demo_scan'
                          ? 99
                          : (currentSlide / (SLIDES.length - 1)) * 100
                      }%`,
                    },
                  ]}
                />
              </View>
              <View style={{ width: 36 }} />
            </View>
          )}

          <Animated.View
            style={[
              styles.content,
              slide.type === 'welcome' && styles.contentWelcome,
              slide.type === 'personalizing' && styles.contentPersonalizing,
              slide.type === 'consent' && styles.contentConsent,
              slide.type === 'demo_scan' && styles.contentDemoScan,
              (slide.type === 'question' || slide.type === 'multi_select' || slide.type === 'curiosity') &&
                styles.contentQuestion,
              (slide.type === 'reframe' || slide.type === 'authority') && styles.contentNarrative,
              { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
            ]}
          >
            {/* ── Welcome (Step 0) ── */}
            {slide.type === 'welcome' && (
              <View style={styles.welcomeInner}>
                <Image source={require('../../assets/logo.png')} style={styles.welcomeLogo} resizeMode="contain" />
                <Text style={styles.welcomeTitle}>{slide.title}</Text>
                <Text style={styles.welcomeSubtitle}>{slide.subtitle}</Text>
              </View>
            )}

            {/* ── Curiosity hook (Step 1) ── */}
            {slide.type === 'curiosity' && slide.options && (
              <View style={styles.questionSlide}>
                <Text style={styles.questionTitle}>{slide.title}</Text>
                {!!slide.subtitle && <Text style={styles.questionSubtitle}>{slide.subtitle}</Text>}
                <ScrollView
                  style={styles.optionsScroll}
                  contentContainerStyle={styles.optionsList}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  {slide.options.map((opt) => {
                    const isSelected = curiosityMulti.includes(opt.id);
                    return (
                      <TouchableOpacity
                        key={opt.id}
                        style={[styles.optionItem, isSelected && { borderColor: C.primary, backgroundColor: C.primaryLight }]}
                        onPress={() => toggleCuriosity(opt.id)}
                        activeOpacity={0.75}
                      >
                        <View style={[styles.optionIconBox, isSelected && { backgroundColor: C.primaryMuted }]}>
                          <SlideIcon icon={opt.icon} color={isSelected ? C.primary : opt.color} size={20} />
                        </View>
                        <View style={styles.optionTextContent}>
                          <Text style={[styles.optionLabel, isSelected && { color: C.primary }, { marginBottom: 0 }]}>
                            {opt.label}
                          </Text>
                        </View>
                        {isSelected ? (
                          <CheckCircle size={18} color={C.primary} weight="fill" />
                        ) : (
                          <Circle size={18} color={C.border} weight="regular" />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {/* ── Reframe (Step 2) ── */}
            {slide.type === 'reframe' && (
              <View style={styles.narrativeSlide}>
                <Text style={styles.questionTitle}>{slide.title}</Text>
                <Text style={styles.questionSubtitle}>{slide.subtitle}</Text>
                <View style={[styles.reframeChartCard, { borderColor: C.border, backgroundColor: C.surface }]}>
                  <Svg width={reframeChart.chartW} height={reframeChart.chartH}>
                    <SvgLine
                      x1={reframeChart.padL}
                      y1={reframeChart.gy(140)}
                      x2={reframeChart.padL + reframeChart.iw}
                      y2={reframeChart.gy(140)}
                      stroke={C.textTertiary}
                      strokeWidth={0.8}
                      strokeDasharray="4,4"
                      opacity={0.6}
                    />
                    <SvgText
                      x={reframeChart.padL - 2}
                      y={reframeChart.gy(140) + 3}
                      fontSize={8}
                      fill={C.textTertiary}
                      textAnchor="end"
                    >
                      140
                    </SvgText>
                    <Path d={reframeChart.badPath} fill="none" stroke={C.danger ?? '#EF4444'} strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" />
                    <Path d={reframeChart.goodPath} fill="none" stroke={C.vitality ?? '#10B981'} strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" />
                    <SvgCircle cx={reframeChart.gx(48)} cy={reframeChart.gy(178)} r={4} fill={C.danger ?? '#EF4444'} />
                    <SvgCircle cx={reframeChart.gx(52)} cy={reframeChart.gy(114)} r={4} fill={C.vitality ?? '#10B981'} />
                    <SvgText
                      x={reframeChart.padL + reframeChart.iw / 2}
                      y={reframeChart.chartH - 8}
                      fontSize={9}
                      fill={C.textTertiary}
                      textAnchor="middle"
                    >
                      Time after meal
                    </SvgText>
                  </Svg>
                  <View style={styles.reframeLegendRow}>
                    <View style={styles.reframeLegendItem}>
                      <View style={[styles.reframeLegendSwatch, { backgroundColor: C.danger ?? '#EF4444' }]} />
                      <Text style={styles.reframeLegendText}>Higher spike</Text>
                    </View>
                    <View style={styles.reframeLegendItem}>
                      <View style={[styles.reframeLegendSwatch, { backgroundColor: C.vitality ?? '#10B981' }]} />
                      <Text style={styles.reframeLegendText}>Gentler response</Text>
                    </View>
                  </View>
                </View>
                <Text style={styles.reframeCaption}>Same meal — different biology.</Text>
              </View>
            )}

            {/* ── Authority (Step 3) ── */}
            {slide.type === 'authority' && (
              <View style={styles.narrativeSlide}>
                <Text style={styles.questionTitle}>{slide.title}</Text>
                <View style={styles.authorityVisual}>
                  {[
                    { Icon: ChartLine, label: 'Glucose response', fill: C.energy ?? '#F59E0B' },
                    { Icon: Pulse, label: 'Organ stress', fill: C.primary },
                    { Icon: Dna, label: 'Longevity impact', fill: C.vitality ?? '#10B981' },
                    { Icon: SquaresFour, label: 'Body System Analysis', fill: '#EC4899' },
                  ].map(({ Icon, label, fill }) => (
                    <View key={label} style={[styles.authorityChip, { borderColor: fill + '44', backgroundColor: fill + '12' }]}>
                      <View style={[styles.authorityChipIcon, { backgroundColor: fill + '22' }]}>
                        <Icon size={22} color={fill} weight="duotone" />
                      </View>
                      <Text style={[styles.authorityChipLabel, { color: C.textPrimary }]}>{label}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* ── Question (single-select) ── */}
            {slide.type === 'question' && (
              <View style={styles.questionSlide}>
                <Text style={styles.questionTitle}>{slide.title}</Text>
                <Text style={styles.questionSubtitle}>{slide.subtitle}</Text>
                <ScrollView
                  style={styles.optionsScroll}
                  contentContainerStyle={styles.optionsList}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  {slide.options?.map((opt) => {
                    const isSelected = selections[slide.id] === opt.id;
                    return (
                      <TouchableOpacity
                        key={opt.id}
                        style={[styles.optionItem, isSelected && { borderColor: C.primary, backgroundColor: C.primaryLight }]}
                        onPress={() => selectOption(slide.id, opt.id)}
                        activeOpacity={0.75}
                      >
                        <View style={[styles.optionIconBox, isSelected && { backgroundColor: C.primaryMuted }]}>
                          <SlideIcon icon={opt.icon} color={isSelected ? C.primary : opt.color} size={20} />
                        </View>
                        <View style={styles.optionTextContent}>
                          <Text style={[styles.optionLabel, isSelected && { color: C.primary }]}>{opt.label}</Text>
                          <Text style={styles.optionDesc}>{opt.desc}</Text>
                        </View>
                        {isSelected
                          ? <CheckCircle size={18} color={C.primary} weight="fill" />
                          : <Circle size={18} color={C.border} weight="regular" />
                        }
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {/* ── Multi-select (sensitivity) ── */}
            {slide.type === 'multi_select' && (
              <View style={styles.questionSlide}>
                <Text style={styles.questionTitle}>{slide.title}</Text>
                <Text style={styles.questionSubtitle}>{slide.subtitle}</Text>
                <ScrollView
                  style={styles.optionsScroll}
                  contentContainerStyle={styles.optionsList}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  {slide.options?.map((opt) => {
                    const isSelected = sensitivityMulti.includes(opt.id);
                    return (
                      <TouchableOpacity
                        key={opt.id}
                        style={[styles.optionItem, isSelected && { borderColor: C.primary, backgroundColor: C.primaryLight }]}
                        onPress={() => toggleSensitivity(opt.id)}
                        activeOpacity={0.75}
                      >
                        <View style={[styles.optionIconBox, isSelected && { backgroundColor: C.primaryMuted }]}>
                          <SlideIcon icon={opt.icon} color={isSelected ? C.primary : opt.color} size={20} />
                        </View>
                        <View style={styles.optionTextContent}>
                          <Text style={[styles.optionLabel, isSelected && { color: C.primary }]}>{opt.label}</Text>
                          <Text style={styles.optionDesc}>{opt.desc}</Text>
                        </View>
                        {isSelected
                          ? <CheckCircle size={18} color={C.primary} weight="fill" />
                          : <Circle size={18} color={C.border} weight="regular" />
                        }
                      </TouchableOpacity>
                    );
                  })}
                  {sensitivityMulti.length === 0 && (
                    <Text style={styles.multiSelectHint}>Tap any that apply, or tap "No specific triggers" to skip.</Text>
                  )}
                </ScrollView>
              </View>
            )}

            {/* ── Body stats ── */}
            {slide.type === 'body_stats' && (
              <ScrollView
                style={styles.bodyStatsScroll}
                contentContainerStyle={styles.bodyStatsScrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <Text style={styles.questionTitle}>{slide.title}</Text>
                <Text style={styles.questionSubtitle}>{slide.subtitle}</Text>

                <Text style={[styles.fieldLabel, { marginBottom: 8 }]}>Sex</Text>
                <View style={styles.sexRow}>
                  {(['male', 'female'] as const).map((s) => (
                    <TouchableOpacity
                      key={s}
                      style={[styles.sexBtn, bodySex === s && styles.sexBtnActive]}
                      onPress={() => setBodySex(s)}
                    >
                      <Text style={[styles.sexBtnText, bodySex === s && styles.sexBtnTextActive]}>
                        {s === 'male' ? 'Male' : 'Female'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={[styles.fieldLabel, { marginBottom: 8, marginTop: 12 }]}>Age (years)</Text>
                <TextInput
                  style={styles.textInput}
                  value={bodyAge}
                  onChangeText={setBodyAge}
                  keyboardType="number-pad"
                  maxLength={3}
                  placeholder="35"
                  placeholderTextColor={C.textTertiary}
                />

                <View style={styles.fieldLabelRow}>
                  <Text style={styles.fieldLabel}>Height</Text>
                  <View style={styles.unitToggle}>
                    {(['cm', 'in'] as const).map(u => (
                      <TouchableOpacity key={u} style={[styles.unitBtn, heightUnit === u && styles.unitBtnActive]} onPress={() => toggleHeightUnit(u)}>
                        <Text style={[styles.unitBtnText, heightUnit === u && styles.unitBtnTextActive]}>{u}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
                <TextInput
                  style={styles.textInput}
                  value={heightDisplayValue}
                  onChangeText={handleHeightChange}
                  keyboardType="decimal-pad"
                  placeholder={heightUnit === 'cm' ? '175' : '68.9'}
                  placeholderTextColor={C.textTertiary}
                />

                <View style={styles.fieldLabelRow}>
                  <Text style={styles.fieldLabel}>Weight</Text>
                  <View style={styles.unitToggle}>
                    {(['kg', 'lbs'] as const).map(u => (
                      <TouchableOpacity key={u} style={[styles.unitBtn, weightUnit === u && styles.unitBtnActive]} onPress={() => toggleWeightUnit(u)}>
                        <Text style={[styles.unitBtnText, weightUnit === u && styles.unitBtnTextActive]}>{u}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
                <TextInput
                  style={styles.textInput}
                  value={weightDisplayValue}
                  onChangeText={handleWeightChange}
                  keyboardType="decimal-pad"
                  placeholder={weightUnit === 'kg' ? '75' : '165'}
                  placeholderTextColor={C.textTertiary}
                />

                <Text style={[styles.fieldLabel, { marginBottom: 8, marginTop: 12 }]}>Activity level</Text>
                <View style={styles.activityWrap}>
                  {ACTIVITY_KEYS.map((k) => (
                    <TouchableOpacity
                      key={k}
                      style={[styles.activityChip, bodyActivity === k && styles.activityChipActive]}
                      onPress={() => { Haptics.selectionAsync(); setBodyActivity(k); }}
                      activeOpacity={0.75}
                    >
                      <Text style={[styles.activityChipText, bodyActivity === k && styles.activityChipTextActive]} numberOfLines={3}>
                        {ACTIVITY_LABELS[k]}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            )}

            {/* ── Personalizing ── */}
            {slide.type === 'personalizing' && (
              <View style={styles.personalizingInner}>
                {!personalizingDone ? (
                  <>
                    <View style={styles.personalizingSpinnerWrap}>
                      <ActivityIndicator size="large" color={C.primary} />
                    </View>
                    <Text style={styles.personalizingTitle}>Building your profile</Text>
                    <View style={styles.personalizingSteps}>
                      {PERSONALIZING_MESSAGES.slice(0, 3).map((msg, i) => (
                        <View key={i} style={styles.personalizingStep}>
                          {personalizingStage > i
                            ? <Check size={14} color={C.vitality} weight="bold" />
                            : personalizingStage === i
                            ? <ActivityIndicator size="small" color={C.primary} style={{ width: 14 }} />
                            : <View style={styles.personalizingDot} />
                          }
                          <Text style={[
                            styles.personalizingStepText,
                            personalizingStage > i && { color: C.vitality },
                            personalizingStage === i && { color: C.textPrimary, fontWeight: '600' },
                          ]}>
                            {msg}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </>
                ) : (
                  <>
                    <Animated.View style={[styles.personalizingCheckCircle, { transform: [{ scale: checkScale }] }]}>
                      <CheckCircle size={52} color={C.vitality} weight="fill" />
                    </Animated.View>
                    <Text style={styles.personalizingReadyTitle}>Your profile is ready</Text>
                    <Text style={styles.personalizingReadySubtitle}>
                      Here's what Nouriva has set up for you:
                    </Text>

                    <View style={styles.personalizingCards}>
                      {computedCalories != null && (
                        <View style={[styles.personalizingCard, { borderLeftColor: C.energy }]}>
                          <Text style={styles.personalizingCardLabel}>Daily calorie target</Text>
                          <Text style={[styles.personalizingCardValue, { color: C.energy }]}>
                            {computedCalories.toLocaleString()} kcal / day
                          </Text>
                        </View>
                      )}
                      {goalLabel ? (
                        <View style={[styles.personalizingCard, { borderLeftColor: C.primary }]}>
                          <Text style={styles.personalizingCardLabel}>Your primary goal</Text>
                          <Text style={[styles.personalizingCardValue, { color: C.primary }]}>{goalLabel}</Text>
                        </View>
                      ) : null}
                      <View style={[styles.personalizingCard, { borderLeftColor: C.vitality }]}>
                        <Text style={styles.personalizingCardLabel}>Food triggers flagged</Text>
                        <Text style={[styles.personalizingCardValue, { color: C.vitality }]}>
                          {triggerCount > 0 ? triggerLabels.join(', ') : 'None — general vitality mode'}
                        </Text>
                      </View>
                    </View>
                  </>
                )}
              </View>
            )}

            {/* ── AI Consent ── */}
            {slide.type === 'consent' && (
              <View style={styles.consentInner}>
                <View style={styles.consentIconWrap}>
                  <LockKey size={36} color={C.primary} weight="duotone" />
                </View>
                <Text style={styles.consentTitle}>Data & Privacy</Text>
                <Text style={styles.consentSubtitle}>
                  Before you start scanning, here's how Nouriva AI works with your data.
                </Text>

                <View style={styles.consentCard}>
                  <Text style={styles.consentBody}>
                    To analyse your food, Nouriva AI sends your meal photo or text description to{' '}
                    <Text style={styles.consentBold}>Google Gemini</Text>, a third-party AI service.
                  </Text>
                  <View style={styles.consentDivider} />
                  <Text style={styles.consentBody}>
                    If you've added medical conditions or lab report data, that context is also included to personalise your results.
                  </Text>
                  <View style={styles.consentDivider} />
                  <Text style={styles.consentBody}>
                    <Text style={styles.consentBold}>No data is stored by Google</Text> beyond processing your request.
                  </Text>
                </View>

                <Text style={styles.consentLegalNote}>
                  By tapping "I Agree", you consent to this data sharing.{' '}
                  <Text
                    style={styles.consentLink}
                    onPress={() => Linking.openURL(PRIVACY_URL)}
                  >
                    Privacy Policy
                  </Text>
                  {' · '}
                  <Text
                    style={styles.consentLink}
                    onPress={() => Linking.openURL(TERMS_URL)}
                  >
                    Terms of Use
                  </Text>
                </Text>
              </View>
            )}

            {/* ── Demo scan preview (Step 5 — before paywall) ── */}
            {slide.type === 'demo_scan' && (
              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={styles.demoScanScroll}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                <Text style={styles.demoScanEyebrow}>Sample scan</Text>
                <Text style={styles.demoFoodName}>{DEMO_SCAN_FOOD}</Text>
                <View style={styles.demoVitalityHeader}>
                  {renderDemoVitalityRing(120)}
                  <View style={styles.demoVitalitySummary}>
                    <Text style={styles.demoSummaryStatusText}>
                      Meal balance is{' '}
                      <Text style={{ fontWeight: '800', color: demoScoreColor }}>
                        {demoAvgScoreNum >= 7 ? 'Excellent' : demoAvgScoreNum >= 5 ? 'Good' : 'Needs attention'}
                      </Text>
                      .
                    </Text>
                    <Text style={styles.demoSummaryText}>{DEMO_SCAN_INSIGHT}</Text>
                  </View>
                </View>

                <View style={styles.demoChartsBlock}>
                  <DemoStaggerCard anim={demoChartAnims[0]}>
                    <View style={styles.demoChartCard}>
                      <View style={styles.demoChartCardHeader}>
                        <SquaresFour size={18} color={C.primary} weight="duotone" />
                        <Text style={styles.demoChartCardTitle}>Body system impact</Text>
                      </View>
                      {DEMO_SYSTEM_IMPACT.map((row) => (
                        <View key={row.label} style={styles.demoSysRow}>
                          <Text style={styles.demoSysLabel} numberOfLines={1}>
                            {row.label}
                          </Text>
                          <View style={styles.demoSysBarTrack}>
                            <View
                              style={[
                                styles.demoSysBarFill,
                                {
                                  width: `${(row.score / 10) * 100}%`,
                                  backgroundColor: demoScoreColor,
                                },
                              ]}
                            />
                          </View>
                          <Text style={styles.demoSysScore}>{row.score.toFixed(1)}</Text>
                        </View>
                      ))}
                    </View>
                  </DemoStaggerCard>

                  <DemoStaggerCard anim={demoChartAnims[1]}>
                    <View style={styles.demoChartCard}>
                      <View style={styles.demoChartCardHeader}>
                        <Stack size={18} color={C.primary} weight="duotone" />
                        <Text style={styles.demoChartCardTitle}>Organ impact</Text>
                      </View>
                      {DEMO_ORGAN_IMPACT.map((row) => (
                        <View key={row.label} style={styles.demoOrganRow}>
                          <Text style={styles.demoOrganLabel}>{row.label}</Text>
                          <View style={styles.demoOrganTrack}>
                            <View
                              style={[
                                styles.demoOrganFill,
                                {
                                  width: `${(row.score / 10) * 100}%`,
                                  backgroundColor: C.primary,
                                },
                              ]}
                            />
                          </View>
                          <View style={styles.demoOrganScorePill}>
                            <Text style={styles.demoOrganScoreText}>{row.score.toFixed(1)}</Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  </DemoStaggerCard>

                  <DemoStaggerCard anim={demoChartAnims[2]}>
                    <View style={styles.demoChartCard}>
                      <View style={styles.demoChartCardHeader}>
                        <Dna size={18} color={C.primary} weight="duotone" />
                        <Text style={styles.demoChartCardTitle}>Longevity impact</Text>
                      </View>
                      <Text style={styles.demoChartHint}>Anti-aging score for this meal</Text>
                      <View style={styles.demoLongBarWrap}>
                        <View style={styles.demoLongBarEnds}>
                          <Text style={styles.demoLongEndLabel}>-10</Text>
                          <Text style={styles.demoLongEndLabel}>+10</Text>
                        </View>
                        <View style={styles.demoLongBarTrack}>
                          <View style={styles.demoLongBarCenter} />
                          <View
                            style={[
                              styles.demoLongMarker,
                              { left: `${demoLongevityMarkerPct}%`, borderColor: demoScoreColor },
                            ]}
                          />
                        </View>
                        <Text style={[styles.demoLongScoreLabel, { color: demoScoreColor }]}>
                          +{DEMO_LONGEVITY_SCORE.toFixed(1)} favorable
                        </Text>
                      </View>
                    </View>
                  </DemoStaggerCard>

                  <DemoStaggerCard anim={demoChartAnims[3]}>
                    <View style={styles.demoChartCard}>
                      <View style={styles.demoChartCardHeader}>
                        <ChartLine size={18} color={C.primary} weight="duotone" />
                        <Text style={styles.demoChartCardTitle}>Glucose impact</Text>
                      </View>
                      <Text style={styles.demoChartHint}>Projected curve (mg/dL)</Text>
                      <Svg width={demoGlucoseGeom.gw} height={demoGlucoseGeom.gh}>
                        <SvgLine
                          x1={demoGlucoseGeom.pl}
                          y1={demoGlucoseGeom.y140}
                          x2={demoGlucoseGeom.pl + demoGlucoseGeom.iw}
                          y2={demoGlucoseGeom.y140}
                          stroke={C.scoreMid}
                          strokeWidth={1}
                          strokeDasharray="4,3"
                          opacity={0.75}
                        />
                        <Path
                          d={demoGlucoseGeom.d}
                          fill="none"
                          stroke={C.danger}
                          strokeWidth={2.2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <SvgCircle cx={demoGlucoseGeom.peakCx} cy={demoGlucoseGeom.peakCy} r={4} fill={demoScoreColor} />
                      </Svg>
                      <View style={styles.demoGlucoseLegend}>
                        <View style={styles.demoLegendDot} />
                        <Text style={styles.demoLegendText}>Glucose · dashed = 140 mg/dL</Text>
                      </View>
                    </View>
                  </DemoStaggerCard>
                </View>
              </ScrollView>
            )}
          </Animated.View>

          {/* ── CTA button ── */}
          {(slide.type === 'consent' || slide.type !== 'personalizing' || personalizingDone) && (
            <View style={[styles.footer, slide.type === 'welcome' && styles.footerWelcome]}>
              <TouchableOpacity
                style={[styles.nextButton, !canProceed && styles.nextButtonDisabled]}
                onPress={handleNext}
                disabled={!canProceed || isTransitioning}
                activeOpacity={0.85}
              >
                <Text style={styles.nextButtonText}>{ctaLabel}</Text>
                <ArrowRight size={20} color="#FFF" weight="bold" />
              </TouchableOpacity>
            </View>
          )}
        </SafeAreaView>
      </KeyboardAvoidingView>
    </ScreenEnterAnimation>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },

    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 14,
      gap: 8,
    },
    backBtn: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: C.bgSecondary,
      justifyContent: 'center',
      alignItems: 'center',
    },
    progressTrack: {
      flex: 1,
      height: 4,
      backgroundColor: C.bgSecondary,
      borderRadius: 2,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      backgroundColor: C.primary,
      borderRadius: 2,
    },

    content: {
      flex: 1,
      paddingHorizontal: 24,
      justifyContent: 'center',
    },
    contentQuestion: {
      justifyContent: 'flex-start',
      paddingTop: 8,
    },
    contentWelcome: {
      justifyContent: 'center',
      alignItems: 'center',
    },
    contentNarrative: {
      justifyContent: 'flex-start',
      paddingTop: 12,
    },
    contentPersonalizing: {
      justifyContent: 'center',
      paddingHorizontal: 24,
    },
    contentDemoScan: {
      justifyContent: 'flex-start',
      paddingTop: 4,
    },

    demoScanScroll: {
      paddingBottom: 24,
      flexGrow: 1,
    },
    demoScanEyebrow: {
      fontSize: 11,
      fontWeight: '800',
      color: C.textTertiary,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      marginBottom: 8,
    },
    demoFoodName: {
      fontSize: 17,
      fontWeight: '700',
      color: C.primary,
      marginBottom: 16,
    },
    demoVitalityHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.surface,
      borderRadius: 20,
      padding: 20,
      borderWidth: 1,
      borderColor: C.border,
      shadowColor: C.shadowColor,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.06,
      shadowRadius: 12,
      elevation: 3,
    },
    demoScoreLabel: {
      fontSize: 8,
      fontWeight: '800',
      color: C.textTertiary,
      letterSpacing: 0.8,
    },
    demoScoreTextMain: {
      fontSize: 28,
      fontWeight: '900',
      lineHeight: 32,
    },
    demoScoreScale: {
      fontSize: 10,
      fontWeight: '600',
      color: C.textTertiary,
    },
    demoVitalitySummary: {
      flex: 1,
      marginLeft: 16,
    },
    demoSummaryStatusText: {
      fontSize: 14,
      fontWeight: '600',
      color: C.textPrimary,
      lineHeight: 20,
      marginBottom: 6,
    },
    demoSummaryText: {
      fontSize: 12,
      color: C.textSecondary,
      lineHeight: 18,
    },
    demoChartsBlock: {
      marginTop: 20,
    },
    demoChartCard: {
      backgroundColor: C.surface,
      borderRadius: 16,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: C.border,
      shadowColor: C.shadowColor,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 8,
      elevation: 2,
    },
    demoChartCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 12,
    },
    demoChartCardTitle: {
      fontSize: 13,
      fontWeight: '800',
      color: C.textPrimary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    demoChartHint: {
      fontSize: 11,
      color: C.textTertiary,
      marginBottom: 10,
      fontWeight: '600',
    },
    demoSysRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 10,
    },
    demoSysLabel: {
      width: 110,
      fontSize: 12,
      fontWeight: '600',
      color: C.textSecondary,
    },
    demoSysBarTrack: {
      flex: 1,
      height: 8,
      borderRadius: 4,
      backgroundColor: C.bgSecondary,
      overflow: 'hidden',
    },
    demoSysBarFill: {
      height: '100%',
      borderRadius: 4,
    },
    demoSysScore: {
      width: 36,
      textAlign: 'right',
      fontSize: 12,
      fontWeight: '800',
      color: C.textPrimary,
    },
    demoOrganRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 10,
    },
    demoOrganLabel: {
      width: 78,
      fontSize: 12,
      fontWeight: '600',
      color: C.textSecondary,
    },
    demoOrganTrack: {
      flex: 1,
      height: 6,
      borderRadius: 3,
      backgroundColor: C.bgSecondary,
      overflow: 'hidden',
    },
    demoOrganFill: {
      height: '100%',
      borderRadius: 3,
    },
    demoOrganScorePill: {
      marginLeft: 8,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
      backgroundColor: C.primaryMuted,
    },
    demoOrganScoreText: {
      fontSize: 11,
      fontWeight: '800',
      color: C.primary,
    },
    demoLongBarWrap: {
      marginTop: 4,
    },
    demoLongBarEnds: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 6,
    },
    demoLongEndLabel: {
      fontSize: 10,
      fontWeight: '700',
      color: C.textTertiary,
    },
    demoLongBarTrack: {
      height: 10,
      borderRadius: 5,
      backgroundColor: C.bgSecondary,
      position: 'relative',
    },
    demoLongBarCenter: {
      position: 'absolute',
      left: '50%',
      top: -2,
      width: 2,
      height: 14,
      backgroundColor: C.borderStrong,
      marginLeft: -1,
    },
    demoLongMarker: {
      position: 'absolute',
      top: -3,
      width: 14,
      height: 14,
      borderRadius: 7,
      borderWidth: 2,
      backgroundColor: C.surface,
      marginLeft: -7,
    },
    demoLongScoreLabel: {
      marginTop: 10,
      fontSize: 13,
      fontWeight: '800',
      textAlign: 'center',
    },
    demoGlucoseLegend: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 6,
    },
    demoLegendDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: C.danger,
    },
    demoLegendText: {
      fontSize: 10,
      color: C.textTertiary,
      fontWeight: '600',
    },

    // Welcome slide
    welcomeInner: { alignItems: 'center', paddingHorizontal: 8, width: '100%' },
    welcomeLogo: {
      width: 96,
      height: 96,
      borderRadius: 24,
      marginBottom: 28,
    },
    welcomeTitle: {
      fontSize: 30,
      fontWeight: '900',
      color: C.textPrimary,
      textAlign: 'center',
      lineHeight: 38,
      letterSpacing: -0.5,
      marginBottom: 12,
    },
    welcomeSubtitle: {
      fontSize: 15,
      color: C.textSecondary,
      textAlign: 'center',
      lineHeight: 22,
      marginBottom: 16,
      paddingHorizontal: 8,
    },
    questionSlide: { flex: 1 },
    optionsScroll: { flex: 1 },
    questionTitle: {
      fontSize: 26,
      fontWeight: '900',
      color: C.textPrimary,
      marginBottom: 8,
      letterSpacing: -0.3,
    },
    questionSubtitle: {
      fontSize: 14,
      color: C.textSecondary,
      lineHeight: 21,
      marginBottom: 24,
    },
    optionsList: { gap: 9, paddingBottom: 24 },
    optionItem: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 14,
      borderRadius: 18,
      backgroundColor: C.surface,
      borderWidth: 1.5,
      borderColor: C.border,
      gap: 12,
    },
    optionIconBox: {
      width: 38,
      height: 38,
      borderRadius: 11,
      backgroundColor: C.bgSecondary,
      justifyContent: 'center',
      alignItems: 'center',
      flexShrink: 0,
    },
    optionTextContent: { flex: 1 },
    optionLabel: { fontSize: 14, fontWeight: '700', color: C.textPrimary, marginBottom: 1 },
    optionDesc: { fontSize: 12, color: C.textSecondary, lineHeight: 16 },
    multiSelectHint: {
      fontSize: 12,
      color: C.textTertiary,
      textAlign: 'center',
      marginTop: 12,
      lineHeight: 18,
    },
    narrativeSlide: { width: '100%', paddingBottom: 8 },
    reframeChartCard: {
      borderRadius: 18,
      borderWidth: 1,
      paddingVertical: 12,
      paddingHorizontal: 8,
      marginTop: 8,
      alignSelf: 'center',
    },
    reframeLegendRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 20,
      marginTop: 10,
      paddingHorizontal: 8,
    },
    reframeLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    reframeLegendSwatch: { width: 12, height: 3, borderRadius: 2 },
    reframeLegendText: { fontSize: 11, fontWeight: '600', color: C.textSecondary },
    reframeCaption: {
      fontSize: 13,
      fontWeight: '700',
      color: C.textTertiary,
      textAlign: 'center',
      marginTop: 14,
    },
    authorityVisual: { width: '100%', gap: 12, marginTop: 22 },
    authorityChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderRadius: 16,
      borderWidth: 1,
    },
    authorityChipIcon: {
      width: 44,
      height: 44,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    authorityChipLabel: { fontSize: 16, fontWeight: '800', flex: 1, letterSpacing: -0.2 },

    // Body stats
    bodyStatsScroll: { flex: 1 },
    bodyStatsScrollContent: { paddingBottom: 24 },
    fieldLabel: {
      fontSize: 11,
      fontWeight: '800',
      color: C.textTertiary,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    sexRow: { flexDirection: 'row', gap: 10, marginBottom: 4 },
    sexBtn: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 14,
      backgroundColor: C.surface,
      borderWidth: 1.5,
      borderColor: C.border,
      alignItems: 'center',
    },
    sexBtnActive: { borderColor: C.primary, backgroundColor: C.primaryLight },
    sexBtnText: { fontSize: 15, fontWeight: '700', color: C.textSecondary },
    sexBtnTextActive: { color: C.primary },
    textInput: {
      backgroundColor: C.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: C.border,
      paddingHorizontal: 16,
      paddingVertical: 12,
      fontSize: 16,
      fontWeight: '700',
      color: C.textPrimary,
      marginBottom: 4,
    },
    weightRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
    fieldLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
      marginTop: 12,
    },
    unitToggle: {
      flexDirection: 'row',
      backgroundColor: C.surface,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: C.border,
      overflow: 'hidden',
    },
    unitBtn: {
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    unitBtnActive: {
      backgroundColor: C.primary,
    },
    unitBtnText: {
      fontSize: 11,
      fontWeight: '700',
      color: C.textTertiary,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    unitBtnTextActive: { color: '#FFF' },
    activityWrap: { gap: 8, marginTop: 4 },
    activityChip: {
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 14,
      backgroundColor: C.surface,
      borderWidth: 1.5,
      borderColor: C.border,
    },
    activityChipActive: { borderColor: C.primary, backgroundColor: C.primaryLight },
    activityChipText: { fontSize: 13, fontWeight: '600', color: C.textSecondary, lineHeight: 18 },
    activityChipTextActive: { color: C.primary, fontWeight: '700' },

    // Personalizing slide
    personalizingInner: { alignItems: 'center', paddingHorizontal: 8 },
    personalizingSpinnerWrap: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: C.primaryLight,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 24,
      borderWidth: 1,
      borderColor: C.primaryMuted,
    },
    personalizingTitle: {
      fontSize: 22,
      fontWeight: '800',
      color: C.textPrimary,
      marginBottom: 24,
      letterSpacing: -0.3,
    },
    personalizingSteps: { gap: 14, width: '100%', paddingHorizontal: 8 },
    personalizingStep: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    personalizingDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, borderColor: C.border },
    personalizingStepText: { fontSize: 14, color: C.textTertiary, flex: 1, lineHeight: 20 },

    personalizingCheckCircle: { marginBottom: 16 },
    personalizingReadyTitle: {
      fontSize: 24,
      fontWeight: '900',
      color: C.textPrimary,
      marginBottom: 6,
      letterSpacing: -0.3,
      textAlign: 'center',
    },
    personalizingReadySubtitle: {
      fontSize: 14,
      color: C.textSecondary,
      textAlign: 'center',
      marginBottom: 20,
    },
    personalizingCards: { gap: 10, width: '100%' },
    personalizingCard: {
      backgroundColor: C.surface,
      borderRadius: 12,
      padding: 14,
      borderLeftWidth: 3,
    },
    personalizingCardLabel: { fontSize: 11, fontWeight: '700', color: C.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
    personalizingCardValue: { fontSize: 14, fontWeight: '700', lineHeight: 20 },

    // Consent slide
    contentConsent: {
      justifyContent: 'center',
      paddingHorizontal: 24,
    },
    consentInner: {
      alignItems: 'center',
      paddingHorizontal: 4,
    },
    consentIconWrap: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: C.primaryLight,
      borderWidth: 1,
      borderColor: C.primaryMuted,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 20,
    },
    consentTitle: {
      fontSize: 26,
      fontWeight: '900',
      color: C.textPrimary,
      textAlign: 'center',
      letterSpacing: -0.4,
      marginBottom: 8,
    },
    consentSubtitle: {
      fontSize: 14,
      color: C.textSecondary,
      textAlign: 'center',
      lineHeight: 21,
      marginBottom: 24,
    },
    consentCard: {
      width: '100%',
      backgroundColor: C.surface,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: C.border,
      padding: 18,
      marginBottom: 16,
      gap: 0,
    },
    consentBody: {
      fontSize: 14,
      color: C.textSecondary,
      lineHeight: 22,
      paddingVertical: 8,
    },
    consentBold: {
      fontWeight: '700',
      color: C.textPrimary,
    },
    consentDivider: {
      height: 1,
      backgroundColor: C.border,
      marginHorizontal: -2,
    },
    consentLegalNote: {
      fontSize: 12,
      color: C.textTertiary,
      textAlign: 'center',
      lineHeight: 19,
      paddingHorizontal: 8,
    },
    consentLink: {
      color: C.primary,
      fontWeight: '600',
      textDecorationLine: 'underline',
    },

    // Footer / CTA
    footer: { paddingHorizontal: 24, paddingBottom: 36 },
    footerWelcome: { paddingBottom: 40 },
    nextButton: {
      flexDirection: 'row',
      backgroundColor: C.primary,
      paddingVertical: 18,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      shadowColor: C.primary,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.35,
      shadowRadius: 12,
      elevation: 6,
    },
    nextButtonDisabled: {
      backgroundColor: C.borderStrong,
      shadowOpacity: 0,
      elevation: 0,
    },
    nextButtonText: { color: '#FFF', fontSize: 17, fontWeight: '800' },
  });
}
