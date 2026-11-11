import { Link, useNavigate, useRouterState } from '@tanstack/react-router';
import { Heart } from 'lucide-react';
import { useEffect, useState } from 'react';

import { buttonVariants } from '@shared/ui/components/button';
import { v11Docs } from '~/content/docs.ts';
import { cn } from '@shared/ui/lib/utils';
import { showsPartnersBar } from '~/partners-bar.ts';
import { docsLinks, site } from '~/site.ts';
import { partners } from '~/sponsors.ts';

import { DiscordIcon, GitHubIcon, XIcon } from './icons.tsx';
import { Logo } from './logo.tsx';
import { MobileNav } from './mobile-nav.tsx';
import { SearchButton } from './search.tsx';
import { PartnersBar } from './sponsors/partners.tsx';
import { ThemeToggle } from './theme-toggle.tsx';
import { VersionSwitcher } from './version-switcher.tsx';

const navLink = buttonVariants({ size: 'sm', variant: 'ghost' });

const shownFrom = {
  lg: 'hidden lg:inline-flex',
  xl: 'hidden xl:inline-flex',
};

const socialLinks = [
  {
    className: 'hidden sm:inline-flex',
    href: site.github,
    Icon: GitHubIcon,
    label: 'tRPC on GitHub',
  },
  {
    className: 'hidden md:inline-flex',
    href: site.xUrl,
    Icon: XIcon,
    label: 'tRPC on X',
  },
  {
    className: 'hidden md:inline-flex',
    href: site.discord,
    Icon: DiscordIcon,
    label: 'tRPC on Discord',
  },
] as const;

function DocsLinks() {
  return docsLinks.map((link) => (
    <Link
      activeOptions={{ exact: true, includeSearch: false }}
      activeProps={{ className: 'text-foreground' }}
      className={cn(navLink, 'from' in link && shownFrom[link.from])}
      inactiveProps={{ className: 'text-muted-foreground' }}
      key={link.label}
      params={{ _splat: link.slug }}
      to={v11Docs.route}
    >
      {link.label}
    </Link>
  ));
}

/**
 * `value`, changing a frame after the page that changed it is painted. The
 * frame that draws a new page can be slow enough that a transition started
 * in it is mostly over before it shows.
 */
function useAfterPaint(value: boolean) {
  const [painted, setPainted] = useState(value);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setPainted(value));
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return painted;
}

export function SiteHeader() {
  const navigate = useNavigate();
  const showPartners = useAfterPaint(
    useRouterState({
      select: (state) =>
        state.matches.every((match) => match.status !== 'notFound') &&
        showsPartnersBar(state.matches.at(-1)?.pathname ?? '/'),
    }),
  );
  return (
    <header
      className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70"
      data-site-header
    >
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4 sm:px-6">
        <MobileNav />
        <Link
          aria-label={`${site.name} home`}
          className="mr-1.5 flex items-center gap-2 font-bold tracking-tight"
          onContextMenu={(event) => {
            event.preventDefault();
            void navigate({ to: '/media' });
          }}
          to="/"
        >
          <Logo />
          {site.name}
        </Link>
        <nav
          aria-label="Main"
          className="ml-3 hidden items-center gap-1 text-sm md:flex"
        >
          <DocsLinks />
          <Link
            activeProps={{ className: 'text-foreground' }}
            className={navLink}
            inactiveProps={{ className: 'text-muted-foreground' }}
            to="/blog"
          >
            Blog
          </Link>
        </nav>
        {/* In trpc.io's order. */}
        <div className="ml-auto flex items-center gap-1">
          {socialLinks.map((link) => (
            <a
              aria-label={link.label}
              className={cn(
                buttonVariants({ size: 'icon-sm', variant: 'ghost' }),
                'text-muted-foreground hover:text-foreground',
                link.className,
              )}
              href={link.href}
              key={link.href}
              title={link.label}
            >
              <link.Icon />
            </a>
          ))}
          <Link
            activeProps={{ className: 'text-pink-500 *:fill-current' }}
            aria-label="Sponsor tRPC"
            className={cn(
              buttonVariants({ size: 'icon-sm', variant: 'ghost' }),
              'hidden hover:text-pink-500 hover:*:fill-current md:inline-flex',
            )}
            inactiveProps={{ className: 'text-muted-foreground' }}
            title="Sponsor tRPC"
            to="/sponsor"
          >
            <Heart />
          </Link>
          <VersionSwitcher />
          <ThemeToggle />
          <SearchButton />
        </div>
      </div>
      {partners.length > 0 ? (
        // Kept mounted and folded where it doesn't show, so it grows and
        // shrinks between pages and the content under it slides.
        <div
          className={cn(
            'overflow-hidden transition-[height] duration-200 ease-out motion-reduce:transition-none md:hidden',
            showPartners ? 'h-9' : 'h-0',
          )}
          data-partners-bar={showPartners ? 'shown' : 'hidden'}
          inert={!showPartners}
        >
          <PartnersBar className="px-4 sm:px-6" />
        </div>
      ) : null}
    </header>
  );
}
