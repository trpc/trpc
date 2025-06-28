import { source } from '@/lib/source';
import { structure } from 'fumadocs-core/mdx-plugins';
import { createFromSource } from 'fumadocs-core/search/server';

export const { GET } = createFromSource(source, {
  buildIndex(page) {
    console.log(page.slugs);
    return {
      title: page.data.title,
      description: page.data.description,
      url: page.url,
      id: page.url,
      structuredData: structure(page.data.content),
      // use your desired value, like page.slugs[0]
      tag: page.slugs[0],
    };
  },
});
