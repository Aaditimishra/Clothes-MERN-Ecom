import type { Size } from './catalog';

/**
 * A review.
 *
 * `fitFeedback` is the apparel-specific field that earns its place: the single
 * most useful thing a shopper can learn from a stranger is whether the garment
 * ran small. Aggregated across reviews it becomes the "Runs small — consider
 * sizing up" note on the product page.
 */
export const FIT_FEEDBACK = ['small', 'true-to-size', 'large'] as const;
export type FitFeedback = (typeof FIT_FEEDBACK)[number];

export interface ReviewView {
  id: string;
  productId: string;
  authorName: string;
  rating: number;
  title: string | null;
  body: string;
  fitFeedback: FitFeedback | null;
  sizePurchased: Size | null;
  /** True when the author has an order containing this product. */
  isVerifiedPurchase: boolean;
  createdAt: string;
}

export interface ReviewSummary {
  average: number | null;
  total: number;
  /** Count per star, index 0 = 1 star. */
  distribution: [number, number, number, number, number];
  /** The dominant fit signal, when there are enough reviews to mean anything. */
  fitVerdict: FitFeedback | null;
}

export interface ReviewListResponse {
  items: ReviewView[];
  summary: ReviewSummary;
  total: number;
  page: number;
  pageCount: number;
}

export interface CreateReviewRequest {
  rating: number;
  title?: string;
  body: string;
  fitFeedback?: FitFeedback;
  sizePurchased?: Size;
}
