import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Image, Animated, Dimensions, Text } from 'react-native';
import { useColors } from '../theme';

const { width } = Dimensions.get('window');

export default function SplashScreen() {
  const C = useColors();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.75)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 900,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 5,
        tension: 60,
        useNativeDriver: true,
      }),
      Animated.timing(glowAnim, {
        toValue: 1,
        duration: 1200,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: C.bg }]}>
      <Animated.View
        style={[
          styles.outerGlow,
          {
            backgroundColor: C.primaryGlow,
            opacity: glowAnim,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.innerGlow,
          {
            backgroundColor: C.primaryMuted,
            opacity: glowAnim,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.logoContainer,
          {
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }],
            shadowColor: C.primary,
          },
        ]}
      >
        <Image source={require('../../assets/logo.png')} style={styles.logo} />
      </Animated.View>

      <Animated.View style={{ opacity: fadeAnim, marginTop: 24, alignItems: 'center' }}>
        <Text style={[styles.brandText, { color: C.textPrimary }]}>NOURIVA AI</Text>
        <Text style={[styles.taglineText, { color: C.textSecondary }]}>Precision Metabolic Intelligence</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  outerGlow: {
    position: 'absolute',
    width: width * 0.9,
    height: width * 0.9,
    borderRadius: (width * 0.9) / 2,
  },
  innerGlow: {
    position: 'absolute',
    width: width * 0.55,
    height: width * 0.55,
    borderRadius: (width * 0.55) / 2,
  },
  logoContainer: {
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 16,
    zIndex: 2,
  },
  logo: {
    width: 120,
    height: 120,
    borderRadius: 32,
  },
  brandText: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 4,
    textAlign: 'center',
  },
  taglineText: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 2,
    marginTop: 8,
    textTransform: 'uppercase',
    opacity: 0.8,
  },
});
