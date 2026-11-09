/**
 * RPC and HTTP API definitions for workflows.
 *
 * Given one or more `Workflow` values, `toRpcGroup` creates the RPC definitions
 * for clients and servers, while `toHttpApiGroup` creates HTTP POST endpoints
 * that can be mounted in an API. Each workflow gets execute, discard, and
 * resume operations, so callers can start a workflow or resume a suspended run
 * by `executionId` without importing the workflow handler directly.
 *
 * @stability unstable
 * @since 4.0.0
 */
import type { NonEmptyReadonlyArray } from "../Array.ts"
import * as HttpApiEndpoint from "../http-api/HttpApiEndpoint.ts"
import * as HttpApiGroup from "../http-api/HttpApiGroup.ts"
import * as Rpc from "../rpc/Rpc.ts"
import * as RpcGroup from "../rpc/RpcGroup.ts"
import * as Schema from "../Schema.ts"
import type * as Workflow from "./Workflow.ts"

/**
 * Derives an `RpcGroup` from a list of workflows.
 *
 * **Example** (Deriving RPC endpoints from workflows)
 *
 * ```ts import.meta.vitest
 * import { Layer, Schema } from "effect"
 * import { RpcServer } from "effect/rpc"
 * import { Workflow, WorkflowProxy, WorkflowProxyServer } from "effect/workflow"
 *
 * const EmailWorkflow = Workflow.make("EmailWorkflow", {
 *   payload: {
 *     id: Schema.String,
 *     to: Schema.String
 *   },
 *   idempotencyKey: ({ id }) => id
 * })
 *
 * const myWorkflows = [EmailWorkflow] as const
 *
 * // Use WorkflowProxy.toRpcGroup to create a `RpcGroup` from the
 * // workflows
 * class MyRpcs extends WorkflowProxy.toRpcGroup(myWorkflows) {}
 *
 * // Use WorkflowProxyServer.layerRpcHandlers to create a layer that implements
 * // the rpc handlers
 * const ApiLayer = RpcServer.layer(MyRpcs).pipe(
 *   Layer.provide(WorkflowProxyServer.layerRpcHandlers(myWorkflows))
 * )
 * const result = [MyRpcs.requests.size, Layer.isLayer(ApiLayer)] // => [3, true]
 * ```
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const toRpcGroup = <
  const Workflows extends NonEmptyReadonlyArray<Workflow.Any>,
  const Prefix extends string = ""
>(
  workflows: Workflows,
  options?: {
    readonly prefix?: Prefix | undefined
  }
): RpcGroup.RpcGroup<ConvertRpcs<Workflows[number], Prefix>> => {
  const prefix = options?.prefix ?? ""
  const rpcs: Array<Rpc.Any> = []
  for (const workflow_ of workflows) {
    const workflow = workflow_ as Workflow.AnyWithProps
    rpcs.push(
      Rpc.make(`${prefix}${workflow._tag}`, {
        payload: workflow.payloadSchema,
        error: workflow.errorSchema,
        success: workflow.successSchema
      }).annotateMerge(workflow.annotations),
      Rpc.make(`${prefix}${workflow._tag}Discard`, {
        payload: workflow.payloadSchema,
        success: Schema.String
      }).annotateMerge(workflow.annotations),
      Rpc.make(`${prefix}${workflow._tag}Resume`, { payload: ResumePayload })
        .annotateMerge(workflow.annotations)
    )
  }
  return RpcGroup.make(...rpcs) as any
}

/**
 * Maps each workflow to the RPC definitions generated for execute, discard,
 * and resume operations.
 *
 * @stability unstable
 * @category converting
 * @since 4.0.0
 */
export type ConvertRpcs<Workflows extends Workflow.Any, Prefix extends string> = Workflows extends Workflow.Workflow<
  infer _Name,
  infer _Payload,
  infer _Success,
  infer _Error
> ?
    | Rpc.Rpc<`${Prefix}${_Name}`, _Payload, _Success, _Error>
    | Rpc.Rpc<`${Prefix}${_Name}Discard`, _Payload, typeof Schema.String>
    | Rpc.Rpc<`${Prefix}${_Name}Resume`, typeof ResumePayload>
  : never

/**
 * Derives an `HttpApiGroup` from a list of workflows.
 *
 * **Example** (Deriving HTTP API endpoints from workflows)
 *
 * ```ts import.meta.vitest
 * import { Layer, Schema } from "effect"
 * import { HttpApi, HttpApiBuilder } from "effect/http-api"
 * import { Workflow, WorkflowProxy, WorkflowProxyServer } from "effect/workflow"
 *
 * const EmailWorkflow = Workflow.make("EmailWorkflow", {
 *   payload: {
 *     id: Schema.String,
 *     to: Schema.String
 *   },
 *   idempotencyKey: ({ id }) => id
 * })
 *
 * const myWorkflows = [EmailWorkflow] as const
 *
 * // Use WorkflowProxy.toHttpApiGroup to create a `HttpApiGroup` from the
 * // workflows
 * class MyApi extends HttpApi.make("api")
 *   .add(WorkflowProxy.toHttpApiGroup("workflows", myWorkflows))
 * {}
 *
 * // Use WorkflowProxyServer.layerHttpApi to create a layer that implements the
 * // workflows HttpApiGroup
 * const ApiLayer = HttpApiBuilder.layer(MyApi).pipe(
 *   Layer.provide(
 *     WorkflowProxyServer.layerHttpApi(MyApi, "workflows", myWorkflows)
 *   )
 * )
 * const result = [Object.keys(MyApi.groups.workflows.endpoints).length, Layer.isLayer(ApiLayer)] // => [3, true]
 * ```
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const toHttpApiGroup = <const Name extends string, const Workflows extends NonEmptyReadonlyArray<Workflow.Any>>(
  name: Name,
  workflows: Workflows
): HttpApiGroup.HttpApiGroup<Name, ConvertHttpApi<Workflows[number]>> => {
  let group = HttpApiGroup.make(name)
  for (const workflow_ of workflows) {
    const workflow = workflow_ as Workflow.AnyWithProps
    const path = `/${tagToPath(workflow._tag)}` as const
    group = group.add(
      HttpApiEndpoint.post(workflow._tag, path, {
        payload: workflow.payloadSchema,
        success: workflow.successSchema,
        error: workflow.errorSchema
      }).annotateMerge(workflow.annotations),
      HttpApiEndpoint.post(workflow._tag + "Discard", `${path}/discard`, {
        payload: workflow.payloadSchema,
        success: Schema.String
      }).annotateMerge(workflow.annotations),
      HttpApiEndpoint.post(workflow._tag + "Resume", `${path}/resume`, {
        payload: ResumePayload
      }).annotateMerge(workflow.annotations)
    ) as any
  }
  return group as any
}

const tagToPath = (tag: string): string =>
  tag
    // .replace(/[^a-zA-Z0-9]+/g, "-") // Replace non-alphanumeric characters with hyphen
    // .replace(/([a-z])([A-Z])/g, "$1-$2") // Insert hyphen before uppercase letters
    .toLowerCase()

/**
 * Maps each workflow to the HTTP API endpoints generated for execute,
 * discard, and resume operations.
 *
 * @stability unstable
 * @category converting
 * @since 4.0.0
 */
export type ConvertHttpApi<Workflows extends Workflow.Any> = Workflows extends Workflow.Workflow<
  infer _Name,
  infer _Payload,
  infer _Success,
  infer _Error
> ?
    | HttpApiEndpoint.HttpApiEndpoint<
      _Name,
      "POST",
      `/${Lowercase<_Name>}`,
      never,
      never,
      _Payload,
      never,
      _Success,
      _Error
    >
    | HttpApiEndpoint.HttpApiEndpoint<
      `${_Name}Discard`,
      "POST",
      `/${Lowercase<_Name>}/discard`,
      never,
      never,
      _Payload,
      never,
      typeof Schema.String
    >
    | HttpApiEndpoint.HttpApiEndpoint<
      `${_Name}Resume`,
      "POST",
      `/${Lowercase<_Name>}/resume`,
      never,
      never,
      typeof ResumePayload
    > :
  never

const ResumePayload = Schema.Struct({ executionId: Schema.String })
