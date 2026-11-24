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
  /**
   * Each entry as the load has it, by whether it is waited for: a key that
   * isn't in `wait` and one that is can have the same entry
   */
  const entries = {
    waited: new Map<object, object>(),
    not: new Map<object, object>(),
  };
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
      // A TanStack Query entry keeps its proxy: the load checks that it is
      // the root's
      procedure: state ? state.procedure : procedureAt(shared.path),
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
    const isWaited = wait || waited.has(value);
    const done = isWaited ? entries.waited : entries.not;
    const existing = done.get(value);
    if (existing) {
      return existing;
    }
    let result: object;
    const fromData = fromDataStateOf(value);
    const perItem = perItemStateOf(value);
    const shared = queryEntryStateOf(value);
    if (fromData) {
      const inner = entryFor(fromData.entry, isWaited);
      const source = entryFor(fromData.source, false);
      result =
        inner === fromData.entry && source === fromData.source
          ? value
          : { [fromDataState]: { entry: inner, source } };
    } else if (perItem) {
      result =
        perItem.entry !== null &&
        (queryEntryStateOf(perItem.entry) || fromDataStateOf(perItem.entry))
          ? perItemFor(perItem.entry, perItem, value)
          : perItemFor(perItem.entry, perItem, null);
    } else if (shared) {
      const state = entryStateOf(value) ?? null;
      const kind: TRPCEntryKind =
        isWaited && (state?.kind ?? 'prefetch') === 'prefetch'
          ? 'ensure'
          : (state?.kind ?? 'prefetch');
      result = rebuilt({ value, state, shared, kind });
    } else {
      result = value;
    }
    done.set(value, result);
    return result;
  }

  /**
   * What an entry per item loads, for TanStack Query: an entry per item for
   * each entry the callback returned, in a group of the same keys, and
   * `skipToken` for `null`. Each loads in a request of its own per item,
   * and reads the item and the entries of the load only
   */
  function perItemFor(
    returned: object | null,
    perItem: { entry: object | null; list: EntryDataRef },
    /** The entry per item itself, kept as it is if nothing changes */
    same: object | null,
  ): object {
    if (returned === null) {
      return skipToken as unknown as object;
    }
    if (perItemStateOf(returned)) {
      throw new Error(
        '`loadHandles()` loads an entry per item of a list in another entry, not of a list in an item: load the inner list with `experimental_load()`',
      );
    }
    if (fromDataStateOf(returned)) {
      throw new Error(
        '`loadHandles()` loads a query per item, not an entry built from the data of another with `experimental_dataOf(entry, (data) => entry)`: load it with `experimental_load()`',
      );
    }
    if (queryEntryStateOf(returned)) {
      if (queryEntryStateOf(returned)?.type === 'infinite') {
        throw new Error(
          '`loadHandles()` loads a query per item, not an infinite query',
        );
      }
      const inner = entryFor(returned, false);
      const list = refFor(perItem.list);
      return same && inner === perItem.entry && list === perItem.list
        ? same
        : { [perItemState]: { entry: inner, list } };
    }
    return Object.fromEntries(
      Object.entries(returned).map(([key, member]) => [
        key,
        perItemFor(
          member as object | null,
          { entry: member as object | null, list: perItem.list },
          null,
        ),
      ]),
    );
  }

  function tree(values: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(values).map(([key, value]) => {
        if (value === null) {
          return [key, skipToken];
        }
        if (
          value === skipToken ||
          entryDataRefOf(value) ||
          typeof value !== 'object'
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

  return tree(opts.entries);
}
