import { TRPCClientError } from '../../../TRPCClientError';
import { RequestManager } from './requestManager';

test('settles the request lifecycle when its error observer throws', async () => {
  const manager = new RequestManager();
  const observerError = new Error('Error observer failed');
  manager.register(
    { id: 1, method: 'query', params: { path: 'test', input: undefined } },
    {
      next: vi.fn(),
      complete: vi.fn(),
      error() {
        throw observerError;
      },
    },
  );
  const [request] = manager.flush();
  assert(request);
  const onEnd = vi.fn();
  const ended = request.end.then(onEnd);

  expect(() =>
    request.callbacks.error(TRPCClientError.from(new Error('Send failed'))),
  ).toThrow(observerError);
  await vi.waitFor(() => expect(onEnd).toHaveBeenCalledOnce());
  await ended;
});
