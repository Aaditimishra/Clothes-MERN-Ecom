import { useEffect, useState } from 'react';

/**
 * Light, dark, or whatever the machine says.
 *
 * Three options rather than a switch, because "System" has to stay reachable:
 * with a two-way toggle, anyone who picks Dark once can never get back to
 * following their OS, and the panel stops changing with the rest of their
 * machine at sunset.
 */
export type ThemeChoice = 'light' | 'dark' | 'system';

const KEY = 'threadline.admin.theme';

const isChoice = (value: string | null): value is ThemeChoice =>
  value === 'light' || value === 'dark' || value === 'system';

export const readTheme = (): ThemeChoice => {
  try {
    const stored = localStorage.getItem(KEY);
    return isChoice(stored) ? stored : 'system';
  } catch {
    // Private windows and blocked site data throw on access rather than
    // returning null. Following the OS is the right answer when we cannot ask.
    return 'system';
  }
};

/**
 * `system` writes no attribute at all.
 *
 * The stylesheet keys light off bare `:root` and dark off a
 * `prefers-color-scheme` block guarded by `:not([data-theme='light'])`, so the
 * absence of the attribute IS "follow the OS". Writing `data-theme="system"`
 * would match neither rule and leave the panel stuck in light on a dark machine.
 */
export const applyTheme = (choice: ThemeChoice): void => {
  const root = document.documentElement;
  if (choice === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);
};

export const useTheme = (): [ThemeChoice, (next: ThemeChoice) => void] => {
  const [choice, setChoice] = useState<ThemeChoice>(readTheme);

  useEffect(() => {
    applyTheme(choice);
    try {
      localStorage.setItem(KEY, choice);
    } catch {
      // The theme still applies for this session; it just will not be
      // remembered. Not worth an error message.
    }
  }, [choice]);

  return [choice, setChoice];
};

/* --------------------------------- accent -------------------------------- */

const ACCENT_KEY = 'threadline.admin.accent';

/**
 * Accents an operator can choose for their own panel.
 *
 * A fixed palette rather than a colour wheel, because every one of these has
 * been checked to stay legible against both the light and the dark surface. A
 * free picker lets somebody choose pale yellow and then be unable to read their
 * own buttons. The shop's brand colour is allowed to be anything — it only ever
 * tints a background — but the thing that paints button labels is not.
 */
export const ACCENT_PRESETS = [
  { id: 'store', label: 'Store brand', colour: null },
  { id: 'indigo', label: 'Indigo', colour: '#4f46e5' },
  { id: 'violet', label: 'Violet', colour: '#7c3aed' },
  { id: 'teal', label: 'Teal', colour: '#0d9488' },
  { id: 'emerald', label: 'Emerald', colour: '#059669' },
  { id: 'amber', label: 'Amber', colour: '#b45309' },
  { id: 'rose', label: 'Rose', colour: '#e11d48' },
  { id: 'slate', label: 'Slate', colour: '#475569' },
] as const;

export type AccentId = (typeof ACCENT_PRESETS)[number]['id'];

const isAccent = (value: string | null): value is AccentId =>
  ACCENT_PRESETS.some((preset) => preset.id === value);

export const readAccent = (): AccentId => {
  try {
    const stored = localStorage.getItem(ACCENT_KEY);
    return isAccent(stored) ? stored : 'store';
  } catch {
    return 'store';
  }
};

/**
 * Which accent this operator sees.
 *
 * Per person, not per store, and kept in this browser: two people sharing one
 * shop should be able to tell their own windows apart, and one of them
 * recolouring the panel for everybody is not a setting anyone asked for. It is
 * a preference, not shop data, so it never leaves the machine.
 */
export const useAccent = (): [AccentId, (next: AccentId) => void] => {
  const [accent, setAccent] = useState<AccentId>(readAccent);

  useEffect(() => {
    try {
      localStorage.setItem(ACCENT_KEY, accent);
    } catch {
      // Applies for this session and is forgotten. Not worth failing a click.
    }
    /**
     * The bridge that paints the token reads storage, and storage is not
     * reactive — without this the swatch stores the new accent and the panel
     * keeps the old one until something else happens to re-render.
     */
    window.dispatchEvent(new CustomEvent('threadline:accent'));
  }, [accent]);

  return [accent, setAccent];
};

/** The hex an accent id resolves to, or null for "follow the store". */
export const accentColour = (id: AccentId): string | null =>
  ACCENT_PRESETS.find((preset) => preset.id === id)?.colour ?? null;
