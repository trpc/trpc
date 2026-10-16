import { writeFileSync } from "node:fs"
import { compile } from "effect/schema/SchemaAOTCompiler"
import { targets } from "./cases.ts"

writeFileSync(process.argv[2], compile(targets))
