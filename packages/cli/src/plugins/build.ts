import fs from "fs";
import path from "path";
import { promisify } from "util";
import chalk from "chalk";
import rimraf from "rimraf";

import PluginAPI from "../api/plugin";
import { runWebpack, resolveWebpack } from "../lib/webpack";
import { hookPlugins, isDir } from "../utils";
import { CLIArguments, CommandArguments } from "../types";

export type BuildArgv = CommandArguments<{
	analyze: boolean;
	brotli: boolean;
	clean: boolean;
	dest: string;
	esm: boolean;
	inlineCss: boolean;
	onlyResolve?: string;
	prerender: boolean;
	prerenderUrls: string;
	preload: boolean;
	production: boolean;
	sw: boolean;
	template?: string;
}>;

export type WatchArgv = CommandArguments<{
	dest: string;
	clean: boolean;
	port: number;
	rhl: boolean;
}>;

export function cli(api: PluginAPI, opts: CLIArguments) {
	api.registerCommand("build [src]")
		.description("Build the current project into static files")
		.option("--analyze", "Analyze client bundle")
		.option("--brotli", "Enable Brotli compression")
		.option("--clean", "Removes destination folder before building")
		.option("--dest <dir>", "Destination folder", "build")
		.option("--preload", "Add preload attributes to assets")
		.option("--production", "Sets the build as production build")
		.option("--sw", "Generate and attach service workers")
		.option("--template <path>", "Use a custom template to render the HTML", undefined)
		.option("--no-inline-css", "Disable inlining of CSS")
		.option("--no-prerender", "Don't prerender URLs")
		.option("--prerender-urls <url>", "URLs to prerender", "prerender-urls.json")
		.option("--only-resolve <type>", "Don't build, just print the JSON to stdout")
		.action(async (src?: string, argv?: BuildArgv) => {
			const { cwd, pm } = opts;
			src = src !== undefined ? path.resolve(cwd, src) : cwd;
			const dest = path.resolve(cwd, argv.dest);
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

			const registry = await api.getRegistry();
			const buildOptions = Object.assign({}, argv, opts);
			await registry.invoke("build", buildOptions);

			if (argv.onlyResolve) {
				const resolvedConfig = await resolveWebpack(
					api,
					buildOptions,
					config => registry.hookWebpackChain(config),
					argv.onlyResolve === "server"
				);
				process.stdout.write(JSON.stringify(resolvedConfig, avoidCircularReference()));
				return;
			}

			try {
				await runWebpack(api, buildOptions, config => registry.hookWebpackChain(config));
			} catch (err) {
				if (api.debug.enabled) throw err;
				api.setStatus(`Error! ${err}`, "fatal");
			}
		});
	api.registerCommand("watch [src]")
		.description("Launch a dev server with hot-reload")
		.option("--dest <folder>", "Destination folder", "build")
		.option("--no-esm", "Don't output a ES2015 bundle")
		.option("--no-sw", "Disable service worker generation")
		.option("--no-rhl", "Don't use react-hot-loader")
		.option("--clean", "Removes dest. folder before starting")
		.option("-p, --port <number>", "Port to use", parseInt, 3000)
		.action(async (src?: string, argv?: WatchArgv) => {
			api.debug("Watch argv %o", argv.port);
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

			const registry = await api.getRegistry();
			const watchOptions = Object.assign(
				{
					prerender: false,
					production: false,
					brotli: false,
					esm: false,
					sw: false
				},
				argv,
				opts
			);
			await registry.invoke("watch", watchOptions);

			try {
				await runWebpack(api, watchOptions, config => registry.hookWebpackChain(config), true);
			} catch (err) {
				api.setStatus(`Error! ${err}`, "error");
				if (api.debug.enabled) {
					throw err;
				}
			}
		});
}

function avoidCircularReference(): (key: string, value: any) => any {
	const objects = new Set<object>();
	return (_, value) =>
		typeof value === "object" && !Array.isArray(value) && objects.has(value)
			? "[Circular]"
			: objects.add(value) && value;
}
