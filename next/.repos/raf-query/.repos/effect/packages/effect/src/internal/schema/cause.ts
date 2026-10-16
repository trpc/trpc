import * as Cause from "../../Cause.ts"
import * as SchemaIssue from "../../SchemaIssue.ts"

/** @internal */
export function getSchemaIssue(cause: Cause.Cause<SchemaIssue.Issue>): SchemaIssue.Issue | undefined {
  let issue: SchemaIssue.Issue | undefined
  for (const reason of cause.reasons) {
    if (!Cause.isFailReason(reason) || !SchemaIssue.isIssue(reason.error)) {
      return undefined
    }
    issue ??= reason.error
  }
  return issue
}

/** @internal */
export function getSchemaIssueOrThrow(
  cause: Cause.Cause<SchemaIssue.Issue>,
  message: string
): SchemaIssue.Issue {
  const issue = getSchemaIssue(cause)
  if (issue === undefined) {
    throw new Error(message, { cause })
  }
  return issue
}
