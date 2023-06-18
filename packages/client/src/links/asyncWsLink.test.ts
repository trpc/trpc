import { vi } from "vitest";
import { Operation } from "../";
import { createWSClient } from "./asyncWsLink";
import { WebSocket } from "mock-socket";

vi.mock("mock-socket", () => {
  const WebSocket = vi.fn();

  let relay: (msg: object) => void;

  WebSocket.prototype = {
    addEventListener: vi.fn(
      (event: string, cb: (data?: object) => void) => {
        if (event === "open") {
          setTimeout(cb, 20);
        }
        if (event === "message") {
          relay = cb;
        }
      },
    ),
    send: vi.fn((msgs: string) => {
      const msgsData = JSON.parse(msgs);
      msgsData.forEach((msgData: { id: number }) => {
        setTimeout(
          () => relay({ data: `{"id": ${msgData.id}}` }),
          Math.floor(Math.random() * 20),
        );
      });
    }),
  };

  return { WebSocket };
});

const TEST_URL = "ws://some.site/ws?token=magicToken";
const noop = () => {
  return;
};

async function mockApiUrlFetch() {
  return Promise.resolve(TEST_URL);
}

let id = 0;
function getMockRequest(type: Operation["type"] = "query") {
  return {
    type,
    input: null,
    path: ".",
    id: id++,
    context: {},
  };
}

test("asyncWsLink", async () => {
  const asyncSocketUrl = vi.fn(async () => mockApiUrlFetch());

  const asyncLink = createWSClient({
    WebSocket,
    url: asyncSocketUrl,
  });

  const responses = [];

  function requestFactory() {
    return new Promise<void>((res) => {
      asyncLink.request(getMockRequest(), {
        complete: noop,
        error: noop,
        next: (data) => {
          responses.push(data);
          res();
        },
      });
    });
  }

  await Promise.all([
    requestFactory(),
    requestFactory(),
    requestFactory(),
  ]);

  expect(asyncSocketUrl).toBeCalledTimes(1);
  // Todo: this should be replaced with jest style rules
  // or setup to be ignored in *.test.* files
  // eslint-disable-next-line @typescript-eslint/unbound-method
  expect(WebSocket.prototype.send).toBeCalledTimes(1);
  expect(responses.length).toBe(3);
});
