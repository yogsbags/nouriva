import React, { useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CaretLeftIcon as CaretLeft, PaperPlaneTiltIcon as PaperPlaneTilt, LifebuoyIcon as Lifebuoy } from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import { useColors, AppColors } from '../theme';
import { ScreenEnterAnimation } from '../components/ScreenEnterAnimation';
import { submitSupportMessage } from '../utils/contactSupport';
import { supabase } from '../utils/supabase';

const CONTACT_FORM_URL = process.env.EXPO_PUBLIC_CONTACT_FORM_URL || '';
const SUPPORT_EMAIL = process.env.EXPO_PUBLIC_SUPPORT_EMAIL || '';

interface ContactSupportScreenProps {
  navigation: { goBack: () => void };
}

export default function ContactSupportScreen({ navigation }: ContactSupportScreenProps) {
  const C = useColors();
  const styles = useMemo(() => makeStyles(C), [C]);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [emailHint, setEmailHint] = useState('');

  useEffect(() => {
    void supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) setEmailHint(user.email);
    });
  }, []);

  const openExternalForm = () => {
    if (!CONTACT_FORM_URL) return;
    void Linking.openURL(CONTACT_FORM_URL);
  };

  const handleSend = async () => {
    const trimmed = message.trim();
    if (!trimmed) {
      Alert.alert('Message required', 'Please describe your question or issue.');
      return;
    }
    setSending(true);
    try {
      const result = await submitSupportMessage({ subject, body: trimmed });
      if (result.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Sent', 'Thanks — we will get back to you at your account email.', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
        setSubject('');
        setMessage('');
      } else {
        let detail = result.error;
        if (SUPPORT_EMAIL) {
          detail += `\n\nYou can also email ${SUPPORT_EMAIL}.`;
        }
        Alert.alert('Could not send', detail);
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <ScreenEnterAnimation variant="fade">
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: C.bg }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <SafeAreaView style={styles.container} edges={['top']}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton} hitSlop={12}>
              <CaretLeft size={24} color={C.textPrimary} weight="bold" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Help & contact</Text>
            <View style={{ width: 40 }} />
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.hero}>
              <View style={styles.heroIcon}>
                <Lifebuoy size={28} color={C.primary} weight="duotone" />
              </View>
              <Text style={styles.heroTitle}>How can we help?</Text>
              <Text style={styles.heroSub}>
                Send us feedback, billing questions, or technical issues. We reply to the email on your account
                {emailHint ? ` (${emailHint})` : ''}.
              </Text>
            </View>

            {CONTACT_FORM_URL ? (
              <TouchableOpacity style={styles.altLink} onPress={openExternalForm} activeOpacity={0.8}>
                <Text style={styles.altLinkText}>Open web contact form</Text>
              </TouchableOpacity>
            ) : null}

            <Text style={styles.label}>Subject (optional)</Text>
            <TextInput
              style={styles.input}
              value={subject}
              onChangeText={setSubject}
              placeholder="e.g. Subscription, bug, feature idea"
              placeholderTextColor={C.textTertiary}
              maxLength={120}
            />

            <Text style={styles.label}>Message</Text>
            <TextInput
              style={[styles.input, styles.messageInput]}
              value={message}
              onChangeText={setMessage}
              placeholder="Describe your question in as much detail as you can."
              placeholderTextColor={C.textTertiary}
              multiline
              textAlignVertical="top"
              maxLength={4000}
            />

            <TouchableOpacity
              style={[styles.sendBtn, sending && styles.sendBtnDisabled]}
              onPress={handleSend}
              disabled={sending}
              activeOpacity={0.88}
            >
              {sending ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <PaperPlaneTilt size={18} color="#FFF" weight="fill" />
                  <Text style={styles.sendBtnText}>Send message</Text>
                </>
              )}
            </TouchableOpacity>

            <Text style={styles.footerNote}>
              For urgent medical concerns, contact your clinician or emergency services — Nouriva AI is not a substitute
              for professional care.
            </Text>
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </ScreenEnterAnimation>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
    },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: C.bgSecondary,
      justifyContent: 'center',
      alignItems: 'center',
    },
    headerTitle: { fontSize: 17, fontWeight: '800', color: C.textPrimary },
    scroll: { flex: 1 },
    scrollContent: { padding: 20, paddingBottom: 40 },
    hero: { marginBottom: 20 },
    heroIcon: {
      width: 56,
      height: 56,
      borderRadius: 18,
      backgroundColor: C.primaryLight,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 14,
    },
    heroTitle: { fontSize: 22, fontWeight: '900', color: C.textPrimary, marginBottom: 8, letterSpacing: -0.3 },
    heroSub: { fontSize: 14, color: C.textSecondary, lineHeight: 21 },
    altLink: {
      marginBottom: 18,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 14,
      backgroundColor: C.surface,
      borderWidth: 1,
      borderColor: C.border,
    },
    altLinkText: { fontSize: 14, fontWeight: '700', color: C.primary, textAlign: 'center' },
    label: {
      fontSize: 11,
      fontWeight: '800',
      color: C.textTertiary,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginBottom: 8,
      marginTop: 4,
    },
    input: {
      backgroundColor: C.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: C.border,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 16,
      fontWeight: '600',
      color: C.textPrimary,
      marginBottom: 16,
    },
    messageInput: { minHeight: 160, paddingTop: 14 },
    sendBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      backgroundColor: C.primary,
      paddingVertical: 16,
      borderRadius: 18,
      marginTop: 8,
    },
    sendBtnDisabled: { opacity: 0.7 },
    sendBtnText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
    footerNote: {
      marginTop: 20,
      fontSize: 12,
      color: C.textTertiary,
      lineHeight: 18,
    },
  });
}
