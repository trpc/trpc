/**
 * @internal
 */
export interface TextDecoderEsque {
  // eslint-disable-next-line @typescript-eslint/method-signature-style
  decode(chunk: Uint8Array): string;
}
