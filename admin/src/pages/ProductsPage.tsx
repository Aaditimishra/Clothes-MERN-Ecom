import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { Badge, Empty, Loading, Pager } from '../components/ui';
import { api, downloadCsv, query } from '../lib/api';
import { formatDate, formatMoney, titleCase } from '../lib/format';
import { useSession } from '../lib/session';
import type { AdminProductSummary, Paged } from '../lib/types';

const STATUSES = ['', 'active', 'draft', 'archived'] as const;

/** Below this, a size is close enough to selling out to warrant a warning. */
const LOW_STOCK = 20;

export const ProductsPage = () => {
  const { can } = useSession();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['products', page, search, status],
    queryFn: () =>
      api<Paged<AdminProductSummary>>(`/products${query({ page, pageSize: 25, search, status })}`),
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
              setPage(1);
            }}
          />
          <select
            className="select"
            style={{ width: 130 }}
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
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
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Status</th>
                      <th>Department</th>
                      <th className="num">From</th>
                      <th className="num">Colours</th>
                      <th className="num">Stock</th>
                      <th>Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((product) => (
                      <tr key={product.id}>
                        <td>
                          <Link to={`/products/${product.id}`} className="cell-product">
                            <img
                              className="row-thumb"
                              src={product.imageUrl ?? ''}
                              alt=""
                              loading="lazy"
                            />
                            <span>
                              <strong>{product.name}</strong>
                              <span>{product.brand}</span>
                            </span>
                          </Link>
                        </td>
                        <td>
                          <Badge value={product.status} />
                        </td>
                        <td>{titleCase(product.department)}</td>
                        <td className="num">{formatMoney(product.price)}</td>
                        <td className="num">{product.colourCount}</td>
                        <td className="num">
                          {/* Flagged rather than merely printed: a merchant scanning
                              this column is looking for what needs restocking. */}
                          <span
                            style={
                              product.totalStock <= LOW_STOCK
                                ? { color: 'var(--warn)', fontWeight: 600 }
                                : undefined
                            }
                          >
                            {product.totalStock}
                          </span>
                        </td>
                        <td className="muted">{formatDate(product.updatedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager
                page={data.page}
                pageCount={data.pageCount}
                total={data.total}
                onChange={setPage}
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
