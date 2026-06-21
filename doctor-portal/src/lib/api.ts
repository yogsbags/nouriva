import { supabase, prescriptionFunctionUrl, type CareProviderProfile, type ProviderPatient } from './supabase';
import type { DocumentKind, ProviderType } from './providerTypes';

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}

export async function signUp(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data.session;
}

export async function signOut() {
  await supabase.auth.signOut();
}

export async function fetchProviderProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from('care_provider_profiles')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw error;
  return data as CareProviderProfile | null;
}

export async function upsertProviderProfile(input: {
  full_name: string;
  provider_type: ProviderType;
  practice_name?: string;
  credential_id?: string;
}) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  const { error } = await supabase.from('care_provider_profiles').upsert({
    user_id: user.id,
    full_name: input.full_name.trim(),
    provider_type: input.provider_type,
    practice_name: input.practice_name?.trim() || null,
    credential_id: input.credential_id?.trim() || null,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function fetchPatients(): Promise<ProviderPatient[]> {
  const { data, error } = await supabase.rpc('get_provider_patients');
  if (error) throw error;
  return (data ?? []) as ProviderPatient[];
}

export async function linkPatientByCode(code: string): Promise<string> {
  const { data, error } = await supabase.rpc('link_patient_with_code', { p_code: code });
  if (error) throw error;
  return data as string;
}

export async function uploadCareDocument(
  patientId: string,
  files: File[],
  documentKind: DocumentKind
) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not signed in');

  const form = new FormData();
  form.append('patient_id', patientId);
  form.append('document_kind', documentKind);
  for (const file of files) {
    form.append('files', file);
  }

  const res = await fetch(prescriptionFunctionUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
    body: form,
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((body as { error?: string }).error ?? 'Upload failed');
  }
  return body as { ok: boolean; message: string; preview?: string };
}

export async function fetchRecentUploads(limit = 20) {
  const { data, error } = await supabase
    .from('clinical_insight_uploads')
    .select('id, patient_user_id, document_kind, summary_preview, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

/** @deprecated use fetchProviderProfile */
export const fetchDoctorProfile = fetchProviderProfile;

/** @deprecated use upsertProviderProfile */
export const upsertDoctorProfile = upsertProviderProfile;

/** @deprecated use uploadCareDocument */
export const uploadPrescription = (
  patientId: string,
  files: File[],
  documentKind: DocumentKind = 'prescription'
) => uploadCareDocument(patientId, files, documentKind);
