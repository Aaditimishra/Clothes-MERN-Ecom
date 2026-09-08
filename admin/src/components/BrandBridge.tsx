import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

import { api } from '../lib/api';
import type { StoreSettings } from '../lib/types';

/**
 * Paints the panel in the shop's own accent — and ONLY the accent.
 *
 * Surfaces and text stay on the neutral ramp in the stylesheet, deliberately.
 * This is a tool somebody stares at for six hours, and a merchant who picks a
 * neon brand colour must not be able to make their own order list unreadable.
 * The accent is decoration — the active nav item, focus rings, the primary
 * button, the first chart series — and legibility is never delegated to it.
 *
 * The stylesheet's own blue stays the default, so the panel renders correctly
 * before this request lands. A tool that flashes unstyled while waiting for its
 * own theme is worse than one that starts on the shipped palette.
 */
export const BrandBridge = () => {
  const { data } = useQuery({
    queryKey: ['settings', 'branding'],
    queryFn: () => api<StoreSettings>('/settings'),
    // Changed a few times a year. Refetching it per navigation would be a
    // request per page for something that has not moved.
    staleTime: 10 * 60 * 1000,
    // Not everyone can read settings, and the panel must still work for them.
    retry: false,
  });

  useEffect(() => {
    const accent = data?.branding?.accent;
    if (!accent) return;

    const root = document.documentElement;
    root.style.setProperty('--brand', accent);
    root.style.setProperty('--brand-ink', data.branding.accentInk || '#ffffff');

    /**
     * The soft tint and the hover are DERIVED, not asked for.
     *
     * A merchant picking one colour should not then have to pick a matching
     * pale version of it and a matching darker one — and if they did, nothing
     * would stop the three disagreeing. `color-mix` keeps them in step by
     * construction, and mixing toward the surface token means the tint stays
     * correct in dark mode without a second set of values.
     */
    root.style.setProperty('--brand-soft', `color-mix(in srgb, ${accent} 12%, var(--paper))`);
    root.style.setProperty('--brand-hover', `color-mix(in srgb, ${accent} 84%, var(--ink))`);
    // The first chart series belongs to the shop, so it follows the accent too.
    root.style.setProperty('--chart-1', accent);

    return () => {
      for (const token of ['--brand', '--brand-ink', '--brand-soft', '--brand-hover', '--chart-1']) {
        root.style.removeProperty(token);
      }
    };
  }, [data]);

  return null;
};
