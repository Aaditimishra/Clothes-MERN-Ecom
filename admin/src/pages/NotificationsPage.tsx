import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { Empty, Loading, Pager } from '../components/ui';
import { api, query } from '../lib/api';
import { usePaging } from '../lib/paging';
import { useToast } from '../lib/toast';
import type { Paged } from '../lib/types';

export interface NotificationView {
  id: string;
  type: string;
  title: string;
  body: string;
  href: string | null;
  severity: string;
  isRead: boolean;
  createdAt: string;
}

export const NOTIFICATIONS_KEY = ['notifications'] as const;

/**
 * Polled rather than pushed.
 *
 * A websocket would be the right answer for a busy shop, but it is a second
 * transport to secure, reconnect and reason about. A thirty-second poll is one
 * cheap indexed query and is well inside the time a merchant would notice.
 */
type NotificationPage = Paged<NotificationView> & { unread: number };

/**
 * The badge's copy: one row, polled.
 *
 * It only ever reads `unread`, which the API counts across EVERY notification
 * rather than the ones on the page — so asking for a single row is enough and
 * the sidebar does not pull thirty items it will not draw.
 */
export const useNotifications = () =>
  useQuery({
    queryKey: NOTIFICATIONS_KEY,
    queryFn: () =>
      api<NotificationPage>(`/notifications${query({ page: 1, pageSize: 1 })}`),
    refetchInterval: 30_000,
  });

const relative = (iso: string): string => {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)}h ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

export const NotificationsPage = () => {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const { page, pageSize, setPage, setPageSize } = usePaging(25);

  // Its own key, so paging the screen never disturbs the sidebar's poll — and
  // the sidebar's one-row fetch never overwrites the page being read.
  const { data, isLoading } = useQuery({
    queryKey: [...NOTIFICATIONS_KEY, page, pageSize],
    queryFn: () => api<NotificationPage>(`/notifications${query({ page, pageSize })}`),
  });

  const markRead = useMutation({
    mutationFn: (ids?: string[]) =>
      api<void>('/notifications/read', { method: 'POST', body: ids ? { ids } : {} }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
    },
    onError: () => notify('Could not update', 'error'),
  });

  return (
    <>
      <header className="topbar">
        <h1>Notifications</h1>
        <div className="topbar-actions">
          {data && data.unread > 0 ? (
            <button
              type="button"
              className="btn"
              disabled={markRead.isPending}
              onClick={() => markRead.mutate(undefined)}
            >
              Mark all read ({data.unread})
            </button>
          ) : null}
        </div>
      </header>

      <div className="page">
        <p className="notice">
          You only see what your permissions cover. A support account is not told that
          stock is low on a line it cannot restock.
        </p>

        <section className="card">
          {isLoading ? (
            <Loading />
          ) : data && data.items.length > 0 ? (
            <>
              <ul className="feed">
                {data.items.map((entry) => (
                  <li key={entry.id} className={entry.isRead ? 'is-read' : ''}>
                    <span
                      className={`feed-dot feed-${entry.severity}`}
                      aria-hidden="true"
                    />
                    <div className="feed-body">
                      <strong>{entry.title}</strong>
                      {entry.body ? <p className="muted">{entry.body}</p> : null}
                      <span className="muted feed-time">{relative(entry.createdAt)}</span>
                    </div>
                    <div className="row">
                      {entry.href ? (
                        <Link
                          to={entry.href}
                          className="btn btn-sm"
                          onClick={() => markRead.mutate([entry.id])}
                        >
                          Open
                        </Link>
                      ) : null}
                      {!entry.isRead ? (
                        <button
                          type="button"
                          className="link-btn"
                          onClick={() => markRead.mutate([entry.id])}
                        >
                          Mark read
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
              <Pager
                page={data.page}
                pageCount={data.pageCount}
                total={data.total}
                pageSize={pageSize}
                onChange={setPage}
                onPageSize={setPageSize}
                noun="notification"
              />
            </>
          ) : (
            <Empty title="Nothing to report">
              <span>New orders, reviews and low stock will show up here.</span>
            </Empty>
          )}
        </section>
      </div>
    </>
  );
};
