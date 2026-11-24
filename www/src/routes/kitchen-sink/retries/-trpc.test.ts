import { makeResource } from '@trpc/server/unstable-core-do-not-import';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { expect, test, vi } from 'vitest';

import { appRouter, runs } from './-server/router.ts';
import {
  createLog,
  endpoint,
  type Fetch,
  loadRetries,
  type Plan,
} from './-trpc.ts';

/**
 * A `fetch` that the showcase's own router answers, as `api.$.ts` does, and
 * that lists the procedures each request asks for.
 */
function serve() {
  const sent: Array<string> = [];
  const fetch: Fetch = (url, init) => {
    const request = new Request(
      new URL(url instanceof Request ? url.url : url, 'http://localhost'),
      init,
    );
    sent.push(new URL(request.url).pathname.slice(endpoint.length + 1));
    return fetchRequestHandler({
      allowMethodOverride: true,
      createContext: () => ({}),
      endpoint,
      experimental_allowPipelining: true,
      req: request,
      router: appRouter,
    });
  };
  return { fetch, sent };
}

const none: Plan = {
  author: 0,
  avatar: 0,
  commenter: null,
  post: 0,
  retry: { attempts: 3, delayMs: 0 },
  stream: true,
  team: 0,
};

let sessions = 0;

async function load(plan: Plan) {
  const server = serve();
  const log = createLog();
  const res = loadRetries({
    fetch: server.fetch,
    log,
    plan,
    session: `test-${++sessions}`,
    signal: new AbortController().signal,
  });
  const comments = await res.comments.catch(() => []);
  const settled = {
    author: await res.author.then(
      (it) => it.run,
      (error: Error) => error.message,
    ),
    comments: await Promise.all(
      comments.map(async (row) => ({
        avatar: await row.avatar.then(
          (it) => it.run,
          (error: Error) => error.message,
        ),
        commenter: await row.commenter.then(
          (it) => `${it.id}:${it.run}`,
          (error: Error) => error.message,
        ),
      })),
    ),
    post: await res.post.then((it) => it.run),
    team: await res.team.then(
      (it) => it.run,
      (error: Error) => error.message,
    ),
  };
  return { log, sent: server.sent, settled };
}

const all = 'post.bySlug,author.byId,user.byId,avatar.byId,team.byId';

test('without failures, the load is one request', async () => {
  const { sent, settled } = await load(none);

  expect(sent).toEqual([all]);
  expect(settled).toMatchObject({ author: 1, post: 1, team: 1 });
});

test('a failing author is retried in one request with its team, and the post is not sent again', async () => {
  const { log, sent, settled } = await load({ ...none, author: 1 });

  expect(sent).toEqual([all, 'author.byId,team.byId']);
  expect(settled).toMatchObject({ author: 2, post: 1, team: 1 });
  expect(
    log
      .get()
      .attempts.filter((it) => it.path === 'author.byId')
      .map((it) => [it.attempt, it.outcome]),
  ).toEqual([
    [1, 'error'],
    [2, 'ok'],
  ]);
});

test('without streaming, a failing author is retried the same way, and the console logs each attempt', async () => {
  const lines: unknown[][] = [];
  using _console = makeResource(
    {},
    (() => {
      const log = vi.spyOn(console, 'log').mockImplementation((...args) => {
        lines.push(args);
      });
      const error = vi.spyOn(console, 'error').mockImplementation((...args) => {
        lines.push(args);
      });
      return () => {
        log.mockRestore();
        error.mockRestore();
      };
    })(),
  );
  const { sent, settled } = await load({ ...none, author: 1, stream: false });

  expect(sent).toEqual([all, 'author.byId,team.byId']);
  expect(settled).toMatchObject({ author: 2, post: 1, team: 1 });
  // `loggerLink`: the author's two attempts, out and back
  const author = lines.filter((line) =>
    line.some(
      (part) => typeof part === 'string' && part.includes('author.byId'),
    ),
  );
  expect(author.length).toBeGreaterThanOrEqual(4);
});

test("a failing commenter is retried by itself, with that commenter's avatar", async () => {
  const { sent, settled } = await load({
    ...none,
    commenter: { id: 'bob', times: 1 },
  });

  expect(sent).toEqual([all, 'user.byId,avatar.byId']);
  expect(settled.comments).toEqual([
    { avatar: 1, commenter: 'ada:1' },
    { avatar: 1, commenter: 'bob:2' },
    { avatar: 1, commenter: 'cy:1' },
  ]);
});

test('without retryLink, a failure is final, and nothing is sent again', async () => {
  const { sent, settled } = await load({ ...none, author: 1, retry: null });

  expect(sent).toEqual([all]);
  expect(settled.author).toBe('author:dee failed on purpose, run 1');
  expect(settled.team).toBe('author:dee failed on purpose, run 1');
});

test('once the retries give up, the query and what reads it fail with its error', async () => {
  const { sent, settled } = await load({
    ...none,
    retry: { attempts: 2, delayMs: 0 },
    team: 5,
  });

  expect(sent).toEqual([all, 'team.byId']);
  expect(settled.team).toBe('team:core failed on purpose, run 2');
});

test('a request whose fetch rejects ends in the log', async () => {
  const log = createLog();
  const res = loadRetries({
    fetch: () => Promise.reject(new TypeError('Failed to fetch')),
    log,
    plan: { ...none, retry: null },
    session: `test-${++sessions}`,
    signal: new AbortController().signal,
  });

  await expect(res.post).rejects.toThrow('Failed to fetch');
  expect(log.get().requests).toHaveLength(1);
  expect(log.get().requests[0]!.doneMs).not.toBeNull();
});

test('a query keeps counting its runs while many other loads have run', async () => {
  const caller = appRouter.createCaller({});
  runs.clear();
  // As many counters as the server keeps
  await Promise.all(
    Array.from({ length: 5000 }, (_, index) =>
      caller.post.bySlug({ failTimes: 0, session: `other-${index}`, slug: 'x' }),
    ),
  );
  const input = { failTimes: 1, session: `test-${++sessions}`, slug: 'x' };

  await expect(caller.post.bySlug(input)).rejects.toThrow('run 1');
  expect(await caller.post.bySlug(input)).toMatchObject({ run: 2 });
});
