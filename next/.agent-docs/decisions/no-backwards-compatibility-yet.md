# No backwards compatibility while v12 is in development; migrations get tooling (human)

- Alex, 2026-10-15 (decisions round 3, Q3): "I don't care about backwards compatability for now, we'll provide codemods, migration guides, and special interop request handlers for old clients so you can deploy without risking to break the old apps".
- Wire formats, APIs and protocol versions may change freely before release; no shims or negotiation for older vNext builds.
- Moving from v11 is a tooling job: codemods, migration guides, and interop request handlers that serve old (v11) clients from a v12 router, so servers can deploy before every client updates.
- Why: designing for compatibility now would freeze choices before they're right.
- Lost: nothing for users yet; prerelease adopters may need to update both ends together.
- Open: the interop handlers' scope (v11's HTTP batch links, `wsLink`, SSE), codemod tooling.
