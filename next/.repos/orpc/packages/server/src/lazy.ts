import type { AnyMetaPlugin, Meta } from '@orpc/contract'
import { getConstructor, isTypescriptObject } from '@orpc/shared'

export interface LazyDefinition<T> {
  meta: Meta
  metaPlugins?: AnyMetaPlugin[] | undefined
  loader: () => Promise<{ default: T }>
}

export class Lazy<T> {
  '~orpc': LazyDefinition<T>

  constructor(
    def: LazyDefinition<T>,
  ) {
    this['~orpc'] = def
  }

  /**
   * Checks if the given instance satisfies the {@link Lazy} class/interface.
   */
  static [Symbol.hasInstance](instance: unknown): boolean {
    if (this !== Lazy) {
      // fallback to default instanceof check if this is extended class
      return Function.prototype[Symbol.hasInstance].call(this, instance)
    }

    const constructor = getConstructor(instance)
    if (constructor === Lazy) {
      return true
    }

    return (
      isTypescriptObject(instance)
      && isTypescriptObject(instance['~orpc'])
      && isTypescriptObject(instance['~orpc'].meta)
      && (instance['~orpc'].metaPlugins === undefined || Array.isArray(instance['~orpc'].metaPlugins))
      && typeof instance['~orpc'].loader === 'function'
    )
  }
}

export type Lazyable<T> = T | Lazy<T>

export function unlazy<T extends Lazyable<any>>(maybeLazy: T): Promise<{ default: T extends Lazy<infer U> ? U : T }> {
  return maybeLazy instanceof Lazy ? maybeLazy['~orpc'].loader() : Promise.resolve({ default: maybeLazy as T extends Lazy<infer U> ? U : T })
}
