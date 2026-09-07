import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { Field } from '../../components/Field';
import { ApiRequestError, request } from '../../lib/api';
import { useToast } from '../../store/toast';

/**
 * Two screens in one route.
 *
 * With a token in the URL it sets a new password; without one it asks for an
 * email. Splitting them would mean a second route that only ever gets reached
 * from a link, and a reset email that pointed at the wrong one would dead-end.
 */
export const ResetPasswordPage = () => {
  const [params] = useSearchParams();
  const token = params.get('token');
  const navigate = useNavigate();
  const { notify } = useToast();

  const [fields, setFields] = useState<Record<string, string>>({});
  const [sent, setSent] = useState(false);

  const requestReset = useMutation({
    mutationFn: (email: string) =>
      request<{ message: string }>('/auth/forgot-password', {
        method: 'POST',
        body: { email },
      }),
    onSuccess: () => setSent(true),
    onError: (error: unknown) => {
      if (error instanceof ApiRequestError) setFields(error.fields);
      notify(error instanceof Error ? error.message : 'Something went wrong', 'error');
    },
  });

  const applyReset = useMutation({
    mutationFn: (password: string) =>
      request<void>('/auth/reset-password', {
        method: 'POST',
        body: { token, password },
      }),
    onSuccess: () => {
      notify('Password changed — sign in with your new one');
      navigate('/sign-in', { replace: true });
    },
    onError: (error: unknown) => {
      if (error instanceof ApiRequestError) setFields(error.fields);
      notify(error instanceof Error ? error.message : 'Could not reset', 'error');
    },
  });

  if (token) {
    return (
      <div className="shell page auth-page">
        <form
          className="auth-card"
          onSubmit={(event) => {
            event.preventDefault();
            setFields({});
            const form = new FormData(event.currentTarget);
            applyReset.mutate(String(form.get('password') ?? ''));
          }}
        >
          <div>
            <h1 className="section-title">Choose a new password</h1>
            <p className="muted">This link works once.</p>
          </div>

          {fields.token ? (
            <p className="notice notice-error" role="alert">
              {fields.token}. <Link to="/reset-password" className="link-btn">Request a new link</Link>
            </p>
          ) : null}

          <Field label="New password" error={fields.password} hint="At least 12 characters.">
            <input
              name="password"
              type="password"
              className="input"
              autoComplete="new-password"
              required
              autoFocus
              aria-invalid={Boolean(fields.password)}
            />
          </Field>

          <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={applyReset.isPending}>
            {applyReset.isPending ? 'Saving…' : 'Set new password'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="shell page auth-page">
      <form
        className="auth-card"
        onSubmit={(event) => {
          event.preventDefault();
          setFields({});
          const form = new FormData(event.currentTarget);
          requestReset.mutate(String(form.get('email') ?? ''));
        }}
      >
        <div>
          <h1 className="section-title">Forgot your password?</h1>
          <p className="muted">We will email you a link to set a new one.</p>
        </div>

        {sent ? (
          <>
            <p className="notice notice-success" role="status">
              If that email has an account, a reset link is on its way. It expires in
              an hour.
            </p>
            <p className="muted auth-hint">
              We answer the same way whether or not the address is registered — that
              is deliberate, so this page cannot be used to find out who shops here.
            </p>
          </>
        ) : (
          <>
            <Field label="Email" error={fields.email}>
              <input
                name="email"
                type="email"
                className="input"
                autoComplete="email"
                required
                autoFocus
                aria-invalid={Boolean(fields.email)}
              />
            </Field>

            <button
              type="submit"
              className="btn btn-primary btn-lg btn-block"
              disabled={requestReset.isPending}
            >
              {requestReset.isPending ? 'Sending…' : 'Send reset link'}
            </button>
          </>
        )}

        <Link to="/sign-in" className="link-btn">
          ← Back to sign in
        </Link>
      </form>
    </div>
  );
};
