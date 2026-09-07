import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import {
  formatMoney,
  type GatewayCheckoutHandoff,
  type ManualPaymentInstructions,
  type OrderView,
} from '@shop/shared';

import { ApiRequestError, request } from '../../lib/api';

/**
 * Everything that happens between placing an order and having paid for it.
 *
 * Kept out of the confirmation page because there is genuinely a lot of it: a
 * shop without a gateway has to show its own bank details, take a reference
 * back, and explain a waiting state that does not exist when a card is charged
 * on the spot.
 */

const useDeadline = (expiresAt: string | null): string | null => {
  const [left, setLeft] = useState<string | null>(null);

  useEffect(() => {
    if (!expiresAt) {
      setLeft(null);
      return;
    }

    const tick = () => {
      const ms = new Date(expiresAt).getTime() - Date.now();
      if (ms <= 0) {
        setLeft('expired');
        return;
      }
      const hours = Math.floor(ms / 3_600_000);
      const minutes = Math.floor((ms % 3_600_000) / 60_000);
      setLeft(hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`);
    };

    tick();
    // A minute is precise enough for a deadline measured in hours, and avoids
    // re-rendering the page once a second for a number nobody is watching.
    const timer = setInterval(tick, 60_000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  return left;
};

/* ------------------------------- manual ---------------------------------- */

const CopyField = ({ label, value }: { label: string; value: string }) => {
  const [copied, setCopied] = useState(false);

  return (
    <div className="pay-field">
      <span className="muted">{label}</span>
      <div className="pay-field-value">
        <code>{value}</code>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => {
            void navigator.clipboard?.writeText(value).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            });
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
};

const ManualPayment = ({
  order,
  instructions,
  onClaimed,
}: {
  order: OrderView;
  instructions: ManualPaymentInstructions;
  onClaimed: (order: OrderView) => void;
}) => {
  const [reference, setReference] = useState('');
  const [error, setError] = useState<string | null>(null);
  const left = useDeadline(instructions.expiresAt);

  const { mutate, isPending } = useMutation({
    mutationFn: () =>
      request<OrderView>(`/orders/${order.reference}/payment/claim`, {
        method: 'POST',
        body: { reference },
      }),
    onSuccess: onClaimed,
    onError: (err: unknown) => {
      setError(
        err instanceof ApiRequestError
          ? (err.fields.reference ?? err.message)
          : 'Could not submit that reference. Please try again.',
      );
    },
  });

  return (
    <div className="pay-panel">
      <h2 className="cart-aside-title">Pay {formatMoney(instructions.amount)}</h2>

      {order.payment.rejectionReason ? (
        <p className="field-error">
          {order.payment.rejectionReason} Please check the reference and send it again.
        </p>
      ) : null}

      {left && left !== 'expired' ? (
        <p className="muted">
          We are holding your items for <strong>{left}</strong>.
        </p>
      ) : null}

      {instructions.upi ? (
        <section className="pay-block">
          <h3>UPI</h3>
          {/*
            The link carries the amount and the order number already, so there
            is nothing to type. A shopper who retypes ₹2,499 into their own app
            types ₹2,490 often enough that the shop spends its evenings matching
            short payments to orders.
          */}
          <a href={instructions.upi.link} className="btn btn-primary btn-block">
            Pay with a UPI app
          </a>
          <p className="muted pay-scan">or scan this with your phone</p>
          <img
            src={instructions.upi.qr}
            alt={`UPI QR code to pay ${formatMoney(instructions.amount)}`}
            width={200}
            height={200}
            className="pay-qr"
          />
          <CopyField label="UPI ID" value={instructions.upi.id} />
        </section>
      ) : null}

      {instructions.bank ? (
        <section className="pay-block">
          <h3>Bank transfer</h3>
          <CopyField label="Account name" value={instructions.bank.accountName} />
          <CopyField label="Account number" value={instructions.bank.accountNumber} />
          <CopyField label="IFSC" value={instructions.bank.ifsc} />
          {instructions.bank.bankName ? (
            <p className="muted">{instructions.bank.bankName}</p>
          ) : null}
        </section>
      ) : null}

      <CopyField label="Put this in the payment note" value={instructions.reference} />

      <form
        className="pay-claim"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          mutate();
        }}
      >
        <h3>Already paid?</h3>
        <label className="field">
          <span>Reference / UTR number</span>
          <input
            className="input"
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            placeholder="From your banking app"
            required
            aria-invalid={Boolean(error)}
          />
        </label>
        {error ? <span className="field-error">{error}</span> : null}
        <button type="submit" className="btn btn-primary btn-block" disabled={isPending}>
          {isPending ? 'Sending…' : 'I have paid'}
        </button>
        <p className="muted">
          We check every transfer against our bank statement before confirming your order.
        </p>
      </form>
    </div>
  );
};

/* ------------------------------- gateway --------------------------------- */

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

/**
 * Loads Razorpay's checkout script on demand.
 *
 * Not in `index.html`: a shop taking bank transfers would otherwise fetch a
 * third-party script on every page load for a gateway it does not use, and hand
 * that third party a record of every visit.
 */
const loadRazorpay = (): Promise<void> =>
  new Promise((resolve, reject) => {
    if (window.Razorpay) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load the payment window'));
    document.head.appendChild(script);
  });

const GatewayPayment = ({
  order,
  handoff,
  onPaid,
}: {
  order: OrderView;
  handoff: GatewayCheckoutHandoff;
  onPaid: (order: OrderView) => void;
}) => {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const left = useDeadline(order.payment.expiresAt);

  const verify = async (response: Record<string, string>) => {
    const updated = await request<OrderView>(
      `/orders/${order.reference}/payment/gateway/verify`,
      {
        method: 'POST',
        body: {
          razorpayOrderId: response.razorpay_order_id,
          razorpayPaymentId: response.razorpay_payment_id,
          razorpaySignature: response.razorpay_signature,
        },
      },
    );
    onPaid(updated);
  };

  const open = async () => {
    setError(null);
    setBusy(true);
    try {
      await loadRazorpay();
      if (!window.Razorpay) throw new Error('Could not load the payment window');

      new window.Razorpay({
        key: handoff.keyId,
        order_id: handoff.gatewayOrderId,
        amount: handoff.amount.amount,
        currency: handoff.amount.currency,
        name: handoff.storeName,
        description: `Order ${handoff.orderReference}`,
        prefill: { email: handoff.email, contact: handoff.phone },
        handler: (response: Record<string, string>) => {
          void verify(response).catch(() => {
            /*
             * The money may well have been taken.
             *
             * Never tell someone their payment failed when only our
             * confirmation of it did — the webhook will settle this order
             * regardless, and a shopper told "failed" pays a second time.
             */
            setError(
              'We could not confirm the payment straight away. If money has left your ' +
                'account, the order will update shortly — please do not pay again.',
            );
          });
        },
        modal: { ondismiss: () => setBusy(false) },
      }).open();
    } catch {
      setError('Could not open the payment window. Please try again.');
      setBusy(false);
    }
  };

  return (
    <div className="pay-panel">
      <h2 className="cart-aside-title">Pay {formatMoney(handoff.amount)}</h2>
      {left && left !== 'expired' ? (
        <p className="muted">
          We are holding your items for <strong>{left}</strong>.
        </p>
      ) : null}
      {error ? <p className="field-error">{error}</p> : null}
      <button
        type="button"
        className="btn btn-primary btn-block"
        onClick={() => void open()}
        disabled={busy}
      >
        {busy ? 'Opening…' : 'Pay now'}
      </button>
    </div>
  );
};

/* ------------------------------ the panel -------------------------------- */

export const PaymentPanel = ({
  order,
  handoff,
}: {
  order: OrderView;
  handoff: { manual: ManualPaymentInstructions | null; gateway: GatewayCheckoutHandoff | null };
}) => {
  const queryClient = useQueryClient();
  const replace = (updated: OrderView) =>
    queryClient.setQueryData(['order', updated.reference], updated);

  const awaiting = order.paymentStatus === 'awaiting_payment';
  const pollRef = useRef(order.paymentStatus);
  pollRef.current = order.paymentStatus;

  /**
   * Polls while a gateway payment is outstanding.
   *
   * The webhook can settle the order before the browser gets back from the
   * gateway — or instead of it, if the shopper closed the tab. Without this
   * they sit looking at "awaiting payment" for an order that is paid, and
   * telephone the shop about it.
   */
  const gatewayPending = awaiting && order.payment.provider === 'razorpay';
  useQuery({
    queryKey: ['order-payment-status', order.reference],
    queryFn: async () => {
      const status = await request<{ paymentStatus: string }>(
        `/orders/${order.reference}/payment/status`,
      );
      if (status.paymentStatus !== pollRef.current) {
        await queryClient.invalidateQueries({ queryKey: ['order', order.reference] });
      }
      return status;
    },
    enabled: gatewayPending,
    refetchInterval: 5000,
  });

  /**
   * Instructions are re-fetched when the page was reloaded rather than reached
   * from checkout. A shopper who opens the order from their email on a
   * different device must still be told where to send the money.
   */
  const needsInstructions = awaiting && order.payment.provider === 'manual' && !handoff.manual;
  const { data: fetched } = useQuery({
    queryKey: ['order-payment', order.reference],
    queryFn: () =>
      request<{ manual: ManualPaymentInstructions | null }>(
        `/orders/${order.reference}/payment`,
      ),
    enabled: needsInstructions,
  });

  if (order.paymentStatus === 'paid') {
    return (
      <p className="muted confirmation-payment">
        {order.paymentMethod.toUpperCase()} · Paid
        {order.payment.verifiedAt
          ? ` on ${new Date(order.payment.verifiedAt).toLocaleDateString('en-IN')}`
          : ''}
      </p>
    );
  }

  if (order.paymentStatus === 'pending') {
    return (
      <p className="muted confirmation-payment">
        {order.paymentMethod.toUpperCase()} · Due on delivery
      </p>
    );
  }

  if (order.paymentStatus === 'verifying') {
    return (
      <div className="pay-panel">
        <h2 className="cart-aside-title">Checking your payment</h2>
        <p className="muted">
          Thank you — we have your reference{' '}
          {order.payment.reference ? <code>{order.payment.reference}</code> : null} and are
          matching it against our bank statement. Your order is confirmed as soon as we do,
          and you will get an email either way.
        </p>
      </div>
    );
  }

  if (order.paymentStatus === 'failed') {
    return (
      <div className="pay-panel">
        <h2 className="cart-aside-title">This order expired</h2>
        <p className="muted">
          {order.payment.rejectionReason ??
            'No payment was received in time, so the items went back on sale.'}
        </p>
      </div>
    );
  }

  const manual = handoff.manual ?? fetched?.manual ?? null;
  if (manual) return <ManualPayment order={order} instructions={manual} onClaimed={replace} />;
  if (handoff.gateway) {
    return <GatewayPayment order={order} handoff={handoff.gateway} onPaid={replace} />;
  }

  return (
    <p className="muted confirmation-payment">
      {order.paymentMethod.toUpperCase()} · Awaiting payment
    </p>
  );
};
