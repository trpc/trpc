import { notFound } from '@tanstack/react-router';
import { posts } from 'virtual:blog-manifest';

import type { Post, PostMeta } from './types.ts';

export { posts };

// Each post is its own content-hashed chunk, as each page of the docs is.
const files = import.meta.glob<{ default: Post }>([
  '../../blog/*.md',
  '!../../blog/README.md',
]);

export function findPost(slug: string): PostMeta | undefined {
  return posts.find((post) => post.slug === slug);
}

/** A post, compiled at build time, or a 404. */
export async function loadPost(slug: string) {
  const load = files[`../../blog/${slug}.md`];
  if (!load || !findPost(slug)) {
    throw notFound();
  }
  const post = await load();
  return post.default;
}

/** The posts published right before and after `slug`. */
export function postNeighbours(slug: string) {
  const index = posts.findIndex((post) => post.slug === slug);
  return {
    newer: index <= 0 ? undefined : posts[index - 1],
    older: index === -1 ? undefined : posts[index + 1],
  };
}
