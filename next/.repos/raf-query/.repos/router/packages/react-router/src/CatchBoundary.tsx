'use client'

import * as React from 'react'
import { wrapInNonRouteComponentContext } from './nonRouteComponentContext'
import type { ErrorRouteComponent } from './route'
import type { ErrorInfo } from 'react'

export class CatchBoundary extends React.Component<{
  getResetKey: () => unknown
  children: React.ReactNode
  errorComponent?: ErrorRouteComponent
  onCatch?: (error: unknown, errorInfo: ErrorInfo) => void
}> {
  // Wrapping caught values keeps every possible thrown value truthy.
  state = { error: 0 } as { error: [unknown] | 0; resetKey?: unknown }

  static getDerivedStateFromProps(
    props: { getResetKey: () => unknown },
    state: { resetKey?: unknown; error: [unknown] | 0 },
  ) {
    const resetKey = props.getResetKey()

    if (state.error && state.resetKey !== resetKey) {
      return { resetKey, error: 0 }
    }

    return { resetKey }
  }
  static getDerivedStateFromError(error: unknown) {
    return { error: [error] }
  }
  reset = () => {
    this.setState({ error: 0 })
  }
  componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
    this.props.onCatch?.(error, errorInfo)
  }
  render() {
    const error = this.state.error
    if (error) {
      const element = React.createElement(
        this.props.errorComponent ?? ErrorComponent,
        {
          error: error[0],
          reset: this.reset,
        },
      )

      return process.env.NODE_ENV !== 'production'
        ? wrapInNonRouteComponentContext(element, 'errorComponent')
        : element
    }

    return this.props.children
  }
}

export function ErrorComponent({ error }: { error: unknown }) {
  const [show, setShow] = React.useState(process.env.NODE_ENV !== 'production')

  return (
    <div style={{ padding: '.5rem', maxWidth: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
        <strong style={{ fontSize: '1rem' }}>Something went wrong!</strong>
        <button
          style={{
            appearance: 'none',
            fontSize: '.6em',
            border: '1px solid currentColor',
            padding: '.1rem .2rem',
            fontWeight: 'bold',
            borderRadius: '.25rem',
          }}
          onClick={() => setShow((d) => !d)}
        >
          {show ? 'Hide Error' : 'Show Error'}
        </button>
      </div>
      <div style={{ height: '.25rem' }} />
      {show ? (
        <div>
          <pre
            style={{
              fontSize: '.7em',
              border: '1px solid red',
              borderRadius: '.25rem',
              padding: '.3rem',
              color: 'red',
              overflow: 'auto',
            }}
          >
            {(error as { message?: string } | null)?.message ? (
              <code>{(error as { message: string }).message}</code>
            ) : null}
          </pre>
        </div>
      ) : null}
    </div>
  )
}
