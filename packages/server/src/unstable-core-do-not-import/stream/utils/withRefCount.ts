type OnDrain = () => void;
export interface RefCount {
  activate(): void;
}
export interface RefCountMap<TKey, TValue>
  extends Map<TKey, TValue>,
    RefCount {}

export interface RefCountSet<TValue> extends Set<TValue>, RefCount {}

export function withRefCount<TKey, TValue>(
  map: Map<TKey, TValue>,
  onDrain: OnDrain,
): RefCountMap<TKey, TValue>;
export function withRefCount<TValue>(
  set: Set<TValue>,
  onDrain: OnDrain,
): RefCountSet<TValue>;
export function withRefCount(
  obj: Set<any> | Map<any, any>,
  onDrain: OnDrain,
): RefCountMap<any, any> & RefCountSet<any> {
  const map = obj as Map<any, any>;
  const set = obj as Set<any>;

  const drained = false;
  let active = false;

  const checkDrain = () => {
    if (!drained && active && obj.size === 0) {
      onDrain();
    }
  };
  return new Proxy(obj, {
    get(target, prop) {
      if (prop === 'activate') {
        return () => {
          active = true;
          checkDrain();
        };
      }

      if (prop === 'add') {
        return (value: any) => {
          if (drained) {
            throw new Error('RefCountSet is drained');
          }
          return set.add(value);
        };
      }

      if (prop === 'set') {
        return (key: any, value: any) => {
          if (drained) {
            throw new Error('RefCountMap is drained');
          }
          return map.set(key, value);
        };
      }

      if (prop === 'delete' || prop === 'clear') {
        return (...args: any[]) => {
          try {
            return (target as any)[prop](...args);
          } finally {
            checkDrain();
          }
        };
      }

      return (target as any)[prop];
    },
  }) as never as RefCountMap<any, any> & RefCountSet<any>;
}
