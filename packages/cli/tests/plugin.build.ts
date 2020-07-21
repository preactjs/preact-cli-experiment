import test from "ava";
import { createProgram } from "../src/cli";

test("adds build command", async t => {
	const { program } = await createProgram(["build"]);
	// t.false(program.parseOptions(["build"]).unknown.includes("build"));
	/*const { args, unknown } = program.parseOptions(["build"]);
	t.false(unknown.includes("build"));
	t.true(args.includes("build"));*/
	const { operands, unknown } = program.parseOptions(["build"]);
	t.false(unknown.includes("build"));
	t.true(operands.includes("build"));
});
