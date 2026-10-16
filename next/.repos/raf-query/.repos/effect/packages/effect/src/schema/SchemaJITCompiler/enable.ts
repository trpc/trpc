/**
 * Enables lazy JIT compilation globally through a side-effect import.
 * Import before the first use of schemas, including construction. Previously
 * captured parsers remain usable but are not replaced. If dynamic function
 * construction is blocked or compilation fails, parsing uses the interpreter.
 *
 * @stability unstable
 * @since 4.0.0
 */
import { install } from "../../internal/schema/compilerRegistry.ts"
import { compiler } from "../SchemaJITCompiler.ts"

install(compiler)
