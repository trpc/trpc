/**
 * Typed metadata builders for Microsoft SQL Server stored procedure calls.
 *
 * This module defines the `Procedure` values consumed by `MssqlClient.call`.
 * `make` starts a procedure definition, `param` and `outputParam` add typed
 * Tedious parameter metadata, `withRows` sets the expected row type, and
 * `compile` binds input values before execution. The module also defines the
 * typed result shape for output parameters and returned rows.
 *
 * @stability unstable
 * @since 4.0.0
 */
import { identity } from "effect/Function"
import type { Pipeable } from "effect/Pipeable"
import { pipeArguments } from "effect/Pipeable"
import type { Row } from "effect/sql/SqlConnection"
import type { Covariant } from "effect/Types"
import type { DataType } from "tedious/lib/data-type.ts"
import type { ParameterOptions } from "tedious/lib/request.ts"
import * as Parameter from "./Parameter.ts"

/**
 * Runtime type identifier used to mark SQL Server stored procedure definitions.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export const TypeId: TypeId = "~@effect/sql-mssql/Procedure"

/**
 * Type-level identifier used to mark SQL Server stored procedure definitions.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export type TypeId = "~@effect/sql-mssql/Procedure"

/**
 * Pipeable definition of a SQL Server stored procedure, tracking its input parameters, output parameters, and result row type.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Procedure<
  I extends Record<string, Parameter.Parameter<any>>,
  O extends Record<string, Parameter.Parameter<any>>,
  A = never
> extends Pipeable {
  readonly [TypeId]: {
    readonly _A: Covariant<A>
  }
  readonly _tag: "Procedure"
  readonly name: string
  readonly params: I
  readonly outputParams: O
}

/**
 * Stored procedure definition with concrete input values bound for execution.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ProcedureWithValues<
  I extends Record<string, Parameter.Parameter<any>>,
  O extends Record<string, Parameter.Parameter<any>>,
  A
> extends Procedure<I, O, A> {
  readonly values: Procedure.ParametersRecord<I>
}

/**
 * Namespace containing type helpers and result types for SQL Server stored procedures.
 *
 * @stability unstable
 * @since 4.0.0
 */
export declare namespace Procedure {
  /**
   * Maps a record of `Parameter` metadata to the corresponding record of parameter value types.
   *
   * @stability unstable
   * @category utility types
   * @since 4.0.0
   */
  export type ParametersRecord<
    A extends Record<string, Parameter.Parameter<any>>
  > =
    & {
      readonly [K in keyof A]: A[K] extends Parameter.Parameter<infer T> ? T
        : never
    }
    & {}

  /**
   * Result of a SQL Server stored procedure call, containing typed output parameter values and returned rows.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export interface Result<
    O extends Record<string, Parameter.Parameter<any>>,
    A
  > {
    readonly output: ParametersRecord<O>
    readonly rows: ReadonlyArray<A>
  }
}

type Simplify<A> = { [K in keyof A]: A[K] } & {}

const procedureProto = {
  [TypeId]: {
    _A: identity
  },
  _tag: "Procedure",
  pipe() {
    return pipeArguments(this, arguments)
  }
}

/**
 * Creates an empty SQL Server stored procedure definition for the given procedure name.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make = (name: string): Procedure<{}, {}> => {
  const procedure = Object.create(procedureProto)
  procedure.name = name
  procedure.params = {}
  procedure.outputParams = {}
  return procedure
}

/**
 * Adds a typed input parameter to a SQL Server stored procedure definition.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const param = <A>() =>
<N extends string, T extends DataType>(
  name: N,
  type: T,
  options?: ParameterOptions
) =>
<
  I extends Record<string, Parameter.Parameter<any>>,
  O extends Record<string, Parameter.Parameter<any>>
>(
  self: Procedure<I, O>
): Procedure<Simplify<I & { [K in N]: Parameter.Parameter<A> }>, O> => ({
  ...self,
  params: {
    ...self.params,
    [name]: Parameter.make(name, type, options)
  }
})

/**
 * Adds a typed output parameter to a SQL Server stored procedure definition.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const outputParam = <A>() =>
<N extends string, T extends DataType>(
  name: N,
  type: T,
  options?: ParameterOptions
) =>
<
  I extends Record<string, Parameter.Parameter<any>>,
  O extends Record<string, Parameter.Parameter<any>>
>(
  self: Procedure<I, O>
): Procedure<I, Simplify<O & { [K in N]: Parameter.Parameter<A> }>> => ({
  ...self,
  outputParams: {
    ...self.outputParams,
    [name]: Parameter.make(name, type, options)
  }
})

/**
 * Sets the expected row type for a SQL Server stored procedure definition.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const withRows = <A extends object = Row>() =>
<
  I extends Record<string, Parameter.Parameter<any>>,
  O extends Record<string, Parameter.Parameter<any>>
>(
  self: Procedure<I, O>
): Procedure<I, O, A> => self as any

/**
 * Binds input values to a SQL Server stored procedure definition, producing a value that can be executed with `MssqlClient.call`.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const compile = <
  I extends Record<string, Parameter.Parameter<any>>,
  O extends Record<string, Parameter.Parameter<any>>,
  A
>(
  self: Procedure<I, O, A>
) =>
(input: Procedure.ParametersRecord<I>): ProcedureWithValues<I, O, A> => ({
  ...self,
  values: input
})
