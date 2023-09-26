import * as fs from 'fs';
import * as path from 'path';
import * as core from '@actions/core';
import * as github from '@actions/github';

const pr = github.context.payload.pull_request;

if (!pr) {
  core.setFailed('Not a Pull Request, cannot determine the base branch.');
  process.exit(1);
}

const baseBranch = pr.base.ref as string;
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

const baseDiagnostics = readDiagnostics(baseBranch);
const prDiagnostics = readDiagnostics(pr.head.ref as string);

const commentTitle = 'Diagnostics Comparison';
let commentBody = `## ${commentTitle}\n\n`;
commentBody +=
  '| Metric | Base Branch Value | PR Branch Value | Difference |\n';
commentBody += '|--------|------------------|-----------------|------------|\n';

for (const [metric, baseValue] of Object.entries(baseDiagnostics)) {
  const prValue = prDiagnostics[metric];
  const difference =
    typeof baseValue === 'number' && typeof prValue === 'number'
      ? (prValue - baseValue).toFixed(2)
      : 'N/A';
  commentBody += `| ${metric} | ${baseValue} | ${prValue} | ${difference} |\n`;
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
