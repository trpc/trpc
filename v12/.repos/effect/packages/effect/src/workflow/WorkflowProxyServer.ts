/**
 * Server-side layers for workflow proxy APIs.
 *
 * `layerHttpApi` connects the HTTP API group created by `WorkflowProxy` to the
 * supplied workflows. `layerRpcHandlers` does the same for the generated RPC
 * definitions. Both layers route execute, discard, and resume requests to the
 * matching workflow operation, while the `WorkflowEngine` and workflow handler
 * services stay on the server side.
 *
 * @stability unstable
 * @since 4.0.0
 */
import type { NonEmptyReadonlyArray } from "../Array.ts"
import * as Context from "../Context.ts"
import * as Effect from "../Effect.ts"
import type * as HttpApi from "../http-api/HttpApi.ts"
import * as HttpApiBuilder from "../http-api/HttpApiBuilder.ts"
import type * as HttpApiGroup from "../http-api/HttpApiGroup.ts"
import * as Layer from "../Layer.ts"
import type * as Rpc from "../rpc/Rpc.ts"
import type * as Workflow from "./Workflow.ts"
import type { WorkflowEngine } from "./WorkflowEngine.ts"

/**
 * Creates handlers for a workflow HTTP API group, wiring execute, discard, and
 * resume endpoints to the supplied workflows.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerHttpApi = <
  ApiId extends string,
  Groups extends HttpApiGroup.Constraint,
  Identifier extends HttpApiGroup.Identifier<Groups>,
  const Workflows extends NonEmptyReadonlyArray<Workflow.Any>
>(
  api: HttpApi.HttpApi<ApiId, Groups>,
  identifier: Identifier,
  workflows: Workflows
): Layer.Layer<
  HttpApiGroup.Service<ApiId, Identifier>,
  never,
  WorkflowEngine | Workflow.RequirementsHandler<Workflows[number]>
> =>
  HttpApiBuilder.group(
    api,
    identifier,
    Effect.fnUntraced(function*(handlers: any) {
      for (const workflow_ of workflows) {
        const workflow = workflow_ as Workflow.AnyWithProps
        handlers = handlers
          .handle(
            workflow._tag,
            ({ payload }: { payload: any }) =>
              workflow.execute(payload).pipe(
                Effect.tapDefect(Effect.logError),
                Effect.annotateLogs({
                  module: "WorkflowProxyServer",
                  method: workflow._tag
                })
              )
          )
          .handle(
            workflow._tag + "Discard",
            ({ payload }: { payload: any }) =>
              workflow.execute(payload, { discard: true }).pipe(
                Effect.tapDefect(Effect.logError),
                Effect.annotateLogs({
                  module: "WorkflowProxyServer",
                  method: workflow._tag + "Discard"
                })
              )
          )
          .handle(
            workflow._tag + "Resume",
            ({ payload }: { payload: any }) =>
              workflow.resume(payload.executionId).pipe(
                Effect.tapDefect(Effect.logError),
                Effect.annotateLogs({
                  module: "WorkflowProxyServer",
                  method: workflow._tag + "Resume"
                })
              )
          )
      }
      return handlers as HttpApiBuilder.Handlers<never>
    })
  )

/**
 * Creates RPC handlers for the supplied workflows, wiring execute, discard,
 * and resume RPCs to workflow operations.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerRpcHandlers = <
  const Workflows extends NonEmptyReadonlyArray<Workflow.Any>,
  const Prefix extends string = ""
>(workflows: Workflows, options?: {
  readonly prefix?: Prefix
}): Layer.Layer<
  RpcHandlers<Workflows[number], Prefix>,
  never,
  WorkflowEngine | Workflow.RequirementsHandler<Workflows[number]>
> =>
  Layer.effectContext(Effect.gen(function*() {
    const context = yield* Effect.context<never>()
    const prefix = options?.prefix ?? ""
    const handlers = new Map<string, Rpc.Handler<string>>()
    for (const workflow_ of workflows) {
      const workflow = workflow_ as Workflow.AnyWithProps
      const tag = `${prefix}${workflow._tag}`
      const tagDiscard = `${tag}Discard`
      const tagResume = `${tag}Resume`
      const key = `effect/rpc/Rpc/${tag}`
      const keyDiscard = `${key}Discard`
      const keyResume = `${key}Resume`
      handlers.set(key, {
        context,
        tag,
        handler: (payload: any) => workflow.execute(payload) as any
      } as any)
      handlers.set(keyDiscard, {
        context,
        tag: tagDiscard,
        handler: (payload: any) => workflow.execute(payload, { discard: true } as any) as any
      } as any)
      handlers.set(keyResume, {
        context,
        tag: tagResume,
        handler: (payload: any) => workflow.resume(payload.executionId) as any
      } as any)
    }
    return Context.makeUnsafe(handlers)
  }))

/**
 * Union of RPC handler services required to serve the generated workflow
 * execute, discard, and resume RPCs.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export type RpcHandlers<Workflows extends Workflow.Any, Prefix extends string> = Workflows extends Workflow.Workflow<
  infer _Name,
  infer _Payload,
  infer _Success,
  infer _Error
> ? Rpc.Handler<`${Prefix}${_Name}`> | Rpc.Handler<`${Prefix}${_Name}Discard`> | Rpc.Handler<`${Prefix}${_Name}Resume`>
  : never
