import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  Image,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../utils/supabase';
import {
  saveBiometricLoginSnapshot,
  signInWithBiometric,
  readBiometricLoginSnapshot,
} from '../utils/biometricLogin';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import * as AppleAuthentication from 'expo-apple-authentication';
import Svg, { Path } from 'react-native-svg';
import {
  EnvelopeIcon as Envelope,
  LockSimpleIcon as LockSimple,
  ArrowRightIcon as ArrowRight,
  SparkleIcon as Sparkle,
  ShieldIcon as Shield,
  AppleLogoIcon as AppleLogoIcon,
} from 'phosphor-react-native';

function GoogleLogo({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <Path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <Path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <Path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </Svg>
  );
}
import { useColors, AppColors } from '../theme';
import { TERMS_URL, PRIVACY_URL as PRIVACY_POLICY_URL } from '../constants/legal';

const GOOGLE_WEB_CLIENT_ID = (process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '').trim();
const GOOGLE_IOS_CLIENT_ID = (process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '').trim();

if (GOOGLE_WEB_CLIENT_ID && GOOGLE_IOS_CLIENT_ID) {
  GoogleSignin.configure({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    iosClientId: GOOGLE_IOS_CLIENT_ID,
    scopes: ['email', 'profile'],
  });
}

export default function AuthScreen() {
  const C = useColors();
  const styles = useMemo(() => makeStyles(C), [C]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [biometricBusy, setBiometricBusy] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [biometricLoginAvailable, setBiometricLoginAvailable] = useState(false);
  const [biometricMethodLabel, setBiometricMethodLabel] = useState('Biometric');

  /** iOS Fabric: updating parent layout (focus ring) in the same tick as onFocus can drop TextInput focus. */
  const focusHighlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleFocusHighlight = useCallback((field: 'email' | 'password') => {
    if (focusHighlightTimerRef.current) {
      clearTimeout(focusHighlightTimerRef.current);
      focusHighlightTimerRef.current = null;
    }
    const delay = Platform.OS === 'ios' ? 50 : 0;
    focusHighlightTimerRef.current = setTimeout(() => {
      focusHighlightTimerRef.current = null;
      setFocusedField(field);
    }, delay);
  }, []);

  const clearFocusHighlight = useCallback(() => {
    if (focusHighlightTimerRef.current) {
      clearTimeout(focusHighlightTimerRef.current);
      focusHighlightTimerRef.current = null;
    }
    setFocusedField(null);
  }, []);

  useEffect(
    () => () => {
      if (focusHighlightTimerRef.current) clearTimeout(focusHighlightTimerRef.current);
    },
    []
  );

  const refreshBiometricLoginAvailability = useCallback(async () => {
    const [snapshot, hasHardware, enrolled] = await Promise.all([
      readBiometricLoginSnapshot(),
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ]);
    setBiometricLoginAvailable(Boolean(snapshot && hasHardware && enrolled));
  }, []);

  useEffect(() => {
    void refreshBiometricLoginAvailability();
  }, [refreshBiometricLoginAvailability]);

  useEffect(() => {
    void (async () => {
      try {
        const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
        if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
          setBiometricMethodLabel(Platform.OS === 'ios' ? 'Face ID' : 'Face unlock');
        } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
          setBiometricMethodLabel(Platform.OS === 'ios' ? 'Touch ID' : 'Fingerprint');
        }
      } catch {
        /* keep default */
      }
    })();
  }, []);

  async function handleForgotPassword() {
    if (!email) {
      Alert.alert('Enter your email', 'Type your email address above, then tap Forgot Password.');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) throw error;
      Alert.alert('Reset Email Sent', 'Check your inbox for a password reset link.');
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    setGoogleLoading(true);
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      await GoogleSignin.signIn();
      const { idToken } = await GoogleSignin.getTokens();
      if (!idToken) throw new Error('No ID token returned from Google.');

      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: idToken,
      });
      if (error) throw error;

      if (data.session) {
        await saveBiometricLoginSnapshot(data.session);
        await refreshBiometricLoginAvailability();
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error: any) {
      if (error.code === statusCodes.SIGN_IN_CANCELLED) return;
      if (error.code === statusCodes.IN_PROGRESS) return;
      if (error.code === '10' || String(error.message ?? '').includes('DEVELOPER_ERROR')) {
        Alert.alert(
          'Google Sign-In Error',
          'Google sign-in is not configured for this build. Install the latest build, or check that the Android package name, signing SHA-1, and Google OAuth client IDs match Firebase.',
        );
        return;
      }
      Alert.alert('Google Sign-In Error', error.message);
    } finally {
      setGoogleLoading(false);
    }
  }

  async function handleAppleSignIn() {
    if (!(await AppleAuthentication.isAvailableAsync())) {
      Alert.alert('Apple Sign-In Unavailable', 'Sign in with Apple is not available on this device.');
      return;
    }
    setAppleLoading(true);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) throw new Error('No identity token returned from Apple.');
      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
      });
      if (error) throw error;
      if (data.session) {
        await saveBiometricLoginSnapshot(data.session);
        await refreshBiometricLoginAvailability();
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error: any) {
      if (error.code === 'ERR_REQUEST_CANCELED') return;
      Alert.alert('Apple Sign-In Error', error.message);
    } finally {
      setAppleLoading(false);
    }
  }

  async function handleAuth() {
    if (!email || !password) {
      Alert.alert('Missing fields', 'Please fill in your email and password.');
      return;
    }
    setLoading(true);
    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        // If email confirmation is off, Supabase returns a session and the app proceeds via onAuthStateChange.
        if (data.session) {
          await saveBiometricLoginSnapshot(data.session);
          await refreshBiometricLoginAvailability();
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else {
          Alert.alert('Check your email', 'We sent a confirmation link to activate your account.');
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (data.session) {
          await saveBiometricLoginSnapshot(data.session);
          await refreshBiometricLoginAvailability();
        }
      }
    } catch (error: any) {
      Alert.alert('Authentication Error', error.message);
    } finally {
      setLoading(false);
    }
  }

  const handleBiometricLogin = async () => {
    setBiometricBusy(true);
    try {
      const res = await signInWithBiometric();
      if (res.ok) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        return;
      }
      if (res.error === 'cancelled') return;
      if (res.error === 'no_session' || res.error === 'no_biometric') {
        Alert.alert(
          'Sign in with password first',
          'Use your email and password once on this device. After that you can use ' + biometricMethodLabel + ' here.',
        );
        return;
      }
      Alert.alert(
        'Unable to sign in',
        'Your saved session may have expired. Sign in with email and password, then try again.',
      );
    } finally {
      setBiometricBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.kav}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="always"
        keyboardDismissMode={Platform.OS === 'ios' ? 'none' : 'on-drag'}
        showsVerticalScrollIndicator={false}
        bounces={Platform.OS === 'ios'}
        automaticallyAdjustKeyboardInsets={false}
      >
        <View style={styles.header}>
          <View style={styles.logoWrapper}>
            <Image source={require('../../assets/logo.png')} style={styles.logo} />
          </View>
          <Text style={styles.title}>Nouriva AI</Text>
          <Text style={styles.tagline}>
            {isSignUp
              ? 'Begin your transformation today'
              : 'Every meal is a decision. Make it count.'}
          </Text>
        </View>

        <View style={styles.form}>
          <View style={styles.fieldLabel}>
            <Text style={styles.fieldLabelText}>Email</Text>
          </View>
          <View style={[styles.inputContainer, focusedField === 'email' && styles.inputContainerFocused]}>
            <View style={styles.inputIcon} pointerEvents="none">
              <Envelope size={18} color={focusedField === 'email' ? C.primary : C.textTertiary} weight="bold" />
            </View>
            <TextInput
              style={styles.input}
              placeholder="your@email.com"
              placeholderTextColor={C.textTertiary}
              value={email}
              onChangeText={setEmail}
              editable
              rejectResponderTermination
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
              showSoftInputOnFocus
              {...(Platform.OS === 'android' ? { importantForAutofill: 'yes' as const } : {})}
              onFocus={() => scheduleFocusHighlight('email')}
              onBlur={() => clearFocusHighlight()}
            />
          </View>

          <View style={[styles.fieldLabel, { marginTop: 16 }]}>
            <Text style={styles.fieldLabelText}>Password</Text>
          </View>
          <View style={[styles.inputContainer, focusedField === 'password' && styles.inputContainerFocused]}>
            <View style={styles.inputIcon} pointerEvents="none">
              <LockSimple size={18} color={focusedField === 'password' ? C.primary : C.textTertiary} weight="bold" />
            </View>
            <TextInput
              style={styles.input}
              placeholder="••••••••"
              placeholderTextColor={C.textTertiary}
              value={password}
              onChangeText={setPassword}
              editable
              rejectResponderTermination
              secureTextEntry
              autoComplete="password"
              textContentType={isSignUp ? 'newPassword' : 'password'}
              showSoftInputOnFocus
              {...(Platform.OS === 'android' ? { importantForAutofill: 'yes' as const } : {})}
              onFocus={() => scheduleFocusHighlight('password')}
              onBlur={() => clearFocusHighlight()}
            />
          </View>

          <TouchableOpacity
            style={[styles.authButton, loading && styles.authButtonLoading]}
            onPress={handleAuth}
            disabled={loading || biometricBusy}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color={C.textOnPrimary} />
            ) : (
              <>
                <Text style={styles.authButtonText}>
                  {isSignUp ? 'Create Account' : 'Sign In'}
                </Text>
                <ArrowRight size={20} color={C.textOnPrimary} weight="bold" />
              </>
            )}
          </TouchableOpacity>

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <TouchableOpacity
            style={[styles.googleButton, googleLoading && styles.authButtonLoading]}
            onPress={handleGoogleSignIn}
            disabled={loading || biometricBusy || googleLoading || appleLoading}
            activeOpacity={0.85}
          >
            {googleLoading ? (
              <ActivityIndicator color={C.textPrimary} />
            ) : (
              <>
                <GoogleLogo size={20} />
                <Text style={styles.googleButtonText}>Continue with Google</Text>
              </>
            )}
          </TouchableOpacity>

          {Platform.OS === 'ios' ? (
            <TouchableOpacity
              style={[styles.appleSignInButton, appleLoading && styles.authButtonLoading]}
              onPress={handleAppleSignIn}
              disabled={loading || biometricBusy || googleLoading || appleLoading}
              activeOpacity={0.85}
            >
              {appleLoading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <AppleLogoIcon size={20} color="#FFFFFF" weight="fill" />
                  <Text style={styles.appleSignInButtonText}>Sign in with Apple</Text>
                </>
              )}
            </TouchableOpacity>
          ) : null}

          {!isSignUp && biometricLoginAvailable ? (
            <TouchableOpacity
              style={[styles.biometricButton, biometricBusy && styles.authButtonLoading]}
              onPress={handleBiometricLogin}
              disabled={loading || biometricBusy}
              activeOpacity={0.88}
            >
              {biometricBusy ? (
                <ActivityIndicator color={C.primary} />
              ) : (
                <>
                  <Shield size={20} color={C.primary} weight="duotone" />
                  <Text style={styles.biometricButtonText}>Sign in with {biometricMethodLabel}</Text>
                </>
              )}
            </TouchableOpacity>
          ) : null}

          {!isSignUp && (
            <TouchableOpacity style={styles.forgotBtn} onPress={handleForgotPassword} activeOpacity={0.7}>
              <Text style={styles.forgotText}>Forgot Password?</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.toggleButton}
            onPress={() => setIsSignUp(!isSignUp)}
            activeOpacity={0.7}
          >
            <Text style={styles.toggleText}>
              {isSignUp ? 'Already have an account? ' : 'New here? '}
              <Text style={styles.toggleTextBold}>
                {isSignUp ? 'Sign In' : 'Create Account'}
              </Text>
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <View style={styles.trustRow}>
            <Sparkle size={12} color={C.textTertiary} weight="fill" />
            <Text style={styles.trustText}>Advanced AI · Encrypted · Private</Text>
          </View>
          <View style={styles.legalRow}>
            <TouchableOpacity onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}>
              <Text style={styles.legalLink}>Privacy Policy</Text>
            </TouchableOpacity>
            <Text style={styles.legalSep}>·</Text>
            <TouchableOpacity onPress={() => Linking.openURL(TERMS_URL)}>
              <Text style={styles.legalLink}>Terms of Service</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: C.bg,
    },
    kav: {
      flex: 1,
    },
    scrollContent: {
      flexGrow: 1,
      paddingHorizontal: 24,
      justifyContent: 'center',
      paddingVertical: 8,
    },
    header: {
      alignItems: 'center',
      marginBottom: 40,
    },
    logoWrapper: {
      width: 88,
      height: 88,
      borderRadius: 24,
      backgroundColor: C.primaryLight,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 20,
      shadowColor: C.primary,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.2,
      shadowRadius: 16,
      elevation: 8,
    },
    logo: {
      width: 56,
      height: 56,
      borderRadius: 14,
    },
    title: {
      fontSize: 30,
      fontWeight: '800',
      color: C.textPrimary,
      letterSpacing: -0.5,
      marginBottom: 8,
    },
    tagline: {
      fontSize: 15,
      color: C.textSecondary,
      textAlign: 'center',
      lineHeight: 22,
      paddingHorizontal: 16,
    },
    form: {
      width: '100%',
    },
    fieldLabel: {
      marginBottom: 6,
      marginLeft: 4,
    },
    fieldLabelText: {
      fontSize: 13,
      fontWeight: '700',
      color: C.textSecondary,
      letterSpacing: 0.2,
    },
    inputContainer: {
      position: 'relative',
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.surface,
      borderRadius: 16,
      paddingLeft: 48,
      paddingRight: 16,
      borderWidth: 1.5,
      borderColor: C.border,
    },
    inputIcon: {
      position: 'absolute',
      left: 16,
      top: 0,
      bottom: 0,
      justifyContent: 'center',
    },
    inputContainerFocused: {
      borderColor: C.primary,
      backgroundColor: C.surface,
      ...(Platform.OS === 'android'
        ? {
            shadowColor: C.primary,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.15,
            shadowRadius: 8,
            elevation: 2,
          }
        : {}),
    },
    input: {
      flex: 1,
      minHeight: 54,
      paddingVertical: Platform.OS === 'android' ? 10 : 12,
      fontSize: 16,
      color: C.textPrimary,
    },
    authButton: {
      flexDirection: 'row',
      backgroundColor: C.primary,
      height: 56,
      borderRadius: 16,
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: 24,
      gap: 8,
      shadowColor: C.primary,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.35,
      shadowRadius: 12,
      elevation: 6,
    },
    authButtonLoading: {
      opacity: 0.8,
    },
    authButtonText: {
      color: C.textOnPrimary,
      fontSize: 17,
      fontWeight: '700',
      letterSpacing: 0.2,
    },
    biometricButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      height: 52,
      borderRadius: 16,
      marginTop: 14,
      gap: 10,
      borderWidth: 1.5,
      borderColor: C.primary,
      backgroundColor: C.primaryLight,
    },
    biometricButtonText: {
      color: C.primary,
      fontSize: 16,
      fontWeight: '700',
    },
    toggleButton: {
      marginTop: 20,
      alignItems: 'center',
      paddingVertical: 8,
    },
    toggleText: {
      color: C.textSecondary,
      fontSize: 14,
    },
    toggleTextBold: {
      color: C.primary,
      fontWeight: '700',
    },
    footer: {
      marginTop: 32,
      alignItems: 'center',
    },
    trustRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    trustText: {
      fontSize: 11,
      color: C.textTertiary,
      fontWeight: '600',
      letterSpacing: 0.3,
    },
    dividerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 20,
      gap: 10,
    },
    dividerLine: {
      flex: 1,
      height: 1,
      backgroundColor: C.border,
    },
    dividerText: {
      fontSize: 13,
      color: C.textTertiary,
      fontWeight: '600',
    },
    googleButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      height: 52,
      borderRadius: 16,
      marginTop: 14,
      gap: 10,
      borderWidth: 1.5,
      borderColor: C.border,
      backgroundColor: C.surface,
    },
    googleButtonText: {
      color: C.textPrimary,
      fontSize: 15,
      fontWeight: '600',
    },
    /** Matches Google row layout; label uses same typography as `googleButtonText` (Apple system button does not allow font sizing). */
    appleSignInButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      height: 52,
      borderRadius: 16,
      marginTop: 14,
      gap: 10,
      backgroundColor: '#000000',
    },
    appleSignInButtonText: {
      color: '#FFFFFF',
      fontSize: 15,
      fontWeight: '600',
    },
    forgotBtn: { alignItems: 'flex-end', marginTop: 10, paddingVertical: 4 },
    forgotText: { fontSize: 13, color: C.primary, fontWeight: '600' },
    legalRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
    legalLink: { fontSize: 11, color: C.textTertiary, fontWeight: '600', textDecorationLine: 'underline' },
    legalSep: { fontSize: 11, color: C.textTertiary },
  });
}
