import React, { useState, useEffect, useCallback, useRef } from 'react';
import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StyleSheet, InteractionManager, View } from 'react-native';
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
import { initializeRevenueCat } from './src/integrations/purchases';
import { identifyUser, logScreenView } from './src/utils/analytics';
import { saveUserProfile } from './src/utils/userProfile';
import { Session, type AuthChangeEvent } from '@supabase/supabase-js';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from './src/theme';
import {
  loadOnboardingFlagsForUserId,
  setOnboardingCompleteForUserId,
  setInitialPaywallSeenForUserId,
  clearOnboardingUserBinding,
} from './src/utils/onboardingFlags';

const Stack = createNativeStackNavigator();

function AppInner() {
  const { isDark } = useTheme();
  const navTheme = isDark
    ? { ...DarkTheme, colors: { ...DarkTheme.colors, background: '#070D1B', card: '#101A2E', border: '#1C2B42', primary: '#818CF8' } }
    : { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: '#F7F9FC', card: '#FFFFFF', border: '#E2E8F0', primary: '#6366F1' } };

  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isBiometricVerified, setIsBiometricVerified] = useState(false);
  const [biometricRequired, setBiometricRequired] = useState(false);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);
  const [hasSeenInitialPaywall, setHasSeenInitialPaywall] = useState(false);
  const [isPro, setIsPro] = useState(false);

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
        if (session?.user?.id) {
          void initializeRevenueCat(session.user.id);
          void identifyUser(session.user.id, session.user.email);
          const [flags, proVal] = await Promise.all([
            loadOnboardingFlagsForUserId(session.user.id),
            SecureStore.getItemAsync('isPro'),
          ]);
          if (!alive) return;
          setHasCompletedOnboarding(flags.completed);
          setHasSeenInitialPaywall(flags.paywallSeen);
          setIsPro(proVal === 'true');
        } else {
          setHasCompletedOnboarding(false);
          setHasSeenInitialPaywall(false);
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
      setSession(session);
      if (!session) {
        biometricPassedThisSessionRef.current = false;
        setIsBiometricVerified(false);
        setBiometricRequired(false);
        setHasCompletedOnboarding(false);
        setHasSeenInitialPaywall(false);
        void clearOnboardingUserBinding();
        void clearBiometricLoginSnapshot();
        return;
      }
      // Token refresh runs often (incl. after network activity from a scan). Re-applying
      // biometric state set isBiometricVerified to false whenever biometrics are "required",
      // which sends the user back to BiometricGate and looks like the app restarted.
      if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        return;
      }
      if (!session.user?.id) return;
      const [flags, bioPref, proPref, hasHardware, isEnrolled] = await Promise.all([
        loadOnboardingFlagsForUserId(session.user.id),
        SecureStore.getItemAsync('biometricsEnabled'),
        SecureStore.getItemAsync('isPro'),
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
      ]);
      if (!alive) return;
      setHasCompletedOnboarding(flags.completed);
      setHasSeenInitialPaywall(flags.paywallSeen);
      setIsPro(proPref === 'true');
      const needsBio = bioPref === 'true' && hasHardware && isEnrolled;
      setBiometricRequired(needsBio);
      setIsBiometricVerified(!needsBio || biometricPassedThisSessionRef.current);
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

  async function completeOnboarding() {
    const { data: { session: s } } = await supabase.auth.getSession();
    const id = s?.user?.id;
    if (id) {
      await setOnboardingCompleteForUserId(id);
      try {
        await saveUserProfile({ onboarding_completed: true });
      } catch (e) {
        console.warn('Failed to save onboarding flag to profile:', e);
      }
    }
    setHasCompletedOnboarding(true);
  }

  async function completePaywall() {
    const { data: { session: s } } = await supabase.auth.getSession();
    const id = s?.user?.id;
    if (id) await setInitialPaywallSeenForUserId(id);
    setHasSeenInitialPaywall(true);
  }

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
            ) : (
              <>
                {!hasSeenInitialPaywall && !isPro ? (
                  <Stack.Screen
                    name="InitialUpgrade"
                    options={{
                      presentation: 'modal',
                      animation: 'slide_from_bottom',
                    }}
                  >
                    {(props) => <UpgradeScreen onComplete={completePaywall} {...props} />}
                  </Stack.Screen>
                ) : null}
                <Stack.Screen name="Main" component={MainTabNavigator} />
                <Stack.Screen name="Results" component={ResultsScreen as any} />
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
    <SafeAreaProvider>
      <ThemeProvider>
        {isSupabaseEnvConfigured() ? <AppInner /> : <ConfigErrorScreen />}
      </ThemeProvider>
    </SafeAreaProvider>
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
