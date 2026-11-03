import { describe, expect, it } from 'vitest';

import { firstDocRewrite } from './first-doc.ts';
import { docPath, v10, v11 } from './site.ts';

const rewrite = (
  direction: 'input' | 'output',
  pathname: string,
): string | undefined => {
  const url = new URL(`https://trpc.io${pathname}?a=1#b`);
  const result = firstDocRewrite[direction]?.({ url });
  return result instanceof URL
    ? `${result.pathname}${result.search}${result.hash}`
    : undefined;
};

describe('firstDocRewrite', () => {
  it("reads a version's path as its first page's", () => {
    expect(rewrite('input', '/docs')).toBe('/docs/introduction?a=1#b');
    expect(rewrite('input', '/docs/v10')).toBe('/docs/v10/introduction?a=1#b');
    expect(rewrite('input', '/docs/v10/server/routers')).toBeUndefined();
  });

  it("writes a link to a version's first page as the version's path", () => {
    expect(rewrite('output', '/docs/introduction')).toBe('/docs?a=1#b');
    expect(rewrite('output', '/docs/v9/introduction')).toBe('/docs/v9?a=1#b');
    expect(rewrite('output', '/docs/v10/server/routers')).toBeUndefined();
  });
});

describe('docPath', () => {
  it("is the page's path under its version's, and the version's for its first page", () => {
    expect(docPath(v11, 'server/routers')).toBe('/docs/server/routers');
    expect(docPath(v11, v11.firstDoc)).toBe('/docs');
    expect(docPath(v10, 'server/routers')).toBe('/docs/v10/server/routers');
    expect(docPath(v10, v10.firstDoc)).toBe('/docs/v10');
  });
});
