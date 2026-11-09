import assert from "node:assert/strict"
import * as Module from "node:module"

if (Module.registerHooks !== undefined) {
  Module.registerHooks({
    resolve(specifier, context, nextResolve) {
      const resolved = nextResolve(specifier, context)
      assert.doesNotMatch(
        resolved.url,
        /\/(?:internal\/schema\/(?:codegen|jitCompiler)|unstable\/schema\/Schema(?:AOT|JIT)Compiler)(?:\.|\/)/,
        "Generated modules must not load source generation or the JIT compiler"
      )
      return resolved
    }
  })
} else {
  Object.defineProperty(globalThis, "Function", {
    value: function() {
      throw new EvalError("Code generation from strings disallowed")
    }
  })
}
