import { describe, expect, it } from "@effect/vitest";

import { replaceEqualDeep } from "./share.ts";

describe("replaceEqualDeep", () => {
	it("returns the previous value when deeply equal", () => {
		const previous = { a: [1, { b: "x" }], c: null };
		expect(replaceEqualDeep(previous, { a: [1, { b: "x" }], c: null })).toBe(
			previous,
		);
	});

	it("copies the next value, reusing equal subtrees", () => {
		const previous = { changed: { n: 1 }, kept: { deep: [1] } };
		const next = replaceEqualDeep(previous, {
			changed: { n: 2 },
			kept: { deep: [1] },
		});
		expect(next).toEqual({ changed: { n: 2 }, kept: { deep: [1] } });
		expect(next.kept).toBe(previous.kept);
	});

	it("notices added, removed and undefined fields, and length changes", () => {
		const previous = { a: 1 };
		expect(replaceEqualDeep(previous, { a: 1, b: undefined })).not.toBe(
			previous,
		);
		expect(replaceEqualDeep({ a: 1, b: 2 }, { a: 1 })).toEqual({ a: 1 });
		const list = [1, 2];
		expect(replaceEqualDeep(list, [1, 2, 3])).toEqual([1, 2, 3]);
		expect(replaceEqualDeep(list, [1])).toEqual([1]);
	});

	it("takes anything but plain objects and arrays from the next value", () => {
		const date = new Date(0);
		const next = new Date(0);
		expect(replaceEqualDeep(date, next)).toBe(next);
		const map = new Map([[1, 1]]);
		const nextMap = new Map([[1, 1]]);
		expect(replaceEqualDeep({ map }, { map: nextMap }).map).toBe(nextMap);
	});
});
