import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Field } from '../components/ui';
import { AdminError, api } from '../lib/api';
import { formatDate, titleCase } from '../lib/format';
import { useSession } from '../lib/session';
import { useToast } from '../lib/toast';
import type { StaffView } from '../lib/types';

export const ProfilePage = () => {
  const { session, refresh } = useSession();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [fields, setFields] = useState<Record<string, string>>({});

  const staff = session?.staff;

  const saveName = useMutation({
    mutationFn: (name: string) =>
      api<StaffView>('/auth/profile', { method: 'PUT', body: { name } }),
    onSuccess: async () => {
      await refresh();
      void queryClient.invalidateQueries({ queryKey: ['staff'] });
      notify('Profile updated');
    },
    onError: (error: unknown) => {
      if (error instanceof AdminError) setFields(error.fields);
      notify(error instanceof Error ? error.message : 'Could not save', 'error');
    },
  });

  const changePassword = useMutation({
    mutationFn: (body: { currentPassword: string; newPassword: string }) =>
      api<void>('/auth/password', { method: 'PUT', body }),
    onSuccess: () => {
      setFields({});
      notify('Password changed');
    },
    onError: (error: unknown) => {
      if (error instanceof AdminError) setFields(error.fields);
      notify(error instanceof Error ? error.message : 'Could not change password', 'error');
    },
  });

  if (!staff) return null;

  return (
    <>
      <header className="topbar">
        <h1>Your profile</h1>
      </header>

      <div className="page profile-page">
        <section className="card">
          <div className="card-head">
            <h2>Account</h2>
          </div>
          <div className="card-body">
            <form
              className="profile-form"
              onSubmit={(event) => {
                event.preventDefault();
                setFields({});
                const form = new FormData(event.currentTarget);
                saveName.mutate(String(form.get('name') ?? ''));
              }}
            >
              <Field label="Name" error={fields.name}>
                <input
                  name="name"
                  className="input"
                  defaultValue={staff.name}
                  required
                  aria-invalid={Boolean(fields.name)}
                />
              </Field>

              <Field
                label="Email"
                hint="Your email identifies the account and is where a reset link goes. An owner can change it from Staff."
              >
                <input className="input" value={staff.email} readOnly disabled />
              </Field>

              <div>
                <button type="submit" className="btn btn-primary" disabled={saveName.isPending}>
                  {saveName.isPending ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Change password</h2>
          </div>
          <div className="card-body">
            <form
              className="profile-form"
              onSubmit={(event) => {
                event.preventDefault();
                setFields({});
                const form = new FormData(event.currentTarget);
                changePassword.mutate({
                  currentPassword: String(form.get('currentPassword') ?? ''),
                  newPassword: String(form.get('newPassword') ?? ''),
                });
                event.currentTarget.reset();
              }}
            >
              <Field label="Current password" error={fields.currentPassword}>
                <input
                  name="currentPassword"
                  type="password"
                  className="input"
                  autoComplete="current-password"
                  required
                  aria-invalid={Boolean(fields.currentPassword)}
                />
              </Field>

              <Field
                label="New password"
                hint="At least 12 characters."
                error={fields.newPassword}
              >
                <input
                  name="newPassword"
                  type="password"
                  className="input"
                  autoComplete="new-password"
                  required
                  aria-invalid={Boolean(fields.newPassword)}
                />
              </Field>

              <div>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={changePassword.isPending}
                >
                  {changePassword.isPending ? 'Changing…' : 'Change password'}
                </button>
              </div>
            </form>
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Access</h2>
            <span className="muted">Only an owner can change this</span>
          </div>
          <div className="card-body">
            <dl className="summary">
              <div>
                <dt>Role</dt>
                <dd>{titleCase(staff.role)}</dd>
              </div>
              <div>
                <dt>Permissions</dt>
                <dd>
                  {staff.permissions.length} of {session.catalogue.permissions.length}
                </dd>
              </div>
              <div>
                <dt>Last signed in</dt>
                <dd>{formatDate(staff.lastLoginAt)}</dd>
              </div>
            </dl>

            <div className="chip-row">
              {session.catalogue.permissions.map((permission) => (
                <span
                  key={permission}
                  className={`badge ${
                    staff.permissions.includes(permission) ? 'badge-active' : ''
                  }`}
                  style={
                    staff.permissions.includes(permission) ? undefined : { opacity: 0.45 }
                  }
                >
                  {permission}
                </span>
              ))}
            </div>
          </div>
        </section>
      </div>
    </>
  );
};
