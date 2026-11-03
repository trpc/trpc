import { Link, useLocation, useNavigate } from '@tanstack/react-router';
import { Heart } from 'lucide-react';

import { buttonVariants } from '@shared/ui/components/button';
import {
  homeDocs,
  useDocsVersion,
  linksOf,
  useHomeSearch,
} from '~/content/docs.ts';
import { cn } from '@shared/ui/lib/utils';
import {
  allHomeVersions,
  type HomeVersion,
  useV12Shown,
} from '~/home-version.ts';
import { site, v12 } from '~/site.ts';

import { ExperimentsMenu } from './experiments-menu.tsx';
import { DiscordIcon, GitHubIcon, XIcon } from './icons.tsx';
import { Logo } from './logo.tsx';
import { MobileNav } from './mobile-nav.tsx';
import { SearchButton } from './search.tsx';
import { ThemeToggle } from './theme-toggle.tsx';
import { VersionSwitcher } from './version-switcher.tsx';

const navLink = buttonVariants({ size: 'sm', variant: 'ghost' });

const shownFrom = {
  lg: 'hidden lg:inline-flex',
  xl: 'hidden xl:inline-flex',
};

/** The GitHub link is the version's, `GitHubLink`. */
const socialLinks = [
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

/** `disabled`: no `href`, as v12's on the home page until it's shown (`useV12Shown`). */
function DocsLinks(props: {
  readonly disabled?: boolean;
  readonly version: HomeVersion;
}) {
  const route = homeDocs[props.version].route;
  return linksOf[props.version].map((link) => (
    <Link
      activeOptions={{ exact: true }}
      activeProps={{ className: 'text-foreground' }}
      className={cn(navLink, 'from' in link && shownFrom[link.from])}
      disabled={props.disabled === true}
      inactiveProps={{ className: 'text-muted-foreground' }}
      key={link.label}
      params={{ _splat: link.slug }}
      to={route}
    >
      {link.label}
    </Link>
  ));
}

function GitHubLink(props: { readonly version: HomeVersion }) {
  return (
    <a
      aria-label="tRPC on GitHub"
      className={cn(
        buttonVariants({ size: 'icon-sm', variant: 'ghost' }),
        'text-muted-foreground hover:text-foreground hidden sm:inline-flex',
      )}
      href={props.version === 'v12' ? v12.github : site.github}
      title="tRPC on GitHub"
    >
      <GitHubIcon />
    </a>
  );
}

export function SiteHeader() {
  const navigate = useNavigate();
  const version = useDocsVersion();
  // The home page shows either version, so the header has both, and the
  // home page's CSS picks (`[data-home-panel]`).
  const onHome =
    useLocation({ select: (location) => location.pathname }) === '/';
  const linked: HomeVersion = version.id === 'v12' ? 'v12' : 'v11';
  const homeSearch = useHomeSearch();
  const v12Shown = useV12Shown();
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
          search={homeSearch}
          to="/"
        >
          <Logo />
          {site.name}
        </Link>
        <nav
          aria-label="Main"
          className="ml-3 hidden items-center gap-1 text-sm md:flex"
        >
          {onHome ? (
            allHomeVersions.map((home) => (
              <span data-home-panel={home} key={home}>
                <DocsLinks
                  disabled={home === 'v12' && !v12Shown}
                  version={home}
                />
              </span>
            ))
          ) : (
            <DocsLinks version={linked} />
          )}
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
          {/* The experiments are v12's, so v11 readers don't see the menu. */}
          {onHome ? (
            <span data-home-panel="v12">
              <ExperimentsMenu hidden={homeSearch.version !== 'v12'} />
            </span>
          ) : linked === 'v12' ? (
            <ExperimentsMenu />
          ) : null}
          {onHome ? (
            allHomeVersions.map((home) => (
              <span data-home-panel={home} key={home}>
                <GitHubLink version={home} />
              </span>
            ))
          ) : (
            <GitHubLink version={linked} />
          )}
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
          {onHome ? (
            allHomeVersions.map((home) => (
              <span data-home-panel={home} key={home}>
                <VersionSwitcher version={homeDocs[home]} />
              </span>
            ))
          ) : (
            <VersionSwitcher />
          )}
          <ThemeToggle />
          <SearchButton />
        </div>
      </div>
    </header>
  );
}
