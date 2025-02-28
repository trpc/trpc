'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRef } from 'react';
import type { UseFormProps } from 'react-hook-form';
import { FormProvider, useForm } from 'react-hook-form';
import { useAction } from 'trpc-api';
import type { z } from 'zod';
import { rhfAction } from './ReactHookFormExample.action';
import { rhfActionSchema } from './ReactHookFormExample.schema';

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

export function ReactHookFormExample() {
  const mutation = useAction(rhfAction);
  const form = useZodForm({
    schema: rhfActionSchema,
  });
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <>
      <p>Check the console for the logger output.</p>
      <FormProvider {...form}>
        <form
          action={rhfAction as any}
          ref={formRef}
          onSubmit={form.handleSubmit(async () => {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            await mutation.mutateAsync(new FormData(formRef.current!));
          })}
        >
          <div>
            <input type="text" {...form.register('text')} />
          </div>
          <div>
            <button type="submit">Run server action raw debugging</button>
          </div>

          <h2>Form state</h2>
          <pre
            style={{
              overflowX: 'scroll',
            }}
          >
            {JSON.stringify(
              {
                formState: {
                  isSubmitting: form.formState.isSubmitting,
                },
              },
              null,
              4,
            )}
          </pre>
          <h2>Mutation state</h2>
          <pre
            style={{
              overflowX: 'scroll',
            }}
          >
            {JSON.stringify(mutation, null, 4)}
          </pre>
        </form>
      </FormProvider>
    </>
  );
}
