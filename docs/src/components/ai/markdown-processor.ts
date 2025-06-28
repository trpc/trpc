import { remark } from 'remark';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import { type Components, toJsxRuntime } from 'hast-util-to-jsx-runtime';
import { type ReactNode } from 'react';
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';

export interface Processor {
  process: (
    content: string,
    components: Partial<Components>,
  ) => Promise<ReactNode>;
}

export function createProcessor(): Processor {
  const processor = remark().use(remarkGfm).use(remarkRehype);

  return {
    async process(content, components) {
      const nodes = processor.parse({ value: content });
      const hast = await processor.run(nodes);
      return toJsxRuntime(hast, {
        development: false,
        jsx,
        jsxs,
        Fragment,
        components,
      });
    },
  };
}
