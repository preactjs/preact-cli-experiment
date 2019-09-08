import fs from "fs";
import path from "path";
import { promisify } from "util";
import chalk from "chalk";
import rimraf from "rimraf";

import PluginAPI from "../api/plugin";
import { runWebpack } from "../lib/webpack";
import { hookPlugins, isDir } from "../utils";
import { CLIArguments, CommandArguments } from "../types";

export type BuildArgv = CommandArguments<{
	clean: boolean;
	dest: string;
	prerender: boolean;
	production: boolean;
	brotli: boolean;
}>;

export type WatchArgv = CommandArguments<{ dest: string; clean: boolean; port: number }>;

export function cli(api: PluginAPI, opts: CLIArguments) {
	api.registerCommand("build [src]")
		.description("Build the current project into static files")
		.option("--clean", "Removes destination folder before building")
		.option("--dest <dir>", "Destination folder", "build")
		.option("--no-prerender", "Don't prerender URLs")
		.option("--production", "Sets the build as production build")
		.option("--brotli", "Enable Brotli compression")
		.action(async (src?: string, argv?: BuildArgv) => {
			const { cwd, pm } = opts;
			src = src !== undefined ? path.join(cwd, src) : cwd;
			const dest = path.join(src, argv.dest);
			api.debug("%o", { src, dest });
			// Set new values back into argv object
			Object.assign(argv, { src, dest });
			const modules = path.resolve(src, "./node_modules");
			if (!isDir(modules)) {
				api.setStatus(
					`No 'node_modules' folder found! Please run ${chalk.magenta(
						pm.getInstallCommand()
					)} before continuing.`,
					"fatal"
				);
			}
			if (argv.brotli) {
				api.setStatus(
					"⚛️ ATTENTION! You have enabled BROTLI support. In order for this to work correctly, make sure .js.br files are served with 'content-encoding: br' header.",
					"info"
				);
			}

			if (argv.clean) {
				api.setStatus("Removing old dest. directory");
				await promisify(rimraf)(dest);
			}

			const registry = await hookPlugins(argv.parent);
			const buildOptions = Object.assign({ log: api.setStatus }, argv, opts);
			registry.invoke("build", buildOptions);

			try {
				await runWebpack(api, buildOptions, config => registry.hookWebpackChain(config));
			} catch (err) {
				api.setStatus(`Error! ${err}`, "fatal");
			}
		});
	api.registerCommand("watch [src]")
		.description("Launch a dev server with hot-reload")
		.option("--dest <folder>", "Destination folder", "build")
		.option("--clean", "Removes dest. folder before starting")
		.option("-p, --port <number>", "Port to use", parseInt, "3000")
		.action(async (src?: string, argv?: WatchArgv) => {
			const { cwd, pm } = opts;
			src = src !== undefined ? path.join(cwd, src) : cwd;
			const dest = path.join(src, argv.dest);
			Object.assign(argv, { src, dest });

			const modules = path.resolve(src, "./node_modules");
			if (!isDir(modules)) {
				api.setStatus(
					`No 'node_modules' folder found! Please run ${chalk.magenta(
						pm.getInstallCommand()
					)} before continuing.`,
					"fatal"
				);
			}

			const registry = await hookPlugins(argv.parent);
			const watchOptions = Object.assign(
				{ log: api.setStatus, prerender: false, production: false, brotli: false },
				argv,
				opts
			);
			registry.invoke("watch", watchOptions);

			try {
				await runWebpack(api, watchOptions, config => registry.hookWebpackChain(config), true);
			} catch (err) {
				api.setStatus(`Error! ${err}`, "error");
			}
		});
}
