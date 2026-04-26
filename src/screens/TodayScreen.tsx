import React, { useState, useMemo, useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  RefreshControl,
  Share,
  Image,
  Modal,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  TrendUpIcon as TrendUp,
  LightningIcon as Lightning,
  ShareNetworkIcon as ShareNetwork,
  ClockCounterClockwiseIcon as HistoryIcon,
  CameraIcon as Camera,
  SparkleIcon as Sparkle,
  XIcon as XIcon,
} from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import * as SecureStore from 'expo-secure-store';
import {
  Svg,
  Path,
  Defs,
  LinearGradient as SvgGradient,
  Stop,
  Circle as SvgCircle,
  Line as SvgLine,
  Text as SvgText,
  Rect as SvgRect,
  ClipPath,
  G,
} from 'react-native-svg';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { getFoodLogs, FoodLog } from '../utils/history';
import { sumMacroTotalsFromLogs } from '../utils/macroTotals';
import { getDailyGoals, DailyGoals } from '../utils/goals';
import { loadUserProfile } from '../utils/userProfile';
import { useColors, AppColors } from '../theme';
import { ScreenEnterAnimation } from '../components/ScreenEnterAnimation';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Glucose / Insulin simulation (matches ResultsScreen formula exactly) ────

const INSULIN_BASELINE = 5;

function parseFastingGlucose(conditions: string[], healthContext: string): number {
  let fasting = 90;
  const ctx = (healthContext || '').toLowerCase();
  if (conditions.some(c => c.toLowerCase().includes('prediabetes'))) fasting = 105;
  if (conditions.some(c => c.toLowerCase().includes('diabetes'))) fasting = 125;
  if (ctx.includes('fasting glucose is higher') || ctx.includes('elevated blood sugar')) fasting = 110;
  return fasting;
}

function getConditionGlucoseMult(conditions: string[], healthContext: string): number {
  let mult = 1.0;
  const ctx = (healthContext || '').toLowerCase();
  if (conditions.some(c => c.toLowerCase().includes('diabetes'))) mult *= 1.45;
  else if (conditions.some(c => c.toLowerCase().includes('prediabetes'))) mult *= 1.25;
  if (conditions.some(c => c.toLowerCase().includes('pcos'))) mult *= 1.15;
  if (ctx.includes('insulin resistance')) mult *= 1.2;
  return mult;
}

function computeSim(carbs: number, fats: number, protein: number, conditionMult: number = 1.0) {
  const fatMod = Math.max(0.55, 1 - fats * 0.007);
  const protMod = Math.max(0.82, 1 - protein * 0.003);
  const excursion = Math.round(carbs * 1.35 * fatMod * protMod * conditionMult);
  const peakTimeMin = Math.round(45 + fats * 0.55 + protein * 0.25);
  const peakInsulin = Math.round(excursion * 0.26);
  const insulinPeakMin = peakTimeMin + 18;
  const recoveryMin = peakTimeMin + Math.max(55, Math.round(excursion * 1.75));
  const totalMin = Math.min(Math.round(recoveryMin * 1.25), 360);
  return { excursion, peakTimeMin, peakInsulin, insulinPeakMin, recoveryMin, totalMin };
}

function glucoseContrib(t: number, excursion: number, peakTimeMin: number, recoveryMin: number, totalMin: number): number {
  if (t < 0 || t > totalMin || excursion <= 0 || peakTimeMin <= 0) return 0;
  if (t <= peakTimeMin) {
    const p = t / peakTimeMin;
    return excursion * (1 - Math.exp(-3.2 * p)) / (1 - Math.exp(-3.2));
  }
  const hl = (recoveryMin - peakTimeMin) * 0.55;
  if (hl <= 0) return 0;
  return excursion * Math.exp(-((t - peakTimeMin) / hl));
}

function insulinContrib(t: number, peakInsulin: number, insulinPeakMin: number, recoveryMin: number, totalMin: number): number {
  if (t < 0 || t > totalMin || peakInsulin <= 0 || insulinPeakMin <= 0) return 0;
  if (t <= insulinPeakMin) {
    return peakInsulin * (1 - Math.exp(-3.5 * (t / insulinPeakMin))) / (1 - Math.exp(-3.5));
  }
  const decay = (recoveryMin - insulinPeakMin) * 0.45;
  if (decay <= 0) return 0;
  return peakInsulin * Math.exp(-((t - insulinPeakMin) / decay));
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface MealEvent {
  log: FoodLog;
  startMin: number;
  excursion: number;
  peakTimeMin: number;
  peakInsulin: number;
  insulinPeakMin: number;
  recoveryMin: number;
  totalMin: number;
  peakGlucose: number;
}

interface TimePoint {
  t: number;
  glucose: number;
  insulin: number;
}

// ─── Timeline builder ─────────────────────────────────────────────────────────

const STEP = 3;

function buildTimeline(meals: MealEvent[], startMin: number, endMin: number, fastingBaseline: number): TimePoint[] {
  const pts: TimePoint[] = [];
  for (let t = startMin; t <= endMin; t += STEP) {
    let gExcursion = 0;
    let ins = INSULIN_BASELINE;
    for (const m of meals) {
      const rel = t - m.startMin;
      gExcursion += glucoseContrib(rel, m.excursion, m.peakTimeMin, m.recoveryMin, m.totalMin);
      ins += insulinContrib(rel, m.peakInsulin, m.insulinPeakMin, m.recoveryMin, m.totalMin);
    }
    pts.push({ t, glucose: Math.round(fastingBaseline + gExcursion), insulin: Math.min(Math.round(ins), 80) });
  }
  return pts;
}

// ─── Chart layout constants ───────────────────────────────────────────────────

const CHART_H = 280;
const CHART_W = SCREEN_WIDTH - 48;
const PAD_T = 20;
const PAD_B = 100;
const PAD_L = 44;
const PAD_R = 38;
const IW = CHART_W - PAD_L - PAD_R;
const IH = CHART_H - PAD_T - PAD_B;

const G_MIN = 65;
const INS_MAX = 70;

function xS(t: number, start: number, end: number) {
  return PAD_L + ((t - start) / (end - start)) * IW;
}


// ─── Formatting helpers ───────────────────────────────────────────────────────

function fmtHour(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const sfx = h >= 12 ? 'pm' : 'am';
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${h12}${sfx}`;
}

function fmtTime(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  const sfx = h >= 12 ? 'pm' : 'am';
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${h12}:${String(m).padStart(2, '0')}${sfx}`;
}

function minFromMidnight(dateStr: string): number {
  const d = new Date(dateStr);
  return d.getHours() * 60 + d.getMinutes();
}

// ─── Insight generator ────────────────────────────────────────────────────────

function generateInsights(meals: MealEvent[], pts: TimePoint[]): string[] {
  if (meals.length === 0) {
    return ['Scan your first meal today to see how your glucose and insulin respond throughout the day.'];
  }
  const insights: string[] = [];

  const peakPt = pts.reduce((m, p) => (p.glucose > m.glucose ? p : m), pts[0]);
  const peakAtStr = fmtTime(peakPt.t);

  if (peakPt.glucose > 180) {
    insights.push(`Severe spike to ${peakPt.glucose} mg/dL around ${peakAtStr}. High insulin demand — try smaller portions or a 10-min post-meal walk.`);
  } else if (peakPt.glucose > 140) {
    insights.push(`Daily peak reached ${peakPt.glucose} mg/dL around ${peakAtStr}, crossing the prediabetic threshold. A brisk walk after meals can blunt these spikes.`);
  } else {
    insights.push(`Excellent control — daily glucose peak was ${peakPt.glucose} mg/dL around ${peakAtStr}, staying within healthy range all day.`);
  }

  const minAbove140 = pts.filter(p => p.glucose > 140).length * STEP;
  if (minAbove140 >= 20) {
    const h = Math.floor(minAbove140 / 60);
    const m = minAbove140 % 60;
    const str = h > 0 ? `${h}h ${m}m` : `${m}min`;
    insights.push(`Glucose stayed above 140 mg/dL for ${str}. Sustained highs ask a lot of your pancreas and can nudge insulin resistance over time.`);
  }

  for (let i = 0; i < meals.length - 1; i++) {
    const a = meals[i];
    const b = meals[i + 1];
    if (b.startMin < a.startMin + a.recoveryMin) {
      const na = a.log.food_name.split(' ').slice(0, 2).join(' ');
      const nb = b.log.food_name.split(' ').slice(0, 2).join(' ');
      insights.push(`${na} and ${nb} overlapped — glucose didn't fully recover before your next meal, keeping your baseline elevated longer than normal.`);
      break;
    }
  }

  const insulinLoad = pts.reduce((s, p) => s + Math.max(0, p.insulin - INSULIN_BASELINE), 0) * STEP;
  if (insulinLoad > 2500 && insights.length < 3) {
    insights.push(`High cumulative insulin load today. Try spacing meals 3–4 hours apart to give your pancreas recovery time.`);
  }

  return insights.slice(0, 3);
}

// ─── Main screen ──────────────────────────────────────────────────────────────

type Props = { navigation: NativeStackNavigationProp<any> };

export default function TodayScreen({ navigation }: Props) {
  const C = useColors();
  const styles = useMemo(() => makeStyles(C), [C]);

  const [logs, setLogs] = useState<FoodLog[]>([]);
  const [goals, setGoals] = useState<DailyGoals>({ calories: 2000, protein: 150, carbs: 250, fats: 65 });
  const [isPro, setIsPro] = useState(false);
  const [userConditions, setUserConditions] = useState<string[]>([]);
  const [userHealthContext, setUserHealthContext] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const shareCardRef = useRef<any>(null);

  const load = useCallback(async () => {
    const [all, g, storedIsPro, storedConditions, storedBio, trialStatus] = await Promise.all([
      getFoodLogs(),
      getDailyGoals(),
      SecureStore.getItemAsync('isPro'),
      SecureStore.getItemAsync('medicalConditions'),
      SecureStore.getItemAsync('healthContext'),
      import('../utils/trialStatus').then(m => m.isTrialActive()),
    ]);
    
    setIsPro(storedIsPro === 'true' || trialStatus);
    if (storedConditions) {
      try {
        const parsed = JSON.parse(storedConditions);
        if (Array.isArray(parsed)) setUserConditions(parsed);
      } catch (e) { console.error('TodayScreen: Conditions parse error', e); }
    }
    setUserHealthContext(storedBio || '');

    void loadUserProfile(); // Background sync of Pro status & profile
    setGoals(g);
    const now = new Date();
    const today = all
      .filter(l => {
        const d = new Date(l.created_at);
        return d.getFullYear() === now.getFullYear() &&
          d.getMonth() === now.getMonth() &&
          d.getDate() === now.getDate();
      })
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    setLogs(today);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(() => { setRefreshing(true); load(); }, [load]);

  const todayMacroTotals = useMemo(() => sumMacroTotalsFromLogs(logs), [logs]);



  const fastingBaseline = useMemo(() => isPro ? parseFastingGlucose(userConditions, userHealthContext) : 90, [isPro, userConditions, userHealthContext]);
  const conditionMult = useMemo(() => isPro ? getConditionGlucoseMult(userConditions, userHealthContext) : 1.0, [isPro, userConditions, userHealthContext]);

  const meals = useMemo<MealEvent[]>(() => (
    logs
      .filter(l => l.macros?.carbs != null)
      .map(l => {
        const carbs = parseFloat(l.macros?.carbs ?? '0') || 0;
        const fats = parseFloat(l.macros?.fats ?? '0') || 0;
        const protein = parseFloat(l.macros?.protein ?? '0') || 0;
        const s = computeSim(carbs, fats, protein, conditionMult);
        return { log: l, startMin: minFromMidnight(l.created_at), peakGlucose: fastingBaseline + s.excursion, ...s };
      })
  ), [logs, conditionMult, fastingBaseline]);

  const { chartStart, chartEnd } = useMemo(() => {
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    if (meals.length === 0) {
      return { chartStart: 420, chartEnd: Math.max(nowMin + 60, 1260) };
    }
    const first = Math.max(0, meals[0].startMin - 30);
    const last = meals[meals.length - 1].startMin + meals[meals.length - 1].totalMin + 30;
    return { chartStart: first, chartEnd: Math.min(1440, last) };
  }, [meals]);

  const pts = useMemo(() => buildTimeline(meals, chartStart, chartEnd, fastingBaseline), [meals, chartStart, chartEnd, fastingBaseline]);

  const insights = useMemo(() => generateInsights(meals, pts), [meals, pts]);

  const stats = useMemo(() => {
    if (pts.length === 0) return { peakGlucose: fastingBaseline, minAbove140: 0, maxInsulin: INSULIN_BASELINE };
    return {
      peakGlucose: Math.max(...pts.map(p => p.glucose)),
      minAbove140: pts.filter(p => p.glucose > 140).length * STEP,
      maxInsulin: Math.max(...pts.map(p => p.insulin)),
    };
  }, [pts, fastingBaseline]);

  // Dynamic Y Scaling
  const G_MAX = useMemo(() => Math.max(240, stats.peakGlucose + 20), [stats.peakGlucose]);
  const yG = useCallback((mg: number) => {
    return PAD_T + (1 - (mg - G_MIN) / (G_MAX - G_MIN)) * IH;
  }, [G_MAX]);
  const yI = useCallback((u: number) => {
    return PAD_T + (1 - Math.min(u, INS_MAX) / INS_MAX) * IH;
  }, []);

  // SVG path strings
  const { glucoseLine, glucoseFill, shareLine, shareFill, insulinLine } = useMemo(() => {
    if (pts.length < 2) return { glucoseLine: '', glucoseFill: '', shareLine: '', shareFill: '', insulinLine: '' };
    const gPts = pts.map(p => `${xS(p.t, chartStart, chartEnd).toFixed(1)},${yG(p.glucose).toFixed(1)}`);
    const iPts = pts.map(p => `${xS(p.t, chartStart, chartEnd).toFixed(1)},${yI(p.insulin).toFixed(1)}`);
    const bottom = (PAD_T + IH).toFixed(1);
    const lx = xS(pts[0].t, chartStart, chartEnd).toFixed(1);
    const rx = xS(pts[pts.length - 1].t, chartStart, chartEnd).toFixed(1);

    // Paths for Share Card (h=120)
    const yS = (mg: number) => 15 + (1 - (mg - G_MIN) / (G_MAX - G_MIN)) * 80;
    const sGPts = pts.map(p => `${xS(p.t, chartStart, chartEnd).toFixed(1)},${yS(p.glucose).toFixed(1)}`);
    const sBottom = 110;

    return {
      glucoseLine: `M${gPts.join(' L')}`,
      glucoseFill: `M${lx},${bottom} L${gPts.join(' L')} L${rx},${bottom} Z`,
      shareLine: `M${sGPts.join(' L')}`,
      shareFill: `M${lx},${sBottom} L${sGPts.join(' L')} L${rx},${sBottom} Z`,
      insulinLine: `M${iPts.join(' L')}`,
    };
  }, [pts, chartStart, chartEnd, yG, yI, G_MAX]);

  // X-axis hour ticks (every 2h)
  const xTicks = useMemo(() => {
    const ticks: number[] = [];
    for (let h = Math.ceil(chartStart / 60); h <= Math.floor(chartEnd / 60); h += 2) {
      const t = h * 60;
      if (t >= chartStart && t <= chartEnd) ticks.push(t);
    }
    return ticks;
  }, [chartStart, chartEnd]);

  const peakColor = stats.peakGlucose > 180 ? C.danger : stats.peakGlucose > 140 ? C.energy : C.vitality;
  const elevatedColor = stats.minAbove140 > 60 ? C.danger : stats.minAbove140 > 0 ? C.energy : C.vitality;
  const elevatedStr = stats.minAbove140 >= 60
    ? `${Math.floor(stats.minAbove140 / 60)}h ${stats.minAbove140 % 60}m`
    : stats.minAbove140 > 0 ? `${stats.minAbove140}min` : '0';

  const handleShare = () => {
    setShareModalVisible(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const handleShareCapture = async () => {
    try {
      if (!shareCardRef.current) return;
      const uri = await shareCardRef.current.capture();
      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share your daily log' });
      } else {
        const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
        await Share.share({ message: `My metabolic summary for ${dateStr} on Nouriva AI.` });
      }
    } catch (error) {
      console.error('Share failed:', error);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]} edges={['top']}>
        <ActivityIndicator color={C.primary} size="large" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ScreenEnterAnimation>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerSide}>
            <Image source={require('../../assets/logo.png')} style={styles.logo} resizeMode="contain" />
          </View>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Daily Glucose Timeline</Text>
            {isPro && (fastingBaseline !== 90 || conditionMult !== 1.0) && (
              <View style={styles.proBadge}>
                <Sparkle size={10} color="#FFF" weight="fill" />
                <Text style={styles.proBadgeText}>Personalized</Text>
              </View>
            )}
          </View>
          <TouchableOpacity style={styles.headerRightBtn} onPress={handleShare}>
            <ShareNetwork size={18} color={C.textPrimary} weight="bold" />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
        >
          <Text style={styles.dateLabel}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </Text>

          {/* Summary stats */}
          <View style={[styles.statsRow, { marginTop: 10 }]}>
            <View style={[styles.statCard, { borderTopColor: peakColor }]}>
              <Text style={[styles.statValue, { color: peakColor }]}>{stats.peakGlucose}</Text>
              <Text style={styles.statUnit}>mg/dL</Text>
              <Text style={styles.statLabel}>Peak Glucose</Text>
            </View>
            <View style={[styles.statCard, { borderTopColor: elevatedColor }]}>
              <Text style={[styles.statValue, { color: elevatedColor }]}>{elevatedStr}</Text>
              <Text style={styles.statUnit}>above 140</Text>
              <Text style={styles.statLabel}>Elevated Time</Text>
            </View>
            <View style={[styles.statCard, { borderTopColor: C.primary }]}>
              <Text style={[styles.statValue, { color: C.primary }]}>{stats.maxInsulin}</Text>
              <Text style={styles.statUnit}>µU/mL</Text>
              <Text style={styles.statLabel}>Peak Insulin</Text>
            </View>
          </View>

          {/* Chart */}
          <View style={styles.chartCard}>
            <View style={styles.legendRow}>
              <View style={styles.legendItem}>
                <View style={[styles.legendSolid, { backgroundColor: C.energy }]} />
                <Text style={styles.legendText}>Blood glucose (mg/dL)</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDash, { borderColor: C.primary }]} />
                <Text style={styles.legendText}>Insulin (µU/mL)</Text>
              </View>
            </View>
            <Svg width={CHART_W} height={CHART_H}>
                <Defs>
                  <SvgGradient id="gFill" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor={C.danger} stopOpacity="0.55" />
                    <Stop offset="0.30" stopColor={C.energy} stopOpacity="0.45" />
                    <Stop offset="0.52" stopColor="#FCD34D" stopOpacity="0.35" />
                    <Stop offset="0.72" stopColor={C.vitality} stopOpacity="0.25" />
                    <Stop offset="1" stopColor={C.vitality} stopOpacity="0.04" />
                  </SvgGradient>
                  <ClipPath id="chartClip">
                    <SvgRect x={PAD_L} y={PAD_T} width={IW} height={IH} />
                  </ClipPath>
                </Defs>

                {/* Danger zone band (>140 mg/dL) */}
                <SvgRect
                  x={PAD_L} y={PAD_T}
                  width={IW} height={Math.max(0, yG(140) - PAD_T)}
                  fill={C.danger} opacity={0.05}
                />

                {/* Threshold lines */}
                {([
                  { v: 140, label: '140', col: C.danger },
                  { v: 120, label: '120', col: C.energy },
                  { v: fastingBaseline, label: String(fastingBaseline), col: C.vitality },
                ] as const).map(({ v, label, col }) => {
                  const y = yG(v);
                  if (y < PAD_T || y > PAD_T + IH) return null;
                  return (
                    <G key={v}>
                      <SvgLine x1={PAD_L} y1={y} x2={PAD_L + IW} y2={y}
                        stroke={col} strokeWidth={0.5} strokeDasharray="4,4" opacity={0.5} />
                      <SvgText x={PAD_L - 3} y={y + 3.5} fontSize={8} fill={col} textAnchor="end" opacity={0.8}>
                        {label}
                      </SvgText>
                    </G>
                  );
                })}

                {/* Right Y-axis: insulin labels */}
                {([15, 35, 55] as const).map(u => {
                  const y = yI(u);
                  if (y < PAD_T || y > PAD_T + IH) return null;
                  return (
                    <SvgText key={u} x={PAD_L + IW + 3} y={y + 3.5} fontSize={8}
                      fill={C.primary} textAnchor="start" opacity={0.65}>
                      {u}
                    </SvgText>
                  );
                })}

                {/* Meal event vertical markers */}
                {meals.map((m, i) => {
                  const x = xS(m.startMin, chartStart, chartEnd);
                  return (
                    <G key={i}>
                      <SvgLine x1={x} y1={PAD_T} x2={x} y2={PAD_T + IH}
                        stroke={C.textTertiary} strokeWidth={1} strokeDasharray="3,4" opacity={0.5} />
                      <SvgCircle cx={x} cy={PAD_T - 4} r={3} fill={C.textTertiary} opacity={0.5} />
                    </G>
                  );
                })}

                {/* Glucose filled area */}
                <G clipPath="url(#chartClip)">
                  <Path d={glucoseFill} fill="url(#gFill)" />
                </G>

                {/* Insulin dashed curve */}
                <G clipPath="url(#chartClip)">
                  <Path d={insulinLine} fill="none" stroke={C.primary}
                    strokeWidth={1.5} strokeDasharray="5,3"
                    strokeLinejoin="round" strokeLinecap="round" opacity={0.8} />
                </G>

                {/* Glucose line */}
                <G clipPath="url(#chartClip)">
                  <Path d={glucoseLine} fill="none" stroke={C.energy}
                    strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
                </G>

                {/* Meal peak dots on glucose line */}
                {meals.map((m, i) => {
                  const peakAbsMin = m.startMin + m.peakTimeMin;
                  const nearestPt = pts.reduce((best, p) =>
                    Math.abs(p.t - peakAbsMin) < Math.abs(best.t - peakAbsMin) ? p : best, pts[0]);
                  const px = xS(nearestPt.t, chartStart, chartEnd);
                  const py = yG(nearestPt.glucose);
                  const dc = m.peakGlucose > 180 ? C.danger : m.peakGlucose > 140 ? C.energy : C.vitality;
                  return (
                    <SvgCircle key={i} cx={px} cy={py} r={4.5}
                      fill={dc} stroke={C.surface} strokeWidth={1.5} />
                  );
                })}

                {/* X-axis ticks and hour labels */}
                {xTicks.map(t => {
                  const x = xS(t, chartStart, chartEnd);
                  return (
                    <G key={t}>
                      <SvgLine x1={x} y1={PAD_T + IH} x2={x} y2={PAD_T + IH + 4}
                        stroke={C.textTertiary} strokeWidth={1} opacity={0.5} />
                      <SvgText x={x} y={PAD_T + IH + 16} fontSize={9}
                        fill={C.textTertiary} textAnchor="middle">
                        {fmtHour(t)}
                      </SvgText>
                    </G>
                  );
                })}

                {/* Collision-Aware Multi-Tier Meal Labels */}
                {(() => {
                  const tiers: number[] = []; // Tracks the last X position for each tier level
                  return meals.map((m, i) => {
                    const x = xS(m.startMin, chartStart, chartEnd);
                    const name = m.log.food_name.length > 10 ? m.log.food_name.slice(0, 9) + '…' : m.log.food_name;
                    
                    // Find first tier that doesn't collide (min 45px distance)
                    let tier = 0;
                    while (tiers[tier] != null && x - tiers[tier] < 45) {
                      tier++;
                    }
                    tiers[tier] = x;
                    
                    // Cap at 6 tiers for safety
                    const tierIdx = Math.min(tier, 5);
                    const yOffset = 30 + (tierIdx * 12);

                    return (
                      <SvgText key={i} x={x} y={PAD_T + IH + yOffset} fontSize={8}
                        fill={C.textSecondary} textAnchor="middle" fontWeight="600" opacity={0.85}>
                        {name}
                      </SvgText>
                    );
                  });
                })()}

                {/* Chart border */}
                <SvgLine x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={PAD_T + IH}
                  stroke={C.border} strokeWidth={1} />
                <SvgLine x1={PAD_L} y1={PAD_T + IH} x2={PAD_L + IW} y2={PAD_T + IH}
                  stroke={C.border} strokeWidth={1} />
              </Svg>

            <View style={styles.axisRow}>
              <Text style={[styles.axisLabel, { color: C.energy }]}>← Glucose (mg/dL)</Text>
              <Text style={[styles.axisLabel, { color: C.primary }]}>Insulin (µU/mL) →</Text>
            </View>
          </View>

          {/* Elevated insight banner */}
          {stats.minAbove140 > 0 && (
            <View style={[styles.elevatedBanner, { borderLeftColor: elevatedColor, backgroundColor: C.dangerMuted }]}>
              <Lightning size={13} weight="fill" color={elevatedColor} />
              <Text style={[styles.elevatedText, { color: elevatedColor }]}>
                Glucose was above prediabetic threshold (140 mg/dL) for {elevatedStr} today
              </Text>
            </View>
          )}

          {/* Insights */}
          <View style={styles.insightsCard}>
            <View style={styles.insightsHeader}>
              <TrendUp size={14} weight="bold" color={C.primary} />
              <Text style={styles.insightsTitle}>Daily Insights</Text>
            </View>
            {insights.map((txt, i) => (
              <View key={i} style={styles.insightRow}>
                <View style={[styles.insightDot, {
                  backgroundColor: i === 0 && stats.peakGlucose > 140 ? C.danger
                    : i === 1 ? C.energy : C.primary,
                }]} />
                <Text style={styles.insightText}>{txt}</Text>
              </View>
            ))}
          </View>

          {/* Meal list */}
          {logs.length > 0 ? (
            <>
              <Text style={styles.sectionTitle}>Today's Meals</Text>
              {meals.map((m, i) => {
                const dc = m.peakGlucose > 180 ? C.danger : m.peakGlucose > 140 ? C.energy : C.vitality;
                const insulinPeakAbs = m.startMin + m.insulinPeakMin;
                return (
                  <View key={i} style={styles.mealRow}>
                    <View style={[styles.mealDot, { backgroundColor: dc }]} />
                    <View style={styles.mealInfo}>
                      <Text style={styles.mealName} numberOfLines={1}>{m.log.food_name}</Text>
                      <Text style={styles.mealMeta}>
                        Scanned {fmtTime(m.startMin)} · Glucose peak ~{fmtTime(m.startMin + m.peakTimeMin)} · Insulin peak ~{fmtTime(insulinPeakAbs)}
                      </Text>
                    </View>
                    <View style={styles.mealRight}>
                      <Text style={[styles.mealPeak, { color: dc }]}>{m.peakGlucose}</Text>
                      <Text style={styles.mealPeakUnit}>mg/dL</Text>
                      <Text style={styles.mealRecovery}>~{m.recoveryMin}min</Text>
                    </View>
                  </View>
                );
              })}
            </>
          ) : (
            <View style={styles.emptyDay}>
              <View style={styles.emptyDayIcon}>
                <HistoryIcon size={28} weight="bold" color={C.textTertiary} />
              </View>
              <Text style={styles.emptyDayText}>No meals logged for today</Text>
              <Text style={styles.emptyDaySub}>Scan your first meal to start tracking</Text>
              <TouchableOpacity 
                style={styles.emptyLogBtn} 
                onPress={() => {
                  Haptics.selectionAsync();
                  navigation.navigate('Scan', { openCamera: true });
                }}
              >
                <Camera size={18} color="#FFF" weight="bold" />
                <Text style={styles.emptyLogBtnText}>Log Food</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={{ height: 48 }} />
        </ScrollView>
      </ScreenEnterAnimation>

      {/* Share Modal */}
      <Modal visible={shareModalVisible} transparent animationType="slide" onRequestClose={() => setShareModalVisible(false)}>
        <View style={styles.shareOverlay}>
          <View style={styles.shareSheet}>
            <View style={styles.shareSheetHandle} />
            <View style={styles.shareSheetHeader}>
              <Text style={styles.shareSheetTitle}>Share Daily Summary</Text>
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
                    {isPro && (
                      <View style={{ backgroundColor: C.primary, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                        <Text style={{ fontSize: 8, fontWeight: '800', color: '#FFF', textTransform: 'uppercase' }}>Personalized</Text>
                      </View>
                    )}
                    <Text style={styles.shareCardTagline}>Daily Metabolism</Text>
                  </View>
                </View>

                {/* Date + Stats */}
                <View style={styles.shareCardHero}>
                   <View style={{ flex: 1 }}>
                     <Text style={styles.shareCardDate}>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</Text>
                     <View style={styles.shareCardStatsRow}>
                        <View style={styles.shareCardStat}>
                          <Text style={[styles.shareCardStatVal, { color: peakColor }]}>{stats.peakGlucose}</Text>
                          <Text style={styles.shareCardStatLbl}>Peak mg/dL</Text>
                        </View>
                        <View style={styles.shareCardStat}>
                          <Text style={[styles.shareCardStatVal, { color: elevatedColor }]}>{elevatedStr}</Text>
                          <Text style={styles.shareCardStatLbl}>Elevated</Text>
                        </View>
                     </View>
                   </View>
                   <View style={styles.shareCardScoreBox}>
                      <Text style={[styles.shareCardScore, { color: C.primary }]}>DAILY</Text>
                      <Text style={styles.shareCardScoreLabel}>LOG</Text>
                   </View>
                </View>

                {/* Chart Area */}
                <View style={styles.shareCardChartArea}>
                  <Svg width={CHART_W} height={120}>
                      {pts.length > 1 && (
                        <>
                          <Path d={shareFill} fill="url(#gFillShare)" />
                          <Path d={shareLine} fill="none" stroke={C.energy} strokeWidth={2.5} />
                        </>
                      )}
                      <Defs>
                        <SvgGradient id="gFillShare" x1="0" y1="0" x2="0" y2="1">
                          <Stop offset="0" stopColor={C.energy} stopOpacity="0.4" />
                          <Stop offset="1" stopColor={C.energy} stopOpacity="0.0" />
                        </SvgGradient>
                      </Defs>
                  </Svg>
                </View>

                {/* Footer */}
                <View style={styles.shareCardFooter}>
                  <View style={styles.shareCardFooterLeft}>
                    <Text style={styles.shareCardFooterBrand}>Nouriva AI</Text>
                    <Text style={styles.shareCardFooterTag}>Precision Metabolic Analysis</Text>
                    <Image 
                      source={require('../../assets/marketing/download_badge.png')} 
                      style={styles.shareCardBadge}
                      resizeMode="contain"
                    />
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

            {/* Share actions */}
            <TouchableOpacity style={styles.shareActionBtn} onPress={handleShareCapture} activeOpacity={0.88}>
              <ShareNetwork size={18} color="#FFF" weight="bold" />
              <Text style={styles.shareActionText}>Share Daily Summary</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.shareTextBtn}
              onPress={async () => {
                const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
                await Share.share({ message: `Metabolic summary for ${dateStr} on Nouriva AI.\nPeak Glucose: ${stats.peakGlucose} mg/dL\nElevated: ${elevatedStr}\nGet the app: ${process.env.EXPO_PUBLIC_APP_SHARE_URL || 'https://productverse.in'}` });
                setShareModalVisible(false);
              }}
              activeOpacity={0.75}
            >
              <Text style={styles.shareTextBtnLabel}>Share as Text</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    header: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 16, paddingVertical: 12,
      borderBottomWidth: 1, borderBottomColor: C.border,
    },
    headerSide: { width: 44, alignItems: 'flex-start', justifyContent: 'center' },
    logo: { width: 32, height: 32, borderRadius: 8 },
    backBtn: { padding: 6, borderRadius: 8, backgroundColor: C.bgSecondary },
    headerCenter: {
      flex: 1, flexDirection: 'row', alignItems: 'center',
      justifyContent: 'center', gap: 6,
    },
    headerTitle: { fontSize: 17, fontWeight: '800', color: C.textPrimary },
    headerRightBtn: { width: 44, height: 44, borderRadius: 10, backgroundColor: C.bgSecondary, justifyContent: 'center', alignItems: 'center' },
    scroll: { flex: 1 },
    scrollContent: { paddingHorizontal: 16, paddingTop: 12 },
    dateLabel: { fontSize: 12, color: C.textTertiary, marginBottom: 12 },

    dailySummaryCard: {
      backgroundColor: C.surface, borderRadius: 20, padding: 16, marginBottom: 14,
      borderWidth: 1, borderColor: C.border,
      shadowColor: C.shadowColor, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.04, shadowRadius: 10,
    },
    summaryTop: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    calRingWrap: { width: 80, height: 80, justifyContent: 'center', alignItems: 'center' },
    calRingCenter: { position: 'absolute', alignItems: 'center' },
    calRingValue: { fontSize: 16, fontWeight: '900', color: C.textPrimary },
    calRingLabel: { fontSize: 8, fontWeight: '700', color: C.textTertiary, marginTop: 1 },
    macroBarsList: { flex: 1, gap: 8 },
    macroBarItem: { gap: 4 },
    macroBarHeader: { flexDirection: 'row', justifyContent: 'space-between' },
    macroBarLabel: { fontSize: 10, fontWeight: '700', color: C.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5 },
    macroBarValue: { fontSize: 10, fontWeight: '900', letterSpacing: -0.2 },
    macroBarGoal: { fontSize: 9, fontWeight: '500', color: C.textTertiary },
    macroBarTrack: { height: 5, backgroundColor: C.bgSecondary, borderRadius: 3, overflow: 'hidden' },
    macroBarFill: { height: 5, borderRadius: 3 },

    statsRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
    statCard: {
      flex: 1, backgroundColor: C.surface, borderRadius: 12, padding: 11,
      alignItems: 'center', borderTopWidth: 2.5,
      shadowColor: C.shadowColor, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
    },
    statValue: { fontSize: 21, fontWeight: '700', letterSpacing: -0.5 },
    statUnit: { fontSize: 10, color: C.textTertiary, marginTop: 1 },
    statLabel: { fontSize: 10, color: C.textSecondary, marginTop: 3, textAlign: 'center' },

    chartCard: {
      backgroundColor: C.surface, borderRadius: 16, padding: 12, marginBottom: 8,
      shadowColor: C.shadowColor, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
    },
    legendRow: { flexDirection: 'row', gap: 16, marginBottom: 8, paddingLeft: PAD_L - 12 },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    legendSolid: { width: 14, height: 2.5, borderRadius: 2 },
    legendDash: { width: 14, height: 0, borderTopWidth: 1.5, borderStyle: 'dashed' },
    legendText: { fontSize: 10, color: C.textSecondary },
    axisRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4, marginTop: 4 },
    axisLabel: { fontSize: 9, opacity: 0.7 },

    emptyChart: { height: 160, alignItems: 'center', justifyContent: 'center', gap: 10 },
    emptyChartText: { fontSize: 13, color: C.textTertiary },

    elevatedBanner: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      borderLeftWidth: 3, borderRadius: 8, padding: 10, marginBottom: 10,
    },
    elevatedText: { flex: 1, fontSize: 12, fontWeight: '500', lineHeight: 17 },

    insightsCard: {
      backgroundColor: C.surface, borderRadius: 14, padding: 14, marginBottom: 16,
      shadowColor: C.shadowColor, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
    },
    insightsHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
    insightsTitle: { fontSize: 13, fontWeight: '600', color: C.textPrimary },
    insightRow: { flexDirection: 'row', gap: 8, marginBottom: 8, alignItems: 'flex-start' },
    insightDot: { width: 6, height: 6, borderRadius: 3, marginTop: 5, flexShrink: 0 },
    insightText: { flex: 1, fontSize: 12, color: C.textSecondary, lineHeight: 18 },

    sectionTitle: { fontSize: 13, fontWeight: '600', color: C.textPrimary, marginBottom: 8 },
    mealRow: {
      flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface,
      borderRadius: 12, padding: 12, marginBottom: 8, gap: 10,
      shadowColor: C.shadowColor, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
    },
    mealDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0, marginTop: 2 },
    mealInfo: { flex: 1 },
    mealName: { fontSize: 13, fontWeight: '600', color: C.textPrimary },
    mealMeta: { fontSize: 10, color: C.textTertiary, marginTop: 2, lineHeight: 14 },
    mealRight: { alignItems: 'flex-end' },
    mealPeak: { fontSize: 14, fontWeight: '700' },
    mealPeakUnit: { fontSize: 10, color: C.textTertiary, fontWeight: '600' },
    mealRecovery: { fontSize: 11, color: C.textTertiary, fontWeight: '500', marginTop: 1 },

    // Empty day
    emptyDay: { alignItems: 'center', paddingVertical: 40, gap: 8 },
    emptyDayIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: C.bgSecondary, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
    emptyDayText: { fontSize: 15, fontWeight: '700', color: C.textSecondary },
    emptyDaySub: { fontSize: 13, color: C.textTertiary, marginBottom: 8 },
    emptyLogBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.primary,
      paddingHorizontal: 22,
      paddingVertical: 12,
      borderRadius: 14,
      gap: 8,
      shadowColor: C.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 8,
      elevation: 4,
    },
    emptyLogBtnText: { fontSize: 14, fontWeight: '800', color: '#FFF' },
    proBadge: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: C.primary, paddingHorizontal: 6, paddingVertical: 2,
      borderRadius: 6, marginLeft: 6,
    },
    proBadgeText: { fontSize: 9, fontWeight: '800', color: '#FFF', textTransform: 'uppercase' },

    // Share Modal
    shareOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
    shareSheet: {
      backgroundColor: C.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28,
      paddingHorizontal: 20, paddingBottom: Platform.OS === 'ios' ? 36 : 24, paddingTop: 12,
    },
    shareSheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.border, alignSelf: 'center', marginBottom: 16 },
    shareSheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    shareSheetTitle: { fontSize: 18, fontWeight: '800', color: C.textPrimary },
    shareCloseBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.bgSecondary, justifyContent: 'center', alignItems: 'center' },

    // Share Card
    shareCardWrapper: { borderRadius: 20, overflow: 'hidden', marginBottom: 16 },
    shareCard: { backgroundColor: C.surface, borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: C.border },
    shareCardHeader: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 8, backgroundColor: C.bg, borderBottomWidth: 1, borderBottomColor: C.border },
    shareCardLogo: { width: 22, height: 22, borderRadius: 6 },
    shareCardBrand: { fontSize: 14, fontWeight: '900', color: C.primary },
    shareCardTagline: { fontSize: 10, color: C.textTertiary, fontWeight: '600', marginLeft: 'auto' as any },
    shareCardHero: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14 },
    shareCardDate: { fontSize: 16, fontWeight: '800', color: C.textPrimary, marginBottom: 8 },
    shareCardStatsRow: { flexDirection: 'row', gap: 16 },
    shareCardStat: { gap: 2 },
    shareCardStatVal: { fontSize: 18, fontWeight: '900' },
    shareCardStatLbl: { fontSize: 9, fontWeight: '600', color: C.textTertiary, textTransform: 'uppercase' },
    shareCardScoreBox: { padding: 10, borderRadius: 12, backgroundColor: C.bgSecondary, alignItems: 'center', minWidth: 60 },
    shareCardScore: { fontSize: 11, fontWeight: '900', letterSpacing: 1 },
    shareCardScoreLabel: { fontSize: 9, fontWeight: '700', color: C.textTertiary },
    shareCardChartArea: { paddingVertical: 10, alignItems: 'center' },
    shareCardFooter: {
      padding: 16, borderTopWidth: 1, borderTopColor: C.border,
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      backgroundColor: C.bgSecondary,
    },
    shareCardFooterLeft: { flex: 1 },
    shareCardFooterBrand: { fontSize: 14, fontWeight: '900', color: C.primary, marginBottom: 2 },
    shareCardFooterTag: { fontSize: 9, color: C.textTertiary, fontWeight: '700', textTransform: 'uppercase', marginBottom: 8 },
    shareCardBadge: { width: 100, height: 28, marginLeft: -4 },
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
  });
}
