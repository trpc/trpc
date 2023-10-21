/**
 * AWS Lambda provides some global methods baked into the node.js runtime for streaming responses.
 * They also don't expose any types for typescript, so the community has filled this gap.
 *
 * The below types are heavily modified but originally based on:
 *
 * https://github.com/llozano/lambda-stream-response/blob/main/src/%40types/awslambda/index.d.ts
 * https://github.com/llozano/lambda-stream-response/blob/main/LICENSE
 * @author Leonardo Lozano <leono@duck.com>
 * MIT licensed
 *
 */

import { Writable } from 'stream';
import { Context, Handler } from 'aws-lambda';

declare namespace awslambda {
  export namespace HttpResponseStream {
    function from(writable: Writable, metadata: any): Writable;
  }

  export interface ResponseStreamWritable extends Writable {
    setContentType(contentType: string): void;

    setIsBase64Encoded(isBase64Encoded: boolean): void;
  }

  export type StreamifyHandler<TEvent> = (
    event: TEvent,
    responseStream: ResponseStreamWritable,
    context: Context,
  ) => Promise<void>;

  export function streamifyResponse<TEvent = any, TResult = any>(
    handler: StreamifyHandler<TEvent>,
  ): Handler<TEvent, TResult>;
}
