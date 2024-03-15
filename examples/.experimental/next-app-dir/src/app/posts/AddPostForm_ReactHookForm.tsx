'use client';

import { ErrorMessage } from '@hookform/error-message';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useState } from 'react';
import { useFormState } from 'react-dom';
import type { UseFormProps } from 'react-hook-form';
import { FormProvider, useForm, useFormContext } from 'react-hook-form';
import toast from 'react-hot-toast';
import type { z } from 'zod';
import { formDataAction } from './_data';
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
  const [serverState, action] = useFormState(formDataAction, {});

  const [state, setState] = useState(serverState);

  useEffect(() => {
    console.log('Server state', serverState);
    setState(serverState);
  }, [serverState]);

  useEffect(() => {
    console.log('Form state', state);
    if (state.error) {
      toast.error(`Failed to add post: ${state.error.code}`);
    }
  }, [state]);

  const form = useZodForm({
    schema: addPostSchema,
    defaultValues: serverState.input ?? {
      title: 'Hello world',
    },
  });

  useMemo(() => {
    // hack to make errors work without javascript eanbled
    for (const [key, value] of Object.entries(
      serverState.error?.fieldErrors ?? {},
    )) {
      if (value) {
        (form.formState.errors as any)[key] = {
          type: 'server',
          message: value.join(', '),
        };
      }
    }
  }, []);

  return (
    <FormProvider {...form}>
      <form
        action={action}
        onSubmit={(event) => {
          return form.handleSubmit(async (values) => {
            const res = await formDataAction(
              {},
              new FormData(event.target as HTMLFormElement),
            );
            if (!res || res?.ok === undefined) {
              // if you throw redirect or revalidatePath - you don't need to handle response
              return;
            }
            setState(res);
            if (res.ok) {
              // happy
              return;
            }
            if (res.error) {
              switch (res.error.code) {
                case 'INPUT_VALIDATION': {
                  // add validation errors
                  for (const [key, value] of Object.entries(
                    res.error.fieldErrors ?? {},
                  )) {
                    form.setError(key as any, {
                      type: 'server',
                      message: value.join(', '),
                    });
                  }
                  break;
                }
                default: {
                  form.setError('root', {
                    message:
                      'message' in res.error
                        ? (res.error.message as string)
                        : res.error.code,
                  });
                }
              }
            }
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
