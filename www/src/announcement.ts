/**
 * The bar above the site header (`AnnouncementBar`). To announce something
 * else, change `id` too, so readers who dismissed this one see the new one.
 * After `until`, no page shows it, even one cached before then: remove or
 * replace it when you next touch it.
 */
export const announcement = {
  id: 'handles',
  /** The v11 docs page it links to. */
  slug: 'client/tanstack-react-query/handles',
  until: '2026-12-09T00:00:00Z',
} as const;

const storageKey = 'trpc-docs:announcement-dismissed';

/** Set on <html> when the bar is hidden; its CSS hides it before first paint. */
export const hiddenAttribute = 'data-announcement-hidden';

/**
 * Sets `attribute` on <html> when the reader dismissed announcement `id`, or
 * `until` has passed. Stringified into `announcementScript`, so it can't use
 * anything from its module scope.
 */
export function hideAnnouncement(opts: {
  readonly attribute: string;
  readonly id: string;
  readonly key: string;
  readonly until: number;
}) {
  let dismissed: string | null = null;
  try {
    dismissed = localStorage.getItem(opts.key);
  } catch {
    // Storage is blocked: show it until it expires.
  }
  if (dismissed === opts.id || Date.now() >= opts.until) {
    document.documentElement.setAttribute(opts.attribute, '');
  }
}

/** Runs before first paint, so a dismissed or expired bar never flashes. */
export const announcementScript = `(${hideAnnouncement.toString()})(${JSON.stringify(
  {
    attribute: hiddenAttribute,
    id: announcement.id,
    key: storageKey,
    until: Date.parse(announcement.until),
  },
)});`;

/** Hides the bar now and on every later page. */
export function dismissAnnouncement() {
  document.documentElement.setAttribute(hiddenAttribute, '');
  try {
    localStorage.setItem(storageKey, announcement.id);
  } catch {
    // Storage is blocked: it's hidden until the next page load.
  }
}
