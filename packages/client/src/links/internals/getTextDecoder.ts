import type { TextDecoderEsque } from './streamingUtils';

export function getTextDecoder(
  customTextDecoder?: TextDecoderEsque,
): TextDecoderEsque {
  if (customTextDecoder) {
    return customTextDecoder;
  }

  // eslint-disable-next-line @typescript-eslint/prefer-optional-chain
  if (typeof window !== 'undefined' && window.TextDecoder) {
    return new window.TextDecoder();
  }
  // eslint-disable-next-line @typescript-eslint/prefer-optional-chain
  if (typeof globalThis !== 'undefined' && globalThis.TextDecoder) {
    return new globalThis.TextDecoder();
  }

  throw new Error('No TextDecoder implementation found');
}
