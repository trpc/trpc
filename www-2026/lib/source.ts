import { docs, blogPosts } from '@/.source';
import { loader } from 'fumadocs-core/source';

export const source = loader({
  baseUrl: '/docs',
  source: docs.toFumadocsSource(),
});

// blogPosts is a defineCollections output (array of docs), not defineDocs,
// so we create a simple wrapper instead of using loader()
function getSlugFromPath(path: string): string {
  return path.replace(/\.(mdx?|md)$/, '');
}

export const blog = {
  getPages() {
    return blogPosts.map((post) => {
      const slug = getSlugFromPath(post.info.path);
      return {
        url: `/blog/${slug}`,
        slugs: [slug],
        data: post,
      };
    });
  },
  getPage(slugs: string[]) {
    const slug = slugs[0];
    const post = blogPosts.find(
      (p) => getSlugFromPath(p.info.path) === slug,
    );
    if (!post) return null;
    return {
      url: `/blog/${slug}`,
      slugs: [slug],
      data: post,
    };
  },
};
