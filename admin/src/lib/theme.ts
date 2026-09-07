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
