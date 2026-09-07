import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { BarChart, Donut, SparkArea, chartColour } from '../components/charts';
import { Badge, Empty, Loading } from '../components/ui';
import { api, query } from '../lib/api';
import { formatDate, formatMoney } from '../lib/format';
import { useSession } from '../lib/session';
import type { Dashboard } from '../lib/types';

/** The windows offered. Long enough to see a season, short enough to see a day. */
const WINDOWS = [7, 30, 90] as const;

/**
 * A change, said the way a person would say it.
 *
 * `null` means the previous window took nothing, and there is no honest ratio
 * to print. "No comparison" is the truthful answer; 0% would read as flat, and
 * an infinity symbol reads as a bug.
 */
const Trend = ({ percent, suffix }: { percent: number | null; suffix: string }) => {
  if (percent === null) return <span className="muted">no comparison · {suffix}</span>;

  const up = percent > 0;
  const flat = percent === 0;

  return (
    <>
      <span className={`trend${flat ? '' : up ? ' is-up' : ' is-down'}`}>
        {flat ? '±' : up ? '↑' : '↓'} {Math.abs(percent)}%
      </span>
      <span className="muted">{suffix}</span>
    </>
  );
};

/** `2026-09-07` → `7 Sep`, in the shop's own reading order. */
const shortDay = (iso: string): string => {
  const [, month, day] = iso.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${Number(day)} ${months[Number(month) - 1]}`;
};

export const DashboardPage = () => {
  const { session } = useSession();
  const [days, setDays] = useState<number>(30);

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', days],
    queryFn: () => api<Dashboard>(`/dashboard${query({ days })}`),
    // Keeps the previous window on screen while the new one loads, so switching
    // 30d → 7d dims the cards instead of blanking the page.
    placeholderData: (previous) => previous,
  });

  const statusSlices =
    data?.statusBreakdown.map((row, index) => ({
      label: row.status,
      value: row.count,
      colour: chartColour(index),
    })) ?? [];

  return (
    <>
      <header className="topbar">
        <div>
          <h1>Dashboard</h1>
          <p className="topbar-sub">
            {session?.staff.name} · last {days} days
          </p>
        </div>

        <div className="segmented" role="group" aria-label="Period">
          {WINDOWS.map((value) => (
            <button
              key={value}
              type="button"
              className={`segmented-option${days === value ? ' is-on' : ''}`}
              aria-pressed={days === value}
              onClick={() => setDays(value)}
            >
              {value}d
            </button>
          ))}
        </div>
      </header>

      <div className="page">
        {!data ? (
          <div className="stats">
            {Array.from({ length: 4 }, (_, index) => (
              // Skeletons the size of the real cards, so the layout does not
              // jump when the figures land.
              <div key={index} className="skeleton" style={{ height: 132 }} />
            ))}
          </div>
        ) : (
          <>
            <div className={`stats${isLoading ? ' is-stale' : ''}`}>
              <article className="stat">
                <div className="stat-top">
                  <span className="stat-label">Revenue taken</span>
                  <span className="stat-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <path d="M6 3h12M6 8h12M9 3v5a5 5 0 0 0 5 5H6l7 8" />
                    </svg>
                  </span>
                </div>
                <strong className="stat-value">{formatMoney(data.totals.revenue)}</strong>
                <div className="stat-foot">
                  <Trend
                    percent={data.totals.revenueChangePercent}
                    suffix={`vs previous ${days}d`}
                  />
                </div>
                <div className="stat-spark">
                  <SparkArea
                    points={data.series.map((point) => point.revenue)}
                    label="Revenue"
                  />
                </div>
              </article>

              <article className="stat">
                <div className="stat-top">
                  <span className="stat-label">Orders</span>
                  <span className="stat-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <path d="M6 2h9l5 5v15H6V2Zm9 0v5h5M9 13h8M9 17h5" />
                    </svg>
                  </span>
                </div>
                <strong className="stat-value">{data.totals.orders}</strong>
                <div className="stat-foot">
                  <Trend
                    percent={data.totals.ordersChangePercent}
                    suffix={`${data.totals.paidOrders} paid`}
                  />
                </div>
                <div className="stat-spark">
                  <SparkArea
                    points={data.series.map((point) => point.orders)}
                    colour="var(--chart-2)"
                    label="Orders"
                  />
                </div>
              </article>

              <article className="stat">
                <div className="stat-top">
                  <span className="stat-label">Average order</span>
                  <span className="stat-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <path d="M3 17l6-6 4 4 8-8M21 7v5h-5" />
                    </svg>
                  </span>
                </div>
                <strong className="stat-value">
                  {formatMoney(data.totals.averageOrderValue)}
                </strong>
                <div className="stat-foot">
                  <span className="muted">across paid orders</span>
                </div>
              </article>

              <article className="stat">
                <div className="stat-top">
                  <span className="stat-label">Customers</span>
                  <span className="stat-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-8 9a8 8 0 0 1 16 0" />
                    </svg>
                  </span>
                </div>
                <strong className="stat-value">{data.totals.customers}</strong>
                <div className="stat-foot">
                  {data.totals.newCustomers > 0 ? (
                    <>
                      <span className="trend is-up">+{data.totals.newCustomers}</span>
                      <span className="muted">new this period</span>
                    </>
                  ) : (
                    <span className="muted">no new sign-ups</span>
                  )}
                </div>
              </article>
            </div>

            {/*
              Work waiting on a person, and only when there is some. A row of
              zeroes every morning teaches everyone to stop reading the strip,
              and then it is not there on the day it matters.
            */}
            {data.totals.toVerify > 0 || data.totals.awaitingPayment > 0 ? (
              <div className="attention">
                {data.totals.toVerify > 0 ? (
                  <Link to="/payments" className="attention-item is-warn">
                    <strong>{data.totals.toVerify}</strong>
                    <span>
                      payment{data.totals.toVerify === 1 ? '' : 's'} to check against your
                      statement
                    </span>
                  </Link>
                ) : null}
                {data.totals.awaitingPayment > 0 ? (
                  <Link to="/payments?tab=awaiting_payment" className="attention-item">
                    <strong>{data.totals.awaitingPayment}</strong>
                    <span>
                      order{data.totals.awaitingPayment === 1 ? '' : 's'} still awaiting
                      payment
                    </span>
                  </Link>
                ) : null}
              </div>
            ) : null}

            <div className="dash-grid">
              <section className="card dash-chart">
                <div className="card-head">
                  <div>
                    <h2>Revenue per day</h2>
                    <p className="card-sub">Paid orders, less cancellations and returns</p>
                  </div>
                  <strong className="card-figure">{formatMoney(data.totals.revenue)}</strong>
                </div>

                {/*
                  The chart is drawn either way. An empty one keeps its gridlines
                  and axis and simply has nothing in it, which reads as "nothing
                  sold yet"; a sentence in a large blank card reads as "this
                  failed to load".
                */}
                <div className="card-body chart-body">
                  <BarChart
                    points={data.series.map((point) => ({
                      label: shortDay(point.date),
                      value: point.revenue,
                      display: formatMoney({
                        amount: point.revenue,
                        currency: data.totals.revenue.currency,
                      }),
                    }))}
                  />
                </div>

                {data.totals.revenue.amount === 0 ? (
                  <p className="card-hint">
                    No paid orders in this window. Bars appear as payments are confirmed — a
                    bank transfer counts once you have checked it against your statement.
                  </p>
                ) : null}
              </section>

              <section className="card">
                <div className="card-head">
                  <div>
                    <h2>Orders by stage</h2>
                    <p className="card-sub">Where the work is sitting</p>
                  </div>
                </div>

                {statusSlices.length > 0 ? (
                  <div className="card-body">
                    <Donut data={statusSlices} caption="orders" />
                    <ul className="legend">
                      {statusSlices.map((slice) => (
                        <li key={slice.label} className="legend-item">
                          <span
                            className="legend-swatch"
                            style={{ background: slice.colour }}
                          />
                          <span className="legend-label">{slice.label}</span>
                          <span className="legend-value">{slice.value}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <Empty title="No orders in this period">
                    <span className="muted">Try a longer window.</span>
                  </Empty>
                )}
              </section>

              <section className="card">
                <div className="card-head">
                  <div>
                    <h2>Best sellers</h2>
                    <p className="card-sub">By units sold</p>
                  </div>
                  <Link to="/products" className="btn btn-sm">
                    Products
                  </Link>
                </div>

                {data.topProducts.length > 0 ? (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Product</th>
                          <th className="num">Sold</th>
                          <th className="num">Revenue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.topProducts.map((product) => (
                          <tr key={product.productId}>
                            <td>
                              {/* `title` carries the whole name, because the cell
                                  truncates and two similar SKUs need telling apart. */}
                              <span className="cell-name" title={product.name}>
                                {product.name}
                              </span>
                              <span className="cell-sub mono">{product.sku}</span>
                            </td>
                            <td className="num">{product.quantity}</td>
                            <td className="num">{formatMoney(product.revenue)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty title="Nothing sold in this period" />
                )}
              </section>

              <section className="card">
                <div className="card-head">
                  <div>
                    <h2>Running low</h2>
                    <p className="card-sub">Five or fewer left in a size</p>
                  </div>
                </div>

                {data.lowStock.length > 0 ? (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Variant</th>
                          <th className="num">Left</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.lowStock.map((entry) => (
                          <tr key={`${entry.productId}-${entry.size}-${entry.colour}`}>
                            <td>
                              <span className="cell-name" title={entry.name}>
                                {entry.name}
                              </span>
                              <span className="cell-sub">
                                {entry.size.toUpperCase()} · {entry.colour}
                              </span>
                            </td>
                            <td className="num">
                              <span className={entry.left <= 2 ? 'text-danger' : 'text-warn'}>
                                {entry.left}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty title="Nothing running low">
                    <span className="muted">Every enabled size has more than five.</span>
                  </Empty>
                )}
              </section>
            </div>

            <section className="card">
              <div className="card-head">
                <div>
                  <h2>Recent orders</h2>
                  <p className="card-sub">The last eight, newest first</p>
                </div>
                <Link to="/orders" className="btn btn-sm">
                  All orders
                </Link>
              </div>

              {isLoading && !data ? (
                <Loading rows={4} />
              ) : data.recentOrders.length > 0 ? (
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
                  <span className="muted">Orders will appear here as they come in.</span>
                </Empty>
              )}
            </section>
          </>
        )}
      </div>
    </>
  );
};
