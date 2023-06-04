import { TextDecoderEsque } from './streamingUtils';

export function getTextDecoder(
  customTextDecoder?: TextDecoderEsque,
): TextDecoderEsque {
  if (customTextDecoder) {
    return customTextDecoder;
  }

  if (typeof window !== 'undefined' && window.TextDecoder) {
    return new window.TextDecoder();
  }

  if (typeof globalThis !== 'undefined' && globalThis.TextDecoder) {
    return new globalThis.TextDecoder();
  }

  throw new Error('No TextDecoder implementation found');
}
