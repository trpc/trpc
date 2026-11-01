import { initTrpc } from '@trpc12/trpc/server';
import { z } from 'zod';

export interface Post {
  id: string;
  title: string;
  createdAt: Date;
}

export interface Entry {
  id: string;
  name: string;
  message: string;
  createdAt: Date;
}

// Next bundles the route handler and the pages separately, each with its own
// copy of this module, so the in-memory "database" lives on `globalThis`.
const db = ((
  globalThis as { exampleDb?: ReturnType<typeof seed> }
).exampleDb ??= seed());
const posts = db.posts;
const entries = db.entries;

function seed() {
  return {
    posts: new Map<string, Post>([
      [
        '1',
        { id: '1', title: 'Rendered on the server', createdAt: new Date(0) },
      ],
    ]),
    entries: [
      {
        id: '1',
        name: 'tRPC',
        message: 'Cached in the Next data cache',
        createdAt: new Date(0),
      },
    ] as Entry[],
  };
}
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const t = initTrpc();

export const appRouter = t.router({
  post: {
    list: t.procedure.query(() => [...posts.values()]),
    create: t.procedure
      .input(z.object({ title: z.string().min(1) }))
      .mutation((opts) => {
        const post: Post = {
          id: String(posts.size + 1),
          title: opts.input.title,
          createdAt: new Date(),
        };
        posts.set(post.id, post);
        return post;
      }),
  },
  guestbook: {
    /** Read by a `'use cache'` function tagged with `cacheTags`. */
    list: t.procedure.query(() => [...entries]),
    /** Wrapped as a Server Action, which revalidates `list` after a write. */
    sign: t.procedure
      .errors({ CONFLICT: { message: 'Someone already wrote that' } })
      .input(
        z.object({
          name: z.string().trim().min(1).max(40),
          message: z.string().trim().min(1).max(280),
        }),
      )
      .mutation((opts) => {
        if (entries.some((entry) => entry.message === opts.input.message)) {
          return opts.errors.CONFLICT();
        }
        const entry: Entry = {
          id: String(entries.length + 1),
          ...opts.input,
          createdAt: new Date(),
        };
        entries.push(entry);
        return entry;
      }),
  },
  chat: {
    /** A streamed mutation: the browser shows each word as it arrives. */
    reply: t.procedure
      .input(z.object({ text: z.string().min(1) }))
      .mutation(async function* (opts) {
        for (const word of `You said: ${opts.input.text}`.split(' ')) {
          if (opts.signal.aborted) return;
          await sleep(30);
          yield `${word} `;
        }
      }),
  },
  files: {
    /** A `File` input: the client sends `multipart/form-data`. */
    upload: t.procedure
      .input(z.object({ file: z.instanceof(File) }))
      .mutation(async ({ input }) => ({
        name: input.file.name,
        size: input.file.size,
        preview: (await input.file.text()).slice(0, 40),
      })),
    /** A `File` output is the response body. */
    download: t.procedure.input(z.object({ name: z.string() })).query(
      (opts) =>
        new File(
          [`hello from ${opts.input.name}\n`],
          `${opts.input.name}.txt`,
          {
            type: 'text/plain',
          },
        ),
    ),
  },
});
export type AppRouter = typeof appRouter;
