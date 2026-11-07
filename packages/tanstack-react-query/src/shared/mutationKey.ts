/**
 * A tRPC mutation key that starts with a key prefix.
 * @see https://trpc.io/docs/client/tanstack-react-query/usage#keyPrefix
 * @public
 */
export type TRPCMutationKeyWithPrefix = [
  prefix: string[],
  ...TRPCMutationKeyWithoutPrefix,
];

/**
 * A tRPC mutation key: the procedure path.
 * @see https://trpc.io/docs/client/tanstack-react-query/usage#mutationKey
 * @public
 */
export type TRPCMutationKeyWithoutPrefix = [path: string[]];

/**
 * Any tRPC mutation key, with or without a prefix.
 */
export type AnyTRPCMutationKey =
  | TRPCMutationKeyWithoutPrefix
  | TRPCMutationKeyWithPrefix;

/**
 * A tRPC mutation key, with a prefix if `TPrefixEnabled` is `true`.
 * @see https://trpc.io/docs/client/tanstack-react-query/usage#mutationKey
 * @public
 */
export type TRPCMutationKey<TPrefixEnabled extends boolean = false> =
  TPrefixEnabled extends true
    ? TRPCMutationKeyWithPrefix
    : TRPCMutationKeyWithoutPrefix;

/**
 * @internal
 */
export function getMutationKeyInternal(opts: {
  prefix: string | undefined;
  path: string[];
}): AnyTRPCMutationKey {
  // some parts of the path may be dot-separated, split them up
  const key: TRPCMutationKeyWithoutPrefix = [
    opts.path.flatMap((part) => part.split('.')),
  ];

  if (opts.prefix) {
    key.unshift([opts.prefix]);
  }
  return key;
}
