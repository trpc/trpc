'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { UseFormProps } from 'react-hook-form';
import { FormProvider, useForm, useFormContext } from 'react-hook-form';
import toast from 'react-hot-toast';
import type { z } from 'zod';
import { addPost } from './_data';
import { addPostSchema } from './_data.schema';

/**
 * Reusable hook for zod + react-hook-form
 */
function useZodForm<TSchema extends z.ZodType>(
  props: Omit<UseFormProps<TSchema['_input']>, 'resolver'> & {
    schema: TSchema;
  },
) {
  const form = useForm<TSchema['_input']>({
    ...props,
    resolver: zodResolver(props.schema, undefined),
  });

  return form;
}

export function SubmitButton(
  props: Omit<JSX.IntrinsicElements['button'], 'type'>,
) {
  const ctx = useFormContext();

  return (
    <button
      type="submit"
      {...props}
      disabled={ctx.formState.isSubmitting || props.disabled}
    />
  );
}
export function AddPostForm_RHF() {
  const form = useZodForm({
    schema: addPostSchema,
    defaultValues: {},
  });

  return (
    <FormProvider {...form}>
      <form
        onSubmit={(event) => {
          return form.handleSubmit(async (values) => {
            return addPost(values).catch((error) => {
              toast.error(error.message);
            });
          })(event);
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
        {/* 
        {state.error && (
          <div>
            <h3>Errors</h3>
            {state.error?.code === 'UNAUTHORIZED' && (
              <div>Unauthorized - you need to sign in</div>
            )}
            {state.error?.code === 'INPUT_VALIDATION' && (
              <div>Invalid input</div>
            )}
          </div>
        )} */}
        <SubmitButton>Add post</SubmitButton>
      </form>
    </FormProvider>
  );
}
