import { dirname, resolve, normalize, join } from "path";
import _glob from "glob";
import fs, { statSync, exists, stat } from "fs";
import { promisify } from "util";

import commander from "commander";
import chalk from "chalk";
import _debug from "debug";

import { PluginRegistry } from "./api/registry";
import { ChildProcess, exec, ExecOptions, spawn } from "child_process";

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
): Promise<Omit<ChildProcess, "stdout" | "stderr"> & { stdout: string; stderr: string }> {
	return new Promise((resolve, reject) => {
		const cp = exec(command, options, (err, stdout, stderr) => {
			if (err) reject(err);
			else resolve(Object.assign({}, cp, { stdout: stdout.trim(), stderr: stderr.trim() }));
		});
	});
}

export function memoize<A extends Array<any>, R>(func: (...args: A) => R): MemoizedFunction<typeof func> {
	let results: Array<[A, R]> = [];
	const f = (...args: A) => {
		const saved = results.find(r => Object.is(args, r[0]));
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
		const saved = results.find(r => Object.is(args, r[0]));
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

export const hookPlugins: MemoizedFunction<typeof _hookPlugins> = memoize(_hookPlugins);

async function _hookPlugins(program: commander.Command, cwd = process.cwd()) {
	try {
		const {
			path,
			contents: { dependencies, devDependencies }
		} = await getPackageJson(cwd);

		const matchingDependencies = new Set(Object.keys(dependencies).filter(filterPluginDependencies));
		if (matchingDependencies.size > 0) {
			console.warn(chalk.yellow("WARNING") + ": CLI plugins should be added as development dependencies.");
		}
		Object.keys(devDependencies)
			.filter(filterPluginDependencies)
			.forEach(dep => matchingDependencies.add(dep));
		return PluginRegistry.fromPlugins(dirname(path), program, [...matchingDependencies.values()]);
	} catch (err) {
		return new PluginRegistry();
	}
}

function filterPluginDependencies(dep: string) {
	return dep.startsWith("preact-cli-plugin-") || dep.startsWith("@preact/cli-plugin-");
}
