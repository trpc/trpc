/**
 * Builds SQL repositories and request resolvers from Effect schema models.
 *
 * Use this module when a schema `Model` represents rows in a SQL table and the
 * usual insert, update, find-by-id, delete, and batching behavior should be
 * derived from that model. The helpers encode insert and update input with the
 * model's input schemas and decode returned rows with the full model schema.
 * Soft deletes are optional, and SQL dialect differences such as `returning`
 * support are handled by the repository implementation.
 *
 * @stability unstable
 * @since 4.0.0
 */
import type * as Cause from "../Cause.ts"
import * as Effect from "../Effect.ts"
import * as RequestResolver from "../RequestResolver.ts"
import type * as Schema from "../Schema.ts"
import type * as Model from "../schema/Model.ts"
import type { Scope } from "../Scope.ts"
import { SqlClient } from "./SqlClient.ts"
import type { ResultLengthMismatch, SqlError } from "./SqlError.ts"
import * as SqlResolver from "./SqlResolver.ts"
import * as SqlSchema from "./SqlSchema.ts"

/**
 * Creates a CRUD repository for a schema model backed by a SQL table, with
 * insert, update, find-by-id, and delete operations. When `softDeleteColumn` is
 * supplied, reads ignore soft-deleted rows and delete updates that column
 * instead of removing the row.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const makeRepository = <
  S extends Model.Any,
  Id extends (keyof S["Type"]) & (keyof S["update"]["Type"]) & (keyof S["fields"]),
  SoftDelete extends keyof S["fields"] = never
>(Model: S, options: {
  readonly tableName: string
  readonly spanPrefix: string
  readonly idColumn: Id
  readonly softDeleteColumn?: SoftDelete | undefined
}): Effect.Effect<
  {
    readonly insert: (
      insert: S["insert"]["Type"]
    ) => Effect.Effect<
      S["Type"],
      Schema.SchemaError | SqlError,
      S["DecodingServices"] | S["insert"]["EncodingServices"]
    >
    readonly insertVoid: (
      insert: S["insert"]["Type"]
    ) => Effect.Effect<void, Schema.SchemaError | SqlError, S["insert"]["EncodingServices"]>
    readonly update: (
      update: S["update"]["Type"]
    ) => Effect.Effect<
      S["Type"],
      Schema.SchemaError | SqlError,
      S["DecodingServices"] | S["update"]["EncodingServices"]
    >
    readonly updateVoid: (
      update: S["update"]["Type"]
    ) => Effect.Effect<void, Schema.SchemaError | SqlError, S["update"]["EncodingServices"]>
    readonly findById: (
      id: S["fields"][Id]["Type"]
    ) => Effect.Effect<
      S["Type"],
      Cause.NoSuchElementError | Schema.SchemaError | SqlError,
      S["DecodingServices"] | S["fields"][Id]["EncodingServices"]
    >
    readonly delete: (
      id: S["fields"][Id]["Type"]
    ) => Effect.Effect<void, Schema.SchemaError | SqlError, S["fields"][Id]["EncodingServices"]>
  },
  never,
  SqlClient
> =>
  Effect.gen(function*() {
    const sql = yield* SqlClient
    const idSchema = Model.fields[options.idColumn]
    const idColumn = options.idColumn as string
    const softDeleteColumn = options.softDeleteColumn as string | undefined
    const withSoftDeleteFilter = (where: any) =>
      softDeleteColumn === undefined ? where : sql.and([where, sql`${sql(softDeleteColumn)} is null`])
    const setSoftDeleted = softDeleteColumn === undefined
      ? undefined
      : sql`${sql(softDeleteColumn)} = CURRENT_TIMESTAMP`

    const insertSchema = SqlSchema.findOne({
      Request: Model.insert,
      Result: Model,
      execute: (request) =>
        sql.onDialectOrElse({
          mysql: () =>
            sql`insert into ${sql(options.tableName)} ${sql.insert(request as any)};
select * from ${sql(options.tableName)} where ${withSoftDeleteFilter(sql`${sql(idColumn)} = LAST_INSERT_ID()`)};`
              .unprepared.pipe(
                Effect.map(([, results]) => results as any)
              ),
          orElse: () => sql`insert into ${sql(options.tableName)} ${sql.insert(request as any).returning("*")}`
        })
    })
    const insert = (
      insert: S["insert"]["Type"]
    ): Effect.Effect<
      S["Type"],
      Schema.SchemaError | SqlError,
      S["DecodingServices"] | S["insert"]["EncodingServices"]
    > =>
      insertSchema(insert).pipe(
        Effect.catchTag("NoSuchElementError", Effect.die),
        Effect.withSpan(`${options.spanPrefix}.insert`, {}, { captureStackTrace: false })
      ) as any

    const insertVoidSchema = SqlSchema.void({
      Request: Model.insert,
      execute: (request) => sql`insert into ${sql(options.tableName)} ${sql.insert(request as any)}`
    })
    const insertVoid = (
      insert: S["insert"]["Type"]
    ): Effect.Effect<void, Schema.SchemaError | SqlError, S["insert"]["EncodingServices"]> =>
      insertVoidSchema(insert).pipe(
        Effect.withSpan(`${options.spanPrefix}.insertVoid`, {}, {
          captureStackTrace: false
        })
      ) as any

    const updateSchema = SqlSchema.findOne({
      Request: Model.update,
      Result: Model,
      execute: (request: any) =>
        sql.onDialectOrElse({
          mysql: () =>
            sql`update ${sql(options.tableName)} set ${sql.update(request, [idColumn])} where ${
              withSoftDeleteFilter(sql`${sql(idColumn)} = ${request[idColumn]}`)
            };
select * from ${sql(options.tableName)} where ${withSoftDeleteFilter(sql`${sql(idColumn)} = ${request[idColumn]}`)};`
              .unprepared.pipe(
                Effect.map(([, results]) => results as any)
              ),
          orElse: () =>
            sql`update ${sql(options.tableName)} set ${sql.update(request, [idColumn])} where ${
              withSoftDeleteFilter(sql`${sql(idColumn)} = ${request[idColumn]}`)
            } returning *`
        })
    })
    const update = (
      update: S["update"]["Type"]
    ): Effect.Effect<
      S["Type"],
      Schema.SchemaError | SqlError,
      S["DecodingServices"] | S["update"]["EncodingServices"]
    > =>
      updateSchema(update).pipe(
        Effect.catchTag("NoSuchElementError", Effect.die),
        Effect.withSpan(`${options.spanPrefix}.update`, {
          attributes: { id: (update as any)[idColumn] }
        }, {
          captureStackTrace: false
        })
      ) as any

    const updateVoidSchema = SqlSchema.void({
      Request: Model.update,
      execute: (request: any) =>
        sql`update ${sql(options.tableName)} set ${sql.update(request, [idColumn])} where ${
          withSoftDeleteFilter(sql`${sql(idColumn)} = ${request[idColumn]}`)
        }`
    })
    const updateVoid = (
      update: S["update"]["Type"]
    ): Effect.Effect<void, Schema.SchemaError | SqlError, S["update"]["EncodingServices"]> =>
      updateVoidSchema(update).pipe(
        Effect.withSpan(`${options.spanPrefix}.updateVoid`, {
          attributes: { id: (update as any)[idColumn] }
        }, {
          captureStackTrace: false
        })
      ) as any

    const findByIdSchema = SqlSchema.findOne({
      Request: idSchema,
      Result: Model,
      execute: (id: any) =>
        sql`select * from ${sql(options.tableName)} where ${withSoftDeleteFilter(sql`${sql(idColumn)} = ${id}`)}`
    })
    const findById = (
      id: S["fields"][Id]["Type"]
    ): Effect.Effect<
      S["Type"],
      Cause.NoSuchElementError | Schema.SchemaError | SqlError,
      S["DecodingServices"] | S["fields"][Id]["EncodingServices"]
    > =>
      findByIdSchema(id).pipe(
        Effect.withSpan(`${options.spanPrefix}.findById`, { attributes: { id } }, {
          captureStackTrace: false
        })
      ) as any

    const deleteSchema = SqlSchema.void({
      Request: idSchema,
      execute: (id: any) =>
        softDeleteColumn === undefined
          ? sql`delete from ${sql(options.tableName)} where ${sql(idColumn)} = ${id}`
          : sql`update ${sql(options.tableName)} set ${setSoftDeleted} where ${
            withSoftDeleteFilter(sql`${sql(idColumn)} = ${id}`)
          }`
    })
    const delete_ = (
      id: S["fields"][Id]["Type"]
    ): Effect.Effect<void, Schema.SchemaError | SqlError, S["fields"][Id]["EncodingServices"]> =>
      deleteSchema(id).pipe(
        Effect.withSpan(`${options.spanPrefix}.delete`, {
          attributes: { id }
        }, {
          captureStackTrace: false
        })
      ) as any

    return { insert, insertVoid, update, updateVoid, findById, delete: delete_ } as const
  })

/**
 * Creates batched request resolvers for a schema model's insert, insert-void,
 * find-by-id, and delete operations, honoring the optional soft-delete column.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const makeResolvers = <
  S extends Model.Any,
  Id extends (keyof S["Type"]) & (keyof S["update"]["Type"]) & (keyof S["fields"]),
  SoftDelete extends keyof S["fields"] = never
>(
  Model: S,
  options: {
    readonly tableName: string
    readonly spanPrefix: string
    readonly idColumn: Id
    readonly softDeleteColumn?: SoftDelete | undefined
  }
): Effect.Effect<
  {
    readonly insert: RequestResolver.RequestResolver<
      SqlResolver.SqlRequest<
        S["insert"]["Type"],
        S["Type"],
        ResultLengthMismatch | SqlError,
        S["DecodingServices"] | S["insert"]["EncodingServices"]
      >
    >
    readonly insertVoid: RequestResolver.RequestResolver<
      SqlResolver.SqlRequest<S["insert"]["Type"], void, SqlError, S["insert"]["EncodingServices"]>
    >
    readonly findById: RequestResolver.RequestResolver<
      SqlResolver.SqlRequest<
        S["fields"][Id]["Type"],
        S["Type"],
        Cause.NoSuchElementError | SqlError,
        S["DecodingServices"] | S["fields"][Id]["EncodingServices"]
      >
    >
    readonly delete: RequestResolver.RequestResolver<
      SqlResolver.SqlRequest<
        S["fields"][Id]["Type"],
        void,
        SqlError,
        S["fields"][Id]["EncodingServices"]
      >
    >
  },
  never,
  SqlClient | Scope
> =>
  Effect.gen(function*() {
    const sql = yield* SqlClient
    const idSchema = Model.fields[options.idColumn]
    const idColumn = options.idColumn as string
    const softDeleteColumn = options.softDeleteColumn as string | undefined
    const withSoftDeleteFilter = (where: any) =>
      softDeleteColumn === undefined ? where : sql.and([where, sql`${sql(softDeleteColumn)} is null`])
    const setSoftDeleted = softDeleteColumn === undefined
      ? undefined
      : sql`${sql(softDeleteColumn)} = CURRENT_TIMESTAMP`

    const insert: RequestResolver.RequestResolver<
      SqlResolver.SqlRequest<
        S["insert"]["Type"],
        S["Type"],
        ResultLengthMismatch | SqlError,
        S["DecodingServices"] | S["insert"]["EncodingServices"]
      >
    > = SqlResolver.ordered({
      Request: Model.insert,
      Result: Model,
      execute: (request: any) =>
        sql.onDialectOrElse({
          mysql: () =>
            Effect.forEach(request, (request: any) =>
              sql`insert into ${sql(options.tableName)} ${sql.insert(request)};
select * from ${sql(options.tableName)} where ${withSoftDeleteFilter(sql`${sql(idColumn)} = LAST_INSERT_ID()`)};`
                .unprepared.pipe(
                  Effect.map(([, results]) => results[0] as any)
                ), { concurrency: 10 }),
          orElse: () => sql`insert into ${sql(options.tableName)} ${sql.insert(request).returning("*")}`
        })
    }).pipe(
      RequestResolver.withSpan(`${options.spanPrefix}.insertResolver`)
    )

    const insertVoid: RequestResolver.RequestResolver<
      SqlResolver.SqlRequest<S["insert"]["Type"], void, Schema.SchemaError | SqlError, S["insert"]["EncodingServices"]>
    > = SqlResolver.void({
      Request: Model.insert,
      execute: (request: any) => sql`insert into ${sql(options.tableName)} ${sql.insert(request)}`
    }).pipe(
      RequestResolver.withSpan(`${options.spanPrefix}.insertVoidResolver`)
    )

    const findById: RequestResolver.RequestResolver<
      SqlResolver.SqlRequest<
        S["fields"][Id]["Type"],
        S["Type"],
        Cause.NoSuchElementError | Schema.SchemaError | SqlError,
        S["DecodingServices"] | S["fields"][Id]["EncodingServices"]
      >
    > = SqlResolver.findById({
      Id: idSchema,
      Result: Model,
      ResultId(request: any) {
        return request[idColumn]
      },
      execute: (ids: any) =>
        sql`select * from ${sql(options.tableName)} where ${withSoftDeleteFilter(sql.in(idColumn, ids))}`
    }).pipe(
      RequestResolver.withSpan(`${options.spanPrefix}.findByIdResolver`)
    )

    const delete_: RequestResolver.RequestResolver<
      SqlResolver.SqlRequest<
        S["fields"][Id]["Type"],
        void,
        Schema.SchemaError | SqlError,
        S["fields"][Id]["EncodingServices"]
      >
    > = SqlResolver.void({
      Request: idSchema,
      execute: (ids: any) =>
        softDeleteColumn === undefined
          ? sql`delete from ${sql(options.tableName)} where ${sql.in(idColumn, ids)}`
          : sql`update ${sql(options.tableName)} set ${setSoftDeleted} where ${
            withSoftDeleteFilter(sql.in(idColumn, ids))
          }`
    }).pipe(
      RequestResolver.withSpan(`${options.spanPrefix}.deleteResolver`)
    )

    return { insert, insertVoid, findById, delete: delete_ } as const
  })
