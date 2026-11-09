import * as DateTime from "effect/DateTime"
import assert from "node:assert/strict"

const size = 1024
const mask = size - 1
const start = Date.UTC(2024, 0, 1)
const epochs = Array.from({ length: size }, (_, i) => start + i * 7_777_777)
const isos = epochs.map((epoch) => new Date(epoch).toISOString())
const named = DateTime.zoneMakeNamedUnsafe("Europe/London")
const offset = DateTime.zoneMakeOffset(2 * 60 * 60 * 1000)

const assertParts = (result: unknown, epoch: number, offsetMillis = 0) => {
  const date = new Date(epoch + offsetMillis)
  assert.deepEqual(result, {
    millisecond: date.getUTCMilliseconds(),
    second: date.getUTCSeconds(),
    minute: date.getUTCMinutes(),
    hour: date.getUTCHours(),
    day: date.getUTCDate(),
    weekDay: date.getUTCDay(),
    month: date.getUTCMonth() + 1,
    year: date.getUTCFullYear()
  })
}

// Europe/London is UTC+1 from 01:00 UTC on the last Sunday of March until
// 01:00 UTC on the last Sunday of October, so expected parts do not depend on
// Intl or DateTime.
const lastSundayAt1Utc = (year: number, month: number) => {
  const date = new Date(Date.UTC(year, month + 1, 0, 1))
  return date.setUTCDate(date.getUTCDate() - date.getUTCDay())
}

const londonOffset = (epoch: number) => {
  const year = new Date(epoch).getUTCFullYear()
  return epoch >= lastSundayAt1Utc(year, 2) && epoch < lastSundayAt1Utc(year, 9) ? 60 * 60 * 1000 : 0
}

const assertUtc = (result: unknown, epoch: number) => {
  assert.ok(DateTime.isDateTime(result) && DateTime.isUtc(result))
  assert.equal(result.epochMilliseconds, epoch)
}

const populate = (self: DateTime.DateTime, order: number) => {
  switch (order % 3) {
    case 0:
      DateTime.toPartsUtc(self)
      DateTime.toDate(self)
      DateTime.toParts(self)
      break
    case 1:
      DateTime.toParts(self)
      DateTime.toPartsUtc(self)
      break
    case 2:
      DateTime.toDate(self)
      DateTime.toParts(self)
      DateTime.toPartsUtc(self)
      break
  }
  return self
}

export const makeNumber = () => {
  let i = 0
  return {
    run: () => DateTime.makeUnsafe(epochs[i++ & mask]),
    validate: (result: unknown) => assertUtc(result, epochs[(i - 1) & mask])
  }
}

export const makeIso = () => {
  let i = 0
  return {
    run: () => DateTime.makeUnsafe(isos[i++ & mask]),
    validate: (result: unknown) => assertUtc(result, epochs[(i - 1) & mask])
  }
}

export const makeZonedNamed = () => {
  let i = 0
  return {
    run: () => DateTime.makeZonedUnsafe(epochs[i++ & mask], { timeZone: named }),
    validate: (result: unknown) => {
      assert.ok(DateTime.isDateTime(result) && DateTime.isZoned(result))
      assert.equal(result.epochMilliseconds, epochs[(i - 1) & mask])
    }
  }
}

export const addZonedOffset = () => {
  const zoned = epochs.map((epoch) => DateTime.makeZonedUnsafe(epoch, { timeZone: offset }))
  let i = 0
  return {
    run: () => DateTime.add(zoned[i++ & mask], { hours: 1 }),
    validate: (result: unknown) => {
      assert.ok(DateTime.isDateTime(result) && DateTime.isZoned(result))
      assert.equal(result.epochMilliseconds, epochs[(i - 1) & mask] + 60 * 60 * 1000)
    }
  }
}

export const partsUtcFirst = () => {
  let i = 0
  return {
    run: () => DateTime.toPartsUtc(DateTime.makeUnsafe(epochs[i++ & mask])),
    validate: (result: unknown) => assertParts(result, epochs[(i - 1) & mask])
  }
}

export const partsOffsetFirst = () => {
  let i = 0
  return {
    run: () => DateTime.toParts(DateTime.makeZonedUnsafe(epochs[i++ & mask], { timeZone: offset })),
    validate: (result: unknown) => assertParts(result, epochs[(i - 1) & mask], offset.offset)
  }
}

export const partsNamedFirst = () => {
  let i = 0
  return {
    run: () => {
      const zoned = DateTime.makeZonedUnsafe(epochs[i++ & mask], { timeZone: named })
      DateTime.toDate(zoned)
      return DateTime.toParts(zoned)
    },
    validate: (result: unknown) => {
      const epoch = epochs[(i - 1) & mask]
      assertParts(result, epoch, londonOffset(epoch))
    }
  }
}

export const getPartsUtcFirst = () => {
  let i = 0
  return {
    run: () => {
      const utc = DateTime.makeUnsafe(epochs[i++ & mask])
      return DateTime.getPart(utc, "year") * 10_000 + DateTime.getPart(utc, "month") * 100 +
        DateTime.getPart(utc, "day")
    },
    validate: (result: unknown) => {
      const date = new Date(epochs[(i - 1) & mask])
      assert.equal(result, date.getUTCFullYear() * 10_000 + (date.getUTCMonth() + 1) * 100 + date.getUTCDate())
    }
  }
}

export const partsUtcCached = () => {
  const utcs = epochs.map((epoch) => populate(DateTime.makeUnsafe(epoch), 0))
  let i = 0
  return {
    run: () => DateTime.toPartsUtc(utcs[i++ & mask]),
    validate: (result: unknown) => assertParts(result, epochs[(i - 1) & mask])
  }
}

export const partsNamedCached = () => {
  const zoned = epochs.map((epoch) => populate(DateTime.makeZonedUnsafe(epoch, { timeZone: named }), 0))
  let i = 0
  return {
    run: () => {
      const self = zoned[i++ & mask]
      DateTime.toDate(self)
      return DateTime.toParts(self)
    },
    validate: (result: unknown) => {
      const epoch = epochs[(i - 1) & mask]
      assertParts(result, epoch, londonOffset(epoch))
    }
  }
}

export const partsMixedCached = () => {
  const values = epochs.map((epoch, i) =>
    populate(
      i % 4 === 0
        ? DateTime.makeUnsafe(epoch)
        : DateTime.makeZonedUnsafe(epoch, { timeZone: i % 2 === 0 ? named : offset }),
      i
    )
  )
  let i = 0
  return {
    run: () => {
      const self = values[i++ & mask]
      DateTime.toDate(self)
      DateTime.toPartsUtc(self)
      return DateTime.toParts(self)
    },
    validate: (result: unknown) => {
      const index = (i - 1) & mask
      const epoch = epochs[index]
      assertParts(result, epoch, index % 4 === 0 ? 0 : index % 2 === 0 ? londonOffset(epoch) : offset.offset)
    }
  }
}
