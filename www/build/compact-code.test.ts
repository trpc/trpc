import type { Root } from 'hast';
import { toHtml } from 'hast-util-to-html';
import { expect, test } from 'vitest';

import { compactCode } from './compact-code.ts';

const blockColors = '--shiki-dark:#E1E4E8;--shiki-light:#24292E';
const keyword = '--shiki-dark:#F97583;--shiki-light:#D73A49';

const span = (style: string | undefined, text: string) => ({
  type: 'element' as const,
  tagName: 'span',
  properties: style === undefined ? {} : { style },
  children: [{ type: 'text' as const, value: text }],
});

test("drops a token's colours where they're its block's, and the span left bare", () => {
  const tree: Root = {
    type: 'root',
    children: [
      {
        type: 'element',
        tagName: 'pre',
        properties: {
          class: 'shiki twoslash',
          style: `--shiki-dark:#e1e4e8;--shiki-light:#24292e;--shiki-dark-bg:#24292e;--shiki-light-bg:#fff`,
        },
        children: [
          {
            type: 'element',
            tagName: 'code',
            properties: {},
            children: [
              {
                type: 'element',
                tagName: 'span',
                properties: { class: 'line' },
                children: [
                  span(keyword, 'const'),
                  span(blockColors, ' answer = '),
                  {
                    type: 'element',
                    tagName: 'span',
                    properties: { class: 'twoslash-popup-container' },
                    children: [span(blockColors, 'const answer: 42')],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
  compactCode(tree);
  expect(toHtml(tree)).toBe(
    '<pre class="shiki twoslash" style="--shiki-dark:#e1e4e8;--shiki-light:#24292e;--shiki-dark-bg:#24292e;--shiki-light-bg:#fff"><code><span class="line">' +
      `<span style="${keyword}">const</span> answer = ` +
      // A popup is on a background of its own, so it keeps its colours.
      `<span class="twoslash-popup-container"><span style="${blockColors}">const answer: 42</span></span>` +
      '</span></code></pre>',
  );
});

test('unwraps a bare span inside a bare span', () => {
  const tree: Root = {
    type: 'root',
    children: [
      {
        type: 'element',
        tagName: 'pre',
        properties: { class: 'shiki', style: blockColors },
        children: [
          {
            type: 'element',
            tagName: 'span',
            properties: {},
            children: [span(undefined, 'inner'), span(blockColors, ' text')],
          },
        ],
      },
    ],
  };
  compactCode(tree);
  expect(toHtml(tree)).toBe(
    `<pre class="shiki" style="${blockColors}">inner text</pre>`,
  );
});

test('keeps a token style whose value differs after a colon', () => {
  const blockFont = 'font-family:"a:b"';
  const tokenFont = 'font-family:"a:c"';
  const tree: Root = {
    type: 'root',
    children: [
      {
        type: 'element',
        tagName: 'pre',
        properties: { class: 'shiki', style: blockFont },
        children: [span(tokenFont, 'text')],
      },
    ],
  };
  compactCode(tree);
  expect(toHtml(tree)).toBe(
    `<pre class="shiki" style="font-family:&#x22;a:b&#x22;"><span style="font-family:&#x22;a:c&#x22;">text</span></pre>`,
  );
});

test('keeps a token style whose quoted value differs after a semicolon', () => {
  const tree: Root = {
    type: 'root',
    children: [
      {
        type: 'element',
        tagName: 'pre',
        properties: { class: 'shiki', style: 'font-family:"a;b",monospace' },
        children: [span('font-family:"a;c",serif', 'text')],
      },
    ],
  };
  compactCode(tree);
  expect(toHtml(tree)).toBe(
    `<pre class="shiki" style="font-family:&#x22;a;b&#x22;,monospace"><span style="font-family:&#x22;a;c&#x22;,serif">text</span></pre>`,
  );
});
