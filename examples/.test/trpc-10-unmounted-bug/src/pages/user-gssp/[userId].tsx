import { DehydratedState } from '@tanstack/react-query'
import { createProxySSGHelpers } from '@trpc/react/ssg'
import type { GetServerSideProps, NextPage } from 'next'
import superjson from 'superjson'
import { createContextTRPC } from '../../server/context-trpc'
import { appRouter } from '../../server/routers/_app'
import { trpc } from '../../util/trpc'

export const getServerSideProps: GetServerSideProps<
  { trpcState: DehydratedState },
  { userId: string }
> = async ({ params }) => {
  if (!params) throw new Error('Mssing params')

  const userId = params.userId

  const ssg = createProxySSGHelpers({
    router: appRouter,
    ctx: await createContextTRPC(),
    transformer: superjson,
  })

  // comment this out to also make the error go away
  await ssg.user.byUserId.prefetch({ userId })

  return {
    props: {
      trpcState: ssg.dehydrate(),
    },
  }
}

const Home: NextPage = () => {
  const { data, isLoading, isError } = trpc.user.byUserId.useQuery(
    {
      userId: '123',
    },
    {
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
    }
  )
  return <div>test 1</div>
}

export default Home
