import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';

import { api, query } from '../lib/api';
import { useToast } from '../lib/toast';
import type { MediaAsset, Paged } from '../lib/types';
import { Dialog } from './ui';

export const MEDIA_KEY = ['media'] as const;

export const useUploadMedia = () => {
  const queryClient = useQueryClient();
  const { notify } = useToast();

  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return api<MediaAsset>('/media', { method: 'POST', form });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: MEDIA_KEY });
      notify('Image uploaded');
    },
    onError: (error: unknown) => {
      notify(error instanceof Error ? error.message : 'Upload failed', 'error');
    },
  });
};

/**
 * Pick from the library, or upload without leaving the dialog.
 *
 * Both routes exist because both happen: a merchant adding a second colourway is
 * usually reusing shots already uploaded, while one setting up a new product has
 * a folder of files to bring in. Forcing either group through the other's flow is
 * what makes an admin feel slow.
 */
export const MediaPicker = ({
  onPick,
  onClose,
}: {
  onPick: (asset: MediaAsset) => void;
  onClose: () => void;
}) => {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const upload = useUploadMedia();

  const { data, isLoading } = useQuery({
    queryKey: [...MEDIA_KEY, page, search],
    queryFn: () => api<Paged<MediaAsset>>(`/media${query({ page, pageSize: 24, search })}`),
  });

  return (
    <Dialog
      title="Choose an image"
      onClose={onClose}
      wide
      footer={
        <>
          <span className="muted" style={{ marginRight: 'auto' }}>
            {data?.total ?? 0} images
          </span>
          <button
            type="button"
            className="btn"
            disabled={!data || page <= 1}
            onClick={() => setPage((current) => current - 1)}
          >
            Previous
          </button>
          <button
            type="button"
            className="btn"
            disabled={!data || page >= data.pageCount}
            onClick={() => setPage((current) => current + 1)}
          >
            Next
          </button>
        </>
      }
    >
      <div className="row">
        <input
          className="input"
          style={{ maxWidth: 260 }}
          placeholder="Search filename, alt or tag…"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => fileInput.current?.click()}
          disabled={upload.isPending}
        >
          {upload.isPending ? 'Uploading…' : 'Upload new'}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) upload.mutate(file);
            // Reset so choosing the same file twice still fires a change event.
            event.target.value = '';
          }}
        />
      </div>

      {isLoading ? (
        <div className="skeleton" style={{ height: 320 }} />
      ) : (
        <div className="media-grid">
          {data?.items.map((asset) => (
            <button
              key={asset.id}
              type="button"
              className="media-tile"
              onClick={() => onPick(asset)}
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
      )}
    </Dialog>
  );
};
