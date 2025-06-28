'use client';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { useState, type ReactElement } from 'react';

export function WidthTrigger(): ReactElement {
  const [enabled, setEnabled] = useState(false);

  return (
    <button
      type="button"
      className={cn(buttonVariants({ variant: 'secondary' }))}
      onClick={() => {
        setEnabled((prev) => !prev);
      }}
    >
      {enabled ? <style>{`:root { --fd-layout-width: 1400px; }`}</style> : null}
      Trigger Width:
      <span className="text-fd-muted-foreground ms-1.5">
        {enabled ? '1400px' : 'default'}
      </span>
    </button>
  );
}
