'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '~/components/button';
import { Input } from '~/components/input';
import { JsonPreTag } from '~/components/json-pretag';
import { useRef } from 'react';
import { FormProvider, useForm, UseFormProps } from 'react-hook-form';
import { useAction } from 'trpc-api';
import { z } from 'zod';
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
    <div className="space-y-2">
      <p>Check the console for the logger output.</p>
      <FormProvider {...form}>
        <form
          action={rhfAction}
          ref={formRef}
          onSubmit={form.handleSubmit(async () => {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            await mutation.mutateAsync(new FormData(formRef.current!));
          })}
          className="space-y-2"
        >
          <Input type="text" {...form.register('text')} />
          <Button type="submit">Run server action raw debugging</Button>

          <h2>Form state</h2>
          <JsonPreTag
            object={{
              isSubmitting: form.formState.isSubmitting,
            }}
          />
          <h2>Mutation state</h2>
          <JsonPreTag object={mutation} />
        </form>
      </FormProvider>
    </div>
  );
}
