import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { expect, test, vi } from 'vitest';

import type { Fetch } from './-meter.ts';
import { appRouter } from './-server/router.ts';
import { endpoint, loadPosts } from './-trpc.ts';

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

// Regression: a load that a switch or a reload replaced kept going, so each
// author still on its way then asked for its team.
test('a load sends nothing once its signal is aborted', async () => {
  const server = serve();
  const controller = new AbortController();
  const loaded = loadPosts({
    fetch: server.fetch,
    mode: 'separate',
    signal: controller.signal,
  });
  const posts = await loaded;
  // The authors are on their way; the quickest takes 300 ms.
  await vi.waitFor(() =>
    expect(server.sent.some((path) => path.includes('author.byId'))).toBe(true),
  );
  controller.abort();
  const sentBefore = [...server.sent];

  // Every author settles, and so does the team of each one that came: in a
  // load that kept going, each author's team is sent for as it arrives.
  await Promise.allSettled(posts.map((post) => post.author));
  await Promise.allSettled(posts.map((post) => post.team));

  expect(server.sent).toEqual(sentBefore);
  expect(server.sent.some((path) => path.includes('team.byId'))).toBe(false);
});

test('a pipelined load is one request, with one author query for every post', async () => {
  const server = serve();
  const posts = await loadPosts({
    fetch: server.fetch,
    mode: 'pipelined',
    signal: new AbortController().signal,
  });
  const authors = await Promise.allSettled(posts.map((post) => post.author));
  const teams = await Promise.allSettled(posts.map((post) => post.team));

  expect(server.sent).toEqual(['post.list,author.byId,team.byId']);
  expect(authors.some((author) => author.status === 'fulfilled')).toBe(true);
  expect(teams.some((team) => team.status === 'fulfilled')).toBe(true);
});
