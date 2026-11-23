import { describe, expect, it } from '@effect/vitest';
import { toHtml } from 'hast-util-to-html';

import {
  conciseDocs,
  renderPopupMarkdown,
  renderPopupMarkdownInline,
  withConciseDocs,
} from './popup-docs.ts';

const hover = {
  type: 'hover',
  text: 'const t: TRPC',
  target: 't',
  start: 0,
  length: 1,
  line: 0,
  character: 0,
} as const;

describe('conciseDocs', () => {
  it('keeps the first paragraph and the tags a popup shows', () => {
    expect(
      conciseDocs({
        ...hover,
        docs: 'Creates a router.\n\nIt can be nested.',
        tags: [
          ['example', 'createRouter({})'],
          ['param', 'procedures - The procedures'],
          ['see', 'https://trpc.io/docs/server/routers'],
          ['since', 'v10'],
        ],
      }),
    ).toMatchObject({
      docs: 'Creates a router.',
      tags: [
        ['param', 'procedures - The procedures'],
        ['see', 'https://trpc.io/docs/server/routers'],
      ],
    });
  });

  it('leaves out docs and tags it has nothing of', () => {
    const concise = conciseDocs({
      ...hover,
      docs: '  ',
      tags: [['example', 'x']],
    });
    expect(concise.docs).toBe(undefined);
    expect(concise.tags).toBe(undefined);
  });
});

describe('renderPopupMarkdown', () => {
  it('renders code, links and `{@link}`s', () => {
    expect(
      toHtml(
        renderPopupMarkdown(
          'Like `useQuery`, see {@link queryOptions} and {@link https://tanstack.com the docs}.',
        ),
      ),
    ).toBe(
      '<p>Like <code>useQuery</code>, see <code>queryOptions</code> and <a href="https://tanstack.com">the docs</a>.</p>',
    );
  });

  it('keeps punctuation right after a link', () => {
    expect(
      toHtml(renderPopupMarkdown('Takes a\n{@link QueryCache.Filter}\n.')),
    ).toBe('<p>Takes a\n<code>QueryCache.Filter</code>.</p>');
  });
});

describe('renderPopupMarkdownInline', () => {
  it("sets a `@param`'s name apart as code", () => {
    expect(
      toHtml(
        renderPopupMarkdownInline(
          'options - The options for `useQuery`',
          'tag:param',
        ),
      ),
    ).toBe('<code>options</code> — The options for <code>useQuery</code>');
  });

  it('shows a bare URL without its scheme', () => {
    expect(
      toHtml(
        renderPopupMarkdownInline(
          'https://trpc.io/docs/server/routers#nesting',
          'tag:see',
        ),
      ),
    ).toBe(
      '<a href="https://trpc.io/docs/server/routers#nesting">trpc.io/docs/server/routers#nesting</a>',
    );
  });
});

describe('withConciseDocs', () => {
  it("trims a `^?` type's docs and puts its indent in an element", () => {
    const seen: Array<string | undefined> = [];
    const renderer = withConciseDocs({
      nodeStaticInfo: (_info, node) => node,
      lineQuery: (query) => {
        seen.push(query.docs);
        return [
          {
            type: 'element',
            tagName: 'div',
            properties: { class: 'twoslash-meta-line twoslash-query-line' },
            children: [
              { type: 'text', value: '    ' },
              {
                type: 'element',
                tagName: 'span',
                properties: { class: 'twoslash-popup-container' },
                children: [],
              },
            ],
          },
        ];
      },
    });
    const lines = renderer.lineQuery?.call(
      // SAFETY: the stub renderer doesn't read its context.
      Object.create(null),
      { ...hover, type: 'query', docs: 'The input.\n\nMore about it.' },
      undefined,
    );
    expect(seen).toEqual(['The input.']);
    expect(toHtml(lines ?? [])).toBe(
      '<div class="twoslash-meta-line twoslash-query-line"><span class="twoslash-query-indent">    </span><span class="twoslash-popup-container"></span></div>',
    );
  });
});
