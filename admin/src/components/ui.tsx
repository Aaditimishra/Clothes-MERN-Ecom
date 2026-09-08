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
      /*
       * A click on the backdrop closes it.
       *
       * The backdrop is not a child, so a click on it reports the <dialog>
       * itself as the target — that is how the two are told apart without an
       * extra overlay element to get the z-index wrong.
       */
      onClick={(event) => {
        if (event.target === ref.current) ref.current?.close();
      }}
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

/** What a merchant can ask for per page. Capped at the API's own limit. */
export const PAGE_SIZES = [10, 25, 50, 100] as const;

/**
 * Numbered pages, with a window around the current one.
 *
 * A shop with sixty pages cannot show sixty buttons, and "Previous / Next"
 * alone makes page forty a forty-click journey. First and last are always
 * reachable, the neighbours of where you are are always reachable, and the gap
 * between is an ellipsis rather than a lie about what is there.
 */
const pageWindow = (page: number, pageCount: number): Array<number | '…'> => {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1);

  const pages = new Set<number>([1, pageCount, page, page - 1, page + 1]);
  // Keep the row a constant width near the ends, so the buttons do not shuffle
  // sideways under the cursor as you page through.
  if (page <= 3) [2, 3, 4].forEach((n) => pages.add(n));
  if (page >= pageCount - 2) [pageCount - 1, pageCount - 2, pageCount - 3].forEach((n) => pages.add(n));

  const sorted = [...pages].filter((n) => n >= 1 && n <= pageCount).sort((a, b) => a - b);

  const out: Array<number | '…'> = [];
  let previous = 0;
  for (const value of sorted) {
    if (previous && value - previous > 1) out.push('…');
    out.push(value);
    previous = value;
  }
  return out;
};

export const Pager = ({
  page,
  pageCount,
  total,
  pageSize,
  onChange,
  onPageSize,
  noun = 'item',
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize?: number;
  onChange: (page: number) => void;
  onPageSize?: (size: number) => void;
  /** What is being counted, so the row reads "12 reviews" not "12 items". */
  noun?: string;
}) => {
  const label = `${total.toLocaleString('en-IN')} ${total === 1 ? noun : `${noun}s`}`;

  /**
   * The size control shows even on a single page.
   *
   * That page exists BECAUSE the size is ten — hiding the control there is
   * exactly where somebody needs it, and is why "show me more" was unreachable
   * on every list short enough to fit.
   */
  const sizer =
    onPageSize && pageSize ? (
      <label className="pager-size">
        <span className="muted">Show</span>
        <select
          className="select"
          value={pageSize}
          onChange={(event) => onPageSize(Number(event.target.value))}
          aria-label="Rows per page"
        >
          {PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </label>
    ) : null;

  if (pageCount <= 1) {
    return (
      <nav className="pager">
        <span className="muted">{label}</span>
        {sizer}
      </nav>
    );
  }

  return (
    <nav className="pager" aria-label="Pagination">
      <span className="muted pager-count">
        Page {page} of {pageCount} · {label}
      </span>

      <div className="pager-pages">
        <button
          type="button"
          className="btn btn-sm"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          Previous
        </button>

        {pageWindow(page, pageCount).map((entry, index) =>
          entry === '…' ? (
            <span key={`gap-${index}`} className="pager-gap" aria-hidden="true">
              …
            </span>
          ) : (
            <button
              key={entry}
              type="button"
              className={`btn btn-sm pager-page${entry === page ? ' is-current' : ''}`}
              aria-current={entry === page ? 'page' : undefined}
              onClick={() => onChange(entry)}
            >
              {entry}
            </button>
          ),
        )}

        <button
          type="button"
          className="btn btn-sm"
          disabled={page >= pageCount}
          onClick={() => onChange(page + 1)}
        >
          Next
        </button>
      </div>

      {sizer}
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
