import type { Writable } from 'stream'

import type { APIGatewayProxyEventV2, Context, Handler } from 'aws-lambda'

declare global {
    namespace awslambda {
        export namespace HttpResponseStream {
            function from(writable: Writable, metadata: any): ResponseStream
        }

        export type ResponseStream = Writable & {
            setContentType(type: string): void
        }

        export type StreamifyHandler = (
            event: APIGatewayProxyEventV2,
            responseStream: ResponseStream,
            context: Context,
        ) => Promise<any>

        export function streamifyResponse(
            handler: StreamifyHandler,
        ): Handler<APIGatewayProxyEventV2>
    }
}