# The home page keeps trpc.io's "As used by", without links (human asked)

- Human, 2026-10-20: "keep the old v11 'as used by' on the website but make it nicer (don't backlink the companies)".
- Human, 2026-10-20: "feel free to grab newer SVGs from official resources (company brand/press kits, official sites) if that makes sense — e.g. where the v11 logos are outdated or low quality. Optimize them, keep the monochrome/no-link treatment."
- (agent) A band under the hero, for both versions: an "As used by" eyebrow over a marquee of the logos, faded at its edges, pausing on hover. With reduced motion it's still, the logos wrapped in centered rows.
- (agent) Each logo is a plain inline SVG in the muted text color, going to the text color on hover, so it reads on light and dark pages; no anchors. Heights are set per logo so wordmarks and badges read at one size, and every SVG has its `width` and `height`, so nothing shifts as the page loads.
- (agent) The ten companies of trpc.io's `www/static/logos/` (on `main`). Cal.com's, Google's, Legora's, Netflix's and Ping.gg's are v11's. The others are their current logos: Documenso's from its repo (`apps/remix/app/components/general/branding-logo.tsx`, replacing v11's PNG), Langfuse's from `langfuse.com/langfuse-wordart.svg`, Mistral's mark and wordmark from mistral.ai's header (v11 had the mark alone), PayPal's 2024 wordmark from `paypalobjects.com/paypal-ui/logos/svg/paypal-wordmark-color.svg`, and Pleo's from pleo.io's header.
- (agent) Each is scaled to a box 32 units tall cropped to its ink, run through svgo at 0.1 precision, and drawn once as a `<symbol>` that both copies of the marquee `<use>`: 14 kB of paths for all ten, from 32 kB of v11 files.
- Why: the companies vouch for tRPC without the page advertising them; one color keeps ten brands from fighting the page's own.
- Lost: the companies' colors, and v11's hover that brought them back.
- Open: nothing regenerates the paths; a new logo goes through the same steps by hand.
- Lives in: `next/www/src/components/used-by/`, `next/www/src/routes/index.tsx`, `next/www/src/styles.css`.
