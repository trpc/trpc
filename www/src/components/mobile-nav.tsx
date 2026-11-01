import { Link } from '@tanstack/react-router';
import { Menu, Newspaper } from 'lucide-react';
import { useState } from 'react';

import { Button, buttonVariants } from '@shared/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@shared/ui/components/dialog';
import { cn } from '@shared/ui/lib/utils';
import { site } from '~/site.ts';

import { DocsNav } from './docs-nav.tsx';
import { DiscordIcon, GitHubIcon, XIcon } from './icons.tsx';

export function MobileNav() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger
        render={
          <Button
            aria-label="Open navigation"
            className="md:hidden"
            size="icon-sm"
            title="Open navigation"
            variant="ghost"
          />
        }
      >
        <Menu />
      </DialogTrigger>
      <DialogContent className="top-0 left-0 h-dvh max-w-80 content-start translate-x-0 translate-y-0 overflow-y-auto rounded-none border-r p-5 sm:max-w-80">
        <DialogTitle className="sr-only">Navigation</DialogTitle>
        <DialogDescription className="sr-only">
          The blog, and every page of the tRPC docs
        </DialogDescription>
        <nav aria-label="Site" className="flex gap-2 border-b pb-4">
          <Link
            activeProps={{ 'aria-current': 'page' }}
            className={cn(
              buttonVariants({ size: 'sm', variant: 'outline' }),
              'aria-[current=page]:bg-accent',
            )}
            onClick={() => setOpen(false)}
            to="/blog"
          >
            <Newspaper /> Blog
          </Link>
          <a
            className={buttonVariants({ size: 'sm', variant: 'outline' })}
            href={site.github}
          >
            <GitHubIcon /> GitHub
          </a>
          <a
            aria-label="tRPC on X"
            className={buttonVariants({ size: 'icon-sm', variant: 'outline' })}
            href={site.xUrl}
            title="tRPC on X"
          >
            <XIcon />
          </a>
          <a
            aria-label="tRPC on Discord"
            className={buttonVariants({ size: 'icon-sm', variant: 'outline' })}
            href={site.discord}
            title="tRPC on Discord"
          >
            <DiscordIcon />
          </a>
        </nav>
        <p className="text-base leading-none font-medium">Documentation</p>
        <DocsNav
          onNavigate={() => {
            setOpen(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
