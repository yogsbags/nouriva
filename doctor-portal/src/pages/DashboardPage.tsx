import { useCallback, useEffect, useState } from 'react';
import {
  fetchProviderProfile,
  fetchPatients,
  linkPatientByCode,
  signOut,
  uploadCareDocument,
} from '../lib/api';
import type { CareProviderProfile, ProviderPatient } from '../lib/supabase';
import { providerTypeLabel, type DocumentKind } from '../lib/providerTypes';
import PrescriptionUpload from '../components/PrescriptionUpload';

type Props = { onSignOut: () => void };

export default function DashboardPage({ onSignOut }: Props) {
  const [profile, setProfile] = useState<CareProviderProfile | null>(null);
  const [patients, setPatients] = useState<ProviderPatient[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [documentKind, setDocumentKind] = useState<DocumentKind>('prescription');
  const [linkCode, setLinkCode] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkSuccess, setLinkSuccess] = useState<string | null>(null);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [loadingPatients, setLoadingPatients] = useState(true);
  const [linking, setLinking] = useState(false);

  const refreshPatients = useCallback(async () => {
    setLoadingPatients(true);
    try {
      const list = await fetchPatients();
      setPatients(list);
      if (list.length && !selectedId) setSelectedId(list[0]!.patient_user_id);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingPatients(false);
    }
  }, [selectedId]);

  useEffect(() => {
    fetchProviderProfile().then(setProfile);
    void refreshPatients();
  }, [refreshPatients]);

  async function handleLink(e: React.FormEvent) {
    e.preventDefault();
    setLinkError(null);
    setLinkSuccess(null);
    setLinking(true);
    try {
      await linkPatientByCode(linkCode.trim());
      setLinkSuccess('Patient linked successfully.');
      setLinkCode('');
      await refreshPatients();
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : 'Could not link patient');
    } finally {
      setLinking(false);
    }
  }

  async function handleUpload(files: File[]) {
    if (!selectedId) throw new Error('Select a patient first');
    setUploadMessage(null);
    const result = await uploadCareDocument(selectedId, files, documentKind);
    setUploadMessage(result.preview ?? result.message);
    await refreshPatients();
  }

  async function handleSignOut() {
    await signOut();
    onSignOut();
  }

  const selected = patients.find((p) => p.patient_user_id === selectedId);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-brand">
          <strong>Nouriva Care Provider Portal</strong>
          <span>
            {profile?.full_name}
            {profile?.provider_type ? ` · ${providerTypeLabel(profile.provider_type)}` : ''}
            {profile?.practice_name ? ` · ${profile.practice_name}` : ''}
          </span>
        </div>
        <button type="button" className="btn btn-ghost" onClick={handleSignOut}>
          Sign out
        </button>
      </header>

      <main className="main">
        <section className="card">
          <h2 className="card-title">Link a patient</h2>
          <p className="card-sub">
            Ask your patient to open Nouriva AI → Profile → Medical Report Sync and share their{' '}
            <strong>Care provider link code</strong> (e.g. NOUV-A3X9).
          </p>
          {linkError ? <div className="alert alert-error">{linkError}</div> : null}
          {linkSuccess ? <div className="alert alert-success">{linkSuccess}</div> : null}
          <form className="inline-form" onSubmit={handleLink}>
            <input
              value={linkCode}
              onChange={(e) => setLinkCode(e.target.value.toUpperCase())}
              placeholder="NOUV-XXXX"
              aria-label="Patient link code"
              required
            />
            <button className="btn btn-primary" type="submit" disabled={linking} style={{ width: 'auto' }}>
              {linking ? 'Linking…' : 'Link'}
            </button>
          </form>
        </section>

        <section className="card">
          <h2 className="card-title">Your patients</h2>
          <p className="card-sub">Select a patient, then upload their document below.</p>

          {loadingPatients ? (
            <p>Loading patients…</p>
          ) : patients.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              No linked patients yet. Add a link code above.
            </p>
          ) : (
            <div className="patient-list">
              {patients.map((p) => (
                <button
                  key={p.patient_user_id}
                  type="button"
                  className={`patient-item${selectedId === p.patient_user_id ? ' selected' : ''}`}
                  onClick={() => setSelectedId(p.patient_user_id)}
                  style={{ textAlign: 'left', cursor: 'pointer', background: 'transparent' }}
                >
                  <strong>Patient ····{p.patient_code_suffix ?? '????'}</strong>
                  <div className="patient-meta">
                    {p.health_goal ? <span>Goal: {p.health_goal}</span> : null}
                    <span className={p.has_report_insights ? 'badge' : 'badge badge-muted'}>
                      {p.has_report_insights ? 'Insights synced' : 'No insights yet'}
                    </span>
                    <span>Linked {new Date(p.linked_at).toLocaleDateString()}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="card">
          <h2 className="card-title">Upload patient document</h2>
          <p className="card-sub">
            Prescriptions, diet charts, meal plans, or care plans — PDF or photo. AI extracts nutrition
            insights only; synced to the patient&apos;s <em>Medical Report Sync</em>. Original files are never
            stored.
          </p>

          {!selected ? (
            <div className="alert alert-info">Link and select a patient first.</div>
          ) : (
            <>
              <div className="field">
                <label htmlFor="doc-kind">Document type</label>
                <select
                  id="doc-kind"
                  value={documentKind}
                  onChange={(e) => setDocumentKind(e.target.value as DocumentKind)}
                  style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', width: '100%' }}
                >
                  <option value="prescription">Prescription</option>
                  <option value="diet_chart">Diet chart / meal plan</option>
                  <option value="care_plan">Clinical care plan</option>
                  <option value="other">Other clinical document</option>
                </select>
              </div>
              <p style={{ fontSize: '0.85rem', marginBottom: 12 }}>
                Uploading for: <strong>Patient ····{selected.patient_code_suffix ?? '????'}</strong>
              </p>
              <PrescriptionUpload disabled={!selectedId} onUpload={handleUpload} />
            </>
          )}

          {uploadMessage ? (
            <div className="alert alert-success" style={{ marginTop: 16 }}>
              <strong>Synced.</strong> Preview: {uploadMessage}
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}
