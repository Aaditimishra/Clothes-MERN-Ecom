import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Dialog, Empty, Field, Loading, Pager } from '../components/ui';
import { AdminError, api, query } from '../lib/api';
import { formatDate, titleCase } from '../lib/format';
import { useSession } from '../lib/session';
import { useToast } from '../lib/toast';
import type { Paged, StaffView } from '../lib/types';
import { usePaging } from '../lib/paging';

interface Draft {
  email: string;
  password: string;
  name: string;
  role: string;
}

export const StaffPage = () => {
  const { session } = useSession();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const { page, pageSize, setPage, setPageSize } = usePaging(25);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [resetting, setResetting] = useState<StaffView | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const roles = session?.catalogue.roles ?? [];
  const allPermissions = session?.catalogue.permissions ?? [];

  const { data, isLoading } = useQuery({
    queryKey: ['staff', page, pageSize],
    queryFn: () => api<Paged<StaffView>>(`/staff${query({ page, pageSize })}`),
  });

  const done = (message: string) => {
    void queryClient.invalidateQueries({ queryKey: ['staff'] });
    setDraft(null);
    setResetting(null);
    setNewPassword('');
    setFields({});
    notify(message);
  };

  const create = useMutation({
    mutationFn: (input: Draft) =>
      api<StaffView>('/staff', { method: 'POST', body: input }),
    onSuccess: () => done('Staff member added'),
    onError: (error: unknown) => {
      if (error instanceof AdminError) setFields(error.fields);
      notify(error instanceof Error ? error.message : 'Could not add', 'error');
    },
  });

  const update = useMutation({
    mutationFn: (input: { id: string; patch: Record<string, unknown> }) =>
      api<StaffView>(`/staff/${input.id}`, { method: 'PUT', body: input.patch }),
    onSuccess: () => done('Staff member updated'),
    onError: (error: unknown) =>
      notify(error instanceof Error ? error.message : 'Could not update', 'error'),
  });

  const resetPassword = useMutation({
    mutationFn: (input: { id: string; password: string }) =>
      api<void>(`/staff/${input.id}/password`, {
        method: 'PUT',
        body: { password: input.password },
      }),
    onSuccess: () => done('Password changed'),
    onError: (error: unknown) =>
      notify(
        error instanceof Error ? error.message : 'Could not change password',
        'error',
      ),
  });

  return (
    <>
      <header className="topbar">
        <h1>Staff</h1>
        <div className="topbar-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() =>
              setDraft({ email: '', password: '', name: '', role: roles[0] ?? 'support' })
            }
          >
            Add staff
          </button>
        </div>
      </header>

      <div className="page">
        <p className="notice">
          Permissions are checked one by one, not by role name. A merchandiser can edit
          the catalogue without touching pricing or settings — and the menu hides what
          they cannot reach rather than showing buttons that fail on click.
        </p>

        <section className="card">
          {isLoading ? (
            <Loading />
          ) : data && data.items.length > 0 ? (
            <>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th className="num">Permissions</th>
                      <th>Last signed in</th>
                      <th>Status</th>
                      <th className="tight" />
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((member) => (
                      <tr
                        key={member.id}
                        style={member.isActive ? undefined : { opacity: 0.55 }}
                      >
                        <td>
                          <strong>{member.name}</strong>
                          {member.id === session?.staff.id ? (
                            <span className="muted"> · you</span>
                          ) : null}
                        </td>
                        <td className="mono">{member.email}</td>
                        <td>
                          <select
                            className="select"
                            style={{ width: 150 }}
                            value={member.role}
                            onChange={(event) =>
                              update.mutate({
                                id: member.id,
                                // Only the role is sent. The server re-applies that
                                // role's preset, which is what the dropdown implies
                                // — sending `permissions: undefined` looked like it
                                // said the same thing, but JSON drops the key and
                                // the old permissions silently survived.
                                patch: { role: event.target.value },
                              })
                            }
                          >
                            {roles.map((role) => (
                              <option key={role} value={role}>
                                {titleCase(role)}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="num">
                          {member.permissions.length} / {allPermissions.length}
                        </td>
                        <td className="muted">{formatDate(member.lastLoginAt)}</td>
                        <td>
                          <span
                            className={`badge badge-${member.isActive ? 'active' : 'archived'}`}
                          >
                            {member.isActive ? 'active' : 'disabled'}
                          </span>
                        </td>
                        <td className="tight">
                          <div className="row">
                            <button
                              type="button"
                              className="btn btn-sm"
                              onClick={() => setResetting(member)}
                            >
                              Password
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-danger"
                              disabled={member.id === session?.staff.id}
                              title={
                                member.id === session?.staff.id
                                  ? 'You cannot disable your own account'
                                  : undefined
                              }
                              onClick={() =>
                                update.mutate({
                                  id: member.id,
                                  patch: { isActive: !member.isActive },
                                })
                              }
                            >
                              {member.isActive ? 'Disable' : 'Enable'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager
                page={data.page}
                pageCount={data.pageCount}
                total={data.total}
                pageSize={pageSize}
                onChange={setPage}
                onPageSize={setPageSize}
                noun="person"
              />
            </>
          ) : (
            <Empty title="No staff yet" />
          )}
        </section>
      </div>

      {draft ? (
        <Dialog
          title="Add staff member"
          onClose={() => setDraft(null)}
          footer={
            <>
              <button type="button" className="btn" onClick={() => setDraft(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={create.isPending}
                onClick={() => create.mutate(draft)}
              >
                {create.isPending ? 'Adding…' : 'Add'}
              </button>
            </>
          }
        >
          <div className="grid-2">
            <Field label="Name" error={fields.name}>
              <input
                className="input"
                value={draft.name}
                autoFocus
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              />
            </Field>
            <Field label="Role">
              <select
                className="select"
                value={draft.role}
                onChange={(event) => setDraft({ ...draft, role: event.target.value })}
              >
                {roles.map((role) => (
                  <option key={role} value={role}>
                    {titleCase(role)}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Email" error={fields.email}>
            <input
              type="email"
              className="input"
              value={draft.email}
              onChange={(event) => setDraft({ ...draft, email: event.target.value })}
            />
          </Field>

          <Field label="Password" hint="At least 12 characters." error={fields.password}>
            <input
              type="text"
              className="input mono"
              value={draft.password}
              onChange={(event) => setDraft({ ...draft, password: event.target.value })}
            />
          </Field>
        </Dialog>
      ) : null}

      {resetting ? (
        <Dialog
          title={`New password for ${resetting.name}`}
          onClose={() => {
            setResetting(null);
            setNewPassword('');
          }}
          footer={
            <>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setResetting(null);
                  setNewPassword('');
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={resetPassword.isPending || newPassword.length < 12}
                onClick={() =>
                  resetPassword.mutate({ id: resetting.id, password: newPassword })
                }
              >
                {resetPassword.isPending ? 'Saving…' : 'Set password'}
              </button>
            </>
          }
        >
          <Field label="New password" hint="At least 12 characters.">
            <input
              type="text"
              className="input mono"
              autoFocus
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
          </Field>
        </Dialog>
      ) : null}
    </>
  );
};
