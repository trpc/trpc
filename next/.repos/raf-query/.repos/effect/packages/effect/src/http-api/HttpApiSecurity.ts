/**
 * Defines security scheme declarations for declarative HTTP APIs.
 *
 * Security schemes describe where credentials are read from and which credential
 * type is passed to security middleware. They are consumed by
 * `HttpApiMiddleware.Service`, `HttpApiBuilder`, generated clients, and OpenAPI
 * generation, but they do not authenticate requests by themselves.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Context from "../Context.ts"
import { dual } from "../Function.ts"
import { type Pipeable, pipeArguments } from "../Pipeable.ts"
import type { Redacted } from "../Redacted.ts"
import type { Covariant } from "../Types.ts"

const TypeId = "~effect/http-api/HttpApiSecurity"

/**
 * Union of security schemes supported by the HTTP API OpenAPI model.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type HttpApiSecurity = Http | ApiKey | Basic

/**
 * Helper types for HTTP API security schemes.
 *
 * @stability unstable
 * @since 4.0.0
 */
export declare namespace HttpApiSecurity {
  /**
   * Common prototype for security schemes, carrying the credential type and OpenAPI annotations.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export interface Proto<out A> extends Pipeable {
    readonly [TypeId]: {
      readonly _A: Covariant<A>
    }
    readonly annotations: Context.Context<never>
  }

  /**
   * Extracts the credential type produced by a security scheme.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export type Type<A extends HttpApiSecurity> = A extends Proto<infer Out> ? Out : never
}

/**
 * Http token security scheme whose decoded credential is a redacted token.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Http extends HttpApiSecurity.Proto<Redacted> {
  readonly _tag: "Http"
  readonly scheme: string
  /**
   * @internal
   */
  readonly schemeLength: number
}

/**
 * API key security scheme identifying the key name and whether it is read from a header, query parameter, or cookie.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ApiKey extends HttpApiSecurity.Proto<Redacted> {
  readonly _tag: "ApiKey"
  readonly in: "header" | "query" | "cookie"
  readonly key: string
}

/**
 * HTTP Basic authentication security scheme whose decoded credential is `Credentials`.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Basic extends HttpApiSecurity.Proto<Credentials> {
  readonly _tag: "Basic"
}

/**
 * Decoded credentials for HTTP Basic authentication.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Credentials {
  readonly username: string
  readonly password: Redacted
}

const Proto = {
  [TypeId]: TypeId,
  pipe() {
    return pipeArguments(this, arguments)
  }
}

/**
 * Creates a Http token security scheme.
 *
 * **When to use**
 *
 * Use to require `Authorization: scheme ...` credentials for an HTTP API group
 * or endpoint.
 *
 * **Details**
 *
 * Use `HttpApiBuilder.middlewareSecurity` to implement API middleware for this
 * security scheme.
 *
 * @see {@link apiKey} for an API-key security scheme
 * @see {@link basic} for an HTTP Basic security scheme
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const http = (options: {
  readonly scheme: string
}): Http =>
  Object.assign(Object.create(Proto), {
    _tag: "Http",
    scheme: options.scheme,
    schemeLength: options.scheme.length,
    annotations: Context.empty()
  })

/**
 * Creates a Bearer token security scheme.
 *
 * **When to use**
 *
 * Use to require `Authorization: Bearer ...` credentials for an HTTP API group
 * or endpoint.
 *
 * **Details**
 *
 * Use `HttpApiBuilder.middlewareSecurity` to implement API middleware for this
 * security scheme.
 *
 * @see {@link apiKey} for an API-key security scheme
 * @see {@link basic} for an HTTP Basic security scheme
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const bearer: Http = http({ scheme: "Bearer" })

/**
 * Creates an API key security scheme.
 *
 * **When to use**
 *
 * Use to require API key credentials passed through a header, query parameter,
 * or cookie.
 *
 * **Details**
 *
 * Use `HttpApiBuilder.middlewareSecurity` to implement API middleware for this
 * security scheme.
 *
 * Use `HttpApiBuilder.securitySetCookie` to set the correct cookie in a
 * handler. By default, `in` is `"header"`.
 *
 * @see {@link bearer} for a Bearer token security scheme
 * @see {@link basic} for an HTTP Basic security scheme
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const apiKey = (options: {
  readonly key: string
  readonly in?: "header" | "query" | "cookie" | undefined
}): ApiKey =>
  Object.assign(Object.create(Proto), {
    _tag: "ApiKey",
    key: options.key,
    in: options.in ?? "header",
    annotations: Context.empty()
  })

/**
 * Creates an HTTP Basic authentication security scheme.
 *
 * **When to use**
 *
 * Use to require HTTP Basic username/password credentials.
 *
 * **Details**
 *
 * Use `HttpApiBuilder.middlewareSecurity` to implement API middleware for this
 * security scheme.
 *
 * @see {@link bearer} for a Bearer token security scheme
 * @see {@link apiKey} for an API-key security scheme
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const basic: Basic = Object.assign(Object.create(Proto), {
  _tag: "Basic",
  annotations: Context.empty()
})

/**
 * Merges OpenAPI annotations into a security scheme.
 *
 * @stability unstable
 * @category annotations
 * @since 4.0.0
 */
export const annotateMerge: {
  <I>(annotations: Context.Context<I>): <A extends HttpApiSecurity>(self: A) => A
  <A extends HttpApiSecurity, I>(self: A, annotations: Context.Context<I>): A
} = dual(
  2,
  <A extends HttpApiSecurity, I>(self: A, annotations: Context.Context<I>): A =>
    Object.assign(Object.create(Proto), {
      ...self,
      annotations: Context.merge(self.annotations, annotations)
    })
)

/**
 * Adds an OpenAPI annotation value to a security scheme.
 *
 * @stability unstable
 * @category annotations
 * @since 4.0.0
 */
export const annotate: {
  <I, S>(service: Context.Key<I, S>, value: S): <A extends HttpApiSecurity>(self: A) => A
  <A extends HttpApiSecurity, I, S>(self: A, service: Context.Key<I, S>, value: S): A
} = dual(
  3,
  <A extends HttpApiSecurity, I, S>(self: A, service: Context.Key<I, S>, value: S): A =>
    Object.assign(Object.create(Proto), {
      ...self,
      annotations: Context.add(self.annotations, service, value)
    })
)
