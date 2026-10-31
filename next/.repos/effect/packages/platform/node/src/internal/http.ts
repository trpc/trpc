import type * as Http from "node:http"
import type * as Https from "node:https"
import { createRequire } from "node:module"

// Importing node:http as ESM evaluates its lazy WebSocket exports, which loads
// undici. Load the CommonJS modules instead. `__filename` covers bundlers that
// emit CommonJS, where `import.meta.url` is undefined.
const require = createRequire(typeof __filename === "string" ? __filename : import.meta.url)

export const http: typeof Http = require("node:http")
export const https: typeof Https = require("node:https")
