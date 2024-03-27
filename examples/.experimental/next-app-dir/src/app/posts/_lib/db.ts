import { type Post } from '../_data.schema';

interface PostDb {
  getPost: (id: string) => Promise<Post | undefined>;
  addPost: (post: Post) => Promise<void>;
  listPosts: () => Promise<Post[]>;
}
const mockDb = (): PostDb => {
  console.log('⚙️ Using mock DB');
  const posts: Post[] = [
    {
      id: '1',
      title: 'Hello world',
      content: 'This is a test post',
    },
    {
      id: '2',
      title: 'Second post',
      content: 'This is another test post',
    },
  ];
  return {
    getPost: async (id) => {
      return posts.find((post) => post.id === id);
    },
    addPost: async (post) => {
      posts.push(post);
    },
    listPosts: async () => {
      return posts;
    },
  };
};
const pgDb = (): PostDb => {
  console.log('🚀 Using PG store');

  throw new Error('Not implemented');
};
export const db = process.env.POSTGRES_URL ? pgDb() : mockDb();
