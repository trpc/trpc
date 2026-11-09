/**
 * @title Context.Service
 *
 * The default way to define a service is to extend `Context.Service`,
 * passing in the service interface as a type parameter.
 */

// file: src/db/Database.ts
import { Context, Effect, Layer, Schema } from "effect"

// Pass in the service class name as the first type parameter, and the service
// interface as the second type parameter.
export class Database extends Context.Service<Database, {
  query(sql: string): Effect.Effect<Array<unknown>, DatabaseError>
}>()(
  // The string identifier for the service, which should include the package
  // name and the subdirectory path to the service file.
  "myapp/db/Database"
) {
  // Attach a static layer to the service, which will be used to provide an
  // implementation of the service.
  static readonly layer = Layer.effect(
    Database,
    Effect.gen(function*() {
      // Define the service methods using Effect.fn
      const query = Effect.fn("Database.query")(function*(sql: string) {
        yield* Effect.log("Executing SQL query:", sql)
        return [{ id: 1, name: "Alice" }, { id: 2, name: "Bob" }]
      })

      // Return an instance of the service using Database.of, passing in an
      // object that implements the service interface.
      return Database.of({
        query
      })
    })
  )
}

export class DatabaseError extends Schema.TaggedError<DatabaseError>()("DatabaseError", {
  cause: Schema.Defect()
}) {}

// If you ever need to access the service type, use `Database["Service"]`
export type DatabaseService = Database["Service"]
