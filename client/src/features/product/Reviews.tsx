import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FIT_FEEDBACK, type ReviewListResponse } from '@shop/shared';

import { Rating } from '../../components/Rating';
import { ApiRequestError, request } from '../../lib/api';
import { useAuth } from '../../store/auth';
import { useToast } from '../../store/toast';

const FIT_LABELS: Record<string, string> = {
  small: 'Runs small — consider sizing up',
  'true-to-size': 'True to size',
  large: 'Runs large — consider sizing down',
};

export const Reviews = ({ productId }: { productId: string }) => {
  const { customer } = useAuth();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [isWriting, setWriting] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});

  const reviewsKey = ['reviews', productId];

  const { data, isLoading } = useQuery({
    queryKey: reviewsKey,
    queryFn: () => request<ReviewListResponse>(`/products/${productId}/reviews`),
  });

  const { mutate, isPending } = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      request(`/products/${productId}/reviews`, { method: 'POST', body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: reviewsKey });
      void queryClient.invalidateQueries({ queryKey: ['product'] });
      setWriting(false);
      setFields({});
      notify('Thanks — your review is live');
    },
    onError: (error: unknown) => {
      if (error instanceof ApiRequestError) {
        setFields(error.fields);
        notify(error.message, 'error');
      }
    },
  });

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    mutate({
      rating: Number(form.get('rating')),
      title: String(form.get('title') ?? '') || undefined,
      body: String(form.get('body') ?? ''),
      fitFeedback: String(form.get('fitFeedback') ?? '') || undefined,
    });
  };

  const summary = data?.summary;

  return (
    <section className="reviews" id="reviews">
      <h2 className="section-title">Reviews</h2>

      {isLoading ? (
        <div className="skeleton" style={{ height: 120 }} />
      ) : (
        <div className="reviews-summary">
          <div className="reviews-score">
            <strong>{summary?.average?.toFixed(1) ?? '—'}</strong>
            <Rating value={summary?.average ?? null} size={16} />
            <span className="muted">
              {summary?.total ?? 0} review{summary?.total === 1 ? '' : 's'}
            </span>
          </div>

          <div className="reviews-bars">
            {[5, 4, 3, 2, 1].map((star) => {
              const count = summary?.distribution[star - 1] ?? 0;
              const percent = summary?.total ? (count / summary.total) * 100 : 0;
              return (
                <div key={star} className="reviews-bar">
                  <span>{star}★</span>
                  <span className="reviews-bar-track">
                    <span className="reviews-bar-fill" style={{ width: `${percent}%` }} />
                  </span>
                  <span className="muted">{count}</span>
                </div>
              );
            })}
          </div>

          {summary?.fitVerdict ? (
            <p className="fit-verdict">
              <strong>Fit:</strong> {FIT_LABELS[summary.fitVerdict]}
            </p>
          ) : null}
        </div>
      )}

      {customer ? (
        isWriting ? (
          <form className="review-form stack" onSubmit={handleSubmit}>
            <label className="field">
              <span className="field-label">Rating</span>
              <select name="rating" className="input" defaultValue="5" required>
                {[5, 4, 3, 2, 1].map((value) => (
                  <option key={value} value={value}>
                    {value} star{value === 1 ? '' : 's'}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="field-label">How did it fit?</span>
              <select name="fitFeedback" className="input" defaultValue="true-to-size">
                {FIT_FEEDBACK.map((value) => (
                  <option key={value} value={value}>
                    {FIT_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="field-label">Title</span>
              <input name="title" className="input" maxLength={120} />
            </label>

            <label className="field">
              <span className="field-label">Your review</span>
              <textarea
                name="body"
                className="input"
                rows={4}
                required
                aria-invalid={Boolean(fields.body)}
              />
              {fields.body ? <span className="field-error">{fields.body}</span> : null}
            </label>

            <div className="row">
              <button type="submit" className="btn btn-primary" disabled={isPending}>
                {isPending ? 'Publishing…' : 'Publish review'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setWriting(false)}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button type="button" className="btn btn-outline" onClick={() => setWriting(true)}>
            Write a review
          </button>
        )
      ) : (
        <p className="muted">
          <Link to="/sign-in" className="link-btn">
            Sign in
          </Link>{' '}
          to write a review.
        </p>
      )}

      <ul className="review-list">
        {data?.items.map((review) => (
          <li key={review.id}>
            <div className="review-head">
              <Rating value={review.rating} size={13} />
              <strong>{review.authorName}</strong>
              {review.isVerifiedPurchase ? (
                <span className="badge badge-verified">Verified purchase</span>
              ) : null}
              <time className="muted" dateTime={review.createdAt}>
                {new Date(review.createdAt).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </time>
            </div>
            {review.title ? <h3 className="review-title">{review.title}</h3> : null}
            <p>{review.body}</p>
            {review.fitFeedback ? (
              <p className="muted review-fit">Fit: {FIT_LABELS[review.fitFeedback]}</p>
            ) : null}
          </li>
        ))}
      </ul>

      {data && data.items.length === 0 ? (
        <p className="muted">No reviews yet. Be the first to write one.</p>
      ) : null}
    </section>
  );
};
