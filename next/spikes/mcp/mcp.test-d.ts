import { openapi } from '@trpc12/trpc/openapi';
import { initTrpc } from '@trpc12/trpc/server';
import { test } from 'vite-plus/test';
import { mcp } from './mcp.ts';

test('the mcp meta key is declared by the extension and typed', () => {
  const t = initTrpc().concat(openapi()).concat(mcp());
  t.procedure.meta({ mcp: true, route: { method: 'GET' } });
  t.procedure.meta({
    mcp: { description: 'Read', annotations: { readOnlyHint: true } },
  });
  // @ts-expect-error hints are booleans
  t.procedure.meta({ mcp: { annotations: { readOnlyHint: 'yes' } } });

  const plain = initTrpc();
  // @ts-expect-error a root without mcp() doesn't declare the key
  plain.procedure.meta({ mcp: true });
});
