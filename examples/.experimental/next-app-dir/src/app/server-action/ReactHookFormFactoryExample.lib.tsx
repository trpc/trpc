'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  UseTRPCActionResult,
  inferActionResultProps,
} from '@trpc/next/app-dir/client';
import { TRPCActionHandler } from '@trpc/next/app-dir/server';
import { AnyProcedure, Simplify } from '@trpc/server';
import { useRef } from 'react';
import {
  FormProvider,
  UseFormProps,
  UseFormReturn,
  useForm,
} from 'react-hook-form';
import { z } from 'zod';
import { useAction } from '~/trpc/client';

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

export function createForm<TProc extends AnyProcedure>(opts: {
  action: TRPCActionHandler<TProc>;
  schema: { _input: TProc['_def']['_input_in'] } & z.ZodSchema<any>;
  hookProps?: Omit<UseFormProps<TProc['_def']['_input_in']>, 'resolver'>;
}) {
  type FormValues = TProc['_def']['_input_in'];
  function Form(
    props: Omit<
      JSX.IntrinsicElements['form'],
      'ref' | 'action' | 'onSubmit' | 'encType' | 'method'
    > & {
      render: (renderProps: {
        form: UseFormReturn<FormValues>;
        action: UseTRPCActionResult<Simplify<inferActionResultProps<TProc>>>;
      }) => React.ReactNode;
    },
  ) {
    const hook = useForm<FormValues>({
      ...opts.hookProps,
      resolver: zodResolver(opts.schema, undefined),
    });
    const ref = useRef<HTMLFormElement>(null);
    const action = useAction(opts.action);
    const { render, ...passThrough }: typeof props = props;

    return (
      <FormProvider {...hook}>
        <form
          {...passThrough}
          action={opts.action}
          ref={ref}
          onSubmit={hook.handleSubmit(() =>
            action.mutateAsync(new FormData(ref.current!) as any),
          )}
        >
          {render({ form: hook, action })}
        </form>
      </FormProvider>
    );
  }

  return Form;
}
