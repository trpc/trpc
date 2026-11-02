import { trpc } from '../utils/trpc';
import type { NextPageWithLayout } from './_app';
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '@shared/ui/components/alert';
import { Badge } from '@shared/ui/components/badge';
import { Button } from '@shared/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@shared/ui/components/card';
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@shared/ui/components/field';
import { Input } from '@shared/ui/components/input';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from '@shared/ui/components/item';
import { Skeleton } from '@shared/ui/components/skeleton';
import { Spinner } from '@shared/ui/components/spinner';
import { Textarea } from '@shared/ui/components/textarea';
import type { inferProcedureInput } from '@trpc/server';
import { ChevronRightIcon, CircleAlertIcon } from 'lucide-react';
import Link from 'next/link';
import type { AppRouter } from '~/server/routers/_app';
import type { RouterOutput } from '~/utils/trpc';

type Post = RouterOutput['post']['list']['items'][number];

function formatDate(date: Date) {
  return date.toLocaleDateString('en-us', {
    dateStyle: 'medium',
    timeZone: 'UTC',
  });
}

function PostItem(props: { post: Post }) {
  const { post } = props;
  return (
    <Item variant="outline" render={<Link href={`/post/${post.id}`} />}>
      <ItemContent>
        <ItemTitle>{post.title}</ItemTitle>
        <ItemDescription>{post.text}</ItemDescription>
      </ItemContent>
      <ItemActions>
        <time
          dateTime={post.createdAt.toISOString()}
          className="text-xs text-muted-foreground"
        >
          {formatDate(post.createdAt)}
        </time>
        <ChevronRightIcon className="size-4 text-muted-foreground" />
      </ItemActions>
    </Item>
  );
}

function PostsCard() {
  const postsQuery = trpc.post.list.useInfiniteQuery(
    {
      limit: 5,
    },
    {
      getNextPageParam(lastPage) {
        return lastPage.nextCursor;
      },
    },
  );

  // prefetch all posts for instant navigation
  // useEffect(() => {
  //   const allPosts = postsQuery.data?.pages.flatMap((page) => page.items) ?? [];
  //   for (const { id } of allPosts) {
  //     void utils.post.byId.prefetch({ id });
  //   }
  // }, [postsQuery.data, utils]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Latest posts</CardTitle>
        <CardDescription>
          <code>post.list</code> with <code>useInfiniteQuery</code>, five posts
          a page
        </CardDescription>
      </CardHeader>
      <CardContent>
        {(() => {
          switch (postsQuery.status) {
            case 'pending':
              return (
                <ItemGroup className="gap-2">
                  {Array.from({ length: 3 }, (_, index) => (
                    <Skeleton key={index} className="h-16 w-full" />
                  ))}
                </ItemGroup>
              );
            case 'error':
              return (
                <Alert variant="destructive">
                  <CircleAlertIcon />
                  <AlertTitle>Couldn't load posts</AlertTitle>
                  <AlertDescription>
                    {postsQuery.error.message}
                  </AlertDescription>
                  <AlertAction>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => postsQuery.refetch()}
                    >
                      Try again
                    </Button>
                  </AlertAction>
                </Alert>
              );
            case 'success':
              return (
                <ItemGroup className="gap-2">
                  {postsQuery.data.pages.flatMap((page) =>
                    page.items.map((post) => (
                      <PostItem key={post.id} post={post} />
                    )),
                  )}
                </ItemGroup>
              );
          }
        })()}
      </CardContent>
      {postsQuery.status === 'success' && (
        <CardFooter className="justify-center">
          {(() => {
            switch (postsQuery.fetchStatus) {
              case 'fetching':
                return (
                  <Button variant="outline" disabled>
                    <Spinner />
                    Loading…
                  </Button>
                );
              case 'paused':
                return (
                  <Button variant="outline" disabled>
                    Waiting for network…
                  </Button>
                );
              case 'idle':
                return postsQuery.hasNextPage ? (
                  <Button
                    variant="outline"
                    onClick={() => postsQuery.fetchNextPage()}
                  >
                    Load more
                  </Button>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    That's every post
                  </p>
                );
            }
          })()}
        </CardFooter>
      )}
    </Card>
  );
}

function AddPostCard() {
  const utils = trpc.useUtils();
  const addPost = trpc.post.add.useMutation({
    async onSuccess() {
      // refetches posts after a post is added
      await utils.post.list.invalidate();
    },
  });
  const pending = addPost.status === 'pending';

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add a post</CardTitle>
        <CardDescription>
          <code>post.add</code>, then the list refetches
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={async (e) => {
            /**
             * In a real app you probably don't want to use this manually
             * Checkout React Hook Form - it works great with tRPC
             * @see https://react-hook-form.com/
             * @see https://kitchen-sink.trpc.io/react-hook-form
             */
            e.preventDefault();
            const $form = e.currentTarget;
            const values = Object.fromEntries(new FormData($form));
            type Input = inferProcedureInput<AppRouter['post']['add']>;
            //    ^?
            const input: Input = {
              title: values.title as string,
              text: values.text as string,
            };
            try {
              await addPost.mutateAsync(input);

              $form.reset();
            } catch (cause) {
              console.error({ cause }, 'Failed to add post');
            }
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="title">Title</FieldLabel>
              <Input
                id="title"
                name="title"
                type="text"
                placeholder="Hello, world"
                disabled={pending}
              />
              <FieldDescription>Up to 32 characters</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="text">Text</FieldLabel>
              <Textarea
                id="text"
                name="text"
                placeholder="What's on your mind?"
                disabled={pending}
                rows={5}
              />
            </Field>
            {addPost.status === 'error' && (
              <Alert variant="destructive">
                <CircleAlertIcon />
                <AlertTitle>Couldn't add the post</AlertTitle>
                <AlertDescription className="break-all">
                  {addPost.error.message}
                </AlertDescription>
              </Alert>
            )}
            <Button type="submit" size="lg" disabled={pending}>
              {pending && <Spinner />}
              Add post
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}

const IndexPage: NextPageWithLayout = () => {
  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col items-start gap-4">
        <Badge variant="secondary">Next.js · tRPC · Prisma</Badge>
        <h1 className="text-4xl font-bold tracking-tight text-balance sm:text-5xl">
          Welcome to your tRPC with Prisma starter!
        </h1>
        <p className="max-w-2xl text-muted-foreground">
          If you get stuck, check{' '}
          <Link className="text-foreground underline" href="https://trpc.io">
            the docs
          </Link>
          , write a message in our{' '}
          <Link
            className="text-foreground underline"
            href="https://trpc.io/discord"
          >
            Discord-channel
          </Link>
          , or write a message in{' '}
          <Link
            className="text-foreground underline"
            href="https://github.com/trpc/trpc/discussions"
          >
            GitHub Discussions
          </Link>
          .
        </p>
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_22rem]">
        <PostsCard />
        <AddPostCard />
      </div>
    </div>
  );
};

export default IndexPage;

/**
 * If you want to statically render this page
 * - Export `appRouter` & `createContext` from [trpc].ts
 * - Make the `opts` object optional on `createContext()`
 *
 * @see https://trpc.io/docs/v11/ssg
 */
// export const getStaticProps = async (
//   context: GetStaticPropsContext<{ filter: string }>,
// ) => {
//   const ssg = createServerSideHelpers({
//     router: appRouter,
//     ctx: await createContext(),
//   });
//
//   await ssg.post.all.fetch();
//
//   return {
//     props: {
//       trpcState: ssg.dehydrate(),
//       filter: context.params?.filter ?? 'all',
//     },
//     revalidate: 1,
//   };
// };
