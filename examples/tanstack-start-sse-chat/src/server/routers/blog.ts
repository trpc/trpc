/**
 * A fake blog, kept in memory. Its pages load a post and its author in one
 * request: see `/src/routes/blog/$slug.tsx`
 */
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { baseProcedure, router } from '../trpc';

const authors = [
  {
    id: 'ada',
    name: 'Ada Brandt',
    bio: 'Writes about databases and the people who page them at night.',
  },
  {
    id: 'lin',
    name: 'Lin Okafor',
    bio: 'Frontend engineer. Has opinions about loading spinners.',
  },
  {
    id: 'sam',
    name: 'Sam Veldkamp',
    bio: 'Runs the platform team and a small sourdough operation.',
  },
];

const posts = [
  {
    slug: 'the-cheapest-request',
    title: 'The cheapest request is the one you never send',
    authorId: 'lin',
    publishedAt: new Date('2026-10-02'),
    body: 'A page that loads a post, then its author, then the author’s other posts pays for the network three times. Most of that wait is the trip, not the work.',
  },
  {
    slug: 'indexes-are-a-promise',
    title: 'An index is a promise you make to your future self',
    authorId: 'ada',
    publishedAt: new Date('2026-09-18'),
    body: 'Every index speeds up a read you expect and slows down every write you forgot about. Pick the reads you can name.',
  },
  {
    slug: 'skeletons-in-the-ui',
    title: 'Skeletons in the UI',
    authorId: 'lin',
    publishedAt: new Date('2026-08-30'),
    body: 'A skeleton screen is an apology in advance. It is still better than a layout that jumps when the data lands.',
  },
  {
    slug: 'on-call-is-a-design-review',
    title: 'On-call is a design review that happens at 3am',
    authorId: 'sam',
    publishedAt: new Date('2026-08-11'),
    body: 'If a system needs a person awake to keep it running, the system is not finished yet.',
  },
  {
    slug: 'migrations-without-fear',
    title: 'Migrations without fear',
    authorId: 'ada',
    publishedAt: new Date('2026-07-24'),
    body: 'Add the column, write to both, backfill, read from the new one, drop the old one. Five dull deploys beat one exciting one.',
  },
];

/** How long each procedure takes, so the timeline on the page has something to show */
const WORK_MS = 150;

const blogProcedure = baseProcedure.use(async (opts) => {
  await new Promise((resolve) => setTimeout(resolve, WORK_MS));
  return opts.next();
});

export const blogRouter = router({
  posts: blogProcedure
    .input(
      z
        .object({
          /** Only posts by this author */
          authorId: z.string().optional(),
          /** Leave this post out */
          exceptSlug: z.string().optional(),
        })
        .optional(),
    )
    .query((opts) =>
      posts
        .filter(
          (post) =>
            (opts.input?.authorId === undefined ||
              post.authorId === opts.input.authorId) &&
            post.slug !== opts.input?.exceptSlug,
        )
        .map((post) => ({
          slug: post.slug,
          title: post.title,
          authorId: post.authorId,
          publishedAt: post.publishedAt,
        })),
    ),
  postBySlug: blogProcedure
    .input(z.object({ slug: z.string() }))
    .query((opts) => {
      const post = posts.find((it) => it.slug === opts.input.slug);
      if (!post) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }
      return post;
    }),
  authorById: blogProcedure
    .input(z.object({ id: z.string() }))
    .query((opts) => {
      const author = authors.find((it) => it.id === opts.input.id);
      if (!author) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }
      return author;
    }),
  authorsByIds: blogProcedure
    .input(z.object({ ids: z.array(z.string()) }))
    .query((opts) =>
      authors
        .filter((author) => opts.input.ids.includes(author.id))
        .map((author) => ({ id: author.id, name: author.name })),
    ),
});
