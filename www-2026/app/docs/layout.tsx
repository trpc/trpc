import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import type { ReactNode } from 'react';
import { source } from '@/lib/source';
import { baseOptions } from '@/app/layout.config';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout
      tree={source.pageTree}
      {...baseOptions}
      sidebar={{
        banner: (
          <div className="flex flex-col gap-1 rounded-lg border bg-fd-card p-3 text-sm">
            <p className="font-medium">Version</p>
            <div className="flex gap-2">
              <span className="rounded bg-fd-primary/10 px-2 py-0.5 text-xs font-medium text-fd-primary">
                v11 (current)
              </span>
              <a
                href="https://trpc.io/docs/v10"
                className="rounded bg-fd-muted px-2 py-0.5 text-xs text-fd-muted-foreground hover:underline"
              >
                v10
              </a>
              <a
                href="https://trpc.io/docs/v9"
                className="rounded bg-fd-muted px-2 py-0.5 text-xs text-fd-muted-foreground hover:underline"
              >
                v9
              </a>
            </div>
          </div>
        ),
      }}
    >
      {children}
    </DocsLayout>
  );
}
