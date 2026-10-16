---
name: vendored-assets
description: Vendored assets. Use when importing or updating checked-in third-party or externally generated JavaScript, CSS, registries, schemas, snapshots, or Scalar, Swagger, and MIME artifacts.
---

Treat upstream artifacts as supply-chain inputs. Change their generator or
documented import source, then regenerate; generated output is review evidence,
not an editing surface.

## Workflow

1. **Trace ownership.** Identify the artifact, generator or exact import
   procedure, upstream source/version, license, consumers, tests, and shipped
   package or bundle. Search by asset and upstream project name to find current
   packaging scripts, generated artifacts, consumers, and history.
   Continue when every input and consumer is accounted for.
2. **Pin provenance.** Resolve moving URLs, tags, branches, and omitted versions
   to an immutable release or artifact. Record project, version, path or URL,
   and digest in the generator or maintenance header. Omit a digest only when
   another enforced immutable source is recorded.
   Continue when a future run cannot silently select different bytes.
3. **Clear the license gate.** Verify release metadata, license files, bundled
   notices, and the license trail retained in the distributed form.
   Continue when every distributed artifact has a verified retained license trail.
4. **Regenerate.** Improve the generator or import reference first. Recover an
   exact procedure for generatorless assets; add a deterministic script only
   for recurring updates. Record a one-off procedure beside the artifact. A
   clean rerun must produce no diff.
5. **Audit the complete diff.** Account for behavior, URLs and runtime fetches,
   source maps, notices, encoding, format changes, and additions or removals.
   For browser assets, also read [browser-assets.md](browser-assets.md).
   Continue when every change is attributable and suspicious content is resolved
   or reported.
6. **Clear test and size gates.** Record byte sizes before and after, use
   focused consumer tests, and compare bundle size or composition when shipped
   JavaScript, CSS, or registry output changes materially. Compare that output
   against the pre-update revision rather than measuring only current size.
   Continue when focused checks pass and every non-trivial size delta is explained.
7. **Close release impact.** Apply root changeset routing for consumer-visible
   behavior, browser support, wire data, or meaningful shipped-size changes.
   Generated sections owned by barrels, AI docs, or migration tooling remain
   with the owners named in root instructions.

The task is complete when every input and consumer is accounted for, provenance
and licenses are immutable and retained, regeneration is deterministic, every
output change and non-trivial size delta is explained, focused checks pass or
are reported as not runnable, and release impact is recorded.
