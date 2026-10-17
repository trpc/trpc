import { Button } from '@shared/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@shared/ui/components/dialog';
import { Menu } from 'lucide-react';
import { useState } from 'react';

import { site } from '~/site.ts';

import { DocsNav } from './docs-nav.tsx';
import { GitHubIcon } from './icons.tsx';

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
        <DialogTitle>Documentation</DialogTitle>
        <DialogDescription className="sr-only">
          Every page of the tRPC docs
        </DialogDescription>
        <DocsNav
          onNavigate={() => {
            setOpen(false);
          }}
        />
        <a
          className="flex items-center gap-2 border-t px-2 pt-4 text-sm text-muted-foreground hover:text-foreground [&_svg]:size-4"
          href={site.github}
        >
          <GitHubIcon /> tRPC on GitHub
        </a>
      </DialogContent>
    </Dialog>
  );
}
