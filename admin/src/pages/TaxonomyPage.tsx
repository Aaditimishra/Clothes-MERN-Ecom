import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import {
  ConfirmDialog,
  Dialog,
  Empty,
  Field,
  Loading,
  Pager,
  Swatch,
} from '../components/ui';
import { api, query } from '../lib/api';
import { useSession } from '../lib/session';
import { useToast } from '../lib/toast';
import type { Paged, TaxonomyTerm } from '../lib/types';
import { usePaging } from '../lib/paging';

/**
 * The vocabulary the shop filters and merchandises by.
 *
 * Every group is the same shape, so one screen serves all of them — adding
 * "Corduroy" to fabrics and "Forest Green" to colours are the same action, and
 * both reach the storefront on the next request.
 */
const GROUPS = [
  { code: 'colour', label: 'Colours', hasSwatch: true },
  { code: 'size', label: 'Sizes', hasSwatch: false },
  { code: 'brand', label: 'Brands', hasSwatch: false },
  { code: 'department', label: 'Departments', hasSwatch: false },
  { code: 'fabric', label: 'Fabrics', hasSwatch: false },
  { code: 'fit', label: 'Fits', hasSwatch: false },
  { code: 'occasion', label: 'Occasions', hasSwatch: false },
  { code: 'sleeve-length', label: 'Sleeve lengths', hasSwatch: false },
  { code: 'pattern', label: 'Patterns', hasSwatch: false },
  { code: 'neckline', label: 'Necklines', hasSwatch: false },
] as const;

type Draft = { id?: string; label: string; swatch: string; isFilterable: boolean };

export const TaxonomyPage = () => {
  const { can } = useSession();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const { page, pageSize, setPage, setPageSize } = usePaging(25);

  const [group, setGroup] = useState<string>('colour');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [deactivating, setDeactivating] = useState<TaxonomyTerm | null>(null);

  const canManage = can('taxonomy.manage');
  const active = GROUPS.find((entry) => entry.code === group)!;

  const { data, isLoading } = useQuery({
    queryKey: ['taxonomy', group, page, pageSize],
    queryFn: () =>
      api<Paged<TaxonomyTerm>>(`/taxonomy${query({ group, page, pageSize })}`),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['taxonomy'] });
    setDraft(null);
    setDeactivating(null);
  };

  const save = useMutation({
    mutationFn: (input: Draft) =>
      input.id
        ? api<TaxonomyTerm>(`/taxonomy/${input.id}`, {
            method: 'PUT',
            body: {
              label: input.label,
              swatch: active.hasSwatch ? input.swatch : null,
              isFilterable: input.isFilterable,
            },
          })
        : api<TaxonomyTerm>('/taxonomy', {
            method: 'POST',
            body: {
              group,
              label: input.label,
              swatch: active.hasSwatch ? input.swatch : null,
              isFilterable: input.isFilterable,
            },
          }),
    onSuccess: () => {
      invalidate();
      notify('Saved');
    },
    onError: (error: unknown) =>
      notify(error instanceof Error ? error.message : 'Could not save', 'error'),
  });

  const deactivate = useMutation({
    mutationFn: (id: string) =>
      api<TaxonomyTerm>(`/taxonomy/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      invalidate();
      notify('Term deactivated');
    },
    onError: (error: unknown) =>
      notify(error instanceof Error ? error.message : 'Could not deactivate', 'error'),
  });

  const reactivate = useMutation({
    mutationFn: (term: TaxonomyTerm) =>
      api<TaxonomyTerm>(`/taxonomy/${term.id}`, {
        method: 'PUT',
        body: { isActive: true },
      }),
    onSuccess: () => {
      invalidate();
      notify('Term reactivated');
    },
  });

  return (
    <>
      <header className="topbar">
        <div>
          <h1>Attributes &amp; brands</h1>
          {/*
            Named, because "Attributes" alone did not tell anyone that brands
            live here — the first question asked about this screen was where to
            add one, and the answer was a tab three along.
          */}
          <p className="topbar-sub">
            Brands, colours, sizes and every other word the shop uses
          </p>
        </div>
        <div className="topbar-actions">
          {canManage ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() =>
                setDraft({ label: '', swatch: '#888888', isFilterable: true })
              }
            >
              Add {active.label.replace(/s$/, '').toLowerCase()}
            </button>
          ) : null}
        </div>
      </header>

      <div className="page">
        <p className="notice">
          These are the values products can be tagged with, and the filters shoppers see.
          Anything added here reaches the storefront on the next page load — no deployment
          needed.
        </p>

        <section className="card">
          <div className="tabs">
            {GROUPS.map((entry) => (
              <button
                key={entry.code}
                type="button"
                className={`tab${entry.code === group ? ' is-active' : ''}`}
                onClick={() => setGroup(entry.code)}
              >
                {entry.label}
              </button>
            ))}
          </div>

          {isLoading ? (
            <Loading />
          ) : data && data.items.length > 0 ? (
            <>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      {active.hasSwatch ? <th style={{ width: 44 }} /> : null}
                      <th>Label</th>
                      <th>Code</th>
                      <th>Filterable</th>
                      <th>Status</th>
                      <th className="tight" />
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((term) => (
                      <tr
                        key={term.id}
                        style={term.isActive ? undefined : { opacity: 0.55 }}
                      >
                        {active.hasSwatch ? (
                          <td>
                            <Swatch colour={term.swatch} />
                          </td>
                        ) : null}
                        <td>
                          <strong>{term.label}</strong>
                        </td>
                        <td className="mono muted">{term.code}</td>
                        <td>{term.isFilterable ? 'Yes' : 'No'}</td>
                        <td>
                          <span
                            className={`badge badge-${term.isActive ? 'active' : 'archived'}`}
                          >
                            {term.isActive ? 'active' : 'inactive'}
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
                                    id: term.id,
                                    label: term.label,
                                    swatch: term.swatch ?? '#888888',
                                    isFilterable: term.isFilterable,
                                  })
                                }
                              >
                                Edit
                              </button>
                              {term.isActive ? (
                                <button
                                  type="button"
                                  className="btn btn-sm btn-danger"
                                  onClick={() => setDeactivating(term)}
                                >
                                  Deactivate
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="btn btn-sm"
                                  onClick={() => reactivate.mutate(term)}
                                >
                                  Reactivate
                                </button>
                              )}
                            </div>
                          ) : null}
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
                noun="term"
              />
            </>
          ) : (
            <Empty title={`No ${active.label.toLowerCase()} yet`} />
          )}
        </section>
      </div>

      {draft ? (
        <Dialog
          title={draft.id ? 'Edit term' : `Add to ${active.label.toLowerCase()}`}
          onClose={() => setDraft(null)}
          footer={
            <>
              <button type="button" className="btn" onClick={() => setDraft(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!draft.label.trim() || save.isPending}
                onClick={() => save.mutate(draft)}
              >
                {save.isPending ? 'Saving…' : 'Save'}
              </button>
            </>
          }
        >
          <Field
            label="Label"
            hint={
              draft.id
                ? 'Safe to rename at any time — products reference the code, not the label.'
                : 'The code is generated from this and cannot be changed later.'
            }
          >
            <input
              className="input"
              value={draft.label}
              autoFocus
              onChange={(event) => setDraft({ ...draft, label: event.target.value })}
            />
          </Field>

          {active.hasSwatch ? (
            <Field
              label="Swatch"
              hint="The dot shown in filters and on the product page."
            >
              <div className="row">
                <input
                  type="color"
                  value={draft.swatch}
                  onChange={(event) => setDraft({ ...draft, swatch: event.target.value })}
                  style={{ width: 44, height: 34, padding: 2 }}
                />
                <input
                  className="input mono"
                  style={{ width: 120 }}
                  value={draft.swatch}
                  onChange={(event) => setDraft({ ...draft, swatch: event.target.value })}
                />
              </div>
            </Field>
          ) : null}

          <label className="switch">
            <input
              type="checkbox"
              checked={draft.isFilterable}
              onChange={(event) =>
                setDraft({ ...draft, isFilterable: event.target.checked })
              }
            />
            Offer this as a filter in the shop
          </label>
        </Dialog>
      ) : null}

      {deactivating ? (
        <ConfirmDialog
          title="Deactivate this term?"
          confirmLabel="Deactivate"
          busy={deactivate.isPending}
          onClose={() => setDeactivating(null)}
          onConfirm={() => deactivate.mutate(deactivating.id)}
          message={
            <>
              <p>
                <strong>{deactivating.label}</strong> will disappear from the shop's
                filters and from the product editor.
              </p>
              <p className="muted" style={{ marginTop: 8 }}>
                Products already using it keep it, and past orders stay readable — which
                is why this deactivates rather than deletes.
              </p>
            </>
          }
        />
      ) : null}
    </>
  );
};
