import { TRPCResponse } from '@trpc/server/rpc';
import { TRPCClientError } from '../TRPCClientError';
import { LinkRuntimeOptions } from '../links/core';

export function transformRPCResponse({
  envelope,
  runtime,
}: {
  envelope: TRPCResponse;
  runtime: LinkRuntimeOptions;
}) {
  if ('error' in envelope) {
    return TRPCClientError.from({
      ...envelope,
      error: runtime.transformer.deserialize(envelope.error),
    });
  }
  if (envelope.result.type === 'data') {
    return {
      ...envelope.result,
      data: runtime.transformer.deserialize(envelope.result.data),
    };
  }
  return envelope.result;
}
