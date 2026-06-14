import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { LockKeyIcon as LockKey } from 'phosphor-react-native';
import * as Linking from 'expo-linking';
import { useColors, AppColors } from '../theme';
import { TERMS_URL, PRIVACY_URL } from '../constants/legal';

/**
 * Blocking disclosure shown before personal data is sent to Google Gemini
 * (Apple 5.1.1(i)/5.1.2(i)): what is sent, to whom, and an explicit
 * "I Agree" / "Not now" choice. Shown wherever consent has not been recorded —
 * covers existing accounts and reinstalls that never see the onboarding slide.
 */
interface AIConsentSheetProps {
  visible: boolean;
  /** 'scan' = meal photo/text analysis; 'report' = lab report upload. */
  context?: 'scan' | 'report';
  onAgree: () => void;
  onDecline: () => void;
}

export default function AIConsentSheet({ visible, context = 'scan', onAgree, onDecline }: AIConsentSheetProps) {
  const C = useColors();
  const styles = useMemo(() => makeStyles(C), [C]);

  const whatIsSent =
    context === 'report' ? (
      <Text style={styles.body}>
        To extract health markers, Nouriva AI sends the contents of your lab report (PDF or image) to{' '}
        <Text style={styles.bold}>Google Gemini</Text>, a third-party AI service.
      </Text>
    ) : (
      <Text style={styles.body}>
        To analyse your food, Nouriva AI sends your meal photo or text description to{' '}
        <Text style={styles.bold}>Google Gemini</Text>, a third-party AI service.
      </Text>
    );

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent onRequestClose={onDecline}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.iconWrap}>
            <LockKey size={32} color={C.primary} weight="duotone" />
          </View>
          <Text style={styles.title}>Data & Privacy</Text>

          <View style={styles.card}>
            {whatIsSent}
            <View style={styles.divider} />
            <Text style={styles.body}>
              If you've added medical conditions or lab report data, that context is also included to
              personalise your results.
            </Text>
            <View style={styles.divider} />
            <Text style={styles.body}>
              <Text style={styles.bold}>No data is stored by Google</Text> beyond processing your request.
            </Text>
          </View>

          <Text style={styles.legalNote}>
            By tapping "I Agree", you consent to this data sharing.{' '}
            <Text style={styles.link} onPress={() => Linking.openURL(PRIVACY_URL)}>
              Privacy Policy
            </Text>
            {' · '}
            <Text style={styles.link} onPress={() => Linking.openURL(TERMS_URL)}>
              Terms of Use
            </Text>
          </Text>

          <TouchableOpacity style={styles.agreeBtn} onPress={onAgree} activeOpacity={0.88}>
            <Text style={styles.agreeBtnText}>I Agree</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.declineBtn} onPress={onDecline} activeOpacity={0.7}>
            <Text style={styles.declineBtnText}>Not now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: C.bg,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 22,
      paddingTop: 24,
      paddingBottom: 36,
      alignItems: 'center',
    },
    iconWrap: {
      width: 60,
      height: 60,
      borderRadius: 16,
      backgroundColor: C.primaryLight,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 12,
    },
    title: {
      fontSize: 21,
      fontWeight: '800',
      color: C.textPrimary,
      marginBottom: 14,
      letterSpacing: -0.3,
    },
    card: {
      alignSelf: 'stretch',
      backgroundColor: C.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: C.border,
      padding: 16,
      marginBottom: 14,
    },
    body: { fontSize: 14, lineHeight: 20, color: C.textPrimary },
    bold: { fontWeight: '800' },
    divider: { height: 1, backgroundColor: C.border, marginVertical: 12 },
    legalNote: {
      fontSize: 12,
      lineHeight: 17,
      color: C.textTertiary,
      textAlign: 'center',
      marginBottom: 18,
      paddingHorizontal: 8,
    },
    link: { color: C.primary, fontWeight: '700', textDecorationLine: 'underline' },
    agreeBtn: {
      alignSelf: 'stretch',
      backgroundColor: C.primary,
      borderRadius: 14,
      paddingVertical: 15,
      alignItems: 'center',
      marginBottom: 8,
    },
    agreeBtnText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
    declineBtn: { alignSelf: 'stretch', paddingVertical: 12, alignItems: 'center' },
    declineBtnText: { fontSize: 14, color: C.textTertiary, fontWeight: '600' },
  });
}
