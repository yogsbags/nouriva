import { createClient } from '@supabase/supabase-js';
import type { ProviderType } from './providerTypes';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !anonKey) {
  console.warn('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
}

export const supabase = createClient(url ?? '', anonKey ?? '');

export const prescriptionFunctionUrl =
  (import.meta.env.VITE_PRESCRIPTION_FUNCTION_URL as string | undefined) ??
  (url ? `${url}/functions/v1/analyze-prescription` : '');

export type CareProviderProfile = {
  user_id: string;
  full_name: string;
  provider_type: ProviderType;
  practice_name: string | null;
  credential_id: string | null;
};

export type ProviderPatient = {
  patient_user_id: string;
  patient_code_suffix: string | null;
  health_goal: string | null;
  has_report_insights: boolean;
  linked_at: string;
};

export type InsightUpload = {
  id: string;
  patient_user_id: string;
  document_kind: string | null;
  summary_preview: string | null;
  created_at: string;
};

/** @deprecated */
export type DoctorProfile = CareProviderProfile;
/** @deprecated */
export type DoctorPatient = ProviderPatient;
