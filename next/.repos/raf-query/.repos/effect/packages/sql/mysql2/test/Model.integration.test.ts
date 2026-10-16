import { assert, it } from "@effect/vitest"
import { Cause, Effect, Schema } from "effect"
import { Model } from "effect/schema"
import { SqlClient, SqlModel, SqlResolver } from "effect/sql"
import { MysqlContainer } from "./utils.ts"

class User extends Model.Class<User>("User")({
  id: Schema.Int.pipe(
    Model.FieldExcept(["insert"])
  ),
  name: Schema.String,
  age: Schema.Int
}) {}

class SoftDeleteUser extends Model.Class<SoftDeleteUser>("SoftDeleteUser")({
  id: Schema.Int.pipe(
    Model.FieldExcept(["insert"])
  ),
  name: Schema.String,
  deletedAt: Schema.NullOr(Schema.String).pipe(
    Model.FieldOnly(["select", "update"])
  )
}) {}

it.layer(MysqlContainer.layer, { timeout: "90 seconds", excludeTestServices: true })("SqlModel", (it) => {
  it.effect("insert returns result", () =>
    Effect.gen(function*() {
      const repo = yield* SqlModel.makeRepository(User, {
        tableName: "users_insert",
        idColumn: "id",
        spanPrefix: "UserRepository"
      })
      const sql = yield* SqlClient.SqlClient
      yield* sql`CREATE TABLE users_insert (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255), age INT)`

      const result = yield* repo.insert(User.insert.make({ name: "Alice", age: 30 }))
      assert.deepStrictEqual(result, new User({ id: 1, name: "Alice", age: 30 }))
    }).pipe(
      Effect.provide(MysqlContainer.client)
    ), { timeout: 60_000 })

  it.effect("insert returns result with transforms", () =>
    Effect.gen(function*() {
      const repo = yield* SqlModel.makeRepository(User, {
        tableName: "users_insert_transforms",
        idColumn: "id",
        spanPrefix: "UserRepository"
      })
      const sql = yield* SqlClient.SqlClient
      yield* sql`CREATE TABLE users_insert_transforms (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255), age INT)`

      const result = yield* repo.insert(User.insert.make({ name: "Alice", age: 30 }))
      assert.deepStrictEqual(result, new User({ id: 1, name: "Alice", age: 30 }))
    }).pipe(
      Effect.provide(MysqlContainer.clientWithTransforms)
    ), { timeout: 60_000 })

  it.effect("insertVoid", () =>
    Effect.gen(function*() {
      const repo = yield* SqlModel.makeRepository(User, {
        tableName: "users_insert_void",
        idColumn: "id",
        spanPrefix: "UserRepository"
      })
      const sql = yield* SqlClient.SqlClient
      yield* sql`CREATE TABLE users_insert_void (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255), age INT)`

      const result = yield* repo.insertVoid(User.insert.make({ name: "Alice", age: 30 }))
      assert.strictEqual(result, void 0)
    }).pipe(
      Effect.provide(MysqlContainer.client)
    ), { timeout: 60_000 })

  it.effect("insert data loader returns result", () =>
    Effect.gen(function*() {
      const repo = yield* SqlModel.makeResolvers(User, {
        tableName: "users_insert_loader",
        idColumn: "id",
        spanPrefix: "UserRepository"
      })
      const sql = yield* SqlClient.SqlClient
      yield* sql`CREATE TABLE users_insert_loader (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255), age INT)`

      const [alice, john] = yield* Effect.all([
        SqlResolver.request(User.insert.make({ name: "Alice", age: 30 }), repo.insert),
        SqlResolver.request(User.insert.make({ name: "John", age: 30 }), repo.insert)
      ], { concurrency: "unbounded" })
      assert.deepStrictEqual(alice.name, "Alice")
      assert.deepStrictEqual(john.name, "John")
    }).pipe(
      Effect.provide(MysqlContainer.client)
    ), { timeout: 60_000 })

  it.effect("findById data loader", () =>
    Effect.gen(function*() {
      const repo = yield* SqlModel.makeResolvers(User, {
        tableName: "users_find_loader",
        idColumn: "id",
        spanPrefix: "UserRepository"
      })
      const sql = yield* SqlClient.SqlClient
      yield* sql`CREATE TABLE users_find_loader (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255), age INT)`
      const alice = yield* SqlResolver.request(User.insert.make({ name: "Alice", age: 30 }), repo.insert)
      const john = yield* SqlResolver.request(User.insert.make({ name: "John", age: 30 }), repo.insert)

      const [alice2, john2] = yield* Effect.all([
        SqlResolver.request(alice.id, repo.findById),
        SqlResolver.request(john.id, repo.findById)
      ], { concurrency: "unbounded" })

      assert.deepStrictEqual(alice2.name, "Alice")
      assert.deepStrictEqual(john2.name, "John")
    }).pipe(
      Effect.provide(MysqlContainer.client)
    ), { timeout: 60_000 })

  it.effect("findById ignores soft deleted rows", () =>
    Effect.gen(function*() {
      const repo = yield* SqlModel.makeRepository(SoftDeleteUser, {
        tableName: "soft_delete_users",
        idColumn: "id",
        spanPrefix: "SoftDeleteUserRepository",
        softDeleteColumn: "deletedAt"
      })
      const sql = yield* SqlClient.SqlClient
      yield* sql`CREATE TABLE soft_delete_users (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255), deletedAt VARCHAR(255) NULL)`

      const alice = yield* repo.insert(SoftDeleteUser.insert.make({ name: "Alice" }))
      const bob = yield* repo.insert(SoftDeleteUser.insert.make({ name: "Bob" }))
      yield* sql`UPDATE soft_delete_users SET deletedAt = CURRENT_TIMESTAMP WHERE id = ${bob.id}`

      const aliceResult = yield* repo.findById(alice.id)
      assert.deepStrictEqual(aliceResult, new SoftDeleteUser({ id: alice.id, name: "Alice", deletedAt: null }))

      const error = yield* Effect.flip(repo.findById(bob.id))
      assert.isTrue(Cause.isNoSuchElementError(error))

      yield* repo.delete(alice.id)
      const rows = yield* sql<
        { deletedAt: string | null }
      >`SELECT deletedAt FROM soft_delete_users WHERE id = ${alice.id}`
      assert.strictEqual(rows.length, 1)
      assert.isNotNull(rows[0]!.deletedAt)

      const deletedError = yield* Effect.flip(repo.findById(alice.id))
      assert.isTrue(Cause.isNoSuchElementError(deletedError))
    }).pipe(
      Effect.provide(MysqlContainer.client)
    ), { timeout: 60_000 })

  it.effect("findById data loader ignores soft deleted rows", () =>
    Effect.gen(function*() {
      const repo = yield* SqlModel.makeResolvers(SoftDeleteUser, {
        tableName: "soft_delete_user_resolvers",
        idColumn: "id",
        spanPrefix: "SoftDeleteUserRepository",
        softDeleteColumn: "deletedAt"
      })
      const sql = yield* SqlClient.SqlClient
      yield* sql`CREATE TABLE soft_delete_user_resolvers (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255), deletedAt VARCHAR(255) NULL)`

      const alice = yield* SqlResolver.request(SoftDeleteUser.insert.make({ name: "Alice" }), repo.insert)
      const bob = yield* SqlResolver.request(SoftDeleteUser.insert.make({ name: "Bob" }), repo.insert)
      yield* sql`UPDATE soft_delete_user_resolvers SET deletedAt = CURRENT_TIMESTAMP WHERE id = ${bob.id}`

      const aliceResult = yield* SqlResolver.request(alice.id, repo.findById)
      assert.deepStrictEqual(aliceResult, new SoftDeleteUser({ id: alice.id, name: "Alice", deletedAt: null }))

      const error = yield* Effect.flip(SqlResolver.request(bob.id, repo.findById))
      assert.isTrue(Cause.isNoSuchElementError(error))

      yield* SqlResolver.request(alice.id, repo.delete)
      const rows = yield* sql<
        { deletedAt: string | null }
      >`SELECT deletedAt FROM soft_delete_user_resolvers WHERE id = ${alice.id}`
      assert.strictEqual(rows.length, 1)
      assert.isNotNull(rows[0]!.deletedAt)

      const deletedError = yield* Effect.flip(SqlResolver.request(alice.id, repo.findById))
      assert.isTrue(Cause.isNoSuchElementError(deletedError))
    }).pipe(
      Effect.provide(MysqlContainer.client)
    ), { timeout: 60_000 })

  it.effect("update returns result", () =>
    Effect.gen(function*() {
      const repo = yield* SqlModel.makeRepository(User, {
        tableName: "users_update",
        idColumn: "id",
        spanPrefix: "UserRepository"
      })
      const sql = yield* SqlClient.SqlClient
      yield* sql`CREATE TABLE users_update (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255), age INT)`

      let result = yield* repo.insert(User.insert.make({ name: "Alice", age: 30 }))
      result = yield* repo.update(User.update.make({ ...result, name: "Bob" }))
      assert.deepStrictEqual(result, new User({ id: 1, name: "Bob", age: 30 }))
    }).pipe(
      Effect.provide(MysqlContainer.client)
    ), { timeout: 60_000 })

  it.effect("update returns result with transforms", () =>
    Effect.gen(function*() {
      const repo = yield* SqlModel.makeRepository(User, {
        tableName: "users_update_transforms",
        idColumn: "id",
        spanPrefix: "UserRepository"
      })
      const sql = yield* SqlClient.SqlClient
      yield* sql`CREATE TABLE users_update_transforms (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255), age INT)`

      let result = yield* repo.insert(User.insert.make({ name: "Alice", age: 30 }))
      result = yield* repo.update(User.update.make({ ...result, name: "Bob" }))
      assert.deepStrictEqual(result, new User({ id: 1, name: "Bob", age: 30 }))
    }).pipe(
      Effect.provide(MysqlContainer.clientWithTransforms)
    ), { timeout: 60_000 })
})
