import { useSuspenseQuery } from '@tanstack/react-query';
import {
  createRootRouteWithContext,
  createRoute,
  useParams,
  useSearch,
} from '@tanstack/react-router';
import { type ReactNode, Suspense } from 'react';

import {
  CommentList,
  Comments,
  CommentsSection,
  CommentsSkeleton,
  MoreByAuthor,
  MoreByAuthorList,
  MoreByAuthorSkeleton,
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

/**
 * Where a blog starts its queries: in route loaders with one of the three
 * verbs, at the top of each page as it renders, or in each component that
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

function startList(trpc: TRPC, page: number) {
  return { list: trpc.post.list.unstable_$prefetch({ page }) };
}

function startPost(trpc: TRPC, id: number) {
  return {
    comments: trpc.post.comments.unstable_$prefetch({ postId: id }),
    more: trpc.post.moreByAuthor.unstable_$prefetch({ postId: id }),
    post: trpc.post.byId.unstable_$prefetch({ id }),
  };
}

async function loadList(verb: LoaderVerb, trpc: TRPC, page: number) {
  switch (verb) {
    case 'prefetch':
      return startList(trpc, page);
    case 'ensure':
      return { list: await trpc.post.list.unstable_$ensure({ page }) };
    case 'fetch':
      return { list: await trpc.post.list.unstable_$fetch({ page }) };
  }
}

async function loadPost(verb: LoaderVerb, trpc: TRPC, id: number) {
  switch (verb) {
    case 'prefetch':
      return startPost(trpc, id);
    case 'ensure': {
      const [post, comments, more] = await Promise.all([
        trpc.post.byId.unstable_$ensure({ id }),
        trpc.post.comments.unstable_$ensure({ postId: id }),
        trpc.post.moreByAuthor.unstable_$ensure({ postId: id }),
      ]);
      return { comments, more, post };
    }
    case 'fetch': {
      const [post, comments, more] = await Promise.all([
        trpc.post.byId.unstable_$fetch({ id }),
        trpc.post.comments.unstable_$fetch({ postId: id }),
        trpc.post.moreByAuthor.unstable_$fetch({ postId: id }),
      ]);
      return { comments, more, post };
    }
  }
}

type ListHandles = ReturnType<typeof startList>;
type PostHandles = ReturnType<typeof startPost>;

function ListLayout(props: { readonly children: ReactNode }) {
  return (
    <div className="grid gap-3">
      <h3 className="text-base font-semibold">Latest articles</h3>
      <Suspense fallback={<PostListSkeleton />}>{props.children}</Suspense>
    </div>
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

function PostFromHandles(props: PostHandles) {
  return (
    <PostLayout
      comments={
        <Suspense fallback={<CommentsSkeleton />}>
          <Comments comments={props.comments} />
        </Suspense>
      }
      more={
        <Suspense fallback={<MoreByAuthorSkeleton />}>
          <MoreByAuthor more={props.more} />
        </Suspense>
      }
      post={
        <Suspense fallback={<PostSkeleton />}>
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
  const commentsQuery = useSuspenseQuery(
    trpc.post.comments.queryOptions({ postId: props.postId }),
  );
  return <CommentList comments={commentsQuery.data} />;
}

function MoreByPost(props: { readonly postId: number }) {
  const trpc = useTRPC();
  const moreQuery = useSuspenseQuery(
    trpc.post.moreByAuthor.queryOptions({ postId: props.postId }),
  );
  return <MoreByAuthorList more={moreQuery.data} />;
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
        <Suspense fallback={<CommentsSkeleton />}>
          <CommentsByPost postId={props.id} />
        </Suspense>
      }
      more={
        <Suspense fallback={<MoreByAuthorSkeleton />}>
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
    <Suspense fallback={<PostSkeleton />}>
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
