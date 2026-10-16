import { describe, it } from "@effect/vitest"
import { Data, Graph, Option, type Types } from "effect"
import { AssertionError } from "node:assert"

// TODO: Add more terrains
const terrains = {
  simple: `
    ##############################
    #.........#......#...........#
    #...####.#..~~~~##..^^^^^....#
    #...####....~~~~....^^^^^....#
    #...........~~~~....^^^^^....#
    #...........~~~~##...........#
    #...MMMM.........#...........#
    #...MMMM.........#...........#
    #...MMMM.........#...........#
    #................#...........#
    #................#...........#
    #...^^^^^....####....~~~~....#
    #...^^^^^....####....~~~~....#
    #................#...........#
    ##############################
  `
} as const

describe("Dijkstra", () => {
  it("should find paths using Dijkstra algorithm", () => {
    const parsed = parseTerrain(terrains.simple)
    const result = Graph.dijkstra(parsed.graph, {
      source: parsed.nodes.get("1:1")!,
      target: parsed.nodes.get("28:13")!,
      cost: (weight: number) => weight
    })

    assertPath(parsed, result, "1:1;↓↓↓→→→→→→→→→→→→→→→→→↓↓↓↓↓↓↓↓↓→→→→→→→→→→")
  })
})

describe("Bellman-Ford", () => {
  it("should find paths using Bellman-Ford algorithm", () => {
    const parsed = parseTerrain(terrains.simple)
    const result = Graph.bellmanFord(parsed.graph, {
      source: parsed.nodes.get("1:1")!,
      target: parsed.nodes.get("28:13")!,
      cost: (weight: number) => weight
    })

    assertPath(parsed, result, "1:1;→→→→→→→↓↓→→→→→→→→→→→↓↓→→→→→→→→→↓↓↓↓↓↓↓↓")
  })
})

describe("A*", () => {
  it("should find paths using A* algorithm", () => {
    const parsed = parseTerrain(terrains.simple)
    const result = Graph.astar(parsed.graph, {
      source: parsed.nodes.get("1:1")!,
      target: parsed.nodes.get("28:13")!,
      cost: (weight: number) => weight,
      // Manhattan distance heuristic
      heuristic: (sourceNodeData: TerrainNode, targetNodeData: TerrainNode) =>
        Math.abs(targetNodeData.x - sourceNodeData.x) + Math.abs(targetNodeData.y - sourceNodeData.y)
    })

    assertPath(parsed, result, "1:1;↓↓↓↓→→→→→→→↓→→→→→→→↑↑→→→↓↓↓↓↓↓↓↓↓→→→→→→→→→→")
  })
})

// =============================================================================
// Assertion Helpers
// =============================================================================

/**
 * Assert that the result path matches the expected path.
 */
const assertPath = (
  terrain: Terrain,
  actual: Option.Option<Graph.PathResult<number>>,
  sequence: Sequence
) => {
  const derived = sequenceFromPath(terrain, actual)
  if (derived !== sequence) {
    let message = "Path finding result did not match the expected sequence"
    message += `\n`
    message += `\nExpected: ${sequence}`
    message += `\nActual:   ${derived}`
    message += `\n`
    message += `\nExpected Path:`
    message += `\n${printSolution(terrain, pathFromSequence(terrain, sequence))}`
    message += `\n`
    message += `\nActual Path:`
    message += `\n${printSolution(terrain, Option.getOrUndefined(actual))}`

    throw new AssertionError({ message, stackStartFn: assertPath })
  }
}

type Sequence = `${number}:${number};${string}`

/**
 * Make a path from a sequence of moves.
 */
const pathFromSequence = (
  terrain: Terrain,
  sequence: Sequence
): Graph.PathResult<number> => {
  const [start, rest] = sequence.split(";") as [`${number}:${number}`, string]
  if (!terrain.nodes.has(start)) {
    throw new Error(`Start location ${start} not found in terrain`)
  }

  const index = terrain.nodes.get(start)!
  const output: Types.Mutable<Graph.PathResult<number>> = {
    distance: 0,
    costs: [],
    edges: [],
    path: [index]
  }

  let [x, y] = start.split(":").map(Number) as [number, number]
  for (const location of rest.split("")) {
    if (location === "↓") {
      y++
    } else if (location === "↑") {
      y--
    } else if (location === "←") {
      x--
    } else if (location === "→") {
      x++
    } else {
      throw new Error(`Invalid move ${location} in sequence ${sequence}`)
    }

    if (!terrain.nodes.has(`${x}:${y}`)) {
      continue
    }

    const index = terrain.nodes.get(`${x}:${y}`)!
    const node = Graph.getNode(terrain.graph, index).pipe(
      Option.getOrThrowWith(() => new Error(`Location ${location} not found in terrain`))
    )

    output.distance += node.weight
    output.costs.push(node.weight)
    const previousIndex = output.path[output.path.length - 1]
    const edge = Graph.edgesBetween(terrain.graph, previousIndex, index)[0]
    if (edge === undefined) {
      throw new Error(`No edge from ${previousIndex} to ${index}`)
    }
    output.edges.push(edge)
    output.path.push(index)
  }

  return output
}

/**
 * Derive a sequence of moves from a path.
 */
const sequenceFromPath = (
  terrain: Terrain,
  path: Option.Option<Graph.PathResult<number>>
): Sequence | undefined => {
  if (Option.isNone(path) || path.value.path.length === 0) {
    return undefined
  }

  const pathValue = path.value

  const sequence = []
  const start = terrain.coordinates.get(pathValue.path[0])!
  let previous = Graph.getNode(terrain.graph, terrain.nodes.get(start)!).pipe(
    Option.getOrThrowWith(() => new Error(`Start location ${start} not found in terrain`))
  )

  for (const index of pathValue.path.slice(1)) {
    const current = Graph.getNode(terrain.graph, index).pipe(
      Option.getOrThrowWith(() => new Error(`Location ${index} not found in terrain`))
    )

    if (current.x === previous.x) {
      if (current.y === previous.y - 1) {
        sequence.push("↑")
      } else if (current.y === previous.y + 1) {
        sequence.push("↓")
      } else {
        throw new Error(`Invalid move ${current.x}:${current.y} -> ${previous.x}:${previous.y}`)
      }
    } else if (current.y === previous.y) {
      if (current.x === previous.x - 1) {
        sequence.push("←")
      } else if (current.x === previous.x + 1) {
        sequence.push("→")
      } else {
        throw new Error(`Invalid move ${current.x}:${current.y} -> ${previous.x}:${previous.y}`)
      }
    }

    previous = current
  }

  return `${start};${sequence.join("")}`
}

// =============================================================================
// Terrain Parser
// =============================================================================

/**
 * Represents a node in terrain with its grid coordinates and terrain type.
 */
class TerrainNode extends Data.TaggedClass("TerrainNode")<{
  readonly x: number
  readonly y: number
  readonly type: string
  readonly weight: number
}> {}

/**
 * Result of parsing terrain ASCII art into a graph.
 */
interface Terrain {
  readonly graph: Graph.DirectedGraph<TerrainNode, number>
  readonly grid: Array<Array<string>>
  readonly width: number
  readonly height: number
  readonly nodes: Map<`${number}:${number}`, Graph.NodeIndex>
  readonly coordinates: Map<Graph.NodeIndex, `${number}:${number}`>
}

/**
 * Parse ASCII terrain art into a graph structure suitable for pathfinding.
 *
 * Converts a 2D ASCII grid into a directed graph where each walkable cell becomes
 * a node, and edges connect adjacent walkable cells with weights based on terrain type.
 */
const parseTerrain = (ascii: string): Terrain => {
  const lines = ascii.trim().split("\n").map((line) => line.trim()).filter((line) => line.length > 0)
  if (lines.length === 0) {
    throw new Error("Terrain must have at least one line")
  }

  const width = lines[0].length
  const height = lines.length
  // Validate all lines have same width
  for (const line of lines) {
    if (line.length !== width) {
      throw new Error("All terrain lines must have the same width")
    }
  }

  const grid = lines.map((line) => line.split(""))
  const nodes = new Map<`${number}:${number}`, Graph.NodeIndex>()
  const coordinates = new Map<Graph.NodeIndex, `${number}:${number}`>()
  const graph = Graph.directed<TerrainNode, number>((mutable) => {
    // First pass: create all nodes
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const char = lines[y][x]
        const weight = weights.get(char) ?? 1
        if (weight === Infinity) {
          // Skip impassable terrain
          continue
        }

        const node = new TerrainNode({ x, y, type: char, weight })
        const index = Graph.addNode(mutable, node)
        nodes.set(`${x}:${y}`, index)
        coordinates.set(index, `${x}:${y}`)
      }
    }

    // Second pass: create edges between adjacent walkable cells
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const char = lines[y][x]
        const weight = weights.get(char) ?? 1
        if (weight === Infinity) {
          // Skip impassable terrain
          continue
        }

        const node = nodes.get(`${x}:${y}`)
        if (node === undefined) {
          continue
        }

        // Check 4-directional adjacency (up, down, left, right)
        const directions = [
          [0, -1], // up
          [0, 1], // down
          [-1, 0], // left
          [1, 0] // right
        ] as const

        for (const [dx, dy] of directions) {
          const adjacentX = x + dx
          const adjacentY = y + dy

          // Check bounds
          if (adjacentX < 0 || adjacentX >= width || adjacentY < 0 || adjacentY >= height) {
            continue
          }

          const adjacentChar = lines[adjacentY][adjacentX]
          const adjacentWeight = weights.get(adjacentChar) ?? 1
          if (adjacentWeight === Infinity) {
            // Skip impassable adjacent terrain
            continue
          }

          const adjacentNode = nodes.get(`${adjacentX}:${adjacentY}`)
          if (adjacentNode !== undefined) {
            Graph.addEdge(mutable, node, adjacentNode, adjacentWeight)
          }
        }
      }
    }
  })

  return {
    graph,
    width,
    height,
    grid,
    nodes,
    coordinates
  }
}

/**
 * Weights for common terrain types.
 */
const weights = new Map([
  ["#", Infinity], // Walls
  [".", 1], // Open terrain
  ["~", 3], // Water
  ["^", 5], // Mountains
  ["M", 2] // Mud
])

// =============================================================================
// Terrain Printer
// =============================================================================

/**
 * Print terrain as ASCII art with path overlay.
 */
const printSolution = (terrain: Terrain, solution?: Graph.PathResult<number>): string => {
  // Clone the grid to avoid mutating the original
  const grid = terrain.grid.map((line) => line.slice())
  const steps = solution === undefined ? [] : solution.path

  for (const [key, index] of steps.entries()) {
    const node = Graph.getNode(terrain.graph, index).pipe(
      Option.getOrThrowWith(() => new Error("Path coordinates outside of terrain"))
    )

    const marker = key === 0 ? "S" : key === steps.length - 1 ? "E" : "*"
    grid[node.y][node.x] = marker
  }

  for (let x = 0; x < terrain.width; x++) {
    for (let y = 0; y < terrain.height; y++) {
      const character = grid[y][x]
      const color = colors.colors.get(character)
      if (color !== undefined) {
        grid[y][x] = color + character + colors.reset
      }
    }
  }

  return grid.map((line) => line.join("")).join("\n")
}

/**
 * ANSI color codes for terminal output.
 */
const ANSI = {
  Reset: "\x1b[0m",
  Bright: "\x1b[1m",
  Dim: "\x1b[2m",

  // Foreground colors
  Black: "\x1b[30m",
  Red: "\x1b[31m",
  Green: "\x1b[32m",
  Yellow: "\x1b[33m",
  Blue: "\x1b[34m",
  Magenta: "\x1b[35m",
  Cyan: "\x1b[36m",
  White: "\x1b[37m",

  // Bright foreground colors
  BrightBlack: "\x1b[90m",
  BrightRed: "\x1b[91m",
  BrightGreen: "\x1b[92m",
  BrightYellow: "\x1b[93m",
  BrightBlue: "\x1b[94m",
  BrightMagenta: "\x1b[95m",
  BrightCyan: "\x1b[96m",
  BrightWhite: "\x1b[97m",

  // Background colors
  BgBlack: "\x1b[40m",
  BgRed: "\x1b[41m",
  BgGreen: "\x1b[42m",
  BgYellow: "\x1b[43m",
  BgBlue: "\x1b[44m",
  BgMagenta: "\x1b[45m",
  BgCyan: "\x1b[46m",
  BgWhite: "\x1b[47m"
} as const

/**
 * Default color configuration for common terrain types.
 */
const colors = {
  colors: new Map([
    ["#", ANSI.BrightBlack], // Walls - dark gray
    [".", ANSI.White], // Open terrain - white
    ["~", ANSI.Blue], // Water - blue
    ["^", ANSI.BrightMagenta], // Mountains - bright magenta
    ["M", ANSI.Yellow], // Mud - yellow
    ["S", ANSI.BrightGreen], // Start - bright green
    ["E", ANSI.BrightRed], // End - bright red
    ["*", ANSI.BrightYellow] // Path - bright yellow
  ]),
  reset: ANSI.Reset
} as const
