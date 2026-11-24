import { TRPCClientError } from '../../TRPCClientError';
import type { HTTPResult } from './httpUtils';
import { resolveHTTPLinkOptions } from './httpUtils';
import type {
  PipelinedCallSettled,
  PipelinedRunsNode,
  Settles,
} from './pipeline';
import {
  createOperationPipeline,
  experimental_pipelining,
  outcomeOf,
  pipeCall,
  pipelineContext,
  readPipelinedRun,
  settlePipelinedCall,
  settles,
} from './pipeline';

const meta = { response: {} as HTTPResult['meta']['response'] };

function node(value: PipelinedRunsNode) {
  return settles(
    () => value,
    () => ({}),
  );
}

describe('outcomes', () => {
  test('`settles()` and `outcomeOf()` never reject', async () => {
    await expect(
      settles(
        () => Promise.reject(new Error('no')),
        (cause) => (cause as Error).message,
      ),
    ).resolves.toBe('no');
    await expect(outcomeOf(Promise.reject(new Error('no')))).resolves.toEqual({
      ok: false,
      error: new Error('no'),
    });
    await expect(outcomeOf(Promise.resolve(1))).resolves.toEqual({
      ok: true,
      data: 1,
    });
  });

  test('a promise that can reject is no `Settles`', () => {
    // @ts-expect-error only `settles()` makes one
    const settled: Settles<number> = Promise.resolve(1);
    expect(settled).toBeInstanceOf(Promise);
  });
});

describe('settlePipelinedCall', () => {
  // What the server sends a call that reads a failed source, which it marks
  // so beside the error, in its envelope
  const error = TRPCClientError.from({
    error: { message: 'source failed', code: -32012, data: {} },
  });
  const ranWithError: PipelinedCallSettled = {
    status: 'ran',
    outcome: { ok: false, error },
  };

  test('a call that failed with a failed source that has arrived did not run', () => {
    expect(
      settlePipelinedCall({
        own: ranWithError,
        mark: 'source-failed',
        sourcesOk: [true, false],
        asWhole: false,
      }),
    ).toEqual({ status: 'not-run', error });
  });

  test("a call's own error, with a failed source that has arrived, says it ran", () => {
    const own: PipelinedCallSettled = {
      status: 'ran',
      outcome: {
        ok: false,
        error: TRPCClientError.from({
          error: { message: 'no team', code: -32004, data: {} },
        }),
      },
    };
    expect(
      settlePipelinedCall({
        own,
        mark: null,
        sourcesOk: [false],
        asWhole: false,
      }),
    ).toBe(own);
  });

  test("a call's own error with the code the server sends a call that reads a failed source, but without its mark, says it ran", () => {
    const own: PipelinedCallSettled = {
      status: 'ran',
      outcome: {
        ok: false,
        error: TRPCClientError.from({
          error: { message: 'no team', code: -32012, data: {} },
        }),
      },
    };
    expect(
      settlePipelinedCall({
        own,
        mark: null,
        sourcesOk: [false],
        asWhole: false,
      }),
    ).toBe(own);
  });

  test("a call's own error with the mark in its `data`, which the app's `errorFormatter` makes, but not beside it, says it ran", () => {
    const own: PipelinedCallSettled = {
      status: 'ran',
      outcome: {
        ok: false,
        error: TRPCClientError.from({
          error: {
            message: 'no team',
            code: -32004,
            data: { pipeline: 'source-failed' },
          },
        }),
      },
    };
    expect(
      settlePipelinedCall({
        own,
        mark: null,
        sourcesOk: [false],
        asWhole: false,
      }),
    ).toBe(own);
  });

  test("a call whose error is the request's did not run", () => {
    const refused = new Error('refused');
    const own: PipelinedCallSettled = {
      status: 'ran',
      outcome: { ok: false, error: refused },
    };
    expect(
      settlePipelinedCall({
        own,
        mark: null,
        sourcesOk: [null],
        asWhole: true,
      }),
    ).toEqual({ status: 'not-run', error: refused });
  });

  test("a call's error is its own while no failed source has arrived", () => {
    expect(
      settlePipelinedCall({
        own: ranWithError,
        mark: 'source-failed',
        sourcesOk: [true, null],
        asWhole: false,
      }),
    ).toBe(ranWithError);
  });

  test('a call with data ran, whatever its sources did', () => {
    const ran: PipelinedCallSettled = {
      status: 'ran',
      outcome: { ok: true, data: { kind: 'once', data: 1 } },
    };
    expect(
      settlePipelinedCall({
        own: ran,
        mark: null,
        sourcesOk: [false],
        asWhole: false,
      }),
    ).toBe(ran);
  });
});

describe('readPipelinedRun', () => {
  test('a run in a list that could not run fails with the list’s error', async () => {
    const runs = node({
      items: {
        0: node({ items: { 0: node({ result: { data: 'a' } }) } }),
        1: node({
          error: { message: 'too many', code: -32600, data: {} },
          pipeline: null,
        }),
      },
    });

    expect(await readPipelinedRun(runs, [0, 0])).toEqual({
      kind: 'data',
      data: 'a',
    });
    const failed = await readPipelinedRun(runs, [1, 0]);
    expect(failed.kind).toBe('error');
    expect(failed.kind === 'error' && failed.error).toBeInstanceOf(
      TRPCClientError,
    );
    expect(await readPipelinedRun(runs, [2, 0])).toEqual({ kind: 'missing' });
    expect(await readPipelinedRun(runs, [0])).toEqual({ kind: 'missing' });
  });

  test("a run's error has the mark the server put beside it, or the list's it is in, and none in its `data` counts", async () => {
    const sourceFailed = {
      message: 'source failed',
      code: -32012,
      data: { pipeline: 'not-run' },
    };
    const runs = node({
      items: {
        0: node({
          items: {
            0: node({ error: sourceFailed, pipeline: 'source-failed' }),
            1: node({ error: sourceFailed, pipeline: null }),
          },
        }),
        1: node({ error: sourceFailed, pipeline: 'source-failed' }),
      },
    });

    expect(await readPipelinedRun(runs, [0, 0])).toMatchObject({
      kind: 'error',
      mark: 'source-failed',
    });
    expect(await readPipelinedRun(runs, [0, 1])).toMatchObject({
      kind: 'error',
      mark: null,
    });
    expect(await readPipelinedRun(runs, [1, 0])).toMatchObject({
      kind: 'error',
      mark: 'source-failed',
    });
  });
});

const linkOpts = { url: 'http://localhost' };

describe('a pipelined call', () => {
  test('a malformed result fails its call by itself, and its siblings keep their data', async () => {
    const pipelining = experimental_pipelining()(linkOpts, false);
    const pipeline = createOperationPipeline();
    const op = {
      context: pipelineContext(pipeline),
      type: 'query' as const,
      path: 'post',
      input: undefined,
    };
    pipelining.open(op);
    const reads = {
      each: null,
      reads: [
        { kind: 'whole' as const, to: ['id'], from: pipeline, path: ['id'] },
      ],
    };
    const malformed = pipeCall({ path: 'author', input: {}, reads });
    const sibling = pipeCall({ path: 'team', input: {}, reads });
    assert(malformed && sibling);
    const taken = pipelining.take([op]);
    assert(taken);

    taken.settle(
      Promise.resolve([
        { json: { result: { data: { id: 'ada' } } }, meta },
        { json: null as unknown as HTTPResult['json'], meta },
        { json: { result: { data: 'Team' } }, meta },
      ]),
    );

    // Bounded: a call left pending fails the test rather than hangs
    const settled = vi.fn();
    void malformed.settled.then(settled);
    await vi.waitFor(() => expect(settled).toHaveBeenCalled());
    expect(settled.mock.calls[0]![0]).toMatchObject({
      status: 'ran',
      outcome: { ok: false },
    });
    expect(await sibling.settled).toEqual({
      status: 'ran',
      outcome: { ok: true, data: { kind: 'once', data: 'Team' } },
    });
  });

  test('settles once: what a response says after its final state is ignored', async () => {
    const pipelining = experimental_pipelining()(linkOpts, false);
    const pipeline = createOperationPipeline();
    const op = {
      context: pipelineContext(pipeline),
      type: 'query' as const,
      path: 'post',
      input: undefined,
    };
    pipelining.open(op);
    const call = pipeCall({
      path: 'author',
      input: { id: undefined },
      reads: {
        each: null,
        reads: [{ kind: 'whole', to: ['id'], from: pipeline, path: ['id'] }],
      },
    });
    assert(call);
    expect(call.state).toEqual({ status: 'waiting' });

    const taken = pipelining.take([op]);
    assert(taken);
    expect(call.state).toEqual({ status: 'sent' });
    taken.settle(Promise.reject(new Error('request failed')));
    expect(await call.settled).toEqual({
      status: 'not-run',
      error: new Error('request failed'),
    });

    // A response for the same calls, after the call has its final state
    taken.settle(
      Promise.resolve([
        { json: { result: { data: { id: 'ada' } } }, meta },
        { json: { result: { data: 'Ada' } }, meta },
      ]),
    );
    pipelining.close(op);
    // Every step the response takes has run
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(call.state).toEqual({
      status: 'not-run',
      error: new Error('request failed'),
    });
    expect(call.status).toBe('unresolved');
    await expect(call.result).rejects.toThrow('request failed');
  });
});
