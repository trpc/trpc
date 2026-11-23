import { Schema } from 'effect';
import type { Element, ElementContent } from 'hast';
import { toHtml } from 'hast-util-to-html';

/**
 * A horizontal bar chart: the body of a `chart` fence, as JSON. Each bar is
 * as long as its value against the largest, and shows `text` beside it.
 */
export const Chart = Schema.Struct({
  bars: Schema.Array(
    Schema.Struct({
      /** Drawn in the brand's color. */
      highlight: Schema.optional(Schema.Boolean),
      label: Schema.String,
      /** The value as shown: `46,576`, `0.94 s`. */
      text: Schema.String,
      value: Schema.Number,
    }),
  ),
  /** Which way is better, said beside the title. */
  better: Schema.Literals(['higher', 'lower']),
  /** A line under the bars. */
  note: Schema.optional(Schema.String),
  title: Schema.String,
});

export type Chart = typeof Chart.Type;

/** A `chart` fence's body; throws on one that isn't a {@link Chart}. */
export const decodeChart = Schema.decodeUnknownSync(
  Schema.fromJsonString(Chart),
);

function element(
  tagName: string,
  className: string,
  children: Array<ElementContent>,
  properties: Element['properties'] = {},
): Element {
  return {
    children,
    properties: { className: className.split(' '), ...properties },
    tagName,
    type: 'element',
  };
}

const text = (value: string): ElementContent => ({ type: 'text', value });

/** The chart for the web page: a `<figure>` of labelled bars. */
export function chartHtml(chart: Chart) {
  const max = Math.max(...chart.bars.map((bar) => bar.value));
  const width = (value: number) =>
    max > 0 ? `${((value / max) * 100).toFixed(1)}%` : '0%';
  return toHtml(
    element('figure', 'bench-chart not-prose', [
      element('figcaption', 'bench-chart-caption', [
        element('span', 'bench-chart-title', [text(chart.title)]),
        element('span', 'bench-chart-better', [
          text(`${chart.better} is better`),
        ]),
      ]),
      ...chart.bars.map((bar) =>
        element(
          'div',
          'bench-chart-row',
          [
            element('span', 'bench-chart-label', [text(bar.label)]),
            element('span', 'bench-chart-track', [
              element('span', 'bench-chart-bar', [], {
                style: `width: ${width(bar.value)}`,
              }),
            ]),
            element('span', 'bench-chart-value', [text(bar.text)]),
          ],
          bar.highlight === true ? { dataHighlight: '' } : {},
        ),
      ),
      ...(chart.note === undefined
        ? []
        : [element('p', 'bench-chart-note', [text(chart.note)])]),
    ]),
  );
}

/** The chart for agents, in a page's markdown: a table, and its note. */
export function chartMarkdown(chart: Chart) {
  return [
    `| ${chart.title} (${chart.better} is better) | |`,
    '| --- | ---: |',
    ...chart.bars.map((bar) => `| ${bar.label} | ${bar.text} |`),
    ...(chart.note === undefined ? [] : ['', chart.note]),
  ].join('\n');
}
