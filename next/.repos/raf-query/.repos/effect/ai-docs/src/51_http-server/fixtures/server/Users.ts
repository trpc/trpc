import { SqliteClient, SqliteMigrator } from "@effect/sql-sqlite-node"
import { Context, Effect, Layer, Schema } from "effect"
import { SqlClient, SqlModel, SqlSchema } from "effect/sql"
import { User } from "../domain/User.ts"
import type { UserId } from "../domain/User.ts"
import { SearchQueryTooShort, UserNotFound, UsersError } from "../domain/UserErrors.ts"

// The SqlClient layer determines which database the SQL implementation talks
// to. Swap it for another driver package to target a different database.
const SqlLayer = SqliteClient.layer({ filename: ":memory:" })

// Migrations are effects keyed by `<id>_<name>` that run once, in id order. A
// real application would keep each migration in its own file and load them
// with `SqliteMigrator.fromFileSystem` instead of an inline record.
const MigratorLayer = SqliteMigrator.layer({
  loader: SqliteMigrator.fromRecord({
    "0001_create_users": Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      yield* sql`
        CREATE TABLE users (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT NOT NULL,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL
        )
      `
    })
  })
})

export class Users extends Context.Service<Users, {
  list(search: string | undefined): Effect.Effect<Array<User>, UsersError>
  getById(id: UserId): Effect.Effect<User, UsersError>
  create(input: typeof User.jsonCreate.Type): Effect.Effect<User, UsersError>
  update(id: UserId, input: typeof User.jsonUpdate.Type): Effect.Effect<User, UsersError>
}>()("acme/Users") {
  // The SQL implementation only requires a `SqlClient`, so entrypoints and
  // tests decide how the database is provided.
  static readonly layerNoDeps = Layer.effect(
    Users,
    Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient

      // CRUD goes through a repository derived from the `User` model. Each
      // operation uses the matching model variant to encode its input and
      // decodes rows with the full model schema.
      const repo = yield* SqlModel.makeRepository(User, {
        tableName: "users",
        spanPrefix: "Users",
        idColumn: "id"
      })

      // Queries the repository does not cover are written with the `sql` tag
      // and decoded with the model schema.
      const listAll = SqlSchema.findAll({
        Request: Schema.Void,
        Result: User,
        execute: () => sql`SELECT * FROM users ORDER BY createdAt`
      })

      const searchUsers = SqlSchema.findAll({
        Request: Schema.String,
        Result: User,
        execute: (search) => {
          const pattern = `%${search}%`
          return sql`SELECT * FROM users WHERE name LIKE ${pattern} OR email LIKE ${pattern}`
        }
      })

      const list = Effect.fn("Users.list")(function*(search: string | undefined) {
        if (search === undefined || search.length === 0) {
          return yield* Effect.orDie(listAll())
        } else if (search.length < SearchQueryTooShort.minimumLength) {
          return yield* new UsersError({
            reason: new SearchQueryTooShort()
          })
        }
        yield* Effect.annotateCurrentSpan({ search })
        return yield* Effect.orDie(searchUsers(search))
      })

      const getById = Effect.fn("Users.getById")((id: UserId) =>
        repo.findById(id).pipe(
          Effect.catchTags({
            NoSuchElementError: () => new UsersError({ reason: new UserNotFound() }),
            // Database and encoding failures are unexpected, so treat them as
            // defects to keep the service interface focused on domain errors.
            SchemaError: Effect.die,
            SqlError: Effect.die
          })
        )
      )

      const create = Effect.fn("Users.create")((input: typeof User.jsonCreate.Type) =>
        // `User.insert.makeEffect` fills in the generated id and timestamps
        // using the Effect clock, so tests can control them with `TestClock`.
        User.insert.makeEffect(input).pipe(
          Effect.flatMap(repo.insert),
          Effect.orDie
        )
      )

      const update = Effect.fn("Users.update")(function*(id: UserId, input: typeof User.jsonUpdate.Type) {
        // Ensure the user exists first, so a missing id fails with the domain
        // error instead of a defect.
        yield* getById(id)
        const update = yield* User.update.makeEffect({ id, ...input }).pipe(Effect.orDie)
        return yield* repo.update(update).pipe(Effect.orDie)
      })

      return Users.of({ list, getById, create, update })
    })
  )

  // The fully provided SQL implementation: the database client and migrations
  // are implementation details, so this layer requires nothing.
  static readonly layer: Layer.Layer<Users> = this.layerNoDeps.pipe(
    Layer.provide(MigratorLayer.pipe(Layer.provideMerge(SqlLayer))),
    Layer.orDie
  )

  // An in-memory implementation for tests, so the HTTP stack can be exercised
  // without a database.
  static readonly layerMemory = Layer.effect(
    Users,
    Effect.gen(function*() {
      const users = new Map<UserId, User>()

      const makeUser = (input: typeof User.jsonCreate.Type) =>
        User.insert.makeEffect(input).pipe(
          Effect.map((user) => new User(user)),
          Effect.orDie
        )

      const admin = yield* makeUser({ name: "Admin", email: "admin@acme.dev" })
      users.set(admin.id, admin)

      const list = Effect.fn("Users.list")(function*(search: string | undefined) {
        const allUsers = Array.from(users.values())
        if (search === undefined || search.length === 0) {
          return allUsers
        } else if (search.length < SearchQueryTooShort.minimumLength) {
          return yield* new UsersError({
            reason: new SearchQueryTooShort()
          })
        }
        yield* Effect.annotateCurrentSpan({ search })
        const normalized = search.toLowerCase()
        return allUsers.filter((user) =>
          user.name.toLowerCase().includes(normalized) || user.email.toLowerCase().includes(normalized)
        )
      })

      const getById = Effect.fn("Users.getById")(function*(id: UserId) {
        yield* Effect.annotateCurrentSpan({ id })
        const user = users.get(id)
        if (user === undefined) {
          return yield* new UsersError({
            reason: new UserNotFound()
          })
        }
        return user
      })

      const create = Effect.fn("Users.create")(function*(input: typeof User.jsonCreate.Type) {
        const user = yield* makeUser(input)
        users.set(user.id, user)
        return user
      })

      const update = Effect.fn("Users.update")(function*(id: UserId, input: typeof User.jsonUpdate.Type) {
        const existing = yield* getById(id)
        const update = yield* User.update.makeEffect({ id, ...input }).pipe(Effect.orDie)
        const updated = new User({ ...existing, ...update })
        users.set(id, updated)
        return updated
      })

      return Users.of({ list, getById, create, update })
    })
  )
}
