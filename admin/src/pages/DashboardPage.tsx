import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { Badge, Empty, Loading } from '../components/ui';
import { api } from '../lib/api';
import { formatDate, formatMoney } from '../lib/format';
import type { Dashboard } from '../lib/types';

export const DashboardPage = () => {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api<Dashboard>('/dashboard'),
  });

  return (
    <>
      <header className="topbar">
        <h1>Dashboard</h1>
      </header>

      <div className="page">
        {isLoading || !data ? (
          <div className="stats">
            {Array.from({ length: 5 }, (_, index) => (
              <div key={index} className="skeleton" style={{ height: 88 }} />
            ))}
          </div>
        ) : (
          <div className="stats">
            <div className="stat">
              <span className="stat-label">Revenue · 30 days</span>
              <span className="stat-value">{formatMoney(data.revenue30d)}</span>
              <span className="stat-note">Excludes cancelled and returned</span>
            </div>
            <div className="stat">
              <span className="stat-label">Orders · 30 days</span>
              <span className="stat-value">{data.orders30d}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Live products</span>
              <span className="stat-value">{data.activeProducts}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Low stock</span>
              <span className="stat-value">{data.lowStockProducts}</span>
              <span className="stat-note">5 or fewer left in a size</span>
            </div>
            <div className="stat">
              <span className="stat-label">Customers</span>
              <span className="stat-value">{data.customers}</span>
            </div>
          </div>
        )}

        <section className="card">
          <div className="card-head">
            <h2>Recent orders</h2>
            <div className="card-head-actions">
              <Link to="/orders" className="btn btn-sm">
                All orders
              </Link>
            </div>
          </div>

          {isLoading ? (
            <Loading rows={4} />
          ) : data && data.recentOrders.length > 0 ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>Placed</th>
                    <th>Items</th>
                    <th>Status</th>
                    <th>Payment</th>
                    <th className="num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentOrders.map((order) => (
                    <tr key={order.id}>
                      <td className="mono">{order.reference}</td>
                      <td>{formatDate(order.placedAt)}</td>
                      <td>{order.itemCount}</td>
                      <td>
                        <Badge value={order.status} />
                      </td>
                      <td>
                        <Badge value={order.paymentStatus} />
                      </td>
                      <td className="num">{formatMoney(order.totals.grandTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title="No orders yet">
              <span>Orders will appear here as they come in.</span>
            </Empty>
          )}
        </section>
      </div>
    </>
  );
};
