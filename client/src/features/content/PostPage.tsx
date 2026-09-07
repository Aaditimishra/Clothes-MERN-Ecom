import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import type { ProductSummaryView } from '@shop/shared';

import { ProductCard } from '../../components/ProductCard';
import { request } from '../../lib/api';
import { NotFoundPage } from '../NotFoundPage';
import { formatPostDate, type PostSummary } from './JournalPage';

interface PostDetail extends PostSummary {
  body: string;
  products: ProductSummaryView[];
}

/**
 * A deliberately small subset of Markdown: `## ` for a subheading, blank lines
 * for paragraphs.
 *
 * Not a Markdown library and not `dangerouslySetInnerHTML`. Post bodies are
 * merchant-authored, and rendering arbitrary HTML from an admin field is an XSS
 * hole that only needs one compromised staff account to matter. Everything here
 * goes through React as text.
 */
const renderBody = (body: string) =>
  body
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block, index) =>
      block.startsWith('## ') ? (
        <h2 key={index}>{block.slice(3)}</h2>
      ) : (
        <p key={index}>{block}</p>
      ),
    );

export const PostPage = () => {
  const { slug } = useParams<{ slug: string }>();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['post', slug],
    queryFn: () => request<PostDetail>(`/storefront/journal/${slug}`),
    enabled: Boolean(slug),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="shell page">
        <div className="skeleton" style={{ height: 420, maxWidth: 760 }} />
      </div>
    );
  }

  if (isError || !data) return <NotFoundPage />;

  return (
    <article className="post">
      <div className="shell">
        <nav className="crumbs" aria-label="Breadcrumb">
          <Link to="/">Home</Link>
          <span aria-hidden="true">/</span>
          <Link to="/journal">Journal</Link>
          <span aria-hidden="true">/</span>
          <span>{data.title}</span>
        </nav>
      </div>

      <header className="post-head shell">
        {data.category ? <span className="eyebrow">{data.category}</span> : null}
        <h1 className="post-title">{data.title}</h1>
        <p className="post-excerpt">{data.excerpt}</p>
        <p className="muted journal-meta">
          {data.author} · {formatPostDate(data.publishedAt)} · {data.readMinutes} min read
        </p>
      </header>

      {data.coverUrl ? (
        <div className="shell">
          <img className="post-cover" src={data.coverUrl} alt={data.coverAlt} />
        </div>
      ) : null}

      <div className="shell post-body">{renderBody(data.body)}</div>

      {data.products.length > 0 ? (
        <section className="shell rail post-products">
          <header className="rail-head">
            <div>
              <p className="eyebrow">Mentioned in this piece</p>
              <h2 className="section-title">Shop the story</h2>
            </div>
          </header>
          <div className="grid grid-4">
            {data.products.slice(0, 4).map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      ) : null}

      <div className="shell post-foot">
        <Link to="/journal" className="btn btn-outline">
          ← All journal entries
        </Link>
      </div>
    </article>
  );
};
