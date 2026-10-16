# @effect/ai-typesafe

TypeSafe System One provider for Effect's `DecisionModel`. Supports classification, ordered ratings, and probabilities through Effect `HttpClient`.

## Installation

```sh
npm install effect @effect/ai-typesafe
```

## Links

- [Website](https://effect.website): documentation, guides, and news.
- [Reference](https://effect.website/docs/v4/api/ai-typesafe): API documentation for this package.
- [Discord](https://discord.gg/effect-ts): ask questions, share what you're building, and talk to the core team.
- [Community](https://effect.website/community-hub): meetups and events, or bring Effect to your own.
- [Issues](https://github.com/Effect-TS/effect/issues): bug reports and feature requests.

## Let's talk

Whether your team is considering Effect, rolling it out, or already running it in production, we'd love to hear from you: what you're building, what works, and what you need from Effect next.

- **Talk to the maintainers.** Introduce your team on [Discord](https://discord.gg/effect-ts) or email [contact@effectful.co](mailto:contact@effectful.co). We're happy to connect privately on Slack or Discord for feedback and help with adoption.
- **Production support.** We're exploring how to better support teams running Effect in production. If your organization has specific support needs, let's discuss them.
- **Adoption help.** Our [adoption partners](https://effect.website/adoption-partners) offer implementation, consulting, team extension, training, and commercial support.

## Usage

Use `TypeSafeClient.layerConfig()` to read `TYPESAFE_API_KEY`, then provide `TypeSafeDecisionModel.model("jev-latest")` to a decision workflow. Versioned model identifiers such as `jev-1.13.0` are also supported.

The client does not retry automatically. Rate-limit errors include the provider's retry delay when available. Provider distributions are preserved, not normalized; they must satisfy the core `DecisionModel` validation, including its current `1e-6` sum tolerance. TypeSafe's rounding behavior has not been verified against the live API.
