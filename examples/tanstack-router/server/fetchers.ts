const db = {
  posts: [
    { id: '1', title: 'hello world' },
    { id: '2', title: 'foo bar' },
  ],
};

export const getPosts = async () => {
  // simulate slow db
  await new Promise((res) => setTimeout(res, 1000));
  return db.posts;
};

export const getPostById = async (id: string) => {
  // simulate slow db
  await new Promise((res) => setTimeout(res, 1000));
  return db.posts.find((post) => post.id === id);
};
