import test from "ava";
import { memoize, memoizeAsync, arrayIs } from "../src/utils";

function delay(ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

test("arrayIs", t => {
	t.true(arrayIs([1, 2], [1, 2]));
	t.false(arrayIs([1], [1, 2]));
	t.false(arrayIs([2, 1], [1, 2]));
})

test("memoize", t => {
	t.plan(8);
	const func = (s: string) => { t.pass(); return s };
	const mem = memoize(func);
	t.is("a", mem("a"));
	t.is("b", mem("b"));
	t.is("b", mem("b"));
	t.is("a", mem("a"));
	mem.deleteCache();
	t.is("a", mem("a"));
});

test("memoizeAsync", async t => {
	t.plan(8);
	const func = async (s: string) => delay(100).then(() => t.pass()).then(() => s);
	const mem = memoizeAsync(func);

	t.is("a", await mem("a"));
	t.is("b", await mem("b"));
	t.is("b", await mem("b"));
	t.is("a", await mem("a"));
	mem.deleteCache();
	t.is("a", await mem("a"));
})
