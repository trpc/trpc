import { expect, test, vi } from 'vitest';
import { withRefCount } from './withRefCount';

test('Map', () => {
  const onDrain = vi.fn();
  const map = withRefCount(new Map(), onDrain);

  map.set('key', 1);
  expect(onDrain).not.toHaveBeenCalled();

  map.activate();
  expect(onDrain).not.toHaveBeenCalled();

  expect(map.size).toBe(1);
  expect(map.get('key')).toBe(1);
  expect(Array.from(map.keys())).toEqual(['key']);

  map.delete('key');
  expect(onDrain).toHaveBeenCalledTimes(1);
});

test('Set', () => {
  const onDrain = vi.fn();
  const set = withRefCount(new Set(), onDrain);

  set.add('item');
  expect(onDrain).not.toHaveBeenCalled();

  set.activate();
  expect(onDrain).not.toHaveBeenCalled();

  set.delete('item');
  expect(onDrain).toHaveBeenCalledTimes(1);
});
