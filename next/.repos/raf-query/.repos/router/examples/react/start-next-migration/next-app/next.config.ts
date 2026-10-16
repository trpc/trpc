import type { NextConfig } from 'next'
const config: NextConfig = {
  async redirects() {
    return [
      {
        source: '/old-notes',
        destination: '/posts/keeping-your-urls',
        permanent: true,
      },
    ]
  },
}
export default config
