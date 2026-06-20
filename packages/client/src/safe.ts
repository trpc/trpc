import type { AnyClientTypes } from '@trpc/server/unstable-core-do-not-import';
import { TRPCClientError } from './TRPCClientError';

type inferClientTypesFromShape<TShape> = [TShape] extends [never]
  ? AnyClientTypes
  : {
      errorShape: TShape;
      transformer: false;
    };

type PromiseWithErrorShape<TOutput, TErrorShape> = Promise<TOutput> & {
  readonly __errorShape?: TErrorShape;
};

export async function safe<TOutput, TErrorShape>(
  promise: PromiseWithErrorShape<TOutput, TErrorShape>,
): Promise<
  | [TOutput, undefined]
  | [undefined, TRPCClientError<inferClientTypesFromShape<TErrorShape>>]
>;
export async function safe<TOutput>(
  promise: Promise<TOutput>,
): Promise<[TOutput, undefined] | [undefined, TRPCClientError<AnyClientTypes>]>;
export async function safe<TOutput>(promise: Promise<TOutput>) {
  try {
    return [await promise, undefined];
  } catch (cause) {
    return [undefined, TRPCClientError.from(cause as Error | object)];
  }
}
