/**
 * Starts the router on every runtime, runs `checks.ts` against each, and
 * prints which checks each one passed. Bun and Deno must be on `PATH`;
 * outside CI a missing one is skipped. Run with `pnpm smoke`.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import type { LambdaV1Event, LambdaV1Result } from '@trpc12/trpc/aws-lambda';
import { unstable_startWorker } from 'wrangler';
import { check, type Target } from './checks.ts';
import { main } from './src/lambda.ts';

interface Process extends Target {
  /** The command that starts it; it prints `listening on <url>`. */
  command: [string, ...string[]];
}

const deno = [
  'deno',
  'run',
  '--no-lock',
  '--allow-net',
  '--allow-env',
  '--allow-read',
] as const;

const processes: Process[] = [
  {
    label: 'node',
    runtime: 'node',
    streams: true,
    websockets: true,
    command: ['node', 'src/node.ts'],
  },
  {
    label: 'bun (Bun.serve)',
    runtime: 'bun',
    streams: true,
    websockets: false,
    command: ['bun', 'src/bun.ts'],
  },
  {
    label: 'bun (Effect)',
    runtime: 'bun',
    streams: true,
    websockets: true,
    command: ['bun', 'src/bun-effect.ts'],
  },
  {
    label: 'deno',
    runtime: 'deno',
    streams: true,
    websockets: true,
    command: [...deno, 'src/deno.ts'],
  },
  {
    label: 'lambda (buffered)',
    runtime: 'lambda',
    streams: false,
    websockets: false,
    command: ['node', 'src/function-url.ts', 'buffered'],
  },
  {
    label: 'lambda (streaming)',
    runtime: 'lambda',
    streams: true,
    websockets: false,
    command: ['node', 'src/function-url.ts', 'streaming'],
  },
];
const worker: Target = {
  label: 'workers',
  runtime: 'workers',
  streams: true,
  websockets: false,
};

const cwd = new URL('.', import.meta.url).pathname;
const results: Array<{ label: string; passed: string[] | 'skipped' }> = [];

const installed = (command: string) =>
  spawnSync(command, ['--version'], { stdio: 'ignore' }).status === 0;

/** Starts `command` and resolves with the URL it prints. */
function start(target: Process): Promise<{ url: string; child: ChildProcess }> {
  const [command, ...args] = target.command;
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, PORT: '0' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${target.label} didn't start`));
    }, 30_000);
    child.once('exit', (code) =>
      reject(new Error(`${target.label} exited with ${code}`)),
    );
    createInterface({ input: child.stdout! }).on('line', (line) => {
      const url = /listening on (http:\/\/\S+\/trpc)/.exec(line)?.[1];
      if (!url) return;
      clearTimeout(timer);
      resolve({ url, child });
    });
  });
}

const stop = (child: ChildProcess) =>
  new Promise<void>((resolve) => {
    if (child.exitCode !== null) return resolve();
    child.once('exit', () => resolve());
    child.kill('SIGTERM');
  });

for (const target of processes) {
  if (!installed(target.command[0])) {
    if (process.env['CI'])
      throw new Error(`${target.command[0]} is not on PATH`);
    console.log(
      `${target.label}: skipped, ${target.command[0]} is not on PATH`,
    );
    results.push({ label: target.label, passed: 'skipped' });
    continue;
  }
  const server = await start(target);
  try {
    results.push({
      label: target.label,
      passed: await check(target, server.url),
    });
  } finally {
    await stop(server.child);
  }
}

// API Gateway REST APIs and load balancers send payload 1.0 events; call
// the Lambda handler with one of each, as Lambda would.
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
const lambdaEvents: string[] = [];
for (const [name, event] of events) {
  const result = (await main(event, { awsRequestId: name })) as LambdaV1Result;
  if (result.statusCode !== 200 || !result.body.includes(`"${name}"`)) {
    throw new Error(
      `lambda (${name} event): got ${result.statusCode} ${result.body}`,
    );
  }
  lambdaEvents.push(name);
}
results.push({ label: 'lambda (v1 events)', passed: lambdaEvents });

const workerd = await unstable_startWorker({
  config: new URL('./wrangler.jsonc', import.meta.url).pathname,
  dev: { server: { port: 0 }, inspector: false, logLevel: 'warn' },
});
try {
  await workerd.ready;
  const url = new URL('/trpc', await workerd.url).href;
  results.push({ label: worker.label, passed: await check(worker, url) });
} finally {
  await workerd.dispose();
}

for (const result of results) {
  const passed =
    result.passed === 'skipped' ? 'skipped' : result.passed.join(', ');
  console.log(`${result.label.padEnd(20)} ${passed}`);
}
