import { Link } from '@tanstack/react-router';

import { atTrpcIo, site, v12 } from '~/site.ts';

import { PoweredByVercel } from './powered-by-vercel.tsx';

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto grid max-w-7xl justify-items-start gap-2 px-4 py-8 text-sm text-muted-foreground sm:px-6 md:flex md:items-center md:justify-between md:gap-6">
        <p>
          tRPC is MIT licensed.
          <span data-v12-ui={v12.hidden ? '' : undefined}>
            {' v12 is a preview: APIs can still change before it ships.'}
          </span>
        </p>
        <div className="grid justify-items-start gap-4 md:flex md:items-center md:gap-6">
          <nav aria-label="Footer" className="flex flex-wrap gap-x-4 gap-y-2">
            <Link className="hover:text-foreground" to="/blog">
              Blog
            </Link>
            <a className="hover:text-foreground" href={site.github}>
              GitHub
            </a>
            {atTrpcIo ? null : (
              <a className="hover:text-foreground" href="https://trpc.io">
                v11 docs
              </a>
            )}
            <Link className="hover:text-foreground" to="/sponsor">
              Sponsor
            </Link>
            <a className="hover:text-foreground" href="/llms.txt">
              llms.txt
            </a>
          </nav>
          <PoweredByVercel />
        </div>
      </div>
    </footer>
  );
}
