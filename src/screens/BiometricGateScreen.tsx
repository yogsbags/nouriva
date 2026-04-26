import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  InteractionManager,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Haptics from 'expo-haptics';
import { ShieldIcon as Shield, SignOutIcon as SignOut } from 'phosphor-react-native';
import { useColors, AppColors } from '../theme';
import { ScreenEnterAnimation } from '../components/ScreenEnterAnimation';

type Props = {
  onUnlocked: () => void;
  onSignOut: () => void;
};

export default function BiometricGateScreen({ onUnlocked, onSignOut }: Props) {
  const C = useColors();
  const styles = useMemo(() => makeStyles(C), [C]);
  const [methodLabel, setMethodLabel] = useState('Face ID');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
        if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
          setMethodLabel(Platform.OS === 'ios' ? 'Face ID' : 'Face unlock');
        } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
          setMethodLabel(Platform.OS === 'ios' ? 'Touch ID' : 'Fingerprint');
        }
      } catch {
        /* keep default */
      }
    })();
  }, []);

  const promptUnlock = useCallback(async () => {
    setErrorMsg('');
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock Nouriva AI',
        fallbackLabel: '',
        cancelLabel: 'Cancel',
        disableDeviceFallback: false,
      });

      if (result.success) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onUnlocked();
        return;
      }

      // Surface the reason so the user isn't left wondering
      const err = (result as any).error as string | undefined;
      if (err === 'lockout' || err === 'permanent_lockout') {
        setErrorMsg('Too many attempts — use your passcode to unlock.');
      } else if (err === 'not_enrolled') {
        setErrorMsg('No Face ID enrolled on this device. Sign out and re-enable biometrics in Settings.');
      } else if (err === 'not_available') {
        setErrorMsg('Face ID is not available. Check Settings → Face ID & Passcode.');
      } else if (err !== 'user_cancel' && err !== 'system_cancel') {
        setErrorMsg('Face ID failed. Tap "Try again" or sign out.');
      }
    } catch (e: any) {
      const msg: string = e?.message ?? '';
      if (msg.includes('NSFaceIDUsageDescription')) {
        setErrorMsg('Face ID permission is missing — a fresh build is needed. Sign out for now.');
      } else {
        setErrorMsg('Authentication error. Tap "Try again" or sign out.');
      }
      console.error('BiometricGateScreen', e);
    }
  }, [onUnlocked]);

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      requestAnimationFrame(() => {
        void promptUnlock();
      });
    });
    return () => task.cancel();
  }, [promptUnlock]);

  return (
    <ScreenEnterAnimation variant="fade">
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <View style={styles.iconRing}>
            <Image source={require('../../assets/logo.png')} style={styles.logo} resizeMode="contain" />
          </View>
          <Text style={styles.title}>Unlock Nouriva AI</Text>
          <Text style={styles.subtitle}>
            {methodLabel} keeps your scans and profile private on this device.
          </Text>

          {errorMsg ? (
            <Text style={styles.errorText}>{errorMsg}</Text>
          ) : null}

          <TouchableOpacity style={styles.primaryBtn} onPress={promptUnlock} activeOpacity={0.88}>
            <Shield size={20} color="#FFF" weight="duotone" />
            <Text style={styles.primaryBtnText}>Try again</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.signOutBtn} onPress={onSignOut} activeOpacity={0.8}>
            <SignOut size={18} color={C.textSecondary} weight="bold" />
            <Text style={styles.signOutText}>Sign out</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </ScreenEnterAnimation>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: C.bg,
      justifyContent: 'center',
    },
    content: {
      paddingHorizontal: 28,
      alignItems: 'center',
    },
    iconRing: {
      width: 88,
      height: 88,
      borderRadius: 24,
      backgroundColor: C.primaryLight,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 24,
      borderWidth: 1,
      borderColor: C.primaryMuted,
    },
    logo: { width: 48, height: 48, borderRadius: 12 },
    title: {
      fontSize: 22,
      fontWeight: '800',
      color: C.textPrimary,
      textAlign: 'center',
      marginBottom: 10,
    },
    subtitle: {
      fontSize: 15,
      color: C.textSecondary,
      textAlign: 'center',
      lineHeight: 22,
      marginBottom: 16,
      paddingHorizontal: 8,
    },
    errorText: {
      fontSize: 13,
      color: '#EF4444',
      textAlign: 'center',
      marginBottom: 16,
      paddingHorizontal: 8,
      lineHeight: 18,
    },
    primaryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      backgroundColor: C.primary,
      paddingVertical: 16,
      paddingHorizontal: 28,
      borderRadius: 16,
      width: '100%',
      maxWidth: 320,
    },
    primaryBtnText: {
      color: '#FFF',
      fontSize: 17,
      fontWeight: '700',
    },
    signOutBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 28,
      paddingVertical: 12,
      paddingHorizontal: 16,
    },
    signOutText: {
      fontSize: 16,
      fontWeight: '600',
      color: C.textSecondary,
    },
  });
}
