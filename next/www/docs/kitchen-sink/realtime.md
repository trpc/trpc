---
title: Real-time chat with subscriptions
label: Real-time
description: A chat room with who's online, over SSE subscriptions on an in-memory `experimental_Publisher`, where `tracked()` ids let a dropped connection resume without losing a message.
section: Kitchen sink
order: 4
experiment: kitchen-sink
---

The demo is a chat with two rooms, open in two browsers, one for Ada and one for Grace. Each browser subscribes to its room's messages and to who's in the room. A message one sends arrives in the other as an event on its subscription, and the requests panel shows each subscription's events as they come in.

```demo
realtime
```

Things to try:

- Send a message as Ada. It arrives in Grace's browser without a request of hers: it's the next event on her open `room.messages` subscription.
- Open `#random` in one browser. That browser leaves `#general`'s list of who's online, and the other sees it change.
- Press **Drop connections**, then send a message from either browser before they reconnect. Each subscription reconnects with the id of the last message it got (open its request to see the `last-event-id` header), and gets only the message it missed.
- Press **Fail next request**, then **Drop connections**. The first reconnect fails too, and the link tries again.
- Reload one browser. Its subscriptions close, so its user leaves the room until the app is back.
- Edit the code: change the welcome message in `server.ts`, or the reconnect delay in `trpc.ts`.

## A channel per room

An `experimental_Publisher` sends each event to whoever subscribes to its channel. The demo's has two channels per room: its messages, and the list of who's in it. The template literal keys type every room's channels ([Publisher](../subscriptions/publisher.md#a-channel-per-audience)):

```sample title="server.ts"
kitchen-sink-realtime/src/server.ts#publisher
```

Sending a message publishes it to the room's channel, and `room.messages` returns the channel's events. The publisher's events are `tracked()`: each has an id, which SSE sends as the event's `id:`:

```sample title="server.ts"
kitchen-sink-realtime/src/server.ts#router
```

The handler provides the in-memory publisher, which keeps each channel's last 100 events. They're the room's history: a new subscriber asks for everything after `'0'`, so it gets them all before the live ones.

```sample title="server.ts"
kitchen-sink-realtime/src/server.ts#handler
```

## Resuming after a dropped connection

`httpLink` reads each event's id as it arrives. When the connection drops, it waits, then subscribes again with the last id as the `Last-Event-ID` header, and the resolver gets it as `opts.lastEventId`. The publisher replays what it kept after that id, then follows the live events, so the browser gets the messages it missed, once each ([Resuming](../subscriptions/overview.md#resuming)). The demo waits 3 seconds before each reconnect, which leaves time to send a message while the other browser is away:

```sample title="trpc.ts"
kitchen-sink-realtime/src/trpc.ts#client
```

In the requests panel, the dropped subscription ends as `failed`, and the reconnect is a new request whose headers include `last-event-id`. Its response starts with the missed messages.

## Who's online

`room.online` is a subscription with a side effect: opening it joins the room, and closing it leaves. `presence()` counts each user's open subscriptions per room, so a user with the room open twice stays until both close, and publishes the new list on every change:

```sample title="server.ts"
kitchen-sink-realtime/src/server.ts#presence
```

The resolver joins before it subscribes, and asks the publisher for the events after its own join, so no change between the two is lost. `Stream.ensuring` leaves when the stream ends for any reason: the browser closed it, its connection dropped, or the server shut down. The list's events drop their ids, so a reconnect has nothing to resume from and starts over: it joins again and gets who's there now, which is what a list of who's online should show.

## Subscriptions in the query cache

The room page reads both subscriptions with `useQuery`. `streamedOptions()` keeps every event so far as the query's data, and `liveOptions()` keeps the latest one, so the messages are a list and who's online is the current list. Each subscription opens with the first component that reads it and closes when the last one unmounts, so leaving the page leaves the room ([In the query cache](../integrations/tanstack-query/subscriptions.md#in-the-query-cache)):

```sample title="room.tsx"
kitchen-sink-realtime/src/room.tsx#subscribe
```

A message event is the `tracked()` envelope, `{ id, data }`, so each message shows its id: the one a reconnect resumes after.
