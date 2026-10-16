import {
  AuthenticationError,
  AuthorizationError,
  ConnectionError,
  ConstraintError,
  DeadlockError,
  LockTimeoutError,
  SerializationError,
  SqlError,
  type SqlErrorReason,
  SqlSyntaxError,
  StatementTimeoutError,
  UniqueViolation,
  UnknownError
} from "effect/sql/SqlError"

interface ErrorProps {
  readonly cause: unknown
  readonly message: string
  readonly operation: string
}

const channelNameEncoder = new TextEncoder()

export const validateChannelName = (channel: string, operation: string): SqlError | undefined => {
  if (channelNameEncoder.encode(channel).byteLength <= 63) return undefined
  const message = "PostgreSQL channel names must not exceed 63 UTF-8 bytes"
  return new SqlError({ reason: new UnknownError({ cause: new Error(message), message, operation }) })
}

const normalizeConstraint = (constraint: unknown): string => {
  if (typeof constraint !== "string") return "unknown"
  const normalized = constraint.trim()
  return normalized.length === 0 ? "unknown" : normalized
}

export const classifySqlState = (
  code: string | undefined,
  constraint: unknown,
  props: ErrorProps
): SqlErrorReason => {
  if (code !== undefined) {
    if (code.startsWith("08")) {
      return new ConnectionError(props)
    }
    if (code.startsWith("28")) {
      return new AuthenticationError(props)
    }
    if (code === "42501") {
      return new AuthorizationError(props)
    }
    if (code.startsWith("42")) {
      return new SqlSyntaxError(props)
    }
    if (code === "23505") {
      return new UniqueViolation({ ...props, constraint: normalizeConstraint(constraint) })
    }
    if (code.startsWith("23")) {
      return new ConstraintError(props)
    }
    if (code === "40P01") {
      return new DeadlockError(props)
    }
    if (code === "40001") {
      return new SerializationError(props)
    }
    if (code === "55P03") {
      return new LockTimeoutError(props)
    }
    if (code === "57014") {
      return new StatementTimeoutError(props)
    }
  }
  return new UnknownError(props)
}
