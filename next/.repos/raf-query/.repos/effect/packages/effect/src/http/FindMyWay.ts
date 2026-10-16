/**
 * A radix-tree HTTP router used by the unstable HTTP routing modules.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as internal from "./FindMyWay/internal/router.ts"

/*
 * MIT License
 *
 * Copyright (c) 2017-2019 Tomas Della Vedova
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

/**
 * Configuration for router path matching.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface RouterConfig {
  readonly ignoreTrailingSlash: boolean
  readonly ignoreDuplicateSlashes: boolean
  readonly caseSensitive: boolean
  readonly maxParamLength: number
}

/**
 * Route path accepted by the router.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type PathInput = `/${string}` | "*"

/**
 * Mutable router used to register and resolve route handlers.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Router<A> {
  readonly on: (method: string | Iterable<string>, path: PathInput, handler: A) => void
  readonly all: (path: PathInput, handler: A) => void
  readonly find: (method: string, url: string) => FindResult<A> | undefined
  readonly has: (method: string, url: string) => boolean
}

/**
 * Result of a successful route lookup.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface FindResult<A> {
  readonly handler: A
  readonly params: Record<string, string | undefined>
  readonly searchParams: Record<string, string | Array<string>>
}

/**
 * Creates an empty mutable router.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make: <A>(options?: Partial<RouterConfig>) => Router<A> = internal.make
