/**
 * The message port used by electron in main process
 */
export interface MessagePortMainLike {
  on: <T extends string>(event: T, callback: (event?: { data: any }) => void) => void
  postMessage: (data: any, transfer?: any[]) => void
}

/**
 * The message port used by browser extension
 */
export interface BrowserPortLike {
  onMessage: {
    addListener: (callback: (data: any) => void) => void
  }
  onDisconnect: {
    addListener: (callback: () => void) => void
  }
  postMessage: (data: any) => void
}

export type SupportedMessagePort = Pick<MessagePort, 'addEventListener' | 'postMessage'> | MessagePortMainLike | BrowserPortLike

/**
 * Message port can support [The structured clone algorithm](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm)
 */
export type SupportedMessagePortData = any

export function postMessagePortMessage(
  port: SupportedMessagePort,
  data: SupportedMessagePortData,
  transfer?: any[],
): void {
  if (transfer) {
    port.postMessage(data, transfer)
  }
  else {
    port.postMessage(data)
  }
}

export function onMessagePortMessage(port: SupportedMessagePort, callback: (data: SupportedMessagePortData) => void): void {
  /**
   * MessagePort in node.js might have "on" method but it pass different parameters vs MessagePortMainLike
   * So we need check "addEventListener" before "on"
   */
  if ('addEventListener' in port) {
    port.addEventListener('message', (event) => {
      callback(event.data)
    })
  }
  else if ('on' in port) {
    port.on('message', (event) => {
      callback(event?.data)
    })
  }
  else if ('onMessage' in port) {
    port.onMessage.addListener((data) => {
      callback(data)
    })
  }
  else {
    throw new Error('Cannot find a addEventListener/on/onMessage method on the port')
  }
}

export function onMessagePortClose(port: SupportedMessagePort, callback: () => void): void {
  /**
   * MessagePort in node.js might have "on" method but it pass different parameters vs MessagePortMainLike
   * So we need check "addEventListener" before "on"
   */
  if ('addEventListener' in port) {
    port.addEventListener('close', () => {
      callback()
    })
  }
  else if ('on' in port) {
    port.on('close', () => {
      callback()
    })
  }
  else if ('onDisconnect' in port) {
    port.onDisconnect.addListener(() => {
      callback()
    })
  }
  else {
    throw new Error('Cannot find a addEventListener/on/onDisconnect method on the port')
  }
}
