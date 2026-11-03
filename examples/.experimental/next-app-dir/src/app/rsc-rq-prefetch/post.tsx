'use client';

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@shared/ui/components/alert';
import { Button } from '@shared/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@shared/ui/components/card';
import { Spinner } from '@shared/ui/components/spinner';
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { CircleAlertIcon } from 'lucide-react';
import { useTRPC } from '~/trpc/rq-client';
import { LatestPostCard, PostFields } from '../_components/latest-post';

export function Post() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const latestPostQuery = useSuspenseQuery(trpc.getLatestPost.queryOptions());

  const createPost = useMutation(
    trpc.createPost.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.getLatestPost.queryFilter());
      },
    }),
  );

  return (
    <div className="grid items-start gap-6 md:grid-cols-2">
      <LatestPostCard post={latestPostQuery.data} />
      <Card>
        <CardHeader>
          <CardTitle>Create a post</CardTitle>
          <CardDescription>
            Calls <code>createPost</code>, then invalidates{' '}
            <code>getLatestPost</code>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.target as HTMLFormElement;
              const data = new FormData(form);
              createPost.mutate(
                {
                  title: data.get('title') as string,
                  content: data.get('content') as string,
                },
                { onSuccess: () => form.reset() },
              );
            }}
          >
            <PostFields />
            {createPost.status === 'error' && (
              <Alert variant="destructive">
                <CircleAlertIcon />
                <AlertTitle>Couldn&apos;t create the post</AlertTitle>
                <AlertDescription>{createPost.error.message}</AlertDescription>
              </Alert>
            )}
            <Button
              type="submit"
              className="self-start"
              disabled={createPost.status === 'pending'}
            >
              {createPost.status === 'pending' && <Spinner />}
              Create post
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
