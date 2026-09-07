import { Link } from 'react-router-dom';

import { useStoreConfig } from '../lib/store-config';

/**
 * Shop links are routes, not content, so they stay in code.
 *
 * Everything else in the footer comes from published pages — a merchant adding
 * "Sustainability" should not need anyone to put a link to it anywhere.
 */
const SHOP_COLUMN = [
  { label: 'New in', to: '/shop?sort=newest' },
  { label: 'Women', to: '/shop?category=women' },
  { label: 'Men', to: '/shop?category=men' },
  { label: 'Sale', to: '/shop?sort=discount' },
  { label: 'Journal', to: '/journal' },
];

export const Footer = () => {
  const { data } = useStoreConfig();
  const settings = data?.settings;
  const groups = Object.entries(data?.footer ?? {});

  return (
    <footer className="footer">
      <div className="shell footer-inner">
        <div className="footer-brand">
          <p className="logo">{settings?.storeName ?? 'Threadline'}</p>
          <p className="muted">
            {settings?.tagline
              ? `${settings.tagline}. Cut properly, priced honestly, made to be worn for years.`
              : 'Considered clothing in natural fibres.'}
          </p>
          {settings?.supportEmail ? (
            <p className="muted footer-contact">
              <a href={`mailto:${settings.supportEmail}`}>{settings.supportEmail}</a>
              {settings.supportPhone ? ` · ${settings.supportPhone}` : ''}
            </p>
          ) : null}
        </div>

        <nav aria-label="Shop">
          <p className="eyebrow">Shop</p>
          <ul>
            {SHOP_COLUMN.map((link) => (
              <li key={link.label}>
                <Link to={link.to}>{link.label}</Link>
              </li>
            ))}
          </ul>
        </nav>

        {groups.map(([group, pages]) => (
          <nav key={group} aria-label={group}>
            <p className="eyebrow">{group}</p>
            <ul>
              {pages.map((page) => (
                <li key={page.slug}>
                  <Link to={`/page/${page.slug}`}>{page.title}</Link>
                </li>
              ))}
              {group === 'Help' ? (
                <li>
                  <Link to="/account">Track an order</Link>
                </li>
              ) : null}
            </ul>
          </nav>
        ))}
      </div>

      <div className="shell footer-base">
        <span className="muted">
          © {new Date().getFullYear()} {settings?.storeName ?? 'Threadline'}
          {settings?.identity.legalName ? ` · ${settings.identity.legalName}` : ''}
        </span>
        <span className="muted">
          All prices include GST
          {settings?.identity.gstin ? ` · GSTIN ${settings.identity.gstin}` : ''}
        </span>
      </div>
    </footer>
  );
};
