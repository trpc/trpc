/**
 * The infinite handle verbs `.agent-docs/open/tanstack-infinite-handles.md`
 * proposes, as types, for one `post.feed` procedure: B takes
 * `infiniteOptions()`'s `input` function and needs it again where the handle
 * is read; C takes the input without its page param and names the key the
 * page param goes under. A is v12 as it is.
 */
import type { InfiniteData } from '@tanstack/react-query';
import type { InfiniteOptionsOut } from '@trpc12/tanstack-query';

import type { Post } from '../src/server.ts';

export interface FeedInput {
  limit: number;
  cursor?: string | undefined;
}

export interface FeedPage {
  items: Post[];
  nextCursor?: string | undefined;
}

declare const handleTypes: unique symbol;

/** An infinite query's handle: its key, its first page's input and page param. */
export interface InfiniteHandle<TInput, TPageParam> {
  readonly [handleTypes]: { input: TInput; pageParam: TPageParam };
  readonly queryKey: readonly [
    path: readonly string[],
    opts: { input?: TInput; type: 'infinite' },
  ];
  readonly input: TInput;
  readonly initialPageParam: TPageParam;
}

type FeedOptions<TPageParam> = InfiniteOptionsOut<
  FeedPage,
  Error,
  InfiniteData<FeedPage, TPageParam>,
  TPageParam
>;

type NextPage<TPageParam> = (last: FeedPage) => TPageParam | undefined;

export declare const trpcB: {
  post: {
    feed: {
      $ensureInfinite<TPageParam>(opts: {
        input: (pageParam: TPageParam) => FeedInput;
        initialPageParam: TPageParam;
        getNextPageParam: NextPage<TPageParam>;
      }): Promise<InfiniteHandle<FeedInput, TPageParam>>;
    };
  };
  $fromHandle<TPageParam>(
    handle: InfiniteHandle<FeedInput, TPageParam>,
    opts: {
      input: (pageParam: TPageParam) => FeedInput;
      getNextPageParam: NextPage<TPageParam>;
    },
  ): FeedOptions<TPageParam>;
};

type FeedRest = Omit<FeedInput, 'cursor'>;

export declare const trpcC: {
  post: {
    feed: {
      $ensureInfinite(opts: {
        input: FeedRest;
        pageParam: 'cursor';
        initialPageParam?: string | undefined;
        getNextPageParam: NextPage<string>;
        pages?: number;
      }): Promise<InfiniteHandle<FeedRest, string | undefined>>;
    };
  };
  $fromHandle(
    handle: InfiniteHandle<FeedRest, string | undefined>,
    opts: { getNextPageParam: NextPage<string> },
  ): FeedOptions<string | undefined>;
};
