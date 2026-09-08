import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { Badge, Empty, Loading, Pager } from '../components/ui';
import { DataTable, type Column } from '../components/DataTable';
import { api, downloadCsv, query } from '../lib/api';
import { formatDate, formatMoney, titleCase } from '../lib/format';
import { usePaging } from '../lib/paging';
import { useSession } from '../lib/session';
import type { AdminProductSummary, Paged } from '../lib/types';

const STATUSES = ['', 'active', 'draft', 'archived'] as const;

/** Below this, a size is close enough to selling out to warrant a warning. */
const LOW_STOCK = 20;

const PRODUCT_COLUMNS: Column<AdminProductSummary>[] = [
  {
    key: 'product',
    header: 'Product',
    required: true,
    render: (product) => (
      <Link to={`/products/${product.id}`} className="cell-product">
        <img className="row-thumb" src={product.imageUrl ?? ''} alt="" loading="lazy" />
        <span>
          <strong>{product.name}</strong>
          <span>{product.brand}</span>
        </span>
      </Link>
    ),
  },
  {
    key: 'status',
    header: 'Status',
    render: (product) => <Badge value={product.status} />,
  },
  {
    key: 'department',
    header: 'Department',
    render: (product) => titleCase(product.department),
  },
  {
    key: 'price',
    header: 'From',
    numeric: true,
    render: (product) => formatMoney(product.price),
  },
  {
    key: 'colours',
    header: 'Colours',
    numeric: true,
    optional: true,
    render: (product) => product.colourCount,
  },
  {
    key: 'stock',
    header: 'Stock',
    numeric: true,
    render: (product) => (
      /* Flagged rather than merely printed: somebody scanning this column is
         looking for what needs restocking, not reading numbers. */
      <span className={product.totalStock <= LOW_STOCK ? 'text-warn' : undefined}>
        {product.totalStock}
      </span>
    ),
  },
  {
    key: 'updated',
    header: 'Updated',
    render: (product) => (
      <span className="muted nowrap">{formatDate(product.updatedAt)}</span>
    ),
  },
];

export const ProductsPage = () => {
  const { can } = useSession();
  const { page, pageSize, setPage, setPageSize, reset } = usePaging(25);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['products', page, pageSize, search, status],
    queryFn: () =>
      api<Paged<AdminProductSummary>>(
        `/products${query({ page, pageSize, search, status })}`,
      ),
  });

  return (
    <>
      <header className="topbar">
        <h1>Products</h1>
        <div className="topbar-actions">
          <input
            className="input"
            style={{ width: 220 }}
            placeholder="Search name or brand…"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              reset();
            }}
          />
          <select
            className="select"
            style={{ width: 130 }}
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              reset();
            }}
          >
            {STATUSES.map((value) => (
              <option key={value} value={value}>
                {value ? titleCase(value) : 'All statuses'}
              </option>
            ))}
          </select>
          {can('data.export') ? (
            <button
              type="button"
              className="btn"
              onClick={() => void downloadCsv('/export/products', 'threadline-products')}
            >
              Export CSV
            </button>
          ) : null}
          {can('catalog.manage') ? (
            <Link to="/products/new" className="btn btn-primary">
              New product
            </Link>
          ) : null}
        </div>
      </header>

      <div className="page">
        <section className="card">
          {isLoading ? (
            <Loading />
          ) : data && data.items.length > 0 ? (
            <>
              <DataTable
                rows={data.items}
                rowKey={(product) => product.id}
                storageKey="threadline.admin.columns.products"
                columns={PRODUCT_COLUMNS}
              />
              <Pager
                page={data.page}
                pageCount={data.pageCount}
                total={data.total}
                pageSize={pageSize}
                onChange={setPage}
                onPageSize={setPageSize}
                noun="product"
              />
            </>
          ) : (
            <Empty title="No products found">
              <span>Try a different search, or add your first product.</span>
            </Empty>
          )}
        </section>
      </div>
    </>
  );
};
