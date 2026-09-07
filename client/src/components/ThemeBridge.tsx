import { useEffect } from 'react';

import { useSettings } from '../lib/store-config';
import { useTheme } from '../store/theme';

/**
 * Writes the merchant's palette onto `:root` as CSS custom properties.
 *
 * Every colour in the stylesheet already resolves to one of these tokens, so
 * setting them here re-skins the whole shop without touching a single rule. The
 * stylesheet's own values stay as the defaults, which is what the page renders
 * with before this request lands — a shop that flashes unstyled while waiting
 * for its own theme is worse than one that starts on the shipped palette.
 *
 * Only the LIGHT palette is overridden. Dark mode keeps its own neutrals and
 * borrows just the accent: a merchant-chosen cream surface would make the dark
 * theme unreadable, and asking someone to pick two full palettes in order to
 * change one colour is a worse trade than the constraint.
 */
const LIGHT_TOKENS: Array<[cssVariable: string, key: keyof NonNullable<ReturnType<typeof useSettings>>['branding']]> = [
  ['--ink', 'text'],
  ['--ink-3', 'textMuted'],
  ['--paper', 'surface'],
  ['--paper-2', 'surfaceMuted'],
  ['--paper-3', 'surfaceSunken'],
  ['--line', 'border'],
  ['--success', 'success'],
  ['--warn', 'warning'],
  ['--sale', 'danger'],
];

/** Safe in both themes, so these are applied whatever the shopper picked. */
const ALWAYS_TOKENS: Array<[string, keyof NonNullable<ReturnType<typeof useSettings>>['branding']]> = [
  ['--accent', 'accent'],
  ['--accent-ink', 'accentInk'],
  ['--font-body', 'fontBody'],
  ['--font-display', 'fontDisplay'],
  ['--radius', 'radius'],
];

export const ThemeBridge = () => {
  const settings = useSettings();
  // Read from the store, not from `document`. A DOM attribute is not reactive,
  // so depending on it would leave the light palette applied after a shopper
  // switched to dark until something else happened to re-render.
  const { theme } = useTheme();

  useEffect(() => {
    if (!settings) return;

    const root = document.documentElement;
    const branding = settings.branding;
    const isDark = theme === 'dark';

    for (const [token, key] of ALWAYS_TOKENS) {
      root.style.setProperty(token, String(branding[key]));
    }

    // `--accent-soft` is a tint of the accent, so it is only trustworthy in the
    // light theme; dark mode keeps its own, which already reads against a dark
    // ground.
    if (!isDark) {
      root.style.setProperty('--accent-soft', branding.accentSoft);
      for (const [token, key] of LIGHT_TOKENS) {
        root.style.setProperty(token, String(branding[key]));
      }
    } else {
      root.style.removeProperty('--accent-soft');
      for (const [token] of LIGHT_TOKENS) root.style.removeProperty(token);
    }

  }, [settings, theme]);

  return null;
};
