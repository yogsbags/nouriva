import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { View, StyleSheet, Image, Animated, Dimensions, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ExpoSplashScreen from 'expo-splash-screen';

const { width } = Dimensions.get('window');

/** Matches `app.json` expo.splash.backgroundColor and Auth chrome. */
const SPLASH_BG = '#0B3022';
const TEXT_MUTED = 'rgba(248, 250, 252, 0.72)';

const ROTATING_LINES = [
  'Calibrating your vitality graph…',
  'Securing your session…',
  'Almost there…',
];

/**
 * Native cold start uses `app.json` splash (`icon.png`, no baked-in tagline).
 * JS splash matches Auth branding: mark + “Nouriva AI” (avoid raster copy drift).
 */
export default function SplashScreen() {
  const insets = useSafeAreaInsets();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.97)).current;
  const lineFade = useRef(new Animated.Value(1)).current;
  const [lineIndex, setLineIndex] = useState(0);

  useLayoutEffect(() => {
    void ExpoSplashScreen.hideAsync();
  }, []);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 650,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 7,
        tension: 80,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, scaleAnim]);

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
        <Image
          source={require('../../assets/icon.png')}
          style={styles.markImage}
          resizeMode="contain"
        />
        <Text style={styles.brandTitle}>Nouriva AI</Text>
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
  markImage: {
    width: Math.min(132, width * 0.34),
    height: Math.min(132, width * 0.34),
    borderRadius: 28,
    marginBottom: 20,
  },
  brandTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#F8FAFC',
    letterSpacing: -0.6,
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
