import { spawnSync } from 'node:child_process';
import net from 'node:net';

const args = new Set(process.argv.slice(2));
const autocheckOnly = args.has('--autocheck-only');

type Step = {
  label: string;
  command: string;
  args: string[];
  continueOnError?: boolean;
};

function runStep(step: Step) {
  console.log(`\n==> ${step.label}`);
  console.log(`$ ${step.command} ${step.args.join(' ')}`.trim());

  const result = spawnSync(step.command, step.args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  });

  const exitCode = result.status ?? 1;
  if (exitCode !== 0 && !step.continueOnError) {
    process.exit(exitCode);
  }

  return exitCode;
}

function execText(command: string, args: string[]) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  return result.stdout.trim();
}

function isCommandAvailable(command: string) {
  const result = spawnSync('bash', ['-lc', `command -v ${command}`], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'ignore',
  });

  return result.status === 0;
}

function hasEnv(name: string) {
  return Boolean(process.env[name]?.trim());
}

function ensureDefaultEnv(name: string, value: string) {
  if (!hasEnv(name)) {
    process.env[name] = value;
  }
}

function getWorkingTreeStatus() {
  return execText('git', ['status', '--short']);
}

function ensureCleanWorkingTree() {
  const status = getWorkingTreeStatus();
  if (!status) {
    return;
  }

  console.error(
    'check-everything expects a clean working tree so autofix output is attributable to this run.',
  );
  console.error('Commit or stash your changes, then rerun:');
  console.error(status);
  process.exit(1);
}

function runAutocheck() {
  let failed = false;

  const steps: Step[] = [
    {
      label: 'verify lockfile stays frozen in CI',
      command: 'pnpm',
      args: ['install', '--frozen-lockfile', '--ignore-scripts'],
      continueOnError: true,
    },
    {
      label: 'apply eslint autofixes across workspace',
      command: 'pnpm',
      args: ['turbo', 'lint', '--continue', '--', '--fix'],
      continueOnError: true,
    },
    {
      label: 'apply workspace package.json fixes',
      command: 'pnpm',
      args: ['manypkg', 'fix'],
      continueOnError: true,
    },
    {
      label: 'apply prettier fixes',
      command: 'pnpm',
      args: ['format-fix'],
      continueOnError: true,
    },
  ];

  for (const step of steps) {
    const exitCode = runStep(step);
    if (exitCode !== 0) {
      failed = true;
    }
  }

  const status = getWorkingTreeStatus();
  if (status) {
    console.error(
      '\nautocheck changed tracked files. Commit the fixes, then rerun `pnpm check-everything`.',
    );
    console.error(status);
    process.exit(1);
  }

  if (failed) {
    console.error(
      '\nautocheck reported failures. Fix them, commit the result, then rerun `pnpm check-everything`.',
    );
    process.exit(1);
  }
}

function runTurboPhase(label: string, task: string, extraArgs: string[] = []) {
  runStep({
    label,
    command: 'pnpm',
    args: ['turbo', task, ...extraArgs],
  });
}

async function canConnectToPostgres(port = 5432) {
  return await new Promise<boolean>((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });

    const finish = (result: boolean) => {
      socket.destroy();
      resolve(result);
    };

    socket.on('connect', () => finish(true));
    socket.on('error', () => finish(false));
    socket.setTimeout(750, () => finish(false));
  });
}

async function main() {
  ensureCleanWorkingTree();

  ensureDefaultEnv('AUTH_GITHUB_ID', 'check-everything');
  ensureDefaultEnv('AUTH_GITHUB_SECRET', 'check-everything');
  ensureDefaultEnv('GITHUB_TOKEN', 'check-everything');
  ensureDefaultEnv('NEXTAUTH_SECRET', 'check-everything-secret');

  runAutocheck();

  if (autocheckOnly) {
    console.log('\nautocheck completed with no edits.');
    return;
  }

  const buildExtraArgs: string[] = [];
  if (!isCommandAvailable('bun')) {
    console.log(
      '\nSkipping `examples-bun#build` because Bun is unavailable in this environment.',
    );
    buildExtraArgs.push('--filter=!examples-bun');
  }

  const hasDatabaseEnv = hasEnv('DATABASE_URL') || hasEnv('POSTGRES_URL');
  if (!hasDatabaseEnv && !(await canConnectToPostgres())) {
    console.log(
      '\nSkipping database-backed example builds because no database is configured and nothing is reachable on localhost:5432.',
    );
    buildExtraArgs.push(
      '--filter=!examples-next-sse-chat',
      '--filter=!examples-trpc-next-prisma-starter',
      '--filter=!examples-trpc-next-prisma-todomvc',
      '--filter=!examples-next-prisma-websockets-starter',
    );
  }

  runTurboPhase(
    'build packages, examples, and www via turbo',
    'build',
    buildExtraArgs,
  );
  runTurboPhase('typecheck packages, examples, and www via turbo', 'typecheck');
  runTurboPhase('verify lint passes cleanly via turbo', 'lint');

  runStep({
    label: 'run vitest without watch mode',
    command: 'pnpm',
    args: ['test', '--', '--watch', 'false'],
  });

  console.log('\ncheck-everything completed successfully.');
}

void main();
