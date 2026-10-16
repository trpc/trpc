# @effect/ai-cloudflare

Cloudflare Workers AI provider for Effect's `DecisionModel`. Supports text and JSON classification, ordered ratings, and probabilities with Clef and Clef-flash over REST.

## Installation

```sh
npm install effect @effect/ai-cloudflare
```

## Usage

Set `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`, then provide a Cloudflare decision model:

```ts
import { CloudflareClient, CloudflareDecisionModel } from "@effect/ai-cloudflare"
import { Effect, Layer, Schema } from "effect"
import { Decision, DecisionModel } from "effect/ai"
import { FetchHttpClient } from "effect/http"

const Triage = Decision.make({
  input: Schema.String,
  decisions: {
    urgent: Decision.probability({
      instructions: "Does this request need immediate attention?"
    })
  }
})

const Clef = CloudflareDecisionModel.layer({ model: "clef-flash" }).pipe(
  Layer.provide(CloudflareClient.layerConfig()),
  Layer.provide(FetchHttpClient.layer)
)

const program = DecisionModel.decide(Triage, {
  input: "Checkout has been failing for every customer for an hour."
}).pipe(Effect.provide(Clef))
```

Use `"clef"` for the larger model. `CloudflareDecisionModel.model` provides a model descriptor with Cloudflare provider metadata. `CloudflareClient.layer` accepts an explicit account ID and redacted API token; `apiUrl` and `transformClient` customize HTTP access.

The client unwraps Cloudflare's REST envelope and maps failures to `AiError`. It does not retry automatically. Rate-limit errors include `Retry-After` when provided. The decision model validates answers and rescales small probability drift from four-decimal rounding.

Cloudflare limits each request to 64 questions, classification to 2–255 choices, and ratings to 2–10 levels. See the [Clef API documentation](https://developers.cloudflare.com/workers-ai/models/clef/) for request limits.
