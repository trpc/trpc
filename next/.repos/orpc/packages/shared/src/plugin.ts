export interface OrderablePlugin {
  /** Unique name of the plugin, used for ordering and identification. */
  name: string

  /** Plugins this plugin should execute before. */
  before?: string[] | undefined

  /** Plugins this plugin should execute after. */
  after?: string[] | undefined
}

/**
 * Sorts plugins based on their `before` and `after` dependencies.
 */
export function sortPlugins<T extends OrderablePlugin>(
  plugins: T[],
): T[] {
  const pluginCount = plugins.length

  const pluginIdToIndices = new Map<string, number[]>()

  for (let i = 0; i < pluginCount; i++) {
    const plugin = plugins[i]!

    const indices = pluginIdToIndices.get(plugin.name)
    if (indices === undefined) {
      pluginIdToIndices.set(plugin.name, [i])
    }
    else {
      indices.push(i)
    }
  }

  const dependencies: number[][] = Array.from({ length: pluginCount }, () => [])

  for (let i = 0; i < pluginCount; i++) {
    const plugin = plugins[i]!

    if (plugin.before !== undefined) {
      for (const beforeId of plugin.before) {
        const beforeIndices = pluginIdToIndices.get(beforeId)

        if (beforeIndices !== undefined) {
          for (const beforeIndex of beforeIndices) {
            dependencies[beforeIndex]!.push(i)
          }
        }
      }
    }

    if (plugin.after !== undefined) {
      for (const afterId of plugin.after) {
        const afterIndices = pluginIdToIndices.get(afterId)

        if (afterIndices !== undefined) {
          for (const afterIndex of afterIndices) {
            dependencies[i]!.push(afterIndex)
          }
        }
      }
    }
  }

  const sorted: T[] = []
  const placed = new Set<number>()

  while (sorted.length < pluginCount) {
    const next = plugins.findIndex((_, i) => !placed.has(i) && dependencies[i]!.every(dependency => placed.has(dependency)))

    if (next === -1) {
      throw new Error(`Circular dependency detected involving plugin "${findCyclicPlugin(plugins, dependencies, placed).name}"`)
    }

    placed.add(next)
    sorted.push(plugins[next]!)
  }

  return sorted
}

function findCyclicPlugin<T extends OrderablePlugin>(
  plugins: T[],
  dependencies: number[][],
  placed: Set<number>,
): T {
  const seen = new Set<number>()
  let current = plugins.findIndex((_, i) => !placed.has(i))

  while (!seen.has(current)) {
    seen.add(current)
    current = dependencies[current]!.find(dependency => !placed.has(dependency))!
  }

  return plugins[current]!
}
