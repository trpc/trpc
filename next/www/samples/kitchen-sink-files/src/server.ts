import { createFetchHandler, initTrpc } from '@trpc12/trpc/server';
import { z } from 'zod';

import { transformer } from './transformer.ts';

const initials = (name: string) =>
  new File(
    [
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#398ccb"/><text x="32" y="41" font-family="sans-serif" font-size="26" text-anchor="middle" fill="#fff">${name.slice(0, 1)}</text></svg>`,
    ],
    'initials.svg',
    { type: 'image/svg+xml' },
  );

// The demo's database lives in memory, in this page: each edit to the code
// starts it over.
const db = { name: 'Ada Lovelace', avatar: initials('Ada') };

const t = initTrpc();

// #region router
/** An uploaded avatar: the server checks what the browser sent. */
const avatar = z
  .instanceof(File, { error: 'Pick a file' })
  .refine(
    (file) => ['image/png', 'image/jpeg', 'image/webp'].includes(file.type),
    'A PNG, JPEG or WebP image',
  )
  .refine((file) => file.size <= 200 * 1024, 'At most 200 kB');

export const appRouter = t.router({
  profile: {
    get: t.procedure.query(() => ({
      name: db.name,
      avatar: { name: db.avatar.name, size: db.avatar.size },
    })),
    // A `File` that's the whole output is the response's body, with its
    // type, and comes back as a `File`.
    avatar: t.procedure.query(() => db.avatar),
    update: t.procedure
      // The file sits in an object: `httpLink` sends the call as multipart.
      .input(
        z.object({
          name: z.string().trim().min(1, 'Enter your name'),
          avatar: avatar.optional(),
        }),
      )
      .mutation((opts) => {
        db.name = opts.input.name;
        db.avatar = opts.input.avatar ?? db.avatar;
        return { name: db.name };
      }),
  },
});

export type AppRouter = typeof appRouter;
// #endregion router

export const handler = createFetchHandler({ router: appRouter, transformer });
