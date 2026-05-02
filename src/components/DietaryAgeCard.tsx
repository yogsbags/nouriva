import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import {
  FlaskIcon as Flask,
  FireSimpleIcon as FireSimple,
  LeafIcon as Leaf,
  SparkleIcon as Sparkle,
  ShareNetworkIcon as ShareNetwork,
} from 'phosphor-react-native';
import { useColors, AppColors } from '../theme';
import { DietaryAgeResult, ratingMeta } from '../utils/longevity';

interface Props {
  result: DietaryAgeResult;
  onSharePress?: () => void;
}

export default function DietaryAgeCard({ result, onSharePress }: Props) {
  const C = useColors();
  const styles = useMemo(() => makeStyles(C), [C]);
  const meta = ratingMeta(result.rating);

  const isYounger = result.ageDelta <= 0;
  const ageDeltaAbs = Math.abs(result.ageDelta);
  const ageDeltaLabel = ageDeltaAbs < 0.5
    ? 'on track'
    : isYounger
    ? `${ageDeltaAbs.toFixed(1)} yrs younger`
    : `${ageDeltaAbs.toFixed(1)} yrs older`;

  const ageColor = isYounger ? C.scoreHigh ?? '#22c55e' : result.ageDelta > 2 ? C.scoreLow ?? '#ef4444' : C.scoreMid ?? '#f59e0b';

  const inflammColor = result.avgInflammationIndex <= 3
    ? C.scoreHigh ?? '#22c55e'
    : result.avgInflammationIndex <= 6
    ? C.scoreMid ?? '#f59e0b'
    : C.scoreLow ?? '#ef4444';

  return (
    <View style={styles.card}>
      {/* Header: title + rating (left), share (top right) */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <View style={styles.titleWrap}>
            <Sparkle size={14} color={C.primary} weight="fill" />
            <Text style={styles.title}>Dietary Biological Age</Text>
          </View>
          <View style={[styles.ratingBadge, { backgroundColor: meta.color + '20', borderColor: meta.color + '40', alignSelf: 'flex-start', marginTop: 10 }]}>
            <Text style={[styles.ratingText, { color: meta.color }]}>{meta.emoji} {meta.label}</Text>
          </View>
        </View>
        {onSharePress ? (
          <TouchableOpacity
            onPress={onSharePress}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={styles.shareBtn}
            accessibilityRole="button"
            accessibilityLabel="Share longevity snapshot"
            activeOpacity={0.75}
          >
            <ShareNetwork size={22} color={C.primary} weight="duotone" />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Big age display */}
      <View style={styles.ageRow}>
        <View style={styles.ageBlock}>
          <Text style={styles.ageLabel}>Actual Age</Text>
          <Text style={styles.ageValue}>{result.actualAge}</Text>
        </View>
        <View style={styles.ageSeparator}>
          <Text style={styles.ageSeparatorText}>vs</Text>
        </View>
        <View style={styles.ageBlock}>
          <Text style={styles.ageLabel}>Dietary Age</Text>
          <Text style={[styles.ageValue, { color: ageColor }]}>{result.dietaryAge}</Text>
        </View>
        <View style={[styles.deltaBadge, { backgroundColor: ageColor + '18' }]}>
          <Text style={[styles.deltaText, { color: ageColor }]}>{ageDeltaLabel}</Text>
        </View>
      </View>

      {/* Summary */}
      <Text style={styles.summary}>{result.summary}</Text>

      {/* Pathway pills */}
      <View style={styles.pillsRow}>
        {/* Inflammation */}
        <View style={[styles.pill, { backgroundColor: inflammColor + '15', borderColor: inflammColor + '30' }]}>
          <FireSimple size={11} color={inflammColor} weight="fill" />
          <Text style={[styles.pillText, { color: inflammColor }]}>
            Inflammation {result.avgInflammationIndex.toFixed(1)}/10
          </Text>
        </View>

        {/* Longevity score */}
        <View style={[styles.pill, { backgroundColor: C.primary + '15', borderColor: C.primary + '30' }]}>
          <Flask size={11} color={C.primary} weight="fill" />
          <Text style={[styles.pillText, { color: C.primary }]}>
            Score {result.avgLongevityScore > 0 ? '+' : ''}{result.avgLongevityScore}/10
          </Text>
        </View>

        {/* Sirtuin activators */}
        {result.topSirtuinActivators.length > 0 && (
          <View style={[styles.pill, { backgroundColor: C.scoreHigh + '15', borderColor: (C.scoreHigh ?? '#22c55e') + '30' }]}>
            <Leaf size={11} color={C.scoreHigh ?? '#22c55e'} weight="fill" />
            <Text style={[styles.pillText, { color: C.scoreHigh ?? '#22c55e' }]} numberOfLines={1}>
              {result.topSirtuinActivators.slice(0, 2).join(', ')}
            </Text>
          </View>
        )}
      </View>

      {/* mTOR / Autophagy row */}
      <View style={styles.pathwayRow}>
        <PathwayStat
          label="mTOR"
          suppressed={result.mTorBreakdown.suppressed}
          neutral={result.mTorBreakdown.neutral}
          activated={result.mTorBreakdown.activated}
          total={result.scanCount}
          C={C}
          positiveKey="suppressed"
        />
        <View style={styles.pathwayDivider} />
        <PathwayStat
          label="Autophagy"
          suppressed={result.autophagyBreakdown.strong + result.autophagyBreakdown.mild}
          neutral={result.autophagyBreakdown.neutral}
          activated={result.autophagyBreakdown.inhibited}
          total={result.scanCount}
          C={C}
          positiveKey="suppressed"
          positiveLabel="Induced"
          negativeLabel="Inhibited"
        />
      </View>

      <Text style={styles.footer}>Based on {result.scanCount} scan{result.scanCount !== 1 ? 's' : ''} · last 30 days</Text>
    </View>
  );
}

function PathwayStat({
  label, suppressed, neutral, activated, total, C, positiveKey, positiveLabel = 'Suppressed', negativeLabel = 'Activated',
}: {
  label: string;
  suppressed: number;
  neutral: number;
  activated: number;
  total: number;
  C: AppColors;
  positiveKey: string;
  positiveLabel?: string;
  negativeLabel?: string;
}) {
  const pct = total > 0 ? Math.round((suppressed / total) * 100) : 0;
  const isGood = pct >= 50;
  const color = isGood ? C.scoreHigh ?? '#22c55e' : pct >= 30 ? C.scoreMid ?? '#f59e0b' : C.scoreLow ?? '#ef4444';

  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ fontSize: 10, fontWeight: '700', color: C.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{label}</Text>
      <Text style={{ fontSize: 20, fontWeight: '800', color }}>{pct}%</Text>
      <Text style={{ fontSize: 10, color: C.textTertiary, fontWeight: '500', marginTop: 1 }}>{isGood ? positiveLabel : negativeLabel}</Text>
    </View>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: C.surface,
      borderRadius: 24,
      padding: 20,
      borderWidth: 1,
      borderColor: C.border,
      shadowColor: C.shadowColor,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.06,
      shadowRadius: 16,
    },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 18,
      gap: 8,
    },
    headerLeft: { flex: 1, minWidth: 0 },
    shareBtn: {
      marginTop: -2,
      padding: 6,
      borderRadius: 12,
      backgroundColor: C.primary + '12',
      borderWidth: 1,
      borderColor: C.primary + '22',
    },
    titleWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    title: { fontSize: 12, fontWeight: '800', color: C.textTertiary, textTransform: 'uppercase', letterSpacing: 0.8 },
    ratingBadge: {
      paddingHorizontal: 10, paddingVertical: 4,
      borderRadius: 10, borderWidth: 1,
    },
    ratingText: { fontSize: 11, fontWeight: '800' },
    // Age display
    ageRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 14,
      gap: 8,
    },
    ageBlock: { alignItems: 'center', flex: 1 },
    ageLabel: { fontSize: 10, fontWeight: '700', color: C.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
    ageValue: { fontSize: 36, fontWeight: '900', color: C.textPrimary, letterSpacing: -1 },
    ageSeparator: { alignItems: 'center' },
    ageSeparatorText: { fontSize: 13, color: C.textTertiary, fontWeight: '600' },
    deltaBadge: {
      paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10,
      alignItems: 'center', justifyContent: 'center',
    },
    deltaText: { fontSize: 11, fontWeight: '800' },
    // Summary
    summary: {
      fontSize: 13, color: C.textSecondary, lineHeight: 19,
      fontWeight: '500', marginBottom: 14,
    },
    // Pills
    pillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
    pill: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      paddingHorizontal: 10, paddingVertical: 5,
      borderRadius: 10, borderWidth: 1,
    },
    pillText: { fontSize: 11, fontWeight: '700' },
    // Pathway stats
    pathwayRow: {
      flexDirection: 'row',
      backgroundColor: C.bgSecondary,
      borderRadius: 16,
      padding: 16,
      marginBottom: 12,
    },
    pathwayDivider: { width: 1, backgroundColor: C.border, marginHorizontal: 8 },
    // Footer
    footer: { fontSize: 11, color: C.textTertiary, fontWeight: '500', textAlign: 'center' },
  });
}
