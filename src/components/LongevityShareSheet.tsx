import React, { useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Image,
  Platform,
  Share,
} from 'react-native';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { XIcon, ShareNetworkIcon as ShareNetwork, DnaIcon as Dna } from 'phosphor-react-native';
import { useColors, AppColors } from '../theme';
import { DietaryAgeResult, ratingMeta, buildLongevityShareMessage } from '../utils/longevity';

type Props = {
  visible: boolean;
  onClose: () => void;
  result: DietaryAgeResult | null;
  appShareUrl?: string;
};

export default function LongevityShareSheet({ visible, onClose, result, appShareUrl }: Props) {
  const C = useColors();
  const styles = useMemo(() => makeStyles(C), [C]);
  const shotRef = useRef<any>(null);
  const url = (appShareUrl || process.env.EXPO_PUBLIC_APP_SHARE_URL || 'https://productverse.in').trim();

  const handleShareImage = useCallback(async () => {
    if (!result || !shotRef.current) return;
    try {
      const canShare = await Sharing.isAvailableAsync();
      const uri = await shotRef.current.capture();
      if (uri && canShare) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share your longevity snapshot' });
      } else if (uri) {
        await Share.share({
          message: buildLongevityShareMessage(result, { appUrl: url }),
          ...(Platform.OS === 'ios' ? { url: uri } : {}),
        });
      } else {
        await Share.share({ message: buildLongevityShareMessage(result, { appUrl: url }) });
      }
    } catch (e) {
      console.error('[LongevityShareSheet]', e);
      try {
        await Share.share({ message: buildLongevityShareMessage(result!, { appUrl: url }) });
      } catch {
        /* ignore */
      }
    }
  }, [result, url]);

  const handleShareText = useCallback(async () => {
    if (!result) return;
    await Share.share({
      message: buildLongevityShareMessage(result, { appUrl: url }),
      ...(Platform.OS === 'android' ? { title: 'Nouriva AI · Longevity' } : {}),
    });
    onClose();
  }, [result, onClose, url]);

  if (!result) return null;

  const meta = ratingMeta(result.rating);
  const isYounger = result.ageDelta <= 0;
  const ageDeltaAbs = Math.abs(result.ageDelta);
  const ageDeltaLabel =
    ageDeltaAbs < 0.5
      ? 'On track'
      : isYounger
        ? `${ageDeltaAbs.toFixed(1)} yrs younger`
        : `${ageDeltaAbs.toFixed(1)} yrs older`;
  const ageColor = isYounger
    ? C.scoreHigh
    : result.ageDelta > 2
      ? C.scoreLow
      : C.scoreMid;

  const mTorPct =
    result.scanCount > 0 ? Math.round((result.mTorBreakdown.suppressed / result.scanCount) * 100) : 0;
  const autophagyInduced = result.autophagyBreakdown.strong + result.autophagyBreakdown.mild;
  const autoPct =
    result.scanCount > 0 ? Math.round((autophagyInduced / result.scanCount) * 100) : 0;

  const scoreStr = `${result.avgLongevityScore > 0 ? '+' : ''}${result.avgLongevityScore}`;
  const qrUri = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(url)}`;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Share longevity</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={12}>
              <XIcon size={16} weight="bold" color={C.textTertiary} />
            </TouchableOpacity>
          </View>

          <ViewShot ref={shotRef} options={{ format: 'png', quality: 1 }} style={styles.cardWrap}>
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Image source={require('../../assets/logo.png')} style={styles.logo} />
                <Text style={styles.brand}>Nouriva AI</Text>
                <Text style={styles.tagline}>Longevity snapshot</Text>
              </View>

              <View style={[styles.hero, { backgroundColor: C.surfaceSubtle }]}>
                <View style={styles.heroTitleRow}>
                  <Dna size={16} color={C.primary} weight="duotone" />
                  <Text style={styles.heroEyebrow}>Dietary biological age</Text>
                </View>
                <View style={[styles.ratingBadge, { borderColor: meta.color + '55', backgroundColor: meta.color + '18' }]}>
                  <Text style={[styles.ratingText, { color: meta.color }]}>
                    {meta.emoji} {meta.label}
                  </Text>
                </View>

                <View style={styles.ageRow}>
                  <View style={styles.ageCol}>
                    <Text style={styles.ageLbl}>Chronological</Text>
                    <Text style={styles.ageNum}>{result.actualAge}</Text>
                  </View>
                  <Text style={styles.vs}>vs</Text>
                  <View style={styles.ageCol}>
                    <Text style={styles.ageLbl}>Dietary</Text>
                    <Text style={[styles.ageNum, { color: ageColor }]}>{result.dietaryAge}</Text>
                  </View>
                </View>
                <View style={[styles.deltaPill, { backgroundColor: ageColor + '22' }]}>
                  <Text style={[styles.deltaText, { color: ageColor }]}>{ageDeltaLabel}</Text>
                </View>
              </View>

              <View style={styles.statsGrid}>
                {[
                  { k: 'Longevity', v: `${scoreStr}/10` },
                  { k: 'Inflammation', v: `${result.avgInflammationIndex.toFixed(1)}/10` },
                  { k: 'mTOR favorable', v: `${mTorPct}%` },
                  { k: 'Autophagy induced', v: `${autoPct}%` },
                ].map((row) => (
                  <View key={row.k} style={styles.statCell}>
                    <Text style={styles.statVal}>{row.v}</Text>
                    <Text style={styles.statLbl}>{row.k}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.summaryBox}>
                <Text style={styles.summaryText} numberOfLines={5}>
                  {result.summary}
                </Text>
                <Text style={styles.summaryMeta}>
                  Based on {result.scanCount} scan{result.scanCount !== 1 ? 's' : ''} · last 30 days
                </Text>
              </View>

              <View style={styles.footer}>
                <View style={styles.footerLeft}>
                  <Text style={styles.footerBrand}>Nouriva AI</Text>
                  <Text style={styles.footerTag}>Precision metabolic analysis</Text>
                  <Text style={styles.footerBadge}>nouriva.app</Text>
                </View>
                <View style={styles.qrCol}>
                  <View style={styles.qrInner}>
                    <Image source={{ uri: qrUri }} style={{ width: 36, height: 36 }} />
                  </View>
                  <Text style={styles.qrCap}>Scan to download</Text>
                </View>
              </View>
            </View>
          </ViewShot>

          <TouchableOpacity style={styles.primaryBtn} onPress={handleShareImage} activeOpacity={0.88}>
            <ShareNetwork size={18} color="#FFF" weight="bold" />
            <Text style={styles.primaryBtnTxt}>Share image</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.textBtn} onPress={handleShareText} activeOpacity={0.75}>
            <Text style={styles.textBtnLbl}>Share as text</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: C.bg,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      paddingHorizontal: 20,
      paddingBottom: Platform.OS === 'ios' ? 36 : 24,
      paddingTop: 12,
    },
    handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.border, alignSelf: 'center', marginBottom: 16 },
    sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    sheetTitle: { fontSize: 18, fontWeight: '800', color: C.textPrimary },
    closeBtn: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: C.bgSecondary,
      justifyContent: 'center',
      alignItems: 'center',
    },
    cardWrap: { borderRadius: 20, overflow: 'hidden', marginBottom: 16 },
    card: {
      backgroundColor: C.surface,
      borderRadius: 20,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: C.border,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 14,
      gap: 8,
      backgroundColor: C.bg,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
    },
    logo: { width: 22, height: 22, borderRadius: 6 },
    brand: { fontSize: 14, fontWeight: '900', color: C.primary },
    tagline: { fontSize: 10, color: C.textTertiary, fontWeight: '600', marginLeft: 'auto' },
    hero: { padding: 16 },
    heroTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
    heroEyebrow: {
      fontSize: 11,
      fontWeight: '800',
      color: C.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.7,
    },
    ratingBadge: {
      alignSelf: 'flex-start',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 10,
      borderWidth: 1,
      marginBottom: 14,
    },
    ratingText: { fontSize: 11, fontWeight: '800' },
    ageRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 14,
      marginBottom: 10,
    },
    ageCol: { alignItems: 'center', flex: 1 },
    ageLbl: { fontSize: 10, fontWeight: '700', color: C.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5 },
    ageNum: { fontSize: 34, fontWeight: '900', color: C.textPrimary, letterSpacing: -1, marginTop: 2 },
    vs: { fontSize: 13, color: C.textTertiary, fontWeight: '700' },
    deltaPill: { alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
    deltaText: { fontSize: 12, fontWeight: '800' },
    statsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      paddingHorizontal: 12,
      paddingVertical: 12,
      gap: 8,
      borderTopWidth: 1,
      borderTopColor: C.borderSubtle,
    },
    statCell: {
      width: '48%',
      backgroundColor: C.bgSecondary,
      borderRadius: 12,
      paddingVertical: 10,
      paddingHorizontal: 8,
    },
    statVal: { fontSize: 15, fontWeight: '900', color: C.textPrimary },
    statLbl: { fontSize: 9, color: C.textTertiary, fontWeight: '700', marginTop: 4, textTransform: 'uppercase' },
    summaryBox: { paddingHorizontal: 14, paddingBottom: 12 },
    summaryText: { fontSize: 12, color: C.textSecondary, lineHeight: 18, fontWeight: '600' },
    summaryMeta: { fontSize: 10, color: C.textTertiary, fontWeight: '600', marginTop: 8 },
    footer: {
      padding: 16,
      borderTopWidth: 1,
      borderTopColor: C.border,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: C.bgSecondary,
    },
    footerLeft: { flex: 1 },
    footerBrand: { fontSize: 14, fontWeight: '900', color: C.primary, marginBottom: 2 },
    footerTag: {
      fontSize: 9,
      color: C.textTertiary,
      fontWeight: '700',
      textTransform: 'uppercase',
      marginBottom: 8,
    },
    footerBadge: { fontSize: 11, fontWeight: '700', color: C.primary, marginTop: 4 },
    qrCol: { alignItems: 'center', gap: 4 },
    qrInner: {
      width: 44,
      height: 44,
      borderRadius: 10,
      backgroundColor: '#FFF',
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: C.border,
    },
    qrCap: { fontSize: 7, fontWeight: '800', color: C.textTertiary },
    primaryBtn: {
      backgroundColor: C.primary,
      borderRadius: 14,
      paddingVertical: 16,
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 10,
      marginBottom: 10,
    },
    primaryBtnTxt: { color: '#FFF', fontSize: 16, fontWeight: '800' },
    textBtn: { alignItems: 'center', paddingVertical: 12 },
    textBtnLbl: { fontSize: 14, color: C.textSecondary, fontWeight: '600' },
  });
}
