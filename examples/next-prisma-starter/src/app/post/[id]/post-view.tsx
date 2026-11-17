'use client';

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@shared/ui/components/breadcrumb';
import { buttonVariants } from '@shared/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@shared/ui/components/card';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@shared/ui/components/empty';
import { Skeleton } from '@shared/ui/components/skeleton';
import { useQuery } from '@tanstack/react-query';
import { fromHandle } from '@trpc/tanstack-react-query/unstable-handles';
import type { inferQueryHandle } from '@trpc/tanstack-react-query/unstable-handles';
import Link from 'next/link';
import type { RouterOutput, TRPC } from '~/trpc/client';
import { useTRPC } from '~/trpc/client';

type PostByIdOutput = RouterOutput['post']['byId'];

function PostBreadcrumb(props: { title: string }) {
  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink render={<Link href="/" />}>Posts</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage>{props.title}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}

function PostItem(props: { post: PostByIdOutput }) {
  const { post } = props;
  return (
    <div className="flex flex-col gap-6">
      <PostBreadcrumb title={post.title} />
      <Card>
        <CardHeader>
          <CardTitle className="text-3xl font-bold tracking-tight">
            {post.title}
          </CardTitle>
          <CardDescription>
            Created{' '}
            <time dateTime={post.createdAt.toISOString()}>
              {post.createdAt.toLocaleDateString('en-us', {
                dateStyle: 'long',
                timeZone: 'UTC',
              })}
            </time>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="leading-relaxed break-words whitespace-pre-wrap">
            {post.text}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Raw data</CardTitle>
          <CardDescription>
            What <code>post.byId</code> returns. With superjson, the dates are
            still <code>Date</code>s.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto rounded-lg bg-muted p-4 font-mono text-xs leading-relaxed">
            {JSON.stringify(post, null, 4)}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}

export function PostView(props: {
  post: inferQueryHandle<TRPC['post']['byId']>;
}) {
  const trpc = useTRPC();
  // `page.tsx` loaded the post on the server, so this renders it at once
  const postQuery = useQuery(fromHandle(trpc, props.post));

  switch (postQuery.status) {
    case 'pending':
      return (
        <div className="flex flex-col gap-6" aria-label="Loading post">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      );
    case 'error':
      return (
        <Empty className="border bg-background">
          <EmptyHeader>
            <EmptyTitle className="text-4xl font-bold">
              {postQuery.error.data?.httpStatus ?? 500}
            </EmptyTitle>
            <EmptyDescription>{postQuery.error.message}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Link href="/" className={buttonVariants({ variant: 'outline' })}>
              Back to posts
            </Link>
          </EmptyContent>
        </Empty>
      );
    case 'success':
      return <PostItem post={postQuery.data} />;
  }
}
