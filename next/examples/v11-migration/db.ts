/**
 * The app's data layer. It has no tRPC in it, so the migration leaves it
 * alone: the v11 server and the v12 one both read it.
 */
import { EventEmitter } from 'node:events';

export interface Post {
  id: string;
  title: string;
  author: string;
  createdAt: Date;
}

const posts = new Map<string, Post>([
  [
    '1',
    {
      id: '1',
      title: 'Hello v11',
      author: 'ada',
      createdAt: new Date('2025-04-01T12:00:00Z'),
    },
  ],
]);
const events = new EventEmitter<{ add: [Post] }>();

export const db = {
  events,
  list: () => [...posts.values()],
  byId: (id: string) => posts.get(id),
  /** The posts added after `id`, for a subscription that resumes. */
  after: (id: string | null | undefined) =>
    [...posts.values()].filter((post) => Number(post.id) > Number(id ?? 0)),
  add(title: string, author: string): Post {
    const post: Post = {
      id: String(posts.size + 1),
      title,
      author,
      createdAt: new Date(),
    };
    posts.set(post.id, post);
    events.emit('add', post);
    return post;
  },
};
