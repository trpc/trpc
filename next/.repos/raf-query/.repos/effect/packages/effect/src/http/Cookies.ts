/**
 * Models HTTP cookies and cookie collections for requests and responses.
 *
 * A `Cookie` stores a name, value, encoded value, and standard cookie
 * attributes. A `Cookies` value is an immutable collection keyed by cookie
 * name. This module parses request `Cookie` headers, builds response
 * `Set-Cookie` headers, and provides helpers for adding, removing, merging, and
 * expiring cookies.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Data from "../Data.ts"
import * as Duration from "../Duration.ts"
import { dual } from "../Function.ts"
import * as Inspectable from "../Inspectable.ts"
import * as InternalRecord from "../internal/record.ts"
import * as Option from "../Option.ts"
import { type Pipeable, pipeArguments } from "../Pipeable.ts"
import * as Predicate from "../Predicate.ts"
import * as Record from "../Record.ts"
import * as Result from "../Result.ts"
import type * as Types from "../Types.ts"

const TypeId = "~effect/http/Cookies"

/**
 * Returns `true` when a value is a `Cookies` collection.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isCookies = (u: unknown): u is Cookies => Predicate.hasProperty(u, TypeId)

/**
 * Immutable collection of HTTP cookies keyed by cookie name.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Cookies extends Pipeable, Inspectable.Inspectable {
  readonly [TypeId]: typeof TypeId
  readonly cookies: Record.ReadonlyRecord<string, Cookie>
}

const CookieTypeId = "~effect/http/Cookies/Cookie"

/**
 * HTTP cookie value with its decoded value, encoded value, and optional cookie
 * attributes such as domain, path, expiration, security, and same-site settings.
 *
 * @stability unstable
 * @category cookies
 * @since 4.0.0
 */
export interface Cookie extends Inspectable.Inspectable {
  readonly [CookieTypeId]: typeof CookieTypeId
  readonly name: string
  readonly value: string
  readonly valueEncoded: string
  readonly options?: {
    readonly domain?: string | undefined
    readonly expires?: Date | undefined
    readonly maxAge?: Duration.Input | undefined
    readonly path?: string | undefined
    readonly priority?: "low" | "medium" | "high" | undefined
    readonly httpOnly?: boolean | undefined
    readonly secure?: boolean | undefined
    readonly partitioned?: boolean | undefined
    readonly sameSite?: "lax" | "strict" | "none" | undefined
  } | undefined
}

/**
 * Returns `true` when a value is a `Cookie`.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isCookie = (u: unknown): u is Cookie => Predicate.hasProperty(u, CookieTypeId)

const CookieErrorTypeId = "~effect/http/Cookies/CookieError"

/**
 * Error reason describing why cookie construction failed, such as invalid name,
 * value, domain, path, or infinite max-age.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class CookiesErrorReason extends Data.Error<{
  readonly _tag:
    | "InvalidCookieName"
    | "InvalidCookieValue"
    | "InvalidCookieDomain"
    | "InvalidCookiePath"
    | "CookieInfinityMaxAge"
  readonly cause?: unknown
}> {}

/**
 * Error returned when a cookie name, value, domain, path, or max-age option is invalid.
 *
 * **Details**
 *
 * Inspect `reason` to determine the specific validation failure.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class CookiesError extends Data.TaggedError("CookiesError")<{
  readonly reason: CookiesErrorReason
}> {
  /**
   * Creates a cookie error from a reason tag and optional cause.
   *
   * @stability unstable
   * @since 4.0.0
   */
  static fromReason(reason: CookiesError["reason"]["_tag"], cause?: unknown): CookiesError {
    return new CookiesError({ reason: new CookiesErrorReason({ _tag: reason, cause }) })
  }

  /**
   * Marks this value as a cookie validation error for runtime guards.
   *
   * @stability unstable
   * @since 4.0.0
   */
  readonly [CookieErrorTypeId] = CookieErrorTypeId

  /**
   * Uses the concrete cookie error reason as the public message.
   *
   * @stability unstable
   * @since 4.0.0
   */
  override get message() {
    return this.reason._tag
  }
}

/**
 * Checks whether a value is a `CookiesError`.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isCookiesError = (u: unknown): u is CookiesError => Predicate.hasProperty(u, CookieErrorTypeId)

const Proto: Omit<Cookies, "cookies"> = {
  [TypeId]: TypeId,
  ...Inspectable.BaseProto,
  toJSON(this: Cookies) {
    return {
      _id: "effect/Cookies",
      cookies: Record.map(this.cookies, (cookie) => cookie.toJSON())
    }
  },
  pipe() {
    return pipeArguments(this, arguments)
  }
}

/**
 * Creates a `Cookies` collection from an existing readonly record of cookies keyed by cookie name.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const fromReadonlyRecord = (cookies: Record.ReadonlyRecord<string, Cookie>): Cookies => {
  const self = Object.create(Proto)
  self.cookies = cookies
  return self
}

/**
 * Create a Cookies object from an Iterable
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const fromIterable = (cookies: Iterable<Cookie>): Cookies => {
  const record: Record<string, Cookie> = {}
  for (const cookie of cookies) {
    InternalRecord.assignProperty(record, cookie.name, cookie)
  }
  return fromReadonlyRecord(record)
}

/**
 * Create a Cookies object from a set of Set-Cookie headers
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const fromSetCookie = (headers: Iterable<string> | string): Cookies => {
  const arrayHeaders = typeof headers === "string" ? [headers] : headers
  const cookies: Array<Cookie> = []
  for (const header of arrayHeaders) {
    const cookie = parseSetCookie(header.trim())
    if (cookie) {
      cookies.push(cookie)
    }
  }

  return fromIterable(cookies)
}

function parseSetCookie(header: string): Cookie | undefined {
  const parts = header.split(";").map((_) => _.trim()).filter((_) => _ !== "")
  if (parts.length === 0) {
    return undefined
  }

  const firstEqual = parts[0].indexOf("=")
  if (firstEqual === -1) {
    return undefined
  }
  const name = parts[0].slice(0, firstEqual)
  if (!cookieNameRegExp.test(name)) {
    return undefined
  }

  const valueEncoded = parts[0].slice(firstEqual + 1)
  const value = tryDecodeURIComponent(valueEncoded)

  if (parts.length === 1) {
    return Object.assign(Object.create(CookieProto), {
      name,
      value,
      valueEncoded
    })
  }

  const options: Types.Mutable<Cookie["options"]> = {}

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i]
    const equalIndex = part.indexOf("=")
    const key = equalIndex === -1 ? part : part.slice(0, equalIndex).trim()
    const value = equalIndex === -1 ? undefined : part.slice(equalIndex + 1).trim()

    switch (key.toLowerCase()) {
      case "domain": {
        if (value === undefined) {
          break
        }
        const domain = value.trim().replace(/^\./, "")
        if (domain) {
          options.domain = domain
        }
        break
      }
      case "expires": {
        if (value === undefined) {
          break
        }
        const date = new Date(value)
        if (!isNaN(date.getTime())) {
          options.expires = date
        }
        break
      }
      case "max-age": {
        if (value === undefined) {
          break
        }
        const maxAge = parseInt(value, 10)
        if (!isNaN(maxAge)) {
          options.maxAge = Duration.seconds(maxAge)
        }
        break
      }
      case "path": {
        if (value === undefined) {
          break
        }
        if (value[0] === "/") {
          options.path = value
        }
        break
      }
      case "priority": {
        if (value === undefined) {
          break
        }
        switch (value.toLowerCase()) {
          case "low":
            options.priority = "low"
            break
          case "medium":
            options.priority = "medium"
            break
          case "high":
            options.priority = "high"
            break
        }
        break
      }
      case "httponly": {
        options.httpOnly = true
        break
      }
      case "secure": {
        options.secure = true
        break
      }
      case "partitioned": {
        options.partitioned = true
        break
      }
      case "samesite": {
        if (value === undefined) {
          break
        }
        switch (value.toLowerCase()) {
          case "lax":
            options.sameSite = "lax"
            break
          case "strict":
            options.sameSite = "strict"
            break
          case "none":
            options.sameSite = "none"
            break
        }
        break
      }
    }
  }

  return Object.assign(Object.create(CookieProto), {
    name,
    value,
    valueEncoded,
    options: Object.keys(options).length > 0 ? options : undefined
  })
}

/**
 * An empty Cookies object
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const empty: Cookies = fromIterable([])

/**
 * Returns `true` when the `Cookies` collection contains no cookies.
 *
 * @stability unstable
 * @category predicates
 * @since 4.0.0
 */
export const isEmpty = (self: Cookies): boolean => Record.isEmptyRecord(self.cookies)

// oxlint-disable-next-line no-control-regex
const fieldContentRegExp = /^[\u0009\u0020-\u007e\u0080-\u00ff]+$/
const cookieNameRegExp = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/
// oxlint-disable-next-line no-control-regex
const cookieDomainRegExp = /^[\u0009\u0020-\u003a\u003c-\u007e\u0080-\u00ff]+$/
const cookiePathRegExp = /^[\u0020-\u003a\u003c-\u007e]+$/

const CookieProto = {
  [CookieTypeId]: CookieTypeId,
  ...Inspectable.BaseProto,
  toJSON(this: Cookie) {
    return {
      _id: "effect/Cookies/Cookie",
      name: this.name,
      value: this.value,
      options: this.options
    }
  }
}

/**
 * Creates a cookie, validating the name, encoded value, domain, path, and finite `maxAge`.
 *
 * **Details**
 *
 * Returns a `CookiesError` in the `Result` failure channel when validation fails.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export function makeCookie(
  name: string,
  value: string,
  options?: Cookie["options"] | undefined
): Result.Result<Cookie, CookiesError> {
  const encodedValue = encodeURIComponent(value)
  const error = validateCookie(name, encodedValue, options)
  if (error !== undefined) {
    return Result.fail(error)
  }

  return Result.succeed(Object.assign(Object.create(CookieProto), {
    name,
    value,
    valueEncoded: encodedValue,
    options
  }))
}

function validateCookie(
  name: string,
  encodedValue: string,
  options: Cookie["options"] | undefined
): CookiesError | undefined {
  if (!cookieNameRegExp.test(name)) {
    return CookiesError.fromReason("InvalidCookieName")
  }
  if (encodedValue && !fieldContentRegExp.test(encodedValue)) {
    return CookiesError.fromReason("InvalidCookieValue")
  }
  if (options?.domain !== undefined && !cookieDomainRegExp.test(options.domain)) {
    return CookiesError.fromReason("InvalidCookieDomain")
  }
  if (options?.path !== undefined && !cookiePathRegExp.test(options.path)) {
    return CookiesError.fromReason("InvalidCookiePath")
  }
  if (options?.maxAge !== undefined && !Duration.isFinite(Duration.fromInputUnsafe(options.maxAge))) {
    return CookiesError.fromReason("CookieInfinityMaxAge")
  }
}

/**
 * Create a new cookie, throwing an error if invalid
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const makeCookieUnsafe = (
  name: string,
  value: string,
  options?: Cookie["options"] | undefined
): Cookie => Result.getOrThrow(makeCookie(name, value, options))

/**
 * Adds a cookie to a Cookies object
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const setCookie: {
  (cookie: Cookie): (self: Cookies) => Cookies
  (self: Cookies, cookie: Cookie): Cookies
} = dual(
  2,
  (self: Cookies, cookie: Cookie) =>
    fromReadonlyRecord(Record.set(
      self.cookies,
      cookie.name,
      cookie
    ))
)

/**
 * Adds multiple cookies to a Cookies object
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const setAllCookie: {
  (cookies: Iterable<Cookie>): (self: Cookies) => Cookies
  (self: Cookies, cookies: Iterable<Cookie>): Cookies
} = dual(2, (self: Cookies, cookies: Iterable<Cookie>) => {
  const record = { ...self.cookies }
  for (const cookie of cookies) {
    InternalRecord.assignProperty(record, cookie.name, cookie)
  }
  return fromReadonlyRecord(record)
})

/**
 * Combines two Cookies objects, removing duplicates from the first
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const merge: {
  (that: Cookies): (self: Cookies) => Cookies
  (self: Cookies, that: Cookies): Cookies
} = dual(2, (self: Cookies, that: Cookies) =>
  fromReadonlyRecord({
    ...self.cookies,
    ...that.cookies
  }))

/**
 * Removes a cookie by name
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const remove: {
  (name: string): (self: Cookies) => Cookies
  (self: Cookies, name: string): Cookies
} = dual(2, (self: Cookies, name: string) => fromReadonlyRecord(Record.remove(self.cookies, name)))

/**
 * Gets a cookie from a Cookies object safely.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const get: {
  (name: string): (self: Cookies) => Option.Option<Cookie>
  (self: Cookies, name: string): Option.Option<Cookie>
} = dual(
  (args) => isCookies(args[0]),
  (self: Cookies, name: string): Option.Option<Cookie> =>
    Option.fromUndefinedOr(Object.hasOwn(self.cookies, name) ? self.cookies[name] : undefined)
)

/**
 * Gets the decoded value of a cookie by name safely.
 *
 * **Details**
 *
 * Returns `Option.none()` when the cookie is not present.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const getValue: {
  (name: string): (self: Cookies) => Option.Option<string>
  (self: Cookies, name: string): Option.Option<string>
} = dual(
  (args) => isCookies(args[0]),
  (self: Cookies, name: string): Option.Option<string> => Option.map(get(self, name), (cookie) => cookie.value)
)

/**
 * Creates and adds a cookie safely by name and value.
 *
 * **Details**
 *
 * The cookie fields are validated first; invalid input returns a `CookiesError` in the `Result` failure channel.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const set: {
  (
    name: string,
    value: string,
    options?: Cookie["options"]
  ): (self: Cookies) => Result.Result<Cookies, CookiesError>
  (
    self: Cookies,
    name: string,
    value: string,
    options?: Cookie["options"]
  ): Result.Result<Cookies, CookiesError>
} = dual(
  (args) => isCookies(args[0]),
  (self: Cookies, name: string, value: string, options?: Cookie["options"]) =>
    Result.map(
      makeCookie(name, value, options),
      (cookie) => fromReadonlyRecord(Record.set(self.cookies, name, cookie))
    )
)

/**
 * Creates and adds a cookie by name and value, throwing if the cookie fields are invalid.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const setUnsafe: {
  (
    name: string,
    value: string,
    options?: Cookie["options"]
  ): (self: Cookies) => Cookies
  (
    self: Cookies,
    name: string,
    value: string,
    options?: Cookie["options"]
  ): Cookies
} = dual(
  (args) => isCookies(args[0]),
  (self: Cookies, name: string, value: string, options?: Cookie["options"]) =>
    fromReadonlyRecord(Record.set(
      self.cookies,
      name,
      makeCookieUnsafe(name, value, options)
    ))
)

/**
 * Adds an expired cookie safely with an empty value, `Max-Age=0`, and an epoch `Expires` value.
 *
 * **Details**
 *
 * Returns a `CookiesError` in the `Result` failure channel when the name or options are invalid.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const expireCookie: {
  (
    name: string,
    options?: Omit<NonNullable<Cookie["options"]>, "expires" | "maxAge">
  ): (self: Cookies) => Result.Result<Cookies, CookiesError>
  (
    self: Cookies,
    name: string,
    options?: Omit<NonNullable<Cookie["options"]>, "expires" | "maxAge">
  ): Result.Result<Cookies, CookiesError>
} = dual(
  (args) => isCookies(args[0]),
  (
    self: Cookies,
    name: string,
    options?: Omit<NonNullable<Cookie["options"]>, "expires" | "maxAge">
  ) =>
    set(self, name, "", {
      ...options,
      maxAge: 0,
      expires: new Date(0)
    })
)

/**
 * Adds an expired cookie to a Cookies object, throwing an error if invalid
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const expireCookieUnsafe: {
  (
    name: string,
    options?: Omit<NonNullable<Cookie["options"]>, "expires" | "maxAge">
  ): (self: Cookies) => Cookies
  (
    self: Cookies,
    name: string,
    options?: Omit<NonNullable<Cookie["options"]>, "expires" | "maxAge">
  ): Cookies
} = dual(
  (args) => isCookies(args[0]),
  (
    self: Cookies,
    name: string,
    options?: Omit<NonNullable<Cookie["options"]>, "expires" | "maxAge">
  ): Cookies =>
    setUnsafe(self, name, "", {
      ...options,
      maxAge: 0,
      expires: new Date(0)
    })
)

/**
 * Creates and adds multiple cookies safely from name/value/options tuples.
 *
 * **Details**
 *
 * If any tuple is invalid, returns the first `CookiesError` and leaves the original collection unchanged.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const setAll: {
  (
    cookies: Iterable<readonly [name: string, value: string, options?: Cookie["options"]]>
  ): (self: Cookies) => Result.Result<Cookies, CookiesError>
  (
    self: Cookies,
    cookies: Iterable<readonly [name: string, value: string, options?: Cookie["options"]]>
  ): Result.Result<Cookies, CookiesError>
} = dual(
  2,
  (
    self: Cookies,
    cookies: Iterable<readonly [name: string, value: string, options?: Cookie["options"]]>
  ): Result.Result<Cookies, CookiesError> => {
    const record: Record<string, Cookie> = { ...self.cookies }
    for (const [name, value, options] of cookies) {
      const result = makeCookie(name, value, options)
      if (Result.isFailure(result)) {
        return result as Result.Failure<never, CookiesError>
      }
      InternalRecord.assignProperty(record, name, result.success)
    }
    return Result.succeed(fromReadonlyRecord(record))
  }
)

/**
 * Adds multiple cookies to a Cookies object, throwing an error if invalid
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const setAllUnsafe: {
  (cookies: Iterable<readonly [name: string, value: string, options?: Cookie["options"]]>): (self: Cookies) => Cookies
  (self: Cookies, cookies: Iterable<readonly [name: string, value: string, options?: Cookie["options"]]>): Cookies
} = dual(
  2,
  (
    self: Cookies,
    cookies: Iterable<readonly [name: string, value: string, options?: Cookie["options"]]>
  ): Cookies => Result.getOrThrow(setAll(self, cookies))
)

/**
 * Serializes a cookie into a string.
 *
 * **Details**
 *
 * Adapted from https://github.com/fastify/fastify-cookie under MIT License
 *
 * @stability unstable
 * @category encoding
 * @since 4.0.0
 */
export function serializeCookie(self: Cookie): string {
  const error = validateCookie(self.name, self.valueEncoded, self.options)
  if (error !== undefined) {
    throw error
  }
  let str = self.name + "=" + self.valueEncoded

  if (self.options === undefined) {
    return str
  }
  const options = self.options

  if (options.maxAge !== undefined) {
    const maxAge = Duration.toSeconds(Duration.fromInputUnsafe(options.maxAge))
    str += "; Max-Age=" + Math.trunc(maxAge)
  }

  if (options.domain !== undefined) {
    str += "; Domain=" + options.domain
  }

  if (options.path !== undefined) {
    str += "; Path=" + options.path
  }

  if (options.priority !== undefined) {
    switch (options.priority) {
      case "low":
        str += "; Priority=Low"
        break
      case "medium":
        str += "; Priority=Medium"
        break
      case "high":
        str += "; Priority=High"
        break
    }
  }

  if (options.expires !== undefined) {
    str += "; Expires=" + options.expires.toUTCString()
  }

  if (options.httpOnly) {
    str += "; HttpOnly"
  }

  if (options.secure) {
    str += "; Secure"
  }

  // Draft implementation to support Chrome from 2024-Q1 forward.
  // See https://datatracker.ietf.org/doc/html/draft-cutler-httpbis-partitioned-cookies#section-2.1
  if (options.partitioned) {
    str += "; Partitioned"
  }

  if (options.sameSite !== undefined) {
    switch (options.sameSite) {
      case "lax":
        str += "; SameSite=Lax"
        break
      case "strict":
        str += "; SameSite=Strict"
        break
      case "none":
        str += "; SameSite=None"
        break
    }
  }

  return str
}

/**
 * Serializes a `Cookies` object into a Cookie header.
 *
 * @stability unstable
 * @category encoding
 * @since 4.0.0
 */
export const toCookieHeader = (self: Cookies): string =>
  Object.values(self.cookies).map((cookie) => `${cookie.name}=${cookie.valueEncoded}`).join("; ")

/**
 * Converts a `Cookies` collection to a record of decoded cookie values keyed by cookie name.
 *
 * @stability unstable
 * @category encoding
 * @since 4.0.0
 */
export const toRecord = (self: Cookies): Record<string, string> => {
  const record: Record<string, string> = {}
  const cookies = Object.values(self.cookies)
  for (let index = 0; index < cookies.length; index++) {
    const cookie = cookies[index]
    InternalRecord.assignProperty(record, cookie.name, cookie.value)
  }
  return record
}

/**
 * Serializes a `Cookies` collection into an array of `Set-Cookie` header values.
 *
 * @stability unstable
 * @category encoding
 * @since 4.0.0
 */
export const toSetCookieHeaders = (self: Cookies): Array<string> => Object.values(self.cookies).map(serializeCookie)

/**
 * Parses a cookie header into a record of key-value pairs
 *
 * **Details**
 *
 * Adapted from https://github.com/fastify/fastify-cookie under MIT License
 *
 * @stability unstable
 * @category decoding
 * @since 4.0.0
 */
export function parseHeader(header: string): Record<string, string> {
  const result: Record<string, string> = {}

  const strLen = header.length
  let pos = 0
  let terminatorPos = 0

  while (true) {
    if (terminatorPos === strLen) break
    terminatorPos = header.indexOf(";", pos)
    if (terminatorPos === -1) terminatorPos = strLen // This is the last pair

    let eqIdx = header.indexOf("=", pos)
    if (eqIdx === -1) break // No key-value pairs left
    if (eqIdx > terminatorPos) {
      // Malformed key-value pair
      pos = terminatorPos + 1
      continue
    }

    const key = header.substring(pos, eqIdx++).trim()
    if (!Object.hasOwn(result, key)) {
      const val = header.charCodeAt(eqIdx) === 0x22
        ? header.substring(eqIdx + 1, terminatorPos - 1).trim()
        : header.substring(eqIdx, terminatorPos).trim()

      InternalRecord.assignProperty(
        result,
        key,
        !(val.indexOf("%") === -1) ? tryDecodeURIComponent(val) : val
      )
    }

    pos = terminatorPos + 1
  }

  return result
}

const tryDecodeURIComponent = (str: string): string => {
  try {
    return decodeURIComponent(str)
    // oxlint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (_) {
    return str
  }
}
