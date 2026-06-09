import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  TextInput,
  ActivityIndicator,
  Image,
  Platform,
  ActionSheetIOS,
  Share,
  Modal,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  UserIcon as User,
  GearSixIcon as GearSix,
  BellIcon as Bell,
  ShieldIcon as Shield,
  SignOutIcon as SignOut,
  CaretRightIcon as CaretRight,
  HeartIcon as Heart,
  PulseIcon as Pulse,
  PencilSimpleIcon as PencilSimple,
  PlusIcon as Plus,
  XIcon,
  FileTextIcon as FileText,
  UploadIcon as Upload,
  TrashIcon as Trash,
  TargetIcon as Target,
  MoonIcon as Moon,
  SunIcon as Sun,
  CameraIcon as Camera,
  ShareNetworkIcon as ShareNetwork,
  CalculatorIcon as Calculator,
  QuestionIcon as Question,
  LightningIcon as Lightning,
  DnaIcon as Dna,
  BarbellIcon as Barbell,
  DropIcon as Drop,
  GrainsIcon as Grains,
  LockSimpleIcon as LockSimple,
} from 'phosphor-react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import ClinicalSelector from '../components/ClinicalSelector';
import * as DocumentPicker from 'expo-document-picker';
import { analyzeMedicalReport } from '../utils/reports';
import { useColors, useTheme, AppColors } from '../theme';
import { useFocusEffect, useRoute } from '@react-navigation/native';
import { ScreenEnterAnimation } from '../components/ScreenEnterAnimation';
import { supabase } from '../utils/supabase';
import { getFoodLogs } from '../utils/history';
import { getDailyGoals, saveDailyGoals, DailyGoals } from '../utils/goals';
import { loadUserProfile, saveUserProfile } from '../utils/userProfile';
import {
  readProfileHeaderCache,
  writeProfileHeaderCache,
  clearProfileHeaderCache,
  computeStatsFromLogs,
} from '../utils/profileHeaderCache';
import { generateAndShareWeeklyReport } from '../utils/weeklyReport';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import * as Haptics from 'expo-haptics';
import {
  getStoredAvatarUri,
  getCachedRemoteAvatarUrl,
  setCachedRemoteAvatarUrl,
  pickAvatarFromLibrary,
  takeAvatarSelfie,
  uploadAvatarToCloud,
  removeAvatarEverywhere,
  clearAvatarLocalOnLogout,
} from '../utils/profileAvatar';
import * as Linking from 'expo-linking';
import { clearBiometricLoginSnapshot } from '../utils/biometricLogin';
import { signOutCompletely } from '../utils/authRecovery';
import { navigateFromTabs } from '../navigation/rootNavigation';
import { requestHealthPermissions, fetchLatestWeightKg, getHealthDebugInfo } from '../utils/health';
import {
  computeDailyGoalsFromMetabolicInputs,
  computeTargetCaloriesFromMetabolicInputs,
  dailyMacrosFromCalories,
  METABOLIC_INPUTS_KEY,
  ACTIVITY_LABELS,
  GOAL_LABELS,
  parseMetabolicInputs,
  type ActivityKey,
  type CalorieGoalMode,
  type Sex,
  type MetabolicInputs,
} from '../utils/tdee';
import { computeDietaryAge, type DietaryAgeResult } from '../utils/longevity';
import DietaryAgeCard from '../components/DietaryAgeCard';
import LongevityShareSheet from '../components/LongevityShareSheet';

interface ProfileScreenProps {
  navigation: any;
}

/** Default age in Smart goals when metabolic inputs were never applied; must match dietary-age fallback in `loadProfileData`. */
const DEFAULT_SMART_GOALS_AGE = 35;

/** Vitality is scored /10; tie colors to the same bands used elsewhere in the app. */
function colorForAvgVitality(avg: string, C: AppColors): string | undefined {
  if (avg === '—') return C.textTertiary;
  const n = parseFloat(avg);
  if (Number.isNaN(n)) return undefined;
  if (n >= 7) return C.scoreHigh;
  if (n >= 4) return C.scoreMid;
  return C.scoreLow;
}

export default function ProfileScreen({ navigation }: ProfileScreenProps) {
  const route = useRoute<any>();
  const scrollRef = useRef<ScrollView>(null);
  const personalizationAnchorY = useRef(0);
  const C = useColors();
  const { isDark, setThemeOverride, themeOverride } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);

  const [biometricsEnabled, setBiometricsEnabled] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [healthContext, setHealthContext] = useState('');
  const [medicalConditions, setMedicalConditions] = useState<string[]>([]);
  const [reportInsights, setReportInsights] = useState('');
  const [isAnalyzingReport, setIsAnalyzingReport] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [selectorVisible, setSelectorVisible] = useState(false);
  const [isPro, setIsPro] = useState(false);
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [scanCount, setScanCount] = useState(0);
  const [avgVitality, setAvgVitality] = useState('—');
  const [streak, setStreak] = useState(0);
  const [goals, setGoals] = useState<DailyGoals>({ calories: 2000, protein: 150, carbs: 250, fats: 65 });
  const [editingGoals, setEditingGoals] = useState(false);
  const [goalsInput, setGoalsInput] = useState({ calories: '2000', protein: '150', carbs: '250', fats: '65' });
  /** True after cache read and fresh load — avoids placeholder name/email/stats flash. */
  const [headerHydrated, setHeaderHydrated] = useState(false);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [healthSyncBusy, setHealthSyncBusy] = useState(false);
  const [healthConnected, setHealthConnected] = useState(false);
  const [tdeeModalVisible, setTdeeModalVisible] = useState(false);
  const [tdeeWeightLoading, setTdeeWeightLoading] = useState(false);
  const [tdeeSex, setTdeeSex] = useState<Sex>('male');
  const [tdeeAge, setTdeeAge] = useState(String(DEFAULT_SMART_GOALS_AGE));
  const [tdeeHeightCm, setTdeeHeightCm] = useState('175');
  const [tdeeWeightKg, setTdeeWeightKg] = useState('75');
  const [tdeeActivity, setTdeeActivity] = useState<ActivityKey>('moderate');
  const [tdeeGoal, setTdeeGoal] = useState<CalorieGoalMode>('mild_loss');
  const [dietaryAgeResult, setDietaryAgeResult] = useState<DietaryAgeResult | null>(null);
  const [longevityShareVisible, setLongevityShareVisible] = useState(false);
  const [scienceModalVisible, setScienceModalVisible] = useState(false);

  const tdeeWeightKgNumber = useMemo(() => {
    const w = parseFloat(String(tdeeWeightKg).replace(',', '.'));
    return Number.isFinite(w) && w >= 30 && w <= 300 ? w : null;
  }, [tdeeWeightKg]);

  /** Preview macros (30/30/40) from current TDEE form — must match `computeDailyGoalsFromMetabolicInputs`. */
  const tdeeMacroPreview = useMemo(() => {
    if (tdeeWeightKgNumber == null) return null;
    const age = parseInt(tdeeAge, 10);
    const h = parseFloat(String(tdeeHeightCm).replace(',', '.'));
    if (!Number.isFinite(age) || age < 10 || age > 120 || !Number.isFinite(h) || h < 100 || h > 250) {
      return null;
    }
    const input: MetabolicInputs = {
      sex: tdeeSex,
      ageYears: age,
      heightCm: h,
      weightKg: tdeeWeightKgNumber,
      activity: tdeeActivity,
      calorieGoal: tdeeGoal,
    };
    const cal = computeTargetCaloriesFromMetabolicInputs(input);
    return { cal, ...dailyMacrosFromCalories(cal) };
  }, [tdeeWeightKgNumber, tdeeSex, tdeeAge, tdeeHeightCm, tdeeActivity, tdeeGoal, tdeeWeightKg]);

  const persistHeaderSnapshot = async (name: string, email: string, logs: Awaited<ReturnType<typeof getFoodLogs>>) => {
    const stats = computeStatsFromLogs(logs);
    await writeProfileHeaderCache({ userName: name, userEmail: email, ...stats });
  };

  useFocusEffect(
    useCallback(() => {
      if (route.params?.scrollToSection !== 'personalization') return undefined;
      const t = setTimeout(() => {
        scrollRef.current?.scrollTo({
          y: Math.max(0, personalizationAnchorY.current - 24),
          animated: true,
        });
        navigation.setParams({ scrollToSection: undefined } as any);
      }, 450);
      return () => clearTimeout(t);
    }, [route.params?.scrollToSection, navigation]),
  );

  useFocusEffect(
    useCallback(() => {
      if (route.params?.scrollToSection !== 'personalization') return undefined;
      const t = setTimeout(() => {
        scrollRef.current?.scrollTo({
          y: Math.max(0, personalizationAnchorY.current - 24),
          animated: true,
        });
        navigation.setParams({ scrollToSection: undefined } as any);
      }, 480);
      return () => clearTimeout(t);
    }, [route.params?.scrollToSection, navigation]),
  );

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          const cached = await readProfileHeaderCache();
          if (!cancelled && cached) {
            setUserName(cached.userName);
            setUserEmail(cached.userEmail);
            setScanCount(cached.scanCount);
            setAvgVitality(cached.avgVitality);
            setStreak(cached.streak);
            setHeaderHydrated(true);
          }
        } catch (e) {
          console.error(e);
        }
        await loadProfileData();
        if (!cancelled) setHeaderHydrated(true);
      })();
      return () => {
        cancelled = true;
      };
    }, [])
  );

  useEffect(() => {
    setAvatarLoadFailed(false);
  }, [avatarUri]);

  const loadProfileData = async () => {
    // Device preferences (notif, biometrics) stay in SecureStore only
    try {
      const [notifPref, bioPref] = await Promise.all([
        SecureStore.getItemAsync('notificationsEnabled'),
        SecureStore.getItemAsync('biometricsEnabled'),
      ]);
      if (notifPref !== null) setNotificationsEnabled(notifPref === 'true');
      if (bioPref !== null) setBiometricsEnabled(bioPref === 'true');
    } catch (e) { console.error(e); }

    let remote: Awaited<ReturnType<typeof loadUserProfile>> = null;
    try {
      remote = await loadUserProfile();
    } catch (e) {
      console.error(e);
    }

    let resolvedAge = DEFAULT_SMART_GOALS_AGE;
    let localMeta: MetabolicInputs | null = null;
    try {
      const rawMeta = await SecureStore.getItemAsync(METABOLIC_INPUTS_KEY);
      if (rawMeta) localMeta = parseMetabolicInputs(JSON.parse(rawMeta));
    } catch {
      /* ignore */
    }
    const remoteMeta = remote?.metabolic_inputs ? parseMetabolicInputs(remote.metabolic_inputs) : null;
    const chosenMeta = remoteMeta ?? localMeta;
    if (chosenMeta) {
      setTdeeSex(chosenMeta.sex);
      setTdeeAge(String(chosenMeta.ageYears));
      setTdeeHeightCm(String(Math.round(chosenMeta.heightCm)));
      setTdeeWeightKg(String(chosenMeta.weightKg));
      setTdeeActivity(chosenMeta.activity);
      setTdeeGoal(chosenMeta.calorieGoal);
      if (Number.isFinite(chosenMeta.ageYears) && chosenMeta.ageYears > 0) {
        resolvedAge = chosenMeta.ageYears;
      }
      if (remoteMeta) {
        try {
          await SecureStore.setItemAsync(METABOLIC_INPUTS_KEY, JSON.stringify(chosenMeta));
        } catch {
          /* ignore */
        }
      }
    }

    computeDietaryAge(resolvedAge)
      .then((result) => {
        if (result) setDietaryAgeResult(result);
      })
      .catch(() => { /* non-fatal */ });

    try {
      if (remote) {
        if (typeof remote.is_pro === 'boolean') {
          console.log('[Profile] Setting isPro from Supabase:', remote.is_pro);
          setIsPro(remote.is_pro);
          await SecureStore.setItemAsync('isPro', remote.is_pro ? 'true' : 'false');
        } else {
          const proPref = await SecureStore.getItemAsync('isPro');
          console.log('[Profile] Setting isPro from SecureStore:', proPref === 'true');
          if (proPref !== null) setIsPro(proPref === 'true');
        }
        if (typeof remote.health_sync_enabled === 'boolean') {
          setHealthConnected(remote.health_sync_enabled);
          await SecureStore.setItemAsync('healthSyncEnabled', remote.health_sync_enabled ? 'true' : 'false');
        } else {
          // Row exists but flag unset (NULL / legacy): do not reuse another account's SecureStore value.
          setHealthConnected(false);
          await SecureStore.setItemAsync('healthSyncEnabled', 'false');
        }
        if (remote.health_context) setHealthContext(remote.health_context);
        if (remote.medical_conditions) setMedicalConditions(remote.medical_conditions);
        if (remote.report_insights) setReportInsights(remote.report_insights);
        if (remote.daily_goals) {
          setGoals(remote.daily_goals);
          setGoalsInput({ calories: String(remote.daily_goals.calories), protein: String(remote.daily_goals.protein), carbs: String(remote.daily_goals.carbs), fats: String(remote.daily_goals.fats) });
        }
        const localAvatar = await getStoredAvatarUri();
        if (localAvatar) {
          setAvatarUri(localAvatar);
        } else if (remote.avatar_url) {
          setAvatarUri(remote.avatar_url);
          void setCachedRemoteAvatarUrl(remote.avatar_url);
        } else {
          const cachedRemote = await getCachedRemoteAvatarUrl();
          if (cachedRemote) setAvatarUri(cachedRemote);
        }
      } else {
        // Offline fallback (no Supabase row or not signed in)
        const [proPref, healthPref, ctx, conds, insights] = await Promise.all([
          SecureStore.getItemAsync('isPro'),
          SecureStore.getItemAsync('healthSyncEnabled'),
          SecureStore.getItemAsync('healthContext'),
          SecureStore.getItemAsync('medicalConditions'),
          SecureStore.getItemAsync('reportInsights'),
        ]);
        if (proPref !== null) setIsPro(proPref === 'true');
        if (healthPref === 'true') setHealthConnected(true);
        if (ctx) setHealthContext(ctx);
        if (conds) setMedicalConditions(JSON.parse(conds));
        if (insights) setReportInsights(insights);
        const g = await getDailyGoals();
        setGoals(g);
        setGoalsInput({ calories: String(g.calories), protein: String(g.protein), carbs: String(g.carbs), fats: String(g.fats) });
        const localAvatar = await getStoredAvatarUri();
        if (localAvatar) setAvatarUri(localAvatar);
        else {
          const cachedRemote = await getCachedRemoteAvatarUrl();
          if (cachedRemote) setAvatarUri(cachedRemote);
        }
      }
    } catch (e) {
      console.error(e);
      const g = await getDailyGoals();
      setGoals(g);
      setGoalsInput({ calories: String(g.calories), protein: String(g.protein), carbs: String(g.carbs), fats: String(g.fats) });
      const localAvatar = await getStoredAvatarUri();
      if (localAvatar) setAvatarUri(localAvatar);
      else {
        const cachedRemote = await getCachedRemoteAvatarUrl();
        if (cachedRemote) setAvatarUri(cachedRemote);
      }
    }

    let resolvedName = '';
    let resolvedEmail = '';
    let logs: Awaited<ReturnType<typeof getFoodLogs>> = [];

    try {
      const [{ data: { user } }, foodLogs] = await Promise.all([
        supabase.auth.getUser(),
        getFoodLogs(),
      ]);
      logs = foodLogs;
      if (user) {
        resolvedName = user.user_metadata?.full_name || user.user_metadata?.name || '';
        resolvedEmail = user.email || '';
        setUserName(resolvedName);
        setUserEmail(resolvedEmail);
      }
      const stats = computeStatsFromLogs(logs);
      setScanCount(stats.scanCount);
      setAvgVitality(stats.avgVitality);
      setStreak(stats.streak);
      await persistHeaderSnapshot(resolvedName, resolvedEmail, logs);
    } catch (e) {
      console.error(e);
    }
  };

  const handleUploadReport = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true });
      if (!result.canceled && result.assets[0].uri) {
        setIsAnalyzingReport(true);
        const insights = await analyzeMedicalReport(result.assets[0].uri);
        setReportInsights(insights);
        await saveUserProfile({ report_insights: insights });
        setIsAnalyzingReport(false);
        Alert.alert('Analysis Complete', 'Your report insights have been saved to your profile.');
      }
    } catch (e) {
      console.error(e);
      setIsAnalyzingReport(false);
      Alert.alert('Report Sync Failed', 'Could not process document. Please ensure it is a clear PDF or photo.');
    }
  };

  const clearReport = async () => {
    setReportInsights('');
    await saveUserProfile({ report_insights: '' });
    await SecureStore.deleteItemAsync('reportInsights');
  };

  const saveHealthContext = async (text: string) => {
    setHealthContext(text);
    await saveUserProfile({ health_context: text });
  };

  const toggleCondition = async (condition: string) => {
    const updated = medicalConditions.includes(condition)
      ? medicalConditions.filter((c) => c !== condition)
      : [...medicalConditions, condition];
    setMedicalConditions(updated);
    await saveUserProfile({ medical_conditions: updated });
  };

  const handleBiometricToggle = async (value: boolean) => {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    if (!hasHardware || !isEnrolled) {
      Alert.alert('Biometrics Unavailable', 'No Face ID or fingerprint enrolled on this device.');
      return;
    }
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: value ? 'Enable biometric lock' : 'Disable biometric lock',
      fallbackLabel: 'Use Passcode',
    });
    if (result.success) {
      setBiometricsEnabled(value);
      await SecureStore.setItemAsync('biometricsEnabled', String(value));
    }
  };

  const handleNotificationsToggle = async (value: boolean) => {
    if (value) {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Notifications Blocked',
          'Enable notifications in Settings → Nouriva AI to receive meal reminders.',
          [{ text: 'Open Settings', onPress: () => Linking.openSettings() }, { text: 'Cancel', style: 'cancel' }]
        );
        return;
      }
    }
    setNotificationsEnabled(value);
    await SecureStore.setItemAsync('notificationsEnabled', String(value));
  };

  const handleManageSubscription = () => {
    if (Platform.OS === 'android') {
      Linking.openURL('https://play.google.com/store/account/subscriptions');
    } else {
      Linking.openURL('https://apps.apple.com/account/subscriptions');
    }
  };

  const handleHealthSync = async () => {
    if (Platform.OS === 'web') {
      Alert.alert('Not available', 'Health data sync is available on the iOS and Android apps.');
      return;
    }
    setHealthSyncBusy(true);
    try {
      const ok = await requestHealthPermissions();
      if (ok) {
        setHealthConnected(true);
        void saveUserProfile({ health_sync_enabled: true }).catch(() => {});
        if (Platform.OS === 'android') {
          // On Android we opened Health Connect settings — remind user to grant permissions there
          Alert.alert(
            'Health Connect',
            'Grant Nouriva AI access to Steps, Heart Rate, Sleep, and Weight in Health Connect, then return to the app. Your data will be used in the next scan.',
            [{ text: 'Got it' }]
          );
        } else {
          Alert.alert(
            'Apple Health',
            'Steps, heart rate, sleep, and weight can be used in your next scan analysis. You can change permissions anytime in system settings.',
            [{ text: 'OK' }]
          );
        }
      } else {
        const androidMsg =
          'Health Connect is not available on this device. Make sure it is installed from the Play Store and your Android version is 9 or above.';
        if (Platform.OS === 'ios') {
          // Collect debug diagnostics before showing the alert
          const debugInfo = await getHealthDebugInfo();
          Alert.alert(
            'Could not connect — Debug Info',
            debugInfo,
            [
              { text: 'OK', style: 'cancel' },
              { text: 'Open Settings', onPress: () => void Linking.openSettings() },
            ]
          );
        } else {
          Alert.alert('Could not connect', androidMsg, [{ text: 'OK', style: 'cancel' }]);
        }
      }
    } finally {
      setHealthSyncBusy(false);
    }
  };

  const handleHowWeAnalyze = () => setScienceModalVisible(true);

  const applyTdeeTargets = async () => {
    const age = parseInt(tdeeAge, 10);
    const heightCm = parseFloat(tdeeHeightCm);
    const weightKg = parseFloat(tdeeWeightKg);
    if (!Number.isFinite(age) || age < 14 || age > 100) {
      Alert.alert('Age', 'Enter an age between 14 and 100.');
      return;
    }
    if (!Number.isFinite(heightCm) || heightCm < 100 || heightCm > 250) {
      Alert.alert('Height', 'Enter height in cm between 100 and 250.');
      return;
    }
    if (!Number.isFinite(weightKg) || weightKg < 30 || weightKg > 300) {
      Alert.alert('Weight', 'Enter weight in kg between 30 and 300.');
      return;
    }
    const input: MetabolicInputs = {
      sex: tdeeSex,
      ageYears: age,
      heightCm,
      weightKg,
      activity: tdeeActivity,
      calorieGoal: tdeeGoal,
    };
    const parsed = computeDailyGoalsFromMetabolicInputs(input);
    setGoals(parsed);
    setGoalsInput({
      calories: String(parsed.calories),
      protein: String(parsed.protein),
      carbs: String(parsed.carbs),
      fats: String(parsed.fats),
    });
    await saveDailyGoals(parsed);
    await saveUserProfile({ daily_goals: parsed, metabolic_inputs: input });
    computeDietaryAge(age)
      .then((result) => {
        if (result) setDietaryAgeResult(result);
      })
      .catch(() => { /* non-fatal */ });
    setTdeeModalVisible(false);
    Alert.alert(
      'Targets updated',
      'Calories use Mifflin–St Jeor TDEE and your weight goal; protein, fat, and carbs are set to 30% / 30% / 40% of that calorie target. You can still edit numbers manually. This is an estimate, not medical advice.'
    );
  };

  const fillWeightFromHealth = async () => {
    if (Platform.OS === 'web') {
      Alert.alert('Not available', 'Weight sync works in the iOS and Android apps.');
      return;
    }
    setTdeeWeightLoading(true);
    try {
      let w = await fetchLatestWeightKg();
      if (w == null) {
        const ok = await requestHealthPermissions();
        if (ok) w = await fetchLatestWeightKg();
      }
      if (w != null) setTdeeWeightKg(String(w));
      else {
        Alert.alert(
          'No weight found',
          'Add a weight entry in Apple Health or Health Connect, or type your weight manually.'
        );
      }
    } finally {
      setTdeeWeightLoading(false);
    }
  };

  const handleSaveGoals = async () => {
    const parsed: DailyGoals = {
      calories: Math.max(500, parseInt(goalsInput.calories) || goals.calories),
      protein: Math.max(10, parseInt(goalsInput.protein) || goals.protein),
      carbs: Math.max(10, parseInt(goalsInput.carbs) || goals.carbs),
      fats: Math.max(5, parseInt(goalsInput.fats) || goals.fats),
    };
    setGoals(parsed);
    setGoalsInput({ calories: String(parsed.calories), protein: String(parsed.protein), carbs: String(parsed.carbs), fats: String(parsed.fats) });
    await saveDailyGoals(parsed);
    await saveUserProfile({ daily_goals: parsed });
    setEditingGoals(false);
  };

  const handleExportReport = async () => {
    setIsGeneratingReport(true);
    try {
      const logs = await getFoodLogs();
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const weekLogs = logs.filter(l => new Date(l.created_at) >= weekAgo);
      await generateAndShareWeeklyReport(weekLogs, userName || userEmail?.split('@')[0] || 'User');
    } catch (e: any) {
      Alert.alert('Report Failed', e?.message || 'Could not generate report. Try again.');
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const shareAppUrl = process.env.EXPO_PUBLIC_APP_SHARE_URL || 'https://productverse.in';

  const handleShareLongevity = useCallback(() => {
    if (!dietaryAgeResult) return;
    void Haptics.selectionAsync();
    setLongevityShareVisible(true);
  }, [dietaryAgeResult]);

  const handleShareApp = () => {
    const line =
      'Check out Nouriva AI — deep meal scans, organ-level insights, and personalised recovery ideas.';
    const payload =
      Platform.OS === 'ios'
        ? { message: line, url: shareAppUrl }
        : { message: `${line}\n${shareAppUrl}`, title: 'Nouriva AI' };
    void Share.share(payload);
  };

  const applyNewAvatar = async (localPath: string | null) => {
    if (!localPath) return;
    setAvatarUri(localPath);
    setAvatarSaving(true);
    try {
      const { url, error } = await uploadAvatarToCloud(localPath);
      if (error) {
        Alert.alert(
          'Could not sync to your account',
          `${error}\n\nYour photo is saved on this device. Check your connection, Supabase Storage (food-scans bucket), and that user_profiles has an avatar_url column.`,
        );
      } else if (url) {
        void setCachedRemoteAvatarUrl(url);
      }
    } finally {
      setAvatarSaving(false);
    }
  };

  const handleTakeAvatar = () => {
    void (async () => {
      const path = await takeAvatarSelfie();
      await applyNewAvatar(path);
    })();
  };

  const handlePickAvatar = () => {
    void (async () => {
      const path = await pickAvatarFromLibrary();
      await applyNewAvatar(path);
    })();
  };

  const handleRemoveAvatar = () => {
    Alert.alert('Remove photo', 'Your profile picture will be removed from this device and your account.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            await removeAvatarEverywhere();
            setAvatarUri(null);
          })();
        },
      },
    ]);
  };

  const openAvatarPicker = () => {
    const runTake = () => handleTakeAvatar();
    const runPick = () => handlePickAvatar();
    const runRemove = () => handleRemoveAvatar();

    if (Platform.OS === 'ios') {
      const opts = ['Cancel', 'Take photo', 'Choose from library', ...(avatarUri ? ['Remove photo'] : [])];
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: opts,
          cancelButtonIndex: 0,
          destructiveButtonIndex: avatarUri ? 3 : undefined,
        },
        (i) => {
          if (i === 1) runTake();
          if (i === 2) runPick();
          if (i === 3 && avatarUri) runRemove();
        }
      );
      return;
    }

    Alert.alert('Profile photo', 'Update your profile picture', [
      { text: 'Take photo', onPress: runTake },
      { text: 'Choose from library', onPress: runPick },
      ...(avatarUri ? [{ text: 'Remove photo', style: 'destructive' as const, onPress: runRemove }] : []),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to log out of your Nouriva AI session?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out', style: 'destructive', onPress: async () => {
          await clearAvatarLocalOnLogout();
          await clearBiometricLoginSnapshot();
          setAvatarUri(null);
          await clearProfileHeaderCache();
          await signOutCompletely();
        }
      },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your profile, health data, scan history, and account. This action cannot be undone. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Everything',
          style: 'destructive',
          onPress: async () => {
            try {
              const { data: { user } } = await supabase.auth.getUser();
              if (!user) return;

              // 1. Delete associated data
              // We delete profile and logs (RLS should allow owner deletion)
              await supabase.from('user_profiles').delete().eq('user_id', user.id);
              await supabase.from('food_logs').delete().eq('user_id', user.id);

              // 2. Perform cleanup and sign out
              await clearAvatarLocalOnLogout();
              await clearBiometricLoginSnapshot();
              setAvatarUri(null);
              await clearProfileHeaderCache();
              await signOutCompletely();
              
              Alert.alert('Account Deleted', 'Your data has been removed and you have been signed out.');
            } catch (e: any) {
              Alert.alert('Error', 'Failed to delete account data. Please try again.');
            }
          },
        },
      ]
    );
  };

  const activityKeys = Object.keys(ACTIVITY_LABELS) as ActivityKey[];
  const goalKeys = Object.keys(GOAL_LABELS) as CalorieGoalMode[];

  return (
    <>
    <ScreenEnterAnimation>
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerSide}>
          <Image source={require('../../assets/logo.png')} style={styles.logo} resizeMode="contain" />
        </View>
        <Text style={styles.headerTitle}>Your Profile</Text>
        <View style={styles.headerSide} />
      </View>

      <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Profile card */}
        <View style={styles.profileCard}>
          <TouchableOpacity
            style={styles.avatarContainer}
            onPress={openAvatarPicker}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Edit profile photo"
          >
            <View style={styles.avatar}>
              {avatarUri && !avatarLoadFailed ? (
                <Image
                  source={{ uri: avatarUri }}
                  style={styles.avatarImage}
                  onError={() => setAvatarLoadFailed(true)}
                />
              ) : (
                <User size={40} weight="duotone" color={C.primary} />
              )}
              {avatarSaving ? (
                <View style={styles.avatarLoading}>
                  <ActivityIndicator color="#FFF" size="small" />
                </View>
              ) : null}
            </View>
            <View style={styles.avatarEditBadge}>
              <Camera size={14} color="#FFF" weight="bold" />
            </View>
          </TouchableOpacity>
          {!headerHydrated ? (
            <ActivityIndicator style={{ marginVertical: 28 }} color={C.primary} />
          ) : (
            <>
              <View style={styles.nameRow}>
                <Text style={styles.userName}>{userName || userEmail?.split('@')[0] || 'You'}</Text>
                {isPro && (
                  <View style={styles.proBadge}>
                    <Text style={styles.proText}>PRO</Text>
                  </View>
                )}
              </View>
              <Text style={styles.userBio}>
                {userEmail || 'Optimising for Metabolic Vitality'}
              </Text>
              <View style={styles.statsRow}>
                {[
                  { key: 'scans', val: String(scanCount), label: 'Scans' },
                  {
                    key: 'vitality',
                    val: avgVitality,
                    label: 'Avg Vitality',
                    valueColor: colorForAvgVitality(avgVitality, C),
                  },
                  {
                    key: 'streak',
                    val: `${streak} ${streak === 1 ? 'day' : 'days'}`,
                    label: 'Streak',
                  },
                ].map((item, i, arr) => (
                  <React.Fragment key={item.key}>
                    <View style={styles.statItem}>
                      <Text
                        style={[
                          styles.statValue,
                          'valueColor' in item && item.valueColor != null
                            ? { color: item.valueColor }
                            : null,
                        ]}
                      >
                        {item.val}
                      </Text>
                      <Text style={styles.statLabel}>{item.label}</Text>
                    </View>
                    {i < arr.length - 1 && <View style={styles.divider} />}
                  </React.Fragment>
                ))}
              </View>
            </>
          )}
        </View>

        {/* Dietary Biological Age card */}
        <View style={{ marginHorizontal: 16, marginTop: 14 }}>
          {dietaryAgeResult ? (
            <DietaryAgeCard result={dietaryAgeResult} onSharePress={handleShareLongevity} />
          ) : (
            <View style={{
              backgroundColor: C.dietaryFeatureBg,
              borderRadius: 24,
              padding: 20,
              borderWidth: 2,
              borderColor: C.dietaryFeatureBorder,
              shadowColor: C.dietaryFeatureBorder,
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.22,
              shadowRadius: 20,
              elevation: 4,
              alignItems: 'center',
              gap: 8,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginBottom: 4 }}>
                <Dna size={14} color={C.primary} weight="fill" />
                <Text style={{ fontSize: 12, fontWeight: '800', color: C.textTertiary, textTransform: 'uppercase', letterSpacing: 0.8 }}>Dietary Biological Age</Text>
              </View>
              <Dna size={36} color={C.primary + '40'} weight="duotone" />
              <Text style={{ fontSize: 15, fontWeight: '800', color: C.textPrimary, textAlign: 'center' }}>Start scanning meals</Text>
              <Text style={{ fontSize: 13, color: C.textTertiary, textAlign: 'center', lineHeight: 19, fontWeight: '500' }}>
                Scan your food to reveal your dietary biological age — based on NAD⁺, sirtuins, mTOR, autophagy & inflammation across your last 30 days.
              </Text>
            </View>
          )}
        </View>

        {/* Pro status banner */}
        {!isPro ? (
          <TouchableOpacity style={styles.proBanner} onPress={() => navigateFromTabs(navigation, 'Upgrade')}>
            <View style={{ flex: 1 }}>
              <Text style={styles.proBannerTitle}>Unlock Pro</Text>
              <Text style={styles.proBannerSub}>Zero limits. Bio-sync reports. All medical markers.</Text>
            </View>
            <CaretRight size={18} color="#FFF" weight="bold" />
          </TouchableOpacity>
        ) : (
          <View style={styles.proBannerActive}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
              <Shield size={16} color={C.vitality} weight="duotone" />
              <Text style={styles.proActiveText}>Pro Active</Text>
            </View>
            <TouchableOpacity 
              onPress={async () => {
                const { presentCustomerCenter } = await import('../integrations/purchases');
                presentCustomerCenter();
              }}
              style={styles.manageSubBtn}
            >
              <Text style={styles.manageSubText}>Manage</Text>
            </TouchableOpacity>
          </View>
        )}

        <View
          onLayout={(e) => {
            personalizationAnchorY.current = e.nativeEvent.layout.y;
          }}
        >
        {/* Personalization Hub */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.sectionTitle}>Personalization Hub</Text>
              {!isPro && <LockSimple size={12} weight="bold" color={C.textTertiary} />}
            </View>
            <View style={styles.encryptedBadge}>
              <Shield size={10} weight="bold" color={C.primary} />
              <Text style={styles.encryptedText}>ENCRYPTED</Text>
            </View>
          </View>
          <TouchableOpacity 
            style={styles.menuCard}
            onPress={!isPro ? () => navigateFromTabs(navigation, 'Upgrade') : undefined}
            activeOpacity={isPro ? 1 : 0.8}
          >
            <View style={[styles.reportContainer, reportInsights ? styles.reportActive : null]}>
              <View style={styles.reportHeader}>
                <View style={[styles.iconBox, { backgroundColor: C.primaryLight }]}>
                  <FileText size={20} color={C.primary} weight="duotone" />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.reportTitle}>Medical Report Sync</Text>
                  <Text style={styles.reportSubtitle}>
                    {reportInsights ? 'Biometric markers synced' : 'Upload lab results (PDF/Photo)'}
                  </Text>
                </View>
                {reportInsights ? (
                  <TouchableOpacity onPress={isPro ? clearReport : () => navigateFromTabs(navigation, 'Upgrade')} style={styles.iconButton}>
                    <Trash size={16} weight="bold" color={C.danger} />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity onPress={isPro ? handleUploadReport : () => navigateFromTabs(navigation, 'Upgrade')} disabled={isAnalyzingReport} style={styles.iconButton}>
                    {isAnalyzingReport ? <ActivityIndicator size="small" color={C.primary} /> : <Upload size={20} weight="bold" color={C.primary} />}
                  </TouchableOpacity>
                )}
              </View>
              {reportInsights ? (
                <View style={styles.insightsBox}>
                  <Text style={styles.insightsText}>{reportInsights}</Text>
                  <View style={styles.syncStatus}>
                    <Pulse size={10} weight="bold" color={C.vitality} />
                    <Text style={styles.syncText}>BIOMETRIC FEED SYNCED</Text>
                  </View>
                </View>
              ) : null}
            </View>
          </TouchableOpacity>
        </View>
        </View>

        {/* Medical & Metabolic Profile */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.sectionTitle}>Medical & Metabolic Profile</Text>
              {!isPro && <LockSimple size={12} weight="bold" color={C.textTertiary} />}
            </View>
          </View>
          <TouchableOpacity 
            style={[styles.menuCard, { padding: 16 }]}
            onPress={!isPro ? () => navigateFromTabs(navigation, 'Upgrade') : undefined}
            activeOpacity={isPro ? 1 : 0.8}
          >
            <View style={styles.chipsRow}>
              {medicalConditions.map((condition) => (
                <TouchableOpacity key={condition} style={styles.chip} onPress={() => isPro ? toggleCondition(condition) : navigateFromTabs(navigation, 'Upgrade')}>
                  <Text style={styles.chipText}>{condition}</Text>
                  <XIcon size={12} weight="bold" color={C.primary} />
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={styles.addChip} onPress={() => isPro ? setSelectorVisible(true) : navigateFromTabs(navigation, 'Upgrade')}>
                <Plus size={14} weight="bold" color={C.primary} />
                <Text style={styles.addChipText}>Condition catalog</Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.bioCard, { marginTop: 12 }]}>
              <View style={styles.bioHeader}>
                <PencilSimple size={14} weight="bold" color={C.primary} />
                <Text style={styles.bioTitle}>Additional Details</Text>
              </View>
              <TextInput
                style={styles.bioInput}
                placeholder="Sensitivities or personal notes..."
                placeholderTextColor={C.textTertiary}
                multiline
                value={healthContext}
                onChangeText={isPro ? saveHealthContext : undefined}
                editable={isPro}
                blurOnSubmit
              />
            </View>
          </TouchableOpacity>
        </View>

        <ClinicalSelector
          visible={selectorVisible}
          onClose={() => setSelectorVisible(false)}
          selectedConditions={medicalConditions}
          onToggleCondition={toggleCondition}
        />

        {/* Daily Goals */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Daily Goals</Text>
            <TouchableOpacity
              onPress={() => editingGoals ? handleSaveGoals() : setEditingGoals(true)}
              style={styles.encryptedBadge}
            >
              <Target size={10} weight="bold" color={C.primary} />
              <Text style={styles.encryptedText}>{editingGoals ? 'SAVE' : 'EDIT'}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.menuCard}>
            {([
              { key: 'calories', Icon: Lightning, label: 'Calories', unit: 'kcal', color: C.energy },
              { key: 'protein', Icon: Barbell, label: 'Protein', unit: 'g', color: C.primary },
              { key: 'fats', Icon: Drop, label: 'Fats', unit: 'g', color: C.danger },
              { key: 'carbs', Icon: Grains, label: 'Carbs', unit: 'g', color: C.vitality },
            ] as const).map(({ key, Icon, label, unit, color }, i, arr) => (
              <View key={key} style={[styles.menuItem, i === arr.length - 1 && { borderBottomWidth: 0 }]}>
                <View style={[styles.iconBox, { backgroundColor: color + '15' }]}>
                  <Icon size={14} color={color} />
                </View>
                <Text style={[styles.menuText, { flex: 1, fontWeight: '700', letterSpacing: -0.3 }]}>{label}</Text>
                {editingGoals ? (
                  <View style={styles.goalInputWrap}>
                    <TextInput
                      style={[styles.goalInput, { color }]}
                      value={goalsInput[key]}
                      onChangeText={v => setGoalsInput(prev => ({ ...prev, [key]: v }))}
                      keyboardType="number-pad"
                      maxLength={5}
                      selectTextOnFocus
                    />
                    <Text style={styles.goalUnit}>{unit}</Text>
                  </View>
                ) : (
                  <Text style={[styles.goalValue, { color }]}>{goals[key]} {unit}</Text>
                )}
              </View>
            ))}
          </View>
          {tdeeMacroPreview != null && (
            <Text style={styles.goalHintText}>
              {goals.protein === tdeeMacroPreview.protein &&
              goals.fats === tdeeMacroPreview.fats &&
              goals.carbs === tdeeMacroPreview.carbs
                ? `Smart goals use 30% kcal protein / 30% fat / 40% carbs (~${tdeeMacroPreview.protein}g / ${tdeeMacroPreview.fats}g / ${tdeeMacroPreview.carbs}g at ${tdeeMacroPreview.cal} kcal).`
                : `For your Smart goals (~${tdeeMacroPreview.cal} kcal), 30/30/40 suggests ~${tdeeMacroPreview.protein}g P / ${tdeeMacroPreview.fats}g F / ${tdeeMacroPreview.carbs}g C, but saved goals differ. Open Smart goals and tap Apply to daily goals to sync.`}
            </Text>
          )}
          {editingGoals && (
            <TouchableOpacity style={styles.cancelGoalsBtn} onPress={() => {
              setGoalsInput({ calories: String(goals.calories), protein: String(goals.protein), carbs: String(goals.carbs), fats: String(goals.fats) });
              setEditingGoals(false);
            }}>
              <Text style={styles.cancelGoalsBtnText}>Cancel</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.tdeeRow}
            onPress={() => setTdeeModalVisible(true)}
            activeOpacity={0.85}
          >
            <View style={[styles.iconBox, { backgroundColor: C.primaryLight }]}>
              <Calculator size={18} weight="duotone" color={C.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.menuText}>Smart goals</Text>
              <Text style={styles.menuSubText}>Estimate from age, height, weight & activity</Text>
            </View>
            <CaretRight size={18} color={C.textTertiary} weight="bold" />
          </TouchableOpacity>
        </View>

        {/* System Preferences */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>System Preferences</Text>
          </View>
          <View style={styles.menuCard}>
            <View style={styles.menuItem}>
              <View style={[styles.iconBox, { backgroundColor: C.primaryLight }]}>
                <Shield size={20} color={C.primary} weight="duotone" />
              </View>
              <Text style={[styles.menuText, { flex: 1 }]}>Biometric Encryption</Text>
              <Switch value={biometricsEnabled} onValueChange={handleBiometricToggle} trackColor={{ false: C.border, true: C.primary }} thumbColor={C.white} />
            </View>
            <View style={styles.menuItem}>
              <View style={[styles.iconBox, { backgroundColor: C.vitalityLight }]}>
                <Bell size={20} weight="duotone" color={C.vitality} />
              </View>
              <Text style={[styles.menuText, { flex: 1 }]}>Smart alerts</Text>
              <Switch value={notificationsEnabled} onValueChange={handleNotificationsToggle} trackColor={{ false: C.border, true: C.vitality }} thumbColor={C.white} />
            </View>
            <View style={styles.menuItem}>
              <View style={[styles.iconBox, { backgroundColor: isDark ? '#1C1402' : '#FFFBEB' }]}>
                {isDark ? <Moon size={20} weight="duotone" color={C.energy} /> : <Sun size={20} weight="duotone" color={C.energy} />}
              </View>
              <Text style={[styles.menuText, { flex: 1 }]}>{isDark ? 'Dark Mode' : 'Light Mode'}</Text>
              <Switch
                value={isDark}
                onValueChange={v => setThemeOverride(v ? 'dark' : 'light')}
                trackColor={{ false: C.border, true: C.primary }}
                thumbColor={C.white}
              />
            </View>
            <TouchableOpacity
              style={[styles.menuItem, { borderBottomWidth: 0 }]}
              onPress={handleHealthSync}
              disabled={healthSyncBusy}
            >
              <View style={[styles.iconBox, { backgroundColor: C.energyLight }]}>
                <Heart size={20} weight="duotone" color={C.energy} />
              </View>
              <Text style={[styles.menuText, { flex: 1 }]}>
                {Platform.OS === 'android' ? 'Health Connect' : 'Apple Health'}
              </Text>
              <View style={styles.syncBadge}>
                {healthSyncBusy ? (
                  <ActivityIndicator size="small" color={C.energy} />
                ) : (
                  <Text style={styles.syncBadgeText}>{healthConnected ? 'Connected' : 'Set up'}</Text>
                )}
              </View>
              <CaretRight size={18} color={C.textTertiary} weight="bold" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Account */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Account</Text>
          </View>
          <View style={styles.menuCard}>
            <TouchableOpacity style={styles.menuItem} onPress={handleExportReport} disabled={isGeneratingReport}>
              <View style={[styles.iconBox, { backgroundColor: C.primaryLight }]}>
                {isGeneratingReport
                  ? <ActivityIndicator size="small" color={C.primary} />
                  : <FileText size={20} color={C.primary} weight="duotone" />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.menuText, { flex: 1 }]}>Weekly report</Text>
                <Text style={styles.menuSubText}>Export PDF of last 7 days</Text>
              </View>
              <CaretRight size={18} color={C.textTertiary} weight="bold" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={handleShareApp}>
              <View style={[styles.iconBox, { backgroundColor: C.primaryMuted }]}>
                <ShareNetwork size={20} weight="duotone" color={C.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.menuText, { flex: 1 }]}>Share App</Text>
                <Text style={styles.menuSubText}>Invite someone to try Nouriva AI</Text>
              </View>
              <CaretRight size={18} color={C.textTertiary} weight="bold" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => navigateFromTabs(navigation, 'ContactSupport')}
            >
              <View style={[styles.iconBox, { backgroundColor: C.primaryLight }]}>
                <Question size={20} weight="duotone" color={C.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.menuText, { flex: 1 }]}>Help</Text>
                <Text style={styles.menuSubText}>Contact us & send feedback</Text>
              </View>
              <CaretRight size={18} color={C.textTertiary} weight="bold" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={handleManageSubscription}>
              <View style={[styles.iconBox, { backgroundColor: C.vitalityLight }]}>
                <Shield size={20} color={C.vitality} weight="duotone" />
              </View>
              <Text style={[styles.menuText, { flex: 1 }]}>Manage Subscription</Text>
              <CaretRight size={18} color={C.textTertiary} weight="bold" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={handleHowWeAnalyze}>
              <View style={[styles.iconBox, { backgroundColor: C.bgSecondary }]}>
                <GearSix size={20} weight="duotone" color={C.textSecondary} />
              </View>
              <Text style={[styles.menuText, { flex: 1 }]}>How we analyze</Text>
              <CaretRight size={18} color={C.textTertiary} weight="bold" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={handleLogout}>
              <View style={[styles.iconBox, { backgroundColor: C.dangerLight }]}>
                <SignOut size={20} weight="bold" color={C.danger} />
              </View>
              <Text style={[styles.menuText, { flex: 1, color: C.danger }]}>Sign Out</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.menuItem, { borderBottomWidth: 0 }]} onPress={handleDeleteAccount}>
              <View style={[styles.iconBox, { backgroundColor: C.dangerLight }]}>
                <Trash size={20} weight="bold" color={C.danger} />
              </View>
              <Text style={[styles.menuText, { flex: 1, color: C.danger }]}>Delete Account</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.versionText}>Nouriva AI · v{Constants.expoConfig?.version ?? '1.0'}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
    </ScreenEnterAnimation>

    <LongevityShareSheet
      visible={longevityShareVisible}
      onClose={() => setLongevityShareVisible(false)}
      result={dietaryAgeResult}
      appShareUrl={shareAppUrl}
    />

    <Modal
      visible={tdeeModalVisible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => setTdeeModalVisible(false)}
    >
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: C.bg }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
          <View style={styles.tdeeModalHeader}>
            <TouchableOpacity onPress={() => setTdeeModalVisible(false)} style={styles.tdeeModalClose} hitSlop={12}>
              <XIcon size={22} weight="bold" color={C.textSecondary} />
            </TouchableOpacity>
            <Text style={styles.tdeeModalTitle}>Smart goals</Text>
            <View style={{ width: 40 }} />
          </View>
          <ScrollView
            style={styles.tdeeModalScroll}
            contentContainerStyle={styles.tdeeModalScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.tdeeDisclaimer}>
              Uses Mifflin–St Jeor BMR × activity factor, then adjusts for your weight goal. Daily macros follow 30% of calories from protein, 30% from fat, and 40% from carbs. For information only — not medical advice.
            </Text>

            <Text style={styles.tdeeFieldLabel}>Sex</Text>
            <View style={styles.tdeeSexRow}>
              {(['male', 'female'] as const).map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[styles.tdeeSexBtn, tdeeSex === s && styles.tdeeSexBtnActive]}
                  onPress={() => setTdeeSex(s)}
                >
                  <Text style={[styles.tdeeSexBtnText, tdeeSex === s && styles.tdeeSexBtnTextActive]}>
                    {s === 'male' ? 'Male' : 'Female'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.tdeeFieldLabel}>Age (years)</Text>
            <TextInput
              style={styles.tdeeInput}
              value={tdeeAge}
              onChangeText={setTdeeAge}
              keyboardType="number-pad"
              maxLength={3}
              placeholder="35"
              placeholderTextColor={C.textTertiary}
            />

            <Text style={styles.tdeeFieldLabel}>Height (cm)</Text>
            <TextInput
              style={styles.tdeeInput}
              value={tdeeHeightCm}
              onChangeText={setTdeeHeightCm}
              keyboardType="decimal-pad"
              placeholder="175"
              placeholderTextColor={C.textTertiary}
            />

            <Text style={styles.tdeeFieldLabel}>Weight (kg)</Text>
            <View style={styles.tdeeWeightRow}>
              <TextInput
                style={[styles.tdeeInput, { flex: 1 }]}
                value={tdeeWeightKg}
                onChangeText={setTdeeWeightKg}
                keyboardType="decimal-pad"
                placeholder="75"
                placeholderTextColor={C.textTertiary}
              />
              {Platform.OS !== 'web' && (
                <TouchableOpacity
                  style={styles.tdeeHealthWeightBtn}
                  onPress={fillWeightFromHealth}
                  disabled={tdeeWeightLoading}
                >
                  {tdeeWeightLoading ? (
                    <ActivityIndicator size="small" color={C.primary} />
                  ) : (
                    <Text style={styles.tdeeHealthWeightBtnText}>From Health</Text>
                  )}
                </TouchableOpacity>
              )}
            </View>

            <Text style={styles.tdeeFieldLabel}>Activity</Text>
            <View style={styles.tdeeChipWrap}>
              {activityKeys.map((k) => (
                <TouchableOpacity
                  key={k}
                  style={[styles.tdeeChip, tdeeActivity === k && styles.tdeeChipActive]}
                  onPress={() => setTdeeActivity(k)}
                >
                  <Text style={[styles.tdeeChipText, tdeeActivity === k && styles.tdeeChipTextActive]} numberOfLines={2}>
                    {ACTIVITY_LABELS[k]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.tdeeFieldLabel}>Calorie goal</Text>
            <View style={styles.tdeeChipWrap}>
              {goalKeys.map((k) => (
                <TouchableOpacity
                  key={k}
                  style={[styles.tdeeChip, tdeeGoal === k && styles.tdeeChipActive]}
                  onPress={() => setTdeeGoal(k)}
                >
                  <Text style={[styles.tdeeChipText, tdeeGoal === k && styles.tdeeChipTextActive]}>
                    {GOAL_LABELS[k]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={styles.tdeeApplyBtn} onPress={applyTdeeTargets} activeOpacity={0.88}>
              <Text style={styles.tdeeApplyBtnText}>Apply to daily goals</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>

    {/* ── Our Science / How We Analyze modal ── */}
    <Modal
      visible={scienceModalVisible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => setScienceModalVisible(false)}
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
        {/* Header */}
        <View style={styles.scienceModalHeader}>
          <TouchableOpacity onPress={() => setScienceModalVisible(false)} style={styles.tdeeModalClose} hitSlop={12}>
            <XIcon size={22} weight="bold" color={C.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.tdeeModalTitle}>Our Science</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          style={styles.tdeeModalScroll}
          contentContainerStyle={[styles.tdeeModalScrollContent, { paddingBottom: 60 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Intro */}
          <View style={styles.scienceSection}>
            <Text style={styles.scienceSectionTitle}>AI-Powered Nutritional Analysis</Text>
            <Text style={styles.scienceBody}>
              Nouriva AI uses Google Gemini — a state-of-the-art large-language model — to analyse every meal across six physiological systems simultaneously. When you scan food or log a meal, your input (photo, description, or manual entry) is sent to Gemini along with any personalised health context you've added.
            </Text>
          </View>

          {/* Vitality Score */}
          <View style={styles.scienceSection}>
            <Text style={styles.scienceSectionTitle}>Vitality Score (0–10)</Text>
            <Text style={styles.scienceBody}>
              The Vitality Score is a composite rating of how the meal supports overall physiological function:
            </Text>
            {[
              { range: '8–10', label: 'Excellent', desc: 'Dense micronutrients, balanced macros, minimal pro-inflammatory load. Supports long-term metabolic health.' },
              { range: '5–7', label: 'Good', desc: 'Reasonable nutritional profile with some trade-offs. Fine for regular consumption in a balanced diet.' },
              { range: '3–4', label: 'Moderate', desc: 'Notable nutritional gaps or elevations in sugar, sodium, or saturated fat. Worth moderating.' },
              { range: '0–2', label: 'Poor', desc: 'High in ultra-processed ingredients, additives, or lacking significant nutritional value.' },
            ].map((row) => (
              <View key={row.range} style={styles.scienceScoreRow}>
                <View style={styles.scienceScoreBadge}>
                  <Text style={styles.scienceScoreBadgeText}>{row.range}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.scienceScoreLabel}>{row.label}</Text>
                  <Text style={styles.scienceScoreDesc}>{row.desc}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* Six Systems */}
          <View style={styles.scienceSection}>
            <Text style={styles.scienceSectionTitle}>Six Physiological Systems</Text>
            <Text style={styles.scienceBody}>
              Every meal is analysed across six pathways. Each system receives its own 0–10 score reflecting how the meal's composition interacts with that body system:
            </Text>
            {[
              { icon: '⚡', name: 'Metabolic', desc: 'Blood sugar regulation, insulin sensitivity, glycaemic impact, and energy metabolism including mitochondrial substrate use.' },
              { icon: '🔥', name: 'Inflammatory', desc: 'Pro- and anti-inflammatory compounds — omega-3 to omega-6 ratios, antioxidant density, polyphenols, and cytokine modulation potential.' },
              { icon: '🫀', name: 'Cardiovascular', desc: 'Impact on LDL/HDL balance, arterial stiffness markers, blood pressure-relevant minerals (potassium, magnesium, sodium), and endothelial health.' },
              { icon: '🫁', name: 'Hepatic', desc: 'Liver enzyme load, fructose and ethanol metabolism, fatty acid processing, and detoxification pathway support.' },
              { icon: '🧠', name: 'Neurological', desc: 'Precursors to neurotransmitters (tryptophan, tyrosine, choline), B-vitamins for cognitive function, and blood–brain barrier-relevant compounds.' },
              { icon: '🔬', name: 'Renal', desc: 'Dietary load on kidney filtration — phosphorus, potassium, oxalates, purines, and protein clearance demands.' },
            ].map((sys) => (
              <View key={sys.name} style={styles.scienceSystemRow}>
                <Text style={styles.scienceSystemIcon}>{sys.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.scienceSystemName}>{sys.name}</Text>
                  <Text style={styles.scienceSystemDesc}>{sys.desc}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* Citations */}
          <View style={styles.scienceSection}>
            <Text style={styles.scienceSectionTitle}>Real Citations via Google Search</Text>
            <Text style={styles.scienceBody}>
              The Citations & Sources section in each result is powered by Gemini's Google Search Grounding. Rather than generating plausible-sounding references, Nouriva AI makes separate calls to the Gemini API with live Google Search enabled — each call retrieves a real, verifiable URL from sources such as PubMed, NIH, Harvard T.H. Chan School of Public Health, and the WHO.{'\n\n'}Multiple parallel searches are fired per analysis so you receive up to six distinct, topic-specific citations covering nutrition, macronutrients, micronutrients, and any specific health alerts flagged for your meal.
            </Text>
          </View>

          {/* Privacy */}
          <View style={styles.scienceSection}>
            <Text style={styles.scienceSectionTitle}>Privacy & Data</Text>
            <Text style={styles.scienceBody}>
              Your meal photos and health context are sent to Google Gemini solely for the purpose of generating your analysis. Google's API data usage policies apply — data is not used to train Google's models when sent via the API. Nouriva AI does not store your raw images on its servers; only the structured analysis result and food name are saved to your history in Supabase.{'\n\n'}Your health context (medical conditions, biometrics, lab insights) is stored locally on your device using iOS Secure Enclave–backed SecureStore and is only transmitted when you initiate a scan.
            </Text>
          </View>

          {/* Disclaimer */}
          <View style={[styles.scienceSection, styles.scienceDisclaimerBox]}>
            <Text style={styles.scienceDisclaimerText}>
              ⚕️ Medical Disclaimer — Nouriva AI is for informational and educational purposes only. It is not a substitute for professional medical advice, diagnosis, or treatment. Always consult a qualified healthcare provider before making dietary changes based on any health condition.
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
    </>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    header: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingHorizontal: 20, paddingVertical: 14,
      backgroundColor: C.navBar, borderBottomWidth: 1, borderBottomColor: C.navBorder,
    },
    backButton: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.bgSecondary, justifyContent: 'center', alignItems: 'center' },
    headerTitle: { fontSize: 17, fontWeight: '800', color: C.textPrimary },
    headerSide: { width: 40, alignItems: 'flex-start', justifyContent: 'center' },
    logo: { width: 32, height: 32, borderRadius: 8 },
    scrollContent: { paddingBottom: 40 },
    // Profile card
    profileCard: {
      backgroundColor: C.surface, marginHorizontal: 16, marginTop: 16,
      borderRadius: 24, padding: 24, alignItems: 'center',
      shadowColor: C.shadowColor, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.05, shadowRadius: 16,
      borderWidth: 1, borderColor: C.border,
    },
    avatarContainer: { position: 'relative', marginBottom: 16 },
    avatar: {
      width: 96, height: 96, borderRadius: 48,
      backgroundColor: C.primaryLight, justifyContent: 'center', alignItems: 'center',
      borderWidth: 3, borderColor: C.surface,
      overflow: 'hidden',
    },
    avatarImage: { width: 96, height: 96, borderRadius: 48 },
    avatarLoading: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.35)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    avatarEditBadge: {
      position: 'absolute', bottom: 2, right: 2,
      width: 30, height: 30, borderRadius: 15,
      backgroundColor: C.primary,
      justifyContent: 'center', alignItems: 'center',
      borderWidth: 2.5, borderColor: C.surface,
    },
    nameRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4, gap: 8 },
    userName: { fontSize: 24, fontWeight: '800', color: C.textPrimary },
    proBadge: { backgroundColor: C.primary, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
    proText: { color: '#FFF', fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
    userBio: { fontSize: 14, color: C.textSecondary, marginBottom: 20 },
    statsRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      width: '100%', paddingTop: 18, borderTopWidth: 1, borderTopColor: C.border,
    },
    statItem: { alignItems: 'center', flex: 1 },
    statValue: { fontSize: 20, fontWeight: '800', color: C.textPrimary, marginBottom: 2 },
    statLabel: { fontSize: 11, color: C.textTertiary, fontWeight: '600' },
    divider: { width: 1, height: 28, backgroundColor: C.border },
    // Pro banners
    proBanner: {
      backgroundColor: C.primary, marginHorizontal: 16, marginTop: 14,
      borderRadius: 20, padding: 18, flexDirection: 'row', alignItems: 'center',
      shadowColor: C.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, gap: 12,
    },
    proBannerTitle: { color: '#FFF', fontSize: 16, fontWeight: '800', marginBottom: 2 },
    proBannerSub: { color: 'rgba(255,255,255,0.65)', fontSize: 12 },
    proBannerActive: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: C.vitalityLight, marginHorizontal: 16, marginTop: 14,
      paddingVertical: 10, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: C.vitality, gap: 8,
    },
    proActiveText: { color: C.vitality, fontSize: 13, fontWeight: '800' },
    manageSubBtn: {
      backgroundColor: C.vitality, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
    },
    manageSubText: { color: '#FFF', fontSize: 12, fontWeight: '800' },
    // Sections
    section: { marginTop: 24, paddingHorizontal: 16 },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
    sectionTitle: { fontSize: 12, fontWeight: '800', color: C.textTertiary, textTransform: 'uppercase', letterSpacing: 1, marginLeft: 2 },
    encryptedBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.primaryLight, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, gap: 4 },
    encryptedText: { fontSize: 9, fontWeight: '800', color: C.primary, letterSpacing: 0.5 },
    menuCard: {
      backgroundColor: C.surface, borderRadius: 20, overflow: 'hidden',
      borderWidth: 1, borderColor: C.border,
      shadowColor: C.shadowColor, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.03, shadowRadius: 8,
    },
    lockOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.65)',
      zIndex: 20,
      justifyContent: 'center',
      alignItems: 'center',
      flexDirection: 'row',
      gap: 8,
    },
    lockText: { color: '#FFF', fontSize: 12, fontWeight: '900', letterSpacing: 1 },
    menuItem: {
      flexDirection: 'row', alignItems: 'center', padding: 16,
      borderBottomWidth: 1, borderBottomColor: C.borderSubtle, gap: 0,
    },
    iconBox: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
    menuText: { fontSize: 15, fontWeight: '600', color: C.textPrimary },
    menuSubText: { fontSize: 11, color: C.textTertiary, marginTop: 1 },
    syncBadge: { backgroundColor: C.vitalityLight, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginRight: 8 },
    syncBadgeText: { fontSize: 11, fontWeight: '700', color: C.vitality },
    iconButton: { padding: 8 },
    // Report
    reportContainer: { padding: 16 },
    reportActive: { backgroundColor: C.surfaceSubtle },
    reportHeader: { flexDirection: 'row', alignItems: 'center' },
    reportTitle: { fontSize: 15, fontWeight: '700', color: C.textPrimary },
    reportSubtitle: { fontSize: 12, color: C.textSecondary, marginTop: 2 },
    insightsBox: { marginTop: 14, backgroundColor: C.surface, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: C.border },
    insightsText: { fontSize: 13, color: C.textSecondary, lineHeight: 19, fontStyle: 'italic' },
    syncStatus: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 6 },
    syncText: { fontSize: 10, fontWeight: '800', color: C.vitality, letterSpacing: 0.5 },
    // Condition chips
    chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: C.primaryLight, paddingHorizontal: 12, paddingVertical: 8,
      borderRadius: 12, borderWidth: 1, borderColor: C.primaryMuted, gap: 6,
    },
    chipText: { fontSize: 13, fontWeight: '600', color: C.primary },
    addChip: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: C.surface, paddingHorizontal: 12, paddingVertical: 8,
      borderRadius: 12, borderWidth: 1, borderColor: C.border, borderStyle: 'dashed', gap: 6,
    },
    addChipText: { fontSize: 13, fontWeight: '700', color: C.primary },
    // Bio card
    bioCard: {
      backgroundColor: C.surface, borderRadius: 16, padding: 16,
      borderWidth: 1, borderColor: C.border,
    },
    bioHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 6 },
    bioTitle: { fontSize: 11, fontWeight: '800', color: C.primary, textTransform: 'uppercase', letterSpacing: 0.5 },
    bioInput: { fontSize: 15, color: C.textPrimary, minHeight: 80, textAlignVertical: 'top', fontWeight: '500', lineHeight: 22 },
    // Footer
    footer: { paddingVertical: 36, alignItems: 'center' },
    versionText: { fontSize: 12, fontWeight: '700', color: C.textTertiary, marginBottom: 4 },
    copyrightText: { fontSize: 10, color: C.textTertiary, textTransform: 'uppercase', letterSpacing: 1 },
    white: { color: C.white },
    // Goals
    goalValue: { fontSize: 15, fontWeight: '800' },
    goalInputWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    goalInput: { fontSize: 16, fontWeight: '800', minWidth: 52, textAlign: 'right', borderBottomWidth: 1.5, borderBottomColor: C.border, paddingVertical: 2 },
    goalUnit: { fontSize: 12, color: C.textTertiary, fontWeight: '600' },
    cancelGoalsBtn: { alignItems: 'center', marginTop: 10 },
    cancelGoalsBtnText: { fontSize: 13, color: C.textTertiary, fontWeight: '600' },
    goalHintText: {
      fontSize: 12,
      color: C.textTertiary,
      fontWeight: '500',
      lineHeight: 17,
      marginTop: 10,
      marginHorizontal: 4,
    },
    tdeeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 12,
      padding: 16,
      backgroundColor: C.surface,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: C.border,
      gap: 4,
    },
    tdeeModalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
    },
    tdeeModalClose: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    tdeeModalTitle: { fontSize: 17, fontWeight: '800', color: C.textPrimary },
    tdeeModalScroll: { flex: 1 },
    tdeeModalScrollContent: { padding: 20, paddingBottom: 48 },
    tdeeDisclaimer: {
      fontSize: 12,
      color: C.textSecondary,
      lineHeight: 18,
      marginBottom: 20,
    },
    tdeeFieldLabel: {
      fontSize: 11,
      fontWeight: '800',
      color: C.textTertiary,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginBottom: 8,
      marginTop: 4,
    },
    tdeeSexRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
    tdeeSexBtn: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 14,
      backgroundColor: C.surface,
      borderWidth: 1.5,
      borderColor: C.border,
      alignItems: 'center',
    },
    tdeeSexBtnActive: { borderColor: C.primary, backgroundColor: C.primaryLight },
    tdeeSexBtnText: { fontSize: 15, fontWeight: '700', color: C.textSecondary },
    tdeeSexBtnTextActive: { color: C.primary },
    tdeeInput: {
      backgroundColor: C.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: C.border,
      paddingHorizontal: 16,
      paddingVertical: 12,
      fontSize: 16,
      fontWeight: '700',
      color: C.textPrimary,
      marginBottom: 14,
    },
    tdeeWeightRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
    tdeeHealthWeightBtn: {
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 14,
      backgroundColor: C.primaryLight,
      borderWidth: 1,
      borderColor: C.primaryMuted,
      minWidth: 118,
      alignItems: 'center',
    },
    tdeeHealthWeightBtnText: { fontSize: 13, fontWeight: '800', color: C.primary },
    tdeeChipWrap: { gap: 8, marginBottom: 14 },
    tdeeChip: {
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 14,
      backgroundColor: C.surface,
      borderWidth: 1.5,
      borderColor: C.border,
    },
    tdeeChipActive: { borderColor: C.primary, backgroundColor: C.primaryLight },
    tdeeChipText: { fontSize: 13, fontWeight: '600', color: C.textSecondary, lineHeight: 18 },
    tdeeChipTextActive: { color: C.primary, fontWeight: '700' },
    tdeeApplyBtn: {
      marginTop: 8,
      backgroundColor: C.primary,
      paddingVertical: 16,
      borderRadius: 18,
      alignItems: 'center',
    },
    tdeeApplyBtnText: { color: '#FFF', fontSize: 16, fontWeight: '800' },

    // ── Science Modal ──
    scienceModalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
    },
    scienceSection: {
      marginBottom: 28,
    },
    scienceSectionTitle: {
      fontSize: 13,
      fontWeight: '800',
      color: C.primary,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginBottom: 10,
    },
    scienceBody: {
      fontSize: 14,
      color: C.textSecondary,
      lineHeight: 22,
    },
    scienceScoreRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      marginTop: 10,
    },
    scienceScoreBadge: {
      minWidth: 44,
      paddingHorizontal: 8,
      paddingVertical: 4,
      backgroundColor: C.primaryLight,
      borderRadius: 8,
      alignItems: 'center',
    },
    scienceScoreBadgeText: {
      fontSize: 12,
      fontWeight: '800',
      color: C.primary,
    },
    scienceScoreLabel: {
      fontSize: 14,
      fontWeight: '700',
      color: C.textPrimary,
      marginBottom: 2,
    },
    scienceScoreDesc: {
      fontSize: 13,
      color: C.textSecondary,
      lineHeight: 19,
    },
    scienceSystemRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      marginTop: 12,
      backgroundColor: C.surface,
      borderRadius: 14,
      padding: 12,
      borderWidth: 1,
      borderColor: C.border,
    },
    scienceSystemIcon: {
      fontSize: 22,
      marginTop: 1,
    },
    scienceSystemName: {
      fontSize: 14,
      fontWeight: '700',
      color: C.textPrimary,
      marginBottom: 3,
    },
    scienceSystemDesc: {
      fontSize: 13,
      color: C.textSecondary,
      lineHeight: 19,
    },
    scienceDisclaimerBox: {
      backgroundColor: C.bgSecondary,
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: C.border,
    },
    scienceDisclaimerText: {
      fontSize: 12,
      color: C.textTertiary,
      lineHeight: 19,
      fontStyle: 'italic',
    },
  });
}
