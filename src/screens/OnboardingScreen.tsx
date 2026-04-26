import React, { useState, useRef, useMemo, useEffect } from 'react';
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
} from 'phosphor-react-native';
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
import { ScreenEnterAnimation } from '../components/ScreenEnterAnimation';

const { width: SCREEN_W } = Dimensions.get('window');

// ─── Slide definitions ────────────────────────────────────────────────────────

const SLIDES = [
  {
    id: 'welcome',
    type: 'welcome' as const,
    title: 'Scan food.\nUnderstand your body.',
    subtitle:
      'Nouriva uses clinical AI to reveal what every meal does to your glucose, organs, and metabolism — in real time.',
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
    default: return <ShieldCheck size={size} color={color} weight="duotone" />;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

interface OnboardingScreenProps {
  onComplete: () => void;
}

export default function OnboardingScreen({ onComplete }: OnboardingScreenProps) {
  const C = useColors();
  const styles = useMemo(() => makeStyles(C), [C]);

  const [currentSlide, setCurrentSlide] = useState(0);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [sensitivityMulti, setSensitivityMulti] = useState<string[]>([]);

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
  const personalizingStarted = useRef(false);

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;
  const checkScale = useRef(new Animated.Value(0)).current;

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
        await saveDailyGoals(goals);
        await SecureStore.setItemAsync(METABOLIC_INPUTS_KEY, JSON.stringify(metabolicInput));
        profileUpdate.daily_goals = goals;

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

  function animateTransition(cb: () => void) {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: -20, duration: 180, useNativeDriver: true }),
    ]).start(() => {
      cb();
      slideAnim.setValue(20);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
      ]).start();
    });
  }

  const handleNext = () => {
    Haptics.selectionAsync();
    if (currentSlide < SLIDES.length - 1) {
      animateTransition(() => setCurrentSlide(currentSlide + 1));
    } else {
      onComplete();
    }
  };

  const handleBack = () => {
    if (currentSlide === 0) return;
    Haptics.selectionAsync();
    animateTransition(() => setCurrentSlide(currentSlide - 1));
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
    if (slide.type === 'question') return !!selections[slide.id];
    if (slide.type === 'multi_select') return true; // "none" is a valid answer; allow proceeding
    if (slide.type === 'body_stats') return isValidBodyStats(bodySex, bodyAge, bodyHeightCm, bodyWeightKg);
    if (slide.type === 'personalizing') return personalizingDone;
    return false;
  }, [slide, selections, sensitivityMulti, bodySex, bodyAge, bodyHeightCm, bodyWeightKg, personalizingDone]);

  const ctaLabel = useMemo(() => {
    if (slide.type === 'welcome') return 'Start My Profile';
    if (slide.type === 'body_stats') return 'Build My Plan';
    if (slide.type === 'personalizing') return 'Start Scanning';
    if (currentSlide === SLIDES.length - 1) return 'Start Scanning';
    return 'Continue';
  }, [slide.type, currentSlide]);

  // Don't show progress bar or back button on welcome or personalizing
  const showChrome = slide.type !== 'welcome' && slide.type !== 'personalizing';
  const isLastInput = slide.type === 'body_stats';

  // Sensitivity slide: selected goal label for context
  const goalLabel = GOAL_LABELS[selections['goal_selection']] ?? '';

  // Personalizing slide context
  const triggerCount = sensitivityMulti.filter(s => s !== 'none').length;
  const sensitivitySlideData = SLIDES.find(s => s.id === 'sensitivity');
  const triggerLabels = sensitivityMulti
    .filter(s => s !== 'none')
    .map(id => sensitivitySlideData?.options?.find(o => o.id === id)?.label ?? id);

  return (
    <ScreenEnterAnimation variant="fade">
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
                disabled={currentSlide === 0}
              >
                <CaretLeft size={20} color={C.textSecondary} weight="bold" />
              </TouchableOpacity>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${((currentSlide) / (SLIDES.length - 1)) * 100}%` }]} />
              </View>
              <View style={{ width: 36 }} />
            </View>
          )}

          <Animated.View
            style={[
              styles.content,
              slide.type === 'welcome' && styles.contentWelcome,
              slide.type === 'personalizing' && styles.contentPersonalizing,
              (slide.type === 'question' || slide.type === 'multi_select') && styles.contentQuestion,
              { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
            ]}
          >
            {/* ── Welcome ── */}
            {slide.type === 'welcome' && (
              <View style={styles.welcomeInner}>
                <Image source={require('../../assets/logo.png')} style={styles.welcomeLogo} resizeMode="contain" />
                <Text style={styles.welcomeTitle}>{slide.title}</Text>
                <Text style={styles.welcomeSubtitle}>{slide.subtitle}</Text>

                <View style={styles.featureList}>
                  {[
                    { icon: 'zap', title: 'Instant meal analysis', desc: 'Point, scan, and see exactly how your meal affects your body.' },
                    { icon: 'activity', title: 'Real glucose insights', desc: 'Track blood sugar response without a CGM — powered by your biology.' },
                    { icon: 'shield', title: 'Built for your health', desc: 'Personalized to your conditions, lab work, and goals.' },
                  ].map(({ icon, title, desc }) => (
                    <View key={title} style={styles.featureRow}>
                      <View style={styles.featureIconBox}>
                        <SlideIcon icon={icon} color={C.primary} size={18} />
                      </View>
                      <View style={styles.featureTextWrap}>
                        <Text style={styles.featureTitle}>{title}</Text>
                        <Text style={styles.featureDesc}>{desc}</Text>
                      </View>
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
                <View style={styles.optionsList}>
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
                </View>
              </View>
            )}

            {/* ── Multi-select (sensitivity) ── */}
            {slide.type === 'multi_select' && (
              <View style={styles.questionSlide}>
                <Text style={styles.questionTitle}>{slide.title}</Text>
                <Text style={styles.questionSubtitle}>{slide.subtitle}</Text>
                <View style={styles.optionsList}>
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
                </View>
                {sensitivityMulti.length === 0 && (
                  <Text style={styles.multiSelectHint}>Tap any that apply, or tap "No specific triggers" to skip.</Text>
                )}
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
          </Animated.View>

          {/* ── CTA button ── */}
          {(slide.type !== 'personalizing' || personalizingDone) && (
            <View style={[styles.footer, slide.type === 'welcome' && styles.footerWelcome]}>
              <TouchableOpacity
                style={[styles.nextButton, !canProceed && styles.nextButtonDisabled]}
                onPress={handleNext}
                disabled={!canProceed}
                activeOpacity={0.85}
              >
                <Text style={styles.nextButtonText}>{ctaLabel}</Text>
                <ArrowRight size={20} color="#FFF" weight="bold" />
              </TouchableOpacity>
              {slide.type === 'welcome' && (
                <Text style={styles.welcomeFooterNote}>
                  Free to start · Personalised to your biology
                </Text>
              )}
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
    contentPersonalizing: {
      justifyContent: 'center',
      paddingHorizontal: 24,
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
      marginBottom: 32,
      paddingHorizontal: 8,
    },
    featureList: {
      width: '100%',
      gap: 18,
      paddingHorizontal: 4,
    },
    featureRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 14,
    },
    featureIconBox: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: C.primaryLight,
      justifyContent: 'center',
      alignItems: 'center',
      flexShrink: 0,
    },
    featureTextWrap: {
      flex: 1,
      paddingTop: 2,
    },
    featureTitle: {
      fontSize: 15,
      fontWeight: '800',
      color: C.textPrimary,
      marginBottom: 3,
      letterSpacing: -0.2,
    },
    featureDesc: {
      fontSize: 13,
      color: C.textSecondary,
      lineHeight: 19,
    },

    // Question / multi-select slides
    questionSlide: { paddingBottom: 12 },
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
    optionsList: { gap: 9 },
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
    welcomeFooterNote: {
      fontSize: 12,
      color: C.textTertiary,
      textAlign: 'center',
      marginTop: 12,
    },
  });
}
