import { useState } from 'react';

import { AdminError, api } from '../lib/api';
import { useSession } from '../lib/session';
import { Field } from '../components/ui';

type Mode = 'sign-in' | 'forgot' | 'reset';

export const LoginPage = () => {
  const { signIn } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // A reset link lands on the same origin with a token, so the screen it needs
  // is decided here rather than by a route only reachable from an email.
  const token = new URLSearchParams(window.location.search).get('token');
  const [mode, setMode] = useState<Mode>(token ? 'reset' : 'sign-in');

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);

    const form = new FormData(event.currentTarget);

    try {
      if (mode === 'sign-in') {
        await signIn(String(form.get('email') ?? ''), String(form.get('password') ?? ''));
      } else if (mode === 'forgot') {
        await api('/auth/forgot-password', {
          method: 'POST',
          body: { email: String(form.get('email') ?? '') },
        });
        // Same answer whether or not the address exists — this endpoint must not
        // become a way to find out who works here.
        setNotice('If that email has an account, a reset link is on its way.');
      } else {
        await api('/auth/reset-password', {
          method: 'POST',
          body: { token, password: String(form.get('password') ?? '') },
        });
        setNotice('Password changed. Sign in with your new one.');
        setMode('sign-in');
        window.history.replaceState({}, '', window.location.pathname);
      }
    } catch (cause) {
      setError(cause instanceof AdminError ? cause.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <form className="login-card" onSubmit={handleSubmit}>
        <div>
          <h1>Threadline Admin</h1>
          <p className="muted">
            {mode === 'sign-in'
              ? 'Sign in to manage the shop.'
              : mode === 'forgot'
                ? 'We will email you a link to set a new password.'
                : 'Choose a new password. This link works once.'}
          </p>
        </div>

        {error ? (
          <p className="notice notice-error" role="alert">
            {error}
          </p>
        ) : null}

        {notice ? (
          <p className="notice notice-success" role="status">
            {notice}
          </p>
        ) : null}

        {mode !== 'reset' ? (
          <Field label="Email">
            <input
              name="email"
              type="email"
              className="input"
              autoComplete="username"
              required
              autoFocus
            />
          </Field>
        ) : null}

        {mode !== 'forgot' ? (
          <Field
            label={mode === 'reset' ? 'New password' : 'Password'}
            hint={mode === 'reset' ? 'At least 12 characters.' : undefined}
          >
            <input
              name="password"
              type="password"
              className="input"
              autoComplete={mode === 'reset' ? 'new-password' : 'current-password'}
              required
              autoFocus={mode === 'reset'}
            />
          </Field>
        ) : null}

        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy
            ? 'Working…'
            : mode === 'sign-in'
              ? 'Sign in'
              : mode === 'forgot'
                ? 'Send reset link'
                : 'Set new password'}
        </button>

        <button
          type="button"
          className="link-btn"
          onClick={() => {
            setMode(mode === 'sign-in' ? 'forgot' : 'sign-in');
            setError(null);
            setNotice(null);
          }}
        >
          {mode === 'sign-in' ? 'Forgot your password?' : '← Back to sign in'}
        </button>

        <div className="login-hint">
          <strong>Demo accounts</strong>
          <span>
            <code>admin@threadline.shop</code> — full access
          </span>
          <span>
            <code>merch@threadline.shop</code> — catalogue only
          </span>
          <span>
            <code>ops@threadline.shop</code> — orders &amp; stock
          </span>
          <span>
            Password: <code>threadline-admin-2026</code>
          </span>
        </div>
      </form>
    </div>
  );
};
