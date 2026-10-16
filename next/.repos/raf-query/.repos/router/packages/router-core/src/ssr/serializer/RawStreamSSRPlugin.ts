import { createPlugin } from 'seroval'
import { RawStream } from './RawStream'
import { encodeText, pumpEncodedStream, toBase64 } from './rawStreamCodec'
import type { PluginInfo, SerovalNode } from 'seroval'

// This module is server-only. Node's Buffer encodes base64 ~25x faster than
// the web fallback; the view avoids copying the chunk first.
const nodeBuffer: typeof Buffer | undefined = (globalThis as any).Buffer
const toBase64Fast = nodeBuffer
  ? (bytes: Uint8Array) =>
      nodeBuffer
        .from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
        .toString('base64')
  : toBase64

const BINARY_FACTORY = () => {}
const TEXT_FACTORY = () => {}
type RawStreamFactory = typeof BINARY_FACTORY

// These factories are injected into HTML and must be self-contained. Clearing
// both captured values on terminal events releases Seroval's encoded buffer.
const FACTORY_BINARY = `((s,u=1)=>new ReadableStream({start(c,f){f=s.on({next(b){const d=atob(b),a=new Uint8Array(d.length);for(let i=0;i<d.length;i++)a[i]=d.charCodeAt(i);c.enqueue(a)},throw(e){s=u=0;c.error(e)},return(){s=u=0;c.close()}});u=u&&f},cancel(){u&&u()}}))`

const FACTORY_TEXT = `((s,u=1,e=new TextEncoder)=>new ReadableStream({start(c,f){f=s.on({next(v){const x=v.slice(1);if(v[0]==='t')c.enqueue(e.encode(x));else{const d=atob(x),a=new Uint8Array(d.length);for(let i=0;i<d.length;i++)a[i]=d.charCodeAt(i);c.enqueue(a)}},throw(x){s=u=0;c.error(x)},return(){s=u=0;c.close()}});u=u&&f},cancel(){u&&u()}}))`

function makeFactoryPlugin(
  tag: string,
  sentinel: RawStreamFactory,
  source: string,
) {
  return createPlugin<RawStreamFactory, PluginInfo>({
    tag,
    test(value) {
      return value === sentinel
    },
    parse: {
      stream() {
        return {}
      },
    },
    serialize() {
      return source
    },
    deserialize: undefined as never,
  })
}

const RawStreamFactoryBinaryPlugin = /* @__PURE__ */ makeFactoryPlugin(
  'tss/RawStreamFactory',
  BINARY_FACTORY,
  FACTORY_BINARY,
)

const RawStreamFactoryTextPlugin = /* @__PURE__ */ makeFactoryPlugin(
  'tss/RawStreamFactoryText',
  TEXT_FACTORY,
  FACTORY_TEXT,
)

interface RawStreamSSRNode extends PluginInfo {
  factory: SerovalNode
  stream: SerovalNode
}

/** SSR-only RawStream plugin for streaming JavaScript into HTML. */
export const RawStreamSSRPlugin = /* @__PURE__ */ createPlugin<
  RawStream,
  RawStreamSSRNode
>({
  tag: 'tss/RawStream',
  extends: [RawStreamFactoryBinaryPlugin, RawStreamFactoryTextPlugin],
  test(value: unknown) {
    return value instanceof RawStream
  },
  parse: {
    stream(value, ctx) {
      const text = value.hint === 'text'
      const factory = ctx.parse(text ? TEXT_FACTORY : BINARY_FACTORY)
      const [stream, stop] = pumpEncodedStream(
        value.stream,
        text ? encodeText : toBase64Fast,
      )
      ctx.addCleanup(stop)
      return { factory, stream: ctx.parse(stream) }
    },
  },
  serialize(node, ctx) {
    return (
      '(' +
      ctx.serialize(node.factory) +
      ')(' +
      ctx.serialize(node.stream) +
      ')'
    )
  },
  deserialize: undefined as never,
})
