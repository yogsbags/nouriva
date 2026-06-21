import { FormEvent, useState } from 'react';
import { upsertProviderProfile } from '../lib/api';
import { PROVIDER_TYPES, type ProviderType } from '../lib/providerTypes';

type Props = { onComplete: () => void };

export default function ProviderSetupPage({ onComplete }: Props) {
  const [fullName, setFullName] = useState('');
  const [providerType, setProviderType] = useState<ProviderType>('physician');
  const [practiceName, setPracticeName] = useState('');
  const [credentialId, setCredentialId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await upsertProviderProfile({
        full_name: fullName,
        provider_type: providerType,
        practice_name: practiceName,
        credential_id: credentialId,
      });
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save profile');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <a href="/" className="portal-home" aria-label="Back to Nouriva AI home">
        <img src="/favicon.png" alt="" width="28" height="28" />
        <span>Nouriva AI</span>
      </a>
      <div className="auth-card card">
        <div className="auth-logo">
          <h1>Care provider profile</h1>
          <p>Physicians, nutritionists, dietitians, holistic practitioners &amp; more</p>
        </div>

        {error ? <div className="alert alert-error">{error}</div> : null}

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="type">Provider type *</label>
            <select
              id="type"
              required
              value={providerType}
              onChange={(e) => setProviderType(e.target.value as ProviderType)}
            >
              {PROVIDER_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="name">Full name *</label>
            <input
              id="name"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Dr. Jane Smith / Priya Sharma, RD"
            />
          </div>
          <div className="field">
            <label htmlFor="practice">Practice / clinic name</label>
            <input
              id="practice"
              value={practiceName}
              onChange={(e) => setPracticeName(e.target.value)}
              placeholder="City Wellness Center"
            />
          </div>
          <div className="field">
            <label htmlFor="credential">License / registration ID</label>
            <input
              id="credential"
              value={credentialId}
              onChange={(e) => setCredentialId(e.target.value)}
              placeholder="Optional"
            />
          </div>
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? 'Saving…' : 'Continue to dashboard'}
          </button>
        </form>
      </div>
    </div>
  );
}
