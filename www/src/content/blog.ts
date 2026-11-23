import { notFound } from '@tanstack/react-router';
import { posts } from 'virtual:blog-manifest';

import type { LoadPopups } from '~/twoslash-hovers.ts';

import { loadPage, registerPages, type WithoutHtml } from './page-html.ts';
import type { Post, PostMeta } from './types.ts';

export { posts };

// Each post is its own content-hashed chunk, as each page of the docs is.
const files = import.meta.glob<{ default: Post }>([
  '../../blog/*.md',
  '!../../blog/README.md',
]);
registerPages(files);

/** A post as its route's loader returns it, without its HTML. */
export type LoadedPost = WithoutHtml<Post>;

export function findPost(slug: string): PostMeta | undefined {
  return posts.find((post) => post.slug === slug);
}

/** A post, compiled at build time, with its HTML in `pageHtml`; or a 404. */
export async function loadPost(slug: string): Promise<LoadedPost> {
  const file = `../../blog/${slug}.md`;
  const load = files[file];
  if (!load || !findPost(slug)) {
    throw notFound();
  }
  return loadPage(file, load);
}

const popups = import.meta.glob<ReadonlyArray<string>>(
  ['../../blog/*.md', '!../../blog/README.md'],
  { import: 'default', query: '?popups' },
);

/** A post's hover popups, which its HTML leaves out. */
export function loadPostPopups(slug: string): LoadPopups {
  return async () => (await popups[`../../blog/${slug}.md`]?.()) ?? [];
}

/** The posts published right before and after `slug`. */
export function postNeighbours(slug: string) {
  const index = posts.findIndex((post) => post.slug === slug);
  return {
    newer: index <= 0 ? undefined : posts[index - 1],
    older: index === -1 ? undefined : posts[index + 1],
  };
}
