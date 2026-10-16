import { Schema } from "effect"

export class UserNotFound extends Schema.TaggedError<UserNotFound>()(
  "UserNotFound",
  {},
  // You can specify the status code for this error inline
  { httpApiStatus: 404 }
) {}

export class SearchQueryTooShort
  extends Schema.TaggedError<SearchQueryTooShort>()("SearchQueryTooShort", {}, { httpApiStatus: 422 })
{
  static readonly minimumLength = 2
}

// Create a wrapper error class for all errors in the Users API.
//
// This prevents adding too many error types to services / endpoint definitions.
//
export class UsersError extends Schema.TaggedError<UsersError>()("UsersError", {
  reason: Schema.Union([UserNotFound, SearchQueryTooShort])
}) {}
