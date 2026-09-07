import { money, type Money } from '@shop/shared';

import { OrderModel, type OrderDoc } from '../../models/order.model';
import { ProductModel } from '../../models/product.model';
import { CustomerModel } from '../../models/customer.model';
import { getSettings } from '../settings/settings.service';
import { toOrderView } from '../order/order.view';

/**
 * What the dashboard is actually asking.
 *
 * Not "how much money exists" but "how is the shop doing compared with last
 * week, and what needs me today". Every figure here is paired with either a
 * comparison or an action, because a number with neither is decoration that
 * takes up the best space on the screen.
 */

/** Orders that represent money the shop keeps. */
const EARNING = { status: { $nin: ['cancelled', 'returned'] }, paymentStatus: 'paid' };

const LOW_STOCK_AT = 5;

export interface DashboardSeriesPoint {
  /** `YYYY-MM-DD` in the shop's own timezone. */
  date: string;
  revenue: number;
  orders: number;
}

export interface DashboardView {
  windowDays: number;
  timezone: string;
  totals: {
    revenue: Money;
    revenueChangePercent: number | null;
    orders: number;
    ordersChangePercent: number | null;
    paidOrders: number;
    averageOrderValue: Money;
    customers: number;
    newCustomers: number;
    refunded: Money;
    awaitingPayment: number;
    toVerify: number;
  };
  series: DashboardSeriesPoint[];
  statusBreakdown: Array<{ status: string; count: number }>;
  topProducts: Array<{
    productId: string;
    name: string;
    sku: string;
    quantity: number;
    revenue: Money;
  }>;
  lowStock: Array<{ productId: string; name: string; size: string; colour: string; left: number }>;
  recentOrders: ReturnType<typeof toOrderView>[];
}

/**
 * Percentage change, or null when there is no honest one to give.
 *
 * A shop that took nothing last week and ₹40,000 this week has not grown by
 * "infinity per cent" — it has no comparison, and printing one is worse than
 * printing none. The caller renders null as "no comparison" rather than 0%,
 * which would read as flat.
 */
const changePercent = (current: number, previous: number): number | null => {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
};

/**
 * Every day in the window, including the ones nothing happened on.
 *
 * A chart drawn only from days that have orders silently compresses a quiet
 * week into a narrow bar and reads as busier than it was. The gaps are the
 * information.
 */
const emptySeries = (days: number, timezone: string): Map<string, DashboardSeriesPoint> => {
  const out = new Map<string, DashboardSeriesPoint>();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  for (let back = days - 1; back >= 0; back -= 1) {
    const date = formatter.format(new Date(Date.now() - back * 86_400_000));
    out.set(date, { date, revenue: 0, orders: 0 });
  }
  return out;
};

export const buildDashboard = async (windowDays: number): Promise<DashboardView> => {
  const settings = await getSettings();
  const timezone = settings.timezone;
  const currency = settings.currency;

  const now = Date.now();
  const since = new Date(now - windowDays * 86_400_000);
  // The window immediately before this one, the same length, so "vs previous
  // 30d" compares like with like rather than against all of history.
  const previousSince = new Date(now - windowDays * 2 * 86_400_000);

  const [
    current,
    previous,
    daily,
    statuses,
    top,
    low,
    customers,
    newCustomers,
    refunded,
    queues,
    recent,
  ] = await Promise.all([
    OrderModel.aggregate<{ revenue: number; orders: number; paid: number }>([
      { $match: { placedAt: { $gte: since } } },
      {
        $group: {
          _id: null,
          orders: { $sum: 1 },
          revenue: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$paymentStatus', 'paid'] }, { $not: [{ $in: ['$status', ['cancelled', 'returned']] }] }] },
                '$totals.grandTotal.amount',
                0,
              ],
            },
          },
          paid: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, 1, 0] } },
        },
      },
    ]),

    OrderModel.aggregate<{ revenue: number; orders: number }>([
      { $match: { placedAt: { $gte: previousSince, $lt: since } } },
      {
        $group: {
          _id: null,
          orders: { $sum: 1 },
          revenue: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$paymentStatus', 'paid'] }, { $not: [{ $in: ['$status', ['cancelled', 'returned']] }] }] },
                '$totals.grandTotal.amount',
                0,
              ],
            },
          },
        },
      },
    ]),

    /**
     * Daily buckets, in the SHOP's timezone rather than the server's.
     *
     * `$dateToString` takes the zone, so an order placed at 00:30 in Mumbai
     * lands on the day the shopkeeper would call it — not the previous one,
     * which is what a UTC bucket gives an Indian shop every night.
     */
    OrderModel.aggregate<{ _id: string; revenue: number; orders: number }>([
      { $match: { placedAt: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$placedAt', timezone } },
          orders: { $sum: 1 },
          revenue: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$paymentStatus', 'paid'] }, { $not: [{ $in: ['$status', ['cancelled', 'returned']] }] }] },
                '$totals.grandTotal.amount',
                0,
              ],
            },
          },
        },
      },
    ]),

    OrderModel.aggregate<{ _id: string; count: number }>([
      { $match: { placedAt: { $gte: since } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),

    // Best sellers by units, over lines of orders that actually earned money.
    OrderModel.aggregate<{
      _id: string;
      name: string;
      sku: string;
      quantity: number;
      revenue: number;
    }>([
      { $match: { placedAt: { $gte: since }, ...EARNING } },
      { $unwind: '$lines' },
      {
        $group: {
          _id: '$lines.productId',
          name: { $first: '$lines.name' },
          sku: { $first: '$lines.sku' },
          quantity: { $sum: '$lines.quantity' },
          revenue: { $sum: '$lines.lineTotal.amount' },
        },
      },
      // `_id` breaks the tie so two products with equal sales keep a stable
      // order between requests instead of swapping places on every refresh.
      { $sort: { quantity: -1, _id: 1 } },
      { $limit: 6 },
    ]),

    /**
     * Running low, per VARIANT.
     *
     * The stat tile counts products, because a merchant restocks a product. This
     * list names sizes, because that is what they have to order — "Oxford shirt
     * is low" is not something anyone can act on.
     */
    ProductModel.aggregate<{
      productId: string;
      name: string;
      size: string;
      colour: string;
      left: number;
    }>([
      { $match: { status: 'active' } },
      { $unwind: '$variants' },
      {
        $match: {
          'variants.isEnabled': true,
          'variants.stockQuantity': { $gt: 0, $lte: LOW_STOCK_AT },
        },
      },
      {
        $project: {
          _id: 0,
          productId: '$_id',
          name: 1,
          size: '$variants.size',
          colour: '$variants.colour',
          left: '$variants.stockQuantity',
        },
      },
      { $sort: { left: 1, name: 1 } },
      { $limit: 8 },
    ]),

    CustomerModel.countDocuments(),
    CustomerModel.countDocuments({ createdAt: { $gte: since } }),

    OrderModel.aggregate<{ total: number }>([
      { $match: { placedAt: { $gte: since }, paymentStatus: 'refunded' } },
      { $group: { _id: null, total: { $sum: '$totals.grandTotal.amount' } } },
    ]),

    // The two queues someone has to act on, counted here so the sidebar and the
    // dashboard cannot disagree about how much work is waiting.
    OrderModel.aggregate<{ _id: string; count: number }>([
      { $match: { paymentStatus: { $in: ['awaiting_payment', 'verifying'] } } },
      { $group: { _id: '$paymentStatus', count: { $sum: 1 } } },
    ]),

    OrderModel.find().sort({ placedAt: -1, _id: 1 }).limit(8).lean(),
  ]);

  const revenue = current[0]?.revenue ?? 0;
  const orders = current[0]?.orders ?? 0;
  const paidOrders = current[0]?.paid ?? 0;

  const series = emptySeries(windowDays, timezone);
  for (const row of daily) {
    const bucket = series.get(row._id);
    if (bucket) {
      bucket.revenue = row.revenue;
      bucket.orders = row.orders;
    }
  }

  const queueBy = new Map(queues.map((row) => [row._id, row.count]));

  return {
    windowDays,
    timezone,
    totals: {
      revenue: money(revenue, currency),
      revenueChangePercent: changePercent(revenue, previous[0]?.revenue ?? 0),
      orders,
      ordersChangePercent: changePercent(orders, previous[0]?.orders ?? 0),
      paidOrders,
      // Averaged over PAID orders only. Dividing by every order placed drags
      // the figure down with abandoned ones and stops it meaning anything.
      averageOrderValue: money(paidOrders > 0 ? Math.round(revenue / paidOrders) : 0, currency),
      customers,
      newCustomers,
      refunded: money(refunded[0]?.total ?? 0, currency),
      awaitingPayment: queueBy.get('awaiting_payment') ?? 0,
      toVerify: queueBy.get('verifying') ?? 0,
    },
    series: [...series.values()],
    statusBreakdown: statuses.map((row) => ({ status: row._id, count: row.count })),
    topProducts: top.map((row) => ({
      productId: row._id,
      name: row.name,
      sku: row.sku,
      quantity: row.quantity,
      revenue: money(row.revenue, currency),
    })),
    lowStock: low,
    recentOrders: (recent as OrderDoc[]).map(toOrderView),
  };
};
