import { getFetch } from '../src/getFetch';

describe('getFetch() from...', () => {
  test('passed', () => {
    const sym: any = Symbol('test');
    expect(getFetch(sym)).toBe(sym);
  });
  test('window', () => {
    const sym: any = Symbol('test');

    (global as any).fetch = undefined;
    (global as any).window = {};
    (global as any).window.fetch = sym;
    expect(getFetch()).toBe(sym);
  });
  test('global', () => {
    const sym: any = Symbol('test');

    (global as any).fetch = sym;
    delete (global as any).window;
    expect(getFetch()).toBe(sym);
  });
  test('neither -> throws', () => {
    (global as any).fetch = undefined;
    (global as any).window = undefined;
    expect(() => getFetch()).toThrowError();
  });
});
