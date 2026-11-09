import { spawn, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';

/**
 * Starts a server process on a free port and resolves with the URL it
 * prints (`listening on <url>`); disposing it sends SIGTERM. Resolves with
 * `undefined` when the command isn't on `PATH`, unless `CI` is set.
 */
export async function spawnServer(
  label: string,
  [command, ...args]: [string, ...string[]],
) {
  if (spawnSync(command, ['--version'], { stdio: 'ignore' }).status !== 0) {
    if (process.env['CI']) throw new Error(`${command} is not on PATH`);
    console.log(`${label.padEnd(20)} skipped, ${command} is not on PATH`);
    return undefined;
  }
  const child = spawn(command, args, {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, PORT: '0' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const exited = new Promise<void>((resolve) =>
    child.once('exit', () => resolve()),
  );
  const url = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${label} didn't start`));
    }, 30_000);
    child.once('exit', (code) =>
      reject(new Error(`${label} exited with ${code}`)),
    );
    createInterface({ input: child.stdout! }).on('line', (line) => {
      const match = /listening on (http:\/\/\S+\/trpc)/.exec(line)?.[1];
      if (!match) return;
      clearTimeout(timer);
      resolve(match);
    });
  });
  return {
    url,
    async [Symbol.asyncDispose]() {
      if (child.exitCode === null) child.kill('SIGTERM');
      await exited;
    },
  };
}
