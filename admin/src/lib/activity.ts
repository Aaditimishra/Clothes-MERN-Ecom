import { useEffect, useRef, useState } from 'react';

import { api } from './api';

export interface ShopActivity {
  toPack: number;
  awaitingPayment: number;
  toVerify: number;
  latestOrderReference: string | null;
  latestOrderAt: string | null;
}

/** What this browser has already announced, so a reload does not re-announce. */
const SEEN_KEY = 'threadline.admin.lastSeenOrder';
/** Whether this operator wants desktop banners at all. */
const ALERTS_KEY = 'threadline.admin.alerts';

const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const write = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private browsing. Works for this session and is forgotten.
  }
};

export type AlertState = 'unsupported' | 'off' | 'blocked' | 'on';

export const alertState = (): AlertState => {
  if (typeof Notification === 'undefined') return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  if (Notification.permission !== 'granted') return 'off';
  return read(ALERTS_KEY) === 'off' ? 'off' : 'on';
};

/**
 * Asks for permission, which the browser only allows from a real click.
 *
 * Prompting on load is both refused by Chrome and the reason people block
 * notifications for a site forever — the request has to follow somebody
 * deciding they want them.
 */
export const enableAlerts = async (): Promise<AlertState> => {
  if (typeof Notification === 'undefined') return 'unsupported';

  if (Notification.permission === 'granted') {
    write(ALERTS_KEY, 'on');
    return 'on';
  }

  const result = await Notification.requestPermission();
  if (result === 'granted') {
    write(ALERTS_KEY, 'on');
    return 'on';
  }
  return result === 'denied' ? 'blocked' : 'off';
};

export const disableAlerts = (): void => write(ALERTS_KEY, 'off');

/**
 * Draws a desktop banner.
 *
 * Two details here are the difference between this working and appearing to
 * work exactly once.
 *
 * The **tag is per kind, not per destination**. Orders and payments both lead
 * to a queue screen, so tagging by path made a payment banner silently replace
 * an order one.
 *
 * And **`renotify`** — without it a second notification carrying the same tag
 * replaces the first *silently*: no sound, no banner, the notification updated
 * in place rather than announced. That is precisely how a shop ends up seeing
 * one alert all morning and believing the rest never fired.
 */
const announce = (title: string, body: string, tag: string): void => {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

  try {
    const options: NotificationOptions & { renotify?: boolean } = {
      body,
      tag,
      renotify: true,
      icon: '/favicon.ico',
    };
    const notification = new Notification(title, options);
    // Clicking it should bring the panel forward, which is the only reason
    // somebody clicks a notification.
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  } catch {
    // A banner that will not draw must never break the panel.
  }
};

/**
 * Polls for work and announces what is new.
 *
 * Twenty seconds: fast enough that a merchant hears about an order while the
 * customer is still on the confirmation page, slow enough to be three requests
 * a minute rather than a load test.
 *
 * The honest limit, worth stating: this fires only while a panel tab is open.
 * Real Web Push survives a closed browser and this does not — but it needs a
 * service worker, VAPID keys and Google's delivery, and for a shop with the
 * panel open on the counter all day this is the difference between being told
 * and not.
 */
export const useActivityMonitor = (enabled: boolean, everyMs = 20_000): ShopActivity | null => {
  const [activity, setActivity] = useState<ShopActivity | null>(null);
  const previous = useRef<ShopActivity | null>(null);
  const lastSeen = useRef<string | null>(read(SEEN_KEY));

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;

    const poll = async () => {
      try {
        const next = await api<ShopActivity>('/activity');
        if (stopped) return;

        const before = previous.current;
        previous.current = next;
        setActivity(next);

        /**
         * The first poll only establishes a baseline.
         *
         * Announcing on it would greet whoever opens the panel with a banner
         * for an order from Tuesday, every single morning.
         */
        if (!before) {
          if (!lastSeen.current && next.latestOrderReference) {
            lastSeen.current = next.latestOrderReference;
            write(SEEN_KEY, next.latestOrderReference);
          }
          return;
        }

        if (next.latestOrderReference && next.latestOrderReference !== lastSeen.current) {
          announce(
            `New order ${next.latestOrderReference}`,
            `${next.toPack} order${next.toPack === 1 ? '' : 's'} waiting to be packed.`,
            'new-order',
          );
          lastSeen.current = next.latestOrderReference;
          write(SEEN_KEY, next.latestOrderReference);
        }

        if (next.toVerify > before.toVerify) {
          announce(
            'A payment needs checking',
            `${next.toVerify} transfer${next.toVerify === 1 ? '' : 's'} to match against your statement.`,
            'payment-claim',
          );
        }
      } catch {
        // A failed poll is not worth a banner or an error on screen. The next
        // one is twenty seconds away.
      }
    };

    void poll();
    const timer = setInterval(() => void poll(), everyMs);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [enabled, everyMs]);

  return activity;
};
