/**
 * Wire serializers. The default is `jsonSerializer`, plain JSON.
 * `createSerializer()` is a port of [danSON](https://github.com/KATT/danson),
 * and `createSyncSerializer` wraps superjson-style transformers.
 *
 * With danSON, plain JSON stays plain JSON. Non-JSON values (`Date`, `Map`, `Set`,
 * `BigInt`, `undefined`, typed arrays, …) become inline
 * `{ _: '$', type, value }` markers, and repeated or circular references become
 * `$n` refs. Deferred values (`Promise`, `AsyncIterable`, `ReadableStream`) can
 * be streamed as chunks after the head.
 *
 * The serializer is configured on the endpoint: pass the same one to
 * `createFetchHandler({ serializer })` and `httpLink({ serializer })`.
 *
 * @module
 */
import type { Effect, Stream } from 'effect';
import type { DansonForm, OutputForm } from '../internal/types.ts';
import {
  deserializers as stdDeserializers,
  inputDeserializers as stdInputDeserializers,
  serializers as stdSerializers,
  deserializeStream,
  serializeDeferred,
  type Frame,
  type SerializedDeferred,
  deserializeSync,
  instancesOnly,
  serializeSync,
  type DeserializeOptions,
  type DeserializeRecord,
  type SerializeRecord,
  type SerializeReturn,
  DansonError,
} from './danson/index.ts';

export {
  type Chunk,
  type Frame,
  type SerializedDeferred,
  type DeserializeRecord,
  type SerializeRecord,
  type SerializeReturn,
  DansonError,
  type JsonValue,
} from './danson/index.ts';
export type {
  ClientValue,
  DansonForm,
  JsonForm,
  JsonOf,
  OutputForm,
  SyncForm,
} from '../internal/types.ts';
export {
  createSyncSerializer,
  jsonSerializer,
  type SyncSerializerOptions,
  type SyncTransformer,
} from './framed.ts';
export type { FormOfSerializer } from '../internal/types.ts';

/**
 * A custom type the serializer understands.
 *
 * @example
 * ```ts
 * const decimal: CustomType<Decimal, string> = {
 *   is: (v) => v instanceof Decimal,
 *   serialize: (v) => v.toString(),
 *   deserialize: (s) => new Decimal(s),
 * };
 * createSerializer({ types: { Decimal: decimal } });
 * ```
 * @since 0.1.0
 * @stability stable
 */
export interface CustomType<T, TSerialized = unknown> {
  /** Whether `value` is of this type. */
  is: (value: unknown) => value is T;
  /** Converts the value into something the serializer understands. */
  serialize: (value: T) => TSerialized;
  /** Rebuilds the value. */
  deserialize: (value: TSerialized) => T;
  /**
   * Accept this type in procedure inputs.
   * @default true
   */
  input?: boolean;
}

/**
 * @since 0.1.0
 * @stability stable
 */
export interface SerializerOptions {
  /** Custom types, keyed by the name used on the wire. */
  types?: Record<string, CustomType<any, any>>;
  /**
   * Max nesting depth accepted when deserializing.
   * @default 64
   */
  maxDepth?: number;
}

/**
 * @since 0.1.0
 * @stability stable
 */
export interface DeserializeOpts {
  /**
   * Deserializing untrusted input. Types that are unsafe to accept from a
   * client (`RegExp`, ReDoS) are rejected.
   */
  input?: boolean | undefined;
  /** The multipart parts that `File` and `Blob` markers refer to. */
  parts?: ReadonlyArray<Blob> | undefined;
}

/**
 * @since 0.1.0
 * @stability stable
 */
export interface SerializeOpts {
  /**
   * Collects `File` and `Blob` values, which are replaced by references to
   * their index. Without it, they throw.
   */
  parts?: Blob[] | undefined;
}

/**
 * Converts values to and from the wire format. Both ends of an endpoint must
 * use compatible serializers. `TForm` is which output types survive, for
 * client types.
 *
 * @since 0.1.0
 * @stability stable
 */
export interface Serializer<TForm extends OutputForm = DansonForm> {
  /**
   * Names the wire format. The handler sends it in a `trpc-serializer`
   * header, and a link with another one fails with an error naming both.
   */
  readonly name: string;
  /**
   * `streaming` handles deferred values and files at any depth; with `sync`
   * and `none` the transport frames root streams and promises only.
   */
  readonly kind: 'streaming' | 'sync' | 'none';
  /** Type-only: the output form. */
  readonly '~form'?: TForm;
  /** Serializes a value with no deferred parts. Throws on a `Promise` or stream. */
  serialize(value: unknown, opts?: SerializeOpts): SerializeReturn;
  deserialize<T = unknown>(value: SerializeReturn, opts?: DeserializeOpts): T;
  /** Serializes a value that may hold deferred parts. */
  serializeDeferred(
    value: unknown,
    opts?: { coerceError?: (cause: unknown) => unknown },
  ): SerializedDeferred;
  /** Rebuilds a value from its head frame and chunks. */
  deserializeStream<T, E>(
    frames: Stream.Stream<Frame, E>,
    opts?: {
      reviveError?: (value: unknown) => unknown;
      /** What open deferred values reject with when the frames die. */
      streamFailed?: (cause: unknown) => unknown;
      /** What open deferred values reject with when the frames end early. */
      streamInterrupted?: () => unknown;
    },
  ): Effect.Effect<T, E | DansonError>;
}

interface PartsContext {
  readonly parts: Blob[] | undefined;
  indexes?: Map<Blob, number>;
}

const addPart = (blob: Blob, ctx: PartsContext) => {
  if (!ctx.parts) {
    throw new DansonError(
      'A File or Blob can only be sent as an input over httpLink',
    );
  }
  ctx.indexes ??= new Map();
  let index = ctx.indexes.get(blob);
  if (index === undefined) {
    index = ctx.parts.push(blob) - 1;
    ctx.indexes.set(blob, index);
  }
  return index;
};

/** `File` before `Blob`, since every `File` is a `Blob`. */
const partSerializers: SerializeRecord = {
  File: instancesOnly((v, ctx: PartsContext) =>
    typeof File !== 'undefined' && v instanceof File
      ? ({
          part: addPart(v, ctx),
          name: v.name,
          type: v.type,
          lastModified: v.lastModified,
        } satisfies PartRef)
      : false,
  ),
  Blob: instancesOnly((v, ctx: PartsContext) =>
    v instanceof Blob
      ? ({ part: addPart(v, ctx), type: v.type } satisfies PartRef)
      : false,
  ),
};

/**
 * Creates a danSON-based serializer, optionally with extra types. It keeps
 * native types (`Date`, `Map`, `File`, …) and streams deferred values in one
 * pass. Pass it to both the handler and the link.
 *
 * @example
 * ```ts
 * const serializer = createSerializer({ types: { Decimal: decimal } });
 * createFetchHandler({ router, serializer });
 * httpLink({ url, serializer });
 * ```
 * @since 0.1.0
 * @stability stable
 */
export function createSerializer(opts: SerializerOptions = {}): Serializer {
  const customSerializers: SerializeRecord = {};
  const customDeserializers: DeserializeRecord = {};
  const customInputDeserializers: DeserializeRecord = {};
  for (const [name, type] of Object.entries(opts.types ?? {})) {
    customSerializers[name] = (v) => (type.is(v) ? type.serialize(v) : false);
    customDeserializers[name] = (v) => type.deserialize(v);
    if (type.input !== false) {
      customInputDeserializers[name] = customDeserializers[name];
    }
  }
  const serializers = { ...customSerializers, ...stdSerializers };
  const withParts = { ...serializers, ...partSerializers };
  const output: DeserializeOptions = {
    deserializers: { ...stdDeserializers, ...customDeserializers },
    maxDepth: opts.maxDepth,
  };
  const input: DeserializeOptions = {
    deserializers: { ...stdInputDeserializers, ...customInputDeserializers },
    maxDepth: opts.maxDepth,
  };
  const de = (o?: DeserializeOpts) => {
    const base = o?.input ? input : output;
    if (!o?.parts) return base;
    return {
      ...base,
      deserializers: { ...base.deserializers, ...partDeserializers(o.parts) },
    };
  };

  return {
    name: 'danson',
    kind: 'streaming',
    serialize: (value, o) =>
      serializeSync(value, {
        serializers: withParts,
        context: { parts: o?.parts } satisfies PartsContext,
      }),
    deserialize: (value, o) => deserializeSync(value, de(o)),
    serializeDeferred: (value, o) =>
      serializeDeferred(value, { serializers, coerceError: o?.coerceError }),
    deserializeStream: (frames, o) =>
      deserializeStream(frames, { ...output, ...o }),
  };
}

interface PartRef {
  part: number;
  name?: string;
  type: string;
  lastModified?: number;
}

function partDeserializers(parts: ReadonlyArray<Blob>): DeserializeRecord {
  const get = (ref: PartRef) => {
    const blob =
      ref && typeof ref.part === 'number' ? parts[ref.part] : undefined;
    if (!blob) throw new DansonError('Missing multipart part');
    return blob;
  };
  return {
    File: (ref: PartRef) =>
      new File([get(ref)], String(ref.name ?? 'blob'), {
        type: String(ref.type ?? ''),
        ...(ref.lastModified === undefined
          ? {}
          : { lastModified: ref.lastModified }),
      }),
    Blob: (ref: PartRef) => {
      const blob = get(ref);
      return blob.slice(0, blob.size, String(ref.type ?? ''));
    },
  };
}

/**
 * Any serializer, whatever its output form.
 * @since 0.1.0
 * @stability stable
 */
export type AnySerializer = Serializer<OutputForm>;
