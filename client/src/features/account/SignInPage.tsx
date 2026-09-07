import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { ApiRequestError } from '../../lib/api';
import { useAuth } from '../../store/auth';

type Mode = 'sign-in' | 'sign-up';

export const SignInPage = () => {
  const { signIn, signUp, customer } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState<Mode>('sign-in');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isBusy, setBusy] = useState(false);

  // Wherever the shopper was headed before being asked to sign in.
  const destination = (location.state as { from?: string } | null)?.from ?? '/account';

  if (customer) {
    navigate(destination, { replace: true });
    return null;
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFields({});
    setFormError(null);
    setBusy(true);

    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? '').trim();

    try {
      if (mode === 'sign-in') {
        await signIn(text('email'), text('password'));
      } else {
        await signUp({
          email: text('email'),
          password: text('password'),
          firstName: text('firstName'),
          lastName: text('lastName'),
        });
      }
      navigate(destination, { replace: true });
    } catch (error) {
      if (error instanceof ApiRequestError) {
        setFields(error.fields);
        setFormError(error.message);
      } else {
        setFormError('Something went wrong. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="shell page auth-page">
      <div className="auth-card">
        <h1 className="section-title">{mode === 'sign-in' ? 'Sign in' : 'Create an account'}</h1>
        <p className="muted">
          {mode === 'sign-in'
            ? 'Your bag and wishlist follow you between devices.'
            : 'Save addresses, track orders and keep a wishlist.'}
        </p>

        <form className="stack" onSubmit={handleSubmit} noValidate>
          {formError ? (
            <p className="notice notice-error" role="alert">
              {formError}
            </p>
          ) : null}

          {mode === 'sign-up' ? (
            <div className="grid-2">
              <label className="field">
                <span className="field-label">First name</span>
                <input
                  name="firstName"
                  className="input"
                  autoComplete="given-name"
                  required
                  aria-invalid={Boolean(fields.firstName)}
                />
                {fields.firstName ? <span className="field-error">{fields.firstName}</span> : null}
              </label>
              <label className="field">
                <span className="field-label">Last name</span>
                <input
                  name="lastName"
                  className="input"
                  autoComplete="family-name"
                  required
                  aria-invalid={Boolean(fields.lastName)}
                />
                {fields.lastName ? <span className="field-error">{fields.lastName}</span> : null}
              </label>
            </div>
          ) : null}

          <label className="field">
            <span className="field-label">Email</span>
            <input
              name="email"
              type="email"
              className="input"
              autoComplete="email"
              required
              aria-invalid={Boolean(fields.email)}
            />
            {fields.email ? <span className="field-error">{fields.email}</span> : null}
          </label>

          <label className="field">
            <span className="field-label">Password</span>
            <input
              name="password"
              type="password"
              className="input"
              autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
              required
              aria-invalid={Boolean(fields.password)}
            />
            {fields.password ? (
              <span className="field-error">{fields.password}</span>
            ) : mode === 'sign-up' ? (
              <span className="muted auth-hint">At least 12 characters.</span>
            ) : null}
          </label>

          {mode === 'sign-in' ? (
            <div style={{ marginTop: -6 }}>
              <Link to="/reset-password" className="link-btn">
                Forgot your password?
              </Link>
            </div>
          ) : null}

          <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={isBusy}>
            {isBusy ? 'Please wait…' : mode === 'sign-in' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <p className="auth-switch">
          {mode === 'sign-in' ? "Don't have an account?" : 'Already have an account?'}{' '}
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in');
              setFields({});
              setFormError(null);
            }}
          >
            {mode === 'sign-in' ? 'Create one' : 'Sign in'}
          </button>
        </p>

        <p className="muted auth-demo">
          Demo account: <code>demo@threadline.shop</code> / <code>threadline-demo-2026</code>
        </p>

        <Link to="/shop" className="link-btn">
          ← Back to shopping
        </Link>
      </div>
    </div>
  );
};
