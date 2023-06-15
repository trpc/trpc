import { AnyRouter, initTRPC } from '../core';
import { createBodyFormatter } from './batchStreamFormatter';

let router: AnyRouter;

describe('createBodyFormatter', () => {
  beforeEach(() => {
    const t = initTRPC.context<{}>().create();
    router = t.router({});
  });

  it('should format single response', () => {
    const format = createBodyFormatter({
      style: 'single',
      router,
      head: { status: 200, headers: {} },
    });
    const data = { result: { data: { greeting: 'Hello, world!' } } };
    const result = format(0, data);
    expect(result).toEqual('');
    expect(format.end()).toEqual(JSON.stringify(data));
  });

  it('should format batch response', () => {
    const format = createBodyFormatter({
      style: 'batch',
      router,
      head: { status: 200, headers: {} },
    });
    const data = [
      { result: { data: { greeting: 'Hello, Alice!' } } },
      { result: { data: { greeting: 'Hello, Bob!' } } },
      { result: { data: { greeting: 'Hello, Charlie!' } } },
    ];
    const result = format(0, data[0]!);
    expect(result).toEqual('');
    format(2, data[2]!);
    format(1, data[1]!);
    expect(format.end()).toEqual(JSON.stringify(data));
  });

  it('should format SSE response', () => {
    const format = createBodyFormatter({
      style: 'event-stream',
      router,
      head: { status: 200, headers: {} },
    });
    const data0 = { result: { data: { greeting: 'Hello, World!' } } };
    const data1 = { result: { data: { greeting: 'Hello, Alice!' } } };
    expect(format(1, data1)).toEqual(
      `data: ${JSON.stringify({
        result: { type: 'start' },
      })}\n\ndata: ${JSON.stringify(data1)}\nid: 1`,
    );
    expect(format(0, data0)).toEqual(
      `\n\ndata: ${JSON.stringify(data0)}\nid: 0`,
    );
    expect(format.end()).toEqual(
      `\n\ndata: ${JSON.stringify({ result: { type: 'end' } })}`,
    );
  });

  it('should format JSON response', () => {
    const format = createBodyFormatter({
      style: 'json-stream',
      router,
      head: { status: 200, headers: {} },
    });
    const data0 = { result: { data: { greeting: 'Hello, World!' } } };
    const data1 = { result: { data: { greeting: 'Hello, Alice!' } } };
    expect(format(1, data1)).toEqual(
      `{${JSON.stringify({ '1': data1 }).slice(1, -1)}\n`,
    );
    expect(format(0, data0)).toEqual(
      `,${JSON.stringify({ '0': data0 }).slice(1, -1)}\n`,
    );
    expect(format.end()).toEqual(`}`);
  });
});
