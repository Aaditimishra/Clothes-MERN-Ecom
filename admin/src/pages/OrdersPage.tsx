import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ORDER_STATUSES, PAYMENT_STATUSES, type OrderView } from '@shop/shared';

import { Badge, Dialog, Empty, Field, Loading, Pager } from '../components/ui';
import { api, downloadCsv, query } from '../lib/api';
import { formatDate, formatMoney } from '../lib/format';
import { useSession } from '../lib/session';
import { useToast } from '../lib/toast';
import type { Paged } from '../lib/types';

export const OrdersPage = () => {
  const { can } = useSession();
  const { notify } = useToast();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState<OrderView | null>(null);
  const [tracking, setTracking] = useState('');

  const canManage = can('order.manage');

  const { data, isLoading } = useQuery({
    queryKey: ['orders', page, search, status],
    queryFn: () => api<Paged<OrderView>>(`/orders${query({ page, pageSize: 25, search, status })}`),
  });

  const update = useMutation({
    mutationFn: (input: { id: string; patch: Record<string, unknown> }) =>
      api<OrderView>(`/orders/${input.id}`, { method: 'PATCH', body: input.patch }),
    onSuccess: (order) => {
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setOpen(order);
      setTracking(order.trackingNumber ?? '');
      notify('Order updated');
    },
    onError: (error: unknown) =>
      notify(error instanceof Error ? error.message : 'Could not update', 'error'),
  });

  const isTrackingDirty = open !== null && tracking.trim() !== (open.trackingNumber ?? '');

  const saveTracking = () => {
    if (!open || !isTrackingDirty) return;
    update.mutate({ id: open.id, patch: { trackingNumber: tracking.trim() || null } });
  };

  return (
    <>
      <header className="topbar">
        <h1>Orders</h1>
        <div className="topbar-actions">
          <input
            className="input"
            style={{ width: 220 }}
            placeholder="Reference or email…"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
          {can('data.export') ? (
          <button
            type="button"
            className="btn"
            onClick={() => void downloadCsv('/export/orders', 'threadline-orders')}
          >
            Export CSV
          </button>
          ) : null}
          <select
            className="select"
            style={{ width: 140 }}
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            {ORDER_STATUSES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
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
                      <th>Reference</th>
                      <th>Placed</th>
                      <th>Items</th>
                      <th>Status</th>
                      <th>Payment</th>
                      <th className="num">Total</th>
                      <th className="tight" />
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((order) => (
                      <tr key={order.id}>
                        <td className="mono">{order.reference}</td>
                        <td>{formatDate(order.placedAt)}</td>
                        <td>{order.itemCount}</td>
                        <td>
                          <Badge value={order.status} />
                        </td>
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
                              setTracking(order.trackingNumber ?? '');
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
            <Empty title="No orders found" />
          )}
        </section>
      </div>

      {open ? (
        <Dialog
          title={`Order ${open.reference}`}
          onClose={() => {
            setOpen(null);
            setTracking('');
          }}
          wide
        >
          <div className="grid-3">
            <Field label="Status">
              <select
                className="select"
                value={open.status}
                disabled={!canManage || update.isPending}
                onChange={(event) =>
                  update.mutate({ id: open.id, patch: { status: event.target.value } })
                }
              >
                {ORDER_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Payment">
              <select
                className="select"
                value={open.paymentStatus}
                disabled={!canManage || update.isPending}
                onChange={(event) =>
                  update.mutate({ id: open.id, patch: { paymentStatus: event.target.value } })
                }
              >
                {PAYMENT_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </Field>

            {/*
              An explicit Save, not save-on-blur.

              Blur inside a modal is a trap: type a tracking number, click the
              close button, and the dialog unmounts before the blur handler runs —
              the number is gone with nothing on screen to say so. A button is
              also the only version that works when the field is the last thing
              touched, which for a tracking number it almost always is.
            */}
            <Field label="Tracking number">
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <input
                  className="input mono"
                  value={tracking}
                  disabled={!canManage}
                  placeholder="Courier reference"
                  onChange={(event) => setTracking(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') saveTracking();
                  }}
                />
                <button
                  type="button"
                  className="btn"
                  disabled={!canManage || update.isPending || !isTrackingDirty}
                  onClick={saveTracking}
                >
                  {update.isPending ? 'Saving…' : isTrackingDirty ? 'Save' : 'Saved'}
                </button>
              </div>
            </Field>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Size</th>
                  <th>Colour</th>
                  <th className="num">Qty</th>
                  <th className="num">Line total</th>
                </tr>
              </thead>
              <tbody>
                {open.lines.map((line) => (
                  <tr key={line.variantId}>
                    <td className="cell-product">
                      <img className="row-thumb" src={line.imageUrl ?? ''} alt="" />
                      <span>
                        <strong>{line.name}</strong>
                        <span className="mono">{line.sku}</span>
                      </span>
                    </td>
                    <td>{line.size.toUpperCase()}</td>
                    <td>{line.colourLabel}</td>
                    <td className="num">{line.quantity}</td>
                    <td className="num">{formatMoney(line.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid-2">
            <div className="card">
              <div className="card-head">
                <h2>Delivering to</h2>
              </div>
              <div className="card-body">
                <address style={{ fontStyle: 'normal', lineHeight: 1.7 }}>
                  {open.shippingAddress.fullName}
                  <br />
                  {open.shippingAddress.line1}
                  {open.shippingAddress.line2 ? (
                    <>
                      <br />
                      {open.shippingAddress.line2}
                    </>
                  ) : null}
                  <br />
                  {open.shippingAddress.city}, {open.shippingAddress.state}{' '}
                  {open.shippingAddress.postalCode}
                  <br />
                  {open.shippingAddress.phone}
                </address>
              </div>
            </div>

            <div className="card">
              <div className="card-head">
                <h2>Totals</h2>
              </div>
              <div className="card-body" style={{ gap: 6 }}>
                {/*
                  Deductions carry a minus sign, as they do on the shopper's own
                  copy. An unsigned "₹2,600" in a totals column reads as
                  something being added, and the two views of one order should
                  not disagree about which way the money went.
                */}
                {(
                  [
                    ['MRP', open.totals.mrpTotal, false],
                    ['Discount on MRP', open.totals.savings, true],
                    ['Coupon', open.totals.couponDiscount, true],
                    ['Delivery', open.totals.shipping, false],
                    ['GST included', open.totals.taxIncluded, false],
                  ] as const
                ).map(([label, value, isDeduction]) => (
                  <div key={label} className="spread">
                    <span className="muted">{label}</span>
                    <span className={isDeduction && value.amount > 0 ? 'is-deduction' : undefined}>
                      {isDeduction && value.amount > 0 ? '−' : ''}
                      {formatMoney(value)}
                    </span>
                  </div>
                ))}
                <div className="spread" style={{ fontWeight: 700, fontSize: 15, paddingTop: 6 }}>
                  <span>Total paid</span>
                  <span>{formatMoney(open.totals.grandTotal)}</span>
                </div>
                {open.couponCode ? (
                  <p className="muted">
                    Coupon <strong className="mono">{open.couponCode}</strong>
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </Dialog>
      ) : null}
    </>
  );
};
