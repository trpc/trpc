/**
 * @since 4.0.0
 */

import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { TestRunner } from "vitest"
import * as Protocol from "./Protocol.ts"

/**
 * Wraps a Vitest runner so marked documentation files use doctest collectors.
 *
 * @category testing
 * @since 4.0.0
 */
export const wrap = (Base: typeof TestRunner): typeof TestRunner => {
  return class DoctestRunner extends Base {
    override importFile(filepath: string, source: "collect" | "setup"): unknown {
      if (source !== "collect") {
        return super.importFile(filepath, source)
      }

      return readFile(filepath).then((contents) => {
        if (!contents.includes("import.meta.vitest")) {
          return super.importFile(filepath, source)
        }

        const version = createHash("sha256").update(contents).digest("hex").slice(0, 16)
        return super.importFile(Protocol.collectorId(filepath, version), source)
      })
    }
  }
}

/**
 * Vitest runner that routes marked documentation files to doctest collectors.
 *
 * @category testing
 * @since 4.0.0
 */
export default wrap(TestRunner)
