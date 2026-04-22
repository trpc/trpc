import { dataView, list, type Entity } from '@nkzw/fate/server';
import type { Post as PrismaPost } from '@prisma/client';

type FeedRecord = {
  id: string;
  posts: PrismaPost[];
};

export const postDataView = dataView<PrismaPost>('Post')({
  createdAt: true,
  id: true,
  text: true,
  title: true,
  updatedAt: true,
});

export const feedDataView = dataView<FeedRecord>('Feed')({
  id: true,
  posts: list(postDataView),
});

export type Post = Entity<typeof postDataView, 'Post'>;
export type Feed = Entity<typeof feedDataView, 'Feed', { posts: Post[] }>;

export const Root = {
  feed: {
    procedure: 'get',
    router: 'feed',
    view: feedDataView,
  },
  posts: {
    router: 'post',
    view: list(postDataView),
  },
};
