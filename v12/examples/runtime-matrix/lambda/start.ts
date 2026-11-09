/**
 * Serves `lambda/server.ts` behind the local function URL, buffered and then
 * streaming, and runs the client against each. Then calls `main` with the
 * payload 1.0 events API Gateway REST APIs and load balancers send.
 */
import assert from 'node:assert/strict';
import type { LambdaV1Event, LambdaV1Result } from '@trpc12/trpc/aws-lambda';
import { main as client } from '../client.ts';
import { listen } from './function-url.ts';
import { main } from './server.ts';

const events: Array<[string, LambdaV1Event]> = [
  ['REST API', { httpMethod: 'GET', path: '/trpc/runtime', body: null }],
  [
    'ALB',
    {
      httpMethod: 'GET',
      path: '/trpc/runtime',
      body: null,
      requestContext: { elb: { targetGroupArn: 'arn:aws:elb:local' } },
    },
  ],
];

export async function start() {
  for (const mode of ['buffered', 'streaming'] as const) {
    await using server = await listen(mode);
    await client(server.url, {
      label: `lambda (${mode})`,
      runtime: 'lambda',
      streams: mode === 'streaming',
      websockets: false,
    });
  }

  for (const [name, event] of events) {
    const result = (await main(event, {
      awsRequestId: name,
    })) as LambdaV1Result;
    assert.equal(result.statusCode, 200, `${name} event`);
    assert.ok(
      result.body.includes(`"${name}"`),
      `${name} event: ${result.body}`,
    );
  }
  console.log(
    `${'lambda (v1 events)'.padEnd(20)} ${events.map(([name]) => name).join(', ')}`,
  );
}
