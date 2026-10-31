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

Declare images as input fields with `Decision.Image`. Clef shows them to the model before the state, and the state lists each image's reference in order:

```ts
declare const screenshotBytes: Uint8Array

const ScreenshotTriage = Decision.make({
  input: Schema.Struct({ report: Schema.String, screenshot: Decision.Image }),
  decisions: Triage.decisions
})

const withScreenshot = DecisionModel.decide(ScreenshotTriage, {
  input: {
    report: "Customers report the error in `screenshot`.",
    screenshot: { mediaType: "image/png", data: screenshotBytes }
  }
})
```

Image `data` may be a `Uint8Array`, a base64 string, or a `data:` URL. Remote URLs fail with `AiError.InvalidUserInputError` because Clef does not fetch them, so download the image first. The API accepts up to 4 PNG, JPEG, or WebP images, each at most 4 MiB and 16 megapixels, with 8 MiB of decoded images in total and a 13 MiB request body.

Use `"clef"` for the larger model. `CloudflareDecisionModel.model` provides a model descriptor with Cloudflare provider metadata. `CloudflareClient.layer` accepts an explicit account ID and redacted API token; `apiUrl` and `transformClient` customize HTTP access.

Instructions and descriptions can be strings, JSON objects, or JSON arrays. A rating level with a structured description takes an explicit `label`, which answers use.

The client unwraps Cloudflare's REST envelope and maps failures to `AiError`. It does not retry automatically. Rate-limit errors include `Retry-After` when provided. The decision model validates answers and rescales small probability drift from four-decimal rounding.

Cloudflare limits each request to 64 questions, classification to 2–255 choices, and ratings to 2–10 levels. See the [Clef API documentation](https://developers.cloudflare.com/workers-ai/models/clef/) for request limits.

## AI Gateway

Set `CLOUDFLARE_AI_GATEWAY_ID` when using `CloudflareClient.layerConfig()` to route requests through a Cloudflare AI Gateway. You can also pass `gatewayId` to `CloudflareClient.layer`. The client adds the `cf-aig-gateway-id` header. Use `transformClient` to add other `cf-aig-*` headers.
