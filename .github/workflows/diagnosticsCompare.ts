import * as fs from 'fs';
import * as path from 'path';
import * as core from '@actions/core';
import * as github from '@actions/github';

const octokit = github.getOctokit(process.env.GITHUB_TOKEN as string);

const pr = github.context.payload.pull_request;

if (!pr) {
  core.setFailed('Not a Pull Request, cannot determine the base branch.');
  process.exit(1);
}

const diagnosticsPath = 'diagnostics-results';
const prNumber = github.context.issue.number;

type MetricsRecord = Record<string, number | null>;

const parseDiagnostics = (content: string) => {
  const lines = content.split('\n');
  const metrics: MetricsRecord = {};
  lines.forEach((line) => {
    const [key, value] = line.split(':');
    if (key && value) {
      metrics[key.trim()] = parseNumber(value.trim());
    }
  });
  return metrics;
};

const readDiagnostics = (branch: string) => {
  const content = fs.readFileSync(
    path.join(diagnosticsPath, `diagnostics-${branch}.txt`),
    'utf-8',
  );
  return parseDiagnostics(content);
};

// Read diagnostics results for the branches you are interested in
const currentPrDiagnostics = readDiagnostics('current-pr');
// const mainDiagnostics = readDiagnostics('main');
const nextDiagnostics = readDiagnostics('next');

const commentTitle = 'Diagnostics Comparison';
let commentBody = `
## ${commentTitle}\n\n

<details>\n\n`;

const fmt = (num: null | number) => {
  if (num === null) {
    return 'N/A';
  }

  return new Intl.NumberFormat('en-US').format(num);
};
function parseNumber(value: string) {
  if (!value) {
    return null;
  }

  const number = parseFloat(value);
  return isNaN(number) ? null : number;
}

function printTable(title: string, data: MetricsRecord, description?: string) {
  commentBody += `### ${title}\n\n`;
  if (description) {
    commentBody += `${description}\n\n`;
  }

  function printRow(row: [string, string, string]) {
    commentBody += `| ` + [...row].join(' | ') + ' |\n';
  }

  printRow(['Metric', 'PR', '`next`']);
  printRow(['------', '--', '------']);

  const round = (value: number) => Math.round(value * 100) / 100;

  // Loop through the metrics and build the comment body
  for (const [metric, currentPrValue] of Object.entries(data)) {
    const nextValue = nextDiagnostics[metric];

    let diffNext: number | null = null;
    let emojiNext = '';
    if (typeof currentPrValue === 'number' && typeof nextValue === 'number') {
      diffNext = round(currentPrValue - nextValue);
      emojiNext = diffNext > 0 ? '🔺' : diffNext < 0 ? '🔽🟢' : '➖';
    }

    printRow([
      metric,
      fmt(currentPrValue),
      `${fmt(nextValue)} (${emojiNext} ${fmt(diffNext)})`,
    ]);
  }

  commentBody += '\n\n';
}

const numbers: MetricsRecord = {};
const timings: MetricsRecord = {};

for (const [key, value] of Object.entries(currentPrDiagnostics)) {
  if (key.toLowerCase().includes('time')) {
    timings[key] = value;
  } else {
    numbers[key] = value;
  }
}

printTable('Numbers', numbers);
printTable(
  'Timings',
  timings,
  '> Timings are **not** reliable in CI - we need to run the benchmark multiple times to get a good average.',
);

commentBody += `\n</details>`;
const { owner, repo } = github.context.repo;

async function run() {
  const existingComments = await octokit.rest.issues.listComments({
    owner,
    repo,
    issue_number: prNumber,
  });
  const comment = existingComments.data.find(
    (comment) =>
      comment.user?.login === 'github-actions[bot]' &&
      comment.body?.includes(commentTitle),
  );

  if (comment) {
    await octokit.rest.issues.updateComment({
      owner,
      repo,
      comment_id: comment.id,
      body: commentBody,
    });
  } else {
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body: commentBody,
    });
  }
}

run().catch((error) => core.setFailed(error.message));
