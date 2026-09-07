/**
 * URL slugs.
 *
 * Diacritics are folded before stripping so `Café Noir` becomes `cafe-noir`
 * rather than `caf-noir` — losing a letter silently changes the URL a merchant
 * expected and breaks any link already shared.
 */
export const slugify = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
