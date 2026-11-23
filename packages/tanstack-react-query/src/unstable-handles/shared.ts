import { skipToken } from '@tanstack/react-query';
import type {
  EntryDataRef,
  QueryEntryState,
} from '@trpc/client/unstable-internals';
import {
  createEntryDataRef,
  entryDataRefOf,
  fromDataState,
  fromDataStateOf,
  perItemState,
  perItemStateOf,
  queryEntryStateOf,
} from '@trpc/client/unstable-internals';
import type { EntryState, ProxyContext } from './entry';
import { entry, entryStateOf } from './entry';
import type { TRPCEntryKind } from './types';
import { isPlainObject } from './utils';

/**
 * A load's entries as TanStack Query entries, before anything reads them:
 * each entry of a description, from `experimental_query()` and the like,
 * becomes a prefetch entry of the root proxy, and each entry whose key is in
 * `wait` an ensure entry. Every `experimental_dataOf()` value then reads the
 * entry that took the place of the one it was built with, so the rest of a
 * load sees TanStack Query entries only. An entry that changes nothing stays
 * the object it was.
 */
export function toTanStackEntries(opts: {
  root: ProxyContext;
  entries: Record<string, unknown>;
  /** The keys whose entries the load waits for */
  wait: readonly string[];
}): Record<string, unknown> {
  const waited = new Set<object>();
  for (const key of opts.wait) {
    const value = opts.entries[key];
    if (!queryEntryStateOf(value) && !fromDataStateOf(value)) {
      throw new Error(
        `\`wait\` names "${key}", which is no entry of one query: only such an entry can be waited for`,
      );
    }
    waited.add(value as object);
  }
  const entries = new Map<object, object>();
  const refs = new Map<EntryDataRef, EntryDataRef>();

  function refFor(ref: EntryDataRef): EntryDataRef {
    let mapped = refs.get(ref);
    if (!mapped) {
      const source = entryFor(ref.entry, false);
      const itemOf = ref.itemOf && refFor(ref.itemOf);
      mapped =
        source === ref.entry && itemOf === ref.itemOf
          ? ref
          : { ...ref, entry: source, itemOf };
      refs.set(ref, mapped);
    }
    return mapped;
  }

  /** An input, with each `experimental_dataOf()` value reading the new entries */
  function inputFor(value: unknown): unknown {
    const ref = entryDataRefOf(value);
    if (ref) {
      const mapped = refFor(ref);
      return mapped === ref ? value : createEntryDataRef(mapped);
    }
    if (Array.isArray(value)) {
      const items = value.map(inputFor);
      return items.every((item, index) => item === value[index])
        ? value
        : items;
    }
    if (isPlainObject(value)) {
      const entries = Object.entries(value).map(
        ([key, item]) => [key, item, inputFor(item)] as const,
      );
      return entries.every(([, item, mapped]) => item === mapped)
        ? value
        : Object.fromEntries(entries.map(([key, , mapped]) => [key, mapped]));
    }
    return value;
  }

  function procedureAt(path: readonly string[]) {
    return path.reduce<any>(
      (procedure, key) => procedure[key],
      opts.root.proxy,
    );
  }

  /** A TanStack Query entry with what it reads of the new entries */
  function rebuilt(opts: {
    value: object;
    state: EntryState | null;
    shared: QueryEntryState;
    kind: TRPCEntryKind;
  }): object {
    const { state, shared, kind } = opts;
    const input = inputFor(shared.input);
    if (state?.kind === kind && input === state.input) {
      return opts.value;
    }
    const sharedOpts =
      shared.type === 'infinite'
        ? {
            ...(shared.initialCursor !== undefined
              ? { initialCursor: shared.initialCursor }
              : {}),
            ...(shared.getNextPageParam
              ? { getNextPageParam: shared.getNextPageParam }
              : {}),
          }
        : {};
    return entry({
      fn:
        state?.fn ??
        (shared.type === 'infinite'
          ? 'experimental_infiniteQuery'
          : 'experimental_query'),
      type: shared.type,
      kind,
      procedure: procedureAt(shared.path),
      input,
      opts: state
        ? state.opts
        : {
            ...sharedOpts,
            ...(shared.context ? { trpc: { context: shared.context } } : {}),
          },
    });
  }

  function entryFor(value: object, wait: boolean): object {
    const existing = entries.get(value);
    if (existing) {
      return existing;
    }
    let result: object;
    const fromData = fromDataStateOf(value);
    const perItem = perItemStateOf(value);
    const shared = queryEntryStateOf(value);
    if (fromData) {
      const inner = entryFor(fromData.entry, wait || waited.has(value));
      const source = entryFor(fromData.source, false);
      result =
        inner === fromData.entry && source === fromData.source
          ? value
          : { [fromDataState]: { entry: inner, source } };
    } else if (perItem) {
      const inner = entryFor(perItem.entry, false);
      const list = refFor(perItem.list);
      result =
        inner === perItem.entry && list === perItem.list
          ? value
          : { [perItemState]: { entry: inner, list } };
    } else if (shared) {
      const state = entryStateOf(value) ?? null;
      const kind: TRPCEntryKind =
        (wait || waited.has(value)) &&
        (state?.kind ?? 'prefetch') === 'prefetch'
          ? 'ensure'
          : (state?.kind ?? 'prefetch');
      result = rebuilt({ value, state, shared, kind });
    } else {
      result = value;
    }
    entries.set(value, result);
    return result;
  }

  function tree(values: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(values).map(([key, value]) => {
        if (
          value === skipToken ||
          entryDataRefOf(value) ||
          typeof value !== 'object' ||
          value === null
        ) {
          return [key, value];
        }
        if (
          queryEntryStateOf(value) ||
          fromDataStateOf(value) ||
          perItemStateOf(value)
        ) {
          return [key, entryFor(value, false)];
        }
        return [key, isPlainObject(value) ? tree(value) : value];
      }),
    );
  }

  return opts.wait.length === 0 && !hasDescriptionEntry(opts.entries, new Set())
    ? opts.entries
    : tree(opts.entries);
}

/**
 * Whether a load has an entry of a description, which isn't one of TanStack
 * Query yet, anywhere in it: in a group, or read by another entry
 */
function hasDescriptionEntry(value: unknown, seen: Set<object>): boolean {
  if (typeof value !== 'object' || value === null || seen.has(value)) {
    return false;
  }
  seen.add(value);
  const shared = queryEntryStateOf(value);
  if (shared) {
    return (
      !entryStateOf(value) ||
      shared.refs.some((ref) => hasDescriptionEntry(ref.entry, seen))
    );
  }
  const fromData = fromDataStateOf(value);
  if (fromData) {
    return (
      hasDescriptionEntry(fromData.entry, seen) ||
      hasDescriptionEntry(fromData.source, seen)
    );
  }
  const perItem = perItemStateOf(value);
  if (perItem) {
    return (
      hasDescriptionEntry(perItem.entry, seen) ||
      hasDescriptionEntry(perItem.list.entry, seen)
    );
  }
  return isPlainObject(value)
    ? Object.values(value).some((it) => hasDescriptionEntry(it, seen))
    : false;
}
