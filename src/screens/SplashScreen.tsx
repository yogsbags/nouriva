import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { View, StyleSheet, Image, Animated, Dimensions, Text, Easing } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ExpoSplashScreen from 'expo-splash-screen';

const { width } = Dimensions.get('window');

/** Matches `app.json` splash poster background (`splash-icon.png`) so the
 *  native → JS handoff has no visible seam. */
const SPLASH_BG = '#0E3B26';
const GOLD = '#E3B23C';
const TEXT_LIGHT = '#F8FAFC';
const TEXT_MUTED = 'rgba(248, 250, 252, 0.62)';

const MARK_SIZE = Math.min(176, width * 0.46);

const ROTATING_LINES = [
  'Calibrating your vitality graph…',
  'Securing your session…',
  'Almost there…',
];

/**
 * JS splash mirrors the native poster (`assets/splash-icon.png`): ringed flame
 * mark, “Nouriva” wordmark with gold AI badge, and the “Know what you eat”
 * tagline. The flame mark (`splash-mark.png`) is cropped from the same poster,
 * so it composites seamlessly onto the matching background.
 */
export default function SplashScreen() {
  const insets = useSafeAreaInsets();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.94)).current;
  const haloAnim = useRef(new Animated.Value(0.85)).current;
  const lineFade = useRef(new Animated.Value(1)).current;
  const [lineIndex, setLineIndex] = useState(0);

  useLayoutEffect(() => {
    void ExpoSplashScreen.hideAsync();
  }, []);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 7,
        tension: 70,
        useNativeDriver: true,
      }),
    ]).start();

    // Slow, gentle breathing halo behind the mark.
    Animated.loop(
      Animated.sequence([
        Animated.timing(haloAnim, {
          toValue: 1.12,
          duration: 1600,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(haloAnim, {
          toValue: 0.85,
          duration: 1600,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [fadeAnim, scaleAnim, haloAnim]);

  useEffect(() => {
    const id = setInterval(() => {
      Animated.timing(lineFade, { toValue: 0, duration: 200, useNativeDriver: true }).start(({ finished }) => {
        if (!finished) return;
        setLineIndex((i) => (i + 1) % ROTATING_LINES.length);
        Animated.timing(lineFade, { toValue: 1, duration: 340, useNativeDriver: true }).start();
      });
    }, 2800);
    return () => clearInterval(id);
  }, [lineFade]);

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.posterWrap,
          {
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        <View style={styles.markStack}>
          <Animated.View
            pointerEvents="none"
            style={[styles.halo, { opacity: fadeAnim, transform: [{ scale: haloAnim }] }]}
          />
          <Image
            source={require('../../assets/splash-mark.png')}
            style={styles.markImage}
            resizeMode="contain"
          />
        </View>

        <View style={styles.brandRow}>
          <Text style={styles.brandTitle}>Nouriva</Text>
          <View style={styles.aiBadge}>
            <Text style={styles.aiBadgeText}>AI</Text>
          </View>
        </View>
        <Text style={styles.tagline}>Know what you eat</Text>
      </Animated.View>

      <Animated.View
        style={[
          styles.footer,
          { opacity: fadeAnim, paddingBottom: Math.max(insets.bottom, 20) + 12 },
        ]}
      >
        <Animated.Text style={[styles.statusLine, { opacity: lineFade }]} numberOfLines={1}>
          {ROTATING_LINES[lineIndex]}
        </Animated.Text>
        <LoadingDots />
      </Animated.View>
    </View>
  );
}

function LoadingDots() {
  const o1 = useRef(new Animated.Value(0.35)).current;
  const o2 = useRef(new Animated.Value(0.35)).current;
  const o3 = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const pulse = (v: Animated.Value, delayMs: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delayMs),
          Animated.timing(v, { toValue: 1, duration: 280, useNativeDriver: true }),
          Animated.timing(v, { toValue: 0.35, duration: 280, useNativeDriver: true }),
          Animated.delay(400),
        ])
      );
    const l1 = pulse(o1, 0);
    const l2 = pulse(o2, 160);
    const l3 = pulse(o3, 320);
    l1.start();
    l2.start();
    l3.start();
    return () => {
      l1.stop();
      l2.stop();
      l3.stop();
    };
  }, [o1, o2, o3]);

  return (
    <View style={styles.dotsRow}>
      {[o1, o2, o3].map((v, i) => (
        <Animated.View key={i} style={[styles.dotBall, { opacity: v }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SPLASH_BG,
  },
  posterWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  markStack: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 26,
  },
  halo: {
    position: 'absolute',
    width: MARK_SIZE * 1.4,
    height: MARK_SIZE * 1.4,
    borderRadius: (MARK_SIZE * 1.4) / 2,
    backgroundColor: 'rgba(227, 178, 60, 0.10)',
  },
  markImage: {
    width: MARK_SIZE,
    height: MARK_SIZE,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandTitle: {
    fontSize: 36,
    fontWeight: '800',
    color: TEXT_LIGHT,
    letterSpacing: -0.8,
    textAlign: 'center',
  },
  aiBadge: {
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(227, 178, 60, 0.55)',
  },
  aiBadgeText: {
    fontSize: 14,
    fontWeight: '800',
    color: GOLD,
    letterSpacing: 1.5,
  },
  tagline: {
    marginTop: 10,
    fontSize: 13,
    fontWeight: '500',
    color: TEXT_MUTED,
    letterSpacing: 0.6,
    textAlign: 'center',
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  statusLine: {
    fontSize: 11,
    fontWeight: '600',
    color: TEXT_MUTED,
    textAlign: 'center',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  dotsRow: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 8,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotBall: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: TEXT_MUTED,
  },
});
