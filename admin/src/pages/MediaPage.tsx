import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';

import { ConfirmDialog, Dialog, Empty, Field, Pager } from '../components/ui';
import { MEDIA_KEY, useUploadMedia } from '../components/MediaPicker';
import { api, query } from '../lib/api';
import { formatBytes, formatDate } from '../lib/format';
import { useSession } from '../lib/session';
import { useToast } from '../lib/toast';
import type { MediaAsset, Paged } from '../lib/types';

export const MediaPage = () => {
  const { can } = useSession();
  const { notify } = useToast();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<MediaAsset | null>(null);
  const [deleting, setDeleting] = useState<MediaAsset | null>(null);
  const [isOver, setOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const upload = useUploadMedia();
  const canManage = can('media.manage');

  const { data, isLoading } = useQuery({
    queryKey: [...MEDIA_KEY, 'page', page, search],
    queryFn: () => api<Paged<MediaAsset>>(`/media${query({ page, pageSize: 36, search })}`),
  });

  const { data: usage } = useQuery({
    queryKey: ['media-usage', deleting?.id],
    queryFn: () => api<Array<{ id: string; name: string }>>(`/media/${deleting!.id}/usage`),
    enabled: Boolean(deleting),
  });

  const save = useMutation({
    mutationFn: (input: { id: string; alt: string; tags: string[] }) =>
      api<MediaAsset>(`/media/${input.id}`, {
        method: 'PUT',
        body: { alt: input.alt, tags: input.tags },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: MEDIA_KEY });
      setEditing(null);
      notify('Image updated');
    },
    onError: (error: unknown) =>
      notify(error instanceof Error ? error.message : 'Could not save', 'error'),
  });

  const remove = useMutation({
    mutationFn: (input: { id: string; force: boolean }) =>
      api<void>(`/media/${input.id}${query({ force: input.force ? 1 : undefined })}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: MEDIA_KEY });
      setDeleting(null);
      notify('Image deleted');
    },
    onError: (error: unknown) =>
      notify(error instanceof Error ? error.message : 'Could not delete', 'error'),
  });

  const uploadFiles = (files: FileList | null) => {
    for (const file of Array.from(files ?? [])) upload.mutate(file);
  };

  return (
    <>
      <header className="topbar">
        <h1>Media</h1>
        <div className="topbar-actions">
          <input
            className="input"
            style={{ width: 220 }}
            placeholder="Search…"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
          {canManage ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => fileInput.current?.click()}
            >
              Upload
            </button>
          ) : null}
        </div>
      </header>

      <div className="page">
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(event) => {
            uploadFiles(event.target.files);
            event.target.value = '';
          }}
        />

        {canManage ? (
          <div
            className={`dropzone${isOver ? ' is-over' : ''}`}
            onDragOver={(event) => {
              event.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(event) => {
              event.preventDefault();
              setOver(false);
              uploadFiles(event.dataTransfer.files);
            }}
          >
            <strong>{upload.isPending ? 'Uploading…' : 'Drop images here'}</strong>
            <span className="muted">
              Anything you drop is converted to WebP and capped at 1600px — a 6 MB
              phone photo becomes about 200 KB.
            </span>
          </div>
        ) : null}

        <section className="card">
          <div className="card-head">
            <h2>Library</h2>
            <span className="muted">{data?.total ?? 0} images</span>
          </div>

          {isLoading ? (
            <div className="card-body">
              <div className="skeleton" style={{ height: 300 }} />
            </div>
          ) : data && data.items.length > 0 ? (
            <>
              <div className="card-body">
                <div className="media-grid">
                  {data.items.map((asset) => (
                    <button
                      key={asset.id}
                      type="button"
                      className="media-tile"
                      onClick={() => setEditing(asset)}
                    >
                      <img src={asset.url} alt={asset.alt || asset.filename} loading="lazy" />
                      <div className="media-tile-body">
                        <span className="media-tile-name">{asset.filename}</span>
                        <span className={`media-tile-alt${asset.alt ? '' : ' is-missing'}`}>
                          {asset.alt || 'No alt text'}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              <Pager
                page={data.page}
                pageCount={data.pageCount}
                total={data.total}
                onChange={setPage}
              />
            </>
          ) : (
            <Empty title="No images yet">
              <span>Upload product photography to get started.</span>
            </Empty>
          )}
        </section>
      </div>

      {editing ? (
        <Dialog
          title={editing.filename}
          onClose={() => setEditing(null)}
          footer={
            <>
              {canManage ? (
                <button
                  type="button"
                  className="btn btn-danger"
                  style={{ marginRight: 'auto' }}
                  onClick={() => {
                    setDeleting(editing);
                    setEditing(null);
                  }}
                >
                  Delete
                </button>
              ) : null}
              <button type="button" className="btn" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!canManage || save.isPending}
                onClick={() =>
                  save.mutate({
                    id: editing.id,
                    alt: editing.alt,
                    tags: editing.tags,
                  })
                }
              >
                {save.isPending ? 'Saving…' : 'Save'}
              </button>
            </>
          }
        >
          <div className="grid-2">
            <img
              src={editing.url}
              alt={editing.alt || editing.filename}
              style={{ borderRadius: 6, width: '100%' }}
            />
            <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
              <Field
                label="Alt text"
                hint="What a screen reader announces, and what a search engine reads. Describe the picture, not the product name."
              >
                <textarea
                  className="textarea"
                  value={editing.alt}
                  disabled={!canManage}
                  onChange={(event) => setEditing({ ...editing, alt: event.target.value })}
                />
              </Field>

              <Field label="Tags" hint="Comma separated. Used to find this image later.">
                <input
                  className="input"
                  value={editing.tags.join(', ')}
                  disabled={!canManage}
                  onChange={(event) =>
                    setEditing({
                      ...editing,
                      tags: event.target.value
                        .split(',')
                        .map((tag) => tag.trim().toLowerCase())
                        .filter(Boolean),
                    })
                  }
                />
              </Field>

              <dl className="muted" style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                <div>
                  {editing.width && editing.height
                    ? `${editing.width} × ${editing.height}`
                    : 'Dimensions unknown'}
                  {' · '}
                  {formatBytes(editing.size)} · {editing.provider}
                </div>
                <div>Added {formatDate(editing.createdAt)}</div>
                <div className="mono" style={{ wordBreak: 'break-all' }}>
                  {editing.url}
                </div>
              </dl>
            </div>
          </div>
        </Dialog>
      ) : null}

      {deleting ? (
        <ConfirmDialog
          title="Delete this image?"
          busy={remove.isPending}
          confirmLabel={usage && usage.length > 0 ? 'Delete anyway' : 'Delete'}
          onClose={() => setDeleting(null)}
          onConfirm={() =>
            remove.mutate({ id: deleting.id, force: (usage?.length ?? 0) > 0 })
          }
          message={
            usage === undefined ? (
              'Checking where this image is used…'
            ) : usage.length === 0 ? (
              <>
                <strong>{deleting.filename}</strong> is not used by any product. This
                cannot be undone.
              </>
            ) : (
              <>
                <p>
                  <strong>{deleting.filename}</strong> is used by {usage.length} product
                  {usage.length === 1 ? '' : 's'}:
                </p>
                <ul style={{ margin: '8px 0 0 18px' }}>
                  {usage.slice(0, 6).map((product) => (
                    <li key={product.id}>{product.name}</li>
                  ))}
                </ul>
                <p className="notice notice-error" style={{ marginTop: 12 }}>
                  Deleting removes it from those products too, leaving them with one
                  fewer photograph.
                </p>
              </>
            )
          }
        />
      ) : null}
    </>
  );
};
