import { useToast } from '../store/toast';

/**
 * `role="status"` on a polite live region.
 *
 * "Added to your bag" must reach a screen-reader user, but not interrupt what
 * they are already reading — which is exactly what `role="alert"` would do.
 */
export const Toasts = () => {
  const { toasts, dismiss } = useToast();

  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.tone}`}>
          <span>{toast.message}</span>
          <button type="button" onClick={() => dismiss(toast.id)} aria-label="Dismiss">
            ×
          </button>
        </div>
      ))}
    </div>
  );
};
