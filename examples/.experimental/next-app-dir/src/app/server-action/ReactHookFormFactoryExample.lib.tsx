/* eslint-disable @typescript-eslint/no-non-null-assertion */
/**
 * This file is meant to become a library that can be used to generate forms.
 * Massive work-in-progress and TBD if it becomes a lib.
 */
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { UseTRPCActionResult } from '@trpc/next/app-dir/client';
import type {
  ActionHandlerDef,
  TRPCActionHandler,
} from '@trpc/next/app-dir/server';
import { useAction } from '~/trpc/client';
import type { JSX } from 'react';
import { useRef } from 'react';
import type { UseFormProps, UseFormReturn } from 'react-hook-form';
import {
  FormProvider,
  useForm,
  useFormContext,
  useWatch,
} from 'react-hook-form';
import type { z } from 'zod';

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
          action={opts.action as any}
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
