import { describe, expect, it } from '@effect/vitest';

import type { ExperimentId } from '../src/experiments.ts';
import { experimentPageProblems, readingOrder } from './content.ts';

const page = (
  slug: string,
  order: number,
  parent?: string,
  section = 'Client',
) => ({
  order,
  parent,
  section,
  slug,
});

describe('readingOrder', () => {
  it('puts the pages nested under a page right after it, by order', () => {
    const order = readingOrder([
      page('client/errors', 3),
      page('client/links/ws', 2, 'client/links'),
      page('client/links', 2),
      page('client/links/http', 1, 'client/links'),
      page('client/links/http/batching', 1, 'client/links/http'),
      page('client/overview', 1),
    ]);
    expect(order.map((entry) => entry.slug)).toEqual([
      'client/overview',
      'client/links',
      'client/links/http',
      'client/links/http/batching',
      'client/links/ws',
      'client/errors',
    ]);
  });

  it('rejects a parent that is not a page', () => {
    expect(() =>
      readingOrder([page('client/links/ws', 1, 'client/link')]),
    ).toThrow("client/links/ws: parent client/link isn't a page");
  });

  it('rejects a parent in another section', () => {
    expect(() =>
      readingOrder([
        page('server/middleware', 1, undefined, 'Server'),
        page('middleware/lock', 1, 'server/middleware', 'Middleware'),
      ]),
    ).toThrow('is in section "Server", not "Middleware"');
  });

  it('rejects parents that form a cycle', () => {
    expect(() =>
      readingOrder([page('a', 1, 'b'), page('b', 1, 'a'), page('c', 1)]),
    ).toThrow('Pages whose parents form a cycle: a, b');
  });
});

describe('experimentPageProblems', () => {
  const doc = (
    slug: string,
    options: {
      readonly experiment?: ExperimentId;
      readonly links?: ReadonlyArray<string>;
      readonly parent?: string;
    } = {},
  ) => ({
    doc: { experiment: options.experiment, parent: options.parent, slug },
    links: (options.links ?? []).map((link) => ({
      hash: undefined,
      slug: link,
    })),
  });

  it("flags a listed page that links to an experiment's page, once per page", () => {
    expect(
      experimentPageProblems([
        doc('server/overview', {
          links: ['openapi/routes', 'openapi/routes', 'server/routers'],
        }),
        doc('server/routers'),
        doc('openapi/routes', { experiment: 'contracts' }),
      ]),
    ).toEqual([
      'server/overview: links to openapi/routes.md, which is in the contracts experiment',
    ]);
  });

  it("flags a listed page nested under an experiment's page", () => {
    expect(
      experimentPageProblems([
        doc('openapi/overview', { experiment: 'contracts' }),
        doc('openapi/routes', { parent: 'openapi/overview' }),
      ]),
    ).toEqual([
      'openapi/routes: nests under openapi/overview, which is in the contracts experiment',
    ]);
  });

  it("lets experiments' pages link and nest anywhere, across experiments too", () => {
    expect(
      experimentPageProblems([
        doc('openapi/overview', {
          experiment: 'contracts',
          links: ['server/routers', 'subscriptions/publisher'],
        }),
        doc('openapi/routes', {
          experiment: 'contracts',
          links: ['openapi/overview'],
          parent: 'openapi/overview',
        }),
        doc('subscriptions/publisher', { experiment: 'publisher' }),
        doc('server/routers'),
      ]),
    ).toEqual([]);
  });
});
