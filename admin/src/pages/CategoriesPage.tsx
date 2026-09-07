import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { ConfirmDialog, Dialog, Empty, Field, Loading } from '../components/ui';
import { api } from '../lib/api';
import { useCatalogueMeta } from '../lib/catalogue';
import { useSession } from '../lib/session';
import { useToast } from '../lib/toast';
import type { AdminCategory } from '../lib/types';

interface Draft {
  id?: string;
  name: string;
  slug: string;
  description: string;
  department: string;
  parentId: string;
  position: string;
  isVisible: boolean;
}

const EMPTY: Draft = {
  name: '',
  slug: '',
  description: '',
  department: '',
  parentId: '',
  position: '0',
  isVisible: true,
};

/** Roots first, then their children — the shape a merchant thinks in. */
const inTreeOrder = (categories: AdminCategory[]): AdminCategory[] => {
  const roots = categories.filter((category) => !category.parentId);
  return roots.flatMap((root) => [
    root,
    ...categories.filter((category) => category.parentId === root.id),
  ]);
};

export const CategoriesPage = () => {
  const { can } = useSession();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const meta = useCatalogueMeta();

  const [draft, setDraft] = useState<Draft | null>(null);
  const [deleting, setDeleting] = useState<AdminCategory | null>(null);

  const canManage = can('category.manage');

  const { data, isLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api<AdminCategory[]>('/categories'),
  });

  const done = (message: string) => {
    void queryClient.invalidateQueries({ queryKey: ['categories'] });
    setDraft(null);
    setDeleting(null);
    notify(message);
  };

  const save = useMutation({
    mutationFn: (input: Draft) => {
      const body = {
        name: input.name,
        slug: input.slug || undefined,
        description: input.description || null,
        department: input.department || null,
        parentId: input.parentId || null,
        position: Number(input.position || 0),
        isVisible: input.isVisible,
      };

      return input.id
        ? api(`/categories/${input.id}`, { method: 'PUT', body })
        : api('/categories', { method: 'POST', body });
    },
    onSuccess: () => done('Category saved'),
    onError: (error: unknown) =>
      notify(error instanceof Error ? error.message : 'Could not save', 'error'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api<void>(`/categories/${id}`, { method: 'DELETE' }),
    onSuccess: () => done('Category deleted'),
    onError: (error: unknown) =>
      notify(error instanceof Error ? error.message : 'Could not delete', 'error'),
  });

  const rows = inTreeOrder(data ?? []);

  return (
    <>
      <header className="topbar">
        <h1>Categories</h1>
        <div className="topbar-actions">
          {canManage ? (
            <button type="button" className="btn btn-primary" onClick={() => setDraft(EMPTY)}>
              New category
            </button>
          ) : null}
        </div>
      </header>

      <div className="page">
        <section className="card">
          {isLoading ? (
            <Loading />
          ) : rows.length > 0 ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Slug</th>
                    <th>Department</th>
                    <th className="num">Position</th>
                    <th>Visible</th>
                    <th className="tight" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((category) => (
                    <tr key={category.id}>
                      <td style={category.parentId ? { paddingLeft: 34 } : undefined}>
                        {category.parentId ? <span className="muted">↳ </span> : null}
                        <strong>{category.name}</strong>
                      </td>
                      <td className="mono muted">{category.slug}</td>
                      <td>{category.department ?? '—'}</td>
                      <td className="num">{category.position}</td>
                      <td>
                        <span className={`badge badge-${category.isVisible ? 'active' : 'archived'}`}>
                          {category.isVisible ? 'visible' : 'hidden'}
                        </span>
                      </td>
                      <td className="tight">
                        {canManage ? (
                          <div className="row">
                            <button
                              type="button"
                              className="btn btn-sm"
                              onClick={() =>
                                setDraft({
                                  id: category.id,
                                  name: category.name,
                                  slug: category.slug,
                                  description: category.description ?? '',
                                  department: category.department ?? '',
                                  parentId: category.parentId ?? '',
                                  position: String(category.position),
                                  isVisible: category.isVisible,
                                })
                              }
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-danger"
                              onClick={() => setDeleting(category)}
                            >
                              Delete
                            </button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title="No categories yet" />
          )}
        </section>
      </div>

      {draft ? (
        <Dialog
          title={draft.id ? 'Edit category' : 'New category'}
          onClose={() => setDraft(null)}
          footer={
            <>
              <button type="button" className="btn" onClick={() => setDraft(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!draft.name.trim() || save.isPending}
                onClick={() => save.mutate(draft)}
              >
                {save.isPending ? 'Saving…' : 'Save'}
              </button>
            </>
          }
        >
          <div className="grid-2">
            <Field label="Name">
              <input
                className="input"
                value={draft.name}
                autoFocus
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              />
            </Field>
            <Field label="Slug" hint="Leave blank to generate from the name.">
              <input
                className="input mono"
                value={draft.slug}
                placeholder="auto"
                onChange={(event) => setDraft({ ...draft, slug: event.target.value })}
              />
            </Field>
          </div>

          <Field label="Description" hint="Shown under the heading on the listing page.">
            <textarea
              className="textarea"
              rows={2}
              value={draft.description}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
            />
          </Field>

          <div className="grid-3">
            <Field label="Parent">
              <select
                className="select"
                value={draft.parentId}
                onChange={(event) => setDraft({ ...draft, parentId: event.target.value })}
              >
                <option value="">None (top level)</option>
                {(data ?? [])
                  .filter((category) => !category.parentId && category.id !== draft.id)
                  .map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
              </select>
            </Field>

            <Field label="Department">
              <select
                className="select"
                value={draft.department}
                onChange={(event) => setDraft({ ...draft, department: event.target.value })}
              >
                <option value="">Not set</option>
                {meta.terms('department').map((term) => (
                  <option key={term.code} value={term.code}>
                    {term.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Position" hint="Lower sorts first in the menu.">
              <input
                type="number"
                className="input"
                value={draft.position}
                min="0"
                onChange={(event) => setDraft({ ...draft, position: event.target.value })}
              />
            </Field>
          </div>

          <label className="switch">
            <input
              type="checkbox"
              checked={draft.isVisible}
              onChange={(event) => setDraft({ ...draft, isVisible: event.target.checked })}
            />
            Show in the shop's navigation
          </label>
        </Dialog>
      ) : null}

      {deleting ? (
        <ConfirmDialog
          title="Delete this category?"
          busy={remove.isPending}
          onClose={() => setDeleting(null)}
          onConfirm={() => remove.mutate(deleting.id)}
          message={
            <>
              <strong>{deleting.name}</strong> will be removed. This is refused if any
              product or subcategory still uses it.
            </>
          }
        />
      ) : null}
    </>
  );
};
