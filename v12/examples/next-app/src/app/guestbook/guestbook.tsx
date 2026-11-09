import { cacheTags } from '@trpc12/tanstack-react-query/rsc';
import { cacheLife, cacheTag } from 'next/cache';
import { caller, trpc } from '../../trpc/server.ts';
import { Entries } from './entries.tsx';

/** Prerendered into the page's static shell, until `sign` revalidates it. */
async function getEntries() {
  'use cache';
  cacheLife('max');
  cacheTag(...cacheTags(trpc.guestbook.list.queryKey()));
  return caller.guestbook.list.query();
}

export async function Guestbook() {
  return <Entries entries={await getEntries()} />;
}
