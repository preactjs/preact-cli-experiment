import { ChildProcess, exec, ExecOptions } from "child_process";
import _debug from "debug";
import fs, { exists, stat, statSync } from "fs";
import _glob from "glob";
import { dirname, join, normalize, resolve } from "path";
import { promisify } from "util";

const debug = _debug("@preact/cli:utils");
const glob = promisify(_glob);
const readFile = promisify(fs.readFile);

export type MemoizedFunction<F extends Function> = F & { deleteCache: () => void };
export type PromiseValue<P extends Promise<any>> = P extends Promise<infer V> ? V : unknown;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getPackageJson(start: string): Promise<{ path: string; contents: any }> {
	const full = resolve(process.cwd(), start);
	const path = resolve(full, "./package.json");
	if (statSync(path).isFile()) {
		return readFile(path).then(b => ({ path, contents: JSON.parse(b.toString()) }));
	} else if (full !== "/") {
		return getPackageJson(dirname(full));
	}
	throw new Error("Couldn't find any package.json file");
}

export async function execAsync(
	command: string,
	options?: ExecOptions
): Promise<
	Omit<ChildProcess, "stdout" | "stderr"> & {
		stdout: string;
		stderr: string;
	}
> {
	return new Promise((resolve, reject) => {
		const cp = exec(command, options, (err, stdout, stderr) => {
			if (err) reject(Object.assign(err, { stdout: stdout.trim(), stderr: stderr.trim() }));
			else resolve(Object.assign({}, cp, { stdout: stdout.trim(), stderr: stderr.trim() }));
		});
	});
}

export function memoize<A extends Array<any>, R>(func: (...args: A) => R): MemoizedFunction<typeof func> {
	let results: Array<[A, R]> = [];
	const f = (...args: A) => {
		const saved = results.find(r => arrayIs(args, r[0]));
		debug("%O", { results, saved });
		if (saved === undefined) {
			const result = func(...args);
			results.push([args, result]);
			return result;
		}
		return saved[1];
	};

	f.deleteCache = () => {
		results = [];
	};

	return f;
}

export function memoizeAsync<A extends Array<any>, R extends Promise<any>>(
	func: (...args: A) => R
): MemoizedFunction<(...args: A) => Promise<PromiseValue<R>>> {
	let results: Array<[A, R]> = [];
	const f = async (...args: A) => {
		const saved = results.find(r => arrayIs(args, r[0]));
		debug("%O", { results, saved });
		if (saved === undefined) {
			const result = await func(...args);
			results.push([args, result]);
			return result;
		}
		return saved[1];
	};
	f.deleteCache = () => {
		results = [];
	};
	return f;
}

export function normalizePath(input: string): string {
	return normalize(input).replace(/\\/g, "/");
}

export function clearConsole(soft: boolean) {
	process.stdout.write(soft ? "\x1B[H\x1B[2J" : "\x1B[2J\x1B[3J\x1B[H\x1Bc");
}

export async function isFile(path: string): Promise<boolean> {
	return new Promise((resolve, reject) => {
		exists(path, exists => {
			if (exists)
				stat(path, (err, stats) => {
					if (err) reject(err);
					else resolve(stats.isFile());
				});
			else resolve(false);
		});
	});
}

export async function isDir(path: string): Promise<boolean> {
	return new Promise((resolve, reject) => {
		exists(path, exists => {
			if (exists)
				stat(path, (err, stats) => {
					if (err) reject(err);
					else resolve(stats.isDirectory());
				});
			else resolve(false);
		});
	});
}

export function stringify(a: any): string {
	if ("toString" in a) {
		return a.toString();
	}
	return `${a}`;
}

export function arrayIs<T>(arr1: T[], arr2: T[]): boolean {
	if (arr1.length !== arr2.length) return false;
	for (let i = 0; i < arr1.length; i++) {
		if (arr1[i] !== arr2[i]) return false;
	}
	return true;
}

export const getGlobalPackages = memoizeAsync(_getGlobalPackages);

async function _getGlobalPackages(): Promise<Record<string, string>> {
	const globalPath = await execAsync("npm get prefix --global").then(cp => cp.stdout);
	debug("global path %o", globalPath);
	const files = await glob(join(globalPath, "lib", "node_modules", "{*,@*/*}", "package.json"));
	return files
		.map(async f => {
			return JSON.parse(await readFile(f).then(b => b.toString()));
		})
		.reduce(async (obj, p) => Object.assign(obj, { [(await p).name]: (await p).version }), {});
}
