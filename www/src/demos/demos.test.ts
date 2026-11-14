import { QueryClient } from '@tanstack/react-query';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import {
  experimental_dataOf,
  experimental_entryPerItem,
  loadHandles,
  prefetchEntry,
} from '@trpc/tanstack-react-query/unstable-handles';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { AuthorBlogSkeleton } from './kit/author-blog.tsx';
import {
  type AppRouter,
  createDemoClient,
  createHttpDemoClient,
} from './kit/backend.ts';
import { PageSkeleton } from './kit/blog-routes.tsx';
import {
  chainLength,
  createNetwork,
  type NetworkRequest,
  serverWork,
} from './kit/network.ts';
import { demoMarker, demoNames } from './names.ts';
import { loadPageDemos, PageDemo } from './page-demos.tsx';
import { createRandom, jitter } from './random.ts';
import { longestTimeline, progress, timeline } from './timeline.ts';
import {
  formatInput,
  lastPage,
  listPosts,
  listUrl,
  parseListUrl,
} from './url-state.ts';

describe('timeline', () => {
  it('starts the comments after the post with fetch-on-render', () => {
    const plan = timeline('fetch-on-render', 200);
    expect(
      plan.requests.map((request) => [request.start, request.end]),
    ).toEqual([
      [0, 200],
      [200, 500],
    ]);
    expect(plan.readyAt).toBe(500);
  });

  it('starts both at once with render-as-you-fetch', () => {
    const plan = timeline('render-as-you-fetch', 100);
    expect(
      plan.requests.map((request) => [request.start, request.end]),
    ).toEqual([
      [0, 100],
      [0, 150],
    ]);
    expect(plan.readyAt).toBe(150);
  });

  it('keeps random times within the jitter, and both strategies on one axis', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const waterfall = timeline('fetch-on-render', 200, createRandom(seed));
      const parallel = timeline('render-as-you-fetch', 200, createRandom(seed));
      const [post, comments] = parallel.requests;
      expect(post.end).toBeGreaterThanOrEqual(200 * jitter.min - 5);
      expect(post.end).toBeLessThanOrEqual(200 * jitter.max + 5);
      expect(comments.end).toBeGreaterThanOrEqual(300 * jitter.min - 5);
      expect(comments.end).toBeLessThanOrEqual(300 * jitter.max + 5);
      expect(waterfall.readyAt).toBe(post.end + comments.end);
      expect(parallel.readyAt).toBe(Math.max(post.end, comments.end));
      expect(waterfall.readyAt).toBeLessThanOrEqual(longestTimeline * 200 + 5);
      expect(parallel.steps.map((step) => step.at)).toEqual(
        parallel.steps.map((step) => step.at).toSorted((a, b) => a - b),
      );
    }
  });

  it('draws different times for different seeds', () => {
    const ends = Array.from({ length: 20 }, (_, index) =>
      timeline(
        'render-as-you-fetch',
        200,
        createRandom(index + 1),
      ).requests.map((request) => request.end),
    );
    expect(new Set(ends.map(([post]) => post)).size).toBeGreaterThan(1);
    expect(new Set(ends.map(([, comments]) => comments)).size).toBeGreaterThan(
      1,
    );
    // Each request draws its own jitter, so the ratio between them varies.
    const ratios = ends.map(([post = 0, comments = 0]) => comments / post);
    expect(Math.max(...ratios) - Math.min(...ratios)).toBeGreaterThan(0.2);
  });

  it('repeats the same times for the same seed', () => {
    const first = timeline('render-as-you-fetch', 200, createRandom(5));
    const second = timeline('render-as-you-fetch', 200, createRandom(5));
    expect(second.requests).toEqual(first.requests);
  });

  it('measures progress from 0 to 1', () => {
    const request = { end: 400, label: 'x', start: 200 };
    expect(
      [0, 200, 300, 400, 500].map((time) => progress(request, time)),
    ).toEqual([0, 0, 0.5, 1, 1]);
  });
});

describe('random', () => {
  it('repeats for a seed, and differs between seeds', () => {
    const draw = (seed: number) => {
      const random = createRandom(seed);
      return Array.from({ length: 5 }, () => random.next());
    };
    expect(draw(7)).toEqual(draw(7));
    expect(draw(7)).not.toEqual(draw(8));
  });

  it('stays within the bounds', () => {
    const random = createRandom(42);
    for (let draw = 0; draw < 1000; draw++) {
      const value = random.between(jitter.min, jitter.max);
      expect(value).toBeGreaterThanOrEqual(jitter.min);
      expect(value).toBeLessThan(jitter.max);
    }
  });
});

describe('network', () => {
  const request = (
    id: number,
    startedAt: number,
    endedAt: number,
  ): NetworkRequest => ({
    endedAt,
    http: undefined,
    id,
    label: `request ${id}`,
    origin: undefined,
    servedAt: undefined,
    servingAt: undefined,
    startedAt,
    status: 'done',
  });

  it('counts parallel requests as one round trip', () => {
    expect(
      chainLength([request(1, 0, 300), request(2, 0, 450), request(3, 5, 180)]),
    ).toBe(1);
  });

  it('counts requests that wait for another, however long each takes', () => {
    expect(
      chainLength([
        request(1, 0, 300),
        request(2, 300, 480),
        request(3, 300, 750),
      ]),
    ).toBe(2);
    expect(
      chainLength([
        request(1, 0, 100),
        request(2, 100, 900),
        request(3, 900, 950),
      ]),
    ).toBe(3);
  });

  it('ignores requests that are still in flight', () => {
    expect(
      chainLength([
        request(1, 0, 300),
        { ...request(2, 300, 0), endedAt: undefined, status: 'pending' },
      ]),
    ).toBe(1);
    expect(chainLength([])).toBe(0);
  });

  it('delays each request by its weight, within the jitter', () => {
    const network = createNetwork(createRandom(1));
    network.latency = 400;
    for (let draw = 0; draw < 100; draw++) {
      const delay = network.delay(1.5);
      expect(delay).toBeGreaterThanOrEqual(Math.floor(600 * jitter.min));
      expect(delay).toBeLessThanOrEqual(Math.ceil(600 * jitter.max));
    }
  });

  it("delays each call by its procedure's weight", async () => {
    const network = createNetwork(createRandom(1));
    const weights: number[] = [];
    network.delay = (weight) => {
      weights.push(weight);
      return 0;
    };
    const client = createDemoClient(network);
    await client.post.byId.query({ id: 1 });
    await client.post.comments.query({ postId: 1 });
    await client.post.moreByAuthor.query({ postId: 1 });
    await client.post.list.query({ page: 1 });
    expect(weights).toEqual([1, 1.5, 1.2, 0.8]);
  });

  it('answers only once the delay has passed', async () => {
    vi.useFakeTimers();
    try {
      const network = createNetwork(createRandom(1));
      network.delay = () => 500;
      const client = createDemoClient(network);
      let answered = false;
      const query = client.post.byId.query({ id: 1 }).then(() => {
        answered = true;
      });
      await vi.advanceTimersByTimeAsync(499);
      expect(answered).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await query;
      expect(answered).toBe(true);
      expect(network.getTrace().requests[0]?.status).toBe('done');
    } finally {
      vi.useRealTimers();
    }
  });

  it('holds requests in flight while paused, and its clock with them', async () => {
    vi.useFakeTimers();
    try {
      const network = createNetwork(createRandom(1));
      network.delay = () => 500;
      const client = createDemoClient(network);
      let answered = false;
      const query = client.post.byId.query({ id: 1 }).then(() => {
        answered = true;
      });
      await vi.advanceTimersByTimeAsync(200);
      network.pause();
      await vi.advanceTimersByTimeAsync(5000);
      expect(answered).toBe(false);
      expect(network.now()).toBe(200);
      network.resume();
      await vi.advanceTimersByTimeAsync(299);
      expect(answered).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await query;
      expect(answered).toBe(true);
      const [request] = network.getTrace().requests;
      expect(request?.status).toBe('done');
      expect((request?.endedAt ?? 0) - (request?.startedAt ?? 0)).toBe(500);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('backend', () => {
  const client = () => {
    const network = createNetwork(createRandom(1));
    network.delay = () => 0;
    return createDemoClient(network);
  };

  it("lists the other posts by a post's author, from the post's id", async () => {
    const more = await client().post.moreByAuthor.query({ postId: 1 });
    expect(more.author).toBe('Ada');
    expect(more.posts.map((post) => post.id)).toEqual([4, 7]);
  });

  it('pages the list, three posts a page, and says how many pages', async () => {
    const pages = await Promise.all(
      [1, 2, 3, 4].map((page) => client().post.list.query({ page })),
    );
    expect(pages.map((page) => page.pageCount)).toEqual([3, 3, 3, 3]);
    expect(pages.map((page) => page.posts.map((post) => post.id))).toEqual([
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
      [],
    ]);
  });

  it("gives each listed post's comment count in the same response", async () => {
    const first = await client().post.list.query({ page: 1 });
    expect(first.posts.map((post) => post.commentCount)).toEqual([2, 2, 1]);
    const last = await client().post.list.query({ page: 3 });
    expect(last.posts.map((post) => post.commentCount)).toEqual([0, 0, 0]);
  });
});

describe('backend over HTTP', () => {
  const session = () => {
    const network = createNetwork(createRandom(1));
    const weights: number[] = [];
    network.delay = (weight) => {
      weights.push(weight);
      return 0;
    };
    let worked = 0;
    network.work = () => {
      worked++;
      return 0;
    };
    const client = createHttpDemoClient(network, undefined);
    const queryClient = new QueryClient();
    const trpc = createTRPCOptionsProxy<AppRouter>({ client, queryClient });
    /** Every label a request has had. */
    const labels = new Set<string>();
    network.subscribe(() => {
      for (const request of network.getTrace().requests) {
        labels.add(request.label);
      }
    });
    const settled = () =>
      vi.waitFor(() => {
        const { requests } = network.getTrace();
        expect(requests.length).toBeGreaterThan(0);
        expect(requests.every((request) => request.status === 'done')).toBe(
          true,
        );
      });
    return {
      labels,
      network,
      queryClient,
      settled,
      trpc,
      weights,
      worked: () => worked,
    };
  };

  it("takes one trip a request, and the server's own time for each call", async () => {
    const { network, queryClient, settled, trpc, weights, worked } = session();
    await Promise.all([
      queryClient.fetchQuery(trpc.post.byId.queryOptions({ id: 1 })),
      queryClient.fetchQuery(trpc.post.feed.queryOptions({ page: 1 })),
    ]);
    await settled();
    // One round trip for the two calls, and the server ran each
    expect(weights).toEqual([1]);
    expect(worked()).toBe(2);
    const { requests } = network.getTrace();
    expect(requests.map((request) => request.label)).toEqual([
      'post.byId({ id: 1 })',
      'post.feed({ page: 1 })',
    ]);
    // Both went in the first HTTP request
    expect(requests.map((request) => request.http)).toEqual([1, 1]);
  });

  it('does no work on the server for a request that was cancelled on its way there', async () => {
    const { network, queryClient, trpc, worked } = session();
    network.delay = () => 400;
    const result = queryClient.fetchQuery(
      trpc.post.byId.queryOptions(
        { id: 1 },
        { trpc: { abortOnUnmount: true } },
      ),
    );
    await vi.waitFor(() => {
      expect(network.getTrace().requests).toHaveLength(1);
    });
    await queryClient.cancelQueries();
    await expect(result).rejects.toThrow();
    // Long enough for the request to have arrived, had it not been cancelled
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(worked()).toBe(0);
    expect(network.getTrace().requests[0]).toMatchObject({
      servingAt: undefined,
      status: 'aborted',
    });
  });

  it("keeps the server's time the same on any connection", () => {
    const network = createNetwork(createRandom(1));
    const trips = (latency: number) => {
      network.latency = latency;
      return Array.from({ length: 20 }, () => network.delay(1));
    };
    const work = () => Array.from({ length: 20 }, () => network.work());
    const fast = Math.max(...trips(300));
    const slow = Math.min(...trips(2000));
    // The trip grows with the connection, and the server's time doesn't
    expect(slow).toBeGreaterThan(fast);
    for (const ms of [...work(), ...work()]) {
      expect(ms).toBeGreaterThanOrEqual(serverWork.min);
      expect(ms).toBeLessThanOrEqual(serverWork.max);
    }
    expect(serverWork.max).toBeLessThan(fast);
  });

  it('runs a query that needs another in its request, and shows where its input comes from', async () => {
    const { labels, network, queryClient, settled, trpc } = session();
    const post = prefetchEntry(trpc.post.byId, { id: 1 });
    const author = experimental_dataOf(post, (it) =>
      prefetchEntry(trpc.author.byId, { id: it.authorId }),
    );
    await loadHandles(trpc, {
      author,
      more: experimental_dataOf(author, (it) =>
        prefetchEntry(trpc.post.byAuthor, { authorId: it.id }),
      ),
      post,
    });
    await settled();
    await vi.waitFor(() => {
      expect(
        queryClient.getQueryData(trpc.post.byAuthor.queryKey({ authorId: 1 })),
      ).toBeDefined();
    });
    const { requests } = network.getTrace();
    // All three left together: one round trip
    expect(chainLength(requests)).toBe(1);
    expect(requests.map((request) => request.http)).toEqual([1, 1, 1]);
    // The server ran each when the one before it was done
    const [first, second, third] = requests;
    expect(first?.servedAt).toBeLessThanOrEqual(second?.servingAt ?? -1);
    expect(second?.servedAt).toBeLessThanOrEqual(third?.servingAt ?? -1);
    expect(requests.map((request) => request.label)).toEqual([
      'post.byId({ id: 1 })',
      'author.byId({ id: 1 })',
      'post.byAuthor({ authorId: 1 })',
    ]);
    // Until the server had run them, they showed what it would fill in
    expect(labels).toContain('author.byId({ id: ‹post›.authorId })');
    expect(labels).toContain('post.byAuthor({ authorId: ‹author›.id })');
    expect(
      queryClient.getQueryData(trpc.author.byId.queryKey({ id: 1 })),
    ).toMatchObject({ name: 'Ada' });
  });

  it("runs a query for every row of a list in the list's request", async () => {
    const { labels, network, queryClient, settled, trpc } = session();
    const feed = prefetchEntry(trpc.post.feed, { page: 1 });
    await loadHandles(trpc, {
      authors: experimental_entryPerItem(
        experimental_dataOf(feed).posts,
        (post) => prefetchEntry(trpc.author.byId, { id: post.authorId }),
      ),
      feed,
    });
    await settled();
    await vi.waitFor(() => {
      expect(
        queryClient.getQueryData(trpc.author.byId.queryKey({ id: 3 })),
      ).toMatchObject({ name: 'Linus' });
    });
    const { requests } = network.getTrace();
    expect(chainLength(requests)).toBe(1);
    expect(requests.map((request) => request.label)).toEqual([
      'post.feed({ page: 1 })',
      'author.byId({ id: 1 }) + 2 more',
    ]);
    expect(labels).toContain('author.byId({ id: ‹post›.posts[].authorId })');
  });

  it('ends the rows of a failed call, and of the call that could not run after it, as failed', async () => {
    const { network, trpc } = session();
    const post = prefetchEntry(trpc.post.byId, { id: 99 });
    await loadHandles(trpc, {
      author: experimental_dataOf(post, (it) =>
        prefetchEntry(trpc.author.byId, { id: it.authorId }),
      ),
      post,
    });
    await vi.waitFor(() => {
      expect(
        network.getTrace().requests.map((request) => request.status),
      ).toEqual(['error', 'error']);
    });
  });

  it('takes a round trip for each step when each query waits for the last', async () => {
    const { network, queryClient, settled, trpc } = session();
    const post = await queryClient.fetchQuery(
      trpc.post.byId.queryOptions({ id: 1 }),
    );
    const author = await queryClient.fetchQuery(
      trpc.author.byId.queryOptions({ id: post.authorId }),
    );
    await queryClient.fetchQuery(
      trpc.post.byAuthor.queryOptions({ authorId: author.id }),
    );
    await settled();
    const { requests } = network.getTrace();
    expect(requests).toHaveLength(3);
    // Each is an HTTP request of its own, sent when the last one was back
    expect(requests.map((request) => request.http)).toEqual([1, 2, 3]);
    expect(chainLength(requests)).toBe(3);
  });
});

describe('url state', () => {
  it('reads the sort and page from the URL', () => {
    expect(parseListUrl('/posts?sort=top&page=3')).toEqual({
      page: 3,
      sort: 'top',
    });
  });

  it('falls back to the defaults for missing or invalid params', () => {
    expect(parseListUrl('/posts')).toEqual({ page: 1, sort: 'new' });
    expect(parseListUrl('/posts?sort=old&page=0')).toEqual({
      page: 1,
      sort: 'new',
    });
    expect(parseListUrl(`/posts?page=${lastPage + 1}`).page).toBe(1);
    expect(parseListUrl('  ')).toEqual({ page: 1, sort: 'new' });
    expect(parseListUrl('http://')).toEqual({ page: 1, sort: 'new' });
  });

  it('round-trips through listUrl', () => {
    const input = { page: 2, sort: 'top' } as const;
    expect(parseListUrl(listUrl(input))).toEqual(input);
    expect(listUrl({ page: 2 })).toBe('/posts?page=2');
  });

  it('writes inputs the way the call would', () => {
    expect(formatInput({ page: 2, sort: 'top' })).toBe(
      "{ sort: 'top', page: 2 }",
    );
    expect(formatInput({ page: 1 })).toBe('{ page: 1 }');
  });

  it('orders the posts by the sort, three a page', () => {
    const top = listPosts({ page: 1, sort: 'top' });
    expect(top).toHaveLength(3);
    expect(top.map((post) => post.votes)).toEqual(
      top.map((post) => post.votes).toSorted((a, b) => b - a),
    );
    expect(listPosts({ page: 1, sort: 'new' })).not.toEqual(top);
    expect(listPosts({ page: lastPage, sort: 'new' })).toHaveLength(3);
  });
});

describe('first frame', () => {
  it('shapes the skeleton like the page the tab opens at', () => {
    const skeleton = (href: string) =>
      renderToString(createElement(PageSkeleton, { href }));
    expect(skeleton('/posts/2')).toContain('Handles, explained');
    expect(skeleton('/posts?page=2')).toContain(
      'Loaders start, components wait',
    );
    expect(skeleton('/posts?page=2')).not.toContain('Render as you fetch');
    expect(skeleton('/nowhere')).toBe('');
  });

  it("shapes the author blog's skeleton like its page, with the author", () => {
    const skeleton = (href: string) =>
      renderToString(createElement(AuthorBlogSkeleton, { href }));
    expect(skeleton('/posts/2')).toContain('Handles, explained');
    expect(skeleton('/posts/2')).toContain('Grace');
    expect(skeleton('/posts?page=2')).toContain(
      'Loaders start, components wait',
    );
    expect(skeleton('/nowhere')).toBe('');
  });

  it.each(demoNames)(
    'renders %s on the server without the clock or random numbers',
    async (name) => {
      await loadPageDemos(demoMarker({ name, options: {} }));
      const render = () =>
        renderToString(createElement(PageDemo, { name, options: {} }));
      const date = vi.spyOn(Date, 'now');
      const random = vi.spyOn(Math, 'random');
      const clock = vi.spyOn(performance, 'now');
      try {
        // React reads the clock for each render of its own.
        renderToString(createElement('div'));
        const reactReads = clock.mock.calls.length;
        clock.mockClear();
        const first = render();
        expect(first).toContain('<figure');
        // The prerender crawls each link, and the demo's pages aren't the site's.
        expect(first).not.toMatch(/href="\/posts/);
        expect(clock).toHaveBeenCalledTimes(reactReads);
        expect(render()).toBe(first);
        expect(date).not.toHaveBeenCalled();
        expect(random).not.toHaveBeenCalled();
      } finally {
        date.mockRestore();
        random.mockRestore();
        clock.mockRestore();
      }
    },
  );
});
