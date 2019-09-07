import { dirname, resolve, normalize } from "path";
import { statSync, readFile } from "fs";

import { CommanderStatic } from "commander";
import chalk from "chalk";

import { PluginRegistry } from "./api/registry";
import { ChildProcess, exec, ExecOptions } from "child_process";

type PromiseValue<P extends Promise<any>> = P extends Promise<infer V> ? V : unknown;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getPackageJson(start: string): Promise<{ path: string; contents: any }> {
	const full = resolve(process.cwd(), start);
	const path = resolve(full, "./package.json");
	if (statSync(path).isFile()) {
		return new Promise((resolve, reject) => {
			readFile(path, (err, data) => {
				if (err) reject(err);
				else resolve({ path, contents: JSON.parse(data.toString()) });
			});
		});
	} else if (full !== "/") {
		return getPackageJson(dirname(full));
	}
	throw new Error("Couldn't find any package.json file");
}

export async function execAsync(command: string, options?: ExecOptions): Promise<ChildProcess> {
	return new Promise((resolve, reject) => {
		const cp = exec(command, options, err => {
			if (err) reject(err);
			else resolve(cp);
		});
	});
}

export function memoize<A extends Array<any>, R>(func: (...args: A) => R): (...args: A) => R {
	const results: Array<[A, R]> = [];
	return (...args: A) => {
		const saved = results.find(r => Object.is(args, r[0]));
		if (saved === undefined) {
			const result = func(...args);
			results.push([args, result]);
			return result;
		}
		return saved[1];
	};
}

export function memoizeAsync<A extends Array<any>, R extends Promise<any>>(
	func: (...args: A) => R
): (...args: A) => Promise<PromiseValue<R>> {
	const results: Array<[A, R]> = [];
	return async (...args: A) => {
		const saved = results.find(r => Object.is(args, r[0]));
		if (saved === undefined) {
			const result = await func(...args);
			results.push([args, result]);
			return result;
		}
		return saved[1];
	};
}

export function normalizePath(input: string): string {
	return normalize(input).replace(/\\/g, "/");
}

export function clearConsole(soft: boolean) {
	process.stdout.write(soft ? "\x1B[H\x1B[2J" : "\x1B[2J\x1B[3J\x1B[H\x1Bc");
}

export const hookPlugins = memoize(_hookPlugins);

async function _hookPlugins(program: CommanderStatic) {
	try {
		const {
			path,
			contents: { dependencies, devDependencies }
		} = await getPackageJson(process.cwd());

		const matchingDependencies = new Set(Object.keys(dependencies).filter(filterPluginDependencies));
		if (matchingDependencies.size > 0) {
			console.warn(chalk.yellow("WARNING") + ": CLI plugins should be added as development dependencies.");
		}
		Object.keys(devDependencies)
			.filter(filterPluginDependencies)
			.forEach(dep => matchingDependencies.add(dep));
		return PluginRegistry.fromPlugins(path, program, [...matchingDependencies.values()]);
	} catch (err) {
		return new PluginRegistry();
	}
}

function filterPluginDependencies(dep: string) {
	return dep.startsWith("preact-cli-plugin-") || dep.startsWith("@preact/cli-plugin-");
}
