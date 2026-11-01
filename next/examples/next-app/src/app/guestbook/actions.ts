'use server';
import { revalidationTag } from '@trpc12/tanstack-react-query/rsc';
import { experimental_createAction } from '@trpc12/trpc/actions';
import { updateTag } from 'next/cache';
import { appRouter, t } from '../../server/router.ts';
import { trpc } from '../../trpc/server.ts';

const action = experimental_createAction(t);
const signEntry = action(appRouter.guestbook.sign);

/**
 * `useActionState`'s action. `updateTag` only works in a Server Action, not
 * in the procedure, which the route handler serves too.
 */
export async function sign(_previous: unknown, form: FormData) {
  const result = await signEntry(form);
  // Read-your-own-writes: the refreshed page waits for the new list.
  if (!result.error) updateTag(revalidationTag(trpc.guestbook.pathKey()));
  return result;
}
