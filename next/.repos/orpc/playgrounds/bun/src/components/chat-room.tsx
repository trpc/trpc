import { orpc } from '../lib/orpc'
import { useMutation, useQuery } from '@tanstack/react-query'
import { match } from 'ts-pattern'
import { parseFormData } from '@orpc/openapi/helpers'

const CHANNEL = 'default'

export function ChatRoom() {
  const query = useQuery(orpc.message.subscribe.streamedOptions({
    input: { channel: CHANNEL },
    context: { retry: Infinity },
    queryFnOptions: { maxChunks: 10 },
  }))

  const mutation = useMutation(orpc.message.publish.mutationOptions())

  const statusLabel = match(query)
    .with({ status: 'pending' }, () => 'Joining')
    .with({ status: 'error' }, () => 'Error')
    .with({ status: 'success' }, () => 'Listening')
    .exhaustive()

  return (
    <section className="module module--violet" aria-labelledby="chat-room-title">
      <span className="corner tl" />
      <span className="corner tr" />
      <span className="corner bl" />
      <span className="corner br" />

      <div className="module-head">
        <div>
          <span className="module-id">CH-03 · PUB/SUB</span>
          <h2 className="module-title" id="chat-room-title">
            oRPC and Tanstack Query | Pub/Sub Example
          </h2>
          <p className="module-desc">
            A live subscription over oRPC. Open this page in two tabs to chat across the channel.
          </p>
        </div>
        <span className="status-pill">
          <span className="dot" />
          <span className="status-text">{statusLabel}</span>
        </span>
      </div>

      <div className="channel-log">
        {match(query)
          .with({ status: 'pending' }, () => <p className="channel-empty">joining...</p>)
          .with({ status: 'error' }, q => <p className="module-error">{String(q.error)}</p>)
          .with({ status: 'success' }, q => q.data.length === 0
            ? (
                <p className="channel-empty">
                  waiting for new messages..., please open in multiple tabs for chatting together
                </p>
              )
            : (
                <ul className="msg-list">
                  {q.data.map(({ message }, i) => (
                    <li key={i} className="msg">
                      <span className="msg-text">{message}</span>
                    </li>
                  ))}
                </ul>
              ))
          .exhaustive()}
      </div>

      <form
        className="channel-form"
        action={form => mutation.mutate({ ...parseFormData(form), channel: CHANNEL })}
      >
        <div className="prompt-wrap">
          <span className="prompt-char">›</span>
          <input type="text" name="message" required minLength={1} placeholder="message..." />
        </div>
        <button type="submit" className="btn" disabled={query.isPending || mutation.isPending}>
          {mutation.isPending ? 'Sending…' : 'Send'}
        </button>
      </form>
    </section>
  )
}
