import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { Empty, Loading, Pager } from '../components/ui';
import { api, downloadCsv, query } from '../lib/api';
import { formatDate } from '../lib/format';
import { useSession } from '../lib/session';
import type { AdminCustomer, Paged } from '../lib/types';

export const CustomersPage = () => {
  const { can } = useSession();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['customers', page, search],
    queryFn: () => api<Paged<AdminCustomer>>(`/customers${query({ page, pageSize: 25, search })}`),
  });

  return (
    <>
      <header className="topbar">
        <h1>Customers</h1>
        <div className="topbar-actions">
          {can('data.export') ? (
          <button
            type="button"
            className="btn"
            onClick={() => void downloadCsv('/export/customers', 'threadline-customers')}
          >
            Export CSV
          </button>
          ) : null}
          <input
            className="input"
            style={{ width: 240 }}
            placeholder="Name or email…"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
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
                      <th>Name</th>
                      <th>Email</th>
                      <th>Phone</th>
                      <th className="num">Addresses</th>
                      <th className="num">Wishlist</th>
                      <th>Joined</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((customer) => (
                      <tr key={customer.id}>
                        <td>
                          <strong>{customer.name}</strong>
                        </td>
                        <td className="mono">{customer.email}</td>
                        <td>{customer.phone ?? '—'}</td>
                        <td className="num">{customer.addressCount}</td>
                        <td className="num">{customer.wishlistCount}</td>
                        <td className="muted">{formatDate(customer.createdAt)}</td>
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
            <Empty title="No customers found" />
          )}
        </section>
      </div>
    </>
  );
};
