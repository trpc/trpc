'use client';

import { CreatePostSchema } from '~/db/schema';
import { trpc } from '~/trpc/react';
import { Button } from '~/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
  useForm,
} from '~/ui/form';
import { Input } from '~/ui/input';
import { toast } from 'sonner';

export function Posts() {
  // Won't be fetched initially, but instead pulled from query cache.
  const [data] = trpc.post.list.useSuspenseQuery();

  const utils = trpc.useUtils();
  const deletePost = trpc.post.delete.useMutation({
    onSuccess: async () => {
      await utils.post.invalidate();
    },
    onError: (err) => {
      toast.error(
        err?.data?.code === 'UNAUTHORIZED'
          ? 'You can only delete your own posts'
          : 'Failed to delete post',
      );
    },
  });

  return (
    <div className="flex flex-col gap-4">
      <CreatePost />
      {data.length === 0 && <p>No posts</p>}

      {data.map((post) => (
        <div key={post.id} className="bg-background-muted relative rounded p-4">
          <h2 className="text-lg font-semibold">{post.title}</h2>
          <p className="text-sm">{post.content}</p>
          <p className="text-xs text-gray-500">
            By {post.user.name} at {post.createdAt.toISOString()}
          </p>
          <Button
            onClick={() => deletePost.mutate(post.id)}
            className="absolute right-2 top-2"
          >
            Delete
          </Button>
        </div>
      ))}
    </div>
  );
}

function CreatePost() {
  const form = useForm({
    schema: CreatePostSchema,
    defaultValues: {
      content: '',
      title: '',
    },
  });

  const utils = trpc.useUtils();
  const createPost = trpc.post.create.useMutation({
    onSuccess: async () => {
      form.reset();
      await utils.post.invalidate();
    },
    onError: (err) => {
      toast.error(
        err?.data?.code === 'UNAUTHORIZED'
          ? 'You must be logged in to post'
          : 'Failed to create post',
      );
    },
  });

  return (
    <Form {...form}>
      <form
        className="flex w-full flex-col gap-2"
        onSubmit={form.handleSubmit((data) => createPost.mutate(data))}
      >
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Input {...field} placeholder="Title" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="content"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Input {...field} placeholder="Content" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button>Create</Button>
      </form>
    </Form>
  );
}
