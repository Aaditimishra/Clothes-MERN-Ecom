import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { ConfirmDialog, Dialog, Empty, Loading, Pager } from '../components/ui';
import { DataTable, type Column } from '../components/DataTable';
import { api, query } from '../lib/api';
import { usePaging } from '../lib/paging';
import { formatDate } from '../lib/format';
import { useToast } from '../lib/toast';
import type { AdminReview, Paged } from '../lib/types';

const FIT_LABELS: Record<string, string> = {
  small: 'Runs small',
  'true-to-size': 'True to size',
  large: 'Runs large',
};

/**
 * Five glyphs, not a number.
 *
 * "4★" is read as text and compared digit by digit; a row of stars is counted
 * at a glance, which is the whole job when scanning a page of them for the
 * one-star complaints.
 */
const Stars = ({ rating }: { rating: number }) => (
  <span className="stars" role="img" aria-label={`${rating} out of 5`}>
    {[1, 2, 3, 4, 5].map((step) => (
      <span key={step} className={step <= rating ? 'is-on' : ''} aria-hidden="true">
        ★
      </span>
    ))}
  </span>
);

const REVIEW_COLUMNS = (
  onRead: (review: AdminReview) => void,
  onRemove: (review: AdminReview) => void,
): Column<AdminReview>[] => [
  {
    key: 'review',
    header: 'Review',
    required: true,
    render: (review) => (
      <div className="review-cell">
        <div className="review-top">
          <Stars rating={review.rating} />
          <span className="review-author">{review.authorName}</span>
          {review.isVerifiedPurchase ? (
            <span className="badge badge-active">verified</span>
          ) : null}
        </div>
        {review.title ? <strong className="review-title">{review.title}</strong> : null}
        {/* Clamped by CSS, not sliced in JS: three lines of whatever width the
            column ends up, and no ellipsis welded into the middle of a word. */}
        <p className="review-body">{review.body}</p>
      </div>
    ),
  },
  {
    key: 'product',
    header: 'Product',
    render: (review) => <span className="review-product">{review.productName}</span>,
  },
  {
    key: 'fit',
    header: 'Fit',
    render: (review) =>
      review.fitFeedback ? (
        <span className={`fit fit-${review.fitFeedback}`}>
          {FIT_LABELS[review.fitFeedback]}
        </span>
      ) : (
        <span className="muted">—</span>
      ),
  },
  {
    key: 'rating',
    header: 'Rating',
    numeric: true,
    optional: true,
    render: (review) => review.rating,
  },
  {
    key: 'date',
    header: 'Date',
    render: (review) => (
      <span className="muted nowrap">{formatDate(review.createdAt)}</span>
    ),
  },
  {
    key: 'actions',
    header: '',
    tight: true,
    required: true,
    render: (review) => (
      <div className="row">
        <button type="button" className="btn btn-sm" onClick={() => onRead(review)}>
          Read
        </button>
        <button
          type="button"
          className="btn btn-sm btn-danger"
          onClick={() => onRemove(review)}
        >
          Remove
        </button>
      </div>
    ),
  },
];

export const ReviewsPage = () => {
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const { page, pageSize, setPage, setPageSize } = usePaging(25);
  const [deleting, setDeleting] = useState<AdminReview | null>(null);
  const [open, setOpen] = useState<AdminReview | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['reviews', page, pageSize],
    queryFn: () => api<Paged<AdminReview>>(`/reviews${query({ page, pageSize })}`),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api<void>(`/reviews/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['reviews'] });
      // The product's star rating is recalculated server-side, so the catalogue
      // views have to be refetched or they would keep showing the old average.
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      setDeleting(null);
      notify('Review removed');
    },
    onError: (error: unknown) =>
      notify(error instanceof Error ? error.message : 'Could not remove', 'error'),
  });

  return (
    <>
      <header className="topbar">
        <div>
          <h1>Reviews</h1>
          <p className="topbar-sub">
            {data ? `${data.total.toLocaleString('en-IN')} in total` : 'Loading…'}
          </p>
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
                rowKey={(review) => review.id}
                storageKey="threadline.admin.columns.reviews"
                onRowClick={setOpen}
                columns={REVIEW_COLUMNS(setOpen, setDeleting)}
              />
              <Pager
                page={data.page}
                pageCount={data.pageCount}
                total={data.total}
                pageSize={pageSize}
                onChange={setPage}
                onPageSize={setPageSize}
                noun="review"
              />
            </>
          ) : (
            <Empty title="No reviews yet">
              <span>Reviews appear here once shoppers start writing them.</span>
            </Empty>
          )}
        </section>
      </div>

      {open ? (
        <Dialog title="Review" onClose={() => setOpen(null)}>
          <div className="review-full">
            <div className="review-full-head">
              <Stars rating={open.rating} />
              <span className="review-full-rating">{open.rating} out of 5</span>
              {open.isVerifiedPurchase ? (
                <span className="badge badge-active">verified purchase</span>
              ) : null}
            </div>

            {open.title ? <h3 className="review-full-title">{open.title}</h3> : null}
            {/*
              `pre-wrap`, so the paragraphs the shopper typed survive. Collapsed
              to one block, a considered three-paragraph review reads as a rant.
            */}
            <p className="review-full-body">{open.body}</p>

            <dl className="pay-review-facts">
              <div>
                <dt>Product</dt>
                <dd>{open.productName}</dd>
              </div>
              <div>
                <dt>Author</dt>
                <dd>{open.authorName}</dd>
              </div>
              <div>
                <dt>Fit</dt>
                <dd>{open.fitFeedback ? FIT_LABELS[open.fitFeedback] : 'Not said'}</dd>
              </div>
              <div>
                <dt>Written</dt>
                <dd>{formatDate(open.createdAt)}</dd>
              </div>
            </dl>

            <div className="row-actions">
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  setDeleting(open);
                  setOpen(null);
                }}
              >
                Remove this review
              </button>
            </div>
          </div>
        </Dialog>
      ) : null}

      {deleting ? (
        <ConfirmDialog
          title="Remove this review?"
          confirmLabel="Remove"
          busy={remove.isPending}
          onClose={() => setDeleting(null)}
          onConfirm={() => remove.mutate(deleting.id)}
          message={
            <>
              <p>
                {deleting.rating}★ from <strong>{deleting.authorName}</strong> on{' '}
                {deleting.productName}.
              </p>
              <p className="muted" style={{ marginTop: 8 }}>
                The product's star rating is recalculated from the reviews that remain.
              </p>
            </>
          }
        />
      ) : null}
    </>
  );
};
