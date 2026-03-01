import { defineDocs, defineConfig, defineCollections } from 'fumadocs-mdx/config';
import { z } from 'zod';

export const docs = defineDocs({
  dir: 'content/docs',
  docs: {
    // Exclude partial files (prefixed with _) that are imported into other docs
    files: ['**/*.mdx', '!partials/**'],
  },
});

export const blogPosts = defineCollections({
  type: 'doc',
  dir: 'content/blog',
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    slug: z.string().optional(),
    author: z.string().optional(),
    author_title: z.string().optional(),
    author_url: z.string().optional(),
    author_image_url: z.string().optional(),
    date: z.string().or(z.date()).optional(),
    image: z.string().optional(),
    commentDiscussionId: z.number().optional(),
  }),
});

export default defineConfig({
  mdxOptions: {
    // rehype/remark plugins configured at the Next.js config level
  },
});
