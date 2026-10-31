# EventLog bandwidth

Run from the repository root, optionally passing the number of entries to write (default 1000):

```sh
nix develop -c pnpm --dir packages/effect exec node benchmark/eventlog/Bandwidth.ts 1000
```

Two devices with the same identity connect to one in-memory server through the socket RPC protocols with `RpcSerialization.layerSchemaBinary`. The sockets are in-memory, but every frame is serialized as it would be on a real connection, and the byte counts are the serialized frames. One device writes the entries one `EventLog.write` at a time; the other receives them.

Columns:

- `writer up` / `writer down`: bytes the writing device sent and received while writing, after the handshake.
- `reader down`: bytes the other device received.
- `resume sequence`: the writer journal's `nextRemoteSequence` afterwards.
- `resume down`: bytes a fresh connection receives when it resumes changes from that sequence.

The file only uses APIs that predate write acknowledgements, so it can be copied into an older checkout to compare.
