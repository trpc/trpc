'use server';
import { revalidationTag } from '@trpc12/tanstack-react-query/rsc';
import { experimental_createAction } from '@trpc12/trpc/actions';
import { updateTag } from 'next/cache';
import { appRouter } from '../../server/router.ts';
import { trpc } from '../../trpc/server.ts';

const action = experimental_createAction();
const signEntry = action(appRouter.guestbook.sign);

/**
 * `useActionState`'s action. React sends its return value to the browser as
 * plain objects and arrays: the safe result would lose its `data` and `error`
 * fields and the `TrpcError` its class, so this returns its own state.
 */
export async function sign(_previous: unknown, form: FormData) {
  const [entry, error] = await signEntry(form);
  if (error) return { error: { code: error.code, message: error.message } };
  // Read-your-own-writes: the refreshed page waits for the new list.
  updateTag(revalidationTag(trpc.guestbook.pathKey()));
  return { entry };
}
