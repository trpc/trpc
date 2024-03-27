'use client';

import toast from 'react-hot-toast';
import { addPost } from './_data';
import { addPostSchema } from './_data.schema';
import { Form, useZodForm } from './_lib/Form';

export function AddPostForm() {
  const form = useZodForm({
    schema: addPostSchema,
    defaultValues: {
      title: 'hello world',
      content: 'this is a test post',
    },
  });

  return (
    <Form
      form={form}
      handleSubmit={async (values) => {
        //                  ^?
        const promise = addPost(values);
        return toast
          .promise(promise, {
            loading: 'Adding post...',
            success: 'Post added!',
            error: (error) => 'Failed to add post: ' + error.message,
          })
          .catch((error) => {
            console.warn('Failed to add post', error);
          });
      }}
    >
      <div>
        <input
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
          type="text"
          {...form.register('content')}
          defaultValue={form.control._defaultValues.content}
        />
        {form.formState.errors.content && (
          <div>Invalid content: {form.formState.errors.content.message}</div>
        )}
      </div>
      <button type="submit" disabled={form.formState.isSubmitting}>
        Add post
      </button>
    </Form>
  );
}
