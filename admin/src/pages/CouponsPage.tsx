import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { ConfirmDialog, Dialog, Empty, Field, Loading, Pager } from '../components/ui';
import { AdminError, api, query } from '../lib/api';
import { formatDate, formatMoney, fromRupees, toRupees } from '../lib/format';
import { useToast } from '../lib/toast';
import type { AdminCoupon, Paged } from '../lib/types';
import { usePaging } from '../lib/paging';

interface Draft {
  id?: string;
  code: string;
  description: string;
  type: 'percentage' | 'fixed';
  percentage: string;
  amountOff: string;
  maxDiscount: string;
  minSpend: string;
  isActive: boolean;
  endsAt: string;
  usageLimit: string;
}

const EMPTY: Draft = {
  code: '',
  description: '',
  type: 'percentage',
  percentage: '10',
  amountOff: '',
  maxDiscount: '500',
  minSpend: '1499',
  isActive: true,
  endsAt: '',
  usageLimit: '',
};

export const CouponsPage = () => {
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const { page, pageSize, setPage, setPageSize } = usePaging(25);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [deleting, setDeleting] = useState<AdminCoupon | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['coupons', page, pageSize],
    queryFn: () => api<Paged<AdminCoupon>>(`/coupons${query({ page, pageSize })}`),
  });

  const done = (message: string) => {
    void queryClient.invalidateQueries({ queryKey: ['coupons'] });
    setDraft(null);
    setDeleting(null);
    setFields({});
    notify(message);
  };

  const save = useMutation({
    mutationFn: (input: Draft) => {
      const body = {
        code: input.code,
        description: input.description,
        type: input.type,
        percentage: input.type === 'percentage' ? Number(input.percentage) : null,
        amountOff: input.type === 'fixed' ? fromRupees(input.amountOff) : null,
        maxDiscount: input.maxDiscount ? fromRupees(input.maxDiscount) : null,
        minSpend: input.minSpend ? fromRupees(input.minSpend) : null,
        isActive: input.isActive,
        endsAt: input.endsAt || null,
        usageLimit: input.usageLimit ? Number(input.usageLimit) : null,
      };

      return input.id
        ? api(`/coupons/${input.id}`, { method: 'PUT', body })
        : api('/coupons', { method: 'POST', body });
    },
    onSuccess: () => done('Coupon saved'),
    onError: (error: unknown) => {
      if (error instanceof AdminError) setFields(error.fields);
      notify(error instanceof Error ? error.message : 'Could not save', 'error');
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api<void>(`/coupons/${id}`, { method: 'DELETE' }),
    onSuccess: () => done('Coupon deleted'),
  });

  return (
    <>
      <header className="topbar">
        <h1>Coupons</h1>
        <div className="topbar-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setDraft(EMPTY)}
          >
            New coupon
          </button>
        </div>
      </header>

      <div className="page">
        <section className="card">
          {isLoading ? (
            <Loading />
          ) : data && data.items.length > 0 ? (
            <>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Offer</th>
                      <th>Cap</th>
                      <th>Min spend</th>
                      <th className="num">Used</th>
                      <th>Ends</th>
                      <th>Status</th>
                      <th className="tight" />
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((coupon) => (
                      <tr key={coupon.id}>
                        <td className="mono">
                          <strong>{coupon.code}</strong>
                        </td>
                        <td>
                          {coupon.type === 'percentage'
                            ? `${coupon.percentage}% off`
                            : `${formatMoney(coupon.amountOff)} off`}
                          <div className="muted">{coupon.description}</div>
                        </td>
                        <td>
                          {coupon.maxDiscount ? formatMoney(coupon.maxDiscount) : '—'}
                        </td>
                        <td>{coupon.minSpend ? formatMoney(coupon.minSpend) : '—'}</td>
                        <td className="num">
                          {coupon.usageCount}
                          {coupon.usageLimit ? ` / ${coupon.usageLimit}` : ''}
                        </td>
                        <td className="muted">{formatDate(coupon.endsAt)}</td>
                        <td>
                          <span
                            className={`badge badge-${coupon.isActive ? 'active' : 'archived'}`}
                          >
                            {coupon.isActive ? 'active' : 'paused'}
                          </span>
                        </td>
                        <td className="tight">
                          <div className="row">
                            <button
                              type="button"
                              className="btn btn-sm"
                              onClick={() =>
                                setDraft({
                                  id: coupon.id,
                                  code: coupon.code,
                                  description: coupon.description,
                                  type: coupon.type,
                                  percentage: String(coupon.percentage ?? ''),
                                  amountOff: toRupees(coupon.amountOff),
                                  maxDiscount: toRupees(coupon.maxDiscount),
                                  minSpend: toRupees(coupon.minSpend),
                                  isActive: coupon.isActive,
                                  endsAt: coupon.endsAt ? coupon.endsAt.slice(0, 10) : '',
                                  usageLimit: String(coupon.usageLimit ?? ''),
                                })
                              }
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-danger"
                              onClick={() => setDeleting(coupon)}
                            >
                              Delete
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
                noun="coupon"
              />
            </>
          ) : (
            <Empty title="No coupons yet" />
          )}
        </section>
      </div>

      {draft ? (
        <Dialog
          title={draft.id ? `Edit ${draft.code}` : 'New coupon'}
          onClose={() => setDraft(null)}
          footer={
            <>
              <button type="button" className="btn" onClick={() => setDraft(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={save.isPending}
                onClick={() => save.mutate(draft)}
              >
                {save.isPending ? 'Saving…' : 'Save'}
              </button>
            </>
          }
        >
          <div className="grid-2">
            <Field label="Code" error={fields.code}>
              <input
                className="input mono"
                value={draft.code}
                autoFocus
                onChange={(event) =>
                  setDraft({ ...draft, code: event.target.value.toUpperCase() })
                }
              />
            </Field>
            <Field label="Type">
              <select
                className="select"
                value={draft.type}
                onChange={(event) =>
                  setDraft({ ...draft, type: event.target.value as Draft['type'] })
                }
              >
                <option value="percentage">Percentage off</option>
                <option value="fixed">Fixed amount off</option>
              </select>
            </Field>
          </div>

          <Field
            label="Description"
            hint="Shown in the bag when the code is applied."
            error={fields.description}
          >
            <input
              className="input"
              value={draft.description}
              onChange={(event) =>
                setDraft({ ...draft, description: event.target.value })
              }
            />
          </Field>

          <div className="grid-3">
            {draft.type === 'percentage' ? (
              <Field label="Percent off" error={fields.percentage}>
                <input
                  type="number"
                  className="input"
                  value={draft.percentage}
                  min="1"
                  max="100"
                  onChange={(event) =>
                    setDraft({ ...draft, percentage: event.target.value })
                  }
                />
              </Field>
            ) : (
              <Field label="Amount off (₹)" error={fields.amountOff}>
                <input
                  type="number"
                  className="input"
                  value={draft.amountOff}
                  min="1"
                  onChange={(event) =>
                    setDraft({ ...draft, amountOff: event.target.value })
                  }
                />
              </Field>
            )}

            <Field
              label="Max discount (₹)"
              hint="Caps a percentage coupon. Leave blank for no ceiling."
            >
              <input
                type="number"
                className="input"
                value={draft.maxDiscount}
                min="0"
                onChange={(event) =>
                  setDraft({ ...draft, maxDiscount: event.target.value })
                }
              />
            </Field>

            <Field label="Minimum spend (₹)">
              <input
                type="number"
                className="input"
                value={draft.minSpend}
                min="0"
                onChange={(event) => setDraft({ ...draft, minSpend: event.target.value })}
              />
            </Field>
          </div>

          <div className="grid-2">
            <Field label="Ends on" error={fields.endsAt}>
              <input
                type="date"
                className="input"
                value={draft.endsAt}
                onChange={(event) => setDraft({ ...draft, endsAt: event.target.value })}
              />
            </Field>
            <Field label="Usage limit" hint="Blank means unlimited.">
              <input
                type="number"
                className="input"
                value={draft.usageLimit}
                min="1"
                onChange={(event) =>
                  setDraft({ ...draft, usageLimit: event.target.value })
                }
              />
            </Field>
          </div>

          <label className="switch">
            <input
              type="checkbox"
              checked={draft.isActive}
              onChange={(event) => setDraft({ ...draft, isActive: event.target.checked })}
            />
            Active — shoppers can use this code
          </label>

          <p className="notice">
            A percentage coupon without a cap gives away 25% of a ₹40,000 bag. The cap is
            what makes these safe to run.
          </p>
        </Dialog>
      ) : null}

      {deleting ? (
        <ConfirmDialog
          title={`Delete ${deleting.code}?`}
          busy={remove.isPending}
          onClose={() => setDeleting(null)}
          onConfirm={() => remove.mutate(deleting.id)}
          message={
            <>
              It has been used <strong>{deleting.usageCount}</strong> time
              {deleting.usageCount === 1 ? '' : 's'}. Past orders keep the discount they
              were given; only future use is stopped.
            </>
          }
        />
      ) : null}
    </>
  );
};
