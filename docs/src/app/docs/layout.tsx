import { baseOptions, linkItems, logo } from '@/app/layout.config';
import { AISearchTrigger } from '@/components/ai';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { source } from '@/lib/source';
import { LargeSearchToggle } from 'fumadocs-ui/components/layout/search-toggle';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import 'katex/dist/katex.min.css';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout
      {...baseOptions}
      tree={source.pageTree}
      // just icon items
      links={linkItems.filter((item) => item.type === 'icon')}
      searchToggle={{
        components: {
          lg: (
            <div className="flex gap-1.5 max-md:hidden">
              <LargeSearchToggle className="flex-1" />
              <AISearchTrigger
                aria-label="Ask AI"
                className={cn(
                  buttonVariants({
                    variant: 'outline',
                    size: 'icon',
                    className: 'text-fd-muted-foreground',
                  }),
                )}
              >
                <Sparkles className="size-4" />
              </AISearchTrigger>
            </div>
          ),
        },
      }}
      nav={{
        ...baseOptions.nav,
        title: (
          <>
            {logo}
            <span className="font-medium max-md:hidden [.uwu_&]:hidden">
              TRPC
            </span>
          </>
        ),
        children: (
          <AISearchTrigger
            className={cn(
              buttonVariants({
                variant: 'secondary',
                size: 'sm',
                className:
                  '-translate-1/2 text-fd-muted-foreground absolute left-1/2 top-1/2 gap-2 rounded-full md:hidden',
              }),
            )}
          >
            <Sparkles className="size-4.5 fill-current" />
            Ask AI
          </AISearchTrigger>
        ),
      }}
      sidebar={{
        tabs: {
          transform(option, node) {
            const meta = source.getNodeMeta(node);
            if (!meta || !node.icon) return option;

            const color = `var(--${meta.path.split('/')[0]}-color, var(--color-fd-foreground))`;

            return {
              ...option,
              icon: (
                <div
                  className="max-md:bg-(--tab-color)/10 size-full rounded-lg max-md:border max-md:p-1.5 [&_svg]:size-full"
                  style={
                    {
                      color,
                      '--tab-color': color,
                    } as object
                  }
                >
                  {node.icon}
                </div>
              ),
            };
          },
        },
      }}
    >
      {children}
    </DocsLayout>
  );
}
