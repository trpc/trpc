import { TRPCResponse } from '@trpc/server/rpc';
import { TRPCClientError } from '../TRPCClientError';
import { LinkRuntime } from '../links/types';

export function transformRPCResponse({
  envelope,
  runtime,
}: {
  envelope: TRPCResponse;
  runtime: LinkRuntime;
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
