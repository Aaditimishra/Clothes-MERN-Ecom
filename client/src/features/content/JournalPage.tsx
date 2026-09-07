import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';

import { request } from '../../lib/api';

export interface PostSummary {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  coverUrl: string | null;
  coverAlt: string;
  author: string;
  category: string | null;
  readMinutes: number;
  publishedAt: string;
}

export const formatPostDate = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

export const useJournal = (category?: string, limit?: number) =>
  useQuery({
    queryKey: ['journal', category ?? null, limit ?? null],
    queryFn: () =>
      request<{ items: PostSummary[]; categories: string[] }>(
        `/storefront/journal${
          category || limit
            ? `?${new URLSearchParams({
                ...(category ? { category } : {}),
                ...(limit ? { limit: String(limit) } : {}),
              }).toString()}`
            : ''
        }`,
      ),
    staleTime: 2 * 60 * 1000,
  });

export const JournalPage = () => {
  const [params, setParams] = useSearchParams();
  const category = params.get('category') ?? undefined;
  const { data, isLoading } = useJournal(category);

  const [lead, ...rest] = data?.items ?? [];

  return (
    <div className="shell page journal">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link to="/">Home</Link>
        <span aria-hidden="true">/</span>
        <span>Journal</span>
      </nav>

      <header className="content-head">
        <h1 className="section-title">Journal</h1>
        <p className="content-summary">
          Notes on fabric, fit and what is worth buying. Written by the people who
          choose what we stock.
        </p>
      </header>

      {data && data.categories.length > 0 ? (
        <div className="chips journal-filters">
          <button
            type="button"
            className={`chip${!category ? ' is-active' : ''}`}
            onClick={() => setParams({})}
          >
            Everything
          </button>
          {data.categories.map((entry) => (
            <button
              key={entry}
              type="button"
              className={`chip${category === entry ? ' is-active' : ''}`}
              onClick={() => setParams({ category: entry })}
            >
              {entry}
            </button>
          ))}
        </div>
      ) : null}

      {isLoading ? (
        <div className="journal-grid">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="skeleton" style={{ height: 320 }} />
          ))}
        </div>
      ) : lead ? (
        <>
          {/* The newest entry runs wide. A grid of identical cards gives a reader
              no way to tell where to start. */}
          <Link
            to={`/journal/${lead.slug}`}
            className={lead.coverUrl ? 'journal-lead' : 'journal-lead no-cover'}
          >
            {lead.coverUrl ? (
              <img src={lead.coverUrl} alt={lead.coverAlt} loading="eager" />
            ) : null}
            <div className="journal-lead-body">
              {lead.category ? <span className="eyebrow">{lead.category}</span> : null}
              <h2>{lead.title}</h2>
              <p>{lead.excerpt}</p>
              <span className="muted journal-meta">
                {lead.author} · {formatPostDate(lead.publishedAt)} · {lead.readMinutes} min read
              </span>
            </div>
          </Link>

          {rest.length > 0 ? (
            <div className="journal-grid">
              {rest.map((post) => (
                <Link key={post.id} to={`/journal/${post.slug}`} className="journal-card">
                  {post.coverUrl ? (
                    <img src={post.coverUrl} alt={post.coverAlt} loading="lazy" />
                  ) : null}
                  <div className="journal-card-body">
                    {post.category ? <span className="eyebrow">{post.category}</span> : null}
                    <h3>{post.title}</h3>
                    <p className="muted">{post.excerpt}</p>
                    <span className="muted journal-meta">
                      {formatPostDate(post.publishedAt)} · {post.readMinutes} min read
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <div className="empty-state">
          <h2>Nothing published yet</h2>
          <p className="muted">Come back soon.</p>
        </div>
      )}
    </div>
  );
};
