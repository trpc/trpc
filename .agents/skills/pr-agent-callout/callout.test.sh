#!/usr/bin/env bash
# Tests callout.sh against a stub gh that keeps the PR body in a file.
#
#   bash callout.test.sh
set -euo pipefail

script="$(cd "$(dirname "$0")" && pwd)/callout.sh"
STUB=$(mktemp -d)
export STUB
trap 'rm -rf "$STUB"' EXIT
mkdir "$STUB/bin"
cat >"$STUB/bin/gh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >>"$STUB/calls"
number=$(cat "$STUB/number" 2>/dev/null || true)
case "$*" in
  'pr view --json number --jq .number')
    if [[ -z $number ]]; then
      echo 'no pull requests found for branch "feature"' >&2
      exit 1
    fi
    echo "$number"
    ;;
  "pr view $number --json body --template {{.body}}")
    cat "$STUB/body"
    ;;
  "api --method PATCH repos/{owner}/{repo}/pulls/$number -F body=@"*)
    cp "${6#body=@}" "$STUB/body"
    printf '%s\n' "${GH_TOKEN-unset}" >>"$STUB/tokens"
    ;;
  *)
    echo "stub gh: unexpected call: $*" >&2
    exit 2
    ;;
esac
EOF
chmod +x "$STUB/bin/gh"
export PATH="$STUB/bin:$PATH"

failures=0
fail() {
  printf 'FAIL %s: %s\n' "$name" "$1"
  failures=$((failures + 1))
}

# Starts a case with PR 42 and the given body.
start() {
  name=$1
  rm -f "$STUB/calls" "$STUB/tokens"
  echo 42 >"$STUB/number"
  printf '%s' "$2" >"$STUB/body"
}

run() {
  status=0
  "$script" "$@" >"$STUB/out" 2>"$STUB/err" || status=$?
}

expect_ok() {
  [[ $status == 0 ]] || fail "exited with $status: $(cat "$STUB/err")"
}

expect_error() {
  [[ $status != 0 ]] || fail 'exited with 0'
  grep -qF -- "$1" "$STUB/err" || fail "stderr lacks '$1': $(cat "$STUB/err")"
}

expect_body() {
  printf '%s' "$1" >"$STUB/expected"
  cmp -s "$STUB/expected" "$STUB/body" ||
    fail "body differs:$(diff <(od -c "$STUB/expected") <(od -c "$STUB/body") || true)"
}

expect_edits() {
  local n
  n=$(grep -c '^api --method PATCH' "$STUB/calls" 2>/dev/null || true)
  [[ ${n:-0} == "$1" ]] || fail "expected $1 edits, got ${n:-0}"
}

callout() { # <line ending> <text after "Now:">
  printf '%s' "<!-- agent-callout:start -->$1> [!NOTE]$1> 🤖 🚧 **An agent is working on this PR** 🚧$1>$1> **Now:** $2$1<!-- agent-callout:end -->"
}

url='https://example.com/agents/run-1'
lf_body=$'## Why\n\nFixes a bug.\n\n## Testing\n\nRan it.\n'
lf_a="$(callout $'\n' "Fixing the failing test · [agent run]($url)")"
lf_b="$(callout $'\n' 'Waiting for CI')"

start 'set on a body without a callout' "$lf_body"
run set 'Fixing the failing test' "$url"
expect_ok
expect_body "$lf_a"$'\n\n'"$lf_body"
expect_edits 1
grep -qF 'PR #42: callout set' "$STUB/out" || fail "stdout: $(cat "$STUB/out")"

name='set again replaces the callout'
run set 'Waiting for CI'
expect_ok
expect_body "$lf_b"$'\n\n'"$lf_body"
expect_edits 2

name='set with the same activity skips the edit'
run set 'Waiting for CI'
expect_ok
expect_body "$lf_b"$'\n\n'"$lf_body"
expect_edits 2

name='clear restores the body byte for byte'
run clear
expect_ok
expect_body "$lf_body"
expect_edits 3

name='clear without a callout skips the edit'
run clear
expect_ok
expect_body "$lf_body"
expect_edits 3

crlf_body=$'## Why\r\n\r\nFixes a bug.\r\n\r\n## Testing\r\n\r\nRan it.\r\n'
start 'set on a CRLF body uses CRLF' "$crlf_body"
run set 'Fixing the failing test' "$url"
expect_ok
expect_body "$(callout $'\r\n' "Fixing the failing test · [agent run]($url)")"$'\r\n\r\n'"$crlf_body"

name='set replaces a CRLF callout'
run set 'Waiting for CI'
expect_ok
expect_body "$(callout $'\r\n' 'Waiting for CI')"$'\r\n\r\n'"$crlf_body"

name='clear restores a CRLF body byte for byte'
run clear
expect_ok
expect_body "$crlf_body"

start 'clear after a web edit turned the body into CRLF' \
  "${lf_a//$'\n'/$'\r\n'}"$'\r\n\r\n'"$crlf_body"
run clear
expect_ok
expect_body "$crlf_body"

mixed_body=$'Intro\nline two\r\n\r\n- item\n'
start 'set and clear keep mixed line endings' "$mixed_body"
run set 'Rebasing'
expect_ok
expect_body "$(callout $'\n' 'Rebasing')"$'\n\n'"$mixed_body"
run clear
expect_ok
expect_body "$mixed_body"

for body in '' 'No trailing newline' $'Trailing newlines\n\n\n' $'\n\nLeading newlines'; do
  start "round trip of $(printf '%q' "$body")" "$body"
  run set 'Working'
  expect_ok
  run clear
  expect_ok
  expect_body "$body"
done

wrapped=$'<!-- tool:start -->\n'"$lf_a"$'\n\nBody\n<!-- tool:end -->\n'
start 'set replaces a callout that is not first' "$wrapped"
run set 'Waiting for CI'
expect_ok
expect_body $'<!-- tool:start -->\n'"$lf_b"$'\n\nBody\n<!-- tool:end -->\n'
run clear
expect_ok
expect_body $'<!-- tool:start -->\nBody\n<!-- tool:end -->\n'

start 'GH_TOKEN reaches gh' "$lf_body"
GH_TOKEN=token-123 run set 'Working'
expect_ok
[[ $(cat "$STUB/tokens") == token-123 ]] || fail "gh saw GH_TOKEN=$(cat "$STUB/tokens")"

start 'no PR for the branch' "$lf_body"
rm "$STUB/number"
run set 'Working'
expect_error 'could not find a PR for the current branch: no pull requests found for branch "feature"'
run clear
expect_error 'could not find a PR for the current branch'
expect_edits 0

for broken in "$lf_a$lf_a" "<!-- agent-callout:start -->"$'\n'"$lf_body" \
  "<!-- agent-callout:end -->"$'\n'"<!-- agent-callout:start -->"; do
  start "broken markers $(printf '%q' "${broken:0:40}")" "$broken"
  run set 'Working'
  expect_error 'fix its body by hand'
  run clear
  expect_error 'fix its body by hand'
  expect_body "$broken"
  expect_edits 0
done

start 'bad arguments' "$lf_body"
run
expect_error 'usage:'
run set
expect_error 'usage:'
run set ' '
expect_error 'the activity is empty'
run set $'two\nlines'
expect_error 'the activity must be one line'
run set 'Working' 'not a url'
expect_error 'the run URL must be'
run set 'Working' "$url" extra
expect_error 'usage:'
run clear 42
expect_error 'usage:'
[[ ! -e $STUB/calls ]] || fail "called gh: $(cat "$STUB/calls")"

if [[ $failures != 0 ]]; then
  echo "$failures failed"
  exit 1
fi
echo 'all passed'
