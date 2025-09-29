import { EventEmitter } from 'node:events';
import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { wsLink } from '@trpc/client';
import type { TRPCConnectionState } from '@trpc/client/unstable-internals';
import { initTRPC } from '@trpc/server';
import type { Observable, Observer } from '@trpc/server/observable';
import { observable } from '@trpc/server/observable';

/**
 * Regression test for issue #6962
 * 
 * Issue: WebSocket client's connection state doesn't update when the server closes a subscription
 * 
 * This test reproduces the bug where:
 * 1. Client subscribes to a server-side subscription
 * 2. Server programmatically closes the subscription (via observer.complete())
 * 3. Client's connection state should reflect the closure but doesn't
 * 
 * EXPECTED BEHAVIOR: When the server closes a subscription, the client's connection state
 * should transition from 'pending' to 'idle' to reflect that no active subscriptions remain.
 * 
 * ACTUAL BEHAVIOR (BUG): The connection state remains in 'pending' even after the
 * subscription is closed by the server.
 * 
 * This test should FAIL until the bug is fixed.
 */
describe('issue #6962 - WebSocket connection state not updating on server subscription closure', () => {
  function factory() {
    const ee = new EventEmitter();
    const t = initTRPC.create();

    // Store reference to the subscription observer so we can close it from the server
    const subscriptionObserver: { current: Observer<string, unknown> | null } = {
      current: null,
    };

    const appRouter = t.router({
      // A subscription that can be programmatically closed by the server
      closableSubscription: t.procedure.subscription(() => {
        return observable<string>((emit) => {
          subscriptionObserver.current = emit;
          
          // Emit initial data
          emit.next('initial-data');
          
          // Listen for server-side close signal
          const onClose = () => {
            emit.complete();
          };
          ee.on('server:close-subscription', onClose);
          
          // Cleanup function
          return () => {
            ee.off('server:close-subscription', onClose);
          };
        });
      }),
    });

    const opts = testServerAndClientResource(appRouter, {
      wsClient: { 
        retryDelayMs: () => 10,
        // Disable lazy mode so connection stays open
        lazy: {
          enabled: false,
        },
      },
      client({ wsClient }) {
        return { links: [wsLink({ client: wsClient })] };
      },
      server: {},
      wssServer: { router: appRouter },
    });

    return { 
      ...opts, 
      ee, 
      subscriptionObserver,
      // Helper function to close subscription from server side
      closeSubscriptionFromServer: () => {
        ee.emit('server:close-subscription');
      },
    };
  }

  test('client connection state should update when server closes subscription', async () => {
    await using ctx = factory();

    const onStartedMock = vi.fn();
    const onDataMock = vi.fn();
    const onCompleteMock = vi.fn();
    const onErrorMock = vi.fn();
    const onConnectionStateChangeMock = vi.fn<[TRPCConnectionState<unknown>], void>();

    // Track connection state changes
    ctx.wsClient.connectionState.subscribe({
      next: onConnectionStateChangeMock,
    });

    // Subscribe to the closable subscription
    const subscription = ctx.client.closableSubscription.subscribe(undefined, {
      onStarted: onStartedMock,
      onData: onDataMock,
      onComplete: onCompleteMock,
      onError: onErrorMock,
    });

    // Wait for subscription to start and receive initial data
    await vi.waitFor(() => {
      expect(onStartedMock).toHaveBeenCalledTimes(1);
      expect(onDataMock).toHaveBeenCalledWith('initial-data');
    });

    // Verify connection is in a good state initially
    expect(onConnectionStateChangeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        state: 'pending',
        error: null,
        type: 'state',
      })
    );

    // Clear previous state change calls to focus on the closure
    onConnectionStateChangeMock.mockClear();

    // Close the subscription from the server side
    ctx.closeSubscriptionFromServer();

    // Wait for the subscription to complete
    await vi.waitFor(() => {
      expect(onCompleteMock).toHaveBeenCalledTimes(1);
    });

    // The bug in issue #6962: When the server closes a subscription,
    // the client's connection state should reflect this change, but it doesn't.
    // The connection state should transition to 'idle' when all subscriptions
    // are closed, but this doesn't happen.
    
    // Debug: Log what connection state changes we actually received
    console.log('Connection state changes after subscription closure:', 
      onConnectionStateChangeMock.mock.calls.map(call => call[0])
    );
    
    // This assertion fails due to the bug - the connection state
    // should update to reflect that the subscription was closed
    expect(onConnectionStateChangeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        state: 'idle', // Should transition to idle when subscription closes
        type: 'state',
      })
    );

    subscription.unsubscribe();
  });

  test('client should handle multiple subscription closures correctly', async () => {
    await using ctx = factory();

    const onStartedMock1 = vi.fn();
    const onDataMock1 = vi.fn();
    const onCompleteMock1 = vi.fn();
    const onStartedMock2 = vi.fn();
    const onDataMock2 = vi.fn();
    const onCompleteMock2 = vi.fn();
    const onConnectionStateChangeMock = vi.fn<[TRPCConnectionState<unknown>], void>();

    // Track connection state changes
    ctx.wsClient.connectionState.subscribe({
      next: onConnectionStateChangeMock,
    });

    // Create two subscriptions
    const subscription1 = ctx.client.closableSubscription.subscribe(undefined, {
      onStarted: onStartedMock1,
      onData: onDataMock1,
      onComplete: onCompleteMock1,
    });

    const subscription2 = ctx.client.closableSubscription.subscribe(undefined, {
      onStarted: onStartedMock2,
      onData: onDataMock2,
      onComplete: onCompleteMock2,
    });

    // Wait for both subscriptions to start
    await vi.waitFor(() => {
      expect(onStartedMock1).toHaveBeenCalledTimes(1);
      expect(onStartedMock2).toHaveBeenCalledTimes(1);
      expect(onDataMock1).toHaveBeenCalledWith('initial-data');
      expect(onDataMock2).toHaveBeenCalledWith('initial-data');
    });

    // Clear previous state change calls
    onConnectionStateChangeMock.mockClear();

    // Close the subscription from the server side
    ctx.closeSubscriptionFromServer();

    // Wait for both subscriptions to complete
    await vi.waitFor(() => {
      expect(onCompleteMock1).toHaveBeenCalledTimes(1);
      expect(onCompleteMock2).toHaveBeenCalledTimes(1);
    });

    // The connection state should update to reflect the subscription closures
    // This assertion should fail due to the bug in issue #6962
    expect(onConnectionStateChangeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        state: 'idle', // Should transition to idle when all subscriptions close
        type: 'state',
      })
    );

    subscription1.unsubscribe();
    subscription2.unsubscribe();
  });

  test('connection state should remain consistent during subscription lifecycle', async () => {
    await using ctx = factory();

    const connectionStates: TRPCConnectionState<unknown>[] = [];
    const onConnectionStateChangeMock = vi.fn<[TRPCConnectionState<unknown>], void>((state) => {
      connectionStates.push(state);
    });

    // Track all connection state changes
    ctx.wsClient.connectionState.subscribe({
      next: onConnectionStateChangeMock,
    });

    const onStartedMock = vi.fn();
    const onDataMock = vi.fn();
    const onCompleteMock = vi.fn();

    // Subscribe to the closable subscription
    const subscription = ctx.client.closableSubscription.subscribe(undefined, {
      onStarted: onStartedMock,
      onData: onDataMock,
      onComplete: onCompleteMock,
    });

    // Wait for subscription to start
    await vi.waitFor(() => {
      expect(onStartedMock).toHaveBeenCalledTimes(1);
      expect(onDataMock).toHaveBeenCalledWith('initial-data');
    });

    // Close the subscription from the server side
    ctx.closeSubscriptionFromServer();

    // Wait for the subscription to complete
    await vi.waitFor(() => {
      expect(onCompleteMock).toHaveBeenCalledTimes(1);
    });

    // Verify that connection state changes are consistent
    // The bug causes the connection state to not update properly when subscriptions are closed
    const finalStates = connectionStates.slice(-3); // Get the last few states
    
    // This assertion should fail due to the bug - the connection state should
    // reflect the subscription closure by transitioning to 'idle' but doesn't
    expect(finalStates).toContainEqual(
      expect.objectContaining({
        state: 'idle', // Should transition to idle when subscription closes
        type: 'state',
      })
    );

    subscription.unsubscribe();
  });
});