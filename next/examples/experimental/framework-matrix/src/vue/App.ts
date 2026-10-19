import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import {
  createTrpcContext,
  useSubscription,
} from '@trpc12/experimental-tanstack-vue-query';
import { defineComponent, h } from 'vue';
import { frameworks } from '../frameworks.ts';
import type { makeClient } from '../trpc.ts';
import { ui } from '../ui.ts';

export const { TrpcPlugin, useTrpc } = createTrpcContext<typeof makeClient>();

// A render function, so tsc checks it without a .vue compiler.
export const App = defineComponent(() => {
  const trpc = useTrpc();
  const queryClient = useQueryClient();
  const votes = useQuery(trpc.votes.list.queryOptions());
  const vote = useMutation(
    trpc.votes.cast.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries(trpc.votes.pathFilter()),
    }),
  );
  const clock = useSubscription(trpc.clock.subscriptionOptions());

  return () =>
    h('main', { class: ui.page }, [
      h('div', { class: ui.card }, [
        h('div', { class: ui.header }, [
          h('div', [
            h('div', { class: ui.title }, 'Vue'),
            h(
              'div',
              { class: ui.description },
              '@trpc12/experimental-tanstack-vue-query',
            ),
          ]),
          h(
            'span',
            { class: ui.badge, 'data-testid': 'clock' },
            clock.data.value ? `tick ${clock.data.value.tick}` : 'connecting',
          ),
        ]),
        h(
          'ul',
          { class: ui.content },
          frameworks.map((framework) =>
            h('li', { key: framework, class: ui.row }, [
              h('span', framework),
              h(
                'span',
                { 'data-testid': `votes-${framework}` },
                votes.data.value ? String(votes.data.value[framework]) : '…',
              ),
            ]),
          ),
        ),
        h('div', { class: ui.footer }, [
          h(
            'button',
            {
              class: ui.button,
              disabled: vote.isPending.value,
              onClick: () => vote.mutate({ framework: 'vue' }),
            },
            'Vote for Vue',
          ),
          h('a', { class: ui.link, href: '/' }, 'All pages'),
        ]),
      ]),
    ]);
});
