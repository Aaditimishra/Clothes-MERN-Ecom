import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { MediaPicker } from '../components/MediaPicker';
import { Field, Loading, Swatch } from '../components/ui';
import { AdminError, api } from '../lib/api';
import { categoryLabel, useCatalogueMeta } from '../lib/catalogue';
import { formatMoney, fromRupees, toRupees } from '../lib/format';
import { useSession } from '../lib/session';
import { useToast } from '../lib/toast';
import type { AdminColourway, AdminImage, AdminProduct, MediaAsset } from '../lib/types';

interface Draft {
  name: string;
  slug: string;
  brandCode: string;
  status: 'draft' | 'active' | 'archived';
  description: string;
  highlights: string;
  careInstructions: string;
  department: string;
  fabric: string;
  fit: string;
  sleeveLength: string;
  occasion: string;
  pattern: string;
  neckline: string;
  primaryCategoryId: string;
  sizeChartId: string;
  colourways: AdminColourway[];
  sizes: string[];
  price: string;
  compareAtPrice: string;
  defaultStock: string;
}

const EMPTY: Draft = {
  name: '',
  slug: '',
  brandCode: '',
  status: 'draft',
  description: '',
  highlights: '',
  careInstructions: '',
  department: '',
  fabric: '',
  fit: '',
  sleeveLength: '',
  occasion: '',
  pattern: '',
  neckline: '',
  primaryCategoryId: '',
  sizeChartId: '',
  colourways: [],
  sizes: [],
  price: '',
  compareAtPrice: '',
  defaultStock: '10',
};

const toDraft = (product: AdminProduct): Draft => ({
  name: product.name,
  slug: product.slug,
  brandCode: product.brandCode,
  status: product.status,
  description: product.description,
  // Newline-separated in the editor because that is how a person types a list;
  // the array shape is an implementation detail of the API, not of the form.
  highlights: product.highlights.join('\n'),
  careInstructions: product.careInstructions ?? '',
  department: product.department,
  fabric: product.fabric ?? '',
  fit: product.fit ?? '',
  sleeveLength: product.sleeveLength ?? '',
  occasion: product.occasion ?? '',
  pattern: product.pattern ?? '',
  neckline: product.neckline ?? '',
  primaryCategoryId: product.primaryCategoryId ?? '',
  sizeChartId: product.sizeChartId ?? '',
  colourways: product.colourways,
  sizes: product.sizes,
  price: toRupees(product.variants[0]?.price ?? null),
  compareAtPrice: toRupees(product.variants[0]?.compareAtPrice ?? null),
  defaultStock: '10',
});

export const ProductEditorPage = () => {
  const { id } = useParams<{ id: string }>();
  const isNew = !id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const { can } = useSession();
  const meta = useCatalogueMeta();

  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [picking, setPicking] = useState<number | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const canManage = can('catalog.manage');

  const { data: product, isLoading } = useQuery({
    queryKey: ['product', id],
    queryFn: () => api<AdminProduct>(`/products/${id}`),
    enabled: !isNew,
  });

  useEffect(() => {
    if (product) setDraft(toDraft(product));
  }, [product]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const colourTerms = meta.terms('colour');
  const sizeTerms = meta.terms('size');

  const body = useMemo(
    () => ({
      name: draft.name,
      slug: draft.slug || undefined,
      brandCode: draft.brandCode,
      status: draft.status,
      description: draft.description,
      highlights: draft.highlights.split('\n').map((line) => line.trim()).filter(Boolean),
      careInstructions: draft.careInstructions || null,
      department: draft.department,
      fabric: draft.fabric || null,
      fit: draft.fit || null,
      sleeveLength: draft.sleeveLength || null,
      occasion: draft.occasion || null,
      pattern: draft.pattern || null,
      neckline: draft.neckline || null,
      primaryCategoryId: draft.primaryCategoryId || null,
      categoryIds: draft.primaryCategoryId ? [draft.primaryCategoryId] : [],
      sizeChartId: draft.sizeChartId || null,
      colourways: draft.colourways.map((colourway) => ({
        code: colourway.code,
        images: colourway.images.map((image) => ({
          mediaId: image.mediaId,
          url: image.url,
          alt: image.alt,
        })),
      })),
      sizes: draft.sizes,
      price: fromRupees(draft.price),
      compareAtPrice: draft.compareAtPrice ? fromRupees(draft.compareAtPrice) : null,
      defaultStock: Number(draft.defaultStock || 0),
    }),
    [draft],
  );

  const save = useMutation({
    mutationFn: () =>
      isNew
        ? api<AdminProduct>('/products', { method: 'POST', body })
        : api<AdminProduct>(`/products/${id}`, { method: 'PUT', body }),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      void queryClient.invalidateQueries({ queryKey: ['product', saved.id] });
      setFields({});
      notify('Product saved');
      if (isNew) navigate(`/products/${saved.id}`, { replace: true });
    },
    onError: (error: unknown) => {
      if (error instanceof AdminError) {
        setFields(error.fields);
        notify(error.message, 'error');
      } else {
        notify('Could not save the product', 'error');
      }
    },
  });

  /**
   * Overwrites every variant's price in one call.
   *
   * Separate from Save on purpose: saving a product must never quietly reprice
   * things the merchant did not touch, and repricing a whole line must not
   * require thirty individual edits. Both needs are real; one button each.
   */
  const applyPrice = useMutation({
    mutationFn: () =>
      api<AdminProduct>(`/products/${id}/apply-price`, {
        method: 'POST',
        body: {
          price: fromRupees(draft.price),
          compareAtPrice: draft.compareAtPrice ? fromRupees(draft.compareAtPrice) : null,
        },
      }),
    onSuccess: (saved) => {
      queryClient.setQueryData(['product', id], saved);
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      notify(`Price applied to all ${saved.variantCount} variants`);
    },
    onError: (error: unknown) =>
      notify(error instanceof Error ? error.message : 'Could not apply the price', 'error'),
  });

  const setVariant = useMutation({
    mutationFn: (input: {
      variantId: string;
      patch: Record<string, unknown>;
    }) =>
      api<AdminProduct>(`/products/${id}/variants/${input.variantId}`, {
        method: 'PATCH',
        body: input.patch,
      }),
    onSuccess: (saved) => {
      queryClient.setQueryData(['product', id], saved);
      void queryClient.invalidateQueries({ queryKey: ['products'] });

      /**
       * A quiet confirmation in the section header, not a toast.
       *
       * The grid saves per cell, so a merchant doing a stock take fires thirty
       * of these — thirty toasts would bury the screen. But silent success on an
       * auto-save is where people lose confidence and start re-typing values, so
       * "Saved" appearing next to the heading is the smallest thing that answers
       * "did that take?".
       */
      setSavedAt(Date.now());
    },
    onError: (error: unknown) =>
      notify(error instanceof Error ? error.message : 'Could not update', 'error'),
  });

  const addColourway = (code: string) => {
    if (draft.colourways.some((colourway) => colourway.code === code)) return;
    const term = colourTerms.find((entry) => entry.code === code);

    set('colourways', [
      ...draft.colourways,
      {
        code,
        label: term?.label ?? code,
        swatch: term?.swatch ?? '#cccccc',
        images: [],
      },
    ]);
  };

  const addImage = (index: number, asset: MediaAsset) => {
    const next = [...draft.colourways];
    const colourway = next[index];
    if (!colourway) return;

    const image: AdminImage = { mediaId: asset.id, url: asset.url, alt: asset.alt };
    next[index] = { ...colourway, images: [...colourway.images, image] };
    set('colourways', next);
  };

  if (!isNew && isLoading) {
    return (
      <>
        <header className="topbar">
          <h1>Product</h1>
        </header>
        <div className="page">
          <div className="card">
            <Loading rows={8} />
          </div>
        </div>
      </>
    );
  }

  const select = (
    label: string,
    key: keyof Draft,
    group: string,
    { required = false }: { required?: boolean } = {},
  ) => (
    <Field label={label} error={fields[key as string]}>
      <select
        className="select"
        value={draft[key] as string}
        disabled={!canManage}
        aria-invalid={Boolean(fields[key as string])}
        onChange={(event) => set(key, event.target.value as never)}
      >
        <option value="">{required ? 'Choose…' : 'Not set'}</option>
        {meta.terms(group).map((term) => (
          <option key={term.code} value={term.code}>
            {term.label}
          </option>
        ))}
      </select>
    </Field>
  );

  return (
    <>
      <header className="topbar">
        <h1>{isNew ? 'New product' : draft.name || 'Product'}</h1>
        <div className="topbar-actions">
          <Link to="/products" className="btn">
            Back
          </Link>
          {!isNew && product ? (
            <a
              className="btn"
              href={`http://localhost:5173/product/${product.slug}`}
              target="_blank"
              rel="noreferrer"
            >
              View in shop
            </a>
          ) : null}
          <button
            type="button"
            className="btn btn-primary"
            disabled={!canManage || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? 'Saving…' : 'Save product'}
          </button>
        </div>
      </header>

      <div className="page">
        <div className="editor">
          <div style={{ display: 'grid', gap: 18 }}>
            <section className="card">
              <div className="card-head">
                <h2>Basics</h2>
              </div>
              <div className="card-body">
                <Field label="Name" error={fields.name}>
                  <input
                    className="input"
                    value={draft.name}
                    disabled={!canManage}
                    aria-invalid={Boolean(fields.name)}
                    onChange={(event) => set('name', event.target.value)}
                  />
                </Field>

                <Field
                  label="URL slug"
                  hint="Leave blank to generate from the name. Changing it breaks existing links."
                  error={fields.slug}
                >
                  <input
                    className="input mono"
                    value={draft.slug}
                    disabled={!canManage}
                    placeholder="auto"
                    onChange={(event) => set('slug', event.target.value)}
                  />
                </Field>

                <div className="grid-2">
                  {select('Brand', 'brandCode', 'brand', { required: true })}
                  {select('Department', 'department', 'department', { required: true })}
                </div>

                <Field label="Description" error={fields.description}>
                  <textarea
                    className="textarea"
                    rows={5}
                    value={draft.description}
                    disabled={!canManage}
                    onChange={(event) => set('description', event.target.value)}
                  />
                </Field>

                <Field label="Highlights" hint="One per line. Shown as bullets on the product page.">
                  <textarea
                    className="textarea"
                    rows={4}
                    value={draft.highlights}
                    disabled={!canManage}
                    onChange={(event) => set('highlights', event.target.value)}
                  />
                </Field>

                <Field label="Care instructions">
                  <textarea
                    className="textarea"
                    rows={2}
                    value={draft.careInstructions}
                    disabled={!canManage}
                    onChange={(event) => set('careInstructions', event.target.value)}
                  />
                </Field>
              </div>
            </section>

            <section className="card">
              <div className="card-head">
                <h2>Attributes</h2>
                <span className="muted">These drive the shop's filters</span>
              </div>
              <div className="card-body">
                <div className="grid-3">
                  {select('Fabric', 'fabric', 'fabric')}
                  {select('Fit', 'fit', 'fit')}
                  {select('Occasion', 'occasion', 'occasion')}
                  {select('Sleeve length', 'sleeveLength', 'sleeve-length')}
                  {select('Pattern', 'pattern', 'pattern')}
                  {select('Neckline', 'neckline', 'neckline')}
                </div>
              </div>
            </section>

            <section className="card">
              <div className="card-head">
                <h2>Colourways &amp; images</h2>
                <span className="muted">Each colour opens its own gallery in the shop</span>
              </div>
              <div className="card-body">
                {fields.colourways ? (
                  <p className="notice notice-error">{fields.colourways}</p>
                ) : null}

                {draft.colourways.map((colourway, index) => (
                  <div key={colourway.code} className="colourway">
                    <div className="colourway-head">
                      <Swatch colour={colourway.swatch} />
                      <strong>{colourway.label}</strong>
                      <span className="muted mono">{colourway.code}</span>
                      {canManage ? (
                        <button
                          type="button"
                          className="btn btn-sm btn-danger"
                          style={{ marginLeft: 'auto' }}
                          onClick={() =>
                            set(
                              'colourways',
                              draft.colourways.filter((entry) => entry.code !== colourway.code),
                            )
                          }
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>

                    <div className="colourway-images">
                      {colourway.images.map((image, imageIndex) => (
                        <div key={`${image.url}-${imageIndex}`} className="colourway-image">
                          <img src={image.url} alt={image.alt} />
                          {canManage ? (
                            <button
                              type="button"
                              aria-label="Remove image"
                              onClick={() => {
                                const next = [...draft.colourways];
                                next[index] = {
                                  ...colourway,
                                  images: colourway.images.filter((_, i) => i !== imageIndex),
                                };
                                set('colourways', next);
                              }}
                            >
                              ×
                            </button>
                          ) : null}
                        </div>
                      ))}

                      {canManage ? (
                        <button
                          type="button"
                          className="add-image"
                          onClick={() => setPicking(index)}
                          aria-label={`Add image to ${colourway.label}`}
                        >
                          +
                        </button>
                      ) : null}
                    </div>

                    {colourway.images.length === 0 ? (
                      <p className="field-hint" style={{ color: 'var(--warn)' }}>
                        No image yet — this colourway will show a blank tile in the shop.
                      </p>
                    ) : null}
                  </div>
                ))}

                {canManage ? (
                  <Field label="Add a colourway">
                    <select
                      className="select"
                      value=""
                      onChange={(event) => {
                        if (event.target.value) addColourway(event.target.value);
                        event.target.value = '';
                      }}
                    >
                      <option value="">Choose a colour…</option>
                      {colourTerms
                        .filter(
                          (term) => !draft.colourways.some((entry) => entry.code === term.code),
                        )
                        .map((term) => (
                          <option key={term.code} value={term.code}>
                            {term.label}
                          </option>
                        ))}
                    </select>
                  </Field>
                ) : null}
              </div>
            </section>

            {!isNew && product ? (
              <section className="card">
                <div className="card-head">
                  <h2>Stock &amp; price by size</h2>
                  <span className="muted">
                    {setVariant.isPending ? 'Saving…' : 'Each cell saves when you leave it'}
                  </span>
                  {savedAt && !setVariant.isPending ? (
                    <span className="saved-flag" key={savedAt}>
                      Saved
                    </span>
                  ) : null}
                </div>
                <div className="table-wrap">
                  <table className="variant-grid">
                    <thead>
                      <tr>
                        <th>SKU</th>
                        <th>Colour</th>
                        <th>Size</th>
                        <th className="num">Price (₹)</th>
                        <th className="num">Stock</th>
                        <th>Sellable</th>
                      </tr>
                    </thead>
                    <tbody>
                      {product.variants.map((variant) => (
                        <tr key={variant.id} style={variant.isEnabled ? undefined : { opacity: 0.5 }}>
                          <td className="mono">{variant.sku}</td>
                          <td>{variant.colour}</td>
                          <td>
                            <strong>{variant.size.toUpperCase()}</strong>
                          </td>
                          <td className="num">
                            <input
                              type="number"
                              className="input"
                              defaultValue={toRupees(variant.price)}
                              step="1"
                              min="0"
                              disabled={!can('inventory.manage')}
                              onBlur={(event) => {
                                const next = fromRupees(event.target.value);
                                if (next !== variant.price.amount) {
                                  setVariant.mutate({
                                    variantId: variant.id,
                                    patch: { price: next },
                                  });
                                }
                              }}
                            />
                          </td>
                          <td className="num">
                            <input
                              type="number"
                              className="input"
                              defaultValue={variant.stockQuantity}
                              min="0"
                              disabled={!can('inventory.manage')}
                              onBlur={(event) => {
                                const next = Number(event.target.value);
                                if (next !== variant.stockQuantity) {
                                  setVariant.mutate({
                                    variantId: variant.id,
                                    patch: { stockQuantity: next },
                                  });
                                }
                              }}
                            />
                          </td>
                          <td>
                            <label className="switch">
                              <input
                                type="checkbox"
                                checked={variant.isEnabled}
                                disabled={!can('inventory.manage')}
                                onChange={(event) =>
                                  setVariant.mutate({
                                    variantId: variant.id,
                                    patch: { isEnabled: event.target.checked },
                                  })
                                }
                              />
                            </label>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}
          </div>

          <aside className="editor-aside">
            <section className="card">
              <div className="card-head">
                <h2>Publish</h2>
              </div>
              <div className="card-body">
                <Field label="Status">
                  <select
                    className="select"
                    value={draft.status}
                    disabled={!canManage}
                    onChange={(event) => set('status', event.target.value as Draft['status'])}
                  >
                    <option value="draft">Draft — not visible</option>
                    <option value="active">Active — live in the shop</option>
                    <option value="archived">Archived — hidden, history kept</option>
                  </select>
                </Field>

                <Field label="Category" error={fields.primaryCategoryId}>
                  <select
                    className="select"
                    value={draft.primaryCategoryId}
                    disabled={!canManage}
                    onChange={(event) => set('primaryCategoryId', event.target.value)}
                  >
                    <option value="">Choose…</option>
                    {meta.categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {categoryLabel(category, meta.categories)}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Size chart" hint="Shown behind the 'Size guide' link.">
                  <select
                    className="select"
                    value={draft.sizeChartId}
                    disabled={!canManage}
                    onChange={(event) => set('sizeChartId', event.target.value)}
                  >
                    <option value="">None</option>
                    {meta.sizeCharts.map((chart) => (
                      <option key={chart.id} value={chart.id}>
                        {chart.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </section>

            <section className="card">
              <div className="card-head">
                <h2>Sizes</h2>
              </div>
              <div className="card-body">
                {fields.sizes ? <p className="notice notice-error">{fields.sizes}</p> : null}
                <div className="size-toggles">
                  {sizeTerms.map((term) => {
                    const isOn = draft.sizes.includes(term.code);
                    return (
                      <button
                        key={term.code}
                        type="button"
                        className={`size-toggle${isOn ? ' is-on' : ''}`}
                        disabled={!canManage}
                        aria-pressed={isOn}
                        onClick={() =>
                          set(
                            'sizes',
                            isOn
                              ? draft.sizes.filter((size) => size !== term.code)
                              : [...draft.sizes, term.code],
                          )
                        }
                      >
                        {term.label}
                      </button>
                    );
                  })}
                </div>
                <p className="field-hint">
                  Removing a size disables it rather than deleting it — past orders keep
                  working, and re-adding it restores its old price and stock.
                </p>
              </div>
            </section>

            <section className="card">
              <div className="card-head">
                <h2>Pricing</h2>
              </div>
              <div className="card-body">
                <Field
                  label="Price (₹)"
                  hint="Seeds new size × colour combinations. Existing ones keep their own price — use the button below to change them all."
                  error={fields.price}
                >
                  <input
                    type="number"
                    className="input"
                    value={draft.price}
                    min="0"
                    step="1"
                    disabled={!canManage}
                    onChange={(event) => set('price', event.target.value)}
                  />
                </Field>

                <Field label="Compare-at / MRP (₹)" hint="Leave blank for a full-price line.">
                  <input
                    type="number"
                    className="input"
                    value={draft.compareAtPrice}
                    min="0"
                    step="1"
                    disabled={!canManage}
                    onChange={(event) => set('compareAtPrice', event.target.value)}
                  />
                </Field>

                <Field
                  label="Stock for new sizes"
                  hint="Applied only to size × colour combinations that do not exist yet."
                >
                  <input
                    type="number"
                    className="input"
                    value={draft.defaultStock}
                    min="0"
                    disabled={!canManage}
                    onChange={(event) => set('defaultStock', event.target.value)}
                  />
                </Field>

                {product ? (
                  <>
                    <button
                      type="button"
                      className="btn"
                      disabled={!canManage || applyPrice.isPending || !draft.price}
                      onClick={() => applyPrice.mutate()}
                    >
                      {applyPrice.isPending
                        ? 'Applying…'
                        : `Apply ₹${draft.price || 0} to all ${product.variantCount} variants`}
                    </button>
                    <p className="field-hint">
                      Live from price: <strong>{formatMoney(product.price)}</strong> ·{' '}
                      {product.variantCount} variants · {product.totalStock} in stock
                    </p>
                  </>
                ) : null}
              </div>
            </section>
          </aside>
        </div>
      </div>

      {picking !== null ? (
        <MediaPicker
          onClose={() => setPicking(null)}
          onPick={(asset) => {
            addImage(picking, asset);
            setPicking(null);
          }}
        />
      ) : null}
    </>
  );
};
