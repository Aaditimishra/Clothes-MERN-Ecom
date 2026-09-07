import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

/* ------------------------------- primitives ------------------------------ */

export const Field = ({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) => (
  <label className="field">
    <span className="field-label">{label}</span>
    {children}
    {error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
  </label>
);

export const Badge = ({ value }: { value: string }) => (
  <span className={`badge badge-${value}`}>{value}</span>
);

export const Swatch = ({ colour }: { colour: string | null }) => (
  <span className="swatch-dot" style={{ background: colour ?? 'transparent' }} aria-hidden="true" />
);

export const Empty = ({ title, children }: { title: string; children?: ReactNode }) => (
  <div className="empty">
    <strong>{title}</strong>
    {children}
  </div>
);

export const Loading = ({ rows = 5 }: { rows?: number }) => (
  <div className="card-body">
    {Array.from({ length: rows }, (_, index) => (
      <div key={index} className="skeleton" style={{ height: 38 }} />
    ))}
  </div>
);

/* --------------------------------- dialog -------------------------------- */

/**
 * Native `<dialog>` with `showModal()`.
 *
 * Focus trapping, Escape-to-close, an inert background and the top layer all come
 * for free — four things a div-based modal reliably gets wrong.
 */
export const Dialog = ({
  title,
  onClose,
  footer,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) => {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      className="dialog"
      ref={ref}
      onClose={onClose}
      style={wide ? { width: 'min(1080px, calc(100vw - 32px))' } : undefined}
    >
      <header className="dialog-head">
        <h2>{title}</h2>
        <button
          type="button"
          className="btn btn-icon"
          style={{ marginLeft: 'auto' }}
          onClick={() => ref.current?.close()}
          aria-label="Close"
        >
          ×
        </button>
      </header>
      <div className="dialog-body">{children}</div>
      {footer ? <footer className="dialog-foot">{footer}</footer> : null}
    </dialog>
  );
};

/* ------------------------------- pagination ------------------------------ */

export const Pager = ({
  page,
  pageCount,
  total,
  onChange,
}: {
  page: number;
  pageCount: number;
  total: number;
  onChange: (page: number) => void;
}) => {
  if (pageCount <= 1) {
    return (
      <div className="pager muted">
        {total} {total === 1 ? 'item' : 'items'}
      </div>
    );
  }

  return (
    <nav className="pager" aria-label="Pagination">
      <button
        type="button"
        className="btn btn-sm"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        Previous
      </button>
      <span className="muted">
        Page {page} of {pageCount} · {total} items
      </span>
      <button
        type="button"
        className="btn btn-sm"
        disabled={page >= pageCount}
        onClick={() => onChange(page + 1)}
      >
        Next
      </button>
    </nav>
  );
};

/**
 * A confirm step for anything destructive.
 *
 * `window.confirm` would be fewer lines and worse: it cannot say WHAT is being
 * deleted or what depends on it, which is the only information that makes the
 * decision safe.
 */
export const ConfirmDialog = ({
  title,
  message,
  confirmLabel = 'Delete',
  onConfirm,
  onClose,
  busy = false,
}: {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
  busy?: boolean;
}) => (
  <Dialog
    title={title}
    onClose={onClose}
    footer={
      <>
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn btn-danger" onClick={onConfirm} disabled={busy}>
          {busy ? 'Working…' : confirmLabel}
        </button>
      </>
    }
  >
    <div>{message}</div>
  </Dialog>
);
