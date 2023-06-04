import { TextDecoderEsque } from "./streamingUtils";

export function getTextDecoder(
  customTextDecoder?: TextDecoderEsque,
): TextDecoderEsque {
  if (customTextDecoder) {
    return customTextDecoder;
  }
 
  if (typeof window !== 'undefined' && typeof window.TextDecoder === 'function') {
    return new window.TextDecoder();
  }
 
  if (typeof globalThis !== 'undefined' && typeof globalThis.TextDecoder === 'function') {
    return new globalThis.TextDecoder();
  }
 
  throw new Error('No TextDecoder implementation found');
}