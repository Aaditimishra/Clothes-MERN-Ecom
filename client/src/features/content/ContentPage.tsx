import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';

import { request } from '../../lib/api';
import { useSettings } from '../../lib/store-config';
import { NotFoundPage } from '../NotFoundPage';

interface ContentBlock {
  type: 'richText' | 'faq' | 'steps' | 'callout' | 'contact';
  heading: string;
  body: string;
  items: Array<{ title: string; detail: string }>;
}

interface PageView {
  id: string;
  slug: string;
  title: string;
  summary: string;
  blocks: ContentBlock[];
}

/** Blank lines separate paragraphs — the same convention the admin textarea uses. */
const paragraphs = (body: string) =>
  body
    .split(/\n{2,}/)
    .map((entry) => entry.trim())
    .filter(Boolean);

const Block = ({ block }: { block: ContentBlock }) => {
  const settings = useSettings();

  if (block.type === 'faq') {
    return (
      <section className="content-block">
        {block.heading ? <h2>{block.heading}</h2> : null}
        <div className="content-faq">
          {block.items.map((item, index) => (
            /* Open by default: these are short, and a page of collapsed rows
               makes a reader click five times to find out whether the answer is
               here at all. */
            <details key={item.title} open={index === 0}>
              <summary>{item.title}</summary>
              <div className="content-faq-body">
                {paragraphs(item.detail).map((text) => (
                  <p key={text}>{text}</p>
                ))}
              </div>
            </details>
          ))}
        </div>
      </section>
    );
  }

  if (block.type === 'steps') {
    return (
      <section className="content-block">
        {block.heading ? <h2>{block.heading}</h2> : null}
        <ol className="content-steps">
          {block.items.map((item) => (
            <li key={item.title}>
              <strong>{item.title}</strong>
              <p className="muted">{item.detail}</p>
            </li>
          ))}
        </ol>
      </section>
    );
  }

  if (block.type === 'callout') {
    return (
      <aside className="content-callout">
        {block.heading ? <h2>{block.heading}</h2> : null}
        {paragraphs(block.body).map((text) => (
          <p key={text}>{text}</p>
        ))}
      </aside>
    );
  }

  if (block.type === 'contact') {
    return (
      <section className="content-block">
        {block.heading ? <h2>{block.heading}</h2> : null}
        {paragraphs(block.body).map((text) => (
          <p key={text}>{text}</p>
        ))}

        <div className="contact-cards">
          {settings?.supportEmail ? (
            <a className="contact-card" href={`mailto:${settings.supportEmail}`}>
              <span className="eyebrow">Email</span>
              <strong>{settings.supportEmail}</strong>
              <span className="muted">Answered within one working day</span>
            </a>
          ) : null}

          {settings?.supportPhone ? (
            <a className="contact-card" href={`tel:${settings.supportPhone.replace(/\s/g, '')}`}>
              <span className="eyebrow">Phone</span>
              <strong>{settings.supportPhone}</strong>
              <span className="muted">Mon to Sat, 10am – 7pm</span>
            </a>
          ) : null}

          <Link className="contact-card" to="/account">
            <span className="eyebrow">Track an order</span>
            <strong>Your account</strong>
            <span className="muted">Status and tracking for every order</span>
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="content-block">
      {block.heading ? <h2>{block.heading}</h2> : null}
      {paragraphs(block.body).map((text) => (
        <p key={text}>{text}</p>
      ))}
    </section>
  );
};

export const ContentPage = () => {
  const { slug } = useParams<{ slug: string }>();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['page', slug],
    queryFn: () => request<PageView>(`/storefront/pages/${slug}`),
    enabled: Boolean(slug),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="shell page">
        <div className="skeleton" style={{ height: 320, maxWidth: 720 }} />
      </div>
    );
  }

  if (isError || !data) return <NotFoundPage />;

  return (
    <div className="shell page content-page">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link to="/">Home</Link>
        <span aria-hidden="true">/</span>
        <span>{data.title}</span>
      </nav>

      <header className="content-head">
        <h1 className="section-title">{data.title}</h1>
        {data.summary ? <p className="content-summary">{data.summary}</p> : null}
      </header>

      <div className="content-body">
        {data.blocks.map((block, index) => (
          <Block key={`${block.type}-${index}`} block={block} />
        ))}
      </div>
    </div>
  );
};
