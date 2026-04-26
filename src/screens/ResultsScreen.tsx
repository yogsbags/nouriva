import React, { useState, useEffect, useMemo, useRef, type ComponentType } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  LayoutAnimation,
  Platform,
  UIManager,
  Linking,
  Dimensions,
  Share,
  Modal,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CaretLeftIcon as CaretLeft,
  SquaresFourIcon as SquaresFour,
  StackIcon as Stack,
  ScanIcon as Scan,
  FlaskIcon as Flask,
  GaugeIcon as Gauge,
  WarningCircleIcon as WarningCircle,
  LightningIcon as Lightning,
  MicroscopeIcon as Microscope,
  DnaIcon as Dna,
  DropIcon as Drop,
  GrainsIcon as Grains,
  PlusIcon as PlusIcon,
  MinusIcon as MinusIcon,
  TrendUpIcon as TrendUp,
  ShareNetworkIcon as ShareNetwork,
  ForkKnifeIcon as ForkKnife,
  XIcon as XIcon,
  PencilSimpleIcon as PencilSimple,
  CheckIcon as Check,
  ArrowCounterClockwiseIcon as ArrowCounterClockwise,
  GearSixIcon as GearSix,
  UploadIcon as Upload,
  CameraIcon as Camera,
  CheckCircleIcon as CheckCircle,
  IconProps,
  LockSimpleIcon as LockSimple,
  SparkleIcon as Sparkle,
} from 'phosphor-react-native';
import { Svg, Circle, Defs, LinearGradient, Stop, Path, Rect, Line as SvgLine, Text as SvgText } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { saveFoodLog, getScanCount } from '../utils/history';
import { uploadFoodImage } from '../utils/imageUpload';
import { fetchHealthStats, getHealthImpactAnalysis, HealthStats, writeNutritionToAppleHealth } from '../utils/health';
import { supabase } from '../utils/supabase';
import * as SecureStore from 'expo-secure-store';
import { useColors, AppColors } from '../theme';
import { ScreenEnterAnimation } from '../components/ScreenEnterAnimation';
import { getAnalysisFailureMessage, isAnalysisIncomplete } from '../utils/analysisResult';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface SystemicItem { pillar: string; organ: string; score: string; title: string; desc: string; }
interface OrganItem { organ: string; score: string; driver: string; }
interface BiochemicalItem { name: string; type: string; effect: string; pathway: string; targets: string; inhibitors: string; summary?: string; }
interface AlertItem { type: string; desc: string; }
interface BalancerSuggestion { organ: string; suggestion: string; }
interface ReferenceItem { title: string; desc: string; url?: string; }
interface VisionItem { label: string; box_2d?: [number, number, number, number]; mask?: string; }

interface GlucoseData { gi: number; gl: number; fiberG: number; profile: string; insulinDemand: string; }

interface FoodScanResult {
  foodName?: string;
  macros?: { calories: string; protein: string; fats: string; carbs: string; servingBasis?: string; containerPrecisionFactor?: number; };
  systemicData?: SystemicItem[];
  organData?: OrganItem[];
  biochemicals?: BiochemicalItem[];
  alerts?: AlertItem[];
  balancerSuggestions?: BalancerSuggestion[];
  glucoseData?: GlucoseData;
  refs?: ReferenceItem[];
  vision?: VisionItem[];
  analysisIncomplete?: boolean;
  analysisError?: string;
  rawText?: string;
  error?: string;
}

interface ResultsScreenProps {
  navigation: NativeStackNavigationProp<any>;
  route: RouteProp<{ Results: { result?: FoodScanResult; originalImage?: string; isPersonalized?: boolean; isReplay?: boolean } }, 'Results'>;
}

type Tab = 'Holistic' | 'Organ' | 'Bio' | 'Alerts' | 'Glucose';
const TABS: { id: Tab; icon: ComponentType<IconProps>; label: string }[] = [
  { id: 'Holistic', icon: SquaresFour, label: 'Overview' },
  { id: 'Organ', icon: Stack, label: 'Organ' },
  { id: 'Bio', icon: Microscope, label: 'Compounds' },
  { id: 'Alerts', icon: WarningCircle, label: 'Alerts' },
  { id: 'Glucose', icon: TrendUp, label: 'Glucose' },
];

interface GlucoseSim {
  fasting: number;
  peakGlucose: number;
  excursion: number;
  peakTimeMin: number;
  peakInsulin: number;
  insulinPeakMin: number;
  recoveryMin: number;
  totalMin: number;
  points: [number, number][];
}

function parseFastingGlucose(conditions: string[], healthContext: string): number {
  const text = [...conditions, healthContext].join(' ');
  const match = text.match(/(?:fasting\s+(?:glucose|blood\s*sugar)|blood\s+glucose)[:\s]+(\d{2,3})/i);
  if (match) return Math.min(300, Math.max(60, parseInt(match[1])));
  const lower = text.toLowerCase();
  if (lower.includes('type 1 diabetes') || lower.includes('t1d')) return 132;
  if (lower.includes('type 2 diabetes') || lower.includes('t2dm') || lower.includes('diabetes mellitus')) return 128;
  if (lower.includes('diabetes')) return 122;
  if (lower.includes('prediabetes') || lower.includes('pre-diabetes') || lower.includes('impaired fasting')) return 108;
  if (lower.includes('insulin resistance') || lower.includes('metabolic syndrome')) return 100;
  return 90;
}

function getConditionGlucoseMult(conditions: string[], healthContext: string): number {
  const text = [...conditions, healthContext].join(' ').toLowerCase();
  if (text.includes('type 1 diabetes') || text.includes('t1d')) return 1.55;
  if (text.includes('type 2 diabetes') || text.includes('t2dm') || text.includes('diabetes mellitus')) return 1.4;
  if (text.includes('diabetes')) return 1.3;
  if (text.includes('prediabetes') || text.includes('insulin resistance') || text.includes('metabolic syndrome')) return 1.18;
  if (text.includes('obesity') || text.includes('overweight') || text.includes('bmi')) return 1.08;
  return 1.0;
}

function computeGlucoseSim(
  carbs: number,
  fats: number,
  protein: number,
  gi: number = 55,
  fiberG: number = 0,
  fastingGlucose: number = 90,
  conditionMult: number = 1.0,
): GlucoseSim {
  const giMod = Math.max(0.3, Math.min(1.8, gi / 55));
  const fiberMod = Math.max(0.55, 1 - fiberG * 0.025);
  const fatMod = Math.max(0.55, 1 - fats * 0.007);
  const protMod = Math.max(0.82, 1 - protein * 0.003);
  const excursion = Math.round(carbs * 1.35 * giMod * fiberMod * fatMod * protMod * conditionMult);
  const peakGlucose = fastingGlucose + excursion;
  const peakTimeMin = Math.round(45 + fats * 0.55 + protein * 0.25);
  const peakInsulin = Math.round(excursion * 0.26 * conditionMult);
  const insulinPeakMin = peakTimeMin + 18;
  const recoveryMin = peakTimeMin + Math.max(55, Math.round(excursion * 1.75 * Math.max(1, conditionMult * 0.9)));
  const totalMin = Math.min(Math.round(recoveryMin * 1.25), 360);

  const points: [number, number][] = [];
  for (let t = 0; t <= totalMin; t += 4) {
    let g: number;
    if (t <= peakTimeMin) {
      const p = t / peakTimeMin;
      g = fastingGlucose + excursion * (1 - Math.exp(-3.2 * p)) / (1 - Math.exp(-3.2));
    } else {
      const hl = (recoveryMin - peakTimeMin) * 0.55;
      g = fastingGlucose + (peakGlucose - fastingGlucose) * Math.exp(-((t - peakTimeMin) / hl));
    }
    points.push([t, Math.round(g)]);
  }
  return { fasting: fastingGlucose, peakGlucose, excursion, peakTimeMin, peakInsulin, insulinPeakMin, recoveryMin, totalMin, points };
}

export default function ResultsScreen({ navigation, route }: ResultsScreenProps) {
  const C = useColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(C), [C]);

  const [activeTab, setActiveTab] = useState<Tab>('Holistic');
  const [selectedOrganForRebalance, setSelectedOrganForRebalance] = useState<string | null>(null);
  const [healthStats, setHealthStats] = useState<HealthStats | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const shareCardRef = useRef<any>(null);

  type MacroDelta = { calories: number; protein: number; fats: number; carbs: number };
  const [appliedBalancers, setAppliedBalancers] = useState<Record<string, { scoreBoost: number; macroDelta: MacroDelta }>>({});
  const [editingFoodName, setEditingFoodName] = useState(false);
  const [foodNameValue, setFoodNameValue] = useState<string>('');
  const [isPro, setIsPro] = useState(false);
  const [userConditions, setUserConditions] = useState<string[]>([]);
  const [userHealthContext, setUserHealthContext] = useState('');
  const [trialActive, setTrialActive] = useState(true);
  const isAhaLocked = !isPro && !trialActive;

  useEffect(() => {
    (async () => {
      const [val, conditions, bio, insights, active] = await Promise.all([
        SecureStore.getItemAsync('isPro'),
        SecureStore.getItemAsync('medicalConditions'),
        SecureStore.getItemAsync('healthContext'),
        SecureStore.getItemAsync('reportInsights'),
        import('../utils/trialStatus').then(m => m.isTrialActive()),
      ]);
      setIsPro(val === 'true');
      setTrialActive(active);
      const conds: string[] = conditions ? JSON.parse(conditions) : [];
      setUserConditions(conds);
      setUserHealthContext([bio ?? '', insights ?? ''].filter(Boolean).join(' '));
    })();
  }, []);

  const result: FoodScanResult = route?.params?.result || {};
  const analysisFailed = isAnalysisIncomplete(result);
  const displaySystemicData = result.systemicData ?? [];
  const displayOrganData = result.organData ?? [];
  const displayBiochemicals = result.biochemicals ?? [];
  const displayAlerts = result.alerts ?? [];
  const displayBalancerSuggestions = result.balancerSuggestions ?? [];
  const displayRefs: ReferenceItem[] = result.refs ?? [];
  const originalImage: string | undefined = route?.params?.originalImage;
  const isReplay: boolean = route?.params?.isReplay ?? false;
  const visionData: VisionItem[] = result.vision || [];

  const scaleMacro = (macroStr: string | undefined, factor: number) => {
    if (!macroStr) return '0';
    const num = parseFloat(macroStr.replace(/[^0-9.]/g, ''));
    const unit = macroStr.replace(/[0-9.]/g, '').trim();
    if (isNaN(num)) return macroStr;
    return `${Math.round(num * factor)}${unit}`;
  };

  const currentMacros = result.macros
    ? {
        calories: scaleMacro(result.macros.calories, quantity),
        protein: scaleMacro(result.macros.protein, quantity),
        fats: scaleMacro(result.macros.fats || '0g', quantity),
        carbs: scaleMacro(result.macros.carbs, quantity),
      }
    : undefined;

  useEffect(() => {
    if (result.macros?.containerPrecisionFactor) setQuantity(result.macros.containerPrecisionFactor);
    setFoodNameValue(result.foodName || 'Scanned Food');
    loadHealthData();
  }, [result]);

  useEffect(() => {
    if (isReplay || analysisFailed) return;
    if (result.foodName && avgScore !== '0' && healthStats && currentMacros) {
      (async () => {
        let imageUrl: string | undefined;
        if (originalImage) {
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            imageUrl = await uploadFoodImage(originalImage, session.user.id) ?? undefined;
          }
        }
        saveFoodLog(
          result.foodName!,
          parseFloat(avgScore),
          imageUrl,
          originalImage,
          healthStats,
          currentMacros,
          {
            systemicData: result.systemicData,
            organData: result.organData,
            alerts: result.alerts,
            balancerSuggestions: result.balancerSuggestions,
            biochemicals: result.biochemicals,
            refs: result.refs,
          },
          {
            peakGlucose: glucoseSim.peakGlucose,
            excursion: glucoseSim.excursion,
            peakInsulin: glucoseSim.peakInsulin,
            recoveryMin: glucoseSim.recoveryMin,
          },
        );

        // Write nutrition to Apple Health so Nouriva AI appears in Settings → Health
        const parseG = (s?: string) => parseFloat((s || '0').replace(/[^0-9.]/g, '')) || 0;
        const parseKcal = (s?: string) => parseFloat((s || '0').replace(/[^0-9.]/g, '')) || 0;
        writeNutritionToAppleHealth({
          name: result.foodName!,
          calories: parseKcal(currentMacros?.calories),
          carbs: parseG(currentMacros?.carbs),
          protein: parseG(currentMacros?.protein),
          fat: parseG(currentMacros?.fats),
        }).catch(() => {/* silent — Health not connected */});
      })();
    }
  }, [healthStats, quantity, analysisFailed, isReplay]);

  const loadHealthData = async () => {
    const stats = await fetchHealthStats();
    setHealthStats(stats);
  };

  const handleTabChange = (tab: Tab) => {
    Haptics.selectionAsync();
    setActiveTab(tab);
  };

  const getScoreColor = (scoreText: string) => {
    const score = parseFloat(String(scoreText || '0').split('/')[0]);
    if (isNaN(score)) return C.textSecondary;
    if (score < 4.5) return C.scoreLow;
    if (score < 7.0) return C.scoreMid;
    return C.scoreHigh;
  };

  const handleRebalance = (organ: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectedOrganForRebalance(selectedOrganForRebalance === organ ? null : organ);
  };

  const handleShare = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShareModalVisible(true);
  };

  const handleShareCapture = async () => {
    try {
      const isAvailable = await Sharing.isAvailableAsync();
      if (!shareCardRef.current) return;
      const uri = await shareCardRef.current.capture();
      if (isAvailable) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share your meal scan' });
      } else {
        await Share.share({ message: `My meal "${foodNameValue || 'Scanned Food'}" scored ${avgScore}/10 on Nouriva AI — see how it hits each organ.` });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const getBalancerForOrgan = (organ: string) =>
    displayBalancerSuggestions.find((s) => (s.organ || '').toLowerCase() === (organ || '').toLowerCase())?.suggestion;

  const handleAddToNextMeal = async (protocol: string, label: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {
      const existing = await SecureStore.getItemAsync('nextMealReminders');
      const list: string[] = existing ? JSON.parse(existing) : [];
      const entry = `[${label}] ${protocol.slice(0, 120)}`;
      if (!list.includes(entry)) list.unshift(entry);
      await SecureStore.setItemAsync('nextMealReminders', JSON.stringify(list.slice(0, 10)));
    } catch {}
    Alert.alert(
      'Added to Next Meal',
      `"${label}" tip saved. You'll see it as a reminder before your next scan.`,
      [{ text: 'Got it' }]
    );
  };

  const handleQuickWin = (protocol: string, label: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Share.share({
      message: `Nouriva AI — ${label}\n\n${protocol}\n\nScanned with Nouriva AI.`,
    });
  };

  const computeScoreBoost = (scoreStr: string): number => {
    const score = parseFloat(String(scoreStr || '0').split('/')[0]);
    if (score < 4) return 1.8;
    if (score < 5.5) return 1.3;
    if (score < 7) return 0.9;
    return 0.5;
  };

  const estimateMacroDelta = (suggestion: string): MacroDelta => {
    const s = String(suggestion || '').toLowerCase();
    if (s.includes('walnut') || s.includes('almond') || s.includes(' nut') || s.includes('seed'))
      return { calories: 175, protein: 4, fats: 16, carbs: 5 };
    if (s.includes('protein') || s.includes('amino') || s.includes('whey') || s.includes('casein'))
      return { calories: 110, protein: 22, fats: 1, carbs: 3 };
    if (s.includes('acv') || s.includes('vinegar') || s.includes('lemon') || s.includes('lime'))
      return { calories: 5, protein: 0, fats: 0, carbs: 1 };
    if (s.includes('oil') || s.includes('omega') || s.includes('mct') || s.includes('ghee'))
      return { calories: 130, protein: 0, fats: 14, carbs: 0 };
    if (s.includes('fiber') || s.includes('vegetable') || s.includes('greens') || s.includes('broccoli'))
      return { calories: 35, protein: 2, fats: 0, carbs: 7 };
    if (s.includes('mg') || s.includes('µg') || s.includes('supplement') || s.includes('capsule'))
      return { calories: 5, protein: 0, fats: 0, carbs: 1 };
    if (s.includes('yogurt') || s.includes('kefir') || s.includes('probiotic'))
      return { calories: 80, protein: 6, fats: 2, carbs: 9 };
    return { calories: 55, protein: 3, fats: 2, carbs: 6 };
  };

  const handleAddToMeal = (key: string, scoreStr: string, suggestion: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const scoreBoost = computeScoreBoost(scoreStr);
    const macroDelta = estimateMacroDelta(suggestion);
    setAppliedBalancers(prev => ({ ...prev, [key]: { scoreBoost, macroDelta } }));
  };

  const handleRemoveFromMeal = (key: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setAppliedBalancers(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  // Effective scores with applied boosts
  const effectiveSystemicData = displaySystemicData.map(item => {
    const applied = appliedBalancers[item.pillar] ?? appliedBalancers[item.organ];
    if (!applied) return item;
    const base = parseFloat(String(item.score || '0').split('/')[0]);
    return { ...item, score: `${Math.min(10, base + applied.scoreBoost).toFixed(1)}/10` };
  });

  const effectiveOrganData = displayOrganData.map(item => {
    const applied = appliedBalancers[item.organ];
    if (!applied) return item;
    const base = parseFloat(String(item.score || '0').split('/')[0]);
    return { ...item, score: `${Math.min(10, base + applied.scoreBoost).toFixed(1)}/10` };
  });

  // Total macro delta from all applied balancers
  const totalMacroDelta = Object.values(appliedBalancers).reduce(
    (acc, { macroDelta }) => ({
      calories: acc.calories + macroDelta.calories,
      protein: acc.protein + macroDelta.protein,
      fats: acc.fats + macroDelta.fats,
      carbs: acc.carbs + macroDelta.carbs,
    }),
    { calories: 0, protein: 0, fats: 0, carbs: 0 }
  );

  const renderLockedOverlay = (title: string) => (
    <View style={styles.lockedOverlay}>
      <LockSimple size={24} color={C.primary} weight="bold" />
      <Text style={styles.lockedTitle}>{title} Locked</Text>
      <Text style={styles.lockedDesc}>Your 3-day free trial has ended. Upgrade to Nouriva Pro to unlock unlimited metabolic insights.</Text>
      <TouchableOpacity 
        style={styles.lockedBtn}
        onPress={() => navigation.navigate('Upgrade')}
      >
        <Sparkle size={14} color="#FFF" weight="fill" />
        <Text style={styles.lockedBtnText}>Unlock Unlimited Pro</Text>
      </TouchableOpacity>
    </View>
  );

  const calculateAverageScore = () => {
    if (!effectiveOrganData.length) return '0.0';
    const total = effectiveOrganData.reduce((sum, item) => sum + parseFloat(String(item.score || '0').split('/')[0]), 0);
    return (total / effectiveOrganData.length).toFixed(1);
  };

  const avgScore = calculateAverageScore();
  const avgScoreColor = getScoreColor(`${avgScore}/10`);

  const glucoseSim = useMemo<GlucoseSim & { interpretation: string; peakColor: string; isPersonalized: boolean; gi: number; gl: number; fiberG: number }>(() => {
    const parseG = (s?: string) => parseFloat((s || '0').replace(/[^0-9.]/g, '')) || 0;
    const carbs = parseG(currentMacros?.carbs ?? result.macros?.carbs);
    const fats = parseG(currentMacros?.fats ?? result.macros?.fats);
    const protein = parseG(currentMacros?.protein ?? result.macros?.protein);
    const gi = result.glucoseData?.gi ?? 55;
    const fiberG = result.glucoseData?.fiberG ?? 0;
    const gl = result.glucoseData?.gl ?? Math.round(gi * carbs / 100);
    const fastingGlucose = isPro ? parseFastingGlucose(userConditions, userHealthContext) : 90;
    const conditionMult = isPro ? getConditionGlucoseMult(userConditions, userHealthContext) : 1.0;
    const isPersonalized = isPro && (fastingGlucose !== 90 || conditionMult !== 1.0);
    const sim = computeGlucoseSim(carbs || 40, fats || 10, protein || 15, gi, fiberG, fastingGlucose, conditionMult);
    const pc = sim.peakGlucose > 180 ? '#EF4444' : sim.peakGlucose > 140 ? '#F59E0B' : '#10B981';
    const personalizedNote = isPersonalized ? ` (adjusted for your profile)` : '';
    const interp = sim.peakGlucose > 180
      ? `Significant spike to ${sim.peakGlucose} mg/dL — well above safe range. Insulin peaks at ${sim.insulinPeakMin}min but recovery takes ~${sim.recoveryMin}min.${personalizedNote}`
      : sim.peakGlucose > 140
      ? `Moderate spike to ${sim.peakGlucose} mg/dL, crossing the 140 mg/dL threshold. Insulin compensates at ${sim.insulinPeakMin}min, recovery in ~${sim.recoveryMin}min.${personalizedNote}`
      : `Healthy response — glucose peaks at ${sim.peakGlucose} mg/dL within normal range. Low insulin demand, recovery in ~${sim.recoveryMin}min.${personalizedNote}`;
    return { ...sim, interpretation: interp, peakColor: pc, isPersonalized, gi, gl, fiberG };
  }, [currentMacros, quantity, result.glucoseData, userConditions, userHealthContext]);

  const renderVitalityRing = (score: string, ringSize = 120, showBioSync = false) => {
    const strokeWidth = 9;
    const center = ringSize / 2;
    const radius = center - strokeWidth / 2;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (parseFloat(score) / 10) * circumference;
    return (
      <View style={{ width: ringSize, height: ringSize }}>
        <Svg width={ringSize} height={ringSize} style={{ position: 'absolute' }}>
          <Defs>
            <LinearGradient id="vGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor={avgScoreColor} stopOpacity="0.5" />
              <Stop offset="100%" stopColor={avgScoreColor} stopOpacity="1" />
            </LinearGradient>
          </Defs>
          <Circle cx={center} cy={center} r={radius} stroke={C.bgSecondary} strokeWidth={strokeWidth} fill="none" />
          <Circle
            cx={center} cy={center} r={radius}
            stroke="url(#vGrad)" strokeWidth={strokeWidth}
            strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
            strokeLinecap="round" fill="none"
            transform={`rotate(-90 ${center} ${center})`}
          />
        </Svg>
        <View style={{ width: ringSize, height: ringSize, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={styles.scoreLabel}>VITALITY</Text>
          <Text style={[styles.scoreTextMain, { color: avgScoreColor }]}>{score}</Text>
          <Text style={styles.scoreScale}>/10</Text>
          {showBioSync && (
            <View style={styles.personalizedBadge}>
              <Microscope size={9} weight="duotone" color={C.primary} />
              <Text style={styles.personalizedText}>BIO-SYNC</Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  const renderPersonalizeCTA = () => (
    <TouchableOpacity 
      style={styles.personalizeCTA} 
      onPress={() => {
        Haptics.selectionAsync();
        if (!isPro) {
          navigation.navigate('Upgrade');
        } else {
          // Use Main stack navigation if in tabs, otherwise navigate directly
          const nav: any = navigation.getParent() || navigation;
          nav.navigate('Main', { 
            screen: 'Profile',
            params: { scrollToSection: 'personalization' } 
          });
        }
      }}
    >
      <GearSix size={14} weight="duotone" color={C.primary} />
      <Text style={styles.personalizeCTAText}>Personalize for your biology</Text>
    </TouchableOpacity>
  );

  if (analysisFailed) {
    const failureMsg = getAnalysisFailureMessage(result);
    return (
      <ScreenEnterAnimation>
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.navBar}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <CaretLeft color={C.textPrimary} size={24} weight="bold" />
          </TouchableOpacity>
          <View style={styles.navHeaderCentered}>
            <Image source={require('../../assets/logo.png')} style={styles.navLogo} />
            <Text style={styles.navTitle}>Nouriva AI</Text>
          </View>
          <View style={{ width: 44 }} />
        </View>
        <ScrollView contentContainerStyle={[styles.scrollContent, styles.analysisFailScroll]} showsVerticalScrollIndicator={false}>
          {originalImage ? (
            <View style={styles.imageContainer}>
              <Image source={{ uri: `data:image/jpeg;base64,${originalImage}` }} style={styles.foodImage} resizeMode="cover" />
            </View>
          ) : null}
          <View style={styles.analysisFailCard}>
            <WarningCircle size={36} weight="duotone" color={C.scoreMid} />
            <Text style={styles.analysisFailTitle}>We couldn’t score this scan</Text>
            <Text style={styles.analysisFailBody}>{failureMsg}</Text>
            <TouchableOpacity
              style={styles.rescanButton}
              onPress={() => {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                (navigation as any).navigate('Main', {
                  screen: 'Scan',
                  params: { openCamera: true },
                });
              }}
              activeOpacity={0.9}
            >
              <ArrowCounterClockwise color="#FFF" size={18} weight="bold" />
              <Text style={styles.rescanButtonText}>Re-scan</Text>
            </TouchableOpacity>
            <Text style={styles.analysisFailHint}>
              Use good light, hold steady, and fill the frame with your food. On the scanner you can also upload a photo from your library.
            </Text>
            <TouchableOpacity style={styles.analysisFailSecondary} onPress={() => navigation.goBack()} activeOpacity={0.75}>
              <Text style={styles.analysisFailSecondaryText}>Go back</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
      </ScreenEnterAnimation>
    );
  }

  return (
    <ScreenEnterAnimation>
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Nav bar */}
      <View style={styles.navBar}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <CaretLeft color={C.textPrimary} size={24} weight="bold" />
        </TouchableOpacity>
        <View style={styles.navHeaderCentered}>
          <Image source={require('../../assets/logo.png')} style={styles.navLogo} />
          <Text style={styles.navTitle}>Nouriva AI</Text>
        </View>
        <TouchableOpacity style={styles.shareNavBtn} onPress={handleShare}>
          <ShareNetwork size={18} color={C.primary} weight="bold" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 100 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Food image with vision boxes */}
        {originalImage && (
          <View style={styles.imageContainer}>
            <Image source={{ uri: `data:image/jpeg;base64,${originalImage}` }} style={styles.foodImage} resizeMode="cover" />
            {visionData.map((v, i) => {
              if (!v.box_2d) return null;
              const [ymin, xmin, ymax, xmax] = v.box_2d;
              return (
                <View key={i} style={[styles.boundingBox, { top: `${ymin / 10}%` as any, left: `${xmin / 10}%` as any, height: `${(ymax - ymin) / 10}%` as any, width: `${(xmax - xmin) / 10}%` as any }]}>
                  {v.mask && <Image source={{ uri: v.mask.startsWith('data:') ? v.mask : `data:image/png;base64,${v.mask}` }} style={styles.maskImage} resizeMode="stretch" />}
                  <View style={styles.badgeLabel}><Text style={styles.badgeText}>{v.label}</Text></View>
                </View>
              );
            })}
          </View>
        )}

        {/* Section header with editable food name */}
        <View style={styles.sectionHeader}>
          <Scan color={C.primary} size={22} weight="duotone" />
          <View style={styles.systemicTitleColumn}>
            <Text style={styles.sectionTitle}>Analysis:</Text>
            {editingFoodName ? (
              <View style={styles.systemicNameRow}>
                <View style={styles.systemicFoodNameWrap}>
                  <TextInput
                    style={[styles.foodNameInput, styles.systemicNameInput, { color: C.primary }]}
                    value={foodNameValue}
                    onChangeText={setFoodNameValue}
                    autoFocus
                    multiline
                    scrollEnabled={false}
                    returnKeyType="done"
                    onSubmitEditing={() => setEditingFoodName(false)}
                    selectTextOnFocus
                  />
                </View>
                <TouchableOpacity
                  onPress={() => setEditingFoodName(false)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={styles.systemicEditIcon}
                >
                  <Check size={16} weight="bold" color={C.vitality} />
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.systemicNameRow}>
                <View style={styles.systemicFoodNameWrap}>
                  <Text style={[styles.focusText, { color: C.primary }]}>
                    {foodNameValue || 'Scanned Food'}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setEditingFoodName(true)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={styles.systemicEditIcon}
                >
                  <PencilSimple size={14} weight="bold" color={C.textTertiary} />
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        {/* Tab content */}
        {activeTab === 'Holistic' && (
          <View>
            {/* Score + summary */}
            <View style={styles.vitalityHeader}>
              {renderVitalityRing(avgScore, 120, route.params?.isPersonalized)}
              <View style={styles.vitalitySummary}>
                <Text style={styles.summaryStatusText}>
                  Meal balance is{' '}
                  <Text style={{ fontWeight: '800', color: avgScoreColor }}>
                    {parseFloat(avgScore) >= 7 ? 'Excellent' : parseFloat(avgScore) >= 5 ? 'Good' : 'Needs attention'}
                  </Text>
                  .
                </Text>
                {healthStats && (
                  <Text style={styles.summaryText}> {getHealthImpactAnalysis(healthStats, parseFloat(avgScore))}</Text>
                )}
              </View>
            </View>

            {/* Macros */}
            {currentMacros && (
              <View style={styles.macroCard}>
                <View style={styles.quantityRow}>
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <Text style={styles.quantityLabel} numberOfLines={2}>ADJUST PORTION ({result.macros?.servingBasis || '1x'})</Text>
                    <Text style={styles.quantitySub}>Auto-detected: {result.macros?.containerPrecisionFactor || 1.0}x</Text>
                  </View>
                  <View style={styles.counter}>
                    <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setQuantity(Math.max(0.5, quantity - 0.5)); }} style={styles.counterButton}>
                      <MinusIcon size={14} weight="bold" color={C.primary} />
                    </TouchableOpacity>
                    <Text style={styles.quantityValue}>{quantity}x</Text>
                    <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setQuantity(quantity + 0.5); }} style={styles.counterButton}>
                      <PlusIcon size={14} weight="bold" color={C.primary} />
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={styles.macroRow}>
                  {[
                    { Icon: Lightning, value: currentMacros.calories, label: 'kcal', color: C.energy, delta: totalMacroDelta.calories },
                    { Icon: Dna, value: currentMacros.protein, label: 'Protein', color: C.primary, delta: totalMacroDelta.protein },
                    { Icon: Drop, value: currentMacros.fats, label: 'Fats', color: C.danger, delta: totalMacroDelta.fats },
                    { Icon: Grains, value: currentMacros.carbs, label: 'Carbs', color: C.vitality, delta: totalMacroDelta.carbs },
                  ].map(({ Icon, value, label, color, delta }) => {
                    const base = parseFloat(value.replace(/[^0-9.]/g, '')) || 0;
                    const unit = value.replace(/[0-9.\s]/g, '') || '';
                    const total = delta ? Math.round(base + delta) : base;
                    return (
                      <View key={label} style={styles.macroItem}>
                        <View style={{ height: 16, justifyContent: 'center' }}>
                          <Icon size={14} weight="duotone" color={color} />
                        </View>
                        <Text style={styles.macroValue}>{delta ? `${total}${unit}` : value}</Text>
                        {delta > 0 && <Text style={styles.macroDelta}>+{delta}{unit === 'kcal' ? 'kcal' : 'g'}</Text>}
                        <Text style={styles.macroLabel}>{label}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Systemic table */}
            <View style={styles.card}>
              {isAhaLocked && renderLockedOverlay('Systemic Analysis')}
              <View style={styles.tableHeader}>
                <Text style={[styles.columnHeader, { flex: 1.4 }]}>Body system</Text>
                <View style={{ flex: 0.7, alignItems: 'center' }}>
                  <Text style={styles.columnHeader}>Score</Text>
                  <Text style={styles.columnSubHeader}>(/10)</Text>
                </View>
                <Text style={[styles.columnHeader, { flex: 2.9 }]}>What this means</Text>
              </View>
              {effectiveSystemicData.map((item, index) => {
                const scoreNum = parseFloat(String(item.score || '0').split('/')[0]);
                const needsRebalance = scoreNum < 7.0;
                const primaryOrgan = String(item.organ || '').replace(/[()]/g, '').split('/')[0].trim();
                const isSelected = selectedOrganForRebalance === primaryOrgan;
                const balancer = getBalancerForOrgan(primaryOrgan);
                const originalScore = parseFloat(String(displaySystemicData[index]?.score ?? item.score ?? '0').split('/')[0]);
                const boost = computeScoreBoost(`${originalScore}/10`);
                const isApplied = !!appliedBalancers[item.pillar] || !!appliedBalancers[primaryOrgan];
                return (
                  <View key={index} style={[styles.tableRow, index === displaySystemicData.length - 1 && !isSelected && styles.lastRow, { flexDirection: 'column' }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <View style={{ flex: 1.4, paddingRight: 8 }}>
                        <Text style={styles.pillarName}>{item.pillar || 'Overview'}</Text>
                        <Text style={styles.organName}>{item.organ || 'Impact'}</Text>
                      </View>
                      <View style={{ flex: 0.7, alignItems: 'center' }}>
                        <Text style={[styles.scoreText, { color: getScoreColor(item.score) }]}>{String(item.score || '0').split('/')[0]}</Text>
                      </View>
                      <View style={{ flex: 2.9 }}>
                        <Text style={styles.descTitle}>{item.title || 'Summary'}</Text>
                        <Text style={styles.descText}>{item.desc || 'No further data available.'}</Text>
                      </View>
                    </View>
                    {needsRebalance && (
                      <TouchableOpacity
                        style={[
                          styles.rebalanceCTA,
                          isApplied ? styles.rebalanceCTAApplied : (isSelected && styles.rebalanceCTAActive),
                        ]}
                        activeOpacity={0.9}
                        onPress={() => {
                          if (isApplied) {
                            handleRemoveFromMeal(item.pillar);
                            if (isSelected) handleRebalance(primaryOrgan);
                          } else {
                            handleRebalance(primaryOrgan);
                          }
                        }}
                      >
                        <Lightning size={13} color={isApplied ? C.scoreHigh : isSelected ? '#FFF' : C.primary} weight="fill" />
                        <Text style={[
                          styles.rebalanceLabel,
                          isApplied ? styles.rebalanceLabelApplied : (isSelected && styles.rebalanceLabelActive),
                        ]}>
                          {isApplied ? `Applied +${boost.toFixed(1)}` : isSelected ? 'Active' : 'What to eat'}
                        </Text>
                      </TouchableOpacity>
                    )}
                    {isSelected && (
                      <View style={[styles.balancerCard, { borderLeftColor: getScoreColor(displaySystemicData[index]?.score ?? item.score) }]}>
                        <View style={styles.balancerHeader}>
                          <View style={[styles.balancerIconBox, { backgroundColor: getScoreColor(displaySystemicData[index]?.score ?? item.score) + '20' }]}>
                            <Lightning size={15} weight="fill" color={getScoreColor(displaySystemicData[index]?.score ?? item.score)} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.balancerHeaderLabel}>HOW TO IMPROVE</Text>
                            <Text style={[styles.balancerHeaderTitle, { color: getScoreColor(displaySystemicData[index]?.score ?? item.score) }]}>
                              Improve {item.pillar}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.balancerProtocolText}>
                          {balancer || `For your ${item.pillar} score, try adding fibre-rich vegetables with your next meal, or a short walk after eating — small steps that support steadier energy.`}
                        </Text>
                        <View style={styles.balancerActionRow}>
                          <TouchableOpacity
                            style={[
                              styles.balancerActionChip,
                              isApplied && { backgroundColor: C.scoreHigh + '20' },
                            ]}
                            onPress={() => {
                              if (isApplied) {
                                handleRemoveFromMeal(item.pillar);
                              } else {
                                handleAddToMeal(item.pillar, displaySystemicData[index]?.score ?? item.score, balancer || '');
                              }
                            }}
                            activeOpacity={0.75}
                          >
                            {isApplied
                              ? <MinusIcon size={11} weight="bold" color={C.scoreHigh} />
                              : <PlusIcon size={11} weight="bold" color={C.vitality} />}
                            <Text style={[styles.balancerActionText, isApplied && { color: C.scoreHigh }]}>
                              {isApplied ? `Remove (+${boost.toFixed(1)} pts)` : `Apply (+${boost.toFixed(1)} pts)`}
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.balancerActionChip, { backgroundColor: C.primaryMuted }]}
                            onPress={() => handleQuickWin(balancer || `Improve ${item.pillar}`, item.pillar)}
                            activeOpacity={0.75}
                          >
                            <Lightning size={11} weight="fill" color={C.primary} />
                            <Text style={[styles.balancerActionText, { color: C.primary }]}>Share tip</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
            {!isAhaLocked && renderPersonalizeCTA()}
          </View>
        )}

        {activeTab === 'Organ' && (
          <View style={styles.card}>
            {isAhaLocked && renderLockedOverlay('Organ Details')}
            <View style={styles.tableHeader}>
                <Text style={[styles.columnHeader, { flex: 1 }]}>Organ</Text>
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={styles.columnHeader}>Score</Text>
                  <Text style={styles.columnSubHeader}>(/10)</Text>
                </View>
                <Text style={[styles.columnHeader, { flex: 2 }]}>Primary Driver</Text>
              </View>
              {effectiveOrganData.map((item, index) => {
                const scoreNum = parseFloat(String(item.score || '0').split('/')[0]);
                const needsRebalance = scoreNum < 7.0;
                const isSelected = selectedOrganForRebalance === item.organ;
                const balancer = getBalancerForOrgan(item.organ);
                const originalScore = parseFloat(String(displayOrganData[index]?.score ?? item.score ?? '0').split('/')[0]);
                const boost = computeScoreBoost(`${originalScore}/10`);
                const isApplied = !!appliedBalancers[item.organ];
                return (
                  <View key={index} style={[styles.tableRow, index === effectiveOrganData.length - 1 && !isSelected && styles.lastRow, { flexDirection: 'column' }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.pillarName}>{item.organ || 'Organ'}</Text>
                        {isApplied && (
                          <Text style={styles.appliedBadge}>↑ boosted</Text>
                        )}
                      </View>
                      <View style={{ flex: 1, alignItems: 'center' }}>
                        <Text style={[styles.scoreText, { color: getScoreColor(item.score) }]}>{String(item.score || '0').split('/')[0]}</Text>
                        {isApplied && (
                          <Text style={[styles.scoreDeltaText, { color: C.scoreHigh }]}>
                            +{boost.toFixed(1)}
                          </Text>
                        )}
                      </View>
                      <View style={{ flex: 2 }}>
                        <Text style={styles.descText}>{item.driver || 'No driver details.'}</Text>
                      </View>
                    </View>
                    {needsRebalance && (
                      <TouchableOpacity
                        style={[
                          styles.rebalanceCTA,
                          isApplied ? styles.rebalanceCTAApplied : (isSelected && styles.rebalanceCTAActive),
                        ]}
                        activeOpacity={0.9}
                        onPress={() => {
                          if (isApplied) {
                            handleRemoveFromMeal(item.organ);
                            if (isSelected) handleRebalance(item.organ);
                          } else {
                            handleRebalance(item.organ);
                          }
                        }}
                      >
                        <Gauge size={13} weight="duotone" color={isApplied ? C.scoreHigh : isSelected ? '#FFF' : C.primary} />
                        <Text style={[
                          styles.rebalanceLabel,
                          isApplied ? styles.rebalanceLabelApplied : (isSelected && styles.rebalanceLabelActive),
                        ]}>
                          {isApplied ? `Applied +${boost.toFixed(1)}` : isSelected ? 'Active' : 'What to eat'}
                        </Text>
                      </TouchableOpacity>
                    )}
                    {isSelected && (
                      <View style={[styles.balancerCard, { borderLeftColor: getScoreColor(displayOrganData[index]?.score ?? item.score) }]}>
                        <View style={styles.balancerHeader}>
                          <View style={[styles.balancerIconBox, { backgroundColor: getScoreColor(displayOrganData[index]?.score ?? item.score) + '20' }]}>
                            <Flask size={15} weight="duotone" color={getScoreColor(displayOrganData[index]?.score ?? item.score)} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.balancerHeaderLabel}>HOW TO IMPROVE</Text>
                            <Text style={[styles.balancerHeaderTitle, { color: getScoreColor(displayOrganData[index]?.score ?? item.score) }]}>
                              Improve {item.organ}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.balancerProtocolText}>
                          {balancer || `To support your ${item.organ}, try leafy greens, extra fibre, or a short walk — simple habits that help your body settle after eating.`}
                        </Text>
                        <View style={styles.balancerActionRow}>
                          <TouchableOpacity
                            style={[
                              styles.balancerActionChip,
                              isApplied && { backgroundColor: C.scoreHigh + '20' },
                            ]}
                            onPress={() => {
                              if (isApplied) {
                                handleRemoveFromMeal(item.organ);
                              } else {
                                handleAddToMeal(item.organ, displayOrganData[index]?.score ?? item.score, balancer || '');
                              }
                            }}
                            activeOpacity={0.75}
                          >
                            {isApplied
                              ? <MinusIcon size={11} weight="bold" color={C.scoreHigh} />
                              : <PlusIcon size={11} weight="bold" color={C.vitality} />}
                            <Text style={[styles.balancerActionText, isApplied && { color: C.scoreHigh }]}>
                              {isApplied ? `Remove (+${boost.toFixed(1)} pts)` : `Apply (+${boost.toFixed(1)} pts)`}
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.balancerActionChip, { backgroundColor: C.primaryMuted }]}
                            onPress={() => handleQuickWin(balancer || `Improve ${item.organ}`, item.organ)}
                            activeOpacity={0.75}
                          >
                            <ShareNetwork size={11} weight="bold" color={C.primary} />
                            <Text style={[styles.balancerActionText, { color: C.primary }]}>Share tip</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}
                  </View>
                );
              })}
              {!isAhaLocked && renderPersonalizeCTA()}
          </View>
        )}

        {activeTab === 'Bio' && (
          <View style={styles.card}>
            {displayBiochemicals.map((item, index) => (
              <View key={index} style={[styles.tableRow, index === displayBiochemicals.length - 1 && styles.lastRow, { flexDirection: 'column', alignItems: 'flex-start' }]}>
                <View style={styles.bioItemHeader}>
                  <Text style={styles.bioItemName}>{item.name}</Text>
                  <View style={styles.bioTypeBadge}><Text style={styles.bioTypeText}>{String(item.type || 'compound').toUpperCase()}</Text></View>
                </View>
                {[
                  { label: 'What it does: ', value: item.effect },
                  { label: 'How it works: ', value: item.pathway },
                  { label: 'Targets: ', value: item.targets },
                  { label: 'Inhibitors: ', value: item.inhibitors },
                ].map(({ label, value }) => (
                  <View key={label} style={styles.bioDetailRow}>
                    <Text style={styles.bioDetailLabel}>{label}</Text>
                    <Text style={styles.bioDetailText}>{value}</Text>
                  </View>
                ))}
                {item.summary && (
                  <View style={styles.bioSummaryBox}>
                    <Text style={styles.bioSummaryText}><Text style={{ fontWeight: '800' }}>Summary: </Text>{item.summary}</Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        {activeTab === 'Alerts' && (
          <View>
            <View style={styles.card}>
              {displayAlerts.length === 0 ? (
                <View style={styles.emptyTabState}>
                  <WarningCircle size={32} weight="duotone" color={C.vitality} />
                  <Text style={styles.emptyTabTitle}>No Alerts Detected</Text>
                  <Text style={styles.emptyTabText}>This meal appears safe for your current biometric profile.</Text>
                </View>
              ) : displayAlerts.map((item, index) => (
                <View key={index} style={[styles.alertRow, index === displayAlerts.length - 1 && styles.lastRow]}>
                  <View style={styles.alertIconBox}>
                    <WarningCircle size={15} weight="fill" color={C.danger} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.alertType}>{item.type}</Text>
                    <Text style={styles.alertDesc}>{item.desc}</Text>
                  </View>
                </View>
              ))}
            </View>

            {/* References below alerts */}
            <View style={[styles.card, { marginTop: 0 }]}>
              <Text style={styles.refTitle}>Citations & sources</Text>
              {displayRefs.map((item, index) => (
                <TouchableOpacity key={index} style={styles.bulletRow} onPress={() => item.url && Linking.openURL(item.url)} disabled={!item.url}>
                  <View style={[styles.bulletDot, { backgroundColor: C.primary }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.refBold, item.url && { color: C.primary }]}>{item.title}</Text>
                    <Text style={styles.refDesc}>{item.desc}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {activeTab === 'Glucose' && (() => {
          const sim = glucoseSim;
          const chartW = Dimensions.get('window').width - 64;
          const chartH = 196;
          const padL = 34, padR = 8, padT = 8, padB = 44;
          const innerW = chartW - padL - padR;
          const innerH = chartH - padT - padB;
          const yMin = 70, yMax = 310;
          const xScale = (t: number) => padL + (t / sim.totalMin) * innerW;
          const yScale = (g: number) => padT + (1 - (g - yMin) / (yMax - yMin)) * innerH;
          const yLabels = [70, 110, 150, 190, 230, 270, 310];

          const glucosePath = sim.points.reduce((p, [t, g], i) =>
            p + (i === 0 ? `M ${xScale(t).toFixed(1)} ${yScale(g).toFixed(1)}` : ` L ${xScale(t).toFixed(1)} ${yScale(g).toFixed(1)}`), '');

          // Insulin curve: peaks at insulinPeakMin, scaled to show alongside glucose
          const insulinYMax = sim.peakInsulin * 1.3;
          const insulinYScale = (u: number) => padT + (1 - u / insulinYMax) * innerH;
          const insulinPath = sim.points.reduce((p, [t], i) => {
            const u = t <= sim.insulinPeakMin
              ? sim.peakInsulin * (1 - Math.exp(-3.5 * (t / sim.insulinPeakMin))) / (1 - Math.exp(-3.5))
              : sim.peakInsulin * Math.exp(-((t - sim.insulinPeakMin) / ((sim.recoveryMin - sim.insulinPeakMin) * 0.45)));
            const y = insulinYScale(Math.max(0, u));
            return p + (i === 0 ? `M ${xScale(t).toFixed(1)} ${y.toFixed(1)}` : ` L ${xScale(t).toFixed(1)} ${y.toFixed(1)}`);
          }, '');

          const xTickTimes = Array.from(new Set([0, sim.peakTimeMin, sim.insulinPeakMin, sim.totalMin])).sort((a, b) => a - b);

          const peakColor = sim.peakColor;
          const chartInterpretation = sim.interpretation;

          const timeline = [
            { min: 0, color: C.scoreHigh, label: `Meal consumed — ${Math.round(parseFloat((currentMacros?.carbs ?? result.macros?.carbs ?? '0g').replace(/[^0-9.]/g,'')))}g carbs, ${Math.round(parseFloat((currentMacros?.fats ?? result.macros?.fats ?? '0g').replace(/[^0-9.]/g,'')))}g fat` },
            { min: 15, color: C.scoreHigh, label: 'Glucose starts rising from the gut into your bloodstream' },
            { min: sim.peakTimeMin, color: C.scoreMid, label: `Glucose peak: ${sim.peakGlucose} mg/dL at ${sim.peakTimeMin} min` },
            { min: sim.insulinPeakMin, color: C.primary, label: `Insulin peak: ${sim.peakInsulin} µU/mL — pancreas working hard to keep up` },
          ];

          return (
            <View>
              {/* Stat cards */}
              {sim.isPersonalized ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10, paddingHorizontal: 4 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.primary }} />
                  <Text style={{ fontSize: 11, color: C.primary, fontWeight: '600' }}>Personalized to your health profile</Text>
                </View>
              ) : !isPro ? (
                <TouchableOpacity
                  onPress={() => navigation.navigate('Upgrade')}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10, paddingHorizontal: 4 }}
                >
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.textTertiary }} />
                  <Text style={{ fontSize: 11, color: C.textTertiary, fontWeight: '600' }}>Generic estimate · <Text style={{ color: C.primary }}>Upgrade to personalize for your biology</Text></Text>
                </TouchableOpacity>
              ) : null}
              <View style={styles.glucoseStatRow}>
                {[
                  { label: 'peak glucose mg/dL', value: String(sim.peakGlucose), color: peakColor },
                  { label: 'glycemic index', value: String(sim.gi), color: sim.gi > 70 ? '#EF4444' : sim.gi > 55 ? '#F59E0B' : '#10B981' },
                  { label: 'glycemic load', value: String(sim.gl), color: sim.gl > 20 ? '#EF4444' : sim.gl > 11 ? '#F59E0B' : '#10B981' },
                  { label: 'recovery min', value: sim.recoveryMin > 240 ? '>240' : String(sim.recoveryMin), color: C.textSecondary },
                ].map(({ label, value, color }) => (
                  <View key={label} style={styles.glucoseStatCard}>
                    <Text style={[styles.glucoseStatValue, { color }]}>{value}</Text>
                    <Text style={styles.glucoseStatLabel}>{label}</Text>
                  </View>
                ))}
              </View>

              {/* Chart */}
              <View style={styles.glucoseChartCard}>
                {isAhaLocked ? (
                  <View style={{ height: 260 }}>
                    {renderLockedOverlay('Glucose Simulation')}
                  </View>
                ) : (
                  <>
                    <View style={styles.glucoseLegend}>
                      <View style={styles.legendItem}>
                        <View style={[styles.legendLine, { backgroundColor: C.scoreLow }]} />
                        <Text style={styles.legendText}>Blood glucose (mg/dL)</Text>
                      </View>
                      <View style={styles.legendItem}>
                        <View style={[styles.legendLine, { backgroundColor: C.primary }]} />
                        <Text style={styles.legendText}>Insulin (µU/mL)</Text>
                      </View>
                      <View style={styles.legendItem}>
                        <View style={styles.legendDashVisible}>
                          <View style={[styles.legendDashSeg, { backgroundColor: C.scoreMid }]} />
                          <View style={styles.legendDashGap} />
                          <View style={[styles.legendDashSeg, { backgroundColor: C.scoreMid }]} />
                          <View style={styles.legendDashGap} />
                          <View style={[styles.legendDashSeg, { backgroundColor: C.scoreMid }]} />
                        </View>
                        <Text style={styles.legendText}>140 mg/dL</Text>
                      </View>
                    </View>

                    <Svg width={chartW} height={chartH}>
                      {/* Normal range band 70–140 */}
                      <Rect
                        x={padL} y={yScale(140)}
                        width={innerW} height={yScale(70) - yScale(140)}
                        fill={C.scoreHigh + '14'}
                      />
                      {/* Grid lines + Y labels */}
                      {yLabels.map(y => (
                        <React.Fragment key={y}>
                          <SvgLine x1={padL} y1={yScale(y)} x2={padL + innerW} y2={yScale(y)} stroke={C.border} strokeWidth={0.7} />
                          <SvgText x={padL - 4} y={yScale(y) + 3.5} fontSize={8.5} fill={C.textTertiary} textAnchor="end">{y}</SvgText>
                        </React.Fragment>
                      ))}
                      {/* 140 threshold dashed line */}
                      <SvgLine x1={padL} y1={yScale(140)} x2={padL + innerW} y2={yScale(140)} stroke={C.scoreMid} strokeWidth={1} strokeDasharray="5,3" opacity={0.7} />
                      {/* Insulin curve */}
                      <Path d={insulinPath} fill="none" stroke={C.primary} strokeWidth={1.8} strokeDasharray="5,3" strokeLinejoin="round" strokeLinecap="round" opacity={0.8} />
                      {/* Glucose curve */}
                      <Path d={glucosePath} fill="none" stroke={C.scoreLow} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
                      {/* Peak dot */}
                      <Circle cx={xScale(sim.peakTimeMin)} cy={yScale(sim.peakGlucose)} r={4.5} fill={peakColor} />
                      {/* Insulin peak dot */}
                      <Circle cx={xScale(sim.insulinPeakMin)} cy={insulinYScale(sim.peakInsulin)} r={3.5} fill={C.primary} />
                      {/* X axis ticks */}
                      {xTickTimes.map(t => (
                        <React.Fragment key={t}>
                          <SvgLine x1={xScale(t)} y1={padT + innerH} x2={xScale(t)} y2={padT + innerH + 3} stroke={C.border} strokeWidth={0.8} />
                          <SvgText
                            x={xScale(t)}
                            y={padT + innerH + 13}
                            fontSize={8}
                            fill={C.textTertiary}
                            textAnchor={t === 0 ? 'start' : t === sim.totalMin ? 'end' : 'middle'}
                          >{t}m</SvgText>
                        </React.Fragment>
                      ))}
                      {/* X axis title */}
                      <SvgText x={padL + innerW / 2} y={padT + innerH + 26} fontSize={8.5} fill={C.textTertiary} textAnchor="middle">minutes after meal</SvgText>
                    </Svg>
                    <View style={[styles.glucoseInterpretBox, { borderLeftColor: peakColor }]}>
                      <Text style={[styles.glucoseInterpretText, { color: peakColor }]}>{chartInterpretation}</Text>
                    </View>
                    <Text style={styles.glucoseDisclaimer}>
                      * Simulated curves are typical population averages. Actual response may vary by individual.
                    </Text>

                    <View style={styles.glucoseTimeline}>
                      {timeline.map(({ min, color, label }) => (
                        <View key={min} style={styles.glucoseTimelineRow}>
                          <Text style={styles.glucoseTimeMin}>{min}m</Text>
                          <View style={[styles.glucoseTimeDot, { backgroundColor: color }]} />
                          <Text style={styles.glucoseTimeLabel}>{label}</Text>
                        </View>
                      ))}
                    </View>
                  </>
                )}
              </View>

              {/* Warning banners */}
              {sim.peakGlucose > 140 && (
                <View style={styles.glucoseWarning}>
                  <Text style={styles.glucoseWarningText}>
                    ⚠ Glucose above 140 mg/dL after this meal (worth watching)
                  </Text>
                </View>
              )}
              {sim.recoveryMin > 180 && (
                <View style={styles.glucoseWarning}>
                  <Text style={styles.glucoseWarningText}>
                    ⚠ Glucose may stay elevated for 3+ hours
                  </Text>
                </View>
              )}

              {sim.peakGlucose > 140 && (
                <View style={styles.mitigationBox}>
                  <View style={styles.mitigationHeader}>
                    <Lightning size={16} weight="fill" color={C.primary} />
                    <Text style={styles.mitigationTitle}>What to do now</Text>
                  </View>
                  <Text style={styles.mitigationText}>
                    To help bring your blood sugar down faster, consider a 10-15 minute walk. This helps your muscles process the sugar more efficiently and blunts the spike.
                  </Text>
                </View>
              )}
            </View>
          );
        })()}
      </ScrollView>

      {/* Share Modal */}
      <Modal visible={shareModalVisible} transparent animationType="slide" onRequestClose={() => setShareModalVisible(false)}>
        <View style={styles.shareOverlay}>
          <View style={styles.shareSheet}>
            <View style={styles.shareSheetHandle} />
            <View style={styles.shareSheetHeader}>
              <Text style={styles.shareSheetTitle}>Share Your Scan</Text>
              <TouchableOpacity onPress={() => setShareModalVisible(false)} style={styles.shareCloseBtn}>
                <XIcon size={16} weight="bold" color={C.textTertiary} />
              </TouchableOpacity>
            </View>

            {/* Share Card (captured by ViewShot) */}
            <ViewShot ref={shareCardRef} options={{ format: 'png', quality: 1.0 }} style={styles.shareCardWrapper}>
              <View style={styles.shareCard}>
                {/* Header */}
                <View style={styles.shareCardHeader}>
                  <Image source={require('../../assets/logo.png')} style={styles.shareCardLogo} />
                  <Text style={styles.shareCardBrand}>Nouriva AI</Text>
                  <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 6 }}>
                    {glucoseSim.isPersonalized && (
                      <View style={{ backgroundColor: C.primary, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                        <Text style={{ fontSize: 8, fontWeight: '800', color: '#FFF', textTransform: 'uppercase' }}>Personalized</Text>
                      </View>
                    )}
                    <Text style={styles.shareCardTagline}>Meal intelligence</Text>
                  </View>
                </View>

                {/* Food image + score row */}
                <View style={styles.shareCardHero}>
                  {originalImage ? (
                    <Image
                      source={{ uri: `data:image/jpeg;base64,${originalImage}` }}
                      style={styles.shareCardImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={[styles.shareCardImage, { backgroundColor: C.bgSecondary, justifyContent: 'center', alignItems: 'center' }]}>
                      <ForkKnife size={32} weight="duotone" color={C.primary} />
                    </View>
                  )}
                  <View style={styles.shareCardScoreBox}>
                    {renderVitalityRing(avgScore, 96, false)}
                  </View>
                </View>

                {/* Food name */}
                <Text style={styles.shareCardFoodName} numberOfLines={2}>
                  {foodNameValue || 'Scanned Meal'}
                </Text>

                {/* Macros strip */}
                {currentMacros && (
                  <View style={styles.shareCardMacros}>
                    {[
                      { label: 'Cal', value: currentMacros.calories.replace(' kcal', '').replace('kcal', '') },
                      { label: 'Protein', value: currentMacros.protein },
                      { label: 'Carbs', value: currentMacros.carbs },
                      { label: 'Fats', value: currentMacros.fats },
                    ].map(({ label, value }) => (
                      <View key={label} style={styles.shareCardMacroItem}>
                        <Text style={styles.shareCardMacroValue}>{value}</Text>
                        <Text style={styles.shareCardMacroLabel}>{label}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Organ scores */}
                <View style={styles.shareCardOrgans}>
                  {displayOrganData.slice(0, 6).map((o) => {
                    const scoreNum = parseFloat(String(o.score || '0').split('/')[0]);
                    const color = getScoreColor(o.score);
                    return (
                      <View key={o.organ} style={styles.shareCardOrganItem}>
                        <Text style={[styles.shareCardOrganScore, { color }]}>{String(o.score || '0/10').split('/')[0]}</Text>
                        <Text style={styles.shareCardOrganName}>{o.organ}</Text>
                      </View>
                    );
                  })}
                </View>

                {/* Glucose summary */}
                <View style={[styles.shareCardGlucose, { borderTopColor: C.border }]}>
                  <View style={styles.shareCardGlucoseStats}>
                    {[
                      { label: 'Peak glucose', value: `${glucoseSim.peakGlucose} mg/dL`, color: glucoseSim.peakColor },
                      { label: 'Glycemic Index', value: String(glucoseSim.gi), color: glucoseSim.gi > 70 ? '#EF4444' : glucoseSim.gi > 55 ? '#F59E0B' : '#10B981' },
                      { label: 'Recovery', value: `~${glucoseSim.recoveryMin}min`, color: C.textSecondary },
                    ].map(({ label, value, color }) => (
                      <View key={label} style={styles.shareCardGlucoseStat}>
                        <Text style={[styles.shareCardGlucoseVal, { color }]}>{value}</Text>
                        <Text style={styles.shareCardGlucoseLbl}>{label}</Text>
                      </View>
                    ))}
                  </View>
                  <View style={[styles.shareCardInterpret, { borderLeftColor: glucoseSim.peakColor }]}>
                    <Text style={[styles.shareCardInterpretText, { color: glucoseSim.peakColor }]}>{glucoseSim.interpretation}</Text>
                  </View>
                </View>

                {/* Footer / CTA */}
                <View style={styles.shareCardFooter}>
                  <View style={styles.shareCardFooterLeft}>
                    <Text style={styles.shareCardFooterBrand}>Nouriva AI</Text>
                    <Text style={styles.shareCardFooterTag}>Precision Metabolic Analysis</Text>
                    <Text style={styles.shareCardBadge}>nouriva.app</Text>
                  </View>
                  <View style={styles.shareCardQR}>
                    <View style={styles.shareCardQRInner}>
                      <Image 
                        source={{ uri: `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${process.env.EXPO_PUBLIC_APP_SHARE_URL || 'https://productverse.in'}` }}
                        style={{ width: 36, height: 36 }}
                      />
                    </View>
                    <Text style={styles.shareCardQRText}>SCAN TO DOWNLOAD</Text>
                  </View>
                </View>
              </View>
            </ViewShot>

            {/* Share button */}
            <TouchableOpacity style={styles.shareActionBtn} onPress={handleShareCapture} activeOpacity={0.88}>
              <ShareNetwork size={18} color="#FFF" weight="bold" />
              <Text style={styles.shareActionText}>Share Image</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.shareTextBtn}
              onPress={async () => {
                await Share.share({ message: `I just scanned "${foodNameValue || 'a meal'}" with Nouriva AI — Vitality Score: ${avgScore}/10.\n\nOrgan breakdown:\n${displayOrganData.slice(0,4).map(o => `• ${o.organ}: ${o.score}`).join('\n')}\n\nGet Nouriva AI: ${process.env.EXPO_PUBLIC_APP_SHARE_URL || 'https://productverse.in'}` });
                setShareModalVisible(false);
              }}
              activeOpacity={0.75}
            >
              <Text style={styles.shareTextBtnLabel}>Share as Text</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Bottom tab bar — padding uses system nav bar inset (edge-to-edge Android) */}
      <View style={[styles.bottomTabBar, { paddingBottom: 10 + insets.bottom }]}>
        {TABS.map(({ id, icon: Icon, label }) => {
          const isActive = activeTab === id;
          return (
            <TouchableOpacity key={id} style={styles.bottomTabItem} onPress={() => handleTabChange(id)} activeOpacity={0.7}>
              <View style={[styles.tabIconWrapper, isActive && styles.tabIconWrapperActive]}>
                <Icon size={18} weight={isActive ? "fill" : "duotone"} color={isActive ? C.tabActive : C.tabInactive} />
              </View>
              <Text style={[styles.bottomTabLabel, isActive && { color: C.tabActive }]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </SafeAreaView>
    </ScreenEnterAnimation>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    navBar: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingVertical: 12,
      backgroundColor: C.navBar, borderBottomWidth: 1, borderBottomColor: C.navBorder,
    },
    navHeaderCentered: { flexDirection: 'row', alignItems: 'center' },
    navLogo: { width: 24, height: 24, marginRight: 8, borderRadius: 6 },
    backButton: { padding: 8, width: 44 },
    shareNavBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: C.primaryMuted, justifyContent: 'center', alignItems: 'center' },
    navTitle: { fontSize: 17, fontWeight: '700', color: C.textPrimary },
    scrollContent: { padding: 16, paddingBottom: 100 },
    analysisFailScroll: { flexGrow: 1, paddingBottom: 32 },
    analysisFailCard: {
      backgroundColor: C.surface,
      borderRadius: 20,
      padding: 22,
      borderWidth: 1,
      borderColor: C.border,
      alignItems: 'center',
      gap: 12,
      marginTop: 4,
    },
    lockedOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(255,255,255,0.95)',
      borderRadius: 16,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
      zIndex: 100,
    },
    lockedTitle: { fontSize: 18, fontWeight: '900', color: C.textPrimary, marginTop: 12, marginBottom: 8 },
    lockedDesc: { fontSize: 13, color: C.textSecondary, textAlign: 'center', lineHeight: 18, marginBottom: 20 },
    lockedBtn: {
      backgroundColor: C.primary,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: 12,
      shadowColor: C.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8,
    },
    lockedBtnText: { color: '#FFF', fontSize: 14, fontWeight: '800' },
    analysisFailTitle: { fontSize: 20, fontWeight: '800', color: C.textPrimary, textAlign: 'center' },
    analysisFailBody: { fontSize: 14, color: C.textSecondary, lineHeight: 21, textAlign: 'center' },
    rescanButton: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: C.primary, paddingVertical: 14, paddingHorizontal: 24,
      borderRadius: 14, marginTop: 8,
    },
    rescanButtonText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
    analysisFailHint: { fontSize: 12, color: C.textTertiary, lineHeight: 18, textAlign: 'center', marginTop: 4 },
    analysisFailSecondary: { paddingVertical: 12 },
    analysisFailSecondaryText: { fontSize: 15, fontWeight: '600', color: C.primary },
    imageContainer: {
      width: '100%', height: 280,
      backgroundColor: C.bgSecondary, borderRadius: 20, overflow: 'hidden',
      marginBottom: 20, position: 'relative', borderWidth: 1, borderColor: C.border,
    },
    foodImage: { width: '100%', height: '100%' },
    boundingBox: { position: 'absolute', borderWidth: 2, borderColor: C.vitality, borderRadius: 8, overflow: 'visible' },
    maskImage: { width: '100%', height: '100%', opacity: 0.5 },
    badgeLabel: { position: 'absolute', top: -12, left: -2, backgroundColor: C.vitality, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
    badgeText: { color: '#FFF', fontSize: 10, fontWeight: '800' },
    sectionHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16, marginTop: 4, gap: 8 },
    systemicTitleColumn: { flex: 1, minWidth: 0 },
    /** Food name + icon; name wraps to full width without ellipsis */
    systemicNameRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginTop: 4,
      width: '100%',
      gap: 8,
    },
    systemicFoodNameWrap: {
      flex: 1,
      minWidth: 0,
      paddingRight: 4,
    },
    systemicNameInput: {
      minWidth: 0,
      minHeight: 22,
      textAlignVertical: 'top' as const,
    },
    systemicEditIcon: { paddingTop: 2, flexShrink: 0 },
    sectionTitle: { fontSize: 17, fontWeight: '700', color: C.textPrimary },
    focusText: { fontSize: 17, fontWeight: '700', textDecorationLine: 'none' },
    foodNameInput: { fontSize: 16, fontWeight: '700', borderBottomWidth: 1.5, borderBottomColor: C.primary, paddingVertical: 0, paddingHorizontal: 2, width: '100%' },
    // Vitality header
    vitalityHeader: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: C.surface, borderRadius: 20, padding: 20, marginBottom: 16,
      shadowColor: C.shadowColor, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3,
      borderWidth: 1, borderColor: C.border,
    },
    scoreLabel: { fontSize: 8, fontWeight: '800', color: C.textTertiary, letterSpacing: 0.8 },
    scoreTextMain: { fontSize: 28, fontWeight: '900', lineHeight: 32 },
    scoreScale: { fontSize: 10, fontWeight: '600', color: C.textTertiary },
    personalizedBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.primaryMuted, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, marginTop: 4, gap: 3 },
    personalizedText: { fontSize: 8, fontWeight: '800', color: C.primary },
    vitalitySummary: { flex: 1, marginLeft: 16 },
    summaryStatusText: { fontSize: 14, fontWeight: '600', color: C.textPrimary, lineHeight: 20, marginBottom: 6 },
    summaryText: { fontSize: 12, color: C.textSecondary, lineHeight: 18 },
    // Macros
    macroCard: {
      backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
      borderRadius: 20, padding: 18, marginBottom: 16,
      shadowColor: C.shadowColor, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8,
    },
    quantityRow: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      marginBottom: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: C.borderSubtle,
    },
    quantityLabel: { fontSize: 10, fontWeight: '800', color: C.textTertiary, letterSpacing: 0.8 },
    quantitySub: { fontSize: 9, color: C.textTertiary, fontWeight: '600', marginTop: 2 },
    counter: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.primaryMuted, borderRadius: 12, padding: 4 },
    counterButton: { width: 32, height: 32, borderRadius: 8, backgroundColor: C.surface, justifyContent: 'center', alignItems: 'center', shadowColor: C.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 },
    quantityValue: { paddingHorizontal: 14, fontSize: 15, fontWeight: '800', color: C.primary },
    macroRow: { flexDirection: 'row', justifyContent: 'space-between' },
    macroItem: { alignItems: 'center', flex: 1, gap: 3 },
    macroValue: { fontSize: 18, fontWeight: '900', color: C.textPrimary, letterSpacing: -0.5 },
    macroLabel: { fontSize: 10, fontWeight: '600', color: C.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8 },
    // Table
    card: {
      backgroundColor: C.surface, borderRadius: 16, padding: 16, marginBottom: 16,
      shadowColor: C.shadowColor, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
      borderWidth: 1, borderColor: C.border,
    },
    tableHeader: { flexDirection: 'row', paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.border },
    columnHeader: { fontSize: 12, fontWeight: '700', color: C.textPrimary },
    columnSubHeader: { fontSize: 9, fontWeight: '600', color: C.textTertiary, marginTop: 1 },
    tableRow: { flexDirection: 'row', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.borderSubtle },
    lastRow: { borderBottomWidth: 0, paddingBottom: 0 },
    pillarName: { fontSize: 13, fontWeight: '700', color: C.textPrimary },
    organName: { fontSize: 12, color: C.textSecondary, marginTop: 2 },
    scoreText: { fontSize: 13, fontWeight: '700' },
    descText: { fontSize: 13, color: C.textSecondary, lineHeight: 19 },
    descTitle: { fontWeight: '700', color: C.textPrimary },
    rebalanceCTA: {
      flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start',
      backgroundColor: C.primaryMuted, paddingHorizontal: 14, paddingVertical: 9,
      borderRadius: 99, marginTop: 10, gap: 6,
      borderWidth: 1, borderColor: C.primaryGlow,
    },
    rebalanceCTAActive: { backgroundColor: C.primary, borderColor: C.primary },
    rebalanceLabel: { fontSize: 12, fontWeight: '700', color: C.primary },
    rebalanceLabelActive: { color: '#FFF' },
    balancerCard: {
      backgroundColor: C.surfaceSubtle, borderRadius: 14, padding: 14, marginTop: 10,
      borderLeftWidth: 3, borderLeftColor: C.primary, gap: 10,
    },
    balancerHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    balancerIconBox: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
    balancerHeaderLabel: { fontSize: 9, fontWeight: '800', color: C.textTertiary, letterSpacing: 0.8 },
    balancerHeaderTitle: { fontSize: 13, fontWeight: '800', marginTop: 1 },
    balancerProtocolText: { fontSize: 13, color: C.textPrimary, lineHeight: 20, fontWeight: '500' },
    balancerActionRow: { flexDirection: 'row', gap: 8, marginTop: 2 },
    balancerActionChip: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: C.vitalityMuted, paddingHorizontal: 10, paddingVertical: 6,
      borderRadius: 99, gap: 5,
    },
    balancerActionText: { fontSize: 11, fontWeight: '700', color: C.vitality },
    // Applied balancer states
    rebalanceCTAApplied: {
      backgroundColor: C.scoreHigh + '15',
      borderWidth: 1,
      borderColor: C.scoreHigh + '40',
    },
    rebalanceLabelApplied: { color: C.scoreHigh },
    appliedBadge: {
      fontSize: 9, fontWeight: '800', color: C.scoreHigh,
      textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2,
    },
    scoreDeltaText: { fontSize: 10, fontWeight: '800', marginTop: 1 },
    macroDelta: {
      fontSize: 9, fontWeight: '800', color: C.scoreHigh,
      backgroundColor: C.scoreHigh + '18',
      paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4,
    },
    // Bio tab
    bioItemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, flexWrap: 'wrap', gap: 8 },
    bioItemName: { fontSize: 17, fontWeight: '800', color: C.primary, flexShrink: 1 },
    bioTypeBadge: { backgroundColor: C.primaryMuted, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
    bioTypeText: { fontSize: 10, fontWeight: '700', color: C.primary },
    bioDetailRow: { marginBottom: 6 },
    bioDetailLabel: { fontSize: 13, fontWeight: '700', color: C.textSecondary, marginBottom: 2 },
    bioDetailText: { fontSize: 14, color: C.textPrimary, marginBottom: 8 },
    bioSummaryBox: { marginTop: 8, backgroundColor: C.primaryMuted, padding: 12, borderRadius: 12, borderLeftWidth: 4, borderLeftColor: C.primary },
    bioSummaryText: { fontSize: 13, color: C.textPrimary, lineHeight: 18 },
    // Empty tab state
    emptyTabState: { paddingVertical: 32, alignItems: 'center', gap: 10 },
    emptyTabTitle: { fontSize: 17, fontWeight: '700', color: C.textPrimary },
    emptyTabText: { fontSize: 13, color: C.textSecondary, textAlign: 'center', lineHeight: 19 },
    // References
    refTitle: { fontSize: 14, fontWeight: '800', color: C.textPrimary, marginBottom: 16 },
    bulletRow: { flexDirection: 'row', marginBottom: 14, gap: 10 },
    bulletDot: { width: 6, height: 6, borderRadius: 3, marginTop: 6, flexShrink: 0 },
    refBold: { fontSize: 14, fontWeight: '700', color: C.textPrimary, lineHeight: 21 },
    refDesc: { fontSize: 12, color: C.textSecondary, marginTop: 2, lineHeight: 17 },
    // Alerts tab
    alertRow: {
      flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 14,
      borderBottomWidth: 1, borderBottomColor: C.borderSubtle, gap: 12,
    },
    alertIconBox: {
      width: 30, height: 30, borderRadius: 9, backgroundColor: C.dangerMuted,
      justifyContent: 'center', alignItems: 'center', flexShrink: 0, marginTop: 1,
    },
    alertType: { fontSize: 13, fontWeight: '700', color: C.danger, marginBottom: 3 },
    alertDesc: { fontSize: 13, color: C.textSecondary, lineHeight: 19 },
    // Glucose tab
    glucoseStatRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
    glucoseStatCard: {
      flex: 1, backgroundColor: C.surface, borderRadius: 14, padding: 12,
      borderWidth: 1, borderColor: C.border, gap: 4,
      shadowColor: C.shadowColor, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6,
    },
    glucoseStatValue: { fontSize: 20, fontWeight: '900', lineHeight: 24 },
    glucoseStatLabel: { fontSize: 9, color: C.textTertiary, fontWeight: '600', lineHeight: 12 },
    glucoseChartCard: {
      backgroundColor: C.surface, borderRadius: 16, padding: 16, marginBottom: 12,
      borderWidth: 1, borderColor: C.border,
      shadowColor: C.shadowColor, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8,
    },
    glucoseLegend: { flexDirection: 'row', gap: 12, marginBottom: 12, flexWrap: 'nowrap', alignItems: 'center' },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    legendLine: { width: 16, height: 2.5, borderRadius: 2 },
    legendDash: { width: 16, height: 0, borderTopWidth: 1.5, borderStyle: 'dashed' },
    legendDashVisible: { flexDirection: 'row', alignItems: 'center', width: 16 },
    legendDashSeg: { width: 4, height: 2, borderRadius: 1 },
    legendDashGap: { width: 2 },
    legendText: { fontSize: 9.5, color: C.textSecondary, fontWeight: '500' },
    glucoseInterpretBox: { marginTop: 10, borderLeftWidth: 3, paddingLeft: 10, paddingVertical: 6 },
    glucoseInterpretText: { fontSize: 12, fontWeight: '600', lineHeight: 18 },
    glucoseDisclaimer: { fontSize: 10, color: C.textTertiary, marginTop: 8, lineHeight: 14, fontStyle: 'italic' },
    glucoseTimeline: { marginTop: 14, gap: 10 },
    glucoseTimelineRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    glucoseTimeMin: { fontSize: 11, fontWeight: '700', color: C.textTertiary, width: 30, textAlign: 'right', marginTop: 1 },
    glucoseTimeDot: { width: 9, height: 9, borderRadius: 4.5, marginTop: 3, flexShrink: 0 },
    glucoseTimeLabel: { fontSize: 12, color: C.textSecondary, lineHeight: 18, flex: 1 },
    glucoseWarning: {
      backgroundColor: C.energyMuted, borderRadius: 12, padding: 14,
      marginBottom: 10, borderWidth: 1, borderColor: C.energy + '40',
    },
    glucoseWarningText: { fontSize: 13, color: C.energy, fontWeight: '600', lineHeight: 19 },
    mitigationBox: { backgroundColor: C.bgSecondary, padding: 16, borderRadius: 16, marginTop: 12, borderLeftWidth: 4, borderLeftColor: C.primary },
    mitigationHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    mitigationTitle: { fontSize: 13, fontWeight: '800', color: C.primary, letterSpacing: 0.5, textTransform: 'uppercase' },
    mitigationText: { fontSize: 13, color: C.textSecondary, lineHeight: 19 },
    // Bottom tab bar
    bottomTabBar: {
      flexDirection: 'row',
      backgroundColor: C.tabBarBg,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: C.tabBarBorder,
      position: 'absolute',
      bottom: 0, left: 0, right: 0,
      shadowColor: C.shadowColor,
      shadowOffset: { width: 0, height: -4 },
      shadowOpacity: 0.06,
      shadowRadius: 10,
      elevation: 20,
    },
    bottomTabItem: { alignItems: 'center', justifyContent: 'center', flex: 1 },
    tabIconWrapper: { width: 36, height: 28, justifyContent: 'center', alignItems: 'center', borderRadius: 8 },
    tabIconWrapperActive: { backgroundColor: C.primaryMuted },
    bottomTabLabel: { fontSize: 10, fontWeight: '600', color: C.tabInactive, marginTop: 3 },

    // Share modal
    shareOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
    shareSheet: {
      backgroundColor: C.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28,
      paddingHorizontal: 20, paddingBottom: Platform.OS === 'ios' ? 36 : 24, paddingTop: 12,
    },
    shareSheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.border, alignSelf: 'center', marginBottom: 16 },
    shareSheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    shareSheetTitle: { fontSize: 18, fontWeight: '800', color: C.textPrimary },
    shareCloseBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.bgSecondary, justifyContent: 'center', alignItems: 'center' },

    // Share card
    shareCardWrapper: { borderRadius: 20, overflow: 'hidden', marginBottom: 16 },
    shareCard: { backgroundColor: C.surface, borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: C.border },
    shareCardHeader: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 8, backgroundColor: C.bg, borderBottomWidth: 1, borderBottomColor: C.border },
    shareCardLogo: { width: 22, height: 22, borderRadius: 6 },
    shareCardBrand: { fontSize: 14, fontWeight: '900', color: C.primary },
    shareCardTagline: { fontSize: 10, color: C.textTertiary, fontWeight: '600', marginLeft: 'auto' as any },
    shareCardHero: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 14 },
    shareCardImage: { width: 90, height: 90, borderRadius: 14 },
    shareCardScoreBox: { flex: 1, alignItems: 'center' },
    shareCardFoodName: { fontSize: 16, fontWeight: '800', color: C.textPrimary, paddingHorizontal: 14, marginBottom: 12 },
    shareCardMacros: { flexDirection: 'row', backgroundColor: C.bgSecondary, paddingVertical: 10, paddingHorizontal: 14, gap: 0 },
    shareCardMacroItem: { flex: 1, alignItems: 'center' },
    shareCardMacroValue: { fontSize: 14, fontWeight: '800', color: C.textPrimary },
    shareCardMacroLabel: { fontSize: 9, color: C.textTertiary, fontWeight: '600', marginTop: 2 },
    shareCardOrgans: { flexDirection: 'row', flexWrap: 'wrap', padding: 12, gap: 8 },
    shareCardOrganItem: { alignItems: 'center', width: '30%' as any, backgroundColor: C.bgSecondary, borderRadius: 10, paddingVertical: 8 },
    shareCardOrganScore: { fontSize: 16, fontWeight: '900' },
    shareCardOrganName: { fontSize: 9, color: C.textTertiary, fontWeight: '600', marginTop: 2 },
    shareCardGlucose: { borderTopWidth: 1, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10 },
    shareCardGlucoseStats: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
    shareCardGlucoseStat: { alignItems: 'center' },
    shareCardGlucoseVal: { fontSize: 13, fontWeight: '800' },
    shareCardGlucoseLbl: { fontSize: 9, color: C.textTertiary, fontWeight: '600', marginTop: 1 },
    shareCardInterpret: { borderLeftWidth: 3, paddingLeft: 8, paddingVertical: 4 },
    shareCardInterpretText: { fontSize: 10, fontWeight: '600', lineHeight: 15 },
    shareCardFooter: {
      padding: 16, borderTopWidth: 1, borderTopColor: C.border,
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      backgroundColor: C.bgSecondary,
    },
    shareCardFooterLeft: { flex: 1 },
    shareCardFooterBrand: { fontSize: 14, fontWeight: '900', color: C.primary, marginBottom: 2 },
    shareCardFooterTag: { fontSize: 9, color: C.textTertiary, fontWeight: '700', textTransform: 'uppercase', marginBottom: 8 },
    shareCardBadge: { fontSize: 11, fontWeight: '700', color: C.primary, marginTop: 4 },
    shareCardQR: { alignItems: 'center', gap: 4 },
    shareCardQRInner: {
      width: 44, height: 44, borderRadius: 10, backgroundColor: '#FFF',
      justifyContent: 'center', alignItems: 'center',
      borderWidth: 1, borderColor: C.border,
    },
    shareCardQRText: { fontSize: 7, fontWeight: '800', color: C.textTertiary },

    // Share actions
    shareActionBtn: {
      backgroundColor: C.primary, borderRadius: 14, paddingVertical: 16,
      flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, marginBottom: 10,
      shadowColor: C.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10,
    },
    shareActionText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
    shareTextBtn: { alignItems: 'center', paddingVertical: 12 },
    shareTextBtnLabel: { fontSize: 14, color: C.textSecondary, fontWeight: '600' },
    personalizeCTA: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 14,
      marginBottom: 6,
      gap: 6,
      paddingVertical: 10,
      backgroundColor: C.primaryMuted,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: C.primary + '30',
    },
    personalizeCTAText: {
      fontSize: 13,
      fontWeight: '700',
      color: C.primary,
    },
  });
}
