import { createFileRoute } from '@tanstack/react-router'
import { issue7725ServerFnFactory } from '../violations/issue-7725-server-fn-factory'

const getIssue7725Data = issue7725ServerFnFactory.handler(async () => {
  return 'issue 7725 server function'
})

export const Route = createFileRoute('/issue-7725')({
  loader: () => getIssue7725Data(),
  component: Issue7725,
})

function Issue7725() {
  return <h1>Issue 7725</h1>
}
