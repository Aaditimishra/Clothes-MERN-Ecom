import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { SIZES } from '@shop/shared';

import { ConfirmDialog, Dialog, Empty, Field, Loading } from '../components/ui';
import { api } from '../lib/api';
import { useSession } from '../lib/session';
import { useToast } from '../lib/toast';
import type { SizeChartView } from '../lib/types';

interface Draft {
  id?: string;
  name: string;
  unit: 'cm' | 'in';
  note: string;
  columns: Array<{ code: string; label: string }>;
  rows: Array<{ size: string; values: Record<string, number> }>;
}

const EMPTY: Draft = {
  name: '',
  unit: 'cm',
  note: '',
  columns: [
    { code: 'chest', label: 'Chest' },
    { code: 'waist', label: 'Waist' },
  ],
  rows: [
    { size: 's', values: {} },
    { size: 'm', values: {} },
    { size: 'l', values: {} },
  ],
};

export const SizeChartsPage = () => {
  const { can } = useSession();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [deleting, setDeleting] = useState<SizeChartView | null>(null);

  const canManage = can('catalog.manage');

  const { data, isLoading } = useQuery({
    queryKey: ['size-charts'],
    queryFn: () => api<SizeChartView[]>('/size-charts'),
  });

  const done = (message: string) => {
    void queryClient.invalidateQueries({ queryKey: ['size-charts'] });
    setDraft(null);
    setDeleting(null);
    notify(message);
  };

  const save = useMutation({
    mutationFn: (input: Draft) => {
      const body = {
        name: input.name,
        unit: input.unit,
        note: input.note || null,
        columns: input.columns,
        rows: input.rows,
      };
      return input.id
        ? api(`/size-charts/${input.id}`, { method: 'PUT', body })
        : api('/size-charts', { method: 'POST', body });
    },
    onSuccess: () => done('Size chart saved'),
    onError: (error: unknown) =>
      notify(error instanceof Error ? error.message : 'Could not save', 'error'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api<void>(`/size-charts/${id}`, { method: 'DELETE' }),
    onSuccess: () => done('Size chart deleted'),
    onError: (error: unknown) =>
      notify(error instanceof Error ? error.message : 'Could not delete', 'error'),
  });

  const setCell = (rowIndex: number, code: string, value: string) => {
    if (!draft) return;
    const rows = [...draft.rows];
    const row = rows[rowIndex];
    if (!row) return;
    rows[rowIndex] = { ...row, values: { ...row.values, [code]: Number(value || 0) } };
    setDraft({ ...draft, rows });
  };

  return (
    <>
      <header className="topbar">
        <h1>Size charts</h1>
        <div className="topbar-actions">
          {canManage ? (
            <button type="button" className="btn btn-primary" onClick={() => setDraft(EMPTY)}>
              New chart
            </button>
          ) : null}
        </div>
      </header>

      <div className="page">
        <p className="notice">
          One chart serves many garments. Editing it here updates the size guide on
          every product assigned to it — which is the point: a corrected measurement
          should not have to be typed twenty times.
        </p>

        {isLoading ? (
          <div className="card">
            <Loading />
          </div>
        ) : data && data.length > 0 ? (
          data.map((chart) => (
            <section key={chart.id} className="card">
              <div className="card-head">
                <h2>{chart.name}</h2>
                <span className="muted">
                  {chart.rows.length} sizes · measured in {chart.unit}
                </span>
                {canManage ? (
                  <div className="card-head-actions">
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() =>
                        setDraft({
                          id: chart.id,
                          name: chart.name,
                          unit: chart.unit as 'cm' | 'in',
                          note: chart.note ?? '',
                          columns: chart.columns,
                          rows: chart.rows.map((row) => ({
                            size: row.size,
                            values: row.values,
                          })),
                        })
                      }
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-danger"
                      onClick={() => setDeleting(chart)}
                    >
                      Delete
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Size</th>
                      {chart.columns.map((column) => (
                        <th key={column.code} className="num">
                          {column.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {chart.rows.map((row) => (
                      <tr key={row.size}>
                        <td>
                          <strong>{row.size.toUpperCase()}</strong>
                        </td>
                        {chart.columns.map((column) => (
                          <td key={column.code} className="num">
                            {row.values[column.code] ?? '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {chart.note ? (
                <div className="card-body">
                  <p className="muted">{chart.note}</p>
                </div>
              ) : null}
            </section>
          ))
        ) : (
          <div className="card">
            <Empty title="No size charts yet">
              <span>Create one and assign it to products in the editor.</span>
            </Empty>
          </div>
        )}
      </div>

      {draft ? (
        <Dialog
          title={draft.id ? 'Edit size chart' : 'New size chart'}
          onClose={() => setDraft(null)}
          wide
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
            <Field label="Unit">
              <select
                className="select"
                value={draft.unit}
                onChange={(event) =>
                  setDraft({ ...draft, unit: event.target.value as 'cm' | 'in' })
                }
              >
                <option value="cm">Centimetres</option>
                <option value="in">Inches</option>
              </select>
            </Field>
          </div>

          <Field
            label="Measurement columns"
            hint="Comma separated. A trouser chart needs waist and inseam, not chest — which is why these are data."
          >
            <input
              className="input"
              value={draft.columns.map((column) => column.label).join(', ')}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  columns: event.target.value
                    .split(',')
                    .map((label) => label.trim())
                    .filter(Boolean)
                    .map((label) => ({
                      code: label.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
                      label,
                    })),
                })
              }
            />
          </Field>

          <Field label="Sizes in this chart">
            <div className="size-toggles">
              {SIZES.map((size) => {
                const isOn = draft.rows.some((row) => row.size === size);
                return (
                  <button
                    key={size}
                    type="button"
                    className={`size-toggle${isOn ? ' is-on' : ''}`}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        rows: isOn
                          ? draft.rows.filter((row) => row.size !== size)
                          : [...draft.rows, { size, values: {} }].sort(
                              (left, right) =>
                                SIZES.indexOf(left.size as never) -
                                SIZES.indexOf(right.size as never),
                            ),
                      })
                    }
                  >
                    {size.toUpperCase()}
                  </button>
                );
              })}
            </div>
          </Field>

          <div className="table-wrap">
            <table className="variant-grid">
              <thead>
                <tr>
                  <th>Size</th>
                  {draft.columns.map((column) => (
                    <th key={column.code} className="num">
                      {column.label} ({draft.unit})
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {draft.rows.map((row, rowIndex) => (
                  <tr key={row.size}>
                    <td>
                      <strong>{row.size.toUpperCase()}</strong>
                    </td>
                    {draft.columns.map((column) => (
                      <td key={column.code} className="num">
                        <input
                          type="number"
                          className="input"
                          value={row.values[column.code] ?? ''}
                          min="0"
                          step="0.5"
                          onChange={(event) =>
                            setCell(rowIndex, column.code, event.target.value)
                          }
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Field label="Note" hint="Shown under the table in the shop's size guide.">
            <input
              className="input"
              value={draft.note}
              onChange={(event) => setDraft({ ...draft, note: event.target.value })}
            />
          </Field>
        </Dialog>
      ) : null}

      {deleting ? (
        <ConfirmDialog
          title={`Delete "${deleting.name}"?`}
          busy={remove.isPending}
          onClose={() => setDeleting(null)}
          onConfirm={() => remove.mutate(deleting.id)}
          message="This is refused while any product still uses the chart."
        />
      ) : null}
    </>
  );
};
