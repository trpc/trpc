import { EventEmitter, on } from 'node:events';
import { error, initTrpc, tracked } from '@trpc12/trpc/server';
import { z } from 'zod';

export interface Issue {
  id: string;
  number: number;
  title: string;
  status: 'open' | 'closed';
  assigneeId: string | null;
  createdAt: Date;
}

export interface Comment {
  id: string;
  issueId: string;
  author: string;
  body: string;
  createdAt: Date;
}

export interface Activity {
  id: string;
  text: string;
  at: Date;
}

export interface Stats {
  open: number;
  closed: number;
  comments: number;
}

// An in-memory tracker. Every change is emitted on `bus`, which the
// subscriptions read; one process, so Node's `EventEmitter` is enough.
const issues = new Map<string, Issue>();
const comments: Comment[] = [];
const activity: Activity[] = [];
const bus = new EventEmitter<{ comment: [Comment]; change: [Activity] }>();
let nextNumber = 1;
let nextComment = 1;

const addIssue = (
  title: string,
  status: Issue['status'],
  assigneeId: string | null,
): Issue => {
  const number = nextNumber++;
  const issue: Issue = {
    id: String(number),
    number,
    title,
    status,
    assigneeId,
    createdAt: new Date(Date.UTC(2026, 9, Math.min(number, 28))),
  };
  issues.set(issue.id, issue);
  return issue;
};

const seed = [
  'Batch requests made in the same tick',
  'Document dedupeLink next to retryLink',
  'Infinite list keeps its scroll position',
  'Optimistic updates roll back on error',
  'Persist paused mutations across reloads',
  'Live counters in the query cache',
  'Subscriptions resume from lastEventId',
  'Second API under a key prefix',
  'Suspense boundary per issue',
  'Structural sharing keeps equal Dates',
  'Streamed activity keeps the newest events',
  'Vite build without Next',
];
const assignees = ['ada', 'grace', 'linus', null];
seed.forEach((title, i) =>
  addIssue(title, i % 3 === 2 ? 'closed' : 'open', assignees[i % 4] ?? null),
);

const stats = (): Stats => {
  const all = [...issues.values()];
  const open = all.filter((issue) => issue.status === 'open').length;
  return { open, closed: all.length - open, comments: comments.length };
};

const record = (text: string) => {
  const entry: Activity = {
    id: String(activity.length + 1),
    text,
    at: new Date(),
  };
  activity.push(entry);
  bus.emit('change', entry);
};

const notFound = (id: string) => error({ code: 'NOT_FOUND', data: { id } });

const t = initTrpc();

export const trackerRouter = t.router({
  issue: {
    /** Newest first, `limit` at a time; `cursor` is the last number seen. */
    list: t.procedure
      .input(
        z.object({
          cursor: z.number().int().optional(),
          limit: z.number().int().min(1).max(50),
        }),
      )
      .query((opts) => {
        const newestFirst = [...issues.values()]
          .filter(
            (issue) =>
              opts.input.cursor === undefined ||
              issue.number < opts.input.cursor,
          )
          .sort((a, b) => b.number - a.number);
        const items = newestFirst.slice(0, opts.input.limit);
        const last = items.at(-1);
        return {
          items,
          nextCursor:
            last && newestFirst.length > items.length ? last.number : null,
        };
      }),
    byId: t.procedure
      .input(z.object({ id: z.string() }))
      .query((opts) => issues.get(opts.input.id) ?? notFound(opts.input.id)),
    create: t.procedure
      .input(z.object({ title: z.string().trim().min(1).max(120) }))
      .mutation((opts) => {
        const issue = addIssue(opts.input.title, 'open', null);
        record(`#${issue.number} opened: ${issue.title}`);
        return issue;
      }),
    setStatus: t.procedure
      .input(z.object({ id: z.string(), status: z.enum(['open', 'closed']) }))
      .mutation((opts) => {
        const issue = issues.get(opts.input.id);
        if (!issue) return notFound(opts.input.id);
        issue.status = opts.input.status;
        record(
          `#${issue.number} ${issue.status === 'open' ? 'reopened' : 'closed'}`,
        );
        return issue;
      }),
    delete: t.procedure.input(z.object({ id: z.string() })).mutation((opts) => {
      const issue = issues.get(opts.input.id);
      if (!issue) return notFound(opts.input.id);
      issues.delete(issue.id);
      record(`#${issue.number} deleted`);
      return { id: issue.id };
    }),
  },
  comment: {
    list: t.procedure
      .input(z.object({ issueId: z.string() }))
      .query((opts) =>
        comments.filter((comment) => comment.issueId === opts.input.issueId),
      ),
    add: t.procedure
      .input(
        z.object({
          issueId: z.string(),
          author: z.string().min(1),
          body: z.string().trim().min(1).max(500),
        }),
      )
      .mutation((opts) => {
        const issue = issues.get(opts.input.issueId);
        if (!issue) return notFound(opts.input.issueId);
        const comment: Comment = {
          id: String(nextComment++),
          ...opts.input,
          createdAt: new Date(),
        };
        comments.push(comment);
        bus.emit('comment', comment);
        record(`${comment.author} commented on #${issue.number}`);
        return comment;
      }),
    /**
     * The issue's comments, then each new one. They're `tracked()` by id, so
     * a reconnect sends `lastEventId` and gets only the ones it missed.
     */
    onAdd: t.procedure
      .input(z.object({ issueId: z.string() }))
      .subscription(async function* (opts) {
        // Listen before replaying, so nothing lands in between.
        const live = on(bus, 'comment', { signal: opts.signal });
        const after = Number(opts.lastEventId ?? 0);
        const missed = comments.filter(
          (comment) =>
            comment.issueId === opts.input.issueId &&
            Number(comment.id) > after,
        );
        for (const comment of missed) yield tracked(comment.id, comment);
        for await (const [comment] of live) {
          if (comment.issueId === opts.input.issueId) {
            yield tracked(comment.id, comment);
          }
        }
      }),
  },
  /** The `last` newest events, then each one as it happens. */
  activity: t.procedure
    .input(z.object({ last: z.number().int().min(0).max(20) }))
    .subscription(async function* (opts) {
      const live = on(bus, 'change', { signal: opts.signal });
      yield* activity.slice(-opts.input.last);
      for await (const [entry] of live) yield entry;
    }),
  /** The counts now, then again after every change. */
  stats: t.procedure.subscription(async function* (opts) {
    const live = on(bus, 'change', { signal: opts.signal });
    yield stats();
    for await (const _change of live) yield stats();
  }),
});
export type TrackerRouter = typeof trackerRouter;
