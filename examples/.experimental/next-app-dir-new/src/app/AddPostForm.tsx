'use client';

import { addPostSchema } from '@/db/schema';
import { toast } from 'sonner';
import { addPost } from './_action';
import { Form, useZodForm } from './Form';

export function AddPostForm() {
  const form = useZodForm({
    schema: addPostSchema,
    defaultValues: {
      title: 'hello world',
      content: 'this is a test post',
    },
  });

  console.log(form.formState.errors);

  return (
    <Form
      className="flex max-w-md flex-col gap-2"
      form={form}
      handleSubmit={async (values) => {
        const promise = addPost(values);
        return toast.promise(promise, {
          loading: 'Adding post...',
          success: 'Post added!',
          error: (error) => 'Failed to add post: ' + error.message,
        });
      }}
    >
      <div>
        <input
          className="rounded bg-zinc-300 p-1 text-zinc-900"
          type="text"
          {...form.register('title')}
          defaultValue={form.control._defaultValues.title}
        />
        {form.formState.errors.title && (
          <div>Invalid title: {form.formState.errors.title.message}</div>
        )}
      </div>

      <div>
        <input
          className="rounded bg-zinc-300 p-1 text-zinc-900"
          type="text"
          {...form.register('content')}
          defaultValue={form.control._defaultValues.content}
        />
        {form.formState.errors.content && (
          <div>Invalid content: {form.formState.errors.content.message}</div>
        )}
      </div>
      <button
        className="rounded bg-zinc-800 p-1"
        type="submit"
        disabled={form.formState.isSubmitting}
      >
        Add post
      </button>
    </Form>
  );
}
