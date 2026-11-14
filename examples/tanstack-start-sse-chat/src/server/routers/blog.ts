/**
 * A blog, kept in memory. Its pages load a post and its author in one
 * request: see `/src/routes/blog/$slug.tsx`
 */
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { publicProcedure, router } from '../trpc';

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

interface Post {
  slug: string;
  title: string;
  authorId: string;
  publishedAt: Date;
  body: string;
}

/** Enough titles for each author's "More by" list to need a few pages */
const titlesByAuthor: Record<string, string[]> = {
  lin: [
    'The cheapest request is the one you never send',
    'Skeletons in the UI',
    'A spinner is not a plan',
    'What the back button remembers',
    'Forms are conversations',
    'Hydration, explained with a kettle',
    'Your loading state is a product decision',
    'The URL is the oldest state manager',
    'Optimistic updates and the lies we tell',
    'Why the page jumped',
    'Suspense boundaries are layout decisions',
    'Caching is remembering on purpose',
    'Ship the boring table first',
  ],
  ada: [
    'An index is a promise you make to your future self',
    'Migrations without fear',
    'Null is an opinion',
    'The query planner is not your enemy',
    'Backups you have never restored are a rumour',
    'Foreign keys are documentation that runs',
    'One transaction, one story',
    'Count is the most expensive word in SQL',
    'Pagination has three hard problems',
    'Soft deletes, hard regrets',
    'What an N+1 costs at 3pm on a Tuesday',
    'Timestamps need a time zone and a witness',
    'Read replicas and other half-truths',
  ],
  sam: [
    'On-call is a design review that happens at 3am',
    'Dashboards nobody opens',
    'The deploy button should be boring',
    'Alerts are interruptions with a budget',
    'Postmortems without a villain',
    'Capacity planning is a weather forecast',
    'Feature flags outlive their features',
    'A runbook is a letter to a tired stranger',
    'Staging is a rumour about production',
    'Rollbacks are a feature',
    'The queue is where latency hides',
    'Every cron job is a tiny employee',
    'Sourdough, and other long-running processes',
  ],
};

const bodies = [
  'A page that loads a post, then its author, then the author’s other posts pays for the network three times. Most of that wait is the trip, not the work.',
  'Every shortcut speeds up the case you expected and slows down the one you forgot about. Pick the cases you can name.',
  'It is an apology in advance. It is still better than a layout that jumps when the data lands.',
  'If a system needs a person awake to keep it running, the system is not finished yet.',
  'Add the new thing, write to both, backfill, read from the new one, drop the old one. Five dull steps beat one exciting one.',
  'Measure it before you argue about it. The slow part is rarely the part you were sure about.',
];

const DAY_MS = 24 * 60 * 60 * 1000;
const newest = new Date('2026-10-02').getTime();

/** Newest first, with the authors taking turns */
const posts: Post[] = Array.from({ length: 13 }, (_, round) =>
  Object.entries(titlesByAuthor).flatMap(([authorId, titles]) => {
    const title = titles[round];
    return title === undefined ? [] : [{ authorId, title }];
  }),
)
  .flat()
  .map((post, index) => ({
    ...post,
    slug: post.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, ''),
    publishedAt: new Date(newest - index * 4 * DAY_MS),
    body: bodies[index % bodies.length] ?? '',
  }));

/**
 * With the blog's "Slow queries" switch on, waits 1 to 3 seconds, so that you
 * can watch a query load after the ones before it
 */
async function slowDown(ctx: { slowQueries: boolean }) {
  if (ctx.slowQueries) {
    await new Promise((resolve) =>
      setTimeout(resolve, 1_000 + Math.random() * 2_000),
    );
  }
}

export const blogRouter = router({
  /**
   * A page of posts, newest first. Used as a plain query by the post list and
   * as an infinite query by a post's "More by" list
   */
  posts: publicProcedure
    .input(
      z.object({
        /** Only posts by this author */
        authorId: z.string().optional(),
        limit: z.number().min(1).max(50).default(10),
        /** How many posts to skip */
        cursor: z.number().nullish(),
      }),
    )
    .query(async (opts) => {
      const { input } = opts;
      if (input.authorId !== undefined) {
        // A post's "More by" list
        await slowDown(opts.ctx);
      }
      const matching = posts.filter(
        (post) =>
          input.authorId === undefined || post.authorId === input.authorId,
      );
      const start = input.cursor ?? 0;
      const end = start + input.limit;
      return {
        items: matching.slice(start, end).map((post) => ({
          slug: post.slug,
          title: post.title,
          authorId: post.authorId,
          publishedAt: post.publishedAt,
        })),
        nextCursor: end < matching.length ? end : null,
      };
    }),
  postBySlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query((opts) => {
      const post = posts.find((it) => it.slug === opts.input.slug);
      if (!post) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }
      return post;
    }),
  authorById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async (opts) => {
      await slowDown(opts.ctx);
      const author = authors.find((it) => it.id === opts.input.id);
      if (!author) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }
      return author;
    }),
});
