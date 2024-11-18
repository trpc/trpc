// Callback function type that is called when a collection is drained
type OnDrain = () => void;

// Interface for objects that can be activated
export interface RefCount {
  activate(): void;
}

// Map type that includes ref counting capabilities
export interface RefCountMap<TKey, TValue>
  extends Map<TKey, TValue>,
    RefCount {}

// Set type that includes ref counting capabilities
export interface RefCountSet<TValue> extends Set<TValue>, RefCount {}

/**
 * Adds reference counting capabilities to a Map or Set collection.
 * The collection can be activated, after which it will trigger a drain callback when emptied.
 * Once drained, the collection cannot be modified further.
 */
export function withRefCount<TKey, TValue>(
  map: Map<TKey, TValue>,
  onDrain: OnDrain,
): RefCountMap<TKey, TValue>;
export function withRefCount<TValue>(
  set: Set<TValue>,
  onDrain: OnDrain,
): RefCountSet<TValue>;
export function withRefCount(
  _obj: Set<any> | Map<any, any>,
  onDrain: OnDrain,
): RefCountMap<any, any> & RefCountSet<any> {
  const obj = _obj as any;

  // Track whether the collection has been drained
  let drained = false;
  // Track whether the collection has been activated
  let active = false;

  // Check if collection should be drained (empty and active)
  const checkDrain = () => {
    if (!drained && active && obj.size === 0) {
      onDrain();
      drained = true;
    }
  };

  // Create proxy to intercept collection operations
  return new Proxy(obj, {
    get(_, prop) {
      // Handle activation
      if (prop === 'activate') {
        return () => {
          active = true;
          checkDrain();
        };
      }

      // Handle adding items - prevent if already drained
      if (prop === 'set' || prop === 'add') {
        return (...args: any[]) => {
          if (drained) {
            throw new Error('Already drained');
          }

          return obj[prop](...args);
        };
      }

      // Handle removing items - check if should drain after
      if (prop === 'delete' || prop === 'clear') {
        return (...args: any[]) => {
          try {
            return obj[prop](...args);
          } finally {
            checkDrain();
          }
        };
      }
      // Pass through other method calls
      const target = obj[prop];
      if (typeof target === 'function') {
        return (...args: any[]) => {
          return obj[prop](...args);
        };
      }

      // Pass through property access
      return target;
    },
  }) as never as RefCountMap<any, any> & RefCountSet<any>;
}
