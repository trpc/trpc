import { IndexedDb, IndexedDbDatabase, IndexedDbTable, IndexedDbVersion } from "@effect/platform-browser"
import { afterEach, assert, describe, it } from "@effect/vitest"
import {
  Array,
  Cause,
  Context,
  DateTime,
  Effect,
  Fiber,
  Layer,
  Schema,
  SchemaGetter,
  SchemaIssue,
  Stream
} from "effect"
import { IDBKeyRange, indexedDB } from "fake-indexeddb"

const databaseName = "db"

const layerFakeIndexedDb = Layer.succeed(
  IndexedDb.IndexedDb,
  IndexedDb.make({ indexedDB, IDBKeyRange })
)

const provideDb = (database: IndexedDbDatabase.Any) =>
  Effect.provide(
    database.layer(databaseName).pipe(Layer.provide(layerFakeIndexedDb))
  )

afterEach(() => {
  indexedDB.deleteDatabase(databaseName)
})

class Table1 extends IndexedDbTable.make({
  name: "todo",
  schema: Schema.Struct({
    id: Schema.Number,
    title: Schema.String,
    count: Schema.Number,
    completed: Schema.Boolean
  }),
  keyPath: "id",
  indexes: { titleIndex: "title", countIndex: "count", titleCount: ["title", "count"] }
}) {}

class User extends Schema.Class<User>("User")({
  id: Schema.Number,
  name: Schema.String,
  email: Schema.String,
  createdAt: Schema.DateTimeUtcFromMillis
}) {}

class ProductSchema extends Schema.Class<ProductSchema>("ProductSchema")({
  key: IndexedDb.AutoIncrement,
  name: Schema.String,
  price: Schema.Number
}) {}

class VerifyContext extends Context.Service<
  VerifyContext,
  { readonly maxLength: number }
>()("VerifyContext") {}

const VerifyId = Schema.String.pipe(
  Schema.decodeTo(Schema.String, {
    encode: SchemaGetter.transformEffect((s) =>
      Effect.gen(function*() {
        const { maxLength } = yield* VerifyContext
        if (s.length > maxLength) {
          return yield* Effect.fail(
            new SchemaIssue.InvalidValue({
              message: "Max length exceeded"
            })
          )
        }
        return s
      })
    ),
    decode: SchemaGetter.String()
  })
)

const Table2 = IndexedDbTable.make({
  name: "user",
  schema: User,
  keyPath: "id"
})

const Table3 = IndexedDbTable.make({
  name: "product",
  schema: ProductSchema,
  keyPath: "price"
})

const Table4 = IndexedDbTable.make({
  name: "price",
  schema: Schema.Struct({
    id: IndexedDb.AutoIncrement,
    amount: Schema.Number
  }),
  keyPath: "id",
  autoIncrement: true
})

const Table5 = IndexedDbTable.make({
  name: "person",
  schema: Schema.Struct({
    firstName: Schema.String,
    lastName: Schema.String,
    age: Schema.Number
  }),
  keyPath: ["firstName", "lastName"]
})

const Table6 = IndexedDbTable.make({
  name: "user-verify",
  schema: Schema.Struct({ id: VerifyId }),
  keyPath: "id"
})

const Table7 = IndexedDbTable.make({
  name: "no-keypath",
  schema: Schema.Struct({ username: Schema.String, index: Schema.Number }),
  indexes: { usernameIndex: "username" }
})

class V1 extends IndexedDbVersion.make(
  Table1,
  Table2,
  Table3,
  Table4,
  Table5,
  Table6,
  Table7
) {}

describe("IndexedDbQueryBuilder", { concurrent: false }, () => {
  describe("select", () => {
    it.effect("select", () => {
      class Db extends IndexedDbDatabase.make(
        V1,
        Effect.fn(function*(api) {
          yield* api.createObjectStore("todo")
          yield* api.createIndex("todo", "titleIndex")
          yield* api.createIndex("todo", "countIndex")
          yield* api
            .from("todo")
            .insert({ id: 1, title: "test", count: 1, completed: false })
        })
      ) {}

      return Effect.gen(function*() {
        const api = yield* Db.getQueryBuilder
        const from = api.from("todo")
        const select = from.select()
        const data = yield* select

        assert.equal(from.table.tableName, "todo")
        assert.equal(select.index, undefined)
        assert.deepStrictEqual(select.from, from)
        assert.deepStrictEqual(select.from.IDBKeyRange, IDBKeyRange)
        assert.equal(data.length, 1)
        assert.deepStrictEqual(data, [
          { id: 1, title: "test", count: 1, completed: false }
        ])
      }).pipe(provideDb(Db))
    })

    it.effect("select with index", () => {
      class Db extends IndexedDbDatabase.make(
        V1,
        Effect.fn(function*(api) {
          yield* api.createObjectStore("todo")
          yield* api.createIndex("todo", "titleIndex")
          yield* api.createIndex("todo", "countIndex")
          yield* api
            .from("todo")
            .insert({ id: 2, title: "test2", count: 2, completed: false })
        })
      ) {}

      return Effect.gen(function*() {
        const api = yield* Db
        const from = api.from("todo")
        const select = from.select("titleIndex")
        const data = yield* select

        assert.equal(from.table.tableName, "todo")
        assert.equal(select.index, "titleIndex")
        assert.deepStrictEqual(select.from, from)
        assert.deepStrictEqual(select.from.IDBKeyRange, IDBKeyRange)
        assert.equal(data.length, 1)
        assert.deepStrictEqual(data, [
          { id: 2, title: "test2", count: 2, completed: false }
        ])
      }).pipe(provideDb(Db))
    })

    it.effect("select equals", () => {
      class Db extends IndexedDbDatabase.make(
        V1,
        Effect.fn(function*(api) {
          yield* api.createObjectStore("todo")
          yield* api.createIndex("todo", "titleIndex")
          yield* api.createIndex("todo", "countIndex")
          yield* api.from("todo").insertAll([
            { id: 1, title: "test1", count: 1, completed: false },
            { id: 2, title: "test2", count: 2, completed: false },
            { id: 3, title: "test3", count: 3, completed: false }
          ])
        })
      ) {}

      return Effect.gen(function*() {
        {
          const api = yield* Db
          const from = api.from("todo")
          const select = from.select()
          const equals = select.equals(2)
          const data = yield* equals

          assert.equal(from.table.tableName, "todo")
          assert.equal(equals.index, undefined)
          assert.deepStrictEqual(equals.from, from)
          assert.deepStrictEqual(equals.from.IDBKeyRange, IDBKeyRange)
          assert.equal(equals.only, 2)
          assert.equal(data.length, 1)
          assert.deepStrictEqual(data, [
            { id: 2, title: "test2", count: 2, completed: false }
          ])
        }
      }).pipe(provideDb(Db))
    })

    it.effect("select equals in no keypath table", () => {
      class Db extends IndexedDbDatabase.make(
        V1,
        Effect.fn(function*(api) {
          yield* api.createObjectStore("no-keypath")
          yield* api
            .from("no-keypath")
            .insert({ username: "user", index: 1, key: 5 })
        })
      ) {}

      return Effect.gen(function*() {
        const api = yield* Db
        const data = yield* api.from("no-keypath").select().equals(5)

        assert.deepStrictEqual(data, [
          { username: "user", index: 1, key: 5 }
        ])
      }).pipe(provideDb(Db))
    })

    it.effect("select first preserves the primary key in no keypath table", () => {
      class Db extends IndexedDbDatabase.make(
        V1,
        Effect.fn(function*(api) {
          yield* api.createObjectStore("no-keypath")
          yield* api.createIndex("no-keypath", "usernameIndex")
          yield* api.from("no-keypath").insertAll([
            { key: 7, username: "user", index: 1 },
            { key: 9, username: "user", index: 2 }
          ])
        })
      ) {}

      return Effect.gen(function*() {
        const api = yield* Db
        const data = yield* api.from("no-keypath").select("usernameIndex").equals("user").first()

        assert.deepStrictEqual(data, { key: 7, username: "user", index: 1 })
      }).pipe(provideDb(Db))
    })

    it.effect("select preserves primary keys in no keypath table", () => {
      class Db extends IndexedDbDatabase.make(
        V1,
        Effect.fn(function*(api) {
          yield* api.createObjectStore("no-keypath")
          yield* api.createIndex("no-keypath", "usernameIndex")
          yield* api.from("no-keypath").insertAll([
            { key: 7, username: "user", index: 1 },
            { key: 9, username: "user", index: 2 }
          ])
        })
      ) {}

      return Effect.gen(function*() {
        const api = yield* Db
        const data = yield* api.from("no-keypath").select("usernameIndex").equals("user")

        assert.deepStrictEqual(data, [
          { key: 7, username: "user", index: 1 },
          { key: 9, username: "user", index: 2 }
        ])
      }).pipe(provideDb(Db))
    })

    it.effect("select equals with index", () => {
      class Db extends IndexedDbDatabase.make(
        V1,
        Effect.fn(function*(api) {
          yield* api.createObjectStore("todo")
          yield* api.createIndex("todo", "titleIndex")
          yield* api.createIndex("todo", "countIndex")
          yield* api.from("todo").insertAll([
            { id: 1, title: "test1", count: 1, completed: false },
            { id: 2, title: "test2", count: 2, completed: false },
            { id: 3, title: "test3", count: 3, completed: false }
          ])
        })
      ) {}

      return Effect.gen(function*() {
        {
          const api = yield* Db
          const from = api.from("todo")
          const select = from.select("titleIndex")
          const equals = select.equals("test3")
          const data = yield* equals

          assert.equal(from.table.tableName, "todo")
          assert.equal(equals.index, "titleIndex")
          assert.deepStrictEqual(equals.from, from)
          assert.deepStrictEqual(equals.from.IDBKeyRange, IDBKeyRange)
          assert.equal(equals.only, "test3")
          assert.equal(data.length, 1)
          assert.deepStrictEqual(data, [
            { id: 3, title: "test3", count: 3, completed: false }
          ])
        }
      }).pipe(provideDb(Db))
    })

    it.effect("select gte", () => {
      class Db extends IndexedDbDatabase.make(
        V1,
        Effect.fn(function*(api) {
          yield* api.createObjectStore("todo")
          yield* api.createIndex("todo", "titleIndex")
          yield* api.createIndex("todo", "countIndex")
          yield* api.from("todo").insertAll([
            { id: 1, title: "test1", count: 1, completed: false },
            { id: 2, title: "test2", count: 2, completed: false },
            { id: 3, title: "test3", count: 3, completed: false }
          ])
        })
      ) {}

      return Effect.gen(function*() {
        const api = yield* Db.getQueryBuilder
        const data = yield* api.from("todo").select().gte(2)

        assert.equal(data.length, 2)
        assert.deepStrictEqual(data, [
          { id: 2, title: "test2", count: 2, completed: false },
          { id: 3, title: "test3", count: 3, completed: false }
        ])
      }).pipe(provideDb(Db))
    })

    it.effect("select gte with index", () => {
      class Db extends IndexedDbDatabase.make(
        V1,
        Effect.fn(function*(api) {
          yield* api.createObjectStore("todo")
          yield* api.createIndex("todo", "titleIndex")
          yield* api.createIndex("todo", "countIndex")
          yield* api.from("todo").insertAll([
            { id: 1, title: "test1", count: 1, completed: false },
            { id: 2, title: "test2", count: 2, completed: false },
            { id: 3, title: "test3", count: 3, completed: false }
          ])
        })
      ) {}

      return Effect.gen(function*() {
        const api = yield* Db.getQueryBuilder
        const data = yield* api.from("todo").select("countIndex").gte(3)

        assert.equal(data.length, 1)
        assert.deepStrictEqual(data, [
          { id: 3, title: "test3", count: 3, completed: false }
        ])
      }).pipe(provideDb(Db))
    })

    it.effect("select lte", () => {
      class Db extends IndexedDbDatabase.make(
        V1,
        Effect.fn(function*(api) {
          yield* api.createObjectStore("todo")
          yield* api.createIndex("todo", "titleIndex")
          yield* api.createIndex("todo", "countIndex")
          yield* api.from("todo").insertAll([
            { id: 1, title: "test1", count: 1, completed: false },
            { id: 2, title: "test2", count: 2, completed: false },
            { id: 3, title: "test3", count: 3, completed: false }
          ])
        })
      ) {}

      return Effect.gen(function*() {
        {
          const api = yield* Db.getQueryBuilder
          const data = yield* api.from("todo").select().lte(2)

          assert.equal(data.length, 2)
          assert.deepStrictEqual(data, [
            { id: 1, title: "test1", count: 1, completed: false },
            { id: 2, title: "test2", count: 2, completed: false }
          ])
        }
      }).pipe(provideDb(Db))
    })

    it.effect("select gt", () => {
      class Db extends IndexedDbDatabase.make(
        V1,
        Effect.fn(function*(api) {
          yield* api.createObjectStore("todo")
          yield* api.createIndex("todo", "titleIndex")
          yield* api.createIndex("todo", "countIndex")
          yield* api.from("todo").insertAll([
            { id: 1, title: "test1", count: 1, completed: false },
            { id: 2, title: "test2", count: 2, completed: false },
            { id: 3, title: "test3", count: 3, completed: false }
          ])
        })
      ) {}

      return Effect.gen(function*() {
        const api = yield* Db.getQueryBuilder
        const data = yield* api.from("todo").select().gt(2)

        assert.equal(data.length, 1)
        assert.deepStrictEqual(data, [
          { id: 3, title: "test3", count: 3, completed: false }
        ])
      }).pipe(provideDb(Db))
    })

    it.effect("select lt", () => {
      class Db extends IndexedDbDatabase.make(
        V1,
        Effect.fn(function*(api) {
          yield* api.createObjectStore("todo")
          yield* api.createIndex("todo", "titleIndex")
          yield* api.createIndex("todo", "countIndex")
          yield* api.from("todo").insertAll([
            { id: 1, title: "test1", count: 1, completed: false },
            { id: 2, title: "test2", count: 2, completed: false },
            { id: 3, title: "test3", count: 3, completed: false }
          ])
        })
      ) {}

      return Effect.gen(function*() {
        const api = yield* Db.getQueryBuilder
        const data = yield* api.from("todo").select().lt(2)

        assert.equal(data.length, 1)
        assert.deepStrictEqual(data, [
          { id: 1, title: "test1", count: 1, completed: false }
        ])
      }).pipe(provideDb(Db))
    })

    it.effect("select between", () => {
      class Db extends IndexedDbDatabase.make(
        V1,
        Effect.fn(function*(api) {
          yield* api.createObjectStore("todo")
          yield* api.createIndex("todo", "titleIndex")
          yield* api.createIndex("todo", "countIndex")
          yield* api.from("todo").insertAll([
            { id: 1, title: "test1", count: 1, completed: false },
            { id: 2, title: "test2", count: 2, completed: false },
            { id: 3, title: "test3", count: 3, completed: false },
            { id: 4, title: "test4", count: 4, completed: false },
            { id: 5, title: "test5", count: 5, completed: false }
          ])
        })
      ) {}

      return Effect.gen(function*() {
        const api = yield* Db.getQueryBuilder
        const data = yield* api.from("todo").select().between(2, 3)

        assert.equal(data.length, 2)
        assert.deepStrictEqual(data, [
          { id: 2, title: "test2", count: 2, completed: false },
          { id: 3, title: "test3", count: 3, completed: false }
        ])
      }).pipe(provideDb(Db))
    })

    it.effect("select between with exclude", () => {
      class Db extends IndexedDbDatabase.make(
        V1,
        Effect.fn(function*(api) {
          yield* api.createObjectStore("todo")
          yield* api.createIndex("todo", "titleIndex")
          yield* api.createIndex("todo", "countIndex")
          yield* api.from("todo").insertAll([
            { id: 1, title: "test1", count: 1, completed: false },
            { id: 2, title: "test2", count: 2, completed: false },
            { id: 3, title: "test3", count: 3, completed: false },
            { id: 4, title: "test4", count: 4, completed: false },
            { id: 5, title: "test5", count: 5, completed: false }
          ])
        })
      ) {}

      return Effect.gen(function*() {
        const api = yield* Db.getQueryBuilder
        const data = yield* api.from("todo").select().between(2, 4, {
          excludeLowerBound: true,
          excludeUpperBound: true
        })

        assert.equal(data.length, 1)
        assert.deepStrictEqual(data, [
          { id: 3, title: "test3", count: 3, completed: false }
        ])
      }).pipe(provideDb(Db))
    })

    it.effect("select limit", () => {
      class Db extends IndexedDbDatabase.make(
        V1,
        Effect.fn(function*(api) {
          yield* api.createObjectStore("todo")
          yield* api.createIndex("todo", "titleIndex")
          yield* api.createIndex("todo", "countIndex")
          yield* api.from("todo").insertAll([
            { id: 1, title: "test1", count: 1, completed: false },
            { id: 2, title: "test2", count: 2, completed: false },
            { id: 3, title: "test3", count: 3, completed: false },
            { id: 4, title: "test4", count: 4, completed: false },
            { id: 5, title: "test5", count: 5, completed: false }
          ])
        })
      ) {}

      return Effect.gen(function*() {
        const api = yield* Db.getQueryBuilder
        const data = yield* api.from("todo").select().limit(2)

        assert.equal(data.length, 2)
        assert.deepStrictEqual(data, [
          { id: 1, title: "test1", count: 1, completed: false },
          { id: 2, title: "test2", count: 2, completed: false }
        ])
      }).pipe(provideDb(Db))
    })

    it.effect("select offset", () => {
      class Db extends IndexedDbDatabase.make(
        V1,
        Effect.fn(function*(api) {
          yield* api.createObjectStore("todo")
          yield* api.createIndex("todo", "titleIndex")
          yield* api.createIndex("todo", "countIndex")
          yield* api.from("todo").insertAll([
            { id: 1, title: "test1", count: 1, completed: false },
            { id: 2, title: "test2", count: 2, completed: false },
            { id: 3, title: "test3", count: 3, completed: false },
            { id: 4, title: "test4", count: 4, completed: false },
            { id: 5, title: "test5", count: 5, completed: false }
          ])
        })
      ) {}

      return Effect.gen(function*() {
        const api = yield* Db.getQueryBuilder
        const data = yield* api.from("todo").select().limit(2).offset(2)

        assert.equal(data.length, 2)
        assert.deepStrictEqual(data, [
          { id: 3, title: "test3", count: 3, completed: false },
          { id: 4, title: "test4", count: 4, completed: false }
        ])
      }).pipe(provideDb(Db))
    })

    it.effect("select limit with filters", () => {
      class Db extends IndexedDbDatabase.make(
        V1,
        Effect.fn(function*(api) {
          yield* api.createObjectStore("todo")
          yield* api.createIndex("todo", "titleIndex")
          yield* api.createIndex("todo", "countIndex")
          yield* api.from("todo").insertAll([
            { id: 1, title: "test1", count: 1, completed: false },
            { id: 2, title: "test2", count: 2, completed: false },
            { id: 3, title: "test3", count: 3, completed: false },
            { id: 4, title: "test4", count: 4, completed: false },
            { id: 5, title: "test5", count: 5, completed: false }
          ])
        })
      ) {}

      return Effect.gen(function*() {
        const api = yield* Db.getQueryBuilder
        const data = yield* api
          .from("todo")
          .select("countIndex")
          .gte(2)
          .limit(2)

        assert.equal(data.length, 2)
        assert.deepStrictEqual(data, [
          { id: 2, title: "test2", count: 2, completed: false },
          { id: 3, title: "test3", count: 3, completed: false }
        ])
      }).pipe(provideDb(Db))
    })

    it.effect("select first", () => {
      class Db extends IndexedDbDatabase.make(
        V1,
        Effect.fn(function*(api) {
          yield* api.createObjectStore("todo")
          yield* api.createIndex("todo", "titleIndex")
          yield* api.createIndex("todo", "countIndex")
          yield* api.from("todo").insertAll([
            { id: 1, title: "test1", count: 1, completed: false },
            { id: 2, title: "test2", count: 2, completed: false },
            { id: 3, title: "test3", count: 3, completed: false }
          ])
        })
      ) {}

      return Effect.gen(function*() {
        const api = yield* Db.getQueryBuilder
        const data = yield* api.from("todo").select().first()

        assert.deepStrictEqual(data, {
          id: 1,
          title: "test1",
          count: 1,
          completed: false
        })
      }).pipe(provideDb(Db))
    })

    it.effect("select first with filters", () => {
      class Db extends IndexedDbDatabase.make(
        V1,
        Effect.fn(function*(api) {
          yield* api.createObjectStore("todo")
          yield* api.createIndex("todo", "titleIndex")
          yield* api.createIndex("todo", "countIndex")
          yield* api.from("todo").insertAll([
            { id: 1, title: "test1", count: 1, completed: false },
            { id: 2, title: "test2", count: 2, completed: false },
            { id: 3, title: "test3", count: 3, completed: false }
          ])
        })
      ) {}

      return Effect.gen(function*() {
        const api = yield* Db.getQueryBuilder
        const data = yield* api
          .from("todo")
          .select("titleIndex")
          .equals("test2")
          .first()

        assert.deepStrictEqual(data, {
          id: 2,
          title: "test2",
          count: 2,
          completed: false
        })
      }).pipe(provideDb(Db))
    })
  })

  describe("modify", () => {
    it.effect("insert", () => {
      class Db extends IndexedDbDatabase.make(
        V1,
        Effect.fn(function*(api) {
          yield* api.createObjectStore("todo")
          yield* api.createIndex("todo", "titleIndex")
          yield* api.createIndex("todo", "countIndex")
        })
      ) {}

      return Effect.gen(function*() {
        const api = yield* Db.getQueryBuilder
        const addedKey = yield* api
          .from("todo")
          .insert({ id: 10, title: "insert1", count: 10, completed: true })
        const data = yield* api.from("todo").select()

        assert.equal(addedKey, 10)
        assert.equal(data.length, 1)
        assert.deepStrictEqual(data, [
          { id: 10, title: "insert1", count: 10, completed: true }
        ])
      }).pipe(provideDb(Db))
    })

    it.effect("insert schema with context", () => {
      class Db extends IndexedDbDatabase.make(
        V1,
        Effect.fn(function*(api) {
          yield* api.createObjectStore("user-verify")
        })
      ) {}

      return Effect.gen(function*() {
        const api = yield* Db.getQueryBuilder
        const addedKey = yield* api.from("user-verify").insert({ id: "abc" })
        const data = yield* api.from("user-verify").select()

        assert.equal(addedKey, "abc")
        assert.equal(data.length, 1)
        assert.deepStrictEqual(data, [{ id: "abc" }])
      }).pipe(
        provideDb(Db),
        Effect.provideService(
          VerifyContext,
          VerifyContext.of({ maxLength: 4 })
        )
      )
    })

    it.effect("insert with manual key required", () => {
      class Db extends IndexedDbDatabase.make(
        V1,
        Effect.fn(function*(api) {
          yield* api.createObjectStore("todo")
          yield* api.createObjectStore("user")
          yield* api.createIndex("todo", "titleIndex")
          yield* api.createIndex("todo", "countIndex")
        })
      ) {}

      return Effect.gen(function*() {
        const api = yield* Db.getQueryBuilder
        const createdAt = DateTime.nowUnsafe()
        const addedKey = yield* api.from("user").insert({
          id: 10,
          name: "insert1",
          email: "insert1@example.com",
          createdAt
        })
        const addedAllKeys = yield* api.from("user").insertAll([
          {
            id: 11,
            name: "insert2",
            email: "insert2@example.com",
            createdAt
          },
          {
            id: 12,
            name: "insert3",
            email: "insert3@example.com",
            createdAt
          }
        ])
        const data = yield* api.from("user").select()

        assert.equal(addedKey, 10)
        assert.deepStrictEqual(addedAllKeys, [11, 12])
        assert.equal(data.length, 3)
        assert.deepStrictEqual(data, [
          new User({
            id: 10,
            name: "insert1",
            email: "insert1@example.com",
            createdAt
          }),
          new User({
            id: 11,
            name: "insert2",
            email: "insert2@example.com",
            createdAt
          }),
          new User({
            id: 12,
            name: "insert3",
            email: "insert3@example.com",
            createdAt
          })
        ])
      }).pipe(provideDb(Db))
    })

    it.effect("insert with manual multiple keys required", () => {
      class Db extends IndexedDbDatabase.make(
        V1,
        Effect.fn(function*(api) {
          yield* api.createObjectStore("todo")
          yield* api.createObjectStore("user")
          yield* api.createObjectStore("person")
          yield* api.createIndex("todo", "titleIndex")
          yield* api.createIndex("todo", "countIndex")
        })
      ) {}

      return Effect.gen(function*() {
        const api = yield* Db.getQueryBuilder
        const addedKey = yield* api.from("person").insert({
          firstName: "John",
          lastName: "Doe",
          age: 30
        })
        const data = yield* api.from("person").select()

        assert.deepStrictEqual(addedKey, ["John", "Doe"])
        assert.equal(data.length, 1)
        assert.deepStrictEqual(data, [
          { firstName: "John", lastName: "Doe", age: 30 }
        ])
      }).pipe(provideDb(Db))
    })

    it.effect("insert with manual key optional", () => {
      class Db extends IndexedDbDatabase.make(
        V1,
        Effect.fn(function*(api) {
          yield* api.createObjectStore("todo")
          yield* api.createObjectStore("user")
          yield* api.createObjectStore("product")
          yield* api.createIndex("todo", "titleIndex")
          yield* api.createIndex("todo", "countIndex")
        })
      ) {}

      return Effect.gen(function*() {
        const api = yield* Db.getQueryBuilder
        const addedKey = yield* api.from("product").insert({
          key: 10,
          name: "insert1",
          price: 10
        })
        const data = yield* api.from("product").select()

        assert.equal(addedKey, 10)
        assert.equal(data.length, 1)
        assert.deepStrictEqual(data, [new ProductSchema({ key: 10, name: "insert1", price: 10 })])
      }).pipe(provideDb(Db))
    })

    it.effect("insert with auto-increment", () => {
      class Db extends IndexedDbDatabase.make(
        V1,
        Effect.fn(function*(api) {
          yield* api.createObjectStore("todo")
          yield* api.createObjectStore("user")
          yield* api.createObjectStore("product")
          yield* api.createObjectStore("price")
          yield* api.createIndex("todo", "titleIndex")
          yield* api.createIndex("todo", "countIndex")
        })
      ) {}

      return Effect.gen(function*() {
        const api = yield* Db.getQueryBuilder
        const addedKey = yield* api
          .from("price")
          .insertAll([{ amount: 10 }, { amount: 20, id: 10 }, { amount: 30 }])
        const data = yield* api.from("price").select()

        assert.deepStrictEqual(addedKey, [1, 10, 11])
        assert.equal(data.length, 3)
        assert.deepStrictEqual(data, [
          { id: 1, amount: 10 },
          { id: 10, amount: 20 },
          { id: 11, amount: 30 }
        ])
      }).pipe(provideDb(Db))
    })

    it.effect("insert with auto-increment and get first", () => {
      class Db extends IndexedDbDatabase.make(
        V1,
        Effect.fn(function*(api) {
          yield* api.createObjectStore("todo")
          yield* api.createObjectStore("user")
          yield* api.createObjectStore("product")
          yield* api.createObjectStore("price")
          yield* api.createIndex("todo", "titleIndex")
          yield* api.createIndex("todo", "countIndex")
        })
      ) {}

      return Effect.gen(function*() {
        const api = yield* Db.getQueryBuilder
        const addedKey = yield* api.from("price").insert({ amount: 10 })
        const data = yield* api.from("price").select().first()

        assert.equal(addedKey, 1)
        assert.deepStrictEqual(data, { id: 1, amount: 10 })
      }).pipe(provideDb(Db))
    })

    it.effect(
      "insert with auto-increment schema and different key path",
      () => {
        class Db extends IndexedDbDatabase.make(
          V1,
          Effect.fn(function*(api) {
            yield* api.createObjectStore("product")
          })
        ) {}

        return Effect.gen(function*() {
          const api = yield* Db.getQueryBuilder
          const addedKey = yield* api
            .from("product")
            .insert({ name: "insert1", price: 12, key: 10 })
          const data = yield* api.from("product").select()

          assert.equal(addedKey, 12)
          assert.equal(data.length, 1)
          assert.deepStrictEqual(data, [
            new ProductSchema({ key: 10, name: "insert1", price: 12 })
          ])
        }).pipe(provideDb(Db))
      }
    )

    it.effect("insert in no keypath table with manual key", () => {
      class Db extends IndexedDbDatabase.make(
        V1,
        Effect.fn(function*(api) {
          yield* api.createObjectStore("no-keypath")
        })
      ) {}

      return Effect.gen(function*() {
        const api = yield* Db.getQueryBuilder
        const addedKey = yield* api
          .from("no-keypath")
          .insert({ username: "insert1", index: 12, key: "key" })
        const data = yield* api.from("no-keypath").select()

        assert.equal(addedKey, "key")
        assert.equal(data.length, 1)
        assert.deepStrictEqual(data, [
          { username: "insert1", index: 12, key: "key" }
        ])
      }).pipe(provideDb(Db))
    })

    it.effect("insertAll in no keypath table with manual key", () => {
      class Db extends IndexedDbDatabase.make(
        V1,
        Effect.fn(function*(api) {
          yield* api.createObjectStore("no-keypath")
        })
      ) {}

      return Effect.gen(function*() {
        const api = yield* Db.getQueryBuilder
        const addedKey = yield* api.from("no-keypath").insertAll([
          { username: "insert1", index: 12, key: "key" },
          {
            username: "insert2",
            index: 13,
            key: "key2"
          }
        ])
        const data = yield* api.from("no-keypath").select()

        assert.deepStrictEqual(addedKey, ["key", "key2"])
        assert.equal(data.length, 2)
        assert.deepStrictEqual(data, [
          { username: "insert1", index: 12, key: "key" },
          {
            username: "insert2",
            index: 13,
            key: "key2"
          }
        ])
      }).pipe(provideDb(Db))
    })

    it.effect("insertAll in no keypath table and get first", () => {
      class Db extends IndexedDbDatabase.make(
        V1,
        Effect.fn(function*(api) {
          yield* api.createObjectStore("no-keypath")
        })
      ) {}

      return Effect.gen(function*() {
        const api = yield* Db.getQueryBuilder
        const addedKey = yield* api.from("no-keypath").insertAll([
          { username: "insert1", index: 12, key: "key" },
          {
            username: "insert2",
            index: 13,
            key: "key2"
          }
        ])
        const data = yield* api.from("no-keypath").select().first()

        assert.deepStrictEqual(addedKey, ["key", "key2"])
        assert.deepStrictEqual(data, {
          username: "insert1",
          index: 12,
          key: "key"
        })
      }).pipe(provideDb(Db))
    })

    it.effect("insertAll in no keypath table and get limit", () => {
      class Db extends IndexedDbDatabase.make(
        V1,
        Effect.fn(function*(api) {
          yield* api.createObjectStore("no-keypath")
        })
      ) {}

      return Effect.gen(function*() {
        const api = yield* Db.getQueryBuilder
        const addedKey = yield* api.from("no-keypath").insertAll([
          { username: "insert1", index: 12, key: "key" },
          {
            username: "insert2",
            index: 13,
            key: "key2"
          }
        ])
        const data = yield* api.from("no-keypath").select().limit(1)

        assert.deepStrictEqual(addedKey, ["key", "key2"])
        assert.deepStrictEqual(data, [
          { username: "insert1", index: 12, key: "key" }
        ])
      }).pipe(provideDb(Db))
    })

    it.effect(
      "insertAll in no keypath table with multiple types of keys",
      () => {
        class Db extends IndexedDbDatabase.make(
          V1,
          Effect.fn(function*(api) {
            yield* api.createObjectStore("no-keypath")
          })
        ) {}

        return Effect.gen(function*() {
          const api = yield* Db.getQueryBuilder
          const date = new Date()
          const arrayBuffer = new ArrayBuffer(10)
          const addedKey = yield* api.from("no-keypath").insertAll([
            { username: "insert1", index: 12, key: "key" },
            {
              username: "insert2",
              index: 13,
              key: 14
            },
            {
              username: "insert3",
              index: 14,
              key: date
            },
            {
              username: "insert4",
              index: 15,
              key: arrayBuffer
            },
            {
              username: "insert5",
              index: 16,
              key: [1, "key", date, arrayBuffer]
            }
          ])
          const data = yield* api.from("no-keypath").select()

          // Returned data order not guaranteed
          data.sort((a, b) => a.index - b.index)

          assert.deepStrictEqual(addedKey, [
            "key",
            14,
            date,
            arrayBuffer,
            [1, "key", date, arrayBuffer]
          ])
          assert.deepStrictEqual(data, [
            { username: "insert1", index: 12, key: "key" },
            {
              username: "insert2",
              index: 13,
              key: 14
            },
            { username: "insert3", index: 14, key: date },
            { username: "insert4", index: 15, key: arrayBuffer },
            {
              username: "insert5",
              index: 16,
              key: [1, "key", date, arrayBuffer]
            }
          ])
        }).pipe(provideDb(Db))
      }
    )

    it.effect("upsert", () => {
      class Db extends IndexedDbDatabase.make(
        V1,
        Effect.fn(function*(api) {
          yield* api.createObjectStore("todo")
          yield* api.createIndex("todo", "titleIndex")
          yield* api.createIndex("todo", "countIndex")
          yield* api
            .from("todo")
            .insert({ id: 10, title: "insert1", count: 10, completed: true })
        })
      ) {}

      return Effect.gen(function*() {
        const api = yield* Db.getQueryBuilder
        const addedKey = yield* api
          .from("todo")
          .upsert({ id: 10, title: "update1", count: -10, completed: false })
        const data = yield* api.from("todo").select()

        assert.equal(addedKey, 10)
        assert.equal(data.length, 1)
        assert.deepStrictEqual(data, [
          { id: 10, title: "update1", count: -10, completed: false }
        ])
      }).pipe(provideDb(Db))
    })

    it.effect("delete", () => {
      class Db extends IndexedDbDatabase.make(
        V1,
        Effect.fn(function*(api) {
          yield* api.createObjectStore("todo")
          yield* api.createIndex("todo", "titleIndex")
          yield* api.createIndex("todo", "countIndex")
          yield* api.from("todo").insertAll([
            { id: 10, title: "insert1", count: 10, completed: true },
            { id: 11, title: "insert2", count: 11, completed: true }
          ])
        })
      ) {}

      return Effect.gen(function*() {
        const api = yield* Db.getQueryBuilder
        yield* api.from("todo").delete().equals(10)
        const data = yield* api.from("todo").select()

        assert.equal(data.length, 1)
        assert.deepStrictEqual(data, [
          { id: 11, title: "insert2", count: 11, completed: true }
        ])
      }).pipe(provideDb(Db))
    })

    it.effect("delete with limit", () => {
      class Db extends IndexedDbDatabase.make(
        V1,
        Effect.fn(function*(api) {
          yield* api.createObjectStore("todo")
          yield* api.createIndex("todo", "titleIndex")
          yield* api.createIndex("todo", "countIndex")
          yield* api.from("todo").insertAll([
            { id: 10, title: "insert1", count: 10, completed: true },
            { id: 11, title: "insert2", count: 11, completed: true },
            { id: 12, title: "insert3", count: 12, completed: true }
          ])
        })
      ) {}

      return Effect.gen(function*() {
        const api = yield* Db.getQueryBuilder
        yield* api.from("todo").delete().limit(2)
        const data = yield* api.from("todo").select()

        assert.equal(data.length, 1)
        assert.deepStrictEqual(data, [
          { id: 12, title: "insert3", count: 12, completed: true }
        ])
      }).pipe(provideDb(Db))
    })

    it.effect("clear", () => {
      class Db extends IndexedDbDatabase.make(
        V1,
        Effect.fn(function*(api) {
          yield* api.createObjectStore("todo")
          yield* api.createIndex("todo", "titleIndex")
          yield* api.createIndex("todo", "countIndex")
          yield* api.from("todo").insertAll([
            { id: 10, title: "insert1", count: 10, completed: true },
            { id: 11, title: "insert2", count: 11, completed: true }
          ])
        })
      ) {}

      return Effect.gen(function*() {
        const api = yield* Db.getQueryBuilder
        yield* api.from("todo").clear
        const data = yield* api.from("todo").select()

        assert.equal(data.length, 0)
      }).pipe(provideDb(Db))
    })
  })

  describe("modify all", () => {
    it.effect("insertAll", () => {
      class Db extends IndexedDbDatabase.make(
        V1,
        Effect.fn(function*(api) {
          yield* api.createObjectStore("todo")
          yield* api.createIndex("todo", "titleIndex")
          yield* api.createIndex("todo", "countIndex")
        })
      ) {}

      return Effect.gen(function*() {
        const api = yield* Db.getQueryBuilder
        const addedKeys = yield* api.from("todo").insertAll([
          { id: 10, title: "insert1", count: 10, completed: true },
          { id: 11, title: "insert2", count: 11, completed: true }
        ])
        const data = yield* api.from("todo").select()

        assert.deepStrictEqual(addedKeys, [10, 11])
        assert.equal(data.length, 2)
        assert.deepStrictEqual(data, [
          { id: 10, title: "insert1", count: 10, completed: true },
          { id: 11, title: "insert2", count: 11, completed: true }
        ])
      }).pipe(provideDb(Db))
    })

    it.effect("upsertAll", () => {
      class Db extends IndexedDbDatabase.make(
        V1,
        Effect.fn(function*(api) {
          yield* api.createObjectStore("todo")
          yield* api.createIndex("todo", "titleIndex")
          yield* api.createIndex("todo", "countIndex")
          yield* api.from("todo").insertAll([
            { id: 10, title: "insert1", count: 10, completed: true },
            { id: 11, title: "insert2", count: 11, completed: true }
          ])
        })
      ) {}

      return Effect.gen(function*() {
        const api = yield* Db.getQueryBuilder
        const addedKeys = yield* api.from("todo").upsertAll([
          { id: 10, title: "update1", count: -10, completed: false },
          { id: 11, title: "update2", count: -11, completed: false }
        ])
        const data = yield* api.from("todo").select()

        assert.deepStrictEqual(addedKeys, [10, 11])
        assert.equal(data.length, 2)
        assert.deepStrictEqual(data, [
          { id: 10, title: "update1", count: -10, completed: false },
          { id: 11, title: "update2", count: -11, completed: false }
        ])
      }).pipe(provideDb(Db))
    })

    it.effect("upsertAll withTransaction", () => {
      class Db extends IndexedDbDatabase.make(
        V1,
        Effect.fn(function*(api) {
          yield* api.createObjectStore("todo")
          yield* api.createIndex("todo", "titleIndex")
          yield* api.createIndex("todo", "countIndex")
          yield* api.from("todo").insertAll([
            { id: 10, title: "insert1", count: 10, completed: true },
            { id: 11, title: "insert2", count: 11, completed: true }
          ])
        })
      ) {}

      return Effect.gen(function*() {
        const api = yield* Db.getQueryBuilder
        const addedKeys = yield* api.withTransaction({ tables: ["todo"], mode: "readwrite" })(
          Effect.gen(function*() {
            return yield* api.from("todo").upsertAll([
              { id: 10, title: "update1", count: -10, completed: false },
              { id: 11, title: "update2", count: -11, completed: false }
            ]).invalidate()
          })
        )
        const data = yield* api.from("todo").select()

        assert.deepStrictEqual(addedKeys, [10, 11])
        assert.equal(data.length, 2)
        assert.deepStrictEqual(data, [
          { id: 10, title: "update1", count: -10, completed: false },
          { id: 11, title: "update2", count: -11, completed: false }
        ])
      }).pipe(provideDb(Db))
    })

    it.effect("upsertAll same key", () => {
      class Db extends IndexedDbDatabase.make(
        V1,
        Effect.fn(function*(api) {
          yield* api.createObjectStore("todo")
          yield* api.createIndex("todo", "titleIndex")
          yield* api.createIndex("todo", "countIndex")
          yield* api
            .from("todo")
            .insert({ id: 10, title: "insert1", count: 10, completed: true })
        })
      ) {}

      return Effect.gen(function*() {
        const api = yield* Db.getQueryBuilder
        const addedKeys = yield* api.from("todo").upsertAll([
          { id: 10, title: "update1", count: -10, completed: false },
          { id: 10, title: "update2", count: -11, completed: false }
        ])
        const data = yield* api.from("todo").select()

        assert.deepStrictEqual(addedKeys, [10, 10])
        assert.equal(data.length, 1)
        assert.deepStrictEqual(data, [
          { id: 10, title: "update2", count: -11, completed: false }
        ])
      }).pipe(provideDb(Db))
    })

    it.effect("clearAll", () => {
      class Db extends IndexedDbDatabase.make(
        V1,
        Effect.fn(function*(api) {
          yield* api.createObjectStore("todo")
          yield* api.createIndex("todo", "titleIndex")
          yield* api.createIndex("todo", "countIndex")
          yield* api
            .from("todo")
            .insert({ id: 10, title: "insert1", count: 10, completed: true })
        })
      ) {}

      return Effect.gen(function*() {
        const api = yield* Db.getQueryBuilder
        yield* api.clearAll
        const data = yield* api.from("todo").select()

        assert.equal(data.length, 0)
      }).pipe(provideDb(Db))
    })
  })

  it.effect("count", () => {
    class Db extends IndexedDbDatabase.make(
      V1,
      Effect.fn(function*(api) {
        yield* api.createObjectStore("todo")
        yield* api.createIndex("todo", "titleIndex")
        yield* api.createIndex("todo", "countIndex")
        yield* api.from("todo").insertAll([
          { id: 1, title: "test1", count: 1, completed: false },
          { id: 2, title: "test2", count: 2, completed: false },
          { id: 3, title: "test3", count: 3, completed: false }
        ])
      })
    ) {}

    return Effect.gen(function*() {
      const api = yield* Db.getQueryBuilder
      const data = yield* api.from("todo").count()

      assert.equal(data, 3)
    }).pipe(provideDb(Db))
  })

  it.effect("count with filters", () => {
    class Db extends IndexedDbDatabase.make(
      V1,
      Effect.fn(function*(api) {
        yield* api.createObjectStore("todo")
        yield* api.createIndex("todo", "titleIndex")
        yield* api.createIndex("todo", "countIndex")
        yield* api.from("todo").insertAll([
          { id: 1, title: "test1", count: 1, completed: false },
          { id: 2, title: "test2", count: 2, completed: false },
          { id: 3, title: "test3", count: 3, completed: false }
        ])
      })
    ) {}

    return Effect.gen(function*() {
      const api = yield* Db
      const data = yield* api.from("todo").count("titleIndex").equals("test2")

      assert.equal(data, 1)
    }).pipe(provideDb(Db))
  })

  it.effect("filter", () => {
    class Db extends IndexedDbDatabase.make(
      V1,
      Effect.fn(function*(api) {
        yield* api.createObjectStore("todo")
        yield* api.createIndex("todo", "titleIndex")
        yield* api.createIndex("todo", "countIndex")
        yield* api.from("todo").insertAll([
          { id: 1, title: "test1", count: 1, completed: false },
          { id: 2, title: "test2", count: 2, completed: false },
          { id: 3, title: "test3", count: 3, completed: false }
        ])
      })
    ) {}

    return Effect.gen(function*() {
      const api = yield* Db
      const data = yield* api.from("todo").select().filter((v) => v.count === 2)

      assert.deepStrictEqual(data, [{
        id: 2,
        title: "test2",
        count: 2,
        completed: false
      }])
    }).pipe(provideDb(Db))
  })

  it.effect("stream", () => {
    class Db extends IndexedDbDatabase.make(
      V1,
      Effect.fn(function*(api) {
        yield* api.createObjectStore("todo")
        yield* api.createIndex("todo", "titleIndex")
        yield* api.createIndex("todo", "countIndex")
        yield* api.from("todo").insertAll(
          Array.makeBy(1000, (i) => ({ id: i + 1, title: `test${i}`, count: i, completed: false }))
        )
      })
    ) {}

    return Effect.gen(function*() {
      const api = yield* Db
      const data = yield* api.from("todo").select().stream().pipe(
        Stream.runCollect
      )
      assert.equal(data.length, 1000)

      const data2 = yield* api.from("todo").select().limit(10).stream().pipe(
        Stream.runCollect
      )
      assert.equal(data2.length, 10)
      assert.equal(data2[0].id, 1)

      const data3 = yield* api.from("todo").select().limit(10).offset(50).stream().pipe(
        Stream.runCollect
      )
      assert.equal(data3.length, 10)
      assert.equal(data3[0].id, 51)

      const data4 = yield* api.from("todo").select().limit(3).stream({ chunkSize: 2 }).pipe(
        Stream.runCollect
      )
      assert.deepStrictEqual(data4.map((row) => row.id), [1, 2, 3])
    }).pipe(provideDb(Db))
  })

  it.effect("reactive", () => {
    class Db extends IndexedDbDatabase.make(
      V1,
      Effect.fn(function*(api) {
        yield* api.createObjectStore("todo")
        yield* api.createIndex("todo", "titleIndex")
        yield* api.createIndex("todo", "countIndex")
        yield* api.from("todo").insertAll([
          { id: 1, title: "test1", count: 1, completed: false },
          { id: 2, title: "test2", count: 2, completed: false },
          { id: 3, title: "test3", count: 3, completed: false }
        ])
      })
    ) {}

    return Effect.gen(function*() {
      const api = yield* Db
      const data = yield* api.from("todo").select().reactive().pipe(
        Stream.take(2),
        Stream.runCollect,
        Effect.forkChild({ startImmediately: true })
      )
      yield* api.from("todo").insert({ id: 4, title: "test4", count: 4, completed: false }).invalidate()
      yield* Fiber.join(data)
    }).pipe(provideDb(Db))
  })

  it.effect("compound query", () => {
    class Db extends IndexedDbDatabase.make(
      V1,
      Effect.fn(function*(api) {
        yield* api.createObjectStore("todo")
        yield* api.createIndex("todo", "titleIndex")
        yield* api.createIndex("todo", "countIndex")
        yield* api.createIndex("todo", "titleCount")
        yield* api.from("todo").insertAll([
          { id: 1, title: "test1", count: 1, completed: false },
          { id: 2, title: "test2", count: 2, completed: false },
          { id: 3, title: "test2", count: 3, completed: false },
          { id: 4, title: "test3", count: 4, completed: false }
        ])
      })
    ) {}

    return Effect.gen(function*() {
      const api = yield* Db
      const data = yield* api.from("todo").select("titleCount").between(["test2"], ["test2", []])
      assert.deepStrictEqual(data, [
        { id: 2, title: "test2", count: 2, completed: false },
        { id: 3, title: "test2", count: 3, completed: false }
      ])

      const data2 = yield* api.from("todo").select("titleCount").equals(["test2", 3]).first()
      assert.deepStrictEqual(data2, { id: 3, title: "test2", count: 3, completed: false })
    }).pipe(provideDb(Db))
  })

  it.effect("rolls back withTransaction writes when the effect fails", () => {
    class Db extends IndexedDbDatabase.make(V1, (api) => api.createObjectStore("todo")) {}

    return Effect.gen(function*() {
      const api = yield* Db
      yield* Effect.result(
        api.withTransaction({ tables: ["todo"], mode: "readwrite" })(
          Effect.andThen(
            api.from("todo").insert({ id: 1, title: "committed", count: 1, completed: false }),
            Effect.fail("rollback")
          )
        )
      )

      assert.deepStrictEqual(yield* api.from("todo").select(), [])
    }).pipe(provideDb(Db))
  })

  it.effect("applies reverse before a select limit", () => {
    class Db extends IndexedDbDatabase.make(
      V1,
      Effect.fn(function*(api) {
        yield* api.createObjectStore("todo")
        yield* api.from("todo").insertAll([
          { id: 1, title: "one", count: 1, completed: false },
          { id: 2, title: "two", count: 2, completed: false },
          { id: 3, title: "three", count: 3, completed: false }
        ])
      })
    ) {}

    return Effect.gen(function*() {
      const api = yield* Db
      const rows = yield* api.from("todo").select().reverse().limit(2)
      assert.deepStrictEqual(rows.map((row) => row.id), [3, 2])
    }).pipe(provideDb(Db))
  })

  it.effect("honors an indexed range when delete has a limit", () => {
    class Db extends IndexedDbDatabase.make(
      V1,
      Effect.fn(function*(api) {
        yield* api.createObjectStore("todo")
        yield* api.createIndex("todo", "titleIndex")
        yield* api.from("todo").insertAll([
          { id: 1, title: "keep", count: 1, completed: false },
          { id: 2, title: "delete", count: 2, completed: false }
        ])
      })
    ) {}

    return Effect.gen(function*() {
      const api = yield* Db
      yield* api.from("todo").delete("titleIndex").equals("delete").limit(1)
      const rows = yield* api.from("todo").select()
      assert.deepStrictEqual(rows.map((row) => row.id), [1])
    }).pipe(provideDb(Db))
  })

  it.effect("can consume the same paged select stream twice", () => {
    class Db extends IndexedDbDatabase.make(
      V1,
      Effect.fn(function*(api) {
        yield* api.createObjectStore("todo")
        yield* api.from("todo").insertAll([
          { id: 1, title: "one", count: 1, completed: false },
          { id: 2, title: "two", count: 2, completed: false },
          { id: 3, title: "three", count: 3, completed: false }
        ])
      })
    ) {}

    return Effect.gen(function*() {
      const api = yield* Db
      const stream = api.from("todo").select().stream({ chunkSize: 2 })
      const first = yield* Stream.runCollect(stream)
      const second = yield* Stream.runCollect(stream)
      assert.deepStrictEqual(second.map((row) => row.id), first.map((row) => row.id))
    }).pipe(provideDb(Db))
  })

  it.effect("reports NoSuchElementError for an empty ranged first query", () => {
    class Db extends IndexedDbDatabase.make(V1, (api) => api.createObjectStore("todo")) {}

    return Effect.gen(function*() {
      const api = yield* Db
      const error = yield* Effect.flip(api.from("todo").select().equals(1).first())
      assert.instanceOf(error, Cause.NoSuchElementError)
    }).pipe(provideDb(Db))
  })
})
