import { EventEmitter } from 'events';
import { ipcLink } from '../src/ipcLink';

// ---------------------------------------------------------------------------
// Mock child_process.spawn
// ---------------------------------------------------------------------------

interface MockChild extends EventEmitter {
  stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: ReturnType<typeof vi.fn>;
}

function createMockChild(): MockChild {
  const child = new EventEmitter() as MockChild;
  child.stdin = { write: vi.fn(), end: vi.fn() };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn();
  return child;
}

let mockChild: MockChild;

const { spawnMock } = vi.hoisted(() => {
  return { spawnMock: vi.fn((): any => undefined) };
});

vi.mock('child_process', () => ({
  spawn: spawnMock,
  default: { spawn: spawnMock },
}));

beforeEach(() => {
  mockChild = createMockChild();
  spawnMock.mockReset();
  spawnMock.mockReturnValue(mockChild);
});

// Helper: build a minimal tRPC operation
function makeOp(overrides: Partial<{ type: string; path: string; input: unknown; id: number }> = {}) {
  return {
    id: overrides.id ?? 1,
    type: (overrides.type ?? 'query') as 'query' | 'mutation' | 'subscription',
    path: overrides.path ?? 'test.hello',
    input: overrides.input ?? { name: 'world' },
    context: {},
    signal: null,
  };
}

// Helper: get the terminating OperationLink from ipcLink
function getLink(opts?: Parameters<typeof ipcLink>[0]) {
  const factory = ipcLink(opts ?? { command: './engine' });
  // Layer 2 (runtime) — pass null since TRPCClientRuntime is empty
  const operationLink = factory(null as any);
  return operationLink;
}

// ---------------------------------------------------------------------------
// Task 1: Write JSON payload to child's stdin
// ---------------------------------------------------------------------------

describe('Task 1 — stdin write', () => {
  test('writes JSON-serialized operation to stdin and ends the stream', () => {
    const link = getLink();
    const op = makeOp();

    link({ op, next: null as any }).subscribe({});

    const expectedPayload = JSON.stringify({
      id: op.id,
      type: op.type,
      path: op.path,
      input: op.input,
    });

    expect(mockChild.stdin.write).toHaveBeenCalledTimes(1);
    expect(mockChild.stdin.write).toHaveBeenCalledWith(expectedPayload);
    expect(mockChild.stdin.end).toHaveBeenCalledTimes(1);
  });

  test('payload contains the correct operation fields', () => {
    const link = getLink();
    const op = makeOp({ id: 42, type: 'mutation', path: 'user.create', input: { email: 'a@b.com' } });

    link({ op, next: null as any }).subscribe({});

    const written = mockChild.stdin.write.mock.calls[0]![0] as string;
    const parsed = JSON.parse(written);

    expect(parsed).toEqual({
      id: 42,
      type: 'mutation',
      path: 'user.create',
      input: { email: 'a@b.com' },
    });
  });

  test('spawns child with configured command, args, and env', () => {
    const link = getLink({
      command: '/usr/local/bin/engine',
      args: ['--mode', 'json'],
      env: { CUSTOM_VAR: 'yes' },
    });

    link({ op: makeOp(), next: null as any }).subscribe({});

    expect(spawnMock).toHaveBeenCalledWith(
      '/usr/local/bin/engine',
      ['--mode', 'json'],
      expect.objectContaining({
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { CUSTOM_VAR: 'yes' },
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Task 2: Read stdout, parse JSON, resolve the observable
// ---------------------------------------------------------------------------

describe('Task 2 — stdout read and parse', () => {
  test('parses stdout JSON and emits result via observer.next + complete', () => {
    const link = getLink();
    const next = vi.fn();
    const complete = vi.fn();

    link({ op: makeOp(), next: null as any }).subscribe({ next, complete });

    // Simulate the child writing a JSON response to stdout then exiting 0
    mockChild.stdout.emit('data', Buffer.from(JSON.stringify({ greeting: 'hello' })));
    mockChild.emit('close', 0);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith({
      result: { type: 'data', data: { greeting: 'hello' } },
    });
    expect(complete).toHaveBeenCalledTimes(1);
  });

  test('handles chunked stdout data', () => {
    const link = getLink();
    const next = vi.fn();
    const complete = vi.fn();

    link({ op: makeOp(), next: null as any }).subscribe({ next, complete });

    // Simulate the response arriving in two chunks
    const full = JSON.stringify({ chunked: true, value: 123 });
    const mid = Math.floor(full.length / 2);
    mockChild.stdout.emit('data', Buffer.from(full.slice(0, mid)));
    mockChild.stdout.emit('data', Buffer.from(full.slice(mid)));
    mockChild.emit('close', 0);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0]![0].result.data).toEqual({ chunked: true, value: 123 });
    expect(complete).toHaveBeenCalledTimes(1);
  });

  test('handles complex nested JSON response', () => {
    const link = getLink();
    const next = vi.fn();

    link({ op: makeOp(), next: null as any }).subscribe({ next });

    const complex = { users: [{ id: 1, name: 'Alice' }], meta: { total: 1 } };
    mockChild.stdout.emit('data', Buffer.from(JSON.stringify(complex)));
    mockChild.emit('close', 0);

    expect(next.mock.calls[0]![0].result.data).toEqual(complex);
  });
});

// ---------------------------------------------------------------------------
// Task 3: Error and exit code handling
// ---------------------------------------------------------------------------

describe('Task 3 — error handling', () => {
  test('reports spawn errors (e.g. ENOENT) via observer.error', () => {
    const link = getLink({ command: '/nonexistent/binary' });
    const error = vi.fn();

    link({ op: makeOp(), next: null as any }).subscribe({ error });

    const spawnError = new Error('spawn /nonexistent/binary ENOENT');
    (spawnError as any).code = 'ENOENT';
    mockChild.emit('error', spawnError);

    expect(error).toHaveBeenCalledTimes(1);
    const err = error.mock.calls[0]![0];
    expect(err.message).toContain('ENOENT');
  });

  test('reports non-zero exit code via observer.error', () => {
    const link = getLink();
    const error = vi.fn();

    link({ op: makeOp(), next: null as any }).subscribe({ error });

    mockChild.emit('close', 1);

    expect(error).toHaveBeenCalledTimes(1);
    const err = error.mock.calls[0]![0];
    expect(err.message).toContain('exited with code 1');
  });

  test('includes stderr content in non-zero exit code error', () => {
    const link = getLink();
    const error = vi.fn();

    link({ op: makeOp(), next: null as any }).subscribe({ error });

    mockChild.stderr.emit('data', Buffer.from('segmentation fault\n'));
    mockChild.emit('close', 139);

    expect(error).toHaveBeenCalledTimes(1);
    const err = error.mock.calls[0]![0];
    expect(err.message).toContain('exited with code 139');
    expect(err.message).toContain('segmentation fault');
  });

  test('includes stderr in spawn error meta', () => {
    const link = getLink();
    const error = vi.fn();

    link({ op: makeOp(), next: null as any }).subscribe({ error });

    mockChild.stderr.emit('data', Buffer.from('permission denied'));
    mockChild.emit('error', new Error('spawn failed'));

    expect(error).toHaveBeenCalledTimes(1);
    const err = error.mock.calls[0]![0];
    expect(err.meta).toEqual({ stderr: 'permission denied' });
  });

  test('reports JSON parse failure with truncated stdout', () => {
    const link = getLink();
    const error = vi.fn();

    link({ op: makeOp(), next: null as any }).subscribe({ error });

    mockChild.stdout.emit('data', Buffer.from('not valid json!!!'));
    mockChild.emit('close', 0);

    expect(error).toHaveBeenCalledTimes(1);
    const err = error.mock.calls[0]![0];
    expect(err.message).toContain('failed to parse child stdout as JSON');
    expect(err.message).toContain('not valid json!!!');
  });

  test('does not double-report when error fires before close', () => {
    const link = getLink();
    const error = vi.fn();

    link({ op: makeOp(), next: null as any }).subscribe({ error });

    mockChild.emit('error', new Error('spawn failed'));
    mockChild.emit('close', 1);

    // Should only be called once (the error event), not twice
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0]![0].message).toContain('spawn failed');
  });

  test('throws on subscription type', () => {
    const link = getLink();
    const op = makeOp({ type: 'subscription' });

    expect(() => {
      link({ op, next: null as any }).subscribe({});
    }).toThrow('Subscriptions are unsupported by `ipcLink`');
  });
});

// ---------------------------------------------------------------------------
// Cleanup and AbortSignal
// ---------------------------------------------------------------------------

describe('cleanup and cancellation', () => {
  test('kills child process on unsubscribe when not settled', () => {
    const link = getLink();

    const sub = link({ op: makeOp(), next: null as any }).subscribe({});
    sub.unsubscribe();

    expect(mockChild.kill).toHaveBeenCalledTimes(1);
  });

  test('does not kill child process on unsubscribe after settlement', () => {
    const link = getLink();

    const sub = link({ op: makeOp(), next: null as any }).subscribe({});

    // Settle via close
    mockChild.stdout.emit('data', Buffer.from('{}'));
    mockChild.emit('close', 0);

    sub.unsubscribe();

    expect(mockChild.kill).not.toHaveBeenCalled();
  });

  test('kills child process when AbortSignal fires', () => {
    const link = getLink();
    const ac = new AbortController();
    const op = { ...makeOp(), signal: ac.signal };

    link({ op, next: null as any }).subscribe({});

    ac.abort();

    expect(mockChild.kill).toHaveBeenCalledTimes(1);
  });

  test('does not kill child on abort after settlement', () => {
    const link = getLink();
    const ac = new AbortController();
    const op = { ...makeOp(), signal: ac.signal };

    link({ op, next: null as any }).subscribe({});

    // Settle first
    mockChild.stdout.emit('data', Buffer.from('{}'));
    mockChild.emit('close', 0);

    ac.abort();

    expect(mockChild.kill).not.toHaveBeenCalled();
  });
});
