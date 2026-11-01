/**
 * The names `.agent-docs/open/experimental-prefix-on-types-and-methods.md`
 * proposes, as types: A and B drop the prefix from the 15 prefixed types
 * (`LockOptions` for `experimental_LockOptions`), B and C prefix
 * experimental methods (`t.experimental_implement`,
 * `handler.experimental_messagePort`), C prefixes every experimental type.
 */
import type { DurableLinkOptions } from '@trpc12/trpc/client';
import type { ContractBuilder, ContractDef } from '@trpc12/trpc/contract';
import type { experimental_LockOptions } from '@trpc12/trpc/middleware';
import type { FetchHandler, TrpcRoot } from '@trpc12/trpc/server';

/** A: `experimental_LockOptions` without the prefix. */
export interface LockOptionsA extends experimental_LockOptions {}

/** B: `experimental_LockOptions` without the prefix. */
export interface LockOptionsB extends experimental_LockOptions {}

type AnyRoot = TrpcRoot<any, any, any>;

type PrefixedImplement<TRoot extends AnyRoot> = Omit<TRoot, 'implement'> & {
  experimental_implement: TRoot['implement'];
};

type PrefixedMessagePort<TPlatform> = Omit<
  FetchHandler<TPlatform>,
  'messagePort'
> & {
  experimental_messagePort: FetchHandler<TPlatform>['messagePort'];
};

/** B: `t` with `experimental_implement()` for `implement()`. */
export type TrpcRootB<TRoot extends AnyRoot> = PrefixedImplement<TRoot>;

/** B: a handler with `experimental_messagePort()` for `messagePort()`. */
export type FetchHandlerB<TPlatform = undefined> =
  PrefixedMessagePort<TPlatform>;

/** C: `t` with `experimental_implement()` for `implement()`. */
export type TrpcRootC<TRoot extends AnyRoot> = PrefixedImplement<TRoot>;

/** C: `DurableLinkOptions` with the prefix. */
export interface experimental_DurableLinkOptionsC extends DurableLinkOptions {}

/** C: `ContractBuilder` with the prefix. */
export interface experimental_ContractBuilderC<
  TDef extends ContractDef,
> extends ContractBuilder<TDef> {}
