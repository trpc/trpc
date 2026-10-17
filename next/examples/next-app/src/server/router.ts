import { initTrpc } from '@trpc12/trpc/server';
import { z } from 'zod';

export interface Post {
  id: string;
  title: string;
  createdAt: Date;
}

const posts = new Map<string, Post>([
  ['1', { id: '1', title: 'Rendered on the server', createdAt: new Date(0) }],
]);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const t = initTrpc();

export const appRouter = {
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
};
export type AppRouter = typeof appRouter;
