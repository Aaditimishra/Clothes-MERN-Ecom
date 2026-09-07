import {
  newId,
  type FitFeedback,
  type ReviewListResponse,
  type ReviewSummary,
  type ReviewView,
  type Size,
} from '@shop/shared';

import { ApiError } from '../../lib/api-error';
import { CustomerModel } from '../../models/customer.model';
import { OrderModel } from '../../models/order.model';
import { ProductModel } from '../../models/product.model';
import { ReviewModel, type ReviewDoc } from '../../models/review.model';
import { onReviewPosted } from '../notification/notification.service';

const toReviewView = (doc: ReviewDoc): ReviewView => ({
  id: doc._id,
  productId: doc.productId,
  authorName: doc.authorName,
  rating: doc.rating,
  title: doc.title ?? null,
  body: doc.body,
  fitFeedback: (doc.fitFeedback as FitFeedback | null) ?? null,
  sizePurchased: (doc.sizePurchased as Size | null) ?? null,
  isVerifiedPurchase: doc.isVerifiedPurchase ?? false,
  createdAt: (doc.createdAt ?? new Date()).toISOString(),
});

/**
 * Fit only gets a verdict once enough people agree.
 *
 * Three reviews saying "runs small" is a pattern; one is a person who ordered
 * their usual size in a cut that was never meant to be loose. Publishing a
 * verdict from a single voice would send shoppers a size up for no reason and
 * generate the returns the feature exists to prevent.
 */
const MIN_REVIEWS_FOR_FIT_VERDICT = 3;
/** And that majority has to be real, not a two-to-one split. */
const FIT_VERDICT_THRESHOLD = 0.5;

const summarise = (reviews: readonly ReviewDoc[]): ReviewSummary => {
  if (reviews.length === 0) {
    return { average: null, total: 0, distribution: [0, 0, 0, 0, 0], fitVerdict: null };
  }

  const distribution: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  let sum = 0;
  const fitCounts = new Map<FitFeedback, number>();

  for (const review of reviews) {
    sum += review.rating;
    const bucket = Math.min(4, Math.max(0, review.rating - 1));
    distribution[bucket] = (distribution[bucket] ?? 0) + 1;

    if (review.fitFeedback) {
      const key = review.fitFeedback as FitFeedback;
      fitCounts.set(key, (fitCounts.get(key) ?? 0) + 1);
    }
  }

  const fitTotal = [...fitCounts.values()].reduce((total, count) => total + count, 0);
  const leader = [...fitCounts.entries()].sort((left, right) => right[1] - left[1])[0];

  const fitVerdict =
    leader && fitTotal >= MIN_REVIEWS_FOR_FIT_VERDICT &&
    leader[1] / fitTotal > FIT_VERDICT_THRESHOLD
      ? leader[0]
      : null;

  return {
    // One decimal place: a rating of 4.28 implies a precision 12 reviews cannot
    // support, and every shop the shopper has used rounds it the same way.
    average: Math.round((sum / reviews.length) * 10) / 10,
    total: reviews.length,
    distribution,
    fitVerdict,
  };
};

/**
 * Writes the rating back onto the product.
 *
 * Denormalised on purpose: a 48-card listing would otherwise need an aggregation
 * across every review in the shop to draw 48 star ratings. Recalculated from the
 * full set rather than nudged incrementally, so a deleted or edited review can
 * never leave the average permanently wrong.
 */
const recalculateProductRating = async (productId: string): Promise<void> => {
  const reviews = await ReviewModel.find({ productId }).select('rating').lean();
  const summary = summarise(reviews as ReviewDoc[]);

  await ProductModel.updateOne(
    { _id: productId },
    { $set: { ratingAverage: summary.average, reviewCount: summary.total } },
  );
};

export const listReviews = async (
  productId: string,
  page: number,
  pageSize: number,
): Promise<ReviewListResponse> => {
  const [pageDocs, all] = await Promise.all([
    ReviewModel.find({ productId })
      .sort({ createdAt: -1, _id: 1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    // The summary is over EVERY review, not the page. A distribution that
    // changes as you paginate is worse than none.
    ReviewModel.find({ productId }).select('rating fitFeedback').lean(),
  ]);

  return {
    items: (pageDocs as ReviewDoc[]).map(toReviewView),
    summary: summarise(all as ReviewDoc[]),
    total: all.length,
    page,
    pageCount: Math.max(1, Math.ceil(all.length / pageSize)),
  };
};

export interface CreateReviewInput {
  productId: string;
  customerId: string;
  rating: number;
  title?: string;
  body: string;
  fitFeedback?: FitFeedback;
  sizePurchased?: Size;
}

export const createReview = async (input: CreateReviewInput): Promise<ReviewView> => {
  const [product, customer] = await Promise.all([
    ProductModel.findById(input.productId).select('_id name').lean(),
    CustomerModel.findById(input.customerId).lean(),
  ]);

  if (!product) throw ApiError.notFound('No such product');
  if (!customer) throw ApiError.unauthorized('Your session is no longer valid');

  if (await ReviewModel.exists({ productId: input.productId, customerId: input.customerId })) {
    throw ApiError.conflict('You have already reviewed this product');
  }

  const hasBought = await OrderModel.exists({
    customerId: input.customerId,
    'lines.productId': input.productId,
    status: { $nin: ['cancelled'] },
  });

  const review = await ReviewModel.create({
    _id: newId('rev'),
    productId: input.productId,
    customerId: input.customerId,
    // Surname reduced to an initial. A review is public and a full name plus a
    // delivery city identifies a person more precisely than they expect when
    // they type it.
    authorName: `${customer.firstName} ${customer.lastName.charAt(0)}.`,
    rating: input.rating,
    title: input.title ?? null,
    body: input.body,
    fitFeedback: input.fitFeedback ?? null,
    sizePurchased: input.sizePurchased ?? null,
    isVerifiedPurchase: Boolean(hasBought),
  });

  await recalculateProductRating(input.productId);

  const posted = toReviewView(review.toObject());

  void onReviewPosted({
    productId: input.productId,
    productName: (product as { name?: string }).name ?? 'a product',
    rating: posted.rating,
    author: posted.authorName,
  });

  return posted;
};
