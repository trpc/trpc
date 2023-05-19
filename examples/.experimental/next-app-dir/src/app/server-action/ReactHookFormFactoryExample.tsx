'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRef } from 'react';
import { FormProvider, UseFormProps, useForm } from 'react-hook-form';
import { useAction } from 'trpc-api';
import { z } from 'zod';
import { rhfAction } from './ReactHookFormExample.action';
import { rhfActionSchema } from './ReactHookFormExample.schema';
import { createForm } from './ReactHookFormFactoryExample.lib';
import { testAction } from './_actions';

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

const MyForm = createForm({
  action: rhfAction,
  schema: rhfActionSchema,
});

export function ReactHookFormFactoryExample() {
  const mutation = useAction(rhfAction);

  return (
    <>
      <p>Check the console for the logger output.</p>
      <MyForm
        className="my-form"
        render={(props) => {
          const { form } = props;

          return (
            <>
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
            </>
          );
        }}
      />
    </>
  );
}
