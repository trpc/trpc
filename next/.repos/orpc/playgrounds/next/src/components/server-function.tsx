'use client'

import { ping } from '@/app/actions'
import { getIssueMessage, onSuccessDeferred, parseFormData } from '@orpc/next'
import { useServerFunction } from '@orpc/next/hooks'

export function ServerFunction() {
  const action = useServerFunction(ping, {
    interceptors: [
      onSuccessDeferred((message) => {
        alert(message)
      }),
    ],
  })

  return (
    <section className="module module--cyan" aria-labelledby="server-function-title">
      <span className="corner tl" />
      <span className="corner tr" />
      <span className="corner bl" />
      <span className="corner br" />

      <div className="module-head">
        <div>
          <span className="module-id">FN-04 · SERVER FUNCTION</span>
          <h2 className="module-title" id="server-function-title">Server Functions</h2>
          <p className="module-desc">
            Call a oRPC procedure straight through Server Function
          </p>
        </div>
        <span className="status-pill">
          <span className="dot" />
          <span className="status-text">{action.isPending ? 'Pending' : 'Idle'}</span>
        </span>
      </div>

      <form
        action={(form) => { action.execute(parseFormData(form)) }}
      >
        <div className="field">
          <label className="field-label" htmlFor="fn-name">Name</label>
          <input type="text"name="name" />
          <p className="field-error">{getIssueMessage(action.error, 'name')}</p>
        </div>

        <div className="form-actions">
          <button type="submit" className="btn" disabled={action.isPending}>
            {action.isPending ? 'Pinging…' : 'Submit'}
          </button>
        </div>
      </form>
    </section>
  )
}
