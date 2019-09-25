import { join } from "path";
import _glob from "glob";
import { promisify } from "util";
import test, { ExecutionContext } from "ava";
import dirTree from "directory-tree";
import _rmrf from "rimraf";
import { createProgram } from "../src/cli";

const glob = promisify(_glob);
const rimraf = promisify(_rmrf);

const subjectsDir = join(__dirname, "subjects");

async function buildMacro<T>(t: ExecutionContext<T>, input: string, extraArgs: string[] = []) {
	const projectDir = join(subjectsDir, input);
	const { run } = await createProgram(["--cwd", projectDir, "build", ...(extraArgs)]);
	run();
	setTimeout(() => {
		t.snapshot(dirTree(join(projectDir, "build")));
	});
}

buildMacro.title = (_: string | undefined, input: string, extra?: string[]) => `builds ${input}${extra ? " " + extra.join(" ") : ""}`;

test.afterEach(async t => {
	const dirs = await glob(join(subjectsDir, "**/build"));
	await Promise.all(dirs.map(v => rimraf(v)));
});

test("adds build command", async t => {
	const { program } = await createProgram(["build"]);
	// t.false(program.parseOptions(["build"]).unknown.includes("build"));
	const { args, unknown } = program.parseOptions(["build"]);
	t.false(unknown.includes("build"));
	t.true(args.includes("build"));
});

test.skip(buildMacro, "default");
test.serial.skip(buildMacro, "prerendering", ["--prerender-urls", "prerender-urls.json"])
test.serial.skip(buildMacro, "prerendering", ["--prerender-urls", "prerender-urls.js"]);
test.serial.skip(buildMacro, "prerendering", ["--prerender-urls", "prerender-urls.promise.js"]);
