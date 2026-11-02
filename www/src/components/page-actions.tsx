import { Button, buttonVariants } from '@shared/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@shared/ui/components/dropdown-menu';
import { cn } from '@shared/ui/lib/utils';
import {
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  FileText,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';

import { absoluteUrl } from '~/seo.ts';

interface PageLink {
  readonly external: boolean;
  readonly href: string;
  readonly Icon: LucideIcon;
  readonly label: string;
}

/**
 * Hands the page to an assistant: copy its markdown, open the markdown, or
 * start a chat that reads it. On a phone the links don't fit beside the copy
 * button, so they're in a menu there.
 */
export function PageActions(props: {
  readonly basePath: string;
  readonly slug: string;
}) {
  const markdownPath = `${props.basePath}/${props.slug}.md`;
  const prompt = `Read ${absoluteUrl(markdownPath)} so I can ask questions about it.`;
  const [status, setStatus] = useState<'Copied' | 'Copy failed' | 'Copy page'>(
    'Copy page',
  );
  const links: ReadonlyArray<PageLink> = [
    { external: false, href: markdownPath, Icon: FileText, label: 'Markdown' },
    {
      external: true,
      href: `https://chatgpt.com/?hints=search&q=${encodeURIComponent(prompt)}`,
      Icon: ExternalLink,
      label: 'Ask ChatGPT',
    },
    {
      external: true,
      href: `https://claude.ai/new?q=${encodeURIComponent(prompt)}`,
      Icon: ExternalLink,
      label: 'Ask Claude',
    },
  ];

  return (
    <div className="flex items-center gap-2">
      <Button
        onClick={() => {
          // A promise in the `ClipboardItem` keeps the click's user
          // activation through the fetch, which Safari requires.
          const markdown = fetch(markdownPath).then(async (response) => {
            if (!response.ok) {
              throw new Error(`GET ${markdownPath}: ${response.status}`);
            }
            return new Blob([await response.text()], { type: 'text/plain' });
          });
          void navigator.clipboard
            .write([new ClipboardItem({ 'text/plain': markdown })])
            .catch(async () => {
              const blob = await markdown;
              await navigator.clipboard.writeText(await blob.text());
            })
            .then(
              () => 'Copied' as const,
              () => 'Copy failed' as const,
            )
            .then((result) => {
              setStatus(result);
              setTimeout(() => {
                setStatus('Copy page');
              }, 1500);
            });
        }}
        size="xs"
        variant="outline"
      >
        {status === 'Copied' ? <Check /> : <Copy />}
        {status}
      </Button>
      {links.map((link) => (
        <a
          className={cn(
            buttonVariants({ size: 'xs', variant: 'ghost' }),
            'hidden sm:inline-flex',
          )}
          href={link.href}
          key={link.label}
          {...(link.external ? { rel: 'noopener', target: '_blank' } : {})}
        >
          {link.external ? null : <link.Icon />}
          {link.label}
          {link.external ? <link.Icon /> : null}
        </a>
      ))}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button className="sm:hidden" size="xs" variant="ghost" />}
        >
          Open in <ChevronDown />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-auto min-w-40">
          {links.map((link) => (
            <DropdownMenuItem
              key={link.label}
              render={
                <a
                  href={link.href}
                  {...(link.external
                    ? { rel: 'noopener', target: '_blank' }
                    : {})}
                />
              }
            >
              <link.Icon />
              {link.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
