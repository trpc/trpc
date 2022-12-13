// This SSG page generates the token to prevent generating OG images with random
// parameters (`id`).
// Check pages/api/encrypted.tsx for more info.

import { createHmac } from 'node:crypto'

export async function getStaticProps({ params }) {
  const hmac = createHmac('sha256', 'my_secret')
  hmac.update(JSON.stringify({ id: params.id }))
  const token = hmac.digest('hex')

  return {
    props: {
      id: params.id,
      token,
    },
  }
}

export function getStaticPaths() {
  return {
    paths: [
      { params: { id: 'a' } },
      { params: { id: 'b' } },
      { params: { id: 'c' } },
    ],
    fallback: false,
  }
}

export default function Page({ id, token }) {
  return (
    <div>
      <h1>Encrypted Open Graph Image.</h1>
      <p>Only /a, /b, /c with correct tokens are accessible:</p>
      <a href={`/api/encrypted?id=${id}&token=${token}`} target="_blank" rel="noreferrer">
        <code>
          /api/encrypted?id={id}&token={token}
        </code>
      </a>
    </div>
  )
}
