import React, { useMemo, useState } from 'react';
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
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LockSimpleIcon as LockSimple, ArrowRightIcon as ArrowRight } from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import { useColors, AppColors } from '../theme';
import { ScreenEnterAnimation } from '../components/ScreenEnterAnimation';
import { updatePassword } from '../utils/passwordReset';

type ResetPasswordScreenProps = {
  onComplete: () => void;
  onCancel: () => void;
};

export default function ResetPasswordScreen({ onComplete, onCancel }: ResetPasswordScreenProps) {
  const C = useColors();
  const styles = useMemo(() => makeStyles(C), [C]);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [focusedField, setFocusedField] = useState<'password' | 'confirm' | null>(null);

  const handleSubmit = async () => {
    if (password.length < 8) {
      Alert.alert('Password too short', 'Use at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Passwords do not match', 'Make sure both fields match.');
      return;
    }

    setBusy(true);
    try {
      await updatePassword(password);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Password updated', 'You can now sign in with your new password.', [
        { text: 'Continue', onPress: onComplete },
      ]);
    } catch (error: any) {
      Alert.alert('Could not update password', error?.message ?? 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScreenEnterAnimation variant="fade">
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.header}>
              <View style={styles.logoWrapper}>
                <Image source={require('../../assets/splash-logo.png')} style={styles.logo} />
              </View>
              <Text style={styles.title}>Set a new password</Text>
              <Text style={styles.subtitle}>
                Choose a strong password for your Nouriva AI account.
              </Text>
            </View>

            <View style={styles.form}>
              <Text style={styles.fieldLabel}>New password</Text>
              <View style={[styles.inputContainer, focusedField === 'password' && styles.inputFocused]}>
                <LockSimple size={18} color={focusedField === 'password' ? C.primary : C.textTertiary} weight="bold" />
                <TextInput
                  style={styles.input}
                  placeholder="At least 8 characters"
                  placeholderTextColor={C.textTertiary}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  textContentType="newPassword"
                  onFocus={() => setFocusedField('password')}
                  onBlur={() => setFocusedField(null)}
                />
              </View>

              <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>Confirm password</Text>
              <View style={[styles.inputContainer, focusedField === 'confirm' && styles.inputFocused]}>
                <LockSimple size={18} color={focusedField === 'confirm' ? C.primary : C.textTertiary} weight="bold" />
                <TextInput
                  style={styles.input}
                  placeholder="Re-enter password"
                  placeholderTextColor={C.textTertiary}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  textContentType="newPassword"
                  onFocus={() => setFocusedField('confirm')}
                  onBlur={() => setFocusedField(null)}
                />
              </View>

              <TouchableOpacity
                style={[styles.primaryButton, busy && styles.buttonLoading]}
                onPress={handleSubmit}
                disabled={busy}
                activeOpacity={0.85}
              >
                {busy ? (
                  <ActivityIndicator color={C.textOnPrimary} />
                ) : (
                  <>
                    <Text style={styles.primaryButtonText}>Update password</Text>
                    <ArrowRight size={20} color={C.textOnPrimary} weight="bold" />
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity style={styles.cancelButton} onPress={onCancel} disabled={busy}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ScreenEnterAnimation>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    flex: { flex: 1 },
    scroll: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 32 },
    header: { alignItems: 'center', marginTop: 24, marginBottom: 28 },
    logoWrapper: {
      width: 88,
      height: 88,
      borderRadius: 22,
      backgroundColor: C.primaryMuted,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 18,
    },
    logo: { width: 56, height: 56 },
    title: {
      fontSize: 26,
      fontWeight: '800',
      color: C.textPrimary,
      letterSpacing: -0.5,
      textAlign: 'center',
    },
    subtitle: {
      marginTop: 8,
      fontSize: 14,
      lineHeight: 20,
      color: C.textSecondary,
      textAlign: 'center',
      maxWidth: 300,
    },
    form: { width: '100%' },
    fieldLabel: { fontSize: 13, fontWeight: '700', color: C.textSecondary, marginBottom: 8 },
    fieldLabelSpaced: { marginTop: 16 },
    inputContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      minHeight: 54,
      borderRadius: 16,
      borderWidth: 1.5,
      borderColor: C.border,
      backgroundColor: C.bgSecondary,
      paddingHorizontal: 14,
    },
    inputFocused: { borderColor: C.primary, backgroundColor: C.surface },
    input: {
      flex: 1,
      fontSize: 16,
      color: C.textPrimary,
      paddingVertical: Platform.OS === 'android' ? 10 : 12,
    },
    primaryButton: {
      flexDirection: 'row',
      backgroundColor: C.primary,
      height: 56,
      borderRadius: 16,
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: 24,
      gap: 8,
    },
    buttonLoading: { opacity: 0.8 },
    primaryButtonText: { color: C.textOnPrimary, fontSize: 17, fontWeight: '700' },
    cancelButton: { marginTop: 18, alignItems: 'center', paddingVertical: 8 },
    cancelText: { fontSize: 14, color: C.textSecondary, fontWeight: '600' },
  });
}
