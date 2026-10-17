/**
 * An in-memory blog, so code blocks have something to read and write.
 */
export interface Post {
  id: string;
  title: string;
  author: string | null;
  createdAt: Date;
}

export interface User {
  id: string;
  name: string;
}

const posts = new Map<string, Post>([
  ['1', { id: '1', title: 'Hello v12', author: null, createdAt: new Date(0) }],
]);

export const db = {
  post: {
    find: (id: string) => posts.get(id),
    list: () => [...posts.values()],
    create: (input: { title: string; author?: string | null }) => {
      const post: Post = {
        id: String(posts.size + 1),
        title: input.title,
        author: input.author ?? null,
        createdAt: new Date(),
      };
      posts.set(post.id, post);
      return post;
    },
  },
};
