import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { OrderView, PaymentStatus } from '@shop/shared';

import { DataTable, type Column } from '../components/DataTable';
import { Badge, Dialog, Empty, Field, Loading, Pager } from '../components/ui';
import { api, query } from '../lib/api';
import { formatDate, formatMoney } from '../lib/format';
import { usePaging } from '../lib/paging';
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

/** `bank_transfer` is a column name, not something a shopkeeper says. */
const METHOD_LABELS: Partial<Record<string, string>> = {
  upi: 'UPI',
  bank_transfer: 'Bank transfer',
  card: 'Card',
  netbanking: 'Net banking',
  cod: 'Cash on delivery',
};

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

/**
 * A payment row.
 *
 * The reference the shopper quoted is a required column, not an optional one:
 * it is the entire reason somebody opens this screen, and a queue that hides it
 * makes you open every row to find the one you are looking at on a statement.
 */
const PAYMENT_COLUMNS = (onOpen: (order: OrderView) => void): Column<OrderView>[] => [
  {
    key: 'reference',
    header: 'Order',
    required: true,
    render: (order) => <span className="mono">{order.reference}</span>,
  },
  {
    key: 'claimed',
    header: 'Said they paid',
    render: (order) => (
      <span className="nowrap">
        {order.payment.claimedAt ? formatDate(order.payment.claimedAt) : '—'}
      </span>
    ),
  },
  {
    key: 'shopper',
    header: 'Shopper says',
    required: true,
    render: (order) => <span className="mono">{order.payment.reference ?? '—'}</span>,
  },
  {
    key: 'method',
    header: 'Method',
    optional: true,
    render: (order) => (
      <span className="muted">
        {METHOD_LABELS[order.paymentMethod] ?? order.paymentMethod}
      </span>
    ),
  },
  {
    key: 'buyer',
    header: 'Buyer',
    optional: true,
    render: (order) => order.shippingAddress.fullName,
  },
  {
    key: 'attempts',
    header: 'Tries',
    numeric: true,
    optional: true,
    render: (order) => order.payment.claimCount || '—',
  },
  {
    key: 'status',
    header: 'Payment',
    render: (order) => <Badge value={order.paymentStatus} />,
  },
  {
    key: 'amount',
    header: 'Amount',
    numeric: true,
    required: true,
    render: (order) => formatMoney(order.totals.grandTotal),
  },
  {
    key: 'open',
    header: '',
    tight: true,
    required: true,
    render: (order) => (
      <button type="button" className="btn btn-sm" onClick={() => onOpen(order)}>
        Open
      </button>
    ),
  },
];

export const PaymentsPage = () => {
  const { can } = useSession();
  const { notify } = useToast();
  const queryClient = useQueryClient();

  const { page, pageSize, setPage, setPageSize, reset } = usePaging(25);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<PaymentStatus>('verifying');
  const [open, setOpen] = useState<OrderView | null>(null);
  const [reason, setReason] = useState('');

  const canVerify = can('payment.verify');

  const { data, isLoading } = useQuery({
    queryKey: ['payments', page, pageSize, search, tab],
    queryFn: () =>
      api<PaymentsPage>(
        `/payments${query({ page, pageSize, search, paymentStatus: tab })}`,
      ),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['payments'] });
    void queryClient.invalidateQueries({ queryKey: ['orders'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  const verify = useMutation({
    mutationFn: (id: string) =>
      api<OrderView>(`/payments/${id}/verify`, { method: 'POST' }),
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
              reset();
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
                reset();
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
              <DataTable
                rows={data.items}
                rowKey={(order) => order.id}
                storageKey="threadline.admin.columns.payments"
                onRowClick={(order) => {
                  setOpen(order);
                  setReason('');
                }}
                columns={PAYMENT_COLUMNS((order) => {
                  setOpen(order);
                  setReason('');
                })}
              />
              <Pager
                page={data.page}
                pageCount={data.pageCount}
                total={data.total}
                pageSize={pageSize}
                onChange={setPage}
                onPageSize={setPageSize}
                noun="payment"
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
          <div className="pay-review">
            {/*
              The amount leads, because it is the only figure being checked
              against a bank statement — everything else on this screen exists to
              identify WHICH line on that statement.
            */}
            <div className="pay-review-amount">
              <span className="pay-review-label">Amount to look for</span>
              <strong>{formatMoney(open.totals.grandTotal)}</strong>
              <Badge value={open.paymentStatus} />
            </div>

            <dl className="pay-review-facts">
              <div>
                <dt>Reference the shopper gave</dt>
                <dd>
                  <code className="pay-review-utr">{open.payment.reference ?? '—'}</code>
                  {open.payment.reference ? (
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => {
                        void navigator.clipboard
                          ?.writeText(open.payment.reference ?? '')
                          .then(() => notify('Reference copied'));
                      }}
                    >
                      Copy
                    </button>
                  ) : null}
                </dd>
              </div>

              <div>
                <dt>How they paid</dt>
                <dd>
                  {METHOD_LABELS[open.paymentMethod] ?? open.paymentMethod}
                  <span className="muted"> · confirmed by hand</span>
                </dd>
              </div>

              <div>
                <dt>Said they paid</dt>
                <dd>
                  {open.payment.claimedAt ? formatDate(open.payment.claimedAt) : '—'}
                  {open.payment.claimCount > 1 ? (
                    <span className="muted"> · attempt {open.payment.claimCount}</span>
                  ) : null}
                </dd>
              </div>

              <div>
                <dt>Ordered by</dt>
                <dd>{open.shippingAddress.fullName}</dd>
              </div>
            </dl>

            {open.payment.verifiedAt ? (
              <p className="notice is-success">
                Confirmed {formatDate(open.payment.verifiedAt)}
                {open.payment.verifiedBy ? ` by ${open.payment.verifiedBy}` : ''}.
              </p>
            ) : null}

            {open.payment.rejectionReason ? (
              <p className="notice is-warn">
                Last sent back: {open.payment.rejectionReason}
              </p>
            ) : null}

            {canVerify && open.paymentStatus === 'verifying' ? (
              <>
                {/*
                  Said immediately above the button, not in a paragraph further
                  up: this is the one action in the panel that cannot be undone
                  by editing a field back, and the warning has to be where the
                  finger is going.
                */}
                <div className="pay-review-act">
                  <p className="pay-review-check">
                    Find <strong>{formatMoney(open.totals.grandTotal)}</strong> against
                    this reference on your statement before confirming. Marking it paid
                    ships the goods and books the revenue.
                  </p>
                  <button
                    type="button"
                    className="btn btn-primary btn-lg"
                    disabled={busy}
                    onClick={() => verify.mutate(open.id)}
                  >
                    {verify.isPending ? 'Confirming…' : 'The money is there'}
                  </button>
                </div>

                <details className="pay-review-reject">
                  {/*
                    Folded, because rejecting is the rarer answer and an open
                    text box beside the primary button invites the wrong one.
                  */}
                  <summary>The money has not arrived</summary>
                  <Field
                    label="What should the shopper do?"
                    hint="They read this on their order page, so it has to be something they can act on."
                  >
                    <input
                      className="input"
                      placeholder="e.g. Nothing matching that reference reached our account."
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                    />
                  </Field>
                  <button
                    type="button"
                    className="btn btn-danger"
                    disabled={busy || reason.trim().length < 4}
                    onClick={() => reject.mutate({ id: open.id, reason: reason.trim() })}
                  >
                    {reject.isPending ? 'Sending…' : 'Send it back'}
                  </button>
                </details>
              </>
            ) : null}

            {!canVerify && open.paymentStatus === 'verifying' ? (
              <p className="notice is-warn">
                You can read this but not confirm it — that needs the{' '}
                <code>payment.verify</code> permission.
              </p>
            ) : null}
          </div>
        </Dialog>
      ) : null}
    </>
  );
};
