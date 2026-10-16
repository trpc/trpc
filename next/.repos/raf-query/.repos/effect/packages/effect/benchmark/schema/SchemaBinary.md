# SchemaBinary benchmark

Run the benchmark from the repository root:

```sh
nix develop -c pnpm --dir packages/effect exec node benchmark/schema/SchemaBinary.ts
```

The benchmark compares SchemaBinary's default and fingerprint modes with JSON and Protobuf. It measures encoded, gzip, and zstd sizes together with one-shot encode/decode throughput.

The streaming section compares reusable SchemaBinary parsers, Protobuf delimited decoding, and NDJSON channels. It covers single frames, batches, and frames fragmented after the first byte. Codec, schema, and Protobuf descriptor construction are excluded from timings.

Compare formats within the same case and run. Absolute throughput varies with the machine and runtime.
