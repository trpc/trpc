import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

import { BlogComments } from './blog-comments.tsx';

describe('BlogComments', () => {
  test('prerenders an empty section: giscus loads in the browser, near the comments', () => {
    expect(
      renderToString(createElement(BlogComments, { discussion: 6508 })),
    ).toBe(
      '<section aria-label="Comments" class="min-h-64" id="comments"></section>',
    );
  });
});
