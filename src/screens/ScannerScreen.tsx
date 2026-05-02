import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Linking,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import { CameraIcon as Camera, ScanIcon as Scan, LightningIcon as Lightning, ImageIcon as PhosphorImage, PlusIcon as Plus, SparkleIcon as Sparkle } from 'phosphor-react-native';
import { analyzeFoodImage, analyzeFoodText } from '../utils/llm';
import { isTrialActive } from '../utils/trialStatus';
import { isAnalysisIncomplete, getAnalysisFailureMessage } from '../utils/analysisResult';
import { useColors, AppColors } from '../theme';
import { ScreenEnterAnimation } from '../components/ScreenEnterAnimation';
import { useFocusEffect, useRoute } from '@react-navigation/native';
import { navigateFromTabs } from '../navigation/rootNavigation';
import { getTodayScanCount } from '../utils/history';
import { presentPaywall } from '../integrations/purchases';

export default function ScannerScreen({ navigation }: any) {
  const route = useRoute<any>();
  const C = useColors();
  const styles = useMemo(() => makeStyles(C), [C]);

  const [permission, requestPermission] = useCameraPermissions();
  const [isScanning, setIsScanning] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(true);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanStage, setScanStage] = useState('Getting your scan ready...');
  const [scanDone, setScanDone] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  const [manualModalVisible, setManualModalVisible] = useState(false);
  const [manualFoodName, setManualFoodName] = useState('');
  const [manualQuantity, setManualQuantity] = useState('1 serving');
  const [isAnalyzingManual, setIsAnalyzingManual] = useState(false);
  const [manualAnalysisProgress, setManualAnalysisProgress] = useState(0);

  useEffect(() => {
    if (!isAnalyzingManual) {
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
  }, [isAnalyzingManual]);

  const handleManualLog = async () => {
    if (!manualFoodName.trim() || isAnalyzingManual) return;
    setIsAnalyzingManual(true);
    try {
      const isPro = (await SecureStore.getItemAsync('isPro')) === 'true';
      const trialActive = await isTrialActive();
      
      if (!isPro) {
        if (trialActive) {
          // Trial limit: 20 total
          const totalCount = await import('../utils/history').then(m => m.getScanCount());
          if (totalCount >= 20) {
            setIsAnalyzingManual(false);
            Alert.alert(
              'Trial Limit Reached',
              'You have reached the 20-scan limit for your 3-day trial. Upgrade to Pro for unlimited metabolic intelligence.',
              [
                { text: 'Maybe Later', style: 'cancel' },
                { text: 'Upgrade to Pro', onPress: () => void presentPaywall() },
              ]
            );
            return;
          }
        } else {
          // Post-trial limit: 1 per day
          const todayCount = await getTodayScanCount();
          if (todayCount >= 1) {
            setIsAnalyzingManual(false);
            Alert.alert(
              'Daily Limit Reached',
              'Free users can log 1 meal per day after the trial. Upgrade to Pro for unlimited metabolic scans.',
              [
                { text: 'Maybe Later', style: 'cancel' },
                { text: 'Upgrade to Pro', onPress: () => void presentPaywall() },
              ]
            );
            return;
          }
        }
      }

      let profileContext: string[] = [];

      if (isPro || trialActive) {
        const [conditions, bio, insights] = await Promise.all([
          SecureStore.getItemAsync('medicalConditions'),
          SecureStore.getItemAsync('healthContext'),
          SecureStore.getItemAsync('reportInsights'),
        ]);
        if (conditions) {
          try {
            const parsed = JSON.parse(conditions);
            if (Array.isArray(parsed)) profileContext = parsed.map((condition) => `SELECTED_CONDITION: ${condition}`);
          } catch (e) { console.warn('Manual Log: Conditions parse error', e); }
        }
        if (bio) profileContext.push(`FREE_TEXT_PROFILE_NOTES: ${bio}`);
        if (insights) profileContext.push(`AUTO_EXTRACTED_FROM_MEDICAL_REPORTS: ${insights}`);
      }
      const fullText = `${manualQuantity} of ${manualFoodName}`;
      const analysis = await analyzeFoodText(fullText, profileContext);
      if (isAnalysisIncomplete(analysis)) {
        Alert.alert('Could not analyse', getAnalysisFailureMessage(analysis));
        return;
      }
      setManualModalVisible(false);
      setManualFoodName('');
      setManualQuantity('1 serving');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      
      // Brief delay to allow modal close animation to finish before navigation
      await new Promise(resolve => setTimeout(resolve, 300));
      
      navigateFromTabs(navigation, 'Results', {
        result: analysis,
        isPersonalized: profileContext.length > 0,
      });
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to analyse. Please try again.');
    } finally {
      setIsAnalyzingManual(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (route.params?.openCamera) {
        setIsCameraActive(true);
        navigation.setParams({ openCamera: undefined });
      }
    }, [route.params?.openCamera, navigation])
  );

  const loadingStages = [
    { p: 12, text: 'Getting your photo ready...' },
    { p: 35, text: 'Spotting foods and portions...' },
    { p: 58, text: 'Estimating how this meal lands for you...' },
    { p: 76, text: 'Analyzing your meal...' },
    { p: 90, text: 'Almost there...' },
  ];

  useEffect(() => {
    let interval: any;
    if (isScanning) {
      setScanProgress(0);
      setScanDone(false);
      setScanStage(loadingStages[0].text);
      interval = setInterval(() => {
        setScanProgress((prev) => {
          if (prev >= 90) return 90; 
          const step = prev < 50 ? 1.5 : prev < 76 ? 0.8 : 0.3;
          const next = Math.min(prev + Math.random() * step, 90);
          const stage = loadingStages.find((s) => next <= s.p) || loadingStages[4];
          setScanStage(stage.text);
          return next;
        });
      }, 300);
    } else {
      clearInterval(interval);
      if (!scanDone) setScanProgress(0);
    }
    return () => clearInterval(interval);
  }, [isScanning]);

  if (!permission) {
    return (
      <ScreenEnterAnimation variant="fade">
        <View style={styles.container} />
      </ScreenEnterAnimation>
    );
  }

  if (!permission.granted) {
    return (
      <ScreenEnterAnimation variant="fade">
      <View style={styles.permissionContainer}>
        <Camera color="#6366F1" weight="duotone" size={48} style={{ marginBottom: 20 }} />
        <Text style={styles.permissionTitle}>Camera Access Needed</Text>
        <Text style={styles.permissionMessage}>
          We need camera permission to scan your meals and unlock full meal analysis.
        </Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>Continue</Text>
        </TouchableOpacity>
      </View>
      </ScreenEnterAnimation>
    );
  }

  const pickImage = async () => {
    const { status, canAskAgain } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Photo library access',
        'Nouriva AI needs access to your photos so you can pick an image from your gallery.',
        [
          { text: 'Not now', style: 'cancel' },
          ...(canAskAgain === false
            ? [{ text: 'Open Settings', onPress: () => Linking.openSettings() }]
            : []),
        ]
      );
      return;
    }

    // Android: `allowsEditing: true` often forces a file/crop flow instead of the system photo gallery.
    // `legacy: false` uses the modern photo picker (gallery). `defaultTab: 'photos'` opens the grid first.
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: Platform.OS === 'ios',
      quality: 0.85,
      base64: false,
      ...(Platform.OS === 'android'
        ? { legacy: false as const, defaultTab: 'photos' as const }
        : {}),
    });
    if (!result.canceled && result.assets[0]?.uri) {
      processImage(result.assets[0].uri);
    }
  };

  const handleScan = async () => {
    if (!cameraRef.current) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsScanning(true);
    try {
      if (!cameraRef.current || typeof cameraRef.current.takePictureAsync !== 'function') {
        throw new Error('Camera not ready. Please try again.');
      }
      const photo = await cameraRef.current.takePictureAsync({ base64: false, quality: 0.8 });
      if (photo?.uri) processImage(photo.uri);
    } catch (error: any) {
      Alert.alert('Analysis Failed', error.message || 'Something went wrong during analysis');
      setIsScanning(false);
    }
  };

  const processImage = async (uri: string) => {
    setIsScanning(true);
    try {
      const manipResult = await manipulateAsync(
        uri,
        [{ resize: { width: 512 } }],
        { compress: 0.4, format: SaveFormat.JPEG, base64: true }
      );
      if (manipResult.base64) {
        let profileContext: string[] = [];
        try {
          const isPro = (await SecureStore.getItemAsync('isPro')) === 'true';
          const trialActive = await isTrialActive();
          
          if (!isPro) {
            if (trialActive) {
              // Trial limit: 20 total
              const totalCount = await import('../utils/history').then(m => m.getScanCount());
              if (totalCount >= 20) {
                setIsScanning(false);
                Alert.alert(
                  'Trial Limit Reached',
                  'You have reached the 20-scan limit for your 3-day trial. Upgrade to Pro for unlimited metabolic intelligence.',
                  [
                    { text: 'Maybe Later', style: 'cancel' },
                    { text: 'Upgrade to Pro', onPress: () => void presentPaywall() },
                  ]
                );
                return;
              }
            } else {
              // Post-trial limit: 1 per day
              const todayCount = await getTodayScanCount();
              if (todayCount >= 1) {
                setIsScanning(false);
                Alert.alert(
                  'Daily Limit Reached',
                  'Free users can log 1 meal per day after the trial. Upgrade to Pro for unlimited metabolic scans.',
                  [
                    { text: 'Maybe Later', style: 'cancel' },
                    { text: 'Upgrade to Pro', onPress: () => void presentPaywall() },
                  ]
                );
                return;
              }
            }
          }

          if (isPro || trialActive) {
            const [storedConditions, storedBio, storedInsights] = await Promise.all([
              SecureStore.getItemAsync('medicalConditions'),
              SecureStore.getItemAsync('healthContext'),
              SecureStore.getItemAsync('reportInsights'),
            ]);
            if (storedConditions) {
              const parsed = JSON.parse(storedConditions);
              if (Array.isArray(parsed)) profileContext = parsed.map((condition) => `SELECTED_CONDITION: ${condition}`);
            }
            if (storedBio) profileContext.push(`FREE_TEXT_PROFILE_NOTES: ${storedBio}`);
            if (storedInsights) profileContext.push(`AUTO_EXTRACTED_FROM_MEDICAL_REPORTS: ${storedInsights}`);
          }
        } catch (e) { console.error('Profile Context Error:', e); }

        const analysisResult = await analyzeFoodImage([manipResult.base64], profileContext);
        setScanProgress(100);
        setScanStage('Ready');
        setScanDone(true);
        await new Promise(r => setTimeout(r, 420));
        navigateFromTabs(navigation, 'Results', {
          result: analysisResult,
          originalImageUri: manipResult.uri,
          isPersonalized: profileContext.length > 0,
        });
      }
    } catch (error: any) {
      Alert.alert('Processing Failed', error.message || 'Could not analyse the provided image');
    } finally {
      setIsScanning(false);
      setScanDone(false);
    }
  };

  const handleStartCamera = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setIsCameraActive(true);
  };

  const renderCameraFrame = () => (
    <View style={styles.frameGuide}>
      <View style={[styles.frameCorner, styles.frameTopLeft]} />
      <View style={[styles.frameCorner, styles.frameTopRight]} />
      <View style={[styles.frameCorner, styles.frameBottomLeft]} />
      <View style={[styles.frameCorner, styles.frameBottomRight]} />
    </View>
  );

  const renderIdleHome = () => (
    <View style={styles.idleStage}>
      <View style={styles.idleCopy}>
        <Text style={styles.heroTitle}>Scan a meal. Get the impact fast.</Text>
      </View>

      <View style={styles.scanSurface}>
        <View style={styles.heroAmbientOne} />
        <View style={styles.heroAmbientTwo} />
        <View style={[styles.scanMarker, styles.scanMarkerTopLeft]} />
        <View style={[styles.scanMarker, styles.scanMarkerTopRight]} />
        <View style={[styles.scanMarker, styles.scanMarkerBottomLeft]} />
        <View style={[styles.scanMarker, styles.scanMarkerBottomRight]} />
        <View style={styles.scanSurfaceCenter}>
          <View style={styles.scanPulseRing}>
            <Scan color={C.primary} size={30} weight="duotone" />
          </View>
          <Text style={styles.scanSurfaceTitle}>Point at your meal</Text>
        </View>
      </View>

      <View style={styles.idleActions}>
        <TouchableOpacity
          style={styles.primaryCta}
          onPress={handleStartCamera}
          activeOpacity={0.9}
        >
          <Camera color="#FFFFFF" size={18} weight="bold" />
          <Text style={styles.primaryCtaText}>Scan Food</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryCta}
          onPress={pickImage}
          activeOpacity={0.9}
        >
          <PhosphorImage color={C.textPrimary} size={17} weight="bold" />
          <Text style={styles.secondaryCtaText}>Upload Photo</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <ScreenEnterAnimation variant="fade">
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View style={styles.headerCenter}>
          <Image source={require('../../assets/logo.png')} style={styles.logo} resizeMode="contain" />
          <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit>
            Nouriva AI
          </Text>
        </View>
      </View>

      <View style={styles.cameraContainer}>
        <CameraView style={styles.camera} facing="back" ref={cameraRef} />
        <View style={[styles.overlay, StyleSheet.absoluteFill]}>{renderCameraFrame()}</View>
      </View>

      <View style={[styles.footer, !isCameraActive && { minHeight: 20, paddingTop: 0 }]}>
        <TouchableOpacity style={styles.galleryButton} onPress={pickImage} disabled={isScanning}>
          <PhosphorImage color={C.scannerText} size={22} weight="bold" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.captureButton}
          onPress={handleScan}
          disabled={isScanning}
          activeOpacity={0.85}
        >
          {isScanning ? (
            <ActivityIndicator color="#FFF" size="small" />
          ) : (
            <>
              <Camera color="#FFF" size={20} weight="bold" />
              <Text style={styles.captureText}>Scan Meal or Food Label</Text>
            </>
          )}
        </TouchableOpacity>
        <TouchableOpacity style={styles.galleryButton} onPress={() => { Haptics.selectionAsync(); setManualModalVisible(true); }} disabled={isScanning}>
          <Plus color={C.scannerText} size={22} weight="bold" />
        </TouchableOpacity>
      </View>

      {isScanning && (
        <View style={styles.scanningOverlay}>
          <View style={styles.progressCircleContainer}>
            <ActivityIndicator
              color="#34D399"
              size="large"
              style={styles.spinner}
            />
            <View style={styles.percentageContainer}>
              <Text style={styles.percentageText}>{Math.floor(scanProgress)}%</Text>
            </View>
          </View>
          <Text style={[styles.scanningText, scanDone && { color: '#34D399' }]}>{scanStage}</Text>
          <Text style={styles.scanningDisclaimer}>
            {scanDone ? 'OPENING RESULTS' : 'ANALYZING YOUR MEAL'}
          </Text>
        </View>
      )}
      <Modal visible={manualModalVisible} animationType="slide" transparent statusBarTranslucent>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Quick Log Meal</Text>
              <TouchableOpacity onPress={() => setManualModalVisible(false)} style={{ padding: 4 }}>
                <Text style={styles.modalCancel}>Cancel</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody} contentContainerStyle={{ paddingBottom: 80 }} showsVerticalScrollIndicator={false}>
              <Text style={styles.inputLabel}>WHAT DID YOU EAT?</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Grilled Chicken Salad"
                placeholderTextColor={C.textTertiary}
                value={manualFoodName}
                onChangeText={setManualFoodName}
                autoFocus
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
                style={[styles.saveBtn, (!manualFoodName.trim() || isAnalyzingManual) && { opacity: 0.5 }]}
                onPress={handleManualLog}
                disabled={!manualFoodName.trim() || isAnalyzingManual}
              >
                {isAnalyzingManual ? (
                  <View style={styles.saveBtnLoadingContent}>
                    <ActivityIndicator color="#FFF" size="small" />
                    <Text style={styles.saveBtnText}>Analyzing {manualAnalysisProgress}%</Text>
                  </View>
                ) : (
                  <Text style={styles.saveBtnText}>Analyze & View Results</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
    </ScreenEnterAnimation>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: C.scannerBg,
    },
    permissionContainer: {
      flex: 1,
      backgroundColor: C.scannerBg,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 32,
    },
    permissionTitle: {
      fontSize: 22,
      fontWeight: '800',
      color: C.textPrimary,
      marginBottom: 12,
      textAlign: 'center',
    },
    permissionMessage: {
      fontSize: 15,
      color: '#9CA3AF',
      textAlign: 'center',
      lineHeight: 22,
      marginBottom: 32,
    },
    permissionButton: {
      backgroundColor: '#6366F1',
      paddingHorizontal: 32,
      paddingVertical: 16,
      borderRadius: 16,
      alignItems: 'center',
    },
    permissionButtonText: {
      color: '#FFF',
      fontSize: 16,
      fontWeight: '700',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 20,
      paddingTop: 8,
      paddingBottom: 10,
    },
    headerCenter: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    logo: {
      width: 32,
      height: 32,
      borderRadius: 8,
    },
    title: {
      color: C.scannerText,
      fontSize: 19,
      fontWeight: '800',
      letterSpacing: 0.3,
    },
    cameraContainer: {
      flex: 1,
      borderRadius: 28,
      overflow: 'hidden',
      marginHorizontal: 12,
      backgroundColor: C.scannerSurface,
      borderWidth: 1,
      borderColor: C.scannerBorder,
      marginBottom: 10,
    },
    camera: {
      flex: 1,
    },
    overlay: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'rgba(0,0,0,0.12)',
    },
    footer: {
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 24,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 80,
    },
    galleryButton: {
      width: 48,
      height: 48,
      borderRadius: 16,
      backgroundColor: C.bgSecondary,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: C.border,
    },
    captureButton: {
      backgroundColor: C.vitality,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 16,
      paddingHorizontal: 12,
      borderRadius: 999,
      flex: 1,
      marginHorizontal: 8,
      gap: 8,
      shadowColor: C.vitality,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.4,
      shadowRadius: 10,
      elevation: 6,
    },
    captureText: {
      color: '#FFF',
      fontSize: 15,
      fontWeight: '800',
      letterSpacing: 0.2,
    },
    closeButton: {
      width: 48,
      height: 48,
      justifyContent: 'center',
      alignItems: 'center',
    },
    closeText: {
      color: C.scannerTextMuted,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 1,
    },
    idleFooter: {
      flex: 1,
      minHeight: 12,
    },
    /** Centers the idle hero + scan frame + CTAs vertically inside the dark card */
    idleOuterCenter: {
      flex: 1,
      width: '100%',
      minHeight: 0,
      justifyContent: 'center',
    },
    idleStage: {
      width: '100%',
    },
    idleCopy: {
      paddingHorizontal: 18,
      paddingTop: 14,
      paddingBottom: 16,
    },
    heroAmbientOne: {
      position: 'absolute',
      width: 220,
      height: 220,
      borderRadius: 110,
      backgroundColor: 'rgba(99,102,241,0.14)',
      top: -70,
      right: -40,
    },
    heroAmbientTwo: {
      position: 'absolute',
      width: 180,
      height: 180,
      borderRadius: 90,
      backgroundColor: 'rgba(16,185,129,0.10)',
      bottom: -75,
      left: -30,
    },
    heroTitle: {
      color: C.scannerText,
      fontSize: 29,
      lineHeight: 33,
      fontWeight: '900',
      letterSpacing: -0.7,
      maxWidth: '92%',
    },
    scanSurface: {
      minHeight: 260,
      borderRadius: 0,
      backgroundColor: 'transparent',
      position: 'relative',
      overflow: 'hidden',
      justifyContent: 'center',
      alignItems: 'center',
    },
    scanSurfaceCenter: {
      alignItems: 'center',
      paddingHorizontal: 20,
    },
    scanPulseRing: {
      width: 78,
      height: 78,
      borderRadius: 39,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'rgba(99,102,241,0.12)',
      borderWidth: 1,
      borderColor: 'rgba(99,102,241,0.25)',
      marginBottom: 16,
    },
    scanSurfaceTitle: {
      color: C.scannerText,
      fontSize: 18,
      fontWeight: '800',
      marginBottom: 6,
      letterSpacing: -0.2,
    },
    scanMarker: {
      position: 'absolute',
      width: 28,
      height: 28,
      borderColor: 'rgba(255,255,255,0.55)',
    },
    scanMarkerTopLeft: {
      top: 18,
      left: 18,
      borderTopWidth: 2,
      borderLeftWidth: 2,
      borderTopLeftRadius: 12,
    },
    scanMarkerTopRight: {
      top: 18,
      right: 18,
      borderTopWidth: 2,
      borderRightWidth: 2,
      borderTopRightRadius: 12,
    },
    scanMarkerBottomLeft: {
      bottom: 18,
      left: 18,
      borderBottomWidth: 2,
      borderLeftWidth: 2,
      borderBottomLeftRadius: 12,
    },
    scanMarkerBottomRight: {
      bottom: 18,
      right: 18,
      borderBottomWidth: 2,
      borderRightWidth: 2,
      borderBottomRightRadius: 12,
    },
    primaryCta: {
      height: 54,
      borderRadius: 18,
      backgroundColor: C.primary,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
      shadowColor: C.primary,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.24,
      shadowRadius: 14,
      elevation: 6,
    },
    primaryCtaText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '800',
    },
    idleActions: {
      paddingHorizontal: 18,
      paddingTop: 24,
      paddingBottom: 22,
      gap: 12,
    },
    secondaryCta: {
      height: 48,
      borderRadius: 16,
      backgroundColor: 'rgba(255,255,255,0.92)',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
      marginTop: 10,
    },
    secondaryCtaText: {
      color: '#0F172A',
      fontSize: 15,
      fontWeight: '700',
    },
    frameGuide: {
      width: '78%',
      aspectRatio: 1,
      position: 'relative',
      alignItems: 'center',
      justifyContent: 'center',
    },
    frameCorner: {
      position: 'absolute',
      width: 42,
      height: 42,
      borderColor: C.scannerText,
    },
    frameTopLeft: {
      top: 0,
      left: 0,
      borderTopWidth: 3,
      borderLeftWidth: 3,
      borderTopLeftRadius: 14,
    },
    frameTopRight: {
      top: 0,
      right: 0,
      borderTopWidth: 3,
      borderRightWidth: 3,
      borderTopRightRadius: 14,
    },
    frameBottomLeft: {
      bottom: 0,
      left: 0,
      borderBottomWidth: 3,
      borderLeftWidth: 3,
      borderBottomLeftRadius: 14,
    },
    frameBottomRight: {
      bottom: 0,
      right: 0,
      borderBottomWidth: 3,
      borderRightWidth: 3,
      borderBottomRightRadius: 14,
    },
    scanningOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: C.overlay,
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 10,
    },
    progressCircleContainer: {
      width: 152,
      height: 152,
      justifyContent: 'center',
      alignItems: 'center',
    },
    spinner: {
      transform: [{ scale: 1.58 }],
    },
    percentageContainer: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      justifyContent: 'center',
      alignItems: 'center',
    },
    percentageText: {
      color: '#34D399',
      fontSize: 15,
      fontWeight: '800',
      letterSpacing: 0.2,
    },
    scanningText: {
      color: '#FFF',
      marginTop: 24,
      fontSize: 17,
      fontWeight: '700',
      letterSpacing: 0.3,
    },
    scanningDisclaimer: {
      color: '#4B5563',
      fontSize: 11,
      marginTop: 10,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1.2,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'flex-end',
    },
    modalContent: {
      backgroundColor: C.bg,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      maxHeight: '80%',
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 20,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
    },
    modalTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: C.textPrimary,
    },
    modalCancel: {
      fontSize: 15,
      color: C.primary,
      fontWeight: '600',
    },
    modalBody: {
      padding: 20,
    },
    inputLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: C.textTertiary,
      letterSpacing: 0.8,
      marginBottom: 8,
      marginTop: 16,
    },
    textInput: {
      backgroundColor: C.surface,
      borderRadius: 12,
      padding: 14,
      fontSize: 15,
      color: C.textPrimary,
      borderWidth: 1,
      borderColor: C.border,
    },
    aiNotice: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 20,
      padding: 12,
      backgroundColor: C.primaryLight,
      borderRadius: 12,
    },
    aiNoticeText: {
      flex: 1,
      fontSize: 13,
      color: C.primary,
      fontWeight: '500',
    },
    saveBtn: {
      backgroundColor: C.primary,
      borderRadius: 14,
      padding: 16,
      alignItems: 'center',
      marginTop: 20,
    },
    saveBtnLoadingContent: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    saveBtnText: {
      color: C.textOnPrimary,
      fontSize: 16,
      fontWeight: '700',
    },
  });
}
