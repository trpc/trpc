import type {
  ClientModel,
  Handover,
} from '@trpc/client/links/wsLink/wsClient/machine/clientModel';

/**
 * States the client machine can't reach are states its types can't build.
 * Each `@ts-expect-error` fails the typecheck if its state becomes buildable.
 * The request machine's are in `websockets.requestMachine.test.ts`.
 */
test("a replacement error can't outlive its handover", () => {
  const replaced: Pick<ClientModel, 'replaced' | 'handover'> = {
    replaced: [1],
    handover: null,
    // @ts-expect-error a replacement error belongs to the handover it would replace
    replacementError: { message: 'WebSocket closed', cause: null },
  };
  const handover: Handover = {
    connection: 2,
    replacementError: { message: 'Initialization error', cause: null },
  };
  expect([replaced, handover]).toHaveLength(2);
});
