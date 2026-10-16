import { parseFormData } from '@orpc/openapi/helpers'
import { useEffect, useState } from 'react'
import { chatRoomClient } from '../lib/chat-room'

type Status = 'connecting' | 'listening' | 'error'

export function HibernationChatRoom() {
  const [messages, setMessages] = useState<string[]>([])
  const [status, setStatus] = useState<Status>('connecting')
  const [isSending, setIsSending] = useState(false)

  useEffect(() => {
    const controller = new AbortController()

    void (async () => {
      try {
        const iterator = await chatRoomClient.onMessage(undefined, { signal: controller.signal })
        setStatus('listening')

        for await (const { message } of iterator) {
          setMessages(messages => [...messages, message])
        }
      }
      catch (error) {
        if (!controller.signal.aborted) {
          console.error(error)
          setStatus('error')
        }
      }
    })()

    return () => {
      controller.abort()
    }
  }, [])

  const sendMessage = async (form: FormData) => {
    setIsSending(true)
    try {
      await chatRoomClient.send(parseFormData(form) as { message: string })
    }
    finally {
      setIsSending(false)
    }
  }

  const statusLabel = status === 'connecting' ? 'Joining' : status === 'error' ? 'Error' : 'Listening'

  return (
    <section className="module module--cyan" aria-labelledby="hibernation-chat-room-title">
      <span className="corner tl" />
      <span className="corner tr" />
      <span className="corner bl" />
      <span className="corner br" />

      <div className="module-head">
        <div>
          <span className="module-id">CH-04 · HIBERNATION</span>
          <h2 className="module-title" id="hibernation-chat-room-title">
            oRPC over WebSocket | Hibernation Example
          </h2>
          <p className="module-desc">
            A chat room backed by a Durable Object using the WebSocket Hibernation API via @orpc/hibernation.
            Open this page in two tabs to chat.
          </p>
        </div>
        <span className="status-pill">
          <span className="dot" />
          <span className="status-text">{statusLabel}</span>
        </span>
      </div>

      <div className="channel-log">
        {status === 'connecting' && <p className="channel-empty">joining...</p>}
        {status === 'error' && <p className="module-error">Connection failed, check the console for details.</p>}
        {status === 'listening' && (
          messages.length === 0
            ? (
                <p className="channel-empty">
                  waiting for new messages..., please open in multiple tabs for chatting together
                </p>
              )
            : (
                <ul className="msg-list">
                  {messages.map((message, i) => (
                    <li key={i} className="msg">
                      <span className="msg-text">{message}</span>
                    </li>
                  ))}
                </ul>
              )
        )}
      </div>

      <form className="channel-form" action={sendMessage}>
        <div className="prompt-wrap">
          <span className="prompt-char">›</span>
          <input type="text" name="message" required minLength={1} placeholder="message..." />
        </div>
        <button type="submit" className="btn" disabled={status !== 'listening' || isSending}>
          {isSending ? 'Sending…' : 'Send'}
        </button>
      </form>
    </section>
  )
}
