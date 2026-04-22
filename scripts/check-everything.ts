import { spawnSync } from 'node:child_process';

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
      label: 'run ts-prune guardrail',
      command: 'pnpm',
      args: ['lint-prune'],
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

function main() {
  ensureCleanWorkingTree();
  runAutocheck();

  if (autocheckOnly) {
    console.log('\nautocheck completed with no edits.');
    return;
  }

  const buildExtraArgs: string[] = [];
  if (!isCommandAvailable('bun')) {
    console.log('\nSkipping `examples-bun#build` because Bun is unavailable in this environment.');
    buildExtraArgs.push('--filter=!examples-bun');
  }

  runTurboPhase('build packages, examples, and www via turbo', 'build', buildExtraArgs);
  runTurboPhase('typecheck packages, examples, and www via turbo', 'typecheck');
  runTurboPhase('verify lint passes cleanly via turbo', 'lint');

  runStep({
    label: 'run vitest without watch mode',
    command: 'pnpm',
    args: ['test', '--', '--watch', 'false'],
  });

  console.log('\ncheck-everything completed successfully.');
}

main();
