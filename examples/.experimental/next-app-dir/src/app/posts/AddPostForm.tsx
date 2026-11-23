'use client';

import { Button } from '@shared/ui/components/button';
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@shared/ui/components/field';
import { Input } from '@shared/ui/components/input';
import { Spinner } from '@shared/ui/components/spinner';
import { Textarea } from '@shared/ui/components/textarea';
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
  const { errors } = form.formState;

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
            error: (error: unknown) =>
              'Failed to add post: ' + (error as Error).message,
          })
          .catch((error) => {
            console.warn('Failed to add post', error);
          });
      }}
    >
      <FieldGroup>
        <Field data-invalid={!!errors.title}>
          <FieldLabel htmlFor="title">Title</FieldLabel>
          <Input
            id="title"
            type="text"
            aria-invalid={!!errors.title}
            {...form.register('title')}
            defaultValue={form.control._defaultValues.title}
          />
          <FieldError errors={[errors.title]} />
        </Field>

        <Field data-invalid={!!errors.content}>
          <FieldLabel htmlFor="content">Content</FieldLabel>
          <Textarea
            id="content"
            rows={3}
            aria-invalid={!!errors.content}
            {...form.register('content')}
            defaultValue={form.control._defaultValues.content}
          />
          <FieldError errors={[errors.content]} />
        </Field>

        <Button
          type="submit"
          className="self-start"
          disabled={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting && <Spinner />}
          Add post
        </Button>
      </FieldGroup>
    </Form>
  );
}
