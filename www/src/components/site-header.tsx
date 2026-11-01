import { Link, useNavigate } from '@tanstack/react-router';

import { buttonVariants } from '@shared/ui/components/button';
import { v11Docs } from '~/content/docs.ts';
import { cn } from '@shared/ui/lib/utils';
import { site } from '~/site.ts';

import { GitHubIcon } from './icons.tsx';
import { Logo } from './logo.tsx';
import { MobileNav } from './mobile-nav.tsx';
import { SearchButton } from './search.tsx';
import { ThemeToggle } from './theme-toggle.tsx';
import { VersionSwitcher } from './version-switcher.tsx';

const navLink = buttonVariants({ size: 'sm', variant: 'ghost' });

/** trpc.io's navbar links; the older versions' pages get them too. */
const links = [
  { label: 'Docs', slug: v11Docs.firstDoc },
  { label: 'Quickstart', slug: 'quickstart' },
  { label: 'Using Next.js', slug: 'client/nextjs' },
] as const;

function DocsLinks() {
  return links.map((link) => (
    <Link
      activeOptions={{ exact: true }}
      activeProps={{ className: 'text-foreground' }}
      className={navLink}
      inactiveProps={{ className: 'text-muted-foreground' }}
      key={link.label}
      params={{ _splat: link.slug }}
      to={v11Docs.route}
    >
      {link.label}
    </Link>
  ));
}

export function SiteHeader() {
  const navigate = useNavigate();
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
        <VersionSwitcher />
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
        <div className="ml-auto flex items-center gap-1">
          <SearchButton />
          <a
            aria-label="tRPC on GitHub"
            className={cn(
              buttonVariants({ size: 'icon-sm', variant: 'ghost' }),
              'hidden sm:inline-flex',
            )}
            href={site.github}
            title="tRPC on GitHub"
          >
            <GitHubIcon />
          </a>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
