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
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@shared/ui/components/field';
import { Input } from '@shared/ui/components/input';
import { Spinner } from '@shared/ui/components/spinner';
import { Textarea } from '@shared/ui/components/textarea';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { inferProcedureInput } from '@trpc/server';
import { CircleAlertIcon } from 'lucide-react';
import type { AppRouter } from '~/server/routers/_app';
import { useTRPC } from '~/trpc/client';

export function AddPostCard() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const addPost = useMutation(
    trpc.post.add.mutationOptions({
      async onSuccess() {
        // refetches posts after a post is added
        await queryClient.invalidateQueries(trpc.post.list.pathFilter());
      },
    }),
  );
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
