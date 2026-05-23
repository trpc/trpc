import { dataLoader } from './dataLoader';

afterEach(() => {
  vi.useRealTimers();
});

test('cancels a pending item before dispatch', async () => {
  vi.useFakeTimers();

  const fetch = vi.fn(async () => ['one']);
  const loader = dataLoader<string, string>({
    validate: () => true,
    fetch,
  });

  const request = loader.load('one');
  const rejection = expect(request.promise).rejects.toThrow('Aborted');

  request.cancel();
  await vi.runAllTimersAsync();

  await rejection;
  expect(fetch).not.toHaveBeenCalled();
});

test('aborts an in-flight batch when all items are cancelled', async () => {
  vi.useFakeTimers();

  const batchSignalRef: { current?: AbortSignal } = {};
  const fetch = vi.fn(
    (_keys: string[], opts: { signal: AbortSignal }) =>
      new Promise<string[]>(() => {
        batchSignalRef.current = opts.signal;
      }),
  );
  const loader = dataLoader<string, string>({
    validate: () => true,
    fetch,
  });

  const request1 = loader.load('one');
  const request2 = loader.load('two');

  await vi.runAllTimersAsync();

  expect(fetch).toHaveBeenCalledTimes(1);
  const batchSignal = batchSignalRef.current;
  if (!batchSignal) {
    throw new Error('Expected batch signal');
  }
  expect(batchSignal.aborted).toBe(false);

  const rejection1 = expect(request1.promise).rejects.toThrow('Aborted');
  const rejection2 = expect(request2.promise).rejects.toThrow('Aborted');

  request1.cancel();
  expect(batchSignal.aborted).toBe(false);

  request2.cancel();
  expect(batchSignal.aborted).toBe(true);

  await rejection1;
  await rejection2;
});

test('aborts an in-flight batch when remaining unsettled items are cancelled', async () => {
  vi.useFakeTimers();

  const batchSignalRef: { current?: AbortSignal } = {};
  let resolveFirstItem: (value: string) => void = () => {
    throw new Error('Expected first item resolver');
  };
  const fetch = vi.fn((_keys: string[], opts: { signal: AbortSignal }) =>
    Promise.resolve([
      new Promise<string>((resolve) => {
        batchSignalRef.current = opts.signal;
        resolveFirstItem = resolve;
      }),
      new Promise<string>(() => void 0),
    ]),
  );
  const loader = dataLoader<string, string>({
    validate: () => true,
    fetch,
  });

  const request1 = loader.load('one');
  const request2 = loader.load('two');

  await vi.runAllTimersAsync();

  expect(fetch).toHaveBeenCalledTimes(1);
  const batchSignal = batchSignalRef.current;
  if (!batchSignal) {
    throw new Error('Expected batch signal');
  }

  resolveFirstItem('one');
  await expect(request1.promise).resolves.toBe('one');
  expect(batchSignal.aborted).toBe(false);

  const rejection2 = expect(request2.promise).rejects.toThrow('Aborted');
  request2.cancel();
  expect(batchSignal.aborted).toBe(true);

  await rejection2;
});
