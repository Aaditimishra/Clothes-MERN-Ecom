import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { Dialog, Empty, Loading, Pager } from '../components/ui';
import { api, query } from '../lib/api';
import { formatDate } from '../lib/format';

interface EmailItem {
  id: string;
  to: string;
  subject: string;
  template: string;
  body: string;
  status: string;
  provider: string | null;
  error: string | null;
  createdAt: string;
}

export const EmailsPage = () => {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<EmailItem | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['emails', page, search],
    queryFn: () =>
      api<{ items: EmailItem[]; total: number; page: number; pageCount: number }>(
        `/emails${query({ page, pageSize: 25, search })}`,
      ),
  });

  return (
    <>
      <header className="topbar">
        <h1>Emails</h1>
        <div className="topbar-actions">
          <input
            className="input"
            style={{ width: 220 }}
            placeholder="Recipient or subject…"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </div>
      </header>

      <div className="page">
        <p className="notice">
          Every message the shop wanted to send, recorded before any provider is
          called. No mail provider is wired in, so these are marked{' '}
          <strong>recorded</strong> rather than sent — which is deliberate: a
          merchant who believes confirmations are going out would not notice for
          weeks. Connecting a provider means implementing one interface.
        </p>

        <section className="card">
          {isLoading ? (
            <Loading />
          ) : data && data.items.length > 0 ? (
            <>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Sent</th>
                      <th>To</th>
                      <th>Subject</th>
                      <th>Template</th>
                      <th>Status</th>
                      <th className="tight" />
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((email) => (
                      <tr key={email.id}>
                        <td className="muted">{formatDate(email.createdAt)}</td>
                        <td className="mono">{email.to}</td>
                        <td>{email.subject}</td>
                        <td className="mono muted">{email.template}</td>
                        <td>
                          <span
                            className={`badge badge-${
                              email.status === 'failed' ? 'archived' : 'active'
                            }`}
                          >
                            {email.status}
                          </span>
                        </td>
                        <td className="tight">
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() => setOpen(email)}
                          >
                            View
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
            <Empty title="No emails yet">
              <span>Orders, status changes and sign-ups all queue a message.</span>
            </Empty>
          )}
        </section>
      </div>

      {open ? (
        <Dialog title={open.subject} onClose={() => setOpen(null)} wide>
          <dl className="summary">
            <div>
              <dt>To</dt>
              <dd className="mono">{open.to}</dd>
            </div>
            <div>
              <dt>Template</dt>
              <dd className="mono">{open.template}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>
                {open.status}
                {open.provider ? ` · ${open.provider}` : ''}
              </dd>
            </div>
          </dl>

          {open.error ? <p className="notice notice-error">{open.error}</p> : null}

          {/* The body is shown exactly as it was rendered — support answering
              "what did the customer actually receive?" needs the real text. */}
          <pre className="email-body">{open.body}</pre>
        </Dialog>
      ) : null}
    </>
  );
};
