// Adapted from https://www.loginradius.com/blog/engineering/guest-post/http-streaming-with-nodejs-and-fetch-api/

const textDecoder = new TextDecoder()

/**
 * @param readableStream as given by `(await fetch(url)).body`
 * @param parser defaults to `JSON.parse`
 * 
 * @example
 * ```ts
 * const batch = [ ... ] // the array of items you sent to the server
 * const responseReader = parseJsonStream(response.body)
 * // treating the first result separately in case response was not streamed and we parsed the whole thing
 * const firstRes = responseReader.next()
 * if (firstRes.done) {
 * 	const matches = batch.map((item,i) => [item, firstRes.value[i]])
 * 	return
 * }
 * // otherwise, we have have a stream, so finish dealing with the first response and let the rest yield
 * const firstMatch = [batch[firstRes.value[0]], firstRes.value[1]]
 * for await (const [index, data] of responseReader) {
 * 	const match = [batch[index], data] // out-of-order streaming, so we need `index`
 * }
 * ```
 */
export async function* parseJsonStream (
	readableStream: ReadableStream<Uint8Array>,
	parser: (text: string) => any = JSON.parse,
) {
	const lineIterator = readLines(readableStream.getReader())
	const firstLine = await lineIterator.next()

	if (firstLine.done) throw new Error('Stream reader error, never yields')

	// if format isn't correct immediately, exhaust the stream and parse it all
	if (firstLine.value.length > 1 || firstLine.value[0] !== '{') {
		const text = await allLinesSink(firstLine.value, lineIterator)
		return parser(text)
	}

	for await (const line of lineIterator) {
		const string = line[0] === ','
			? line.substring(1, line.length)
			: line

		if (!string) continue
		if (string === '}') break

		// parsing index out of start of line "0":{...}
		// lines after the first one start with a comma ,"1":{...}
		const start = 2
		const end = 6
		let i = start // start after first digit to save iterations
		while (i < end) { // assumes index will never be longer than 4 digits
			if (string[i] === '"') break
			i++
		}
		if (i === end) throw new Error('Invalid JSON')

		const index = string.substring(1, i)
		const text = string.substring(i + 2)
		const result: [index: string, data: any] = [index, parser(text)]
		yield result
	}
}

async function allLinesSink (init: string, iterator: AsyncGenerator<string, void>) {
	while (true) {
		const line = await iterator.next()
		if (line.done) return init
		init += '\n' + line.value
	}
}

async function* readLines (reader: ReadableStreamDefaultReader<Uint8Array>) {
	let partOfLine = ''
	for await (const chunk of readChunks(reader)) {
		const chunkText = textDecoder.decode(chunk)
		const chunkLines = chunkText.split('\n')
		if (chunkLines.length === 1) {
			partOfLine += chunkLines[0]
		} else if (chunkLines.length > 1) {
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- length checked above
			yield partOfLine + chunkLines[0]!
			for (let i = 1; i < chunkLines.length - 1; i++) {
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- length checked above
				yield chunkLines[i]!
			}
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- length doesn't change
			partOfLine = chunkLines[chunkLines.length - 1]!
		}
	}
}

function readChunks (reader: ReadableStreamDefaultReader<Uint8Array>) {
	return {
		async*[Symbol.asyncIterator] () {
			let readResult = await reader.read()
			while (!readResult.done) {
				yield readResult.value
				readResult = await reader.read()
			}
		},
	}
}