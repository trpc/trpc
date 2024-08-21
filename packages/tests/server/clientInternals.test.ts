import { getFetch } from '@trpc/client';

describe('getFetch() from...', () => {
  test('passed', () => {
    const customImpl: any = () => true;
    expect(getFetch(customImpl)).toBe(customImpl);
  });
  test('window', () => {
    (global as any).fetch = undefined;
    (global as any).window = {
      fetch: () => 42,
    };
    expect(getFetch()('')).toBe(42);
  });
  test('global', () => {
    (global as any).fetch = () => 1337;
    (global as any).window = undefined;
    delete (global as any).window;
    expect(getFetch()('')).toBe(1337);
  });
  test('window w. undefined fetch -> global', () => {
    (global as any).fetch = () => 808;
    (global as any).window = {};
    expect(getFetch()('')).toBe(808);
  });
  test('neither -> throws', () => {
    (global as any).fetch = undefined;
    (global as any).window = undefined;
    expect(() => getFetch()).toThrowError();
  });
});
