import { describe, expect, it } from '@effect/vitest';

import { hiddenPageProblems, readingOrder } from './content.ts';

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

describe('hiddenPageProblems', () => {
  const doc = (
    slug: string,
    options: {
      readonly hidden?: boolean;
      readonly links?: ReadonlyArray<string>;
      readonly parent?: string;
    } = {},
  ) => ({
    doc: { hidden: options.hidden, parent: options.parent, slug },
    links: (options.links ?? []).map((link) => ({
      hash: undefined,
      slug: link,
    })),
  });

  it('flags a listed page that links to a hidden one, once per page', () => {
    expect(
      hiddenPageProblems([
        doc('server/overview', {
          links: ['openapi/routes', 'openapi/routes', 'server/routers'],
        }),
        doc('server/routers'),
        doc('openapi/routes', { hidden: true }),
      ]),
    ).toEqual(['server/overview: links to openapi/routes.md, which is hidden']);
  });

  it('flags a listed page nested under a hidden one', () => {
    expect(
      hiddenPageProblems([
        doc('openapi/overview', { hidden: true }),
        doc('openapi/routes', { parent: 'openapi/overview' }),
      ]),
    ).toEqual([
      'openapi/routes: nests under openapi/overview, which is hidden',
    ]);
  });

  it('lets hidden pages link and nest anywhere', () => {
    expect(
      hiddenPageProblems([
        doc('openapi/overview', { hidden: true, links: ['server/routers'] }),
        doc('openapi/routes', {
          hidden: true,
          links: ['openapi/overview'],
          parent: 'openapi/overview',
        }),
        doc('server/routers'),
      ]),
    ).toEqual([]);
  });
});
