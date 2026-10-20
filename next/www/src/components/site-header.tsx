import { Link, useLocation } from '@tanstack/react-router';

import { buttonVariants } from '@shared/ui/components/button';
import {
  homeDocs,
  useDocsVersion,
  useHomeSearch,
  v11Docs,
  v12Docs,
} from '~/content/docs.ts';
import { cn } from '@shared/ui/lib/utils';
import {
  allHomeVersions,
  type HomeVersion,
  useV12Shown,
} from '~/home-version.ts';
import { site, v12 } from '~/site.ts';

import { ExperimentsMenu } from './experiments-menu.tsx';
import { GitHubIcon } from './icons.tsx';
import { Logo } from './logo.tsx';
import { MobileNav } from './mobile-nav.tsx';
import { SearchButton } from './search.tsx';
import { ThemeToggle } from './theme-toggle.tsx';
import { VersionSwitcher } from './version-switcher.tsx';

const navLink = buttonVariants({ size: 'sm', variant: 'ghost' });

/** v11's are trpc.io's navbar links; the older versions' pages get them too. */
const linksOf = {
  v11: [
    { label: 'Docs', slug: v11Docs.firstDoc },
    { label: 'Quickstart', slug: 'quickstart' },
    { label: 'Using Next.js', slug: 'client/nextjs' },
  ],
  v12: [
    { label: 'Docs', slug: v12Docs.firstDoc },
    { label: 'Client', slug: 'client/overview' },
    { label: 'Adapters', slug: 'adapters/overview' },
    // From `md` to `lg` the header has no room for it; the sidebar links it.
    { label: 'Migrating from v11', slug: 'migrations/from-v11', wide: true },
  ],
} as const;

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
      className={cn(navLink, 'wide' in link && 'hidden lg:inline-flex')}
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
        'hidden sm:inline-flex',
      )}
      href={props.version === 'v12' ? v12.github : site.github}
      title="tRPC on GitHub"
    >
      <GitHubIcon />
    </a>
  );
}

export function SiteHeader() {
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
          search={homeSearch}
          to="/"
        >
          <Logo />
          {site.name}
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
        <div className="ml-auto flex items-center gap-1">
          <SearchButton />
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
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
