import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { Empty, Loading, Pager } from '../components/ui';
import { DataTable, type Column } from '../components/DataTable';
import { api, downloadCsv, query } from '../lib/api';
import { formatDate } from '../lib/format';
import { usePaging } from '../lib/paging';
import { useSession } from '../lib/session';
import type { AdminCustomer, Paged } from '../lib/types';

const CUSTOMER_COLUMNS: Column<AdminCustomer>[] = [
  {
    key: 'name',
    header: 'Name',
    required: true,
    render: (customer) => <strong>{customer.name}</strong>,
  },
  {
    key: 'email',
    header: 'Email',
    required: true,
    render: (customer) => <span className="mono">{customer.email}</span>,
  },
  { key: 'phone', header: 'Phone', render: (customer) => customer.phone ?? '—' },
  {
    key: 'addresses',
    header: 'Addresses',
    numeric: true,
    render: (customer) => customer.addressCount,
  },
  {
    key: 'wishlist',
    header: 'Wishlist',
    numeric: true,
    optional: true,
    render: (customer) => customer.wishlistCount,
  },
  {
    key: 'joined',
    header: 'Joined',
    render: (customer) => (
      <span className="muted nowrap">{formatDate(customer.createdAt)}</span>
    ),
  },
];

export const CustomersPage = () => {
  const { can } = useSession();
  const { page, pageSize, setPage, setPageSize, reset } = usePaging(25);
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['customers', page, pageSize, search],
    queryFn: () =>
      api<Paged<AdminCustomer>>(`/customers${query({ page, pageSize, search })}`),
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
              onClick={() =>
                void downloadCsv('/export/customers', 'threadline-customers')
              }
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
              reset();
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
              <DataTable
                rows={data.items}
                rowKey={(customer) => customer.id}
                storageKey="threadline.admin.columns.customers"
                columns={CUSTOMER_COLUMNS}
              />
              <Pager
                page={data.page}
                pageCount={data.pageCount}
                total={data.total}
                pageSize={pageSize}
                onChange={setPage}
                onPageSize={setPageSize}
                noun="customer"
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
