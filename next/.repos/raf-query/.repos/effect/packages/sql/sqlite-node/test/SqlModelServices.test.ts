import { SqliteClient } from "@effect/sql-sqlite-node"
import { assert, describe, it } from "@effect/vitest"
import { Context, Effect, Schema, SchemaGetter } from "effect"
import { Model } from "effect/schema"
import { SqlClient, SqlModel, SqlResolver } from "effect/sql"

class NameDecoder extends Context.Service<NameDecoder, { readonly prefix: string }>()("test/NameDecoder") {}
class NameEncoder extends Context.Service<NameEncoder, { readonly prefix: string }>()("test/NameEncoder") {}
const decodedName = Schema.String.pipe(Schema.decodeTo(Schema.String, {
  decode: SchemaGetter.transformEffect((value: string) => Effect.map(NameDecoder, ({ prefix }) => prefix + value)),
  encode: SchemaGetter.passthrough()
}))
const encodedName = Schema.String.pipe(Schema.decodeTo(Schema.String, {
  decode: SchemaGetter.passthrough(),
  encode: SchemaGetter.transformEffect((value: string) => Effect.map(NameEncoder, ({ prefix }) => prefix + value))
}))
class User extends Model.Class<User>("User")({ id: Schema.Int, name: decodedName }) {}
class Both extends Model.Class<Both>("Both")({
  id: Schema.Int,
  name: Model.Field({ select: decodedName, insert: encodedName, update: encodedName })
}) {}
class Plain extends Model.Class<Plain>("Plain")({ id: Schema.Int, name: Schema.String }) {}
const options = { tableName: "users", idColumn: "id", spanPrefix: "User" } as const
const database = SqliteClient.layer({ filename: ":memory:" })
const createTable = Effect.gen(function*() {
  const sql = yield* SqlClient.SqlClient
  yield* sql`CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL)`
  return sql
})

describe("SqlModel insert native node:sqlite runtime controls", () => {
  it.effect("decoder is supplied at request execution, not resolver construction", () =>
    Effect.gen(function*() {
      assert.strictEqual(process.versions.bun, undefined)
      assert.isString(process.versions.sqlite)
      const sql = yield* createTable
      const resolvers = yield* SqlModel.makeResolvers(User, options)
      const result = yield* SqlResolver.request({ id: 1, name: "Ada" }, resolvers.insert).pipe(
        Effect.provideService(NameDecoder, { prefix: "read:" })
      )
      assert.instanceOf(result, User)
      assert.strictEqual(result.name, "read:Ada")
      assert.deepStrictEqual(yield* sql`SELECT * FROM users`, [{ id: 1, name: "Ada" }])
      const found = yield* SqlResolver.request(1, resolvers.findById).pipe(
        Effect.provideService(NameDecoder, { prefix: "find:" })
      )
      assert.strictEqual(found.name, "find:Ada")
    }).pipe(Effect.provide(database)))

  it.effect("distinct encoder and decoder execute in their own directions", () =>
    Effect.gen(function*() {
      const sql = yield* createTable
      const resolvers = yield* SqlModel.makeResolvers(Both, options)
      const result = yield* SqlResolver.request({ id: 2, name: "Ada" }, resolvers.insert).pipe(
        Effect.provideService(NameEncoder, { prefix: "write:" }),
        Effect.provideService(NameDecoder, { prefix: "read:" })
      )
      assert.instanceOf(result, Both)
      assert.strictEqual(result.name, "read:write:Ada")
      assert.deepStrictEqual(yield* sql`SELECT * FROM users`, [{ id: 2, name: "write:Ada" }])
    }).pipe(Effect.provide(database)))

  it.effect("plain model insert is unchanged", () =>
    Effect.gen(function*() {
      const sql = yield* createTable
      const resolvers = yield* SqlModel.makeResolvers(Plain, options)
      const result = yield* SqlResolver.request({ id: 3, name: "plain" }, resolvers.insert)
      assert.instanceOf(result, Plain)
      assert.strictEqual(result.name, "plain")
      assert.deepStrictEqual(yield* sql`SELECT * FROM users`, [{ id: 3, name: "plain" }])
    }).pipe(Effect.provide(database)))

  it.effect("insertVoid does not execute the model decoder", () =>
    Effect.gen(function*() {
      const sql = yield* createTable
      const resolvers = yield* SqlModel.makeResolvers(User, options)
      yield* SqlResolver.request({ id: 4, name: "void" }, resolvers.insertVoid)
      assert.deepStrictEqual(yield* sql`SELECT * FROM users`, [{ id: 4, name: "void" }])
    }).pipe(Effect.provide(database)))

  it.effect("SQL failures keep their typed SqlError", () =>
    Effect.gen(function*() {
      const sql = yield* createTable
      yield* sql`INSERT INTO users VALUES (5, 'existing')`
      const resolvers = yield* SqlModel.makeResolvers(User, options)
      const error = yield* SqlResolver.request({ id: 5, name: "duplicate" }, resolvers.insert).pipe(
        Effect.provideService(NameDecoder, { prefix: "read:" }),
        Effect.flip
      )
      assert.strictEqual(error._tag, "SqlError")
      assert.deepStrictEqual(yield* sql`SELECT * FROM users`, [{ id: 5, name: "existing" }])
    }).pipe(Effect.provide(database)))

  it.effect("a real returned-row schema failure keeps its typed SchemaError", () =>
    Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      yield* sql`CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL)`
      const resolvers = yield* SqlModel.makeResolvers(User, options)
      const error = yield* SqlResolver.request({ id: 6, name: "invalid row" }, resolvers.insert).pipe(
        Effect.provideService(NameDecoder, { prefix: "read:" }),
        Effect.flip
      )
      assert.strictEqual(error._tag, "SchemaError")
      assert.deepStrictEqual(yield* sql`SELECT * FROM users`, [{ id: "6.0", name: "invalid row" }])
    }).pipe(Effect.provide(database)))
})
