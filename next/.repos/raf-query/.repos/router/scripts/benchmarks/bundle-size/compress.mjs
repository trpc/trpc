import fs from 'node:fs'
import path from 'node:path'
import { brotliCompressSync, gzipSync } from 'node:zlib'

function sumSizes(files) {
  let rawBytes = 0
  let gzipBytes = 0
  let brotliBytes = 0

  for (const file of files) {
    rawBytes += file.rawBytes
    gzipBytes += file.gzipBytes
    brotliBytes += file.brotliBytes
  }

  return { rawBytes, gzipBytes, brotliBytes, files }
}

// Keep the cache local to one measurement: rebuilds can reuse filenames.
export function measureFileSizes(baseDir, jsFiles, initialJsFiles, onTiming) {
  const measured = new Map()
  let gzipMs = 0
  let brotliMs = 0

  function measureFile(file) {
    let sizes = measured.get(file)
    if (sizes) {
      return sizes
    }

    const content = fs.readFileSync(path.join(baseDir, file))
    const gzipStarted = onTiming ? performance.now() : 0
    let gzipBytes
    try {
      gzipBytes = gzipSync(content).byteLength
    } finally {
      if (onTiming) {
        gzipMs += performance.now() - gzipStarted
      }
    }
    const brotliStarted = onTiming ? performance.now() : 0
    let brotliBytes
    try {
      brotliBytes = brotliCompressSync(content).byteLength
    } finally {
      if (onTiming) {
        brotliMs += performance.now() - brotliStarted
      }
    }

    sizes = { file, rawBytes: content.byteLength, gzipBytes, brotliBytes }
    measured.set(file, sizes)
    return sizes
  }

  try {
    const sizes = sumSizes(jsFiles.map(measureFile))
    const initialSizes = sumSizes(initialJsFiles.map(measureFile))
    return { sizes, initialSizes }
  } finally {
    onTiming?.('gzip', gzipMs)
    onTiming?.('brotli', brotliMs)
  }
}
