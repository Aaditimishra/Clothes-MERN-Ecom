interface QuantityStepperProps {
  value: number;
  max: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}

/**
 * Minus, count, plus.
 *
 * A number input would be smaller code and worse: on mobile it summons the
 * numeric keyboard over the bag, and it lets someone type 999 only to be told
 * no. Two buttons bounded by real stock cannot produce an invalid value.
 */
export const QuantityStepper = ({
  value,
  max,
  disabled = false,
  onChange,
}: QuantityStepperProps) => (
  <div className="stepper" role="group" aria-label="Quantity">
    <button
      type="button"
      onClick={() => onChange(value - 1)}
      disabled={disabled || value <= 1}
      aria-label="Decrease quantity"
    >
      −
    </button>
    <span aria-live="polite">{value}</span>
    <button
      type="button"
      onClick={() => onChange(value + 1)}
      disabled={disabled || value >= max}
      aria-label="Increase quantity"
    >
      +
    </button>
  </div>
);
