import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { ConfirmDialog, Empty, Loading, Pager } from '../components/ui';
import { api, query } from '../lib/api';
import { formatDate } from '../lib/format';
import { useToast } from '../lib/toast';
import type { AdminReview, Paged } from '../lib/types';

const FIT_LABELS: Record<string, string> = {
  small: 'Runs small',
  'true-to-size': 'True to size',
  large: 'Runs large',
};

export const ReviewsPage = () => {
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [deleting, setDeleting] = useState<AdminReview | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['reviews', page],
    queryFn: () => api<Paged<AdminReview>>(`/reviews${query({ page, pageSize: 25 })}`),
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
        <h1>Reviews</h1>
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
                      <th>Product</th>
                      <th>Author</th>
                      <th className="num">Rating</th>
                      <th>Review</th>
                      <th>Fit</th>
                      <th>Date</th>
                      <th className="tight" />
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((review) => (
                      <tr key={review.id}>
                        <td>
                          <strong>{review.productName}</strong>
                        </td>
                        <td>
                          {review.authorName}
                          {review.isVerifiedPurchase ? (
                            <>
                              <br />
                              <span className="badge badge-active">verified</span>
                            </>
                          ) : null}
                        </td>
                        <td className="num">{review.rating}★</td>
                        <td style={{ maxWidth: 380 }}>
                          {review.title ? <strong>{review.title}</strong> : null}
                          <div className="muted">{review.body.slice(0, 130)}…</div>
                        </td>
                        <td>{review.fitFeedback ? FIT_LABELS[review.fitFeedback] : '—'}</td>
                        <td className="muted">{formatDate(review.createdAt)}</td>
                        <td className="tight">
                          <button
                            type="button"
                            className="btn btn-sm btn-danger"
                            onClick={() => setDeleting(review)}
                          >
                            Remove
                          </button>
                        </td>
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
            <Empty title="No reviews yet" />
          )}
        </section>
      </div>

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
