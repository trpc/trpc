'use server';

import type { ProcedureBuilder } from '@trpc/server/unstable-core-do-not-import';

export function experimental_createNextAppDirCaller<
  TContext,
  TMeta,
  TContextOverrides,
  TInputIn,
  TInputOut,
  TOutputIn,
  TOutputOut,
  TInferErrors extends boolean = never,
  TError = never,
>(
  builder: ProcedureBuilder<
    TContext,
    TMeta,
    TContextOverrides,
    TInputIn,
    TInputOut,
    TOutputIn,
    TOutputOut,
    TInferErrors,
    TError
  >,
) {}
