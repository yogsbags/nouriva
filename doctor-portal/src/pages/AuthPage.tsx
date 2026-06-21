import { FormEvent, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { signIn, signUp } from '../lib/api';

type Props = { onSuccess: () => void };

export default function AuthPage({ onSuccess }: Props) {
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<'login' | 'signup'>(() =>
    searchParams.get('mode') === 'signup' ? 'signup' : 'login',
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === 'login') {
        await signIn(email.trim(), password);
      } else {
        await signUp(email.trim(), password);
      }
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card card">
        <div className="auth-logo">
          <h1>Nouriva AI</h1>
          <p>Care provider portal — sync prescriptions &amp; diet plans to patient apps</p>
        </div>

        {error ? <div className="alert alert-error">{error}</div> : null}

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="email">Work email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="doctor@clinic.com"
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <div className="auth-switch">
          {mode === 'login' ? (
            <>
              New here?{' '}
              <button type="button" onClick={() => setMode('signup')}>
                Register as care provider
              </button>
            </>
          ) : (
            <>
              Already registered?{' '}
              <button type="button" onClick={() => setMode('login')}>
                Sign in
              </button>
            </>
          )}
        </div>

        <div className="alert alert-info" style={{ marginTop: 20, marginBottom: 0 }}>
          Prescription files are analyzed in memory only. Only AI-generated insight text is saved to the
          patient&apos;s Medical Report Sync — never the original document.
        </div>
      </div>
    </div>
  );
}
