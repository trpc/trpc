import {
  check,
  coverage,
  sampleTransitions,
  simulateMachine,
  stateDiagram,
} from './___machineModel';
import { TRPCError } from '@trpc/server';
import type {
  RequestEffect,
  RequestEvent,
  RequestState,
} from '@trpc/server/unstable-core-do-not-import/http/requestMachine';
import { requestMachine } from '@trpc/server/unstable-core-do-not-import/http/requestMachine';
import fc from 'fast-check';

const order: Record<RequestState['status'], number> = {
  receiving: 0,
  building: 1,
  described: 2,
  streaming: 3,
  done: 4,
};

const event = fc.oneof(
  fc.constant(null).map((): RequestEvent => ({
    type: 'headersStarted',
    headers: new Headers(),
  })),
  fc.constant<RequestEvent>({ type: 'describe' }),
  fc
    .boolean()
    .map((streamed): RequestEvent => ({ type: 'responded', streamed })),
  fc.constant<RequestEvent>({ type: 'bodyEnded' }),
  fc.constant(null).map((): RequestEvent => ({
    type: 'failed',
    error: new TRPCError({ code: 'INTERNAL_SERVER_ERROR' }),
    source: { type: 'query', call: null },
  })),
);

const goals = coverage([
  'failed before a builder started',
  'failed with the builder’s headers',
  'failed after responseMeta',
  'failed while streaming',
  'streamed to the end',
]);

/** Plays a request through the machine, checking it after every step */
function play(events: readonly RequestEvent[]) {
  let responseMetaCalls = 0;
  let responses = 0;
  const model = simulateMachine({
    machine: requestMachine,
    check({ event, before, after, effects }) {
      const answers = effects.filter((e) => e.type === 'respondWithError');
      const reports = effects.filter((e) => e.type === 'reportError');
      responseMetaCalls += effects.filter(
        (e) =>
          e.type === 'callResponseMeta' ||
          (e.type === 'respondWithError' && e.callResponseMeta),
      ).length;
      responses += answers.length;
      if (event?.type === 'responded' && before?.status === 'described') {
        responses += 1;
      }

      check(responseMetaCalls <= 1, 'responseMeta ran twice');
      check(responses <= 1, 'two responses for one request');
      if (!before || !event) {
        return;
      }
      check(order[after.status] >= order[before.status], 'went backwards');
      check(
        reports.length === (event.type === 'failed' ? 1 : 0),
        'a failure must be reported exactly once',
      );
      for (const answer of answers) {
        check(
          before.status !== 'streaming' && before.status !== 'done',
          'an error response after the response was sent',
        );
        check(
          answer.callResponseMeta === (before.status !== 'described'),
          'responseMeta runs for the error response only if it hasn’t run',
        );
        check(
          (answer.headers !== null) === (before.status === 'building'),
          'only a builder’s headers are kept',
        );
      }

      if (event.type === 'failed') {
        if (before.status === 'receiving') {
          goals.add('failed before a builder started');
        }
        if (before.status === 'building') {
          goals.add('failed with the builder’s headers');
        }
        if (before.status === 'described') {
          goals.add('failed after responseMeta');
        }
        if (before.status === 'streaming') {
          goals.add('failed while streaming');
        }
      }
      if (event.type === 'bodyEnded' && before.status === 'streaming') {
        goals.add('streamed to the end');
      }
    },
    play: (_effect: RequestEffect) => {
      // `resolveResponse` runs them; the checks above count them
    },
  });
  for (const e of events) {
    model.send(e);
  }
}

test('every sequence of events keeps the request invariants', () => {
  goals.reset();
  fc.assert(
    fc.property(fc.array(event, { maxLength: 12 }), (events) => {
      play(events);
    }),
    { numRuns: 2_000, seed: 7894 },
  );
  expect(goals.missing()).toEqual([]);
});

test('the diagram matches the transitions', async () => {
  const states: RequestState[] = [
    { status: 'receiving' },
    { status: 'building', headers: new Headers() },
    { status: 'described' },
    { status: 'streaming' },
    { status: 'done' },
  ];
  const events: RequestEvent[] = [
    { type: 'headersStarted', headers: new Headers() },
    { type: 'describe' },
    { type: 'responded', streamed: false },
    { type: 'responded', streamed: true },
    { type: 'bodyEnded' },
    {
      type: 'failed',
      error: new TRPCError({ code: 'INTERNAL_SERVER_ERROR' }),
      source: { type: 'query', call: null },
    },
  ];
  const edges = sampleTransitions({
    states,
    events,
    next: (state, e) => {
      const after = requestMachine.transition(state, e).state;
      return after === state ? null : after;
    },
    stateName: (state) => state.status,
    eventName: (e) =>
      e.type === 'responded' ? (e.streamed ? 'streamed' : 'responded') : e.type,
  });
  const diagram = stateDiagram({
    initial: [{ to: 'receiving', label: null }],
    edges,
    final: ['done'],
    sort: false,
  });
  await expect('```mermaid\n' + diagram + '\n```\n').toMatchFileSnapshot(
    './resolveResponse.requestMachine.diagram.md',
  );
});
