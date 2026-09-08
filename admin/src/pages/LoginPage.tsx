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
  const [showPassword, setShowPassword] = useState(false);

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

  const heading =
    mode === 'sign-in'
      ? 'Sign in'
      : mode === 'forgot'
        ? 'Reset your password'
        : 'Choose a new password';

  const blurb =
    mode === 'sign-in'
      ? 'Manage the catalogue, orders and payments.'
      : mode === 'forgot'
        ? 'We will email a link to the address on your account.'
        : 'This link works once, so finish it in this tab.';

  return (
    <div className="login">
      {/*
        Two panels on a desk, one on a phone.
        The left is the shop's own side — it is the first screen anybody sees
        each morning, and a bare form floating on grey says nothing about whose
        shop it is. It is decoration, so it is the half that goes away when
        there is no room for it.
      */}
      <aside className="login-brand" aria-hidden="true">
        <div className="login-brand-mark">T</div>
        <h2>Threadline</h2>
        <p>
          Everything the shop sells, and everything it has sold — the catalogue, the
          vocabulary, the orders, the money.
        </p>
        <ul className="login-brand-points">
          <li>Confirm bank transfers against your statement</li>
          <li>Watch what is selling, day by day</li>
          <li>Change the shop without a developer</li>
        </ul>

        <p className="login-brand-foot">
          <span>Threadline admin</span>
          <code>v1.0</code>
        </p>
      </aside>

      <div className="login-panel">
        <form className="login-card" onSubmit={handleSubmit}>
          <div className="login-head">
            {/* Repeated on the small screen, where the brand panel is gone. */}
            <span className="login-mark">T</span>
            <h1>{heading}</h1>
            <p className="muted">{blurb}</p>
          </div>

          {error ? (
            <p className="notice is-danger" role="alert">
              {error}
            </p>
          ) : null}

          {notice ? (
            <p className="notice is-success" role="status">
              {notice}
            </p>
          ) : null}

          {mode !== 'reset' ? (
            <Field label="Email">
              <input
                name="email"
                type="email"
                className="input"
                placeholder="you@yourshop.com"
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
              {/*
                A reveal, because the alternative is retyping.
                Somebody who mistypes a long password has no way to see what
                they typed, and the field clears itself on a failed attempt —
                so the third try is as blind as the first.
              */}
              <div className="login-password">
                <input
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  className="input"
                  placeholder={
                    mode === 'reset' ? 'At least 12 characters' : 'Your password'
                  }
                  autoComplete={mode === 'reset' ? 'new-password' : 'current-password'}
                  required
                  autoFocus={mode === 'reset'}
                />
                <button
                  type="button"
                  className="login-reveal"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    {showPassword ? (
                      <>
                        <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z" />
                        <circle cx="12" cy="12" r="3" />
                        <path d="m3 3 18 18" />
                      </>
                    ) : (
                      <>
                        <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z" />
                        <circle cx="12" cy="12" r="3" />
                      </>
                    )}
                  </svg>
                </button>
              </div>
            </Field>
          ) : null}

          <button
            type="submit"
            className="btn btn-primary btn-lg btn-block"
            disabled={busy}
          >
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

          {/*
            Folded away, because it is scaffolding.
            Four accounts and a password printed under the form is the loudest
            thing on the screen, and it is the part that will not exist once
            this is a real shop.
          */}
          {mode === 'sign-in' ? (
            <details className="login-demo">
              <summary>Demo accounts</summary>
              <table className="login-demo-table">
                <tbody>
                  {[
                    ['admin@threadline.shop', 'Everything'],
                    ['merch@threadline.shop', 'Catalogue'],
                    ['ops@threadline.shop', 'Orders & stock'],
                    ['analyst@threadline.shop', 'Read & export'],
                  ].map(([email, access]) => (
                    <tr key={email}>
                      <td>
                        <code>{email}</code>
                      </td>
                      <td className="muted">{access}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="muted">
                Password for all four: <code>threadline-admin-2026</code>
              </p>
            </details>
          ) : null}
        </form>
      </div>
    </div>
  );
};
