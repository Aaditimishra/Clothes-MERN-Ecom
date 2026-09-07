import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { formatMoney, type PaymentMethodView, type SavedAddress } from '@shop/shared';

import { ApiRequestError, request } from '../../lib/api';
import { useAuth } from '../../store/auth';
import { useToast } from '../../store/toast';
import { AddressForm } from './AddressForm';
import {
  addPaymentMethod,
  deleteAddress,
  deletePaymentMethod,
  makePaymentDefault,
  saveAddress,
  useAccountMutation,
  useOrders,
} from './useAccount';

const TABS = [
  { id: 'orders', label: 'Orders' },
  { id: 'profile', label: 'Profile' },
  { id: 'addresses', label: 'Addresses' },
  { id: 'payments', label: 'Payments' },
  { id: 'security', label: 'Security' },
] as const;

type TabId = (typeof TABS)[number]['id'];

const STATUS_COPY: Record<string, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  packed: 'Packed',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  returned: 'Returned',
};

const formatDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—';

const cardLabel = (method: PaymentMethodView): string =>
  method.type === 'upi'
    ? (method.upiId ?? 'UPI')
    : `•••• ${method.last4 ?? '····'}`;

export const AccountPage = () => {
  const { customer, isReady, signOut } = useAuth();
  const [params, setParams] = useSearchParams();

  // The tab lives in the URL so a shopper can bookmark "my orders" and land back
  // there, and so the browser's back button steps between tabs as they expect.
  const tab = (params.get('tab') as TabId | null) ?? 'orders';
  const setTab = (next: TabId) => setParams(next === 'orders' ? {} : { tab: next });

  if (!isReady) {
    return (
      <div className="shell page">
        <div className="skeleton" style={{ height: 260 }} />
      </div>
    );
  }

  if (!customer) return <Navigate to="/sign-in" state={{ from: '/account' }} replace />;

  return (
    <div className="shell page account">
      <header className="account-head">
        <div>
          <p className="eyebrow">Your account</p>
          <h1 className="section-title">Hi, {customer.firstName}</h1>
          <p className="muted">
            {customer.email} · member since {formatDate(customer.createdAt)}
          </p>
        </div>
        <div className="row">
          <Link to="/wishlist" className="btn btn-outline">
            Wishlist
          </Link>
          <button type="button" className="btn btn-ghost" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>

      <nav className="account-tabs" aria-label="Account sections">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={`account-tab${tab === entry.id ? ' is-active' : ''}`}
            aria-current={tab === entry.id ? 'page' : undefined}
            onClick={() => setTab(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </nav>

      {tab === 'orders' ? <OrdersTab /> : null}
      {tab === 'profile' ? <ProfileTab /> : null}
      {tab === 'addresses' ? <AddressesTab /> : null}
      {tab === 'payments' ? <PaymentsTab /> : null}
      {tab === 'security' ? <SecurityTab /> : null}
    </div>
  );
};

/* --------------------------------- orders -------------------------------- */

const OrdersTab = () => {
  const { data, isLoading } = useOrders();
  const [open, setOpen] = useState<string | null>(null);

  if (isLoading) return <div className="skeleton" style={{ height: 200 }} />;

  if (!data || data.length === 0) {
    return (
      <div className="empty-state">
        <h2>No orders yet</h2>
        <p className="muted">When you buy something it will show up here.</p>
        <Link to="/shop" className="btn btn-primary btn-lg">
          Start shopping
        </Link>
      </div>
    );
  }

  return (
    <ul className="order-list">
      {data.map((order) => {
        const isOpen = open === order.id;

        return (
          <li key={order.id}>
            <div className="order-head">
              <div>
                <strong>{order.reference}</strong>
                <span className="muted"> · {formatDate(order.placedAt)}</span>
              </div>
              <span className={`badge badge-status status-${order.status}`}>
                {STATUS_COPY[order.status] ?? order.status}
              </span>
            </div>

            <div className="order-thumbs">
              {order.lines.slice(0, 5).map((line) =>
                line.imageUrl ? (
                  <img
                    key={line.variantId}
                    src={line.imageUrl}
                    alt=""
                    width={48}
                    height={64}
                    loading="lazy"
                  />
                ) : null,
              )}
              {order.lines.length > 5 ? (
                <span className="muted">+{order.lines.length - 5}</span>
              ) : null}
            </div>

            <div className="order-foot">
              <span className="muted">
                {order.itemCount} item{order.itemCount === 1 ? '' : 's'}
                {order.trackingNumber ? ` · Tracking ${order.trackingNumber}` : ''}
              </span>
              <strong>{formatMoney(order.totals.grandTotal)}</strong>
              <button
                type="button"
                className="link-btn"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : order.id)}
              >
                {isOpen ? 'Hide details' : 'View details'}
              </button>
            </div>

            {isOpen ? (
              <div className="order-detail">
                <ul className="order-lines">
                  {order.lines.map((line) => (
                    <li key={line.variantId}>
                      {line.imageUrl ? (
                        <img src={line.imageUrl} alt="" width={54} height={72} loading="lazy" />
                      ) : null}
                      <div>
                        <Link to={`/product/${line.productSlug}`} className="order-line-name">
                          {line.name}
                        </Link>
                        <p className="muted">
                          {line.size.toUpperCase()} · {line.colourLabel} · Qty {line.quantity}
                        </p>
                        <p className="muted mono-sm">{line.sku}</p>
                      </div>
                      <strong>{formatMoney(line.lineTotal)}</strong>
                    </li>
                  ))}
                </ul>

                <div className="order-detail-grid">
                  <section>
                    <h3 className="account-subhead">Delivered to</h3>
                    <address>
                      {order.shippingAddress.fullName}
                      <br />
                      {order.shippingAddress.line1}
                      {order.shippingAddress.line2 ? (
                        <>
                          <br />
                          {order.shippingAddress.line2}
                        </>
                      ) : null}
                      <br />
                      {order.shippingAddress.city}, {order.shippingAddress.state}{' '}
                      {order.shippingAddress.postalCode}
                      <br />
                      {order.shippingAddress.phone}
                    </address>
                    {order.estimatedDelivery ? (
                      <p className="muted">
                        Estimated delivery {formatDate(order.estimatedDelivery)}
                      </p>
                    ) : null}
                  </section>

                  <section>
                    <h3 className="account-subhead">Payment</h3>
                    <p>
                      {order.paymentMethod.toUpperCase()} ·{' '}
                      <span
                        className={
                          order.paymentStatus === 'paid' ? 'text-success' : 'text-warn'
                        }
                      >
                        {order.paymentStatus === 'paid' ? 'Paid' : 'Due on delivery'}
                      </span>
                    </p>

                    <dl className="summary">
                      <div>
                        <dt>Bag total (MRP)</dt>
                        <dd>{formatMoney(order.totals.mrpTotal)}</dd>
                      </div>
                      {order.totals.savings.amount > 0 ? (
                        <div className="summary-saving">
                          <dt>Discount</dt>
                          <dd>−{formatMoney(order.totals.savings)}</dd>
                        </div>
                      ) : null}
                      {order.totals.couponDiscount.amount > 0 ? (
                        <div className="summary-saving">
                          <dt>Coupon{order.couponCode ? ` (${order.couponCode})` : ''}</dt>
                          <dd>−{formatMoney(order.totals.couponDiscount)}</dd>
                        </div>
                      ) : null}
                      <div>
                        <dt>Delivery</dt>
                        <dd>
                          {order.totals.shipping.amount === 0
                            ? 'Free'
                            : formatMoney(order.totals.shipping)}
                        </dd>
                      </div>
                      <div className="summary-total">
                        <dt>Total paid</dt>
                        <dd>{formatMoney(order.totals.grandTotal)}</dd>
                      </div>
                      <div className="summary-tax">
                        <dt>Includes GST</dt>
                        <dd>{formatMoney(order.totals.taxIncluded)}</dd>
                      </div>
                    </dl>
                  </section>
                </div>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
};

/* -------------------------------- profile -------------------------------- */

const ProfileTab = () => {
  const { customer } = useAuth();
  const [fields, setFields] = useState<Record<string, string>>({});

  const save = useAccountMutation(
    (body: Record<string, unknown>) =>
      request<typeof customer extends null ? never : NonNullable<typeof customer>>(
        '/account/profile',
        { method: 'PUT', body },
      ),
    'Profile updated',
  );

  if (!customer) return null;

  return (
    <section className="account-panel">
      <h2 className="account-subhead">Your details</h2>

      <form
        className="stack account-form"
        style={{ '--stack-gap': '16px' } as React.CSSProperties}
        onSubmit={(event) => {
          event.preventDefault();
          setFields({});
          const form = new FormData(event.currentTarget);

          save.mutate(
            {
              firstName: String(form.get('firstName') ?? ''),
              lastName: String(form.get('lastName') ?? ''),
              phone: String(form.get('phone') ?? ''),
              acceptsMarketing: form.get('acceptsMarketing') === 'on',
            },
            {
              onError: (error) => {
                if (error instanceof ApiRequestError) setFields(error.fields);
              },
            },
          );
        }}
      >
        <div className="grid-2">
          <label className="field">
            <span className="field-label">First name</span>
            <input
              name="firstName"
              className="input"
              defaultValue={customer.firstName}
              autoComplete="given-name"
              required
              aria-invalid={Boolean(fields.firstName)}
            />
            {fields.firstName ? <span className="field-error">{fields.firstName}</span> : null}
          </label>

          <label className="field">
            <span className="field-label">Last name</span>
            <input
              name="lastName"
              className="input"
              defaultValue={customer.lastName}
              autoComplete="family-name"
              required
              aria-invalid={Boolean(fields.lastName)}
            />
            {fields.lastName ? <span className="field-error">{fields.lastName}</span> : null}
          </label>
        </div>

        <label className="field">
          <span className="field-label">Mobile number</span>
          <input
            name="phone"
            className="input"
            defaultValue={customer.phone ?? ''}
            inputMode="numeric"
            autoComplete="tel-national"
            aria-invalid={Boolean(fields.phone)}
          />
          {fields.phone ? (
            <span className="field-error">{fields.phone}</span>
          ) : (
            <span className="muted field-hint">Used for delivery updates only.</span>
          )}
        </label>

        <label className="field">
          <span className="field-label">Email</span>
          {/* Read-only on purpose: the email identifies the account and is where
              receipts go. Changing it needs re-verification, which this shop
              does not have — so it is not offered rather than half-offered. */}
          <input className="input" value={customer.email} readOnly disabled />
          <span className="muted field-hint">
            Contact us to change the email on your account.
          </span>
        </label>

        <label className="switch-row">
          <input
            type="checkbox"
            name="acceptsMarketing"
            defaultChecked={customer.acceptsMarketing}
          />
          <span>Email me about new arrivals and sales</span>
        </label>

        <div>
          <button type="submit" className="btn btn-primary" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </section>
  );
};

/* ------------------------------- addresses ------------------------------- */

const AddressesTab = () => {
  const { customer } = useAuth();
  const [editing, setEditing] = useState<SavedAddress | 'new' | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const save = useAccountMutation(saveAddress, 'Address saved');
  const remove = useAccountMutation(deleteAddress, 'Address removed');

  if (!customer) return null;

  return (
    <section className="account-panel">
      <div className="spread">
        <h2 className="account-subhead">Saved addresses</h2>
        {editing === null ? (
          <button type="button" className="btn btn-outline" onClick={() => setEditing('new')}>
            Add address
          </button>
        ) : null}
      </div>

      {editing !== null ? (
        <div className="account-card">
          <AddressForm
            {...(editing !== 'new' ? { address: editing } : {})}
            busy={save.isPending}
            errors={fields}
            onCancel={() => {
              setEditing(null);
              setFields({});
            }}
            onSubmit={(address) =>
              save.mutate(address, {
                onSuccess: () => {
                  setEditing(null);
                  setFields({});
                },
                onError: (error) => {
                  if (error instanceof ApiRequestError) setFields(error.fields);
                },
              })
            }
          />
        </div>
      ) : null}

      {customer.addresses.length === 0 && editing === null ? (
        <p className="muted">
          No saved addresses yet. One is saved automatically when you check out.
        </p>
      ) : (
        <ul className="address-list">
          {customer.addresses.map((address) => (
            <li key={address.id}>
              <div className="spread">
                <strong>{address.label}</strong>
                {address.isDefault ? <span className="badge">Default</span> : null}
              </div>
              <address>
                {address.fullName}
                <br />
                {address.line1}
                {address.line2 ? (
                  <>
                    <br />
                    {address.line2}
                  </>
                ) : null}
                <br />
                {address.city}, {address.state} {address.postalCode}
                <br />
                {address.phone}
              </address>
              <div className="row">
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => setEditing(address)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="link-btn"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(address.id)}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

/* -------------------------------- payments ------------------------------- */

const PaymentsTab = () => {
  const { customer, setCustomer } = useAuth();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState<'card' | 'upi' | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  // These endpoints return the method list rather than the whole customer, so
  // the cached customer is patched by hand instead of replaced wholesale.
  const applyMethods = (methods: PaymentMethodView[]) => {
    if (customer) setCustomer({ ...customer, paymentMethods: methods });
    void queryClient.invalidateQueries({ queryKey: ['bootstrap'] });
  };

  const add = useMutation({
    mutationFn: addPaymentMethod,
    onSuccess: (methods) => {
      applyMethods(methods);
      setAdding(null);
      setFields({});
      notify('Payment method saved');
    },
    onError: (error: unknown) => {
      if (error instanceof ApiRequestError) setFields(error.fields);
      notify(error instanceof Error ? error.message : 'Could not save', 'error');
    },
  });

  const remove = useMutation({
    mutationFn: deletePaymentMethod,
    onSuccess: (methods) => {
      applyMethods(methods);
      notify('Payment method removed');
    },
  });

  const makeDefault = useMutation({
    mutationFn: makePaymentDefault,
    onSuccess: (methods) => {
      applyMethods(methods);
      notify('Default updated');
    },
  });

  if (!customer) return null;

  return (
    <section className="account-panel">
      <div className="spread">
        <h2 className="account-subhead">Saved payment methods</h2>
        {adding === null ? (
          <div className="row">
            <button type="button" className="btn btn-outline" onClick={() => setAdding('card')}>
              Add card
            </button>
            <button type="button" className="btn btn-outline" onClick={() => setAdding('upi')}>
              Add UPI
            </button>
          </div>
        ) : null}
      </div>

      <p className="notice">
        We store only the card network, the last four digits and the expiry — never
        the full number and never the CVV.
      </p>

      {adding ? (
        <div className="account-card">
          <form
            className="stack account-form"
            style={{ '--stack-gap': '14px' } as React.CSSProperties}
            onSubmit={(event) => {
              event.preventDefault();
              setFields({});
              const form = new FormData(event.currentTarget);

              add.mutate(
                adding === 'card'
                  ? {
                      type: 'card',
                      cardNumber: String(form.get('cardNumber') ?? ''),
                      expiryMonth: Number(form.get('expiryMonth')),
                      expiryYear: Number(form.get('expiryYear')),
                      label: String(form.get('label') ?? ''),
                    }
                  : {
                      type: 'upi',
                      upiId: String(form.get('upiId') ?? ''),
                      label: String(form.get('label') ?? ''),
                    },
              );
            }}
          >
            {adding === 'card' ? (
              <>
                <label className="field">
                  <span className="field-label">Card number</span>
                  <input
                    name="cardNumber"
                    className="input"
                    inputMode="numeric"
                    autoComplete="cc-number"
                    placeholder="4242 4242 4242 4242"
                    required
                    aria-invalid={Boolean(fields.cardNumber)}
                  />
                  {fields.cardNumber ? (
                    <span className="field-error">{fields.cardNumber}</span>
                  ) : null}
                </label>

                <div className="grid-3">
                  <label className="field">
                    <span className="field-label">Expiry month</span>
                    <input
                      name="expiryMonth"
                      className="input"
                      type="number"
                      min={1}
                      max={12}
                      placeholder="MM"
                      required
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">Expiry year</span>
                    <input
                      name="expiryYear"
                      className="input"
                      type="number"
                      min={2024}
                      max={2100}
                      placeholder="YYYY"
                      required
                      aria-invalid={Boolean(fields.expiryYear)}
                    />
                    {fields.expiryYear ? (
                      <span className="field-error">{fields.expiryYear}</span>
                    ) : null}
                  </label>
                  <label className="field">
                    <span className="field-label">Label</span>
                    <input name="label" className="input" placeholder="Personal" maxLength={40} />
                  </label>
                </div>
              </>
            ) : (
              <div className="grid-2">
                <label className="field">
                  <span className="field-label">UPI id</span>
                  <input
                    name="upiId"
                    className="input"
                    placeholder="name@bank"
                    required
                    aria-invalid={Boolean(fields.upiId)}
                  />
                  {fields.upiId ? <span className="field-error">{fields.upiId}</span> : null}
                </label>
                <label className="field">
                  <span className="field-label">Label</span>
                  <input name="label" className="input" placeholder="UPI" maxLength={40} />
                </label>
              </div>
            )}

            <div className="row">
              <button type="submit" className="btn btn-primary" disabled={add.isPending}>
                {add.isPending ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setAdding(null);
                  setFields({});
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {customer.paymentMethods.length === 0 ? (
        <p className="muted">Nothing saved yet.</p>
      ) : (
        <ul className="payment-list">
          {customer.paymentMethods.map((method) => (
            <li key={method.id}>
              <span className={`pay-brand pay-${method.brand ?? 'card'}`}>
                {(method.brand ?? 'card').toUpperCase()}
              </span>
              <div>
                <strong>{cardLabel(method)}</strong>
                <p className="muted">
                  {method.label || (method.type === 'upi' ? 'UPI' : 'Card')}
                  {method.expiryMonth && method.expiryYear
                    ? ` · expires ${String(method.expiryMonth).padStart(2, '0')}/${method.expiryYear}`
                    : ''}
                </p>
              </div>
              {method.isDefault ? (
                <span className="badge">Default</span>
              ) : (
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => makeDefault.mutate(method.id)}
                >
                  Make default
                </button>
              )}
              <button
                type="button"
                className="link-btn"
                disabled={remove.isPending}
                onClick={() => remove.mutate(method.id)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

/* -------------------------------- security ------------------------------- */

const SecurityTab = () => {
  const { notify } = useToast();
  const [fields, setFields] = useState<Record<string, string>>({});

  const change = useMutation({
    mutationFn: (body: { currentPassword: string; newPassword: string }) =>
      request<void>('/account/password', { method: 'PUT', body }),
    onSuccess: () => {
      setFields({});
      notify('Password changed');
    },
    onError: (error: unknown) => {
      if (error instanceof ApiRequestError) setFields(error.fields);
      notify(error instanceof Error ? error.message : 'Could not change password', 'error');
    },
  });

  return (
    <section className="account-panel">
      <h2 className="account-subhead">Change password</h2>

      <form
        className="stack account-form"
        style={{ '--stack-gap': '16px', maxWidth: 420 } as React.CSSProperties}
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          change.mutate({
            currentPassword: String(form.get('currentPassword') ?? ''),
            newPassword: String(form.get('newPassword') ?? ''),
          });
          event.currentTarget.reset();
        }}
      >
        <label className="field">
          <span className="field-label">Current password</span>
          <input
            name="currentPassword"
            type="password"
            className="input"
            autoComplete="current-password"
            required
            aria-invalid={Boolean(fields.currentPassword)}
          />
          {fields.currentPassword ? (
            <span className="field-error">{fields.currentPassword}</span>
          ) : null}
        </label>

        <label className="field">
          <span className="field-label">New password</span>
          <input
            name="newPassword"
            type="password"
            className="input"
            autoComplete="new-password"
            required
            aria-invalid={Boolean(fields.newPassword)}
          />
          {fields.newPassword ? (
            <span className="field-error">{fields.newPassword}</span>
          ) : (
            <span className="muted field-hint">At least 12 characters.</span>
          )}
        </label>

        <div>
          <button type="submit" className="btn btn-primary" disabled={change.isPending}>
            {change.isPending ? 'Changing…' : 'Change password'}
          </button>
        </div>
      </form>
    </section>
  );
};
