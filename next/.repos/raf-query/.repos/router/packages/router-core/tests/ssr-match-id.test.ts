import { describe, expect, it } from 'vitest'
import { dehydrateSsrMatchId } from '../src/ssr/ssr-match-id'

describe('ssr match id codec', () => {
  it('removes forward slashes in dehydrated ids', () => {
    const dehydratedId = dehydrateSsrMatchId(
      '/$orgId/projects/$projectId//acme/projects/dashboard/{}',
    )

    expect(dehydratedId).not.toContain('/')
    expect(dehydratedId).not.toContain('\0')
  })

  it('leaves ids without slashes unchanged', () => {
    expect(dehydrateSsrMatchId('plain-id')).toBe('plain-id')
  })

  it('keeps distinct slash-delimited ids distinct', () => {
    expect(dehydrateSsrMatchId('/posts/1')).not.toBe(
      dehydrateSsrMatchId('/posts1'),
    )
  })
})
