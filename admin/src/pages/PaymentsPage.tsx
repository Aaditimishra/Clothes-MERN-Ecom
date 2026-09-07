import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { OrderView, PaymentStatus } from '@shop/shared';

import { Badge, Dialog, Empty, Field, Loading, Pager } from '../components/ui';
import { api, query } from '../lib/api';
import { formatDate, formatMoney } from '../lib/format';
import { useSession } from '../lib/session';
import { useToast } from '../lib/toast';
import type { Paged } from '../lib/types';

/**
 * The queue of transfers waiting on somebody to look at a bank statement.
 *
 * Separate from Orders because it is a different job done by a different person
 * at a different time: Orders is "what do I pack today", this is "did the money
 * arrive". Mixing them buries the one screen where a shopper is blocked on
 * staff action inside the one screen that is always busy.
 */

type PaymentsPage = Paged<OrderView> & { counts: Partial<Record<PaymentStatus, number>> };

/** The tabs, in the order the work actually flows. */
const TABS: Array<{ value: PaymentStatus; label: string }> = [
  { value: 'verifying', label: 'To check' },
  { value: 'awaiting_payment', label: 'Awaiting payment' },
  { value: 'paid', label: 'Paid' },
  { value: 'failed', label: 'Expired' },
  { value: 'pending', label: 'Cash on delivery' },
  { value: 'refunded', label: 'Refunded' },
];

export const PaymentsPage = () => {
  const { can } = useSession();
  const { notify } = useToast();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<PaymentStatus>('verifying');
  const [open, setOpen] = useState<OrderView | null>(null);
  const [reason, setReason] = useState('');

  const canVerify = can('payment.verify');

  const { data, isLoading } = useQuery({
    queryKey: ['payments', page, search, tab],
    queryFn: () =>
      api<PaymentsPage>(
        `/payments${query({ page, pageSize: 25, search, paymentStatus: tab })}`,
      ),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['payments'] });
    void queryClient.invalidateQueries({ queryKey: ['orders'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  const verify = useMutation({
    mutationFn: (id: string) => api<OrderView>(`/payments/${id}/verify`, { method: 'POST' }),
    onSuccess: (order) => {
      refresh();
      setOpen(null);
      notify(`${order.reference} marked paid`);
    },
    onError: (error: unknown) =>
      notify(error instanceof Error ? error.message : 'Could not confirm', 'error'),
  });

  const reject = useMutation({
    mutationFn: (input: { id: string; reason: string }) =>
      api<OrderView>(`/payments/${input.id}/reject`, {
        method: 'POST',
        body: { reason: input.reason },
      }),
    onSuccess: (order) => {
      refresh();
      setOpen(null);
      setReason('');
      notify(`${order.reference} sent back to the shopper`);
    },
    onError: (error: unknown) =>
      notify(error instanceof Error ? error.message : 'Could not send back', 'error'),
  });

  const busy = verify.isPending || reject.isPending;

  return (
    <>
      <header className="topbar">
        <h1>Payments</h1>
        <div className="topbar-actions">
          <input
            className="input"
            style={{ width: 240 }}
            placeholder="Reference, email or UTR…"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </div>
      </header>

      <div className="page">
        {/*
          Counts come from one grouped aggregate rather than a query per tab, so
          the badges cannot disagree with each other or with the table below.
        */}
        <nav className="tabs">
          {TABS.map((entry) => (
            <button
              key={entry.value}
              type="button"
              className={`tab${tab === entry.value ? ' is-active' : ''}`}
              onClick={() => {
                setTab(entry.value);
                setPage(1);
              }}
            >
              {entry.label}
              {data?.counts[entry.value] ? (
                <span className="tab-count">{data.counts[entry.value]}</span>
              ) : null}
            </button>
          ))}
        </nav>

        <section className="card">
          {isLoading ? (
            <Loading />
          ) : data && data.items.length > 0 ? (
            <>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Reference</th>
                      <th>Placed</th>
                      <th>Method</th>
                      <th>Shopper says</th>
                      <th>Payment</th>
                      <th className="num">Amount</th>
                      <th className="tight" />
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((order) => (
                      <tr key={order.id}>
                        <td className="mono">{order.reference}</td>
                        <td>{formatDate(order.placedAt)}</td>
                        <td>{order.paymentMethod}</td>
                        <td className="mono">{order.payment.reference ?? '—'}</td>
                        <td>
                          <Badge value={order.paymentStatus} />
                        </td>
                        <td className="num">{formatMoney(order.totals.grandTotal)}</td>
                        <td className="tight">
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() => {
                              setOpen(order);
                              setReason('');
                            }}
                          >
                            Open
                          </button>
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
                onChange={setPage}
              />
            </>
          ) : (
            <Empty title="Nothing here">
              <p className="muted">
                {tab === 'verifying'
                  ? 'No transfers are waiting to be checked.'
                  : 'No orders in this state.'}
              </p>
            </Empty>
          )}
        </section>
      </div>

      {open ? (
        <Dialog title={`Payment · ${open.reference}`} onClose={() => setOpen(null)}>
          <div className="stack">
            <Field label="Amount">
              <strong>{formatMoney(open.totals.grandTotal)}</strong>
            </Field>
            <Field label="Method">
              {open.paymentMethod} · {open.payment.provider}
            </Field>
            <Field label="Reference the shopper gave">
              <span className="mono">{open.payment.reference ?? '—'}</span>
            </Field>
            <Field label="Claimed">
              {open.payment.claimedAt ? formatDate(open.payment.claimedAt) : '—'}
              {open.payment.claimCount > 1 ? ` · attempt ${open.payment.claimCount}` : ''}
            </Field>
            {open.payment.verifiedAt ? (
              <Field label="Confirmed">
                {formatDate(open.payment.verifiedAt)}
                {open.payment.verifiedBy ? ` by ${open.payment.verifiedBy}` : ''}
              </Field>
            ) : null}
            {open.payment.rejectionReason ? (
              <Field label="Last sent back">{open.payment.rejectionReason}</Field>
            ) : null}

            {canVerify && open.paymentStatus === 'verifying' ? (
              <>
                {/*
                  Said out loud, because the button below cannot be undone by
                  editing a field back: marking this paid ships the goods and
                  books the revenue.
                */}
                <p className="muted">
                  Check your bank statement for {formatMoney(open.totals.grandTotal)} against
                  this reference before confirming.
                </p>
                <div className="row-actions">
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busy}
                    onClick={() => verify.mutate(open.id)}
                  >
                    {verify.isPending ? 'Confirming…' : 'The money is there'}
                  </button>
                </div>

                <Field label="Or send it back">
                  <input
                    className="input"
                    placeholder="What was wrong? The shopper reads this."
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                  />
                </Field>
                <div className="row-actions">
                  <button
                    type="button"
                    className="btn btn-danger"
                    disabled={busy || reason.trim().length < 4}
                    onClick={() => reject.mutate({ id: open.id, reason: reason.trim() })}
                  >
                    {reject.isPending ? 'Sending…' : 'Not received'}
                  </button>
                </div>
              </>
            ) : null}

            {!canVerify && open.paymentStatus === 'verifying' ? (
              <p className="muted">
                You do not have the <code>payment.verify</code> permission, so you can read
                this but not confirm it.
              </p>
            ) : null}
          </div>
        </Dialog>
      ) : null}
    </>
  );
};
