import {
  useSuspenseInfiniteQuery,
  useSuspenseQuery,
} from '@tanstack/react-query';
import {
  createRootRouteWithContext,
  createRoute,
  useParams,
  useSearch,
} from '@tanstack/react-router';
import { type ReactNode, Suspense } from 'react';

import {
  CommentList,
  commentItems,
  Comments,
  CommentsSection,
  CommentsSkeleton,
  MoreByAuthor,
  MoreByAuthorList,
  MoreByAuthorSkeleton,
  morePosts,
  NotFound,
  Post,
  PostArticle,
  PostList,
  PostListPage,
  PostListSkeleton,
  PostSkeleton,
} from './blog.tsx';
import { type DemoContext, DemoLink, useDemoLoaderData } from './browser.tsx';
import { type TRPC, useTRPC } from './session.tsx';
import {
  ensureEntry,
  ensureInfiniteEntry,
  fetchEntry,
  fetchInfiniteEntry,
  loadHandles,
  prefetchEntry,
  prefetchInfiniteEntry,
  waterfallHandle,
  waterfallInfiniteHandle,
} from '@trpc/tanstack-react-query/unstable-handles';

/**
 * Where a blog starts its queries: in route loaders with one of the three
 * entries, at the top of each page as it renders, or in each component that
 * reads one.
 */
export type Strategy = 'ensure' | 'fetch' | 'prefetch' | 'reader' | 'top';

type LoaderVerb = Extract<Strategy, 'ensure' | 'fetch' | 'prefetch'>;

function pageFrom(search: Record<string, unknown>) {
  const page = Number(search['page']);
  return Number.isInteger(page) && page >= 1 ? page : 1;
}

// The site's registered router doesn't know the demo's routes, so these read
// them loosely.
function usePage() {
  const search: Record<string, unknown> = useSearch({ strict: false });
  return pageFrom(search);
}

function usePostId() {
  const params: { readonly id?: string } = useParams({ strict: false });
  return Number(params.id);
}

/** Handles built at the top of a page as it renders, which starts them */
function startList(trpc: TRPC, page: number) {
  return { list: waterfallHandle(trpc.post.list, { page }) };
}

function startPost(trpc: TRPC, id: number) {
  return {
    comments: waterfallInfiniteHandle(trpc.post.comments, { postId: id }),
    more: waterfallInfiniteHandle(trpc.post.moreByAuthor, { postId: id }),
    post: waterfallHandle(trpc.post.byId, { id }),
  };
}

const entryFor = {
  ensure: ensureEntry,
  fetch: fetchEntry,
  prefetch: prefetchEntry,
} satisfies Record<LoaderVerb, unknown>;

const infiniteEntryFor = {
  ensure: ensureInfiniteEntry,
  fetch: fetchInfiniteEntry,
  prefetch: prefetchInfiniteEntry,
} satisfies Record<LoaderVerb, unknown>;

async function loadList(verb: LoaderVerb, trpc: TRPC, page: number) {
  const [handles] = await loadHandles(trpc, {
    list: entryFor[verb](trpc.post.list, { page }),
  });
  return handles;
}

async function loadPost(verb: LoaderVerb, trpc: TRPC, id: number) {
  const [handles] = await loadHandles(trpc, {
    comments: infiniteEntryFor[verb](trpc.post.comments, { postId: id }),
    more: infiniteEntryFor[verb](trpc.post.moreByAuthor, { postId: id }),
    post: entryFor[verb](trpc.post.byId, { id }),
  });
  return handles;
}

type ListHandles = ReturnType<typeof startList>;
type PostHandles = ReturnType<typeof startPost>;

function ListPage(props: { readonly children: ReactNode }) {
  return (
    <div className="grid gap-3">
      <h3 className="text-base font-semibold">Latest articles</h3>
      {props.children}
    </div>
  );
}

function ListLayout(props: { readonly children: ReactNode }) {
  return (
    <ListPage>
      <Suspense fallback={<PostListSkeleton page={usePage()} />}>
        {props.children}
      </Suspense>
    </ListPage>
  );
}

function ListFromHandles(props: ListHandles & { readonly page: number }) {
  return (
    <ListLayout>
      <PostList list={props.list} page={props.page} />
    </ListLayout>
  );
}

function PostLayout(props: {
  readonly comments: ReactNode;
  readonly more: ReactNode;
  readonly post: ReactNode;
}) {
  return (
    <div className="grid gap-4">
      <DemoLink href="/posts">← All posts</DemoLink>
      {props.post}
      <CommentsSection>{props.comments}</CommentsSection>
      {props.more}
    </div>
  );
}

/** The blog's page at `href` with nothing loaded yet, as tall as it will be. */
export function PageSkeleton(props: { readonly href: string }) {
  const url = new URL(props.href, 'https://blog.example');
  const post = /^\/posts\/(\d+)$/.exec(url.pathname);
  if (post) {
    return <PostPageSkeleton id={Number(post[1])} />;
  }
  if (url.pathname === '/posts') {
    return (
      <ListPage>
        <PostListSkeleton
          page={pageFrom(Object.fromEntries(url.searchParams))}
        />
      </ListPage>
    );
  }
  return null;
}

/** An article with nothing loaded yet, as tall as it will be. */
function PostPageSkeleton(props: { readonly id: number }) {
  return (
    <div className="grid gap-4">
      <span className="text-brand-dark dark:text-brand-light">← All posts</span>
      <PostSkeleton id={props.id} />
      <CommentsSection>
        <CommentsSkeleton postId={props.id} />
      </CommentsSection>
      <MoreByAuthorSkeleton postId={props.id} />
    </div>
  );
}

function PostFromHandles(props: PostHandles) {
  const id = usePostId();
  return (
    <PostLayout
      comments={
        <Suspense fallback={<CommentsSkeleton postId={id} />}>
          <Comments comments={props.comments} />
        </Suspense>
      }
      more={
        <Suspense fallback={<MoreByAuthorSkeleton postId={id} />}>
          <MoreByAuthor more={props.more} />
        </Suspense>
      }
      post={
        <Suspense fallback={<PostSkeleton id={id} />}>
          <Post post={props.post} />
        </Suspense>
      }
    />
  );
}

function TopOfList(): ReactNode {
  const trpc = useTRPC();
  const page = usePage();
  return <ListFromHandles page={page} {...startList(trpc, page)} />;
}

function TopOfPost(): ReactNode {
  const trpc = useTRPC();
  return <PostFromHandles {...startPost(trpc, usePostId())} />;
}

function ListByPage(props: { readonly page: number }) {
  const trpc = useTRPC();
  const listQuery = useSuspenseQuery(
    trpc.post.list.queryOptions({ page: props.page }),
  );
  return <PostListPage list={listQuery.data} page={props.page} />;
}

function ReaderList(): ReactNode {
  return (
    <ListLayout>
      <ListByPage page={usePage()} />
    </ListLayout>
  );
}

function CommentsByPost(props: { readonly postId: number }) {
  const trpc = useTRPC();
  const commentsQuery = useSuspenseInfiniteQuery(
    trpc.post.comments.infiniteQueryOptions(
      { postId: props.postId },
      { getNextPageParam: (last) => last.nextCursor },
    ),
  );
  return <CommentList comments={commentItems(commentsQuery.data)} />;
}

function MoreByPost(props: { readonly postId: number }) {
  const trpc = useTRPC();
  const moreQuery = useSuspenseInfiniteQuery(
    trpc.post.moreByAuthor.infiniteQueryOptions(
      { postId: props.postId },
      { getNextPageParam: (last) => last.nextCursor },
    ),
  );
  return <MoreByAuthorList more={morePosts(moreQuery.data)} />;
}

/** The post, then what renders inside it, which only starts once it's in. */
function PostThenTheRest(props: { readonly id: number }) {
  const trpc = useTRPC();
  const postQuery = useSuspenseQuery(
    trpc.post.byId.queryOptions({ id: props.id }),
  );
  return (
    <PostLayout
      comments={
        <Suspense fallback={<CommentsSkeleton postId={props.id} />}>
          <CommentsByPost postId={props.id} />
        </Suspense>
      }
      more={
        <Suspense fallback={<MoreByAuthorSkeleton postId={props.id} />}>
          <MoreByPost postId={props.id} />
        </Suspense>
      }
      post={<PostArticle post={postQuery.data} />}
    />
  );
}

function ReaderPost(): ReactNode {
  const id = usePostId();
  return (
    <Suspense fallback={<PostPageSkeleton id={id} />}>
      <PostThenTheRest id={id} />
    </Suspense>
  );
}

function createLoaderRoutes(verb: LoaderVerb) {
  const root = createRootRouteWithContext<DemoContext>()({
    notFoundComponent: NotFound,
  });
  const loadListPage = (args: {
    readonly context: DemoContext;
    readonly deps: { readonly page: number };
  }) => loadList(verb, args.context.trpc, args.deps.page);
  const loadPostPage = (args: {
    readonly context: DemoContext;
    readonly params: { readonly id: string };
  }) => loadPost(verb, args.context.trpc, Number(args.params.id));

  function LoaderList(): ReactNode {
    const data = useDemoLoaderData<typeof loadListPage>();
    return <ListFromHandles page={usePage()} {...data} />;
  }

  function LoaderPost(): ReactNode {
    return <PostFromHandles {...useDemoLoaderData<typeof loadPostPage>()} />;
  }

  return root.addChildren([
    createRoute({
      component: LoaderList,
      getParentRoute: () => root,
      loader: loadListPage,
      loaderDeps: ({ search }) => ({ page: search.page }),
      path: '/posts',
      validateSearch: (search) => ({ page: pageFrom(search) }),
    }),
    createRoute({
      component: LoaderPost,
      getParentRoute: () => root,
      loader: loadPostPage,
      path: '/posts/$id',
    }),
  ]);
}

function createRenderRoutes(list: () => ReactNode, post: () => ReactNode) {
  const root = createRootRouteWithContext<DemoContext>()({
    notFoundComponent: NotFound,
  });
  return root.addChildren([
    createRoute({
      component: list,
      getParentRoute: () => root,
      path: '/posts',
      validateSearch: (search) => ({ page: pageFrom(search) }),
    }),
    createRoute({
      component: post,
      getParentRoute: () => root,
      path: '/posts/$id',
    }),
  ]);
}

/**
 * A blog with a paged list, `/posts?page=2`, and articles, `/posts/1`. The
 * list is one query. An article's comments and the author's other posts
 * render inside the article, so their queries can wait for it.
 */
export function createBlogRoutes(strategy: Strategy) {
  switch (strategy) {
    case 'reader':
      return createRenderRoutes(ReaderList, ReaderPost);
    case 'top':
      return createRenderRoutes(TopOfList, TopOfPost);
    case 'ensure':
    case 'fetch':
    case 'prefetch':
      return createLoaderRoutes(strategy);
  }
}
