import type { ClientContext } from '@orpc/client'
import type { StandardLinkOptions, StandardLinkPlugin } from '@orpc/client/standard'
import type { RouterContract } from '../router'
import { ORPCError } from '@orpc/client'
import { mergeTwoLevels, toArray } from '@orpc/shared'
import { ValidationError } from '../error'
import { getProcedureContractOrThrow } from '../router-utils'

export interface RequestValidationLinkPluginOptions<_T extends ClientContext> {
  /**
   * Forwards the locally validated/transformed input downstream.
   *
   * Disabled by default because some schema transforms produce a locally valid
   * value that cannot be validated successfully again by the server.
   * Keeping the original input as the flow input is the safer default.
   *
   * @default false
   */
  forwardValidatedInput?: boolean | undefined
}

/**
 * Validates client request input against contract schemas before the request is encoded.
 * This is useful when your application relies on server-side validation.
 *
 * @see {@link https://orpc.dev/docs/plugins/request-validation | Request Validation Plugin}
 */
export class RequestValidationLinkPlugin<T extends ClientContext> implements StandardLinkPlugin<T> {
  name = '~request-validation'

  private readonly forwardValidatedInput: boolean

  constructor(
    private readonly contract: RouterContract,
    options: RequestValidationLinkPluginOptions<T> = {},
  ) {
    this.forwardValidatedInput = options.forwardValidatedInput ?? false
  }

  init(options: StandardLinkOptions<T>): StandardLinkOptions<T> {
    return {
      ...options,
      interceptors: [...toArray(options.interceptors), async ({ next, ...interceptorOptions }) => {
        const procedure = getProcedureContractOrThrow(this.contract, interceptorOptions.path)

        const inputSchemas = toArray(procedure['~orpc'].inputSchemas)
        const originalInput = interceptorOptions.input
        let currentInput = originalInput

        for (const [index, schema] of inputSchemas.entries()) {
          // Mirrors the server's stacked input validation.
          const validating = index !== 0 ? mergeTwoLevels(originalInput, currentInput) : currentInput
          const result = await schema['~standard'].validate(validating)

          if (result.issues) {
            throw new ORPCError('BAD_REQUEST', {
              message: 'Input validation failed',
              data: {
                issues: result.issues,
              },
              cause: new ValidationError({
                message: 'Input validation failed',
                issues: result.issues,
                invalidData: validating,
              }),
            })
          }

          currentInput = index !== 0 ? mergeTwoLevels(currentInput, result.value) : result.value
        }

        return this.forwardValidatedInput
          ? next({ ...interceptorOptions, input: currentInput })
          : next()
      }],
    }
  }
}
