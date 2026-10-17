import { Link } from '@tanstack/react-router';

import { buttonVariants } from '~/components/ui/button.tsx';
import { firstDoc } from '~/content/docs.ts';
import { cn } from '~/lib/utils.ts';
import { site } from '~/site.ts';

import { GitHubIcon } from './icons.tsx';
import { Logo } from './logo.tsx';
import { MobileNav } from './mobile-nav.tsx';
import { SearchButton } from './search.tsx';
import { ThemeToggle } from './theme-toggle.tsx';

const navLink = cn(
  buttonVariants({ size: 'sm', variant: 'ghost' }),
  'text-muted-foreground',
);

const links = [
  { label: 'Docs', slug: firstDoc },
  { label: 'Client', slug: 'client/overview' },
  { label: 'Adapters', slug: 'adapters/overview' },
  { label: 'Migrating from v11', slug: 'migrations/from-v11' },
] as const;

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4 sm:px-6">
        <MobileNav />
        <Link
          aria-label={`${site.name} home`}
          className="mr-4 flex items-center gap-2 font-semibold tracking-tight"
          to="/"
        >
          <Logo />
          {site.name}
          <span className="rounded-full border px-1.5 py-px font-mono text-[10px] font-medium text-muted-foreground">
            v12
          </span>
        </Link>
        <nav
          aria-label="Main"
          className="hidden items-center gap-1 text-sm md:flex"
        >
          {links.map((link) => (
            <Link
              activeOptions={{ exact: true }}
              activeProps={{ className: 'text-foreground' }}
              className={navLink}
              key={link.label}
              params={{ _splat: link.slug }}
              to="/docs/$"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <SearchButton />
          <a
            aria-label="tRPC on GitHub"
            className={cn(
              buttonVariants({ size: 'icon-sm', variant: 'ghost' }),
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
