import { skipToken, useQuery, useSuspenseQuery } from '@tanstack/react-query';
import {
  createRootRouteWithContext,
  createRoute,
} from '@tanstack/react-router';
import { ChevronRight, UserRound } from 'lucide-react';
import { type ReactNode, Suspense, useId } from 'react';

import { Skeleton } from '@shared/ui/components/skeleton';

import { blogData } from './backend.ts';
import {
  NotFound,
  Pager,
  PostCards,
  PostCardSkeletons,
  Shaped,
} from './blog.tsx';
import { pageFrom, usePage, usePostId } from './blog-routes.tsx';
import { type DemoContext, DemoLink, useDemoLoaderData } from './browser.tsx';
import { type TRPC, useTRPC } from './session.tsx';
import {
  experimental_dataOf,
  experimental_entryPerItem,
  experimental_handleOfItem,
  fromHandle,
  loadHandles,
  prefetchEntry,
} from '@trpc/tanstack-react-query/unstable-handles';
import type {
  experimental_inferHandles,
  inferQueryHandle,
  TRPCLoadEntries,
} from '@trpc/tanstack-react-query/unstable-handles';

/**
 * A blog whose pages need a query's data to start the next one: an
 * article's author card needs the author's id, which is in the post, and the
 * author's other posts need the author. The list shows each post's author,
 * by the id in each row.
 *
 * - `waterfall`: the page fetches as it renders in the browser. Each query
 *   starts when the one before it has data, so each one is a round trip.
 * - `pipelined`: the loader names every query up front, and the server fills
 *   in the ids. One request.
 */
export type AuthorBlogStrategy = 'pipelined' | 'waterfall';

// What the pages load, from the URL alone

function postPageEntries(trpc: TRPC, id: number) {
  const post = prefetchEntry(trpc.post.byId, { id });
  const author = experimental_dataOf(post, (it) =>
    prefetchEntry(trpc.author.byId, { id: it.authorId }),
  );
  return {
    author,
    more: experimental_dataOf(author, (it) =>
      prefetchEntry(trpc.post.byAuthor, { authorId: it.id }),
    ),
    post,
  } satisfies TRPCLoadEntries;
}

function feedEntries(trpc: TRPC, page: number) {
  const feed = prefetchEntry(trpc.post.feed, { page });
  return {
    authors: experimental_entryPerItem(
      experimental_dataOf(feed).posts,
      (post) => prefetchEntry(trpc.author.byId, { id: post.authorId }),
    ),
    feed,
  } satisfies TRPCLoadEntries;
}

type PostPageHandles = experimental_inferHandles<typeof postPageEntries>;
type FeedHandles = experimental_inferHandles<typeof feedEntries>;

// The article page

interface Article {
  readonly body: string;
  readonly minutes: number;
  readonly title: string;
}

function ArticleBody(props: { readonly post: Article }) {
  return (
    <article className="grid gap-1">
      <h3 className="text-base font-semibold">{props.post.title}</h3>
      <p className="text-muted-foreground">{props.post.body}</p>
      <p className="text-xs text-muted-foreground">
        {props.post.minutes} min read
      </p>
    </article>
  );
}

function ArticleSkeleton(props: { readonly id: number }) {
  const post = blogData.post(props.id);
  return (
    <Shaped shape={post ? <ArticleBody post={post} /> : null}>
      <div className="grid gap-2">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-3 w-20" />
      </div>
    </Shaped>
  );
}

interface Author {
  readonly bio: string;
  readonly name: string;
}

function AuthorCard(props: { readonly author: Author }) {
  return (
    <section
      aria-label="Author"
      className="flex items-center gap-3 border-t pt-3"
    >
      <span
        aria-hidden
        className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-sm font-medium text-muted-foreground"
      >
        {props.author.name.charAt(0)}
      </span>
      <span className="grid">
        <span className="font-medium">{props.author.name}</span>
        <span className="text-xs text-muted-foreground">
          {props.author.bio}
        </span>
      </span>
    </section>
  );
}

function authorOfPost(postId: number) {
  const post = blogData.post(postId);
  return post && blogData.author(post.authorId);
}

function AuthorSkeleton(props: { readonly postId: number }) {
  const author = authorOfPost(props.postId);
  return (
    <Shaped shape={author ? <AuthorCard author={author} /> : null}>
      <div className="flex items-center gap-3 border-t pt-3">
        <Skeleton className="size-9 shrink-0 rounded-full" />
        <div className="grid flex-1 gap-1.5">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      </div>
    </Shaped>
  );
}

type Summaries = ReturnType<typeof blogData.byAuthor>;

function otherPosts(posts: Summaries, postId: number) {
  return posts.filter((post) => post.id !== postId);
}

function MoreList(props: {
  readonly author: string;
  readonly posts: Summaries;
}) {
  const heading = useId();
  return (
    <section aria-labelledby={heading} className="grid gap-2 border-t pt-3">
      <h4
        className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
        id={heading}
      >
        <UserRound className="size-3.5" /> More by {props.author}
      </h4>
      <PostCards posts={props.posts} />
    </section>
  );
}

function MoreSkeleton(props: { readonly postId: number }) {
  const author = authorOfPost(props.postId);
  return (
    <Shaped
      shape={
        author ? (
          <MoreList
            author={author.name}
            posts={otherPosts(blogData.byAuthor(author.id), props.postId)}
          />
        ) : null
      }
    >
      <div className="grid gap-2 border-t pt-3">
        <Skeleton className="h-4 w-28" />
        <PostCardSkeletons count={2} />
      </div>
    </Shaped>
  );
}

function ArticleLayout(props: {
  readonly author: ReactNode;
  readonly post: ReactNode;
}) {
  return (
    <div className="grid gap-4">
      <DemoLink href="/posts">← All posts</DemoLink>
      {props.post}
      {props.author}
    </div>
  );
}

/** The author card and the author's other posts, with nothing loaded. */
function AuthorAndMoreSkeleton(props: { readonly postId: number }) {
  return (
    <>
      <AuthorSkeleton postId={props.postId} />
      <MoreSkeleton postId={props.postId} />
    </>
  );
}

function ArticlePageSkeleton(props: { readonly id: number }) {
  return (
    <div className="grid gap-4">
      <span className="text-brand-dark dark:text-brand-light">← All posts</span>
      <ArticleSkeleton id={props.id} />
      <AuthorAndMoreSkeleton postId={props.id} />
    </div>
  );
}

// The article page, from the loader's handles

function ArticleOf(props: {
  readonly post: inferQueryHandle<TRPC['post']['byId']>;
}) {
  const trpc = useTRPC();
  const postQuery = useSuspenseQuery(fromHandle(trpc, props.post));
  return <ArticleBody post={postQuery.data} />;
}

function MoreOf(props: {
  readonly author: string;
  readonly more: inferQueryHandle<TRPC['post']['byAuthor']>;
  readonly postId: number;
}) {
  const trpc = useTRPC();
  const moreQuery = useSuspenseQuery(fromHandle(trpc, props.more));
  return (
    <MoreList
      author={props.author}
      posts={otherPosts(moreQuery.data.posts, props.postId)}
    />
  );
}

/**
 * The author's handle needs the post's data, and the list's handle needs
 * the author's. Both queries are in the cache, or on their way, by the time
 * their data is read here.
 */
function AuthorOf(props: { readonly handles: PostPageHandles }) {
  const trpc = useTRPC();
  const { handles } = props;
  const postQuery = useSuspenseQuery(fromHandle(trpc, handles.post));
  const authorQuery = useSuspenseQuery(
    fromHandle(trpc, experimental_handleOfItem(handles.author, postQuery.data)),
  );
  return (
    <>
      <AuthorCard author={authorQuery.data} />
      <Suspense fallback={<MoreSkeleton postId={postQuery.data.id} />}>
        <MoreOf
          author={authorQuery.data.name}
          more={experimental_handleOfItem(handles.more, authorQuery.data)}
          postId={postQuery.data.id}
        />
      </Suspense>
    </>
  );
}

function ArticleFromHandles(props: { readonly handles: PostPageHandles }) {
  const id = usePostId();
  return (
    <ArticleLayout
      author={
        <Suspense fallback={<AuthorAndMoreSkeleton postId={id} />}>
          <AuthorOf handles={props.handles} />
        </Suspense>
      }
      post={
        <Suspense fallback={<ArticleSkeleton id={id} />}>
          <ArticleOf post={props.handles.post} />
        </Suspense>
      }
    />
  );
}

// The article page as a waterfall: each query starts with the last one's data

function WaterfallArticle(): ReactNode {
  const id = usePostId();
  const trpc = useTRPC();
  const postQuery = useQuery({
    ...trpc.post.byId.queryOptions({ id }),
    // An article that doesn't exist shows the router's error page
    throwOnError: true,
  });
  const post = postQuery.data;
  // Nothing to ask for until the post is in
  const authorQuery = useQuery(
    trpc.author.byId.queryOptions(post ? { id: post.authorId } : skipToken),
  );
  const author = authorQuery.data;
  // And nothing to ask for until the author is in
  const moreQuery = useQuery(
    trpc.post.byAuthor.queryOptions(
      author ? { authorId: author.id } : skipToken,
    ),
  );
  return (
    <ArticleLayout
      author={
        <>
          {author ? (
            <AuthorCard author={author} />
          ) : (
            <AuthorSkeleton postId={id} />
          )}
          {author && moreQuery.data ? (
            <MoreList
              author={author.name}
              posts={otherPosts(moreQuery.data.posts, id)}
            />
          ) : (
            <MoreSkeleton postId={id} />
          )}
        </>
      }
      post={post ? <ArticleBody post={post} /> : <ArticleSkeleton id={id} />}
    />
  );
}

// The list, with each post's author

type FeedPost = ReturnType<typeof blogData.feed>['posts'][number];

function FeedCard(props: {
  readonly author: ReactNode;
  readonly post: FeedPost;
}) {
  const post = props.post;
  return (
    <DemoLink
      className="group flex items-start gap-3 rounded-lg border bg-background p-3 outline-none transition-colors hover:border-link hover:bg-accent/40 focus-visible:ring-[3px] focus-visible:ring-ring/50 motion-reduce:transition-none"
      href={`/posts/${post.id}`}
    >
      <span className="grid min-w-0 flex-1 gap-1">
        <span className="font-semibold underline-offset-2 group-hover:text-link group-hover:underline">
          {post.title}
        </span>
        <span className="line-clamp-2 text-xs text-muted-foreground">
          {post.excerpt}
        </span>
        <span className="flex h-4 items-center gap-x-1.5 text-[0.7rem] text-muted-foreground">
          {props.author}
          <span>· {post.minutes} min read</span>
        </span>
      </span>
      <ChevronRight
        aria-hidden
        className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-link motion-reduce:transition-none"
      />
    </DemoLink>
  );
}

function FeedList(props: {
  readonly author: (post: FeedPost) => ReactNode;
  readonly feed: ReturnType<typeof blogData.feed>;
  readonly page: number;
}) {
  return (
    <>
      <ul className="grid gap-2">
        {props.feed.posts.map((post) => (
          <li key={post.id}>
            <FeedCard author={props.author(post)} post={post} />
          </li>
        ))}
      </ul>
      <Pager page={props.page} pageCount={props.feed.pageCount} />
    </>
  );
}

const authorNameSkeleton = <Skeleton className="h-3 w-10" />;

function FeedSkeleton(props: { readonly page: number }) {
  return (
    <Shaped
      shape={
        <FeedList
          author={(post) => blogData.author(post.authorId)?.name}
          feed={blogData.feed(props.page)}
          page={props.page}
        />
      }
    >
      <PostCardSkeletons count={3} />
    </Shaped>
  );
}

function FeedLayout(props: { readonly children: ReactNode }) {
  return (
    <div className="grid gap-3">
      <h3 className="text-base font-semibold">Latest articles</h3>
      {props.children}
    </div>
  );
}

function AuthorNameOf(props: {
  readonly author: inferQueryHandle<TRPC['author']['byId']>;
}) {
  const trpc = useTRPC();
  const authorQuery = useSuspenseQuery(fromHandle(trpc, props.author));
  return <span>{authorQuery.data.name}</span>;
}

/** Each row finishes the authors' handle with its own post. */
function FeedOf(props: { readonly handles: FeedHandles }) {
  const trpc = useTRPC();
  const { handles } = props;
  const page = usePage();
  const feedQuery = useSuspenseQuery(fromHandle(trpc, handles.feed));
  return (
    <FeedList
      author={(post) => (
        <Suspense fallback={authorNameSkeleton}>
          <AuthorNameOf
            author={experimental_handleOfItem(handles.authors, post)}
          />
        </Suspense>
      )}
      feed={feedQuery.data}
      page={page}
    />
  );
}

/** A row's author, which the row can only ask for once the list is in. */
function AuthorNameById(props: { readonly id: number }) {
  const trpc = useTRPC();
  const authorQuery = useQuery(trpc.author.byId.queryOptions({ id: props.id }));
  return authorQuery.data ? (
    <span>{authorQuery.data.name}</span>
  ) : (
    authorNameSkeleton
  );
}

/** The list as a waterfall: the list, then an author for each of its rows. */
function WaterfallFeed(): ReactNode {
  const page = usePage();
  const trpc = useTRPC();
  const feedQuery = useQuery(trpc.post.feed.queryOptions({ page }));
  return (
    <FeedLayout>
      {feedQuery.data ? (
        <FeedList
          author={(post) => <AuthorNameById id={post.authorId} />}
          feed={feedQuery.data}
          page={page}
        />
      ) : (
        <FeedSkeleton page={page} />
      )}
    </FeedLayout>
  );
}

/** The blog's page at `href` with nothing loaded yet, as tall as it will be. */
export function AuthorBlogSkeleton(props: { readonly href: string }) {
  const url = new URL(props.href, 'https://blog.example');
  const post = /^\/posts\/(\d+)$/.exec(url.pathname);
  if (post) {
    return <ArticlePageSkeleton id={Number(post[1])} />;
  }
  if (url.pathname === '/posts') {
    return (
      <FeedLayout>
        <FeedSkeleton page={pageFrom(Object.fromEntries(url.searchParams))} />
      </FeedLayout>
    );
  }
  return null;
}

function createPipelinedRoutes() {
  const root = createRootRouteWithContext<DemoContext>()({
    // An article that doesn't exist fails where its query is read
    errorComponent: NotFound,
    notFoundComponent: NotFound,
  });
  const loadFeed = async (args: {
    readonly context: DemoContext;
    readonly deps: { readonly page: number };
  }) => {
    const { trpc } = args.context;
    const [handles] = await loadHandles(
      trpc,
      feedEntries(trpc, args.deps.page),
    );
    return handles;
  };
  const loadArticle = async (args: {
    readonly context: DemoContext;
    readonly params: { readonly id: string };
  }) => {
    const { trpc } = args.context;
    const [handles] = await loadHandles(
      trpc,
      postPageEntries(trpc, Number(args.params.id)),
    );
    return handles;
  };

  function LoaderFeed(): ReactNode {
    const handles = useDemoLoaderData<typeof loadFeed>();
    return (
      <FeedLayout>
        <Suspense fallback={<FeedSkeleton page={usePage()} />}>
          <FeedOf handles={handles} />
        </Suspense>
      </FeedLayout>
    );
  }

  function LoaderArticle(): ReactNode {
    return (
      <ArticleFromHandles handles={useDemoLoaderData<typeof loadArticle>()} />
    );
  }

  return root.addChildren([
    createRoute({
      component: LoaderFeed,
      getParentRoute: () => root,
      loader: loadFeed,
      loaderDeps: ({ search }) => ({ page: search.page }),
      path: '/posts',
      validateSearch: (search) => ({ page: pageFrom(search) }),
    }),
    createRoute({
      component: LoaderArticle,
      getParentRoute: () => root,
      loader: loadArticle,
      path: '/posts/$id',
    }),
  ]);
}

function createWaterfallRoutes() {
  const root = createRootRouteWithContext<DemoContext>()({
    // An article that doesn't exist fails where its query is read
    errorComponent: NotFound,
    notFoundComponent: NotFound,
  });
  return root.addChildren([
    createRoute({
      component: WaterfallFeed,
      getParentRoute: () => root,
      path: '/posts',
      validateSearch: (search) => ({ page: pageFrom(search) }),
    }),
    createRoute({
      component: WaterfallArticle,
      getParentRoute: () => root,
      path: '/posts/$id',
    }),
  ]);
}

/**
 * The blog's routes: a paged list with each post's author, `/posts?page=2`,
 * and articles with an author card and the author's other posts, `/posts/1`.
 */
export function createAuthorBlogRoutes(strategy: AuthorBlogStrategy) {
  return strategy === 'pipelined'
    ? createPipelinedRoutes()
    : createWaterfallRoutes();
}
