import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { MediaPicker } from '../components/MediaPicker';
import { Field, Loading } from '../components/ui';
import { api } from '../lib/api';
import { fromRupees, toRupees } from '../lib/format';
import { useToast } from '../lib/toast';
import { PALETTE_FIELDS, type Branding, type MediaAsset, type StoreSettings } from '../lib/types';

/**
 * Renders the merchant's palette as CSS variables on a preview box.
 *
 * A row of swatches shows the colours; it does not show whether text will be
 * legible on them. Painting a real button and a real badge is what catches a
 * dark accent with dark text on it — before a shopper does.
 */
const palettePreviewStyle = (branding: Branding): React.CSSProperties =>
  ({
    '--pp-primary': branding.primary,
    '--pp-primary-ink': branding.primaryContrast,
    '--pp-accent': branding.accent,
    '--pp-accent-ink': branding.accentInk,
    '--pp-surface': branding.surface,
    '--pp-text': branding.text,
    '--pp-muted': branding.textMuted,
    '--pp-border': branding.border,
    '--pp-danger': branding.danger,
    '--pp-radius': branding.radius,
    '--pp-font': branding.fontBody,
  }) as React.CSSProperties;

export const SettingsPage = () => {
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<StoreSettings | null>(null);
  const [picking, setPicking] = useState<'logo' | 'hero' | null>(null);
  const [heroId, setHeroId] = useState<string | null>(null);
  const [logoId, setLogoId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api<StoreSettings>('/settings'),
  });

  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  const save = useMutation({
    mutationFn: (input: StoreSettings) =>
      api<StoreSettings>('/settings', {
        method: 'PUT',
        body: {
          storeName: input.storeName,
          tagline: input.tagline,
          promoBar: input.promoBar,
          supportEmail: input.supportEmail,
          supportPhone: input.supportPhone,
          shipping: input.shipping,
          taxBands: input.taxBands,
          branding: {
            // `logoUrl`/`heroUrl` are resolved output, not input — sending them
            // back would fail validation. The media IDs are what the server
            // stores, and they are only included when the merchant picked a new
            // asset this session.
            ...Object.fromEntries(
              Object.entries(input.branding).filter(
                ([key]) => key !== 'logoUrl' && key !== 'heroUrl',
              ),
            ),
            ...(logoId !== null ? { logoMediaId: logoId } : {}),
            ...(heroId !== null ? { heroMediaId: heroId } : {}),
          },
          identity: input.identity,
          payment: input.payment,
          promises: input.promises,
          features: input.features,
        },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['settings'] });
      notify('Settings saved — the shop picks these up within a minute');
    },
    onError: (error: unknown) =>
      notify(error instanceof Error ? error.message : 'Could not save', 'error'),
  });

  if (isLoading || !draft) {
    return (
      <>
        <header className="topbar">
          <h1>Store settings</h1>
        </header>
        <div className="page">
          <div className="card">
            <Loading rows={8} />
          </div>
        </div>
      </>
    );
  }

  const set = <K extends keyof StoreSettings>(key: K, value: StoreSettings[K]) =>
    setDraft({ ...draft, [key]: value });

  return (
    <>
      <header className="topbar">
        <h1>Store settings</h1>
        <div className="topbar-actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={save.isPending}
            onClick={() => save.mutate(draft)}
          >
            {save.isPending ? 'Saving…' : 'Save settings'}
          </button>
        </div>
      </header>

      <div className="page">
        <section className="card">
          <div className="card-head">
            <h2>Storefront</h2>
          </div>
          <div className="card-body">
            <div className="grid-2">
              <Field label="Store name">
                <input
                  className="input"
                  value={draft.storeName}
                  onChange={(event) => set('storeName', event.target.value)}
                />
              </Field>
              <Field label="Tagline">
                <input
                  className="input"
                  value={draft.tagline}
                  onChange={(event) => set('tagline', event.target.value)}
                />
              </Field>
            </div>

            <Field
              label="Promo bar"
              hint="The strip above the header. Leave blank to hide it entirely."
            >
              <input
                className="input"
                value={draft.promoBar}
                onChange={(event) => set('promoBar', event.target.value)}
              />
            </Field>

            <div className="grid-2">
              <Field label="Support email">
                <input
                  className="input"
                  value={draft.supportEmail ?? ''}
                  onChange={(event) => set('supportEmail', event.target.value || null)}
                />
              </Field>
              <Field label="Support phone">
                <input
                  className="input"
                  value={draft.supportPhone ?? ''}
                  onChange={(event) => set('supportPhone', event.target.value || null)}
                />
              </Field>
            </div>
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Home page hero</h2>
          </div>
          <div className="card-body">
            <div className="grid-2">
              <div style={{ display: 'grid', gap: 14 }}>
                <Field label="Eyebrow">
                  <input
                    className="input"
                    value={draft.branding.heroEyebrow}
                    onChange={(event) =>
                      set('branding', { ...draft.branding, heroEyebrow: event.target.value })
                    }
                  />
                </Field>
                <Field label="Headline">
                  <input
                    className="input"
                    value={draft.branding.heroTitle}
                    onChange={(event) =>
                      set('branding', { ...draft.branding, heroTitle: event.target.value })
                    }
                  />
                </Field>
                <Field label="Body copy">
                  <textarea
                    className="textarea"
                    rows={3}
                    value={draft.branding.heroCopy}
                    onChange={(event) =>
                      set('branding', { ...draft.branding, heroCopy: event.target.value })
                    }
                  />
                </Field>
                <p className="field-hint">
                  Colours are edited in the palette section below.
                </p>
              </div>

              <div style={{ display: 'grid', gap: 10, alignContent: 'start' }}>
                <span className="field-label">Hero image</span>
                {draft.branding.heroUrl ? (
                  <img
                    src={draft.branding.heroUrl}
                    alt=""
                    style={{ borderRadius: 6, aspectRatio: '16/9', objectFit: 'cover' }}
                  />
                ) : (
                  <div
                    className="dropzone"
                    style={{ aspectRatio: '16/9', alignContent: 'center' }}
                  >
                    <span className="muted">Using the built-in hero</span>
                  </div>
                )}
                <button type="button" className="btn" onClick={() => setPicking('hero')}>
                  Choose hero image
                </button>
                <button type="button" className="btn" onClick={() => setPicking('logo')}>
                  Choose logo
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Brand palette</h2>
            <span className="muted">Every colour in the shop resolves to one of these</span>
          </div>
          <div className="card-body">
            <p className="notice">
              These describe the <strong>light</strong> theme. Dark mode keeps its own
              neutrals and borrows only the accent — a cream surface would make the dark
              theme unreadable, and picking two full palettes to change one colour is a
              worse trade than the constraint.
            </p>

            <div className="palette-grid">
              {PALETTE_FIELDS.map((entry) => (
                <div key={entry.key} className="palette-row">
                  <input
                    type="color"
                    aria-label={entry.label}
                    value={draft.branding[entry.key]}
                    onChange={(event) =>
                      set('branding', { ...draft.branding, [entry.key]: event.target.value })
                    }
                  />
                  <div>
                    <strong>{entry.label}</strong>
                    <span className="muted">{entry.hint}</span>
                  </div>
                  <input
                    className="input mono"
                    value={draft.branding[entry.key]}
                    aria-label={`${entry.label} hex`}
                    onChange={(event) =>
                      set('branding', { ...draft.branding, [entry.key]: event.target.value })
                    }
                  />
                </div>
              ))}
            </div>

            <div className="palette-preview" style={palettePreviewStyle(draft.branding)}>
              <span className="pp-title">Live preview</span>
              <div className="pp-row">
                <button type="button" className="pp-primary">Add to bag</button>
                <button type="button" className="pp-accent">Shop the edit</button>
                <span className="pp-badge">25% off</span>
                <span className="pp-muted">Only 3 left</span>
              </div>
            </div>

            <div className="grid-3">
              <Field label="Body font" hint="A CSS font stack.">
                <input
                  className="input mono"
                  value={draft.branding.fontBody}
                  onChange={(event) =>
                    set('branding', { ...draft.branding, fontBody: event.target.value })
                  }
                />
              </Field>
              <Field label="Heading font">
                <input
                  className="input mono"
                  value={draft.branding.fontDisplay}
                  onChange={(event) =>
                    set('branding', { ...draft.branding, fontDisplay: event.target.value })
                  }
                />
              </Field>
              <Field label="Corner radius" hint="e.g. 8px, or 0 for square.">
                <input
                  className="input mono"
                  value={draft.branding.radius}
                  onChange={(event) =>
                    set('branding', { ...draft.branding, radius: event.target.value })
                  }
                />
              </Field>
            </div>
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Business identity</h2>
            <span className="muted">Appears on invoices and in the footer</span>
          </div>
          <div className="card-body">
            <div className="grid-2">
              <Field label="Legal name">
                <input
                  className="input"
                  value={draft.identity.legalName}
                  onChange={(event) =>
                    set('identity', { ...draft.identity, legalName: event.target.value })
                  }
                />
              </Field>
              <Field label="GSTIN" hint="15 characters, e.g. 27AABCT1332L1ZW.">
                <input
                  className="input mono"
                  value={draft.identity.gstin}
                  onChange={(event) =>
                    set('identity', {
                      ...draft.identity,
                      gstin: event.target.value.toUpperCase(),
                    })
                  }
                />
              </Field>
            </div>
            <Field label="Registered address">
              <input
                className="input"
                value={draft.identity.addressLine}
                onChange={(event) =>
                  set('identity', { ...draft.identity, addressLine: event.target.value })
                }
              />
            </Field>
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Payout details</h2>
            <span className="muted">Where money from the shop lands</span>
          </div>
          <div className="card-body">
            <p className="notice">
              Gateway API keys are <strong>not</strong> stored here. Those are environment
              secrets — a database row an admin session can read is the wrong place for a
              credential that can move money.
            </p>

            <div className="grid-2">
              <Field label="UPI id" hint="e.g. shop@okhdfcbank">
                <input
                  className="input mono"
                  value={draft.payment.upiId}
                  onChange={(event) =>
                    set('payment', { ...draft.payment, upiId: event.target.value })
                  }
                />
              </Field>
              <Field label="UPI display name">
                <input
                  className="input"
                  value={draft.payment.upiName}
                  onChange={(event) =>
                    set('payment', { ...draft.payment, upiName: event.target.value })
                  }
                />
              </Field>
            </div>

            <div className="grid-2">
              <Field label="Bank">
                <input
                  className="input"
                  value={draft.payment.bankName}
                  onChange={(event) =>
                    set('payment', { ...draft.payment, bankName: event.target.value })
                  }
                />
              </Field>
              <Field label="Account name">
                <input
                  className="input"
                  value={draft.payment.accountName}
                  onChange={(event) =>
                    set('payment', { ...draft.payment, accountName: event.target.value })
                  }
                />
              </Field>
            </div>

            <div className="grid-2">
              <Field label="Account number">
                <input
                  className="input mono"
                  value={draft.payment.accountNumber}
                  onChange={(event) =>
                    set('payment', { ...draft.payment, accountNumber: event.target.value })
                  }
                />
              </Field>
              <Field label="IFSC" hint="11 characters, e.g. HDFC0001234.">
                <input
                  className="input mono"
                  value={draft.payment.ifsc}
                  onChange={(event) =>
                    set('payment', { ...draft.payment, ifsc: event.target.value.toUpperCase() })
                  }
                />
              </Field>
            </div>
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Delivery</h2>
          </div>
          <div className="card-body">
            <div className="grid-4">
              <Field label="Free above (₹)">
                <input
                  type="number"
                  className="input"
                  value={toRupees(draft.shipping.freeAbove)}
                  onChange={(event) =>
                    set('shipping', {
                      ...draft.shipping,
                      freeAbove: {
                        amount: fromRupees(event.target.value),
                        currency: 'INR',
                      },
                    })
                  }
                />
              </Field>
              <Field label="Standard fee (₹)">
                <input
                  type="number"
                  className="input"
                  value={toRupees(draft.shipping.standard)}
                  onChange={(event) =>
                    set('shipping', {
                      ...draft.shipping,
                      standard: { amount: fromRupees(event.target.value), currency: 'INR' },
                    })
                  }
                />
              </Field>
              <Field label="COD fee (₹)">
                <input
                  type="number"
                  className="input"
                  value={toRupees(draft.shipping.codSurcharge)}
                  onChange={(event) =>
                    set('shipping', {
                      ...draft.shipping,
                      codSurcharge: {
                        amount: fromRupees(event.target.value),
                        currency: 'INR',
                      },
                    })
                  }
                />
              </Field>
              <Field label="Delivery days">
                <input
                  type="number"
                  className="input"
                  value={draft.shipping.deliveryDays}
                  min="1"
                  onChange={(event) =>
                    set('shipping', {
                      ...draft.shipping,
                      deliveryDays: Number(event.target.value),
                    })
                  }
                />
              </Field>
            </div>
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <h2>GST bands</h2>
            <span className="muted">Applied per unit, not per line</span>
          </div>
          <div className="card-body">
            <p className="notice">
              Apparel GST is banded: under ₹1,000 a garment is 5%, at or above it 12% —
              and the band applies to the <strong>unit</strong> price. Two ₹600 shirts
              are 5% each, not 12% on a ₹1,200 line.
            </p>

            <div className="table-wrap">
              <table className="variant-grid">
                <thead>
                  <tr>
                    <th>Label</th>
                    <th className="num">Rate %</th>
                    <th className="num">From (₹)</th>
                    <th className="num">Up to (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {draft.taxBands.map((band, index) => (
                    <tr key={index}>
                      <td>
                        <input
                          className="input"
                          value={band.label}
                          onChange={(event) => {
                            const bands = [...draft.taxBands];
                            bands[index] = { ...band, label: event.target.value };
                            set('taxBands', bands);
                          }}
                        />
                      </td>
                      <td className="num">
                        <input
                          type="number"
                          className="input"
                          value={band.rate}
                          step="0.5"
                          onChange={(event) => {
                            const bands = [...draft.taxBands];
                            bands[index] = { ...band, rate: Number(event.target.value) };
                            set('taxBands', bands);
                          }}
                        />
                      </td>
                      <td className="num">
                        <input
                          type="number"
                          className="input"
                          value={band.minUnitAmount / 100}
                          onChange={(event) => {
                            const bands = [...draft.taxBands];
                            bands[index] = {
                              ...band,
                              minUnitAmount: fromRupees(event.target.value),
                            };
                            set('taxBands', bands);
                          }}
                        />
                      </td>
                      <td className="num">
                        <input
                          type="number"
                          className="input"
                          placeholder="no limit"
                          value={band.maxUnitAmount === null ? '' : band.maxUnitAmount / 100}
                          onChange={(event) => {
                            const bands = [...draft.taxBands];
                            bands[index] = {
                              ...band,
                              maxUnitAmount: event.target.value
                                ? fromRupees(event.target.value)
                                : null,
                            };
                            set('taxBands', bands);
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Home page promises</h2>
            <span className="muted">The four points under the hero</span>
          </div>
          <div className="card-body">
            {draft.promises.map((promise, index) => (
              <div key={index} className="grid-2">
                <Field label={`Promise ${index + 1} — title`}>
                  <input
                    className="input"
                    value={promise.title}
                    onChange={(event) => {
                      const promises = [...draft.promises];
                      promises[index] = { ...promise, title: event.target.value };
                      set('promises', promises);
                    }}
                  />
                </Field>
                <Field label="Detail">
                  <input
                    className="input"
                    value={promise.copy}
                    onChange={(event) => {
                      const promises = [...draft.promises];
                      promises[index] = { ...promise, copy: event.target.value };
                      set('promises', promises);
                    }}
                  />
                </Field>
              </div>
            ))}

            {draft.promises.length < 4 ? (
              <button
                type="button"
                className="btn"
                onClick={() => set('promises', [...draft.promises, { title: '', copy: '' }])}
              >
                Add a promise
              </button>
            ) : null}
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Features</h2>
          </div>
          <div className="card-body">
            {(
              [
                ['wishlist', 'Wishlist'],
                ['reviews', 'Customer reviews'],
                ['guestCheckout', 'Guest checkout'],
                ['codEnabled', 'Cash on delivery'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="switch">
                <input
                  type="checkbox"
                  checked={draft.features[key]}
                  onChange={(event) =>
                    set('features', { ...draft.features, [key]: event.target.checked })
                  }
                />
                {label}
              </label>
            ))}
          </div>
        </section>
      </div>

      {picking ? (
        <MediaPicker
          onClose={() => setPicking(null)}
          onPick={(asset: MediaAsset) => {
            if (picking === 'hero') {
              setHeroId(asset.id);
              set('branding', { ...draft.branding, heroUrl: asset.url });
            } else {
              setLogoId(asset.id);
              set('branding', { ...draft.branding, logoUrl: asset.url });
            }
            setPicking(null);
          }}
        />
      ) : null}
    </>
  );
};
