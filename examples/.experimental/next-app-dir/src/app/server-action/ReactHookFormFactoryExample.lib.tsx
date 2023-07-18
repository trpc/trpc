/* eslint-disable @typescript-eslint/no-non-null-assertion */
/**
 * This file is meant to become a library that can be used to generate forms.
 * Massive work-in-progress and TBD if it becomes a lib.
 */
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  inferActionResultProps,
  UseTRPCActionResult,
} from '@trpc/next/app-dir/client';
import { TRPCActionHandler } from '@trpc/next/app-dir/server';
import { ActionHandlerDef } from '@trpc/next/dist/app-dir/shared';
import { AnyProcedure, Simplify } from '@trpc/server';
import { useAction } from '~/trpc/client';
import { useRef } from 'react';
import {
  FormProvider,
  useForm,
  useFormContext,
  UseFormProps,
  UseFormReturn,
  useWatch,
} from 'react-hook-form';
import { z } from 'zod';

export function createForm<TDef extends ActionHandlerDef>(opts: {
  action: TRPCActionHandler<TDef>;
  schema: z.ZodSchema<any> & { _input: TDef['input'] };
  hookProps?: Omit<UseFormProps<TDef['input']>, 'resolver'>;
}) {
  type FormValues = TDef['input'];
  function Form(
    props: Omit<
      JSX.IntrinsicElements['form'],
      'action' | 'encType' | 'method' | 'onSubmit' | 'ref'
    > & {
      render: (renderProps: {
        form: UseFormReturn<FormValues>;
        action: UseTRPCActionResult<TDef>;
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

  Form.useWatch = useWatch<FormValues>;
  Form.useFormContext = useFormContext<FormValues>;

  return Form;
}
