'use client';

import dynamic from 'next/dynamic';
import { useState, type ButtonHTMLAttributes } from 'react';

// lazy load the dialog
const SearchAI = dynamic(() => import('./search'), { ssr: false });

/**
 * The trigger component for AI search dialog.
 *
 * Use it like a normal button component.
 */
export function AISearchTrigger(
  props: ButtonHTMLAttributes<HTMLButtonElement>,
) {
  const [open, setOpen] = useState<boolean>();

  return (
    <>
      {open !== undefined ? (
        <SearchAI open={open} onOpenChange={setOpen} />
      ) : null}
      <button {...props} onClick={() => setOpen(true)} />
    </>
  );
}
