#!/usr/bin/env bash
# Sets or clears the callout at the top of the current branch's PR body that
# says an agent is working on it. See SKILL.md beside this file.
#
#   callout.sh set "<activity>" [run-url]
#   callout.sh clear
#
# Run it inside the repository, on the PR's branch. Needs bash 3.2+, gh and
# coreutils; gh uses GH_TOKEN and GH_REPO when they are set.
set -euo pipefail
export LC_ALL=C

readonly START='<!-- agent-callout:start -->'
readonly END='<!-- agent-callout:end -->'

die() {
  printf 'callout.sh: %s\n' "$*" >&2
  exit 1
}

usage() {
  die 'usage: callout.sh set "<activity>" [run-url] | callout.sh clear'
}

count() {
  local s=$1 n=0
  while [[ $s == *"$2"* ]]; do
    s=${s#*"$2"}
    n=$((n + 1))
  done
  echo "$n"
}

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

find_pr() {
  command -v gh >/dev/null || die 'gh (the GitHub CLI) is not installed'
  pr=$(gh pr view --json number --jq .number 2>"$tmp/err") ||
    die "could not find a PR for the current branch: $(cat "$tmp/err")"
  [[ $pr =~ ^[0-9]+$ ]] || die "gh pr view printed an unexpected PR number: $pr"
}

read_body() {
  gh pr view "$pr" --json body --template '{{.body}}' >"$tmp/body" 2>"$tmp/err" ||
    die "could not read the body of PR #$pr: $(cat "$tmp/err")"
  # $(...) drops trailing newlines; the sentinel keeps them.
  body=$(
    cat "$tmp/body"
    printf x
  )
  body=${body%x}
}

# Splits $body around the callout into $before and $after; sets $has to 0 or 1.
split_body() {
  local starts ends
  starts=$(count "$body" "$START")
  ends=$(count "$body" "$END")
  if [[ $starts == 0 && $ends == 0 ]]; then
    has=0
    return
  fi
  [[ $starts == 1 && $ends == 1 ]] ||
    die "PR #$pr has $starts start and $ends end callout markers; fix its body by hand"
  before=${body%%"$START"*}
  [[ $before != *"$END"* ]] ||
    die "PR #$pr has the end callout marker before the start one; fix its body by hand"
  after=${body#*"$END"}
  has=1
}

# Writes $new unless it equals $body.
write_body() {
  if [[ $new == "$body" ]]; then
    echo "PR #$pr: unchanged, $1"
    exit 0
  fi
  printf '%s' "$new" >"$tmp/new"
  # Not `gh pr edit`: it also reads the PR's reviewers, which some tokens
  # that may edit the body can't.
  gh api --method PATCH "repos/{owner}/{repo}/pulls/$pr" -F "body=@$tmp/new" \
    >/dev/null 2>"$tmp/err" ||
    die "could not update the body of PR #$pr; gh's token needs to be able to edit pull requests (set GH_TOKEN to use another): $(cat "$tmp/err")"
}

[[ $# -ge 1 ]] || usage

case $1 in
  set)
    [[ $# -ge 2 && $# -le 3 ]] || usage
    activity=$2
    url=${3:-}
    [[ -n ${activity//[[:space:]]/} ]] || die 'the activity is empty'
    [[ $activity != *$'\n'* && $activity != *$'\r'* ]] ||
      die 'the activity must be one line'
    [[ $activity != *agent-callout:* ]] ||
      die 'the activity must not contain a callout marker'
    url_pattern='^https?://[^[:space:]<>()]+$'
    [[ -z $url || $url =~ $url_pattern ]] ||
      die "the run URL must be an http(s) URL without spaces, <, >, ( or ): $url"

    find_pr
    read_body
    split_body
    # Match the body's line endings: CRLF if its first line ends with one.
    nl=$'\n'
    first_line=${body%%$'\n'*}
    if [[ $body == *$'\n'* && $first_line == *$'\r' ]]; then
      nl=$'\r\n'
    fi
    now="> **Now:** $activity"
    [[ -z $url ]] || now+=" · [agent run]($url)"
    title='> 🤖 🚧 **An agent is working on this PR** 🚧'
    block="$START$nl> [!NOTE]$nl$title$nl>$nl$now$nl$END"
    if [[ $has == 1 ]]; then
      new="$before$block$after"
    else
      new="$block$nl$nl$body"
    fi
    write_body 'callout set'

    read_body
    [[ $body == *"$block"* ]] ||
      die "PR #$pr was edited, but its body does not show the new callout"
    echo "PR #$pr: callout set"
    ;;
  clear)
    [[ $# -eq 1 ]] || usage
    find_pr
    read_body
    split_body
    if [[ $has == 0 ]]; then
      echo "PR #$pr: unchanged, no callout"
      exit 0
    fi
    # `set` adds the callout and two line breaks; remove at most those.
    for _ in 1 2; do
      if [[ $after == $'\r\n'* ]]; then
        after=${after:2}
      elif [[ $after == $'\n'* ]]; then
        after=${after:1}
      fi
    done
    new="$before$after"
    write_body 'no callout'

    read_body
    [[ $body != *"$START"* ]] ||
      die "PR #$pr was edited, but its body still has the callout"
    echo "PR #$pr: callout cleared"
    ;;
  *)
    usage
    ;;
esac
