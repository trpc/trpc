import * as fs from 'fs';
import * as path from 'path';
import * as core from '@actions/core';
import * as github from '@actions/github';

const pr = github.context.payload.pull_request;

if (!pr) {
  core.setFailed('Not a Pull Request, cannot determine the base branch.');
  process.exit(1);
}

const diagnosticsPath = 'diagnostics-results';
const prNumber = github.context.issue.number;

const parseDiagnostics = (content: string) => {
  const lines = content.split('\n');
  const metrics: Record<string, number | string> = {};
  lines.forEach((line) => {
    const [key, value] = line.split(':');
    if (key && value) {
      metrics[key.trim()] = parseFloat(value.trim()) || value.trim();
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
const mainDiagnostics = readDiagnostics('main');
const nextDiagnostics = readDiagnostics('next');

const commentTitle = 'Diagnostics Comparison';
let commentBody = `## ${commentTitle}\n\n`;
commentBody += `| Metric | Current PR Value | Main Branch Value | Next Branch Value | Difference (Main) | Difference (Next) |\n`;
commentBody +=
  '|--------|------------------|-------------------|------------------|------------------|------------------|\n';

// Loop through the metrics and build the comment body
for (const [metric, currentPrValue] of Object.entries(currentPrDiagnostics)) {
  const mainValue = mainDiagnostics[metric];
  const nextValue = nextDiagnostics[metric];
  const diffMain =
    typeof currentPrValue === 'number' && typeof mainValue === 'number'
      ? (currentPrValue - mainValue).toFixed(2)
      : 'N/A';
  const diffNext =
    typeof currentPrValue === 'number' && typeof nextValue === 'number'
      ? (currentPrValue - nextValue).toFixed(2)
      : 'N/A';
  commentBody += `| ${metric} | ${currentPrValue} | ${mainValue} | ${nextValue} | ${diffMain} | ${diffNext} |\n`;
}

const octokit = github.getOctokit(core.getInput('token'));
const { owner, repo } = github.context.repo;

async function run() {
  let commentId: number | undefined;
  const existingComments = await octokit.rest.issues.listComments({
    owner,
    repo,
    issue_number: prNumber,
  });
  const filteredComments = existingComments.data.filter(
    (comment) =>
      comment.user?.login === 'github-actions[bot]' &&
      comment.body?.includes(commentTitle),
  );

  if (filteredComments[0]) {
    commentId = filteredComments[0].id;
  }

  if (commentId) {
    await octokit.rest.issues.updateComment({
      owner,
      repo,
      comment_id: commentId,
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
