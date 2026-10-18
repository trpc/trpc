import { Link } from '@tanstack/react-router';

import { site } from '~/site.ts';

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto grid max-w-7xl gap-2 px-4 py-8 text-sm text-muted-foreground sm:px-6 md:flex md:items-center md:justify-between">
        <p>
          tRPC is MIT licensed. v12 is a preview: APIs can still change before
          it ships.
        </p>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-4 gap-y-2">
          <Link className="hover:text-foreground" to="/blog">
            Blog
          </Link>
          <a className="hover:text-foreground" href={site.github}>
            GitHub
          </a>
          <a className="hover:text-foreground" href="https://trpc.io">
            v11 docs
          </a>
          <Link className="hover:text-foreground" hash="sponsors" to="/">
            Sponsors
          </Link>
          <Link className="hover:text-foreground" hash="credits" to="/">
            Credits
          </Link>
          <a className="hover:text-foreground" href="/llms.txt">
            llms.txt
          </a>
        </nav>
      </div>
    </footer>
  );
}
