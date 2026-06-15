import React, { useState, useEffect, useCallback, useRef } from 'react';
import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StyleSheet, InteractionManager, View, Platform } from 'react-native';
import * as ExpoSplashScreen from 'expo-splash-screen';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold, Inter_900Black } from '@expo-google-fonts/inter';
import { PostHogProvider } from 'posthog-react-native';
import { posthog } from './src/utils/posthog';
import { registerForPushNotifications, setupNotificationListeners, scheduleDailyNudge } from './src/utils/notifications';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

import ResultsScreen from './src/screens/ResultsScreen';
import AuthScreen from './src/screens/AuthScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';
import SplashScreen from './src/screens/SplashScreen';
import BiometricGateScreen from './src/screens/BiometricGateScreen';
import ContactSupportScreen from './src/screens/ContactSupportScreen';
import UpgradeScreen from './src/screens/UpgradeScreen';
import ConfigErrorScreen from './src/screens/ConfigErrorScreen';
import MainTabNavigator from './src/navigation/MainTabNavigator';
import { isSupabaseEnvConfigured } from './src/config/publicEnv';
import { supabase } from './src/utils/supabase';
import { warmProfileHeaderCache } from './src/utils/profileHeaderCache';
import { clearBiometricLoginSnapshot } from './src/utils/biometricLogin';
import { signOutCompletely } from './src/utils/authRecovery';
import { initializeRevenueCat, prefetchOfferings } from './src/integrations/purchases';
import { identifyUser, logScreenView, resetUser } from './src/utils/analytics';
import { capture, Events } from './src/utils/posthog';
import { saveUserProfile } from './src/utils/userProfile';
import { Session, type AuthChangeEvent } from '@supabase/supabase-js';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from './src/theme';
import {
  loadOnboardingFlagsForUserId,
  setInitialPaywallPendingForUserId,
  setInitialPaywallSeenForUserId,
  setOnboardingCompleteForUserId,
} from './src/utils/onboardingFlags';

void ExpoSplashScreen.preventAutoHideAsync().catch(() => {
  /* Expo Go / web — splash API may noop */
});

const Stack = createNativeStackNavigator();

function AppInner() {
  const { isDark, colors: C } = useTheme();
  const navTheme = isDark
    ? { ...DarkTheme, colors: { ...DarkTheme.colors, background: C.bg, card: C.navBar, border: C.navBorder, primary: C.primary } }
    : { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: C.bg, card: C.navBar, border: C.navBorder, primary: C.primary } };

  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isBiometricVerified, setIsBiometricVerified] = useState(false);
  const [biometricRequired, setBiometricRequired] = useState(false);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);
  const [hasSeenInitialPaywall, setHasSeenInitialPaywall] = useState(true);

  // Prevent the auth-state-change listener from racing with initialize()
  const initializedRef = useRef(false);
  /** True after Face ID / Touch ID succeed, or when biometrics are off — survives spurious SIGNED_IN from GoTrue (e.g. after Supabase calls). */
  const biometricPassedThisSessionRef = useRef(false);

  useEffect(() => {
    let alive = true;

    async function initialize() {
      try {
        // Run all startup reads in parallel — was previously 5 sequential async calls
        const [sessionRes, bioPref, hasHardware, isEnrolled] = await Promise.all([
          supabase.auth.getSession(),
          SecureStore.getItemAsync('biometricsEnabled'),
          LocalAuthentication.hasHardwareAsync(),
          LocalAuthentication.isEnrolledAsync(),
        ]);

        if (!alive) return;

        const { data: { session: initialSession }, error: sessionError } = sessionRes;
        if (sessionError) {
          // e.g. AuthApiError: Invalid refresh token / refresh token not found
          console.warn('Auth: clearing stale session', sessionError.message);
          await signOutCompletely();
          if (!alive) return;
          setSession(null);
        } else {
          setSession(initialSession);
        }
        const session = sessionError ? null : initialSession;
        if (session?.user?.created_at) {
          void SecureStore.setItemAsync('accountCreatedAt', session.user.created_at).catch(() => {});
        }
        if (session?.user?.id) {
          // Await RC so that syncProStatus writes the accurate isPro value to
          // SecureStore for other screens (Profile, Results, etc.) that read it on demand.
          await initializeRevenueCat(session.user.id).catch((e) =>
            console.warn('[RC] init failed, using cached isPro', e)
          );
          // Warm the offerings cache so the paywall renders instantly (Apple 2.1b).
          prefetchOfferings();
          void identifyUser(session.user.id, session.user.email);
          // Register for push notifications and schedule daily nudge
          void registerForPushNotifications();
          void scheduleDailyNudge();
          capture(Events.SIGN_IN, { method: 'session_restore' });
          const flags = await loadOnboardingFlagsForUserId(session.user.id);
          if (!alive) return;
          setHasCompletedOnboarding(flags.completed);
          setHasSeenInitialPaywall(flags.paywallSeen);
        } else {
          setHasCompletedOnboarding(false);
          setHasSeenInitialPaywall(true);
        }

        if (session) {
          const needsBio = bioPref === 'true' && hasHardware && isEnrolled;
          setBiometricRequired(needsBio);
          const passed = !needsBio;
          biometricPassedThisSessionRef.current = passed;
          setIsBiometricVerified(passed);
        }
      } catch (err) {
        console.error('App init error:', err);
        if (alive) {
          setBiometricRequired(false);
          biometricPassedThisSessionRef.current = true;
          setIsBiometricVerified(true);
        }
      } finally {
        if (alive) {
          initializedRef.current = true;
          setLoading(false);
        }
      }
    }

    initialize();

    // Only handle auth changes that happen AFTER initial startup
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event: AuthChangeEvent, session) => {
      if (!initializedRef.current || !alive) return;
      if (!session) {
        setSession(null);
        biometricPassedThisSessionRef.current = false;
        setIsBiometricVerified(false);
        setBiometricRequired(false);
        setHasCompletedOnboarding(false);
        setHasSeenInitialPaywall(true);
        void SecureStore.deleteItemAsync('isPro');
        void SecureStore.deleteItemAsync('proplan');
        void SecureStore.deleteItemAsync('accountCreatedAt');
        void clearBiometricLoginSnapshot();
        capture(Events.SIGN_OUT);
        resetUser();
        return;
      }
      // Token refresh runs often (incl. after network activity from a scan). Re-applying
      // biometric state set isBiometricVerified to false whenever biometrics are "required",
      // which sends the user back to BiometricGate and looks like the app restarted.
      if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        if (session.user?.created_at) {
          void SecureStore.setItemAsync('accountCreatedAt', session.user.created_at).catch(() => {});
        }
        setSession(session);
        return;
      }
      if (!session.user?.id) return;
      // Sync RC so isPro is accurate, then read all flags together.
      await initializeRevenueCat(session.user.id).catch((e) =>
        console.warn('[RC] auth-change init failed, using cached isPro', e)
      );
      prefetchOfferings();
      const [flags, bioPref, hasHardware, isEnrolled] = await Promise.all([
        loadOnboardingFlagsForUserId(session.user.id),
        SecureStore.getItemAsync('biometricsEnabled'),
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
      ]);
      if (!alive) return;
      setHasCompletedOnboarding(flags.completed);
      setHasSeenInitialPaywall(flags.paywallSeen);
      const needsBio = bioPref === 'true' && hasHardware && isEnrolled;
      setBiometricRequired(needsBio);
      setIsBiometricVerified(!needsBio || biometricPassedThisSessionRef.current);
      if (session.user.created_at) {
        void SecureStore.setItemAsync('accountCreatedAt', session.user.created_at).catch(() => {});
      }
      setSession(session);
    });

    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, []);

  // Warm profile cache AFTER all startup animations settle — not competing with render
  useEffect(() => {
    if (!loading && session && hasCompletedOnboarding && isBiometricVerified) {
      const task = InteractionManager.runAfterInteractions(() => {
        warmProfileHeaderCache();
      });
      return () => task.cancel();
    }
  }, [loading, session, hasCompletedOnboarding, isBiometricVerified]);

  // Set up push notification listeners (foreground + tap)
  useEffect(() => {
    const cleanup = setupNotificationListeners();
    return cleanup;
  }, []);

  async function completeOnboarding() {
    const { data: { session: s } } = await supabase.auth.getSession();
    const id = s?.user?.id;
    if (id) {
      await setOnboardingCompleteForUserId(id);
      await setInitialPaywallPendingForUserId(id);
      try {
        await saveUserProfile({ onboarding_completed: true });
      } catch (e) {
        console.warn('Failed to save onboarding flag to profile:', e);
      }
    }
    setHasSeenInitialPaywall(false);
    setHasCompletedOnboarding(true);
  }

  const completeInitialPaywall = useCallback(() => {
    setHasSeenInitialPaywall(true);
    const id = session?.user?.id;
    if (id) {
      void setInitialPaywallSeenForUserId(id).catch((e) => {
        console.warn('Failed to save initial paywall flag:', e);
      });
    }
  }, [session?.user?.id]);

  const handleBiometricUnlocked = useCallback(() => {
    biometricPassedThisSessionRef.current = true;
    setIsBiometricVerified(true);
  }, []);

  const handleSignOutFromBiometricGate = useCallback(() => {
    void (async () => {
      await clearBiometricLoginSnapshot();
      await supabase.auth.signOut();
    })();
  }, []);

  if (loading) {
    return <SplashScreen />;
  }

  /**
   * Keep NavigationContainer mounted when Face ID is required. Replacing the whole tree
   * with only BiometricGate used to unmount the stack and wipe React Navigation state
   * (e.g. Results with full meal params → empty result / “couldn’t score” after unlock).
   */
  const showBiometricGate = !!session && biometricRequired && !isBiometricVerified;

  return (
    <View style={styles.appRoot}>
      <View
        style={[StyleSheet.absoluteFill, showBiometricGate && styles.contentHiddenForBiometric]}
        pointerEvents={showBiometricGate ? 'none' : 'auto'}
        accessibilityElementsHidden={showBiometricGate}
        importantForAccessibility={showBiometricGate ? 'no-hide-descendants' : 'auto'}
      >
        <NavigationContainer
          theme={navTheme}
          onStateChange={(state) => {
            const currentScreen = state?.routes[state.index]?.name;
            if (currentScreen) {
              void logScreenView(currentScreen);
            }
          }}
        >
          {/* PostHog screen autocapture uses useNavigationState and must run inside a screen — not above Stack.Navigator. */}
          {/* We disable it and send $screen via logScreenView in onStateChange (already mirrors to PostHog). */}
          <Stack.Navigator
            screenOptions={{
              headerShown: false,
              animation: 'default',
              fullScreenGestureEnabled: true,
            }}
          >
            {!session ? (
              <Stack.Screen name="Auth" component={AuthScreen} />
            ) : !hasCompletedOnboarding ? (
              <Stack.Screen name="Onboarding">
                {(props) => <OnboardingScreen onComplete={completeOnboarding} {...props} />}
              </Stack.Screen>
            ) : !hasSeenInitialPaywall ? (
              <Stack.Screen name="InitialUpgrade">
                {(props) => <UpgradeScreen onComplete={completeInitialPaywall} {...props} />}
              </Stack.Screen>
            ) : (
              <>
                <Stack.Screen name="Main" component={MainTabNavigator} />
                {/* Fade avoids UINavigationParallaxTransition + Fabric border rasterization crashes when pushing from Quick Log / scan overlay (iOS 18+ sim). */}
                <Stack.Screen
                  name="Results"
                  component={ResultsScreen as any}
                  options={{
                    // iOS: avoid any stack transition animation (parallax/fade still tick Fabric
                    // border layers during TurboModule work — May 2026 simulator SIGABRT).
                    animation: Platform.OS === 'ios' ? 'none' : 'fade',
                  }}
                />
                <Stack.Screen name="ContactSupport" component={ContactSupportScreen} />
                <Stack.Screen
                  name="Upgrade"
                  options={{
                    presentation: 'modal',
                    animation: 'slide_from_bottom',
                  }}
                  component={UpgradeScreen}
                />
              </>
            )}
          </Stack.Navigator>
        </NavigationContainer>
      </View>
      {showBiometricGate ? (
        <View style={styles.biometricOverlay} pointerEvents="box-none">
          <BiometricGateScreen onUnlocked={handleBiometricUnlocked} onSignOut={handleSignOutFromBiometricGate} />
        </View>
      ) : null}
    </View>
  );
}

export default function App() {
  return (
    <PostHogProvider
      client={posthog}
      autocapture={{
        captureScreens: false,
        // Touch autocapture adds a root overlay that can swallow TextInput taps / keyboard on iOS.
        captureTouches: false,
      }}
    >
      <SafeAreaProvider>
        <ThemeProvider>
          {isSupabaseEnvConfigured() ? <AppInner /> : <ConfigErrorScreen />}
        </ThemeProvider>
      </SafeAreaProvider>
    </PostHogProvider>
  );
}

const styles = StyleSheet.create({
  appRoot: {
    flex: 1,
  },
  contentHiddenForBiometric: {
    opacity: 0,
  },
  /** Must sit above the navigator so Face ID is always on top. */
  biometricOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    elevation: 1000,
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
});
