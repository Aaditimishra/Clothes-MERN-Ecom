import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { ConfirmDialog, Dialog, Empty, Field, Loading, Pager } from '../components/ui';
import { api, query } from '../lib/api';
import { usePaging } from '../lib/paging';
import { useSession } from '../lib/session';
import { useToast } from '../lib/toast';
import type { Paged, PageAdminView, PostAdminView } from '../lib/types';

type Tab = 'journal' | 'pages';

interface PostDraft {
  id?: string;
  title: string;
  slug: string;
  category: string;
  author: string;
  excerpt: string;
  coverUrl: string;
  coverAlt: string;
  readMinutes: number;
  body: string;
  productSlugs: string;
  isPublished: boolean;
}

const EMPTY_POST: PostDraft = {
  title: '',
  slug: '',
  category: '',
  author: '',
  excerpt: '',
  coverUrl: '',
  coverAlt: '',
  readMinutes: 3,
  body: '',
  productSlugs: '',
  isPublished: true,
};

const toDraft = (post: PostAdminView): PostDraft => ({
  id: post.id,
  title: post.title,
  slug: post.slug,
  category: post.category ?? '',
  author: post.author,
  excerpt: post.excerpt,
  coverUrl: post.coverUrl ?? '',
  coverAlt: post.coverAlt,
  readMinutes: post.readMinutes,
  body: post.body,
  productSlugs: post.productSlugs.join(', '),
  isPublished: post.isPublished,
});

/** Entered as a comma list because that is how people paste slugs. */
const parseSlugs = (input: string): string[] =>
  input
    .split(',')
    .map((slug) => slug.trim().toLowerCase())
    .filter(Boolean);

export const ContentPage = () => {
  const { can } = useSession();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  // Two independent lists on one screen, so two independent pagers — paging the
  // journal must not jump the footer pages back to the top.
  const journalPaging = usePaging(25);
  const pagePaging = usePaging(25);
  const [tab, setTab] = useState<Tab>('journal');
  const [draft, setDraft] = useState<PostDraft | null>(null);
  const [deleting, setDeleting] = useState<PostAdminView | null>(null);

  const canManage = can('cms.manage');

  const posts = useQuery({
    queryKey: ['admin-journal', journalPaging.page, journalPaging.pageSize],
    queryFn: () =>
      api<Paged<PostAdminView>>(
        `/journal${query({ page: journalPaging.page, pageSize: journalPaging.pageSize })}`,
      ),
  });

  const pages = useQuery({
    queryKey: ['admin-pages', pagePaging.page, pagePaging.pageSize],
    queryFn: () =>
      api<Paged<PageAdminView>>(
        `/pages${query({ page: pagePaging.page, pageSize: pagePaging.pageSize })}`,
      ),
    enabled: tab === 'pages',
  });

  const done = (message: string) => {
    void queryClient.invalidateQueries({ queryKey: ['admin-journal'] });
    void queryClient.invalidateQueries({ queryKey: ['admin-pages'] });
    setDraft(null);
    setDeleting(null);
    notify(message);
  };

  const save = useMutation({
    mutationFn: (input: PostDraft) => {
      const body = {
        // An empty slug means "derive it from the title"; sending '' would fail
        // validation, so the field is dropped rather than blanked.
        ...(input.slug ? { slug: input.slug } : {}),
        title: input.title,
        excerpt: input.excerpt,
        coverUrl: input.coverUrl || null,
        coverAlt: input.coverAlt,
        author: input.author,
        category: input.category || null,
        readMinutes: input.readMinutes,
        body: input.body,
        productSlugs: parseSlugs(input.productSlugs),
        isPublished: input.isPublished,
      };
      return input.id
        ? api(`/journal/${input.id}`, { method: 'PUT', body })
        : api('/journal', { method: 'POST', body });
    },
    onSuccess: () => done('Journal entry saved'),
    onError: (error: unknown) =>
      notify(error instanceof Error ? error.message : 'Could not save', 'error'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api<void>(`/journal/${id}`, { method: 'DELETE' }),
    onSuccess: () => done('Journal entry deleted'),
    onError: (error: unknown) =>
      notify(error instanceof Error ? error.message : 'Could not delete', 'error'),
  });

  const patch = (change: Partial<PostDraft>) =>
    setDraft((current) => (current ? { ...current, ...change } : current));

  return (
    <>
      <header className="topbar">
        <h1>Content</h1>
        <div className="topbar-actions">
          {canManage && tab === 'journal' ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setDraft(EMPTY_POST)}
            >
              New entry
            </button>
          ) : null}
        </div>
      </header>

      <div className="page">
        <div className="tabs">
          <button
            type="button"
            className={tab === 'journal' ? 'tab active' : 'tab'}
            onClick={() => setTab('journal')}
          >
            Journal
          </button>
          <button
            type="button"
            className={tab === 'pages' ? 'tab active' : 'tab'}
            onClick={() => setTab('pages')}
          >
            Pages
          </button>
        </div>

        {tab === 'journal' ? (
          <>
            <p className="notice">
              Entries appear at <code>/journal</code> on the shop. Body text takes blank
              lines for paragraphs and <code>## </code> for a heading — it is rendered as
              text, never as HTML, so a pasted script cannot run on the storefront.
            </p>

            {posts.isLoading ? (
              <div className="card">
                <Loading />
              </div>
            ) : posts.data && posts.data.items.length > 0 ? (
              <div className="card">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Title</th>
                        <th>Category</th>
                        <th>Author</th>
                        <th className="num">Read</th>
                        <th>Status</th>
                        {canManage ? <th /> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {posts.data.items.map((post) => (
                        <tr key={post.id}>
                          <td>
                            <strong>{post.title}</strong>
                            <div className="muted">/journal/{post.slug}</div>
                          </td>
                          <td>{post.category ?? '—'}</td>
                          <td>{post.author || '—'}</td>
                          <td className="num">{post.readMinutes} min</td>
                          <td>
                            <span className={post.isPublished ? 'badge ok' : 'badge'}>
                              {post.isPublished ? 'Live' : 'Draft'}
                            </span>
                          </td>
                          {canManage ? (
                            <td className="row-actions">
                              <button
                                type="button"
                                className="btn btn-sm"
                                onClick={() => setDraft(toDraft(post))}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="btn btn-sm btn-danger"
                                onClick={() => setDeleting(post)}
                              >
                                Delete
                              </button>
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pager
                  page={posts.data.page}
                  pageCount={posts.data.pageCount}
                  total={posts.data.total}
                  pageSize={journalPaging.pageSize}
                  onChange={journalPaging.setPage}
                  onPageSize={journalPaging.setPageSize}
                  noun="entry"
                />
              </div>
            ) : (
              <div className="card">
                <Empty title="No journal entries yet">
                  <span>Write one and it appears on the shop immediately.</span>
                </Empty>
              </div>
            )}
          </>
        ) : (
          <>
            <p className="notice">
              Footer pages — delivery, returns, sizing, about. The footer builds itself
              from whichever of these are published, so a new page needs no code to be
              linked.
            </p>

            {pages.isLoading ? (
              <div className="card">
                <Loading />
              </div>
            ) : pages.data && pages.data.items.length > 0 ? (
              <div className="card">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Page</th>
                        <th>Footer group</th>
                        <th className="num">Blocks</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pages.data.items.map((page) => (
                        <tr key={page.id}>
                          <td>
                            <strong>{page.title}</strong>
                            <div className="muted">/{page.slug}</div>
                          </td>
                          <td>{page.footerGroup ?? '—'}</td>
                          <td className="num">{page.blocks.length}</td>
                          <td>
                            <span className={page.isPublished ? 'badge ok' : 'badge'}>
                              {page.isPublished ? 'Live' : 'Draft'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pager
                  page={pages.data.page}
                  pageCount={pages.data.pageCount}
                  total={pages.data.total}
                  pageSize={pagePaging.pageSize}
                  onChange={pagePaging.setPage}
                  onPageSize={pagePaging.setPageSize}
                  noun="page"
                />
              </div>
            ) : (
              <div className="card">
                <Empty title="No pages yet" />
              </div>
            )}
          </>
        )}
      </div>

      {draft ? (
        <Dialog
          title={draft.id ? 'Edit entry' : 'New entry'}
          onClose={() => setDraft(null)}
          footer={
            <>
              <button type="button" className="btn" onClick={() => setDraft(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={save.isPending || !draft.title.trim() || !draft.body.trim()}
                onClick={() => save.mutate(draft)}
              >
                {save.isPending ? 'Saving…' : 'Save entry'}
              </button>
            </>
          }
        >
          <div className="form-grid">
            <Field label="Title">
              <input
                className="input"
                value={draft.title}
                onChange={(event) => patch({ title: event.target.value })}
              />
            </Field>

            <Field
              label="Slug"
              hint={draft.id ? undefined : 'Leave empty to build it from the title.'}
            >
              <input
                className="input"
                value={draft.slug}
                placeholder="how-to-buy-a-size"
                onChange={(event) => patch({ slug: event.target.value })}
              />
            </Field>

            <Field label="Category" hint="Becomes a filter chip on the journal page.">
              <input
                className="input"
                value={draft.category}
                placeholder="Fabric"
                onChange={(event) => patch({ category: event.target.value })}
              />
            </Field>

            <Field label="Author">
              <input
                className="input"
                value={draft.author}
                onChange={(event) => patch({ author: event.target.value })}
              />
            </Field>

            <Field label="Read time" hint="Minutes.">
              <input
                className="input"
                type="number"
                min={1}
                max={60}
                value={draft.readMinutes}
                onChange={(event) =>
                  patch({ readMinutes: Number(event.target.value) || 1 })
                }
              />
            </Field>

            <Field label="Status">
              <select
                className="input"
                value={draft.isPublished ? 'live' : 'draft'}
                onChange={(event) =>
                  patch({ isPublished: event.target.value === 'live' })
                }
              >
                <option value="live">Live on the shop</option>
                <option value="draft">Draft — hidden</option>
              </select>
            </Field>
          </div>

          <Field label="Excerpt" hint="Shown on the journal list, under the title.">
            <textarea
              className="input"
              rows={2}
              value={draft.excerpt}
              onChange={(event) => patch({ excerpt: event.target.value })}
            />
          </Field>

          <div className="form-grid">
            <Field
              label="Cover image URL"
              hint="Upload one under Media and paste its URL."
            >
              <input
                className="input"
                value={draft.coverUrl}
                onChange={(event) => patch({ coverUrl: event.target.value })}
              />
            </Field>

            <Field
              label="Cover alt text"
              hint="Describe the photograph for screen readers."
            >
              <input
                className="input"
                value={draft.coverAlt}
                onChange={(event) => patch({ coverAlt: event.target.value })}
              />
            </Field>
          </div>

          <Field
            label="Linked products"
            hint="Comma-separated product slugs. They appear as cards at the foot of the entry."
          >
            <input
              className="input"
              value={draft.productSlugs}
              placeholder="garment-dyed-cotton-shirt, heavyweight-cotton-tee"
              onChange={(event) => patch({ productSlugs: event.target.value })}
            />
          </Field>

          <Field
            label="Body"
            hint="Blank line between paragraphs. Start a line with ## for a heading."
          >
            <textarea
              className="input mono"
              rows={16}
              value={draft.body}
              onChange={(event) => patch({ body: event.target.value })}
            />
          </Field>

          {draft.coverUrl ? (
            <div className="cover-preview">
              <img src={draft.coverUrl} alt={draft.coverAlt || 'Cover preview'} />
            </div>
          ) : null}
        </Dialog>
      ) : null}

      {deleting ? (
        <ConfirmDialog
          title="Delete this entry?"
          message={`"${deleting.title}" will disappear from the shop immediately.`}
          confirmLabel="Delete entry"
          busy={remove.isPending}
          onClose={() => setDeleting(null)}
          onConfirm={() => remove.mutate(deleting.id)}
        />
      ) : null}
    </>
  );
};
