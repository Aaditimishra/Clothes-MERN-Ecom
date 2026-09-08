import { Router, type Response } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { newId, slugify, PAYMENT_STATUSES, type OrderStatus } from '@shop/shared';
import { z } from 'zod';

import { ApiError } from '../../lib/api-error';
import { asyncHandler } from '../../lib/async-handler';
import { parseBody, parseQuery } from '../../lib/validate';
import { requirePermission, requireStaff, staffOf } from '../../middleware/require-staff';
import { CategoryModel } from '../../models/category.model';
import { CouponModel } from '../../models/coupon.model';
import { CustomerModel } from '../../models/customer.model';
import { OrderModel, type OrderDoc } from '../../models/order.model';
import { ProductModel, type ProductDoc } from '../../models/product.model';
import { ReviewModel } from '../../models/review.model';
import { SizeChartModel } from '../../models/size-chart.model';
import { toSizeChartView } from '../catalog/size-chart.service';
import { deletePage, listPages, savePage } from '../content/content.service';
import { deletePost, listAllPosts, savePost } from '../content/journal.service';
import { BLOCK_TYPES } from '../../models/page.model';
import { toOrderView } from '../order/order.view';
import { applyStatusChangeToStock } from '../order/stock.service';
import { buildDashboard } from './dashboard.service';
import { paginate } from '../../lib/paginate';
import {
  rejectManualPayment,
  verifyManualPayment,
} from '../payment/payment.service';
import { deleteMedia, listMedia, mediaUsage, updateMedia, uploadImage } from '../media/media.service';
import { env } from '../../config/env';
import { completePasswordReset, requestPasswordReset } from '../auth/reset.service';
import { getSettings, saveSettings } from '../settings/settings.service';
import {
  listEmails,
  listNotifications,
  markNotificationsRead,
  onOrderStatusChanged,
} from '../notification/notification.service';
import { exportCustomers, exportOrders, exportProducts } from './export.service';
import { isoDay } from '../../lib/csv';
import {
  createTerm,
  deactivateTerm,
  listAllTerms,
  reorderTerms,
  updateTerm,
} from '../taxonomy/taxonomy.service';
import {
  applyPriceToAllVariants,
  archiveProduct,
  createProduct,
  setProductStatus,
  updateProduct,
  updateVariant,
} from './product.admin.service';
import {
  categorySchema,
  couponSchema,
  orderPatchSchema,
  pageQuerySchema,
  productSchema,
  settingsSchema,
  signInSchema,
  sizeChartSchema,
  staffPatchSchema,
  staffSchema,
  taxonomyPatchSchema,
  taxonomyTermSchema,
  variantPatchSchema,
} from './admin.schemas';
import {
  ALL_PERMISSIONS,
  changeOwnPassword,
  changeStaffPassword,
  createStaff,
  listStaff,
  ROLE_NAMES,
  signInStaff,
  updateOwnProfile,
  updateStaff,
} from './staff.service';

const idParam = z.string().trim().min(1).max(64);

/**
 * Uploads are held in memory, not written to a temp file.
 *
 * Sharp re-encodes the buffer immediately and only the result is persisted, so
 * a temp file would be written and deleted for nothing. The 12 MB cap is what
 * makes this safe: without it, memory storage is a denial-of-service waiting to
 * be found.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  // 50 MB covers a short product video; images are re-encoded far below it.
  // Without a cap, memory storage is a denial-of-service waiting to be found.
  limits: { fileSize: 50 * 1024 * 1024, files: 1 },
});

/** Credential routes get their own, far tighter limit than the global one. */
const credentialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: { code: 'too_many_requests', message: 'Too many attempts. Try again shortly.' },
  },
});

export const adminRouter: Router = Router();

/* ----------------------------- authentication ---------------------------- */

adminRouter.post(
  '/auth/sign-in',
  asyncHandler(async (req, res) => {
    const body = parseBody(req, signInSchema);
    res.json(await signInStaff(body.email, body.password));
  }),
);

/**
 * Reset is public, and always answers the same way.
 *
 * Placed above the auth middleware because someone who has forgotten their
 * password cannot, by definition, be signed in.
 */
adminRouter.post(
  '/auth/forgot-password',
  credentialLimiter,
  asyncHandler(async (req, res) => {
    const { email } = parseBody(
      req,
      z.object({ email: z.string().trim().toLowerCase().email('Enter a valid email address') }),
    );

    const origin = req.headers.origin;
    const base =
      typeof origin === 'string' && env.corsOrigins.includes(origin)
        ? origin
        : env.corsOrigins[0] ?? '';

    await requestPasswordReset('staff', email, `${base}/reset-password`);
    res.status(202).json({ message: 'If that email has an account, a reset link is on its way.' });
  }),
);

adminRouter.post(
  '/auth/reset-password',
  credentialLimiter,
  asyncHandler(async (req, res) => {
    const body = parseBody(
      req,
      z.object({
        token: z.string().trim().min(1),
        password: z.string().min(12, 'Use at least 12 characters').max(200),
      }),
    );

    await completePasswordReset('staff', body.token, body.password);
    res.status(204).end();
  }),
);

// Everything past this point requires a valid staff token.
adminRouter.use(requireStaff);

/* --------------------------------- profile ------------------------------- */

adminRouter.put(
  '/auth/profile',
  asyncHandler(async (req, res) => {
    const { name } = parseBody(
      req,
      z.object({ name: z.string().trim().min(1, 'Enter your name').max(120) }),
    );
    res.json(await updateOwnProfile(staffOf(req).id, { name }));
  }),
);

adminRouter.put(
  '/auth/password',
  asyncHandler(async (req, res) => {
    const body = parseBody(
      req,
      z.object({
        currentPassword: z.string().min(1, 'Enter your current password'),
        newPassword: z.string().min(12, 'Use at least 12 characters').max(200),
      }),
    );

    await changeOwnPassword(staffOf(req).id, body.currentPassword, body.newPassword);
    res.status(204).end();
  }),
);

adminRouter.get(
  '/auth/me',
  asyncHandler(async (req, res) => {
    res.json({
      staff: staffOf(req),
      // Shipped with the session so the admin can hide what this user cannot do,
      // rather than showing buttons that will fail on click.
      catalogue: { permissions: ALL_PERMISSIONS, roles: ROLE_NAMES },
    });
  }),
);

/* -------------------------------- dashboard ------------------------------ */

adminRouter.get(
  '/dashboard',
  requirePermission('order.view'),
  asyncHandler(async (req, res) => {
    /**
     * The window is a parameter, not a constant.
     *
     * "Last 30 days" answers a different question from "last 7": one is how the
     * season is going, the other is whether something broke on Tuesday. The
     * panel offers both, so the figures have to be able to follow.
     */
    const { days } = parseQuery(
      req,
      z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }),
    );

    res.json(await buildDashboard(days));
  }),
);

/* --------------------------------- products ------------------------------ */

adminRouter.get(
  '/products',
  requirePermission('catalog.view'),
  asyncHandler(async (req, res) => {
    const query = parseQuery(req, pageQuerySchema);

    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = query.status;
    if (query.search) filter.$text = { $search: query.search };

    const [items, total] = await Promise.all([
      ProductModel.find(filter)
        .sort({ updatedAt: -1, _id: 1 })
        .skip((query.page - 1) * query.pageSize)
        .limit(query.pageSize)
        .lean(),
      ProductModel.countDocuments(filter),
    ]);

    res.json({
      items: (items as ProductDoc[]).map(toAdminProductSummary),
      total,
      page: query.page,
      pageSize: query.pageSize,
      pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
    });
  }),
);

adminRouter.get(
  '/products/:id',
  requirePermission('catalog.view'),
  asyncHandler(async (req, res) => {
    const product = await ProductModel.findById(idParam.parse(req.params.id)).lean();
    if (!product) throw ApiError.notFound('No such product');
    res.json(toAdminProductDetail(product as ProductDoc));
  }),
);

adminRouter.post(
  '/products',
  requirePermission('catalog.manage'),
  asyncHandler(async (req, res) => {
    const created = await createProduct(parseBody(req, productSchema));
    res.status(201).json(toAdminProductDetail(created));
  }),
);

adminRouter.put(
  '/products/:id',
  requirePermission('catalog.manage'),
  asyncHandler(async (req, res) => {
    const updated = await updateProduct(idParam.parse(req.params.id), parseBody(req, productSchema));
    res.json(toAdminProductDetail(updated));
  }),
);

adminRouter.patch(
  '/products/:id/status',
  requirePermission('catalog.manage'),
  asyncHandler(async (req, res) => {
    const { status } = parseBody(req, z.object({ status: z.enum(['draft', 'active', 'archived']) }));
    res.json(toAdminProductDetail(await setProductStatus(idParam.parse(req.params.id), status)));
  }),
);

adminRouter.patch(
  '/products/:id/variants/:variantId',
  requirePermission('inventory.manage'),
  asyncHandler(async (req, res) => {
    const updated = await updateVariant(
      idParam.parse(req.params.id),
      idParam.parse(req.params.variantId),
      parseBody(req, variantPatchSchema),
    );
    res.json(toAdminProductDetail(updated));
  }),
);

adminRouter.post(
  '/products/:id/apply-price',
  requirePermission('catalog.manage'),
  asyncHandler(async (req, res) => {
    const body = parseBody(
      req,
      z.object({
        price: z.coerce.number().int().min(0),
        compareAtPrice: z.coerce.number().int().min(0).nullish(),
      }),
    );

    const updated = await applyPriceToAllVariants(
      idParam.parse(req.params.id),
      body.price,
      body.compareAtPrice ?? null,
    );

    res.json(toAdminProductDetail(updated));
  }),
);

adminRouter.delete(
  '/products/:id',
  requirePermission('catalog.manage'),
  asyncHandler(async (req, res) => {
    await archiveProduct(idParam.parse(req.params.id));
    res.status(204).end();
  }),
);

/* -------------------------------- categories ----------------------------- */

adminRouter.get(
  '/categories',
  requirePermission('catalog.view'),
  asyncHandler(async (_req, res) => {
    const categories = await CategoryModel.find().sort({ position: 1, name: 1 }).lean();
    res.json(
      categories.map((category) => ({
        id: category._id,
        slug: category.slug,
        name: category.name,
        description: category.description ?? null,
        department: category.department ?? null,
        parentId: category.parentId ?? null,
        path: category.path,
        position: category.position ?? 0,
        imageUrl: category.imageUrl ?? null,
        isVisible: category.isVisible ?? true,
      })),
    );
  }),
);

/**
 * Recomputes the materialised path from the parent.
 *
 * The path is what makes "everything under Women" a single indexed query, so it
 * has to stay correct on every write. Deriving it here — rather than trusting
 * the client to send it — means it cannot be wrong.
 */
const pathFor = async (parentId: string | null): Promise<string[]> => {
  if (!parentId) return [];
  const parent = await CategoryModel.findById(parentId).lean();
  if (!parent) throw ApiError.badRequest('That parent category does not exist', { parentId: 'Unknown' });
  return [...parent.path, parent._id];
};

adminRouter.post(
  '/categories',
  requirePermission('category.manage'),
  asyncHandler(async (req, res) => {
    const body = parseBody(req, categorySchema);
    const slug = slugify(body.slug ?? body.name);

    if (await CategoryModel.exists({ slug })) {
      throw ApiError.conflict(`'${slug}' is already in use`, { slug: 'Already in use' });
    }

    const created = await CategoryModel.create({
      _id: newId('cat'),
      slug,
      name: body.name,
      description: body.description,
      department: body.department,
      parentId: body.parentId,
      path: await pathFor(body.parentId),
      position: body.position ?? 0,
      imageUrl: body.imageUrl,
      isVisible: body.isVisible ?? true,
    });

    res.status(201).json({ id: created._id, slug: created.slug });
  }),
);

adminRouter.put(
  '/categories/:id',
  requirePermission('category.manage'),
  asyncHandler(async (req, res) => {
    const id = idParam.parse(req.params.id);
    const body = parseBody(req, categorySchema);

    if (body.parentId === id) {
      throw ApiError.badRequest('A category cannot be its own parent', { parentId: 'Invalid' });
    }

    const path = await pathFor(body.parentId);
    if (path.includes(id)) {
      // Moving a category under its own descendant would make the tree a cycle,
      // and every path query would then recurse forever.
      throw ApiError.badRequest('That would move the category inside itself', {
        parentId: 'Invalid',
      });
    }

    const updated = await CategoryModel.findByIdAndUpdate(
      id,
      {
        $set: {
          slug: slugify(body.slug ?? body.name),
          name: body.name,
          description: body.description,
          department: body.department,
          parentId: body.parentId,
          path,
          position: body.position ?? 0,
          imageUrl: body.imageUrl,
          isVisible: body.isVisible ?? true,
        },
      },
      { new: true },
    ).lean();

    if (!updated) throw ApiError.notFound('No such category');

    // Descendants inherit the move, so their paths are rebuilt too — otherwise
    // they would still claim to sit under the old ancestor.
    const descendants = await CategoryModel.find({ path: id }).lean();
    await Promise.all(
      descendants.map(async (child) =>
        CategoryModel.updateOne(
          { _id: child._id },
          { $set: { path: [...path, id, ...child.path.slice(child.path.indexOf(id) + 1)] } },
        ),
      ),
    );

    res.json({ id: updated._id, slug: updated.slug });
  }),
);

adminRouter.delete(
  '/categories/:id',
  requirePermission('category.manage'),
  asyncHandler(async (req, res) => {
    const id = idParam.parse(req.params.id);

    const [childCount, productCount] = await Promise.all([
      CategoryModel.countDocuments({ parentId: id }),
      ProductModel.countDocuments({ categoryIds: id }),
    ]);

    if (childCount > 0 || productCount > 0) {
      throw ApiError.conflict(
        `Still in use by ${productCount} product(s) and ${childCount} subcategory(ies)`,
      );
    }

    await CategoryModel.deleteOne({ _id: id });
    res.status(204).end();
  }),
);

/* --------------------------------- taxonomy ------------------------------ */

adminRouter.get(
  '/taxonomy',
  requirePermission('catalog.view'),
  asyncHandler(async (req, res) => {
    const query = parseQuery(req, pageQuerySchema.extend({ group: z.string().optional() }));
    res.json(await listAllTerms(query.group as never, query));
  }),
);

adminRouter.post(
  '/taxonomy',
  requirePermission('taxonomy.manage'),
  asyncHandler(async (req, res) => {
    res.status(201).json(await createTerm(parseBody(req, taxonomyTermSchema)));
  }),
);

adminRouter.put(
  '/taxonomy/:id',
  requirePermission('taxonomy.manage'),
  asyncHandler(async (req, res) => {
    res.json(await updateTerm(idParam.parse(req.params.id), parseBody(req, taxonomyPatchSchema)));
  }),
);

adminRouter.post(
  '/taxonomy/reorder',
  requirePermission('taxonomy.manage'),
  asyncHandler(async (req, res) => {
    const body = parseBody(
      req,
      z.object({
        order: z.array(z.object({ id: idParam, position: z.coerce.number().int().min(0) })),
      }),
    );
    await reorderTerms(body.order);
    res.status(204).end();
  }),
);

adminRouter.delete(
  '/taxonomy/:id',
  requirePermission('taxonomy.manage'),
  asyncHandler(async (req, res) => {
    res.json(await deactivateTerm(idParam.parse(req.params.id)));
  }),
);

/* ------------------------------- size charts ----------------------------- */

adminRouter.get(
  '/size-charts',
  requirePermission('catalog.view'),
  asyncHandler(async (req, res) => {
    const query = parseQuery(req, pageQuerySchema);

    res.json(
      await paginate(SizeChartModel, {
        ...(query.search ? { filter: { name: { $regex: query.search, $options: 'i' } } } : {}),
        sort: { name: 1, _id: 1 },
        query,
        map: (chart) => toSizeChartView(chart as never),
      }),
    );
  }),
);

adminRouter.post(
  '/size-charts',
  requirePermission('catalog.manage'),
  asyncHandler(async (req, res) => {
    const body = parseBody(req, sizeChartSchema);
    const created = await SizeChartModel.create({ _id: newId('szc'), ...body });
    res.status(201).json(toSizeChartView(created.toObject() as never));
  }),
);

adminRouter.put(
  '/size-charts/:id',
  requirePermission('catalog.manage'),
  asyncHandler(async (req, res) => {
    const updated = await SizeChartModel.findByIdAndUpdate(
      idParam.parse(req.params.id),
      { $set: parseBody(req, sizeChartSchema) },
      { new: true },
    ).lean();

    if (!updated) throw ApiError.notFound('No such size chart');
    res.json(toSizeChartView(updated as never));
  }),
);

adminRouter.delete(
  '/size-charts/:id',
  requirePermission('catalog.manage'),
  asyncHandler(async (req, res) => {
    const id = idParam.parse(req.params.id);
    const inUse = await ProductModel.countDocuments({ sizeChartId: id });

    if (inUse > 0) {
      throw ApiError.conflict(`Still assigned to ${inUse} product(s)`);
    }

    await SizeChartModel.deleteOne({ _id: id });
    res.status(204).end();
  }),
);

/* ---------------------------------- media -------------------------------- */

adminRouter.get(
  '/media',
  requirePermission('catalog.view'),
  asyncHandler(async (req, res) => {
    const query = parseQuery(req, pageQuerySchema);
    res.json(
      await listMedia({
        page: query.page,
        pageSize: query.pageSize,
        ...(query.search ? { search: query.search } : {}),
      }),
    );
  }),
);

adminRouter.post(
  '/media',
  requirePermission('media.manage'),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw ApiError.badRequest('Choose a file to upload', { file: 'Required' });
    res.status(201).json(await uploadImage(req.file));
  }),
);

adminRouter.put(
  '/media/:id',
  requirePermission('media.manage'),
  asyncHandler(async (req, res) => {
    const body = parseBody(
      req,
      z.object({
        alt: z.string().trim().max(300).optional(),
        tags: z.array(z.string().trim().toLowerCase().max(40)).max(20).optional(),
        posterMediaId: z.string().trim().max(64).nullish(),
      }),
    );
    res.json(await updateMedia(idParam.parse(req.params.id), body));
  }),
);

adminRouter.get(
  '/media/:id/usage',
  requirePermission('catalog.view'),
  asyncHandler(async (req, res) => {
    res.json(await mediaUsage(idParam.parse(req.params.id)));
  }),
);

adminRouter.delete(
  '/media/:id',
  requirePermission('media.manage'),
  asyncHandler(async (req, res) => {
    const { force } = parseQuery(req, z.object({ force: z.coerce.boolean().default(false) }));
    await deleteMedia(idParam.parse(req.params.id), force);
    res.status(204).end();
  }),
);

/* --------------------------------- orders -------------------------------- */

adminRouter.get(
  '/orders',
  requirePermission('order.view'),
  asyncHandler(async (req, res) => {
    const query = parseQuery(req, pageQuerySchema);

    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = query.status;
    if (query.search) {
      filter.$or = [
        { reference: query.search.toUpperCase() },
        { email: { $regex: query.search, $options: 'i' } },
      ];
    }

    const [items, total] = await Promise.all([
      OrderModel.find(filter)
        .sort({ placedAt: -1, _id: 1 })
        .skip((query.page - 1) * query.pageSize)
        .limit(query.pageSize)
        .lean(),
      OrderModel.countDocuments(filter),
    ]);

    res.json({
      items: (items as OrderDoc[]).map(toOrderView),
      total,
      page: query.page,
      pageSize: query.pageSize,
      pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
    });
  }),
);

adminRouter.patch(
  '/orders/:id',
  requirePermission('order.manage'),
  asyncHandler(async (req, res) => {
    const body = parseBody(req, orderPatchSchema);

    const id = idParam.parse(req.params.id);
    const before = await OrderModel.findById(id).lean();
    if (!before) throw ApiError.notFound('No such order');

    // `restock` is an instruction, not a column. Stripped before the update so
    // it cannot be written onto the order as a stray field.
    const { restock, ...patch } = body;

    const updated = await OrderModel.findByIdAndUpdate(id, { $set: patch }, { new: true }).lean();
    if (!updated) throw ApiError.notFound('No such order');

    const isTransition = Boolean(body.status) && before.status !== updated.status;

    /**
     * Ending an order gives its stock back.
     *
     * This ran nowhere before: cancelling an order left its units reserved for
     * good, so a cancelled order for three shirts took three shirts off sale
     * permanently. Nothing failed and nothing was logged — the number was simply
     * wrong, and stayed wrong until somebody counted the shelf.
     *
     * Awaited rather than fired off, because the response carries the order and
     * the client refreshes stock from it. Releasing after the reply would show
     * the merchant the old number and make a correct release look like a
     * no-op they should try again.
     */
    let released = false;
    if (isTransition) {
      released = await applyStatusChangeToStock({
        order: updated as OrderDoc,
        from: before.status as OrderStatus,
        to: updated.status as OrderStatus,
        ...(restock === undefined ? {} : { restock }),
      });
    }

    const view = toOrderView(
      released
        ? ((await OrderModel.findById(id).lean()) as OrderDoc)
        : (updated as OrderDoc),
    );

    // Only a real status transition emails the shopper. Saving a tracking number
    // must not send "your order has shipped" a second time.
    if (isTransition) {
      void onOrderStatusChanged(view, (updated as OrderDoc).email);
    }

    res.json(view);
  }),
);

/* -------------------------------- activity ------------------------------- */

/**
 * What is waiting, in one small request.
 *
 * Polled every twenty seconds by an open panel so it can raise a desktop
 * notification the moment an order lands. Deliberately five numbers and a
 * reference rather than a page of orders: this runs three times a minute per
 * open tab, and it exists to answer "has anything changed" — the screens
 * already know how to show what did.
 *
 * Gated on `order.view` like the queues it counts, so a support account does
 * not get told about work it cannot see.
 */
adminRouter.get(
  '/activity',
  requirePermission('order.view'),
  asyncHandler(async (_req, res) => {
    const [queues, latest, unmoderated] = await Promise.all([
      OrderModel.aggregate<{ _id: string; count: number }>([
        { $match: { paymentStatus: { $in: ['awaiting_payment', 'verifying'] } } },
        { $group: { _id: '$paymentStatus', count: { $sum: 1 } } },
      ]),
      // Newest first, on the same index the orders list uses.
      OrderModel.findOne().sort({ placedAt: -1, _id: 1 }).select('reference placedAt').lean(),
      // Orders that still need packing — what "new" means to whoever is working.
      OrderModel.countDocuments({ status: { $in: ['pending', 'confirmed'] } }),
    ]);

    const by = new Map(queues.map((row) => [row._id, row.count]));

    res.json({
      toPack: unmoderated,
      awaitingPayment: by.get('awaiting_payment') ?? 0,
      toVerify: by.get('verifying') ?? 0,
      latestOrderReference: latest?.reference ?? null,
      latestOrderAt: latest?.placedAt?.toISOString() ?? null,
    });
  }),
);

/* -------------------------------- payments ------------------------------- */

/**
 * The payment queue: what is waiting on a human.
 *
 * Defaults to `verifying` — the shoppers who say they have paid and are waiting
 * on the shop to look — because that is the only state where someone is blocked
 * on staff action. The other states are reachable by filter for reconciliation.
 */
adminRouter.get(
  '/payments',
  requirePermission('order.view'),
  asyncHandler(async (req, res) => {
    const query = parseQuery(
      req,
      pageQuerySchema.extend({
        paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
      }),
    );

    const filter: Record<string, unknown> = {
      paymentStatus: query.paymentStatus ?? 'verifying',
    };

    if (query.search) {
      filter.$or = [
        { reference: query.search.toUpperCase() },
        { email: { $regex: query.search, $options: 'i' } },
        { 'payment.reference': query.search.toUpperCase() },
      ];
    }

    const [items, total, counts] = await Promise.all([
      OrderModel.find(filter)
        .sort({ 'payment.claimedAt': -1, placedAt: -1, _id: 1 })
        .skip((query.page - 1) * query.pageSize)
        .limit(query.pageSize)
        .lean(),
      OrderModel.countDocuments(filter),
      // One grouped count rather than a query per tab: the tab bar needs every
      // number on every render, and five round trips to draw five badges is
      // five chances for them to disagree with each other.
      OrderModel.aggregate<{ _id: string; count: number }>([
        { $group: { _id: '$paymentStatus', count: { $sum: 1 } } },
      ]),
    ]);

    res.json({
      items: (items as OrderDoc[]).map(toOrderView),
      total,
      page: query.page,
      pageSize: query.pageSize,
      pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
      counts: Object.fromEntries(counts.map((row) => [row._id, row.count])),
    });
  }),
);

/**
 * "I have found this money on the statement."
 *
 * Gated on `payment.verify` rather than `order.manage`: declaring a transfer
 * received is the one action in this panel that cannot be undone by editing a
 * field back, and it must not come free with the permission to type a tracking
 * number.
 */
adminRouter.post(
  '/payments/:id/verify',
  requirePermission('payment.verify'),
  asyncHandler(async (req, res) => {
    const staff = staffOf(req);
    res.json(
      await verifyManualPayment({
        orderId: idParam.parse(req.params.id),
        staffName: staff.name,
      }),
    );
  }),
);

/**
 * The money was not there. The claim goes back with a reason the shopper reads.
 *
 * A reason is required rather than optional. "Rejected" with no explanation
 * produces a support call every single time, and the person rejecting it is the
 * one who knows why.
 */
adminRouter.post(
  '/payments/:id/reject',
  requirePermission('payment.verify'),
  asyncHandler(async (req, res) => {
    const staff = staffOf(req);
    const body = parseBody(
      req,
      z.object({
        reason: z
          .string()
          .trim()
          .min(4, 'Say what was wrong, so the shopper can fix it')
          .max(280),
      }),
    );

    res.json(
      await rejectManualPayment({
        orderId: idParam.parse(req.params.id),
        reason: body.reason,
        staffName: staff.name,
      }),
    );
  }),
);

/* -------------------------------- customers ------------------------------ */

adminRouter.get(
  '/customers',
  requirePermission('customer.view'),
  asyncHandler(async (req, res) => {
    const query = parseQuery(req, pageQuerySchema);

    const filter = query.search
      ? {
          $or: [
            { email: { $regex: query.search, $options: 'i' } },
            { firstName: { $regex: query.search, $options: 'i' } },
            { lastName: { $regex: query.search, $options: 'i' } },
          ],
        }
      : {};

    const [items, total] = await Promise.all([
      CustomerModel.find(filter)
        .sort({ createdAt: -1, _id: 1 })
        .skip((query.page - 1) * query.pageSize)
        .limit(query.pageSize)
        .lean(),
      CustomerModel.countDocuments(filter),
    ]);

    res.json({
      items: items.map((customer) => ({
        id: customer._id,
        email: customer.email,
        name: `${customer.firstName} ${customer.lastName}`,
        phone: customer.phone ?? null,
        addressCount: customer.addresses.length,
        wishlistCount: customer.wishlist.length,
        createdAt: (customer.createdAt ?? new Date()).toISOString(),
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
      pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
    });
  }),
);

/* --------------------------------- coupons ------------------------------- */

adminRouter.get(
  '/coupons',
  requirePermission('promotion.manage'),
  asyncHandler(async (req, res) => {
    const query = parseQuery(req, pageQuerySchema);

    res.json(
      await paginate(CouponModel, {
        ...(query.search
          ? { filter: { code: { $regex: query.search.toUpperCase(), $options: 'i' } } }
          : {}),
        sort: { createdAt: -1, _id: 1 },
        query,
        map: (coupon) => ({
          id: coupon._id,
          code: coupon.code,
          description: coupon.description,
          type: coupon.type,
          percentage: coupon.percentage ?? null,
          amountOff: coupon.amountOff ?? null,
          maxDiscount: coupon.maxDiscount ?? null,
          minSpend: coupon.minSpend ?? null,
          isActive: coupon.isActive ?? true,
          startsAt: coupon.startsAt?.toISOString() ?? null,
          endsAt: coupon.endsAt?.toISOString() ?? null,
          usageLimit: coupon.usageLimit ?? null,
          usageCount: coupon.usageCount ?? 0,
        }),
      }),
    );
  }),
);

const toCouponDoc = (body: z.infer<typeof couponSchema>) => ({
  code: body.code,
  description: body.description,
  type: body.type,
  percentage: body.percentage ?? null,
  amountOff: body.amountOff != null ? { amount: body.amountOff, currency: 'INR' } : null,
  maxDiscount: body.maxDiscount != null ? { amount: body.maxDiscount, currency: 'INR' } : null,
  minSpend: body.minSpend != null ? { amount: body.minSpend, currency: 'INR' } : null,
  isActive: body.isActive ?? true,
  startsAt: body.startsAt ?? null,
  endsAt: body.endsAt ?? null,
  usageLimit: body.usageLimit ?? null,
});

adminRouter.post(
  '/coupons',
  requirePermission('promotion.manage'),
  asyncHandler(async (req, res) => {
    const body = parseBody(req, couponSchema);

    if (await CouponModel.exists({ code: body.code })) {
      throw ApiError.conflict(`'${body.code}' already exists`, { code: 'Already in use' });
    }

    const created = await CouponModel.create({ _id: newId('cpn'), ...toCouponDoc(body) });
    res.status(201).json({ id: created._id, code: created.code });
  }),
);

adminRouter.put(
  '/coupons/:id',
  requirePermission('promotion.manage'),
  asyncHandler(async (req, res) => {
    const body = parseBody(req, couponSchema);

    const updated = await CouponModel.findByIdAndUpdate(
      idParam.parse(req.params.id),
      // `usageCount` is deliberately absent: it is a ledger of what has already
      // been redeemed, and editing a coupon must not reset it.
      { $set: toCouponDoc(body) },
      { new: true },
    ).lean();

    if (!updated) throw ApiError.notFound('No such coupon');
    res.json({ id: updated._id, code: updated.code });
  }),
);

adminRouter.delete(
  '/coupons/:id',
  requirePermission('promotion.manage'),
  asyncHandler(async (req, res) => {
    await CouponModel.deleteOne({ _id: idParam.parse(req.params.id) });
    res.status(204).end();
  }),
);

/* --------------------------------- reviews ------------------------------- */

adminRouter.get(
  '/reviews',
  requirePermission('review.moderate'),
  asyncHandler(async (req, res) => {
    const query = parseQuery(req, pageQuerySchema);

    const [items, total] = await Promise.all([
      ReviewModel.find()
        .sort({ createdAt: -1, _id: 1 })
        .skip((query.page - 1) * query.pageSize)
        .limit(query.pageSize)
        .lean(),
      ReviewModel.countDocuments(),
    ]);

    const products = await ProductModel.find({
      _id: { $in: items.map((review) => review.productId) },
    })
      .select('name slug')
      .lean();

    const byId = new Map(products.map((product) => [product._id, product]));

    res.json({
      items: items.map((review) => ({
        id: review._id,
        productId: review.productId,
        productName: byId.get(review.productId)?.name ?? 'Deleted product',
        authorName: review.authorName,
        rating: review.rating,
        title: review.title ?? null,
        body: review.body,
        fitFeedback: review.fitFeedback ?? null,
        isVerifiedPurchase: review.isVerifiedPurchase ?? false,
        createdAt: (review.createdAt ?? new Date()).toISOString(),
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
      pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
    });
  }),
);

adminRouter.delete(
  '/reviews/:id',
  requirePermission('review.moderate'),
  asyncHandler(async (req, res) => {
    const review = await ReviewModel.findByIdAndDelete(idParam.parse(req.params.id)).lean();
    if (!review) throw ApiError.notFound('No such review');

    // The product's denormalised rating is rebuilt from what is left, so
    // removing a review cannot leave the star count permanently wrong.
    const remaining = await ReviewModel.find({ productId: review.productId })
      .select('rating')
      .lean();

    const average =
      remaining.length === 0
        ? null
        : Math.round(
            (remaining.reduce((sum, entry) => sum + entry.rating, 0) / remaining.length) * 10,
          ) / 10;

    await ProductModel.updateOne(
      { _id: review.productId },
      { $set: { ratingAverage: average, reviewCount: remaining.length } },
    );

    res.status(204).end();
  }),
);

/* --------------------------------- pages --------------------------------- */

const pageSchema = z.object({
  slug: z.string().trim().toLowerCase().max(120).optional(),
  title: z.string().trim().min(1, 'Enter a title').max(120),
  summary: z.string().trim().max(400).optional(),
  blocks: z
    .array(
      z.object({
        type: z.enum(BLOCK_TYPES),
        heading: z.string().trim().max(160).optional().default(''),
        body: z.string().trim().max(8000).optional().default(''),
        items: z
          .array(
            z.object({
              title: z.string().trim().max(300).optional().default(''),
              detail: z.string().trim().max(2000).optional().default(''),
            }),
          )
          .max(30)
          .optional()
          .default([]),
      }),
    )
    .max(20),
  footerGroup: z.string().trim().max(40).nullish(),
  position: z.coerce.number().int().min(0).max(999).optional(),
  isPublished: z.boolean().optional(),
});

adminRouter.get(
  '/pages',
  requirePermission('catalog.view'),
  asyncHandler(async (req, res) => {
    res.json(await listPages(parseQuery(req, pageQuerySchema)));
  }),
);

adminRouter.post(
  '/pages',
  requirePermission('cms.manage'),
  asyncHandler(async (req, res) => {
    res.status(201).json(await savePage(parseBody(req, pageSchema)));
  }),
);

adminRouter.put(
  '/pages/:id',
  requirePermission('cms.manage'),
  asyncHandler(async (req, res) => {
    res.json(await savePage(parseBody(req, pageSchema), idParam.parse(req.params.id)));
  }),
);

adminRouter.delete(
  '/pages/:id',
  requirePermission('cms.manage'),
  asyncHandler(async (req, res) => {
    await deletePage(idParam.parse(req.params.id));
    res.status(204).end();
  }),
);

/* -------------------------------- journal -------------------------------- */

const postSchema = z.object({
  slug: z.string().trim().toLowerCase().max(160).optional(),
  title: z.string().trim().min(1, 'Enter a title').max(160),
  excerpt: z.string().trim().max(400).optional(),
  coverUrl: z.string().trim().max(2000).nullish(),
  coverAlt: z.string().trim().max(300).optional(),
  author: z.string().trim().max(80).optional(),
  category: z.string().trim().max(60).nullish(),
  readMinutes: z.coerce.number().int().min(1).max(60).optional(),
  body: z.string().trim().min(1, 'Write something').max(30_000),
  productSlugs: z.array(z.string().trim().toLowerCase().max(160)).max(12).optional(),
  isPublished: z.boolean().optional(),
});

adminRouter.get(
  '/journal',
  requirePermission('catalog.view'),
  asyncHandler(async (req, res) => {
    res.json(await listAllPosts(parseQuery(req, pageQuerySchema)));
  }),
);

adminRouter.post(
  '/journal',
  requirePermission('cms.manage'),
  asyncHandler(async (req, res) => {
    res.status(201).json(await savePost(parseBody(req, postSchema)));
  }),
);

adminRouter.put(
  '/journal/:id',
  requirePermission('cms.manage'),
  asyncHandler(async (req, res) => {
    res.json(await savePost(parseBody(req, postSchema), idParam.parse(req.params.id)));
  }),
);

adminRouter.delete(
  '/journal/:id',
  requirePermission('cms.manage'),
  asyncHandler(async (req, res) => {
    await deletePost(idParam.parse(req.params.id));
    res.status(204).end();
  }),
);

/* ----------------------------- notifications ----------------------------- */

adminRouter.get(
  '/notifications',
  asyncHandler(async (req, res) => {
    const staff = staffOf(req);
    const query = parseQuery(req, pageQuerySchema);
    res.json(
      await listNotifications({ id: staff.id, permissions: staff.permissions }, query),
    );
  }),
);

adminRouter.post(
  '/notifications/read',
  asyncHandler(async (req, res) => {
    const { ids } = parseBody(req, z.object({ ids: z.array(idParam).optional() }));
    await markNotificationsRead(staffOf(req).id, ids);
    res.status(204).end();
  }),
);

adminRouter.get(
  '/emails',
  requirePermission('settings.manage'),
  asyncHandler(async (req, res) => {
    const query = parseQuery(req, pageQuerySchema);
    res.json(
      await listEmails({
        page: query.page,
        pageSize: query.pageSize,
        ...(query.search ? { search: query.search } : {}),
      }),
    );
  }),
);

/* --------------------------------- exports ------------------------------- */

/**
 * Sends a CSV as a download.
 *
 * `Content-Disposition` with a dated filename is what makes the browser save it
 * rather than render it as text, and what stops a merchant ending up with six
 * files called `export.csv`.
 */
const sendCsv = (res: Response, filename: string, body: string): void => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}-${isoDay()}.csv"`);
  res.send(body);
};

adminRouter.get(
  '/export/products',
  requirePermission('catalog.view', 'data.export'),
  asyncHandler(async (_req, res) => {
    sendCsv(res, 'threadline-products', await exportProducts());
  }),
);

adminRouter.get(
  '/export/orders',
  requirePermission('order.view', 'data.export'),
  asyncHandler(async (req, res) => {
    const { from, to } = parseQuery(
      req,
      z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() }),
    );
    sendCsv(res, 'threadline-orders', await exportOrders(from, to));
  }),
);

adminRouter.get(
  '/export/customers',
  requirePermission('customer.view', 'data.export'),
  asyncHandler(async (_req, res) => {
    sendCsv(res, 'threadline-customers', await exportCustomers());
  }),
);

/* --------------------------------- settings ------------------------------ */

adminRouter.get(
  '/settings',
  requirePermission('settings.manage'),
  asyncHandler(async (_req, res) => {
    res.json(await getSettings());
  }),
);

adminRouter.put(
  '/settings',
  requirePermission('settings.manage'),
  asyncHandler(async (req, res) => {
    res.json(await saveSettings(parseBody(req, settingsSchema)));
  }),
);

/* ---------------------------------- staff -------------------------------- */

adminRouter.get(
  '/staff',
  requirePermission('staff.manage'),
  asyncHandler(async (req, res) => {
    res.json(await listStaff(parseQuery(req, pageQuerySchema)));
  }),
);

adminRouter.post(
  '/staff',
  requirePermission('staff.manage'),
  asyncHandler(async (req, res) => {
    res.status(201).json(await createStaff(parseBody(req, staffSchema)));
  }),
);

adminRouter.put(
  '/staff/:id',
  requirePermission('staff.manage'),
  asyncHandler(async (req, res) => {
    const id = idParam.parse(req.params.id);
    const body = parseBody(req, staffPatchSchema);

    // Locking yourself out is a support ticket nobody can resolve from inside
    // the product, so the last door is held open deliberately.
    if (body.isActive === false && id === staffOf(req).id) {
      throw ApiError.badRequest('You cannot deactivate your own account');
    }

    res.json(await updateStaff(id, body));
  }),
);

adminRouter.put(
  '/staff/:id/password',
  requirePermission('staff.manage'),
  asyncHandler(async (req, res) => {
    const { password } = parseBody(
      req,
      z.object({ password: z.string().min(12, 'Use at least 12 characters').max(200) }),
    );
    await changeStaffPassword(idParam.parse(req.params.id), password);
    res.status(204).end();
  }),
);

/* --------------------------------- mappers ------------------------------- */

const toAdminProductSummary = (product: ProductDoc) => ({
  id: product._id,
  slug: product.slug,
  name: product.name,
  brand: product.brand,
  brandCode: product.brandCode,
  status: product.status,
  department: product.department,
  imageUrl: product.colourways[0]?.images[0]?.url ?? null,
  colourCount: product.colourways.length,
  variantCount: product.variants.length,
  // Summed across enabled variants: what a merchant checks before a campaign.
  totalStock: product.variants
    .filter((variant) => variant.isEnabled)
    .reduce((sum, variant) => sum + (variant.stockQuantity ?? 0), 0),
  price: product.variants[0]?.price ?? null,
  updatedAt: (product.updatedAt ?? new Date()).toISOString(),
});

const toAdminProductDetail = (product: ProductDoc) => ({
  ...toAdminProductSummary(product),
  description: product.description ?? '',
  highlights: [...product.highlights],
  careInstructions: product.careInstructions ?? null,
  fabric: product.fabric ?? null,
  fit: product.fit ?? null,
  sleeveLength: product.sleeveLength ?? null,
  occasion: product.occasion ?? null,
  pattern: product.pattern ?? null,
  neckline: product.neckline ?? null,
  primaryCategoryId: product.primaryCategoryId ?? null,
  categoryIds: [...product.categoryIds],
  sizeChartId: product.sizeChartId ?? null,
  colourways: product.colourways.map((colourway) => ({
    code: colourway.code,
    label: colourway.label,
    swatch: colourway.swatch,
    images: colourway.images.map((image) => ({
      mediaId: image.mediaId ?? null,
      url: image.url,
      alt: image.alt ?? '',
      kind: (image.kind as 'image' | 'video') ?? 'image',
      posterUrl: image.posterUrl ?? null,
    })),
  })),
  variants: product.variants.map((variant) => ({
    id: variant.id,
    sku: variant.sku,
    size: variant.size,
    colour: variant.colour,
    price: variant.price,
    compareAtPrice: variant.compareAtPrice ?? null,
    stockQuantity: variant.stockQuantity ?? 0,
    isEnabled: variant.isEnabled ?? true,
  })),
  sizes: [...new Set(product.variants.map((variant) => variant.size))],
});
