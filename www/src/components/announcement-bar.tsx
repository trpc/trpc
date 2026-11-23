import { Link, useRouterState } from '@tanstack/react-router';
import { X } from 'lucide-react';

import { announcement, dismissAnnouncement } from '~/announcement.ts';
import { v11Docs } from '~/content/docs.ts';

/**
 * A line above the site header, until the reader dismisses it or it expires
 * (see `announcement`). Whether it shows lives on <html>, set before first
 * paint, so the prerendered page and hydration agree.
 */
export function AnnouncementBar() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  // The page it links to doesn't need it
  if (pathname.replace(/\/+$/, '') === `/docs/${announcement.slug}`) {
    return null;
  }
  return (
    <aside
      aria-label="Announcement"
      className="flex items-center gap-2 border-b bg-muted/50 py-2 pr-2 pl-4 text-sm in-data-[announcement-hidden]:hidden sm:pl-6"
    >
      <Link
        className="min-w-0 flex-1 text-center text-pretty hover:underline hover:underline-offset-2"
        params={{ _splat: announcement.slug }}
        to={v11Docs.route}
      >
        Waterfalls: gorgeous in Iceland, terrible in your network tab.{' '}
        <span className="font-medium whitespace-nowrap text-link">
          Introducing query handles ➡️
        </span>
      </Link>
      <button
        aria-label="Dismiss announcement"
        className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
        onClick={dismissAnnouncement}
        type="button"
      >
        <X className="size-4" />
      </button>
    </aside>
  );
}
