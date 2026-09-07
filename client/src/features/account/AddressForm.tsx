import { useState } from 'react';
import type { SavedAddress } from '@shop/shared';

interface AddressFormProps {
  address?: SavedAddress;
  busy?: boolean;
  errors?: Record<string, string>;
  onSubmit: (address: Omit<SavedAddress, 'id'> & { id?: string }) => void;
  onCancel: () => void;
}

const EMPTY = {
  label: 'Home',
  fullName: '',
  phone: '',
  line1: '',
  line2: '',
  city: '',
  state: '',
  postalCode: '',
  country: 'IN',
  isDefault: false,
};

export const AddressForm = ({
  address,
  busy = false,
  errors = {},
  onSubmit,
  onCancel,
}: AddressFormProps) => {
  const [draft, setDraft] = useState({
    ...EMPTY,
    ...(address ? { ...address, line2: address.line2 ?? '' } : {}),
  });

  const set = (key: keyof typeof draft, value: string | boolean) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const field = (
    key: keyof typeof draft,
    label: string,
    props: React.InputHTMLAttributes<HTMLInputElement> = {},
  ) => (
    <label className="field">
      <span className="field-label">{label}</span>
      <input
        className="input"
        value={String(draft[key] ?? '')}
        aria-invalid={Boolean(errors[key])}
        onChange={(event) => set(key, event.target.value)}
        {...props}
      />
      {errors[key] ? <span className="field-error">{errors[key]}</span> : null}
    </label>
  );

  return (
    <form
      className="address-form stack"
      style={{ '--stack-gap': '14px' } as React.CSSProperties}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({ ...draft, line2: draft.line2 || null, ...(address ? { id: address.id } : {}) });
      }}
    >
      <div className="grid-2">
        {field('label', 'Label', { placeholder: 'Home, Work…', maxLength: 40 })}
        {field('fullName', 'Full name', { autoComplete: 'name', required: true })}
      </div>

      {field('phone', 'Mobile number', {
        inputMode: 'numeric',
        autoComplete: 'tel-national',
        required: true,
      })}
      {field('line1', 'Address', { autoComplete: 'address-line1', required: true })}
      {field('line2', 'Apartment, landmark (optional)', { autoComplete: 'address-line2' })}

      <div className="grid-3">
        {field('city', 'City', { autoComplete: 'address-level2', required: true })}
        {field('state', 'State', { autoComplete: 'address-level1', required: true })}
        {field('postalCode', 'PIN code', {
          inputMode: 'numeric',
          autoComplete: 'postal-code',
          required: true,
        })}
      </div>

      <label className="switch-row">
        <input
          type="checkbox"
          checked={draft.isDefault}
          onChange={(event) => set('isDefault', event.target.checked)}
        />
        <span>Use this as my default delivery address</span>
      </label>

      <div className="row">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save address'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
};
