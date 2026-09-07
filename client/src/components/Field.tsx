import type { ReactNode } from 'react';

/**
 * Label, control, then one message slot.
 *
 * The error replaces the hint rather than stacking under it — two lines of small
 * grey-and-red text under one input is where people stop reading either.
 */
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
    {error ? (
      <span className="field-error">{error}</span>
    ) : hint ? (
      <span className="muted field-hint">{hint}</span>
    ) : null}
  </label>
);
