import * as Linking from 'expo-linking';
import { supabase } from './supabase';

const RESET_PATH = 'reset-password';

/** Deep link Supabase should redirect to after the user taps the email link. */
export function getPasswordResetRedirectUrl(): string {
  return Linking.createURL(RESET_PATH);
}

export function isPasswordRecoveryUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    lower.includes('reset-password') ||
    lower.includes('type=recovery') ||
    lower.includes('type%3drecovery')
  );
}

type AuthUrlParams = {
  access_token?: string;
  refresh_token?: string;
  type?: string;
};

/** Supabase puts tokens in the URL hash (#) or query string after redirect. */
export function parseAuthParamsFromUrl(url: string): AuthUrlParams {
  const hash = url.includes('#') ? url.split('#')[1] : '';
  const query = url.includes('?') ? url.split('?')[1]?.split('#')[0] ?? '' : '';
  const params = new URLSearchParams(hash || query);
  return {
    access_token: params.get('access_token') ?? undefined,
    refresh_token: params.get('refresh_token') ?? undefined,
    type: params.get('type') ?? undefined,
  };
}

/**
 * Exchange a recovery deep link for a short-lived Supabase session.
 * Returns true when the link is a password-recovery flow.
 */
export async function establishRecoverySessionFromUrl(url: string): Promise<boolean> {
  const { access_token, refresh_token, type } = parseAuthParamsFromUrl(url);
  if (!access_token || !refresh_token) {
    throw new Error('This reset link is invalid or has expired. Request a new one from the app.');
  }
  const { error } = await supabase.auth.setSession({ access_token, refresh_token });
  if (error) throw error;
  return type === 'recovery';
}

export async function requestPasswordResetEmail(email: string): Promise<void> {
  const redirectTo = getPasswordResetRedirectUrl();
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
  if (error) throw error;
}

export async function updatePassword(newPassword: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}
