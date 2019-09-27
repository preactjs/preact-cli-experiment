import { join, resolve, relative } from "path";
import _glob from "glob";
import { promisify } from "util";
import test, { ExecutionContext } from "ava";
import directoryTree from "directory-tree";
import _rmrf from "rimraf";
import { createProgram } from "../src/cli";
import { execAsync } from "../src/utils";
import { readFile } from "fs";
import { createHash } from "crypto";

interface DirTreeItem {
	path: string;
	size: number;
	hash: string;
}

const glob = promisify(_glob);
const rimraf = promisify(_rmrf);

const subjectsDir = join(__dirname, "subjects");

async function buildMacro<T>(t: ExecutionContext<T>, input: string, extraArgs: string[] = []) {
	const projectDir = join(subjectsDir, input);
	t.log("Installing dependencies...");
	await execAsync("yarn", { cwd: projectDir }).catch(m => {
		t.log("yarn failed to run", m.stdout, m.stderr);
		t.fail();
	});
	t.log("Running build...");
	await execAsync(`ts-node ${join(__dirname, "../src/bin/preact.ts")} build ${extraArgs.join(" ")}`, {
		cwd: projectDir
	}).catch(m => {
		t.log("Build failed", m.stdout, m.stderr);
		t.fail();
	});
	const tree = await buildDirectoryTree(join(projectDir, "build")).catch(err => {
		t.log(err);
		t.fail();
	});
	if (!Array.isArray(tree)) return; // For the TypeScript checker
	t.true(tree.length > 0);
	t.snapshot(tree);
}

buildMacro.title = (_: string | undefined, input: string, extra?: string[]) =>
	`builds ${input}${extra ? " " + extra.join(" ") : ""}`;

test.beforeEach(async t => {
	t.log("Cleaning subjects directories..");
	const dirs = await glob(join(subjectsDir, "**/{build,node_modules}"));
	await Promise.all(dirs.map(v => rimraf(v)));
});

test("adds build command", async t => {
	const { program } = await createProgram(["build"]);
	// t.false(program.parseOptions(["build"]).unknown.includes("build"));
	const { args, unknown } = program.parseOptions(["build"]);
	t.false(unknown.includes("build"));
	t.true(args.includes("build"));
});

test(buildMacro, "default");
test.serial(buildMacro, "prerendering", ["--prerender-urls", "prerender-urls.json"]);
test.serial(buildMacro, "prerendering", ["--prerender-urls", "prerender-urls.js"]);
test.serial(buildMacro, "prerendering", ["--prerender-urls", "prerender-urls.promise.js"]);

function buildDirectoryTree(folder: string): Promise<DirTreeItem[]> {
	folder = resolve(folder);
	const files = new Array<{ filepath: string; stats: directoryTree.Stats }>();
	directoryTree(folder, {}, async (item, filepath, stats) => {
		files.push({ filepath: item.path, stats });
	});
	return Promise.all(
		files.map(async ({ filepath, stats }) => ({
			path: relative(folder, filepath),
			size: stats.size,
			hash: await hashFile(filepath)
		}))
	);
}

async function hashFile(file: string): Promise<string> {
	return new Promise((resolve, reject) => {
		readFile(file, (err, data) => {
			if (err) reject(err);
			else {
				const shasum = createHash("sha1");
				shasum.update(data);
				resolve(shasum.digest().toString("hex"));
			}
		});
	});
}
