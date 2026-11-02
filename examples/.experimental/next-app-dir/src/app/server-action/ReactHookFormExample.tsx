'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@shared/ui/components/button';
import { Field, FieldError, FieldLabel } from '@shared/ui/components/field';
import { Input } from '@shared/ui/components/input';
import { Spinner } from '@shared/ui/components/spinner';
import { useRef } from 'react';
import type { FieldValues, UseFormProps } from 'react-hook-form';
import { FormProvider, useForm } from 'react-hook-form';
import { useAction } from 'trpc-api';
import type { z } from 'zod';
import { JsonBlock } from '../_components/json-block';
import { rhfAction } from './ReactHookFormExample.action';
import { rhfActionSchema } from './ReactHookFormExample.schema';

/**
 * Reusable hook for zod + react-hook-form
 */
function useZodForm<TInput extends FieldValues>(
  props: Omit<UseFormProps<TInput>, 'resolver'> & {
    schema: z.ZodType<any, TInput>;
  },
) {
  const form = useForm<TInput>({
    ...props,
    resolver: zodResolver(props.schema, undefined, {
      raw: true,
    }),
  });

  return form;
}

export function ReactHookFormExample() {
  const rhfMutation = useAction(rhfAction);
  const form = useZodForm({
    schema: rhfActionSchema,
  });
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground">
        Check the console for the logger output.
      </p>
      <FormProvider {...form}>
        <form
          action={rhfAction as any}
          ref={formRef}
          className="flex flex-col gap-4"
          onSubmit={form.handleSubmit(async () => {
            // oxlint-disable-next-line typescript/no-non-null-assertion
            await rhfMutation.mutateAsync(new FormData(formRef.current!));
          })}
        >
          <Field
            className="max-w-sm"
            data-invalid={!!form.formState.errors.text}
          >
            <FieldLabel htmlFor="rhf-text">Text</FieldLabel>
            <Input
              id="rhf-text"
              type="text"
              aria-invalid={!!form.formState.errors.text}
              {...form.register('text')}
            />
            <FieldError errors={[form.formState.errors.text]} />
          </Field>
          <Button type="submit" className="self-start">
            {rhfMutation.status === 'loading' && <Spinner />}
            Run server action raw debugging
          </Button>

          <div className="grid gap-4 md:grid-cols-2">
            <JsonBlock
              label="Form state"
              value={{
                formState: {
                  isSubmitting: form.formState.isSubmitting,
                },
              }}
            />
            <JsonBlock label="useAction state" value={rhfMutation} />
          </div>
        </form>
      </FormProvider>
    </div>
  );
}
