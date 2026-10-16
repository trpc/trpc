# Start shared/client runtime

- RawStream RPC responses use binary frames; request arguments/static responses use JSON/base64; SSR uses injected script factories. Pair framing changes in `src/client-rpc/frame-decoder.ts` with `../start-server-core/src/frame-protocol.ts`. For API/serialization changes, validate affected paths through RawStream e2e and encoder/decoder tests.
- Preserve decoder limits and cancellation scopes: canceling one raw stream must leave sibling streams usable; canceling the JSON stream cancels the whole response. Keep malformed/truncated-frame, unread-stream, and split-header coverage in `tests/frame-decoder.test.ts`.
- Context crosses a trust boundary. Use `safeObjectMerge`/`createNullProtoObject`; preserve trusted server middleware context over client-sent context, including SSR and FormData calls. The `server-functions-global-middleware` e2e suite covers that precedence.
