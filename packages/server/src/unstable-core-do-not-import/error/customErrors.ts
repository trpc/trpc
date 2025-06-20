import type { AnyMiddlewareFunction } from '../middleware';
import { getParseFn, type inferParser, type Parser } from '../parser';
import type { TRPC_ERROR_CODE_KEY } from '../rpc';
import {
  CustomTRPCError,
  TRPCError,
  type CustomTRPCErrorParams,
} from './TRPCError';

export type ErrorDefMap = Record<
  string,
  {
    code: TRPC_ERROR_CODE_KEY;
    data?: Parser;
  }
>;

type CustomErrorClass<
  TTRPCErrorCode extends TRPC_ERROR_CODE_KEY,
  TCustomCode extends string,
  TParser extends Parser | undefined,
> = TParser extends Parser
  ? new (
      opts: CustomTRPCErrorParams<inferParser<TParser>['out']>,
    ) => CustomTRPCError<
      TTRPCErrorCode,
      TCustomCode,
      inferParser<TParser>['out']
    >
  : new (
      opts?: Omit<CustomTRPCErrorParams<undefined>, 'data'>,
    ) => CustomTRPCError<TTRPCErrorCode, TCustomCode, undefined>;

/** @internal */
export type inferErrorClasses<TErrorDefs extends ErrorDefMap> = {
  [TKey in keyof TErrorDefs]: TKey extends string
    ? CustomErrorClass<TErrorDefs[TKey]['code'], TKey, TErrorDefs[TKey]['data']>
    : never;
};

/** @internal */
export type AnyCustomErrorClassMap = inferErrorClasses<ErrorDefMap>;

/** @internal */
export function createErrorClasses<TErrorDefs extends ErrorDefMap>(
  errorsDefs: TErrorDefs,
): inferErrorClasses<TErrorDefs> {
  let errorClasses: AnyCustomErrorClassMap = {};

  for (const [key, errorDef] of Object.entries(errorsDefs)) {
    // Using object literal to infer the class name from the key
    errorClasses = {
      ...errorClasses,
      [key]: class extends CustomTRPCError<any, any, any> {
        constructor(opts?: CustomTRPCErrorParams<any>) {
          super({
            ...opts,
            code: errorDef.code,
            customCode: key,
            // Do not allow passing data if there's no parser in the error def
            data: errorDef.data ? opts?.data : undefined,
          });
        }
      },
    };
  }

  return errorClasses as inferErrorClasses<TErrorDefs>;
}

/** @internal */
export function createErrorMiddleware({
  errors,
  errorDefs,
}: {
  errors: AnyCustomErrorClassMap;
  errorDefs: ErrorDefMap;
}) {
  const errorMiddleware: AnyMiddlewareFunction =
    async function errorValidatorMiddleware(opts) {
      const { next } = opts;
      const result = await next();

      if (result.ok || !(result.error instanceof CustomTRPCError)) {
        return result;
      }

      const errorDef = errorDefs[result.error.customCode];
      const errorClass = errors[result.error.customCode];

      if (!errorDef?.data || !errorClass) {
        return result;
      }

      const parser = getParseFn(errorDef.data);

      let parsedData;
      try {
        parsedData = await parser(result.error.customData);
      } catch (cause) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error data validation failed',
          cause,
        });
      }

      // Rethrow the error with the parsed data
      throw new errorClass({
        message: result.error.message,
        data: parsedData,
        cause: result.error.cause,
      });
    };

  errorMiddleware._type = 'error';
  return errorMiddleware;
}
