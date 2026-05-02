import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
  Alert,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ScrollView as RNScrollView,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  CaretLeftIcon as CaretLeft,
  CaretRightIcon as CaretRight,
  CaretDownIcon as CaretDown,
  ClockCounterClockwiseIcon as HistoryIcon,
  ClockIcon as Clock,
  TrendUpIcon as TrendUp,
  PulseIcon as Pulse,
  LightningIcon as Lightning,
  DnaIcon as Dna,
  DropIcon as Drop,
  GrainsIcon as Grains,
  SparkleIcon as Sparkle,
  CalendarIcon as Calendar,
  TrashIcon as Trash,
  PlusIcon as Plus,
  CameraIcon as Camera,
  ShareNetworkIcon as ShareNetwork,
  XIcon as X,
} from 'phosphor-react-native';

import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as SecureStore from 'expo-secure-store';
import { Svg, Path, Defs, LinearGradient as SvgGradient, Stop, Circle as SvgCircle, Text as SvgText } from 'react-native-svg';
import { getFoodLogs, FoodLog, deleteFoodLog, saveFoodLog } from '../utils/history';
import { sumMacroTotalsFromLogs } from '../utils/macroTotals';
import { analyzeFoodText } from '../utils/llm';
import { getAnalysisFailureMessage, isAnalysisIncomplete } from '../utils/analysisResult';
import { getDailyGoals, DailyGoals } from '../utils/goals';
import { fetchHealthStats } from '../utils/health';
import * as Haptics from 'expo-haptics';
import { useColors, AppColors } from '../theme';
import { ScreenEnterAnimation } from '../components/ScreenEnterAnimation';
import { navigateFromTabs } from '../navigation/rootNavigation';

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function toDateKey(date: Date) {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

type HistoryScreenProps = {
  navigation: NativeStackNavigationProp<any>;
};

export default function HistoryScreen({ navigation }: HistoryScreenProps) {
  const C = useColors();
  const styles = useMemo(() => makeStyles(C), [C]);
  const dayStripRef = useRef<RNScrollView>(null);
  const [viewMode, setViewMode] = useState<'weekly' | 'monthly'>('weekly');
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });



  const [logs, setLogs] = useState<FoodLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [goals, setGoals] = useState<DailyGoals>({ calories: 2000, protein: 150, carbs: 250, fats: 65 });
  const [selectedDate, setSelectedDate] = useState(() => new Date());

  const [manualModalVisible, setManualModalVisible] = useState(false);
  const [manualFoodName, setManualFoodName] = useState('');
  const [manualQuantity, setManualQuantity] = useState('1 serving');

  const fetchLogs = useCallback(async () => {
    const [data, g] = await Promise.all([getFoodLogs(), getDailyGoals()]);
    setLogs(data);
    setGoals(g);
    setLoading(false);
    setRefreshing(false);
  }, []);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [manualAnalysisProgress, setManualAnalysisProgress] = useState(0);
  const [organDropdownVisible, setOrganDropdownVisible] = useState(false);
  const [trendFilter, setTrendFilter] = useState('Overall');
  const [trendDropdownOpen, setTrendDropdownOpen] = useState(false);
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [sharingImage, setSharingImage] = useState(false);
  const shareCardRef = useRef<any>(null);

  useEffect(() => {
    if (!isAnalyzing) {
      setManualAnalysisProgress(0);
      return;
    }

    setManualAnalysisProgress(8);
    const id = setInterval(() => {
      setManualAnalysisProgress((current) => {
        if (current < 55) return current + 7;
        if (current < 82) return current + 4;
        if (current < 94) return current + 2;
        return current;
      });
    }, 450);

    return () => clearInterval(id);
  }, [isAnalyzing]);

  const handleManualAdd = async () => {
    if (!manualFoodName.trim() || isAnalyzing) return;
    
    setIsAnalyzing(true);
    try {
      // Get medical conditions from secure store
      const profileStr = await SecureStore.getItemAsync('user_profile');
      const profile = profileStr ? JSON.parse(profileStr) : {};
      const medicalConditions = profile.medicalConditions || [];
      
      const fullText = `${manualQuantity} of ${manualFoodName}`;
      const analysis = await analyzeFoodText(fullText, medicalConditions);

      if (isAnalysisIncomplete(analysis)) {
        Alert.alert('Could not analyse', getAnalysisFailureMessage(analysis));
        setIsAnalyzing(false);
        return;
      }

      // Extract vitality score from systemicData with defensive parsing
      const systemic = analysis.systemicData || [];
      const scores = systemic
        .map((s: any) => {
          const val = String(s.score || '0').split('/')[0];
          return parseFloat(val);
        })
        .filter((n: number) => !isNaN(n));
      
      const avgScoreRaw = scores.length > 0
        ? scores.reduce((a: number, b: number) => a + b, 0) / scores.length
        : 5.0;
      
      const avgScore = parseFloat(avgScoreRaw.toFixed(1));

      const healthSnapshot = await fetchHealthStats();
      await saveFoodLog(
        analysis.foodName || manualFoodName,
        avgScore,
        undefined,
        undefined,
        healthSnapshot,
        analysis.macros,
        {
          systemicData: analysis.systemicData,
          organData: analysis.organData,
          alerts: analysis.alerts,
          balancerSuggestions: analysis.balancerSuggestions,
          biochemicals: analysis.biochemicals,
          refs: analysis.refs,
          longevityData: analysis.longevityData,
        }
      );

      const addedAt = new Date();
      setSelectedDate(addedAt);
      setCalendarMonth(new Date(addedAt.getFullYear(), addedAt.getMonth(), 1));
      await fetchLogs();
      setManualModalVisible(false);
      setManualFoodName('');
      setManualQuantity('1 portion');
    } catch (error: any) {
      console.error('Manual add failed:', error);
      Alert.alert('Error', error.message || 'Failed to analyze food. Please try again.');
    } finally {
      setIsAnalyzing(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  useFocusEffect(
    useCallback(() => {
      void fetchLogs();
    }, [fetchLogs]),
  );
  const onRefresh = () => { setRefreshing(true); void fetchLogs(); };

  // Index logs by day key for O(1) lookup
  const logsByDay = useMemo(() => {
    const map = new Map<string, FoodLog[]>();
    for (const log of logs) {
      const d = new Date(log.created_at);
      const key = toDateKey(d);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(log);
    }
    return map;
  }, [logs]);

  const today = useMemo(() => new Date(), []);
  
  const recentDays = useMemo(() => {
    const days = [];
    const start = new Date(today);
    start.setDate(today.getDate() - 30); // Show last 30 days
    
    // Only go up to today (don't show future dates)
    const end = new Date(today);

    const curr = new Date(start);
    while (curr <= end) {
      days.push(new Date(curr));
      curr.setDate(curr.getDate() + 1);
    }
    return days;
  }, [today]);

  useEffect(() => {
    if (viewMode === 'weekly') {
      const timer = setTimeout(() => {
        // Find index of selected date to scroll to it
        const index = recentDays.findIndex(d => isSameDay(d, selectedDate));
        if (index !== -1) {
          // Approximate cell width is 54 (42 width + 12 margin)
          dayStripRef.current?.scrollTo({ x: index * 54 - 150, animated: true });
        }
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [viewMode, selectedDate, recentDays]);

  const calendarDays = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDow = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < firstDow; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [calendarMonth]);

  const selectedLogs = useMemo(() =>
    logsByDay.get(toDateKey(selectedDate)) || [],
    [logsByDay, selectedDate]
  );
  
  const selectedIsToday = useMemo(() => isSameDay(selectedDate, today), [selectedDate, today]);

  const getScoreColor = useCallback((score: number) => {
    if (score < 4.5) return C.scoreLow;
    if (score < 7.0) return C.scoreMid;
    return C.scoreHigh;
  }, [C]);

  const getDayAvgScore = useCallback((logs: FoodLog[]) => {
    if (!logs.length) return null;
    return logs.reduce((s, l) => s + l.vitality_score, 0) / logs.length;
  }, []);

  const getDayOrganAvgs = useCallback((logs: FoodLog[]) => {
    if (!logs.length) return [];
    const organSums: Record<string, { total: number, count: number }> = {};
    logs.forEach(log => {
      let data = log.organ_data;
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
        } catch (e) {}
      }
      if (data && Array.isArray(data)) {
        data.forEach(item => {
          if (item && item.organ && item.score) {
            const val = parseFloat(String(item.score).split('/')[0]);
            if (!isNaN(val)) {
              if (!organSums[item.organ]) {
                organSums[item.organ] = { total: 0, count: 0 };
              }
              organSums[item.organ].total += val;
              organSums[item.organ].count += 1;
            }
          }
        });
      }
    });

    return Object.keys(organSums).map(organ => ({
      organ,
      avg: organSums[organ].total / organSums[organ].count
    })).sort((a, b) => b.avg - a.avg);
  }, []);

  const handleShareLogs = () => {
    Haptics.selectionAsync();
    setShareModalVisible(true);
  };

  const handleShareCapture = async () => {
    if (!shareCardRef.current) return;
    setSharingImage(true);
    try {
      const uri = await shareCardRef.current.capture();
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share your daily log' });
      } else {
        await Share.share({ message: 'My daily nutrition log from Nouriva AI', url: uri });
      }
    } catch (e) {
      console.error('Share capture failed:', e);
    } finally {
      setSharingImage(false);
      setShareModalVisible(false);
    }
  };

  const handleShareAsText = async () => {
    const dateStr = selectedDate.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
    const lines = selectedLogs.length > 0
      ? selectedLogs.map(l => `• ${l.food_name} — Vitality ${l.vitality_score}/10`)
      : ['No meals logged yet.'];
    const totals = `Calories: ${selectedDayTotals.calories} kcal | P: ${selectedDayTotals.protein}g | C: ${selectedDayTotals.carbs}g | F: ${selectedDayTotals.fats}g`;
    const message = [`🥗 ${dateStr} — ${selectedLogs.length} meal${selectedLogs.length !== 1 ? 's' : ''} logged`, '', ...lines, '', totals, '', 'Tracked with Nouriva AI'].join('\n');
    await Share.share({ message });
    setShareModalVisible(false);
  };

  const handleDelete = async (id: string, name: string) => {
    Alert.alert(
      'Delete Log',
      `Are you sure you want to delete "${name}"? This will remove it from your history and update your daily totals.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            const success = await deleteFoodLog(id);
            if (success) {
              setLogs(prev => prev.filter(l => l.id !== id));
            } else {
              Alert.alert('Error', 'Failed to delete log. Please try again.');
            }
          }
        }
      ]
    );
  };


  const selectedDayTotals = useMemo(() => sumMacroTotalsFromLogs(selectedLogs), [selectedLogs]);

  // Fixed rolling 7-day window (local): index 0 = 6 days ago → index 6 = today. Labels shift with the calendar.
  const trendData = useMemo(() => {
    const end = new Date();
    end.setHours(0, 0, 0, 0);
    const rows: { date: Date; dateKey: string; avgScore: number | null }[] = [];
    for (let k = 6; k >= 0; k--) {
      const d = new Date(end);
      d.setDate(end.getDate() - k);
      const key = toDateKey(d);
      const dayLogs = logsByDay.get(key) || [];
      let avgScore: number | null = null;

      if (trendFilter === 'Overall') {
        if (dayLogs.length > 0) {
          const sum = dayLogs.reduce((s, l) => s + (l.vitality_score ?? 0), 0) / dayLogs.length;
          if (!Number.isNaN(sum)) avgScore = sum;
        }
      } else {
        let organTotal = 0;
        let organCount = 0;
        dayLogs.forEach((log) => {
          let data = log.organ_data;
          if (typeof data === 'string') {
            try {
              data = JSON.parse(data);
            } catch (e) {}
          }
          if (data && Array.isArray(data)) {
            data.forEach((item) => {
              if (item && item.organ === trendFilter && item.score) {
                const val = parseFloat(String(item.score).split('/')[0]);
                if (!isNaN(val)) {
                  organTotal += val;
                  organCount += 1;
                }
              }
            });
          }
        });
        if (organCount > 0) avgScore = organTotal / organCount;
      }
      rows.push({ date: d, dateKey: key, avgScore });
    }
    return rows;
  }, [logsByDay, trendFilter]);

  // 7-day glucose & insulin trend: average glucose_peak and glucose_insulin_peak per day
  const glucoseTrendData = useMemo(() => {
    const end = new Date();
    end.setHours(0, 0, 0, 0);
    const rows: { date: Date; avgGlucose: number | null; avgInsulin: number | null }[] = [];
    for (let k = 6; k >= 0; k--) {
      const d = new Date(end);
      d.setDate(end.getDate() - k);
      const key = toDateKey(d);
      const dayLogs = logsByDay.get(key) || [];
      const glucoseLogs = dayLogs.filter(l => l.glucose_peak != null && (l.glucose_peak as number) > 0);
      
      let avgGlucose = null;
      let avgInsulin = null;
      if (glucoseLogs.length > 0) {
        avgGlucose = glucoseLogs.reduce((s, l) => s + (l.glucose_peak || 0), 0) / glucoseLogs.length;
        avgInsulin = glucoseLogs.reduce((s, l) => s + (l.glucose_insulin_peak || 0), 0) / glucoseLogs.length;
      }
      rows.push({ date: d, avgGlucose, avgInsulin });
    }
    return rows;
  }, [logsByDay]);

  const renderVitalityTrendChart = () => {
    if (trendData.length !== 7) return null;
    const chartWidth = Dimensions.get('window').width - 64;
    const chartHeight = 80;
    const labelH = 28;
    const scoreH = 18;
    const totalH = scoreH + chartHeight + labelH;
    const pad = 16;
    const slots = 7;
    const getX = (i: number) => pad + (i * (chartWidth - 2 * pad)) / (slots - 1);
    const getY = (s: number) =>
      scoreH + chartHeight - pad - (s / 10) * (chartHeight - 2 * pad);
    const bottomY = scoreH + chartHeight;

    const lineParts: string[] = [];
    for (let i = 0; i < 6; i++) {
      const a = trendData[i].avgScore;
      const b = trendData[i + 1].avgScore;
      if (a != null && b != null) {
        lineParts.push(`M ${getX(i)} ${getY(a)} L ${getX(i + 1)} ${getY(b)}`);
      }
    }
    const d = lineParts.join(' ');

    const areaParts: string[] = [];
    for (let i = 0; i < 6; i++) {
      const a = trendData[i].avgScore;
      const b = trendData[i + 1].avgScore;
      if (a != null && b != null) {
        const x0 = getX(i);
        const x1 = getX(i + 1);
        const y0 = getY(a);
        const y1 = getY(b);
        areaParts.push(`M ${x0} ${y0} L ${x1} ${y1} L ${x1} ${bottomY} L ${x0} ${bottomY} Z`);
      }
    }
    for (let i = 0; i < 7; i++) {
      const v = trendData[i].avgScore;
      if (v == null) continue;
      const left = i > 0 ? trendData[i - 1].avgScore : null;
      const right = i < 6 ? trendData[i + 1].avgScore : null;
      if (left == null && right == null) {
        const x0 = getX(i);
        const y0 = getY(v);
        const half = Math.min(22, (chartWidth - 2 * pad) / 14);
        areaParts.push(`M ${x0 - half} ${y0} L ${x0 + half} ${y0} L ${x0 + half} ${bottomY} L ${x0 - half} ${bottomY} Z`);
      }
    }
    const areaD = areaParts.join(' ');

    const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    return (
      <View style={[styles.chartCard, { zIndex: 10 }]} key="trend-chart-card">
        <View style={[styles.cardHeader, { justifyContent: 'space-between', zIndex: 20 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <TrendUp size={13} weight="bold" color={C.primary} />
            <Text style={styles.cardHeaderText}>7-Day Vitality Trend</Text>
          </View>
          <View style={{ position: 'relative', zIndex: 30 }}>
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.bgSecondary, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, gap: 4 }}
              onPress={() => { Haptics.selectionAsync(); setTrendDropdownOpen(!trendDropdownOpen); }}
            >
              <Text style={{ fontSize: 11, fontWeight: '700', color: C.textPrimary }}>{trendFilter}</Text>
              <CaretDown size={12} weight="bold" color={C.textTertiary} style={{ transform: [{ rotate: trendDropdownOpen ? '180deg' : '0deg' }] }} />
            </TouchableOpacity>
            {trendDropdownOpen && (
               <View style={{ position: 'absolute', top: 28, right: 0, backgroundColor: C.surface, padding: 6, borderRadius: 12, borderWidth: 1, borderColor: C.border, shadowColor: C.shadowColor, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, minWidth: 100, zIndex: 100, elevation: 10 }}>
                 {['Overall', 'Brain', 'Liver', 'Heart', 'Gut', 'Kidney', 'Pancreas', 'Skin'].map(o => (
                   <TouchableOpacity key={o} style={{ padding: 8, backgroundColor: trendFilter === o ? C.bgSecondary : 'transparent', borderRadius: 8 }} onPress={() => { Haptics.selectionAsync(); setTrendFilter(o); setTrendDropdownOpen(false); }}>
                     <Text style={{ fontSize: 12, fontWeight: trendFilter === o ? '800' : '600', color: trendFilter === o ? C.primary : C.textSecondary }}>{o}</Text>
                   </TouchableOpacity>
                 ))}
               </View>
            )}
          </View>
        </View>
        <Svg width={chartWidth} height={totalH} style={{ zIndex: 1 }}>
          <Defs>
            <SvgGradient id="fillGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <Stop offset="0%" stopColor={C.primary} stopOpacity="0.2" />
              <Stop offset="100%" stopColor={C.primary} stopOpacity="0" />
            </SvgGradient>
          </Defs>

          {areaD ? <Path d={areaD} fill="url(#fillGrad)" /> : null}
          {d ? <Path d={d} stroke={C.primary} strokeWidth={2.5} fill="none" strokeLinecap="round" /> : null}

          {trendData.map((row, i) => {
            const p = row.avgScore;
            const x = getX(i);
            const date = row.date;
            const isTodayCol = i === slots - 1;
            const dayLabel = isTodayCol ? 'Today' : DAY_ABBR[date.getDay()];
            return (
              <React.Fragment key={`trend-pt-${row.dateKey}`}>
                {p != null && !Number.isNaN(p) ? (
                  <>
                    <SvgText
                      x={x} y={getY(p) - 8}
                      textAnchor="middle"
                      fontSize="9" fontWeight="700"
                      fill={p < 4.5 ? C.scoreLow : p < 7.0 ? C.scoreMid : C.scoreHigh}
                    >
                      {p.toFixed(1)}
                    </SvgText>
                    <SvgCircle
                      cx={x} cy={getY(p)} r={3.5}
                      fill={C.surface}
                      stroke={p < 4.5 ? C.scoreLow : p < 7.0 ? C.scoreMid : C.scoreHigh}
                      strokeWidth={2}
                    />
                  </>
                ) : null}
                <SvgText
                  x={x} y={scoreH + chartHeight + 16}
                  textAnchor="middle"
                  fontSize="9" fontWeight={isTodayCol ? '800' as const : '600' as const}
                  fill={isTodayCol ? C.primary : C.textTertiary}
                >
                  {dayLabel}
                </SvgText>
              </React.Fragment>
            );
          })}
        </Svg>
      </View>
    );
  };

  const renderGlucoseInsightChart = () => {
    if (glucoseTrendData.length < 1) return null;

    const chartWidth = Dimensions.get('window').width - 64;
    const chartHeight = 96;
    const labelH = 28;
    const scoreH = 14; // space above for value labels
    const totalH = scoreH + chartHeight + labelH;
    const pad = 20;

    // Reference thresholds (mg/dL)
    const G_MIN = 70;
    const G_MAX = 220;
    const G_ELEVATED = 140;
    const G_SPIKE = 180;

    const getY = (val: number) => {
      const clamped = Math.max(G_MIN, Math.min(G_MAX, val));
      return scoreH + chartHeight * (1 - (clamped - G_MIN) / (G_MAX - G_MIN));
    };

    const getX = (i: number) => {
      if (glucoseTrendData.length === 1) return chartWidth / 2;
      return pad + (i * (chartWidth - 2 * pad)) / (glucoseTrendData.length - 1);
    };

    const getGlucoseColor = (g: number) => {
      if (g > G_SPIKE) return '#EF4444';
      if (g > G_ELEVATED) return '#F59E0B';
      return '#10B981';
    };

    const points = glucoseTrendData.map(d => d.avgGlucose);
    const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    // Zone Y boundaries
    const yTop    = getY(G_MAX);
    const ySpike  = getY(G_SPIKE);
    const yElev   = getY(G_ELEVATED);
    const yBottom = getY(G_MIN);

    // Path segments (straight lines + areas between points)
    const lineParts: string[] = [];
    const areaParts: string[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      if (a != null && b != null) {
        const x0 = getX(i);
        const x1 = getX(i + 1);
        const y0 = getY(a);
        const y1 = getY(b);
        lineParts.push(`M ${x0} ${y0} L ${x1} ${y1}`);
        areaParts.push(`M ${x0} ${y0} L ${x1} ${y1} L ${x1} ${yBottom} L ${x0} ${yBottom} Z`);
      }
    }
    const glucosePath = lineParts.join(' ');
    const glucoseAreaD = areaParts.join(' ');

    // Interpretation for the most recent day with data
    const latestWithData = [...glucoseTrendData].reverse().find(d => d.avgGlucose !== null);
    const latestGlucose = latestWithData?.avgGlucose ?? 0;
    const latestInsulin = latestWithData?.avgInsulin ?? 0;
    const glucoseColor  = getGlucoseColor(latestGlucose);
    const glucoseLabel  = latestGlucose > G_SPIKE ? 'Spike' : latestGlucose > G_ELEVATED ? 'Elevated' : latestGlucose > 0 ? 'Normal' : 'No Data';

    const interpretation =
      latestGlucose === 0 
        ? 'No glucose data available for the recent period. Log your meals to see insights.'
        : latestGlucose > G_SPIKE
        ? '⚠️ Peak glucose above 180 mg/dL. Pair carbs with protein or fiber, and try a 10-min walk after eating.'
        : latestGlucose > G_ELEVATED
        ? '🟡 Slightly elevated (140–180 mg/dL). Reducing refined carbs or adding a short post-meal walk can flatten the curve.'
        : '✅ Post-meal glucose is in the healthy range (under 140 mg/dL). Great work!';

    return (
      <View style={styles.chartCard}>
        <View style={[styles.cardHeader, { justifyContent: 'space-between' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Pulse size={13} weight="bold" color="#F59E0B" />
            <Text style={styles.cardHeaderText}>Glucose Insight</Text>
          </View>
          <View style={{ backgroundColor: (latestGlucose > 0 ? glucoseColor : C.textTertiary) + '22', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
            <Text style={{ fontSize: 10, fontWeight: '800', color: latestGlucose > 0 ? glucoseColor : C.textTertiary }}>{glucoseLabel}</Text>
          </View>
        </View>

        <Svg width={chartWidth} height={totalH}>
          <Defs>
            <SvgGradient id="glucArea" x1="0%" y1="0%" x2="0%" y2="100%">
              <Stop offset="0%" stopColor="#F59E0B" stopOpacity="0.22" />
              <Stop offset="100%" stopColor="#F59E0B" stopOpacity="0.02" />
            </SvgGradient>
          </Defs>

          {/* Zone background bands */}
          <Path d={`M ${pad} ${yTop} H ${chartWidth - pad} V ${ySpike} H ${pad} Z`}   fill="#EF444412" />
          <Path d={`M ${pad} ${ySpike} H ${chartWidth - pad} V ${yElev} H ${pad} Z`}   fill="#F59E0B12" />
          <Path d={`M ${pad} ${yElev} H ${chartWidth - pad} V ${yBottom} H ${pad} Z`} fill="#10B98112" />

          {/* Dashed threshold lines */}
          <Path d={`M ${pad} ${ySpike} H ${chartWidth - pad}`} stroke="#EF4444" strokeWidth={0.8} strokeDasharray="3 3" opacity={0.5} />
          <Path d={`M ${pad} ${yElev} H ${chartWidth - pad}`}  stroke="#F59E0B" strokeWidth={0.8} strokeDasharray="3 3" opacity={0.5} />

          {/* mg/dL threshold labels */}
          <SvgText x={pad + 2} y={ySpike - 2} fontSize="7.5" fontWeight="700" fill="#EF4444">180</SvgText>
          <SvgText x={pad + 2} y={yElev - 2}  fontSize="7.5" fontWeight="700" fill="#F59E0B">140</SvgText>

          {/* Area fill under glucose line */}
          {glucoseAreaD ? <Path d={glucoseAreaD} fill="url(#glucArea)" /> : null}

          {/* Glucose line */}
          {glucosePath ? (
            <Path d={glucosePath} stroke="#F59E0B" strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          ) : null}

          {/* Data point dots + labels */}
          {glucoseTrendData.map((row, i) => {
            const p = row.avgGlucose;
            const x = getX(i);
            const y = p != null ? getY(p) : 0;
            const color = p != null ? getGlucoseColor(p) : '#CCC';
            const date = row.date;
            const isTodayCol = i === glucoseTrendData.length - 1;
            const dayLabel = isTodayCol ? 'Today' : DAY_ABBR[date.getDay()];
            return (
              <React.Fragment key={`g-pt-${i}`}>
                {p != null && (
                  <>
                    <SvgCircle cx={x} cy={y} r={4} fill={C.surface} stroke={color} strokeWidth={2.5} />
                    <SvgText x={x} y={y - 8} textAnchor="middle" fontSize="9" fontWeight="700" fill={color}>
                      {Math.round(p)}
                    </SvgText>
                  </>
                )}
                <SvgText 
                  x={x} y={scoreH + chartHeight + 16} 
                  textAnchor="middle" 
                  fontSize="9" 
                  fontWeight={isTodayCol ? '800' : '600'} 
                  fill={isTodayCol ? C.primary : C.textTertiary}
                >
                  {dayLabel}
                </SvgText>
              </React.Fragment>
            );
          })}
        </Svg>

        {/* Insulin summary row */}
        {latestInsulin > 0 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, marginBottom: 6 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#8B5CF6' }} />
            <Text style={{ fontSize: 11, fontWeight: '700', color: C.textSecondary }}>
              {'Insulin peak · '}
              <Text style={{ color: '#8B5CF6' }}>{Math.round(latestInsulin)} μU/mL</Text>
              <Text style={{ fontWeight: '500', color: C.textTertiary }}>
                {latestInsulin > 120 ? ' · High' : latestInsulin > 80 ? ' · Elevated' : ' · Normal'}
              </Text>
            </Text>
          </View>
        )}

        {/* Plain-English interpretation */}
        <View style={{ backgroundColor: C.bgSecondary, borderRadius: 10, padding: 11, marginTop: 4 }}>
          <Text style={{ fontSize: 12, color: C.textSecondary, lineHeight: 17, fontWeight: '500' }}>
            {interpretation}
          </Text>
        </View>
      </View>
    );
  };

  const renderMacroBar = (label: string, value: number, goal: number, color: string) => {
    const pct = Math.min(1, value / goal);
    return (
      <View key={`macro-${label}`} style={styles.macroBarItem}>
        <View style={styles.macroBarHeader}>
          <Text style={styles.macroBarLabel}>{label}</Text>
          <Text style={[styles.macroBarValue, { color }]}>{value}<Text style={styles.macroBarGoal}>/{goal}</Text></Text>
        </View>
        <View style={styles.macroBarTrack}>
          <View style={[styles.macroBarFill, { width: `${pct * 100}%` as any, backgroundColor: color }]} />
        </View>
      </View>
    );
  };

  const handleMealPress = (item: FoodLog) => {
    Haptics.selectionAsync();
    const imageUri = item.image_url || (item.image_base64 ? `data:image/jpeg;base64,${item.image_base64}` : undefined);
    // Reconstruct FoodScanResult from stored FoodLog fields
    const result = {
      foodName: item.food_name,
      macros: item.macros,
      systemicData: item.systemic_data,
      organData: item.organ_data,
      alerts: item.alerts,
      balancerSuggestions: item.balancer_suggestions,
      biochemicals: item.biochemicals,
      refs: item.refs,
      longevityData: item.longevity_data,
    };
    navigateFromTabs(navigation, 'Results', {
      result,
      originalImage: item.image_base64 ?? undefined,
      originalImageUri: imageUri,
      isPersonalized: false,
      isReplay: true,
    });
  };

  const renderItem = ({ item }: { item: FoodLog }) => {
    const date = new Date(item.created_at);
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const scoreColor = getScoreColor(item.vitality_score);
    const imageUri = item.image_url || (item.image_base64 ? `data:image/jpeg;base64,${item.image_base64}` : undefined);
    return (
      <TouchableOpacity
        style={styles.logCard}
        onPress={() => handleMealPress(item)}
        activeOpacity={0.75}
      >
        <View style={styles.logImageContainer}>
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.logImage} />
          ) : (
            <View style={styles.placeholderImage}><HistoryIcon size={20} weight="bold" color={C.textTertiary} /></View>
          )}
        </View>
        <View style={styles.logInfo}>
          <Text style={styles.foodName} numberOfLines={1}>{item.food_name}</Text>
          <View style={styles.timeRow}>
            <Clock size={10} weight="bold" color={C.textTertiary} />
            <Text style={styles.timeText}>{timeStr}</Text>
          </View>
          {item.macros && (
            <View style={styles.logStatsRow}>
              {[
                { icon: <Lightning size={9} color={C.energy} weight="fill" />, val: item.macros.calories },
                { icon: <Dna size={9} weight="fill" color={C.primary} />, val: item.macros.protein },
                { icon: <Drop size={9} weight="fill" color={C.danger} />, val: item.macros.fats },
                { icon: <Grains size={9} weight="fill" color={C.vitality} />, val: item.macros.carbs },
              ].map(({ icon, val }, idx) => (
                <View key={`stat-${item.id}-${idx}`} style={styles.logStatItem}>
                  {icon}
                  <Text style={styles.logStatText}>{val}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
        <View style={styles.logCardRight}>
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={() => handleDelete(item.id, item.food_name)}
          >
            <Trash size={14} weight="bold" color={C.danger} />
          </TouchableOpacity>
          <View style={[styles.scoreBadge, { backgroundColor: scoreColor + '18' }]}>
            <Text style={[styles.scoreValue, { color: scoreColor }]}>{(item.vitality_score ?? 0).toFixed(1)}</Text>
          </View>
          <CaretRight size={14} weight="bold" color={C.textTertiary} />
        </View>
      </TouchableOpacity>
    );
  };

  const renderListHeader = () => {
    const selectedLabel = selectedIsToday
      ? 'Today'
      : selectedDate.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
    const isSelectedMonth = calendarMonth.getMonth() === today.getMonth() && calendarMonth.getFullYear() === today.getFullYear();

    return (
      <View key="list-header-root">
        <View style={styles.calendarCard}>
          <View style={styles.calendarHeader}>
            <Text style={styles.monthLabel}>
              {MONTHS[calendarMonth.getMonth()]} {calendarMonth.getFullYear()}
            </Text>
            <View style={styles.toggleGroup}>
              <TouchableOpacity 
                style={[styles.toggleBtn, viewMode === 'weekly' && styles.toggleBtnActive]}
                onPress={() => { Haptics.selectionAsync(); setViewMode('weekly'); }}
              >
                <Text style={[styles.toggleText, viewMode === 'weekly' && styles.toggleTextActive]}>Weekly</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.toggleBtn, viewMode === 'monthly' && styles.toggleBtnActive]}
                onPress={() => { Haptics.selectionAsync(); setViewMode('monthly'); }}
              >
                <Text style={[styles.toggleText, viewMode === 'monthly' && styles.toggleTextActive]}>Monthly</Text>
              </TouchableOpacity>
            </View>
          </View>

          {viewMode === 'weekly' ? (
            <View style={styles.sliderContainer}>
              <View style={styles.sliderHintLeft}>
                <CaretLeft size={16} weight="bold" color={C.textTertiary} />
              </View>
              <RNScrollView 
                ref={dayStripRef}
                horizontal 
                showsHorizontalScrollIndicator={false} 
                contentContainerStyle={styles.dayStripContent}
              >
                {recentDays.map((date) => {
                  const key = toDateKey(date);
                  const dayLogs = logsByDay.get(key) || [];
                  const avgScore = getDayAvgScore(dayLogs);
                  const dotColor = avgScore !== null ? getScoreColor(avgScore) : null;
                  const isToday = isSameDay(date, today);
                  const isSelected = isSameDay(date, selectedDate);
                  
                  return (
                    <TouchableOpacity
                      key={`day-strip-${key}`}
                      style={[
                        styles.stripDayCell,
                        isSelected && styles.stripDayCellSelected,
                        isToday && !isSelected && styles.stripDayCellToday,
                      ]}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setSelectedDate(date);
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.stripDayName, isSelected && styles.stripDayNameSelected]}>
                        {DAYS[date.getDay()]}
                      </Text>
                      <Text style={[
                        styles.stripDayNum,
                        isSelected && styles.stripDayNumSelected,
                        isToday && !isSelected && styles.stripDayNumToday,
                      ]}>
                        {date.getDate()}
                      </Text>
                      {dotColor ? (
                        <View style={[styles.dayDot, { backgroundColor: dotColor }]} />
                      ) : (
                        <View style={styles.dayDotEmpty} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </RNScrollView>
            </View>
          ) : (
            <View style={styles.monthlyContainer}>
              <View style={styles.monthNav}>
                <TouchableOpacity
                  style={styles.monthNavBtn}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setCalendarMonth(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
                  }}
                >
                  <CaretLeft size={18} weight="bold" color={C.textSecondary} />
                </TouchableOpacity>
                <Text style={styles.monthNavLabel}>
                  {MONTHS[calendarMonth.getMonth()]}
                </Text>
                <TouchableOpacity
                  style={styles.monthNavBtn}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setCalendarMonth(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));
                  }}
                  disabled={isSelectedMonth}
                >
                  <CaretRight size={18} weight="bold" color={isSelectedMonth ? C.border : C.textSecondary} />
                </TouchableOpacity>
              </View>

              <View style={styles.dowRow}>
                {DAYS.map((d, i) => (
                  <Text key={`dow-${i}`} style={styles.dowLabel}>{d}</Text>
                ))}
              </View>

              <View style={styles.calendarGrid}>
                {calendarDays.map((date, i) => {
                  if (!date) return <View key={`empty-cell-${i}`} style={styles.dayCell} />;
                  const key = toDateKey(date);
                  const dayLogs = logsByDay.get(key) || [];
                  const avgScore = getDayAvgScore(dayLogs);
                  const dotColor = avgScore !== null ? getScoreColor(avgScore) : null;
                  const isToday = isSameDay(date, today);
                  const isSelected = isSameDay(date, selectedDate);
                  const isFuture = date > today;
                  return (
                    <TouchableOpacity
                      key={`day-${key}`}
                      style={[
                        styles.dayCell,
                        isSelected && styles.dayCellSelected,
                        isToday && !isSelected && styles.dayCellToday,
                      ]}
                      onPress={() => {
                        if (isFuture) return;
                        Haptics.selectionAsync();
                        setSelectedDate(date);
                      }}
                      activeOpacity={isFuture ? 1 : 0.7}
                    >
                      <Text style={[
                        styles.dayNum,
                        isSelected && styles.dayNumSelected,
                        isToday && !isSelected && styles.dayNumToday,
                        isFuture && styles.dayNumFuture,
                      ]}>
                        {date.getDate()}
                      </Text>
                      {dotColor ? (
                        <View style={[styles.dayDot, { backgroundColor: dotColor }]} />
                      ) : (
                        <View style={styles.dayDotEmpty} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}
        </View>

        {/* Selected day header */}
        <View style={styles.selectedDayHeader}>
          <Calendar size={14} weight="bold" color={C.primary} />
          <Text style={styles.selectedDayLabel}>{selectedLabel}</Text>
          {selectedLogs.length > 0 && (
            <View style={styles.mealCountBadge}>
              <Text style={styles.mealCountText}>{selectedLogs.length} meal{selectedLogs.length !== 1 ? 's' : ''}</Text>
            </View>
          )}
        </View>

        {/* Daily macro summary */}
        {(selectedLogs.length > 0 || selectedIsToday) && (
          <View style={styles.dailySummaryCard} key="daily-summary">
            {/* Calorie ring + breakdown */}
            <View style={styles.summaryTop}>
              <View style={styles.calRingWrap}>
                <Svg width={80} height={80}>
                  <SvgCircle cx={40} cy={40} r={32} stroke={C.bgSecondary} strokeWidth={7} fill="none" />
                  <SvgCircle
                    cx={40} cy={40} r={32}
                    stroke={selectedDayTotals.calories > goals.calories ? C.scoreLow : C.energy}
                    strokeWidth={7} fill="none"
                    strokeDasharray={`${2 * Math.PI * 32}`}
                    strokeDashoffset={`${2 * Math.PI * 32 * (1 - Math.min(1, selectedDayTotals.calories / goals.calories))}`}
                    strokeLinecap="round"
                    transform="rotate(-90 40 40)"
                  />
                </Svg>
                <View style={styles.calRingCenter}>
                  <Text style={styles.calRingValue}>{selectedDayTotals.calories}</Text>
                  <Text style={styles.calRingLabel}>/{goals.calories}</Text>
                </View>
              </View>
              <View style={styles.macroBarsList}>
                {renderMacroBar('Protein', selectedDayTotals.protein, goals.protein, C.primary)}
                {renderMacroBar('Carbs', selectedDayTotals.carbs, goals.carbs, C.vitality)}
                {renderMacroBar('Fats', selectedDayTotals.fats, goals.fats, C.energy)}
              </View>
            </View>
            {/* Avg vitality for day */}
            {(() => {
              const avg = getDayAvgScore(selectedLogs);
              if (avg === null) return null;
              const color = getScoreColor(avg);
              const organAvgs = getDayOrganAvgs(selectedLogs);
              return (
                <View>
                  <TouchableOpacity 
                    activeOpacity={0.8}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setOrganDropdownVisible(!organDropdownVisible);
                    }}
                    style={[styles.avgVitalityStrip, { borderColor: color + '40', backgroundColor: color + '10' }]}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={styles.avgVitalityLabel}>Avg Vitality</Text>
                      {organAvgs.length > 0 && <CaretDown size={14} weight="bold" color={C.textTertiary} style={{ marginLeft: 6, transform: [{ rotate: organDropdownVisible ? '180deg' : '0deg' }] }} />}
                    </View>
                    <Text style={[styles.avgVitalityValue, { color }]}>{(avg ?? 0).toFixed(1)}/10</Text>
                  </TouchableOpacity>
                  {organDropdownVisible && organAvgs.length > 0 && (
                    <View style={{ marginTop: 8, gap: 6, paddingHorizontal: 4 }}>
                      {organAvgs.map(o => (
                        <View key={o.organ} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: C.bgSecondary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 }}>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: C.textPrimary }}>{o.organ}</Text>
                          <Text style={{ fontSize: 13, fontWeight: '800', color: getScoreColor(o.avg) }}>{o.avg.toFixed(1)}/10</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              );
            })()}
          </View>
        )}

        {/* 7-day vitality trend */}
        {renderVitalityTrendChart()}

        {/* 7-day glucose & insulin insight */}
        {renderGlucoseInsightChart()}

        {selectedLogs.length === 0 ? null : (
          <Text style={styles.sectionDividerText}>MEALS</Text>
        )}
      </View>
    );
  };

  return (
    <ScreenEnterAnimation>
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Image source={require('../../assets/logo.png')} style={styles.logo} resizeMode="contain" />
          <TouchableOpacity
            style={[styles.headerActionBtn, { marginLeft: 20 }]}
            onPress={() => { Haptics.selectionAsync(); setManualModalVisible(true); }}
          >
            <Plus size={20} weight="bold" color={C.primary} />
          </TouchableOpacity>
        </View>
        <Text style={styles.title}>Daily Log</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.todayBtn}
            onPress={() => {
              Haptics.selectionAsync();
              setSelectedDate(new Date());
              setCalendarMonth(new Date(today.getFullYear(), today.getMonth(), 1));
            }}
          >
            <Text style={styles.todayBtnText}>Today</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerActionBtn}
            onPress={handleShareLogs}
          >
            <ShareNetwork size={18} weight="bold" color={C.textPrimary} />
          </TouchableOpacity>
        </View>
      </View>

      <Modal
        visible={manualModalVisible}
        animationType="slide"
        transparent
        statusBarTranslucent
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalContent}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Quick Log Meal</Text>
              <TouchableOpacity onPress={() => setManualModalVisible(false)} style={{ padding: 4 }}>
                <Text style={styles.modalCancel}>Cancel</Text>
              </TouchableOpacity>
            </View>
            
            <RNScrollView 
              style={styles.modalBody} 
              contentContainerStyle={{ paddingBottom: 80 }}
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.inputLabel}>WHAT DID YOU EAT?</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Grilled Chicken Salad"
                placeholderTextColor={C.textTertiary}
                value={manualFoodName}
                onChangeText={setManualFoodName}
                autoFocus={true}
              />
              
              <Text style={styles.inputLabel}>QUANTITY / PORTION</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. 250g or 1 bowl"
                placeholderTextColor={C.textTertiary}
                value={manualQuantity}
                onChangeText={setManualQuantity}
              />
              
              <View style={styles.aiNotice}>
                <Sparkle size={14} weight="fill" color={C.primary} />
                <Text style={styles.aiNoticeText}>Nouriva AI will estimate macros and health scores automatically.</Text>
              </View>

              <TouchableOpacity 
                style={[styles.saveBtn, (!manualFoodName.trim() || isAnalyzing) && { opacity: 0.5 }]} 
                onPress={handleManualAdd}
                disabled={!manualFoodName.trim() || isAnalyzing}
              >
                {isAnalyzing ? (
                  <View style={styles.saveBtnLoadingContent}>
                    <ActivityIndicator color="#FFF" size="small" />
                    <Text style={styles.saveBtnText}>Analyzing {manualAnalysisProgress}%</Text>
                  </View>
                ) : (
                  <Text style={styles.saveBtnText}>Analyze & Log Meal</Text>
                )}
              </TouchableOpacity>
            </RNScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={C.primary} /></View>
      ) : (
        <FlatList
          data={selectedLogs}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={renderListHeader()}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
          ListEmptyComponent={
            <View style={styles.emptyDay}>
              <View style={styles.emptyDayIcon}>
                <HistoryIcon size={28} weight="bold" color={C.textTertiary} />
              </View>
              <Text style={styles.emptyDayText}>No meals logged for this day</Text>
              {selectedIsToday && (
                <>
                  <Text style={styles.emptyDaySub}>Scan your first meal to start tracking</Text>
                  <TouchableOpacity 
                    style={styles.emptyLogBtn} 
                    onPress={() => {
                      Haptics.selectionAsync();
                      navigation.navigate('Scan', { openCamera: true });
                    }}
                  >
                    <Camera size={18} weight="bold" color="#FFF" />
                    <Text style={styles.emptyLogBtnText}>Log Food</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          }
        />
      )}

      {/* Daily Log Share Modal */}
      <Modal visible={shareModalVisible} transparent animationType="slide" onRequestClose={() => setShareModalVisible(false)}>
        <View style={styles.shareOverlay}>
          <View style={styles.shareSheet}>
            <View style={styles.shareSheetHandle} />
            <View style={styles.shareSheetHeader}>
              <Text style={styles.shareSheetTitle}>Share Daily Log</Text>
              <TouchableOpacity onPress={() => setShareModalVisible(false)} style={styles.shareCloseBtn}>
                <X size={16} weight="bold" color={C.textTertiary} />
              </TouchableOpacity>
            </View>

            <ViewShot ref={shareCardRef} options={{ format: 'png', quality: 1.0 }} style={styles.shareCardWrapper}>
              <View style={styles.shareCard}>
                {/* Header */}
                <View style={styles.shareCardHeader}>
                  <Image source={require('../../assets/logo.png')} style={styles.shareCardLogo} />
                  <Text style={styles.shareCardBrand}>Nouriva AI</Text>
                  <Text style={styles.shareCardTagline}>Daily Nutrition</Text>
                </View>

                {/* Date + score hero */}
                <View style={styles.shareCardHero}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.shareCardDate}>
                      {selectedDate.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
                    </Text>
                    <Text style={styles.shareCardMealCount}>
                      {selectedLogs.length} meal{selectedLogs.length !== 1 ? 's' : ''} logged
                    </Text>
                  </View>
                  {(() => {
                    const avg = getDayAvgScore(selectedLogs);
                    if (avg == null) return null;
                    const scoreNum = parseFloat(avg.toFixed(1));
                    const scoreColor = scoreNum >= 7 ? '#10B981' : scoreNum >= 4.5 ? '#F59E0B' : '#EF4444';
                    const radius = 28;
                    const circumference = 2 * Math.PI * radius;
                    const progress = Math.min(scoreNum / 10, 1);
                    return (
                      <View style={styles.shareCardScoreRing}>
                        <Svg width={72} height={72}>
                          <SvgCircle cx={36} cy={36} r={radius} stroke={C.bgSecondary} strokeWidth={5} fill="none" />
                          <SvgCircle
                            cx={36} cy={36} r={radius}
                            stroke={scoreColor} strokeWidth={5} fill="none"
                            strokeDasharray={`${circumference}`}
                            strokeDashoffset={`${circumference * (1 - progress)}`}
                            strokeLinecap="round"
                            transform="rotate(-90 36 36)"
                          />
                        </Svg>
                        <View style={styles.shareCardScoreInner}>
                          <Text style={[styles.shareCardScoreVal, { color: scoreColor }]}>{scoreNum.toFixed(1)}</Text>
                          <Text style={styles.shareCardScoreLbl}>avg</Text>
                        </View>
                      </View>
                    );
                  })()}
                </View>

                {/* Macros strip */}
                <View style={styles.shareCardMacros}>
                  {[
                    { label: 'Cal', value: String(selectedDayTotals.calories) },
                    { label: 'Protein', value: `${selectedDayTotals.protein}g` },
                    { label: 'Carbs', value: `${selectedDayTotals.carbs}g` },
                    { label: 'Fats', value: `${selectedDayTotals.fats}g` },
                  ].map(({ label, value }) => (
                    <View key={label} style={styles.shareCardMacroItem}>
                      <Text style={styles.shareCardMacroValue}>{value}</Text>
                      <Text style={styles.shareCardMacroLabel}>{label}</Text>
                    </View>
                  ))}
                </View>

                {/* Meal list */}
                {selectedLogs.slice(0, 6).length > 0 && (
                  <View style={styles.shareCardMeals}>
                    {selectedLogs.slice(0, 6).map((log, i) => {
                      const scoreNum = log.vitality_score;
                      const scoreColor = scoreNum >= 7 ? '#10B981' : scoreNum >= 4.5 ? '#F59E0B' : '#EF4444';
                      return (
                        <View key={log.id ?? i} style={styles.shareCardMealRow}>
                          <Text style={styles.shareCardMealName} numberOfLines={1}>{log.food_name}</Text>
                          <Text style={[styles.shareCardMealScore, { color: scoreColor }]}>{scoreNum.toFixed(1)}/10</Text>
                        </View>
                      );
                    })}
                    {selectedLogs.length > 6 && (
                      <Text style={styles.shareCardMoreMeals}>+{selectedLogs.length - 6} more</Text>
                    )}
                  </View>
                )}

                {/* Organ averages */}
                {(() => {
                  const organAvgs = getDayOrganAvgs(selectedLogs).slice(0, 6);
                  if (!organAvgs.length) return null;
                  return (
                    <View style={styles.shareCardOrgans}>
                      {organAvgs.map((o: any) => {
                        const scoreNum = Number(o.avg || 0);
                        const color = scoreNum >= 7 ? '#10B981' : scoreNum >= 4.5 ? '#F59E0B' : '#EF4444';
                        return (
                          <View key={o.organ} style={styles.shareCardOrganItem}>
                            <Text style={[styles.shareCardOrganScore, { color }]}>{scoreNum.toFixed(1)}</Text>
                            <Text style={styles.shareCardOrganName}>{o.organ}</Text>
                          </View>
                        );
                      })}
                    </View>
                  );
                })()}

                {/* Footer */}
                <View style={styles.shareCardFooter}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.shareCardFooterBrand}>Nouriva AI</Text>
                    <Text style={styles.shareCardFooterTag}>Precision Metabolic Analysis</Text>
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

            <TouchableOpacity style={styles.shareActionBtn} onPress={handleShareCapture} activeOpacity={0.88} disabled={sharingImage}>
              {sharingImage
                ? <ActivityIndicator color="#FFF" />
                : <><ShareNetwork size={18} color="#FFF" weight="bold" /><Text style={styles.shareActionText}>Share Image</Text></>
              }
            </TouchableOpacity>

            <TouchableOpacity style={styles.shareTextBtn} onPress={handleShareAsText} activeOpacity={0.75}>
              <Text style={styles.shareTextBtnLabel}>Share as Text</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
    </ScreenEnterAnimation>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingVertical: 12,
      backgroundColor: C.navBar, borderBottomWidth: 1, borderBottomColor: C.navBorder,
    },
    headerLeft: { width: 100, flexDirection: 'row', alignItems: 'center' },
    logo: { width: 32, height: 32, borderRadius: 8 },
    headerRight: { width: 100, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8 },
    headerActionBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: C.bgSecondary, justifyContent: 'center', alignItems: 'center' },
    title: { fontSize: 17, fontWeight: '800', color: C.textPrimary, flex: 1, textAlign: 'center' },
    todayBtn: { paddingHorizontal: 12, paddingVertical: 7, backgroundColor: C.primaryMuted, borderRadius: 10 },
    todayBtnText: { fontSize: 12, fontWeight: '700', color: C.primary },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    listContent: { padding: 16, paddingBottom: 40 },

    // Calendar card
    calendarCard: {
      backgroundColor: C.surface, borderRadius: 22, padding: 16, marginBottom: 14,
      borderWidth: 1, borderColor: C.border,
      shadowColor: C.shadowColor, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12,
    },
    calendarHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    monthLabel: { fontSize: 16, fontWeight: '800', color: C.textPrimary },
    toggleGroup: { flexDirection: 'row', backgroundColor: C.bgSecondary, borderRadius: 10, padding: 2 },
    toggleBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8 },
    toggleBtnActive: { backgroundColor: C.surface, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 1 },
    toggleText: { fontSize: 11, fontWeight: '700', color: C.textTertiary },
    toggleTextActive: { color: C.primary },
    
    sliderContainer: { position: 'relative' },
    monthlyContainer: { marginTop: 4 },
    monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    monthNavBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: C.bgSecondary, justifyContent: 'center', alignItems: 'center' },
    monthNavLabel: { fontSize: 14, fontWeight: '700', color: C.textPrimary },
    dowRow: { flexDirection: 'row', marginBottom: 8 },
    dowLabel: { flex: 1, textAlign: 'center', fontSize: 10, fontWeight: '700', color: C.textTertiary },
    calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
    dayCell: { width: `${100 / 7}%` as any, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
    dayCellSelected: { backgroundColor: C.primary, borderRadius: 10 },
    dayCellToday: { borderRadius: 10, borderWidth: 1.5, borderColor: C.primary },
    dayNum: { fontSize: 13, fontWeight: '600', color: C.textPrimary },
    dayNumSelected: { color: '#FFF', fontWeight: '800' },
    dayNumToday: { color: C.primary, fontWeight: '800' },
    dayNumFuture: { color: C.textTertiary },

    // Day Slider
    dayStripContent: { paddingHorizontal: 24, gap: 10, alignItems: 'center' },
    sliderHintLeft: {
      position: 'absolute',
      left: 8,
      top: 0, bottom: 0,
      justifyContent: 'center',
      zIndex: 10,
      pointerEvents: 'none',
    },
    stripDayCell: {
      width: 48,
      height: 64,
      borderRadius: 14,
      backgroundColor: C.bgSecondary,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
    },
    stripDayCellSelected: {
      backgroundColor: C.primary,
      shadowColor: C.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 4,
    },
    stripDayCellToday: {
      borderWidth: 1.5,
      borderColor: C.primary,
      backgroundColor: C.surface,
    },
    stripDayName: { fontSize: 10, fontWeight: '700', color: C.textTertiary, textTransform: 'uppercase' },
    stripDayNameSelected: { color: 'rgba(255,255,255,0.8)' },
    stripDayNum: { fontSize: 16, fontWeight: '800', color: C.textPrimary },
    stripDayNumSelected: { color: '#FFF' },
    stripDayNumToday: { color: C.primary },
    dayDot: { width: 5, height: 5, borderRadius: 2.5, marginTop: 2 },
    dayDotEmpty: { width: 5, height: 5, marginTop: 2 },

    // Selected day header
    selectedDayHeader: {
      flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12,
    },
    selectedDayLabel: { fontSize: 15, fontWeight: '800', color: C.textPrimary, flex: 1 },
    mealCountBadge: { backgroundColor: C.primaryMuted, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
    mealCountText: { fontSize: 11, fontWeight: '700', color: C.primary },

    // Daily summary card
    dailySummaryCard: {
      backgroundColor: C.surface, borderRadius: 20, padding: 16, marginBottom: 14,
      borderWidth: 1, borderColor: C.border,
      shadowColor: C.shadowColor, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.04, shadowRadius: 10,
    },
    summaryTop: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 12 },
    calRingWrap: { width: 80, height: 80, justifyContent: 'center', alignItems: 'center' },
    calRingCenter: { position: 'absolute', alignItems: 'center' },
    calRingValue: { fontSize: 16, fontWeight: '900', color: C.textPrimary },
    calRingLabel: { fontSize: 8, fontWeight: '700', color: C.textTertiary, marginTop: 1 },
    macroBarsList: { flex: 1, gap: 8 },
    macroBarItem: { gap: 4 },
    macroBarHeader: { flexDirection: 'row', justifyContent: 'space-between' },
    macroBarLabel: { fontSize: 10, fontWeight: '700', color: C.textTertiary },
    macroBarValue: { fontSize: 10, fontWeight: '800' },
    macroBarGoal: { fontSize: 9, fontWeight: '500', color: C.textTertiary },
    macroBarTrack: { height: 5, backgroundColor: C.bgSecondary, borderRadius: 3, overflow: 'hidden' },
    macroBarFill: { height: 5, borderRadius: 3 },
    avgVitalityStrip: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      borderRadius: 12, borderWidth: 1, paddingVertical: 9, paddingHorizontal: 14,
    },
    avgVitalityLabel: { fontSize: 12, fontWeight: '700', color: C.textSecondary },
    avgVitalityValue: { fontSize: 15, fontWeight: '900' },

    // Trend chart
    chartCard: {
      backgroundColor: C.surface, borderRadius: 20, padding: 16, marginBottom: 14,
      borderWidth: 1, borderColor: C.border,
      shadowColor: C.shadowColor, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.04, shadowRadius: 8,
    },
    cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
    cardHeaderText: { fontSize: 12, fontWeight: '800', color: C.textPrimary, textTransform: 'uppercase', letterSpacing: 0.8 },
    sectionDividerText: { fontSize: 10, fontWeight: '800', color: C.textTertiary, letterSpacing: 1.5, marginBottom: 10, marginLeft: 2 },

    // Log card
    logCard: {
      flexDirection: 'row', backgroundColor: C.surface, borderRadius: 16, padding: 12,
      marginBottom: 10, alignItems: 'center',
      shadowColor: C.shadowColor, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6,
      elevation: 2, borderWidth: 1, borderColor: C.border,
    },
    logImageContainer: { width: 58, height: 58, borderRadius: 12, backgroundColor: C.bgSecondary, overflow: 'hidden' },
    logImage: { width: '100%', height: '100%' },
    placeholderImage: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    logInfo: { flex: 1, marginLeft: 12 },
    foodName: { fontSize: 14, fontWeight: '700', color: C.textPrimary, marginBottom: 3 },
    timeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    timeText: { fontSize: 11, color: C.textTertiary },
    logStatsRow: { flexDirection: 'row', marginTop: 6, gap: 5, flexWrap: 'wrap' },
    logStatItem: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: C.bgSecondary, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, gap: 3,
    },
    logStatText: { fontSize: 10, fontWeight: '700', color: C.textSecondary },
    logCardRight: { alignItems: 'center', justifyContent: 'center', gap: 2 },
    scoreBadge: { width: 46, height: 46, borderRadius: 23, justifyContent: 'center', alignItems: 'center' },
    scoreValue: { fontSize: 15, fontWeight: '800' },

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
    
    deleteBtn: { padding: 4, marginRight: 4 },
    
    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalContent: {
      backgroundColor: C.bg,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingTop: 16,
      maxHeight: '92%',
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
    },
    modalTitle: { fontSize: 18, fontWeight: '800', color: C.textPrimary },
    modalCancel: { fontSize: 14, fontWeight: '600', color: C.textTertiary },
    modalBody: { padding: 20 },
    inputLabel: { fontSize: 10, fontWeight: '800', color: C.textTertiary, letterSpacing: 1, marginBottom: 8 },
    textInput: {
      backgroundColor: C.bgSecondary,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
      fontSize: 15,
      color: C.textPrimary,
      marginBottom: 20,
    },
    inputRow: { flexDirection: 'row' },
    saveBtn: {
      backgroundColor: C.primary,
      borderRadius: 14,
      paddingVertical: 16,
      alignItems: 'center',
      marginTop: 10,
      marginBottom: 30,
    },
    saveBtnLoadingContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    saveBtnText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
    aiNotice: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.primaryMuted, padding: 12, borderRadius: 12, marginBottom: 20 },
    aiNoticeText: { fontSize: 12, color: C.primary, fontWeight: '600', flex: 1 },

    // Share modal
    shareOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
    shareSheet: {
      backgroundColor: C.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24,
      padding: 20, paddingBottom: 36,
    },
    shareSheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.border, alignSelf: 'center', marginBottom: 16 },
    shareSheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    shareSheetTitle: { fontSize: 18, fontWeight: '800', color: C.textPrimary },
    shareCloseBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.bgSecondary, justifyContent: 'center', alignItems: 'center' },
    shareCardWrapper: { borderRadius: 20, overflow: 'hidden', marginBottom: 16 },
    shareCard: { backgroundColor: C.surface, borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: C.border },
    shareCardHeader: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 8, backgroundColor: C.bg, borderBottomWidth: 1, borderBottomColor: C.border },
    shareCardLogo: { width: 22, height: 22, borderRadius: 6 },
    shareCardBrand: { fontSize: 14, fontWeight: '900', color: C.primary },
    shareCardTagline: { fontSize: 10, color: C.textTertiary, fontWeight: '600', marginLeft: 'auto' as any },
    shareCardHero: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 14 },
    shareCardDate: { fontSize: 15, fontWeight: '800', color: C.textPrimary, marginBottom: 4 },
    shareCardMealCount: { fontSize: 12, color: C.textSecondary, fontWeight: '600' },
    shareCardScoreRing: { position: 'relative', width: 72, height: 72, justifyContent: 'center', alignItems: 'center' },
    shareCardScoreInner: { position: 'absolute', alignItems: 'center' },
    shareCardScoreVal: { fontSize: 16, fontWeight: '900', lineHeight: 19 },
    shareCardScoreLbl: { fontSize: 8, color: C.textTertiary, fontWeight: '700', textTransform: 'uppercase' },
    shareCardMacros: { flexDirection: 'row', backgroundColor: C.bgSecondary, paddingVertical: 10, paddingHorizontal: 14, gap: 0 },
    shareCardMacroItem: { flex: 1, alignItems: 'center' },
    shareCardMacroValue: { fontSize: 14, fontWeight: '800', color: C.textPrimary },
    shareCardMacroLabel: { fontSize: 9, color: C.textTertiary, fontWeight: '600', marginTop: 2 },
    shareCardMeals: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 4 },
    shareCardMealRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: C.borderSubtle },
    shareCardMealName: { flex: 1, fontSize: 12, fontWeight: '600', color: C.textPrimary, marginRight: 8 },
    shareCardMealScore: { fontSize: 12, fontWeight: '800' },
    shareCardMoreMeals: { fontSize: 10, color: C.textTertiary, fontWeight: '600', paddingTop: 6, textAlign: 'center' },
    shareCardOrgans: { flexDirection: 'row', flexWrap: 'wrap', padding: 12, gap: 8 },
    shareCardOrganItem: { alignItems: 'center', width: '30%' as any, backgroundColor: C.bgSecondary, borderRadius: 10, paddingVertical: 8 },
    shareCardOrganScore: { fontSize: 16, fontWeight: '900' },
    shareCardOrganName: { fontSize: 9, color: C.textTertiary, fontWeight: '600', marginTop: 2 },
    shareCardFooter: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingHorizontal: 14, paddingVertical: 12,
      backgroundColor: C.bgSecondary, borderTopWidth: 1, borderTopColor: C.border,
    },
    shareCardFooterBrand: { fontSize: 14, fontWeight: '900', color: C.primary, marginBottom: 2 },
    shareCardFooterTag: { fontSize: 9, color: C.textTertiary, fontWeight: '700', textTransform: 'uppercase' },
    shareCardQR: { alignItems: 'center', gap: 4 },
    shareCardQRInner: {
      width: 44, height: 44, borderRadius: 8,
      backgroundColor: '#FFF', justifyContent: 'center', alignItems: 'center', padding: 4,
    },
    shareCardQRText: { fontSize: 7, fontWeight: '800', color: C.textTertiary },
    shareActionBtn: {
      backgroundColor: C.primary, borderRadius: 16, paddingVertical: 16,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    },
    shareActionText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
    shareTextBtn: { alignItems: 'center', paddingVertical: 14 },
    shareTextBtnLabel: { fontSize: 14, color: C.textTertiary, fontWeight: '600' },
  });
}
