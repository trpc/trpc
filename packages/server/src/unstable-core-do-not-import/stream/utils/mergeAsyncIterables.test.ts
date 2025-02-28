import { run } from '../../utils';
import { createDeferred } from './createDeferred';
import { mergeAsyncIterables } from './mergeAsyncIterables';

test('happy path', async () => {
  const merged = mergeAsyncIterables<string>();

  merged.add(
    run(async function* () {
      yield 'a:1';
      yield 'a:2';
    }),
  );

  merged.add(
    run(async function* () {
      yield 'b:1';
    }),
  );

  const aggregate: string[] = [];
  for await (const value of merged) {
    aggregate.push(value);
  }

  expect(aggregate).toEqual(['a:1', 'b:1', 'a:2']);
});

test('add iterable while iterating', async () => {
  const merged = mergeAsyncIterables<string>();

  const startB = createDeferred();
  const continueA = createDeferred();

  merged.add(
    run(async function* () {
      yield 'a:1';
      await continueA.promise;
      yield 'a:2';
    }),
  );

  startB.promise.then(() => {
    merged.add(
      run(async function* () {
        yield 'b:1';
        continueA.resolve();
      }),
    );
  });

  const aggregate: string[] = [];
  for await (const value of merged) {
    aggregate.push(value);
    startB.resolve();
  }

  expect(aggregate).toEqual(['a:1', 'b:1', 'a:2']);
});

test('iterators are returned() when disposed', async () => {
  const merged = mergeAsyncIterables<string>();

  const disposeSpy = vi.fn();
  const beforeFirst = vi.fn();
  const afterFirst = vi.fn();
  merged.add(
    run(async function* () {
      try {
        beforeFirst();
        yield 'a:1';
        afterFirst();
        yield 'a:2';
      } finally {
        disposeSpy();
      }
    }),
  );

  expect(beforeFirst).not.toHaveBeenCalled();

  const aggregate: string[] = [];
  for await (const value of merged) {
    aggregate.push(value);
    break;
  }

  expect(aggregate).toEqual(['a:1']);
  expect(beforeFirst).toHaveBeenCalled();
  expect(afterFirst).not.toHaveBeenCalled();
  expect(disposeSpy).toHaveBeenCalled();
});

test('cannot iterate twice', async () => {
  const merged = mergeAsyncIterables<string>();

  merged.add(
    run(async function* () {
      yield 'a:1';
    }),
  );

  for await (const _ of merged) {
    break;
  }

  await expect(async () => {
    for await (const _ of merged) {
    }
  }).rejects.toMatchInlineSnapshot(`[Error: Cannot iterate twice]`);
});

test('iterators are returned when error is thrown', async () => {
  const merged = mergeAsyncIterables<string>();

  const aDispose = vi.fn();
  const bDispose = vi.fn();

  merged.add(
    run(async function* () {
      try {
        yield 'a:1';
        throw new Error('test');
      } finally {
        aDispose();
      }
    }),
  );
  merged.add(
    run(async function* () {
      try {
        yield 'b:1';
        yield 'b:2';
      } finally {
        bDispose();
      }
    }),
  );

  const aggregate: string[] = [];
  await expect(async () => {
    for await (const value of merged) {
      aggregate.push(value);
    }
  }).rejects.toMatchInlineSnapshot(`[Error: test]`);

  expect(aDispose).toHaveBeenCalledOnce();
  expect(bDispose).toHaveBeenCalledOnce();

  expect(aggregate).toEqual(['a:1', 'b:1']);
});

test('empty', async () => {
  const merged = mergeAsyncIterables<string>();

  const aggregate: string[] = [];
  for await (const value of merged) {
    aggregate.push(value);
  }

  expect(aggregate).toEqual([]);
});
