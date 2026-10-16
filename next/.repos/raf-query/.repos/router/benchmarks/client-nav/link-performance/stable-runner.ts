import { fork } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { LINK_CASES } from './cases'
import { createStagingDirectory } from './staging'
import { classify, mean, summarizeRatios } from './statistics'
import type { LinkCaseId } from './cases'
import type {
  BlockSample,
  Mode,
  Variant,
  WorkerRequest,
  WorkerResponse,
} from './worker-protocol'

const projectRoot = fileURLToPath(new URL('.', import.meta.url))
const workspaceRoot = resolve(projectRoot, '../../..')

function startWorker() {
  const child = fork(
    fileURLToPath(new URL('./stable-worker.ts', import.meta.url)),
    {
      cwd: workspaceRoot,
      env: { ...process.env, NODE_ENV: 'production' },
      execArgv: [
        '--import=@swc-node/register/esm-register',
        '--random-seed=42',
        '--hash-seed=42',
      ],
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    },
  )
  let stderr = ''
  child.stderr?.on('data', (data: Buffer) => {
    stderr = (stderr + data.toString()).slice(-4_096)
  })

  function request(message: WorkerRequest): Promise<WorkerResponse> {
    return new Promise((resolveResponse, reject) => {
      const timeout = setTimeout(() => {
        finish(
          new Error(`Sampling worker timed out: ${message.kind}\n${stderr}`),
        )
      }, 60_000)
      const onExit = (code: number | null) =>
        finish(new Error(`Sampling worker exited (${code})\n${stderr}`))
      const onError = (error: Error) => finish(error)
      const onMessage = (response: WorkerResponse) => {
        if (response.kind === 'error') {
          finish(new Error(response.message))
        } else {
          finish(undefined, response)
        }
      }
      function finish(error?: Error, response?: WorkerResponse) {
        clearTimeout(timeout)
        child.off('message', onMessage)
        child.off('error', onError)
        child.off('exit', onExit)
        if (error) {
          reject(error)
        } else if (response) {
          resolveResponse(response)
        }
      }
      child.once('message', onMessage)
      child.once('error', onError)
      child.once('exit', onExit)
      child.send(message, (error) => {
        if (error) {
          finish(error)
        }
      })
    })
  }

  return {
    request,
    kill: () => child.kill(),
  }
}

async function sampleReplica(
  mode: Mode,
  caseId: LinkCaseId,
  baseline: string,
  current: string,
  replica: number,
) {
  const worker = startWorker()
  const samples: Array<Array<BlockSample>> = [[], []]
  const ratios: Array<{ cpu: number; wall: number }> = []
  try {
    const starts: Array<number> = []
    // Balance module initialization and which variant finishes warming last.
    const startupOrder: Array<Variant> = replica % 2 ? [1, 0] : [0, 1]
    for (const index of startupOrder) {
      const ready = await worker.request({
        kind: 'init',
        mode,
        caseId,
        bundle: index === 0 ? baseline : current,
        variant: index,
      })
      if (ready.kind !== 'ready') {
        throw new Error('Expected a ready sampling worker')
      }
      starts[index] = ready.batchMs
    }
    const iterations = Math.max(1, Math.ceil(500 / Math.min(...starts)))
    for (let round = 0; round < 2; round++) {
      const block: Array<Array<BlockSample>> = [[], []]
      const order: Array<Variant> =
        (round + replica) % 2 ? [1, 0, 0, 1] : [0, 1, 1, 0]
      for (const index of order) {
        const result = await worker.request({
          kind: 'measure',
          iterations,
          variant: index,
        })
        if (result.kind !== 'sample') {
          throw new Error('Expected a block measurement')
        }
        samples[index]!.push(result.sample)
        block[index]!.push(result.sample)
      }
      ratios.push({
        cpu:
          mean(block[1]!.map((s) => s.cpuMs)) /
          mean(block[0]!.map((s) => s.cpuMs)),
        wall:
          mean(block[1]!.map((s) => s.wallMs)) /
          mean(block[0]!.map((s) => s.wallMs)),
      })
    }
    const response = await worker.request({ kind: 'stop' })
    if (response.kind !== 'stopped') {
      throw new Error('Expected successful post-measurement assertions')
    }
    return {
      iterations,
      baseline: samples[0]!,
      current: samples[1]!,
      cpuRatio: Math.exp(mean(ratios.map((r) => Math.log(r.cpu)))),
      wallRatio: Math.exp(mean(ratios.map((r) => Math.log(r.wall)))),
    }
  } finally {
    worker.kill()
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      baseline: { type: 'string' },
      current: { type: 'string', default: resolve(projectRoot, 'dist') },
      mode: { type: 'string', default: 'all' },
      repeats: { type: 'string', default: '4' },
      outputJson: { type: 'string' },
      testNamePattern: { type: 'string', short: 't' },
    },
  })
  if (!values.baseline || !values.outputJson) {
    throw new Error(
      'Specify --baseline <dist directory> and --outputJson <file>',
    )
  }
  const repeats = Number(values.repeats)
  if (!Number.isInteger(repeats) || repeats < 3 || repeats > 11) {
    throw new Error('--repeats must be an integer between 3 and 11')
  }
  if (!['all', 'client', 'ssr'].includes(values.mode)) {
    throw new Error('--mode must be all, client, or ssr')
  }
  const modes: Array<Mode> =
    values.mode === 'all'
      ? ['client', 'ssr']
      : values.mode === 'client'
        ? ['client']
        : ['ssr']
  const pattern = values.testNamePattern
    ? new RegExp(values.testNamePattern)
    : undefined
  const cases = LINK_CASES.filter(
    (c) => !pattern || pattern.test(`${c.label} ${c.id}`),
  )
  if (!cases.length) {
    throw new Error('No Link workloads match the requested pattern')
  }
  const report: {
    protocol: string
    node: string
    complete: boolean
    results: Array<{
      mode: Mode
      caseId: LinkCaseId
      baselineSha256: string
      currentSha256: string
      replicas: Array<Awaited<ReturnType<typeof sampleReplica>>>
      cpu: ReturnType<typeof summarizeRatios>
      wall: ReturnType<typeof summarizeRatios>
      verdict: ReturnType<typeof classify>
    }>
  } = {
    protocol:
      'fresh process per case/replica; shared React runtime; separately loaded router variants; 2 ABBA/BAAB rounds; ~500ms calibrated fixed-work blocks; >=2s/100 batches warmup; main-thread CPU and wall time; fixed V8 random/hash seeds',
    node: process.version,
    complete: false,
    results: [],
  }
  const output = resolve(values.outputJson)
  mkdirSync(dirname(output), { recursive: true })
  const staging = createStagingDirectory()
  try {
    for (const mode of modes) {
      const baselineInput = resolve(values.baseline, mode, 'app.js')
      const currentInput = resolve(values.current, mode, 'app.js')
      // Both snapshots resolve React from the same package installation.
      const baseline = resolve(staging, `baseline-${mode}.mjs`)
      const current = resolve(staging, `current-${mode}.mjs`)
      copyFileSync(baselineInput, baseline)
      copyFileSync(currentInput, current)
      const digest = (file: string) =>
        createHash('sha256').update(readFileSync(file)).digest('hex')
      const baselineSha256 = digest(baseline)
      const currentSha256 = digest(current)
      for (const { id } of cases) {
        const replicas = []
        for (let replica = 0; replica < repeats; replica++) {
          replicas.push(
            await sampleReplica(mode, id, baseline, current, replica),
          )
        }
        const cpu = summarizeRatios(replicas.map((r) => r.cpuRatio))
        const wall = summarizeRatios(replicas.map((r) => r.wallRatio))
        const verdict = classify(cpu, wall)
        report.results.push({
          mode,
          caseId: id,
          baselineSha256,
          currentSha256,
          replicas,
          cpu,
          wall,
          verdict,
        })
        writeFileSync(output, JSON.stringify(report, null, 2))
        console.log(
          `${mode} ${id}: CPU ${cpu.changePercent.toFixed(2)}% [${cpu.low95.toFixed(2)}, ${cpu.high95.toFixed(2)}], wall ${wall.changePercent.toFixed(2)}% [${wall.low95.toFixed(2)}, ${wall.high95.toFixed(2)}] ${verdict}`,
        )
      }
    }
    report.complete = true
    writeFileSync(output, JSON.stringify(report, null, 2))
  } finally {
    rmSync(staging, { recursive: true })
  }
}

await main()
