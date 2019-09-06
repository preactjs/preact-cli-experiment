import { dirname, resolve } from "path";
import { statSync, readFile } from "fs";

import { CommanderStatic } from "commander";
import chalk from "chalk";

import { PluginRegistry } from "./api/registry";
import { ChildProcess, exec } from "child_process";

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

export async function execAsync(command: string): Promise<ChildProcess> {
	return new Promise((resolve, reject) => {
		const cp = exec(command, err => {
			if (err) reject(err);
			else resolve(cp);
		});
	});
}

export async function hookPlugins(program: CommanderStatic) {
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
}

function filterPluginDependencies(dep: string) {
	return dep.startsWith("preact-cli-plugin-") || dep.startsWith("@preact/cli-plugin-");
}
