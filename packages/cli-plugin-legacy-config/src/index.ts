/* eslint-disable @typescript-eslint/no-var-requires */
import path from "path";
import fs from "fs";
import { promisify } from "util";
import chalk from "chalk";
import webpack from "webpack";
import { PluginAPI, CLIArguments, BuildArgv, WatchArgv } from "@preact/cli";
import WebpackConfigHelpers from "./webpack/config-helper";

type CustomConfigFn = (
	config: webpack.Configuration,
	env: any,
	helpers: WebpackConfigHelpers,
	options?: any
) => webpack.Configuration;
type CustomConfig = Partial<webpack.Configuration> & { webpack: CustomConfigFn };

const FILE = "preact.config";
const EXTENSIONS = ["js", "json"];

const stat = promisify(fs.stat);

export async function build(api: PluginAPI, opts: CLIArguments & BuildArgv): Promise<void> {
	return chainCustomConfig(opts, api);
}

export async function watch(api: PluginAPI, opts: CLIArguments & WatchArgv): Promise<void> {
	return chainCustomConfig(opts, api);
}

async function chainCustomConfig(opts: any, api: PluginAPI): Promise<void> {
	const env = Object.assign({}, opts, { dev: !opts.production });
	const helpers = new WebpackConfigHelpers(opts.cwd);
	const configFile = await findConfig(env);
	if (fs.existsSync(configFile)) {
		parseConfig(api, getDefault(require("esm")(module)(configFile))).forEach(([t, opts]) => {
			api.chainWebpack((chain) => {
				const isServer = chain.entryPoints.has("ssr-bundle");
				const transformed = t(
					chain.toConfig(),
					Object.assign({}, env, { isServer, ssr: isServer }),
					helpers,
					opts
				);
				return chain.merge(transformed);
			});
		});
	}
}

function parseConfig(api: PluginAPI, config: CustomConfig): [CustomConfigFn, any][] {
	const transformers: [CustomConfigFn, any][] = [];
	const addTransformer = (fn: CustomConfigFn, opts = {}) => transformers.push([fn, opts]);

	if (typeof config === "function") {
		addTransformer(config);
	} else if (typeof config === "object" && !Array.isArray(config)) {
		if (config.plugins && !Array.isArray(config.plugins))
			throw new Error("The `plugins` property in the preact config has to be an array");

		if (config.plugins)
			config.plugins
				.map<CustomConfigFn>((plugin, index) => {
					if (typeof plugin === "function") {
						return plugin;
					} else if (plugin && typeof plugin.apply === "function") {
						return plugin.apply.bind(plugin);
					} else if (Array.isArray(plugin)) {
						const [path, opts] = plugin;
						const m = require(path);
						const fn = (m && m.default) || m;

						if (typeof fn !== "function") {
							return () =>
								api.setStatus(`The plugin ${path} does not seem to be a function or a class`, "fatal");
						}

						// Detect webpack plugins and return wrapper transforms that inject them
						if (typeof fn.prototype.apply === "function") {
							return (config) => {
								config.plugins.push(new fn(opts));
							};
						}

						addTransformer(fn, opts);
						return;
					} else if (typeof plugin === "string") {
						addTransformer(require(plugin));
						return;
					} else {
						const name =
							(plugin as any) &&
							(plugin as any).prototype &&
							(plugin as any).prototype.constructor &&
							(plugin as any).prototype.constructor.name;

						return () =>
							api.setStatus(
								`Plugin invalid ${chalk.red(
									`(index: ${index}, name: ${name})`
								)}\nHas to be a function or an object/class with an \`apply\` function, is: ${chalk.magenta(
									typeof plugin
								)}`,
								"fatal"
							);
					}
				})
				.forEach(addTransformer);

		if (config.webpack) {
			if (typeof config.webpack !== "function")
				throw new Error("The `transformWebpack` property in the preact config has to be a function");

			addTransformer(config.webpack);
		}
	} else {
		throw new Error("Invalid export in the preact config, should be an object or a function");
	}
	return transformers;
}

async function findConfig(env: CLIArguments & BuildArgv): Promise<string> {
	for (const ext of EXTENSIONS) {
		const config = `${FILE}.${ext}`;
		const configPath = path.resolve(env.cwd, config);
		try {
			await stat(configPath);
			return configPath;
		} catch (e) {}
	}

	return FILE + ".js";
}

function getDefault<T>(val: T | { default: T }): T {
	if ("default" in val) return val.default;
	return val;
}

/* function getRuleName(rule: webpack.RuleSetUse): string {
	if (!rule) return "no-loader";
	if (typeof rule === "string") return rule;
	if (typeof rule === "function") {
		const data = {};
		return getRuleName(rule(data));
	}
	if (Array.isArray(rule)) {
		return rule.map((r) => getRuleName(r)).join(", ");
	}
	if ("loader" in rule) {
		return rule.loader;
	}
	return `${rule}`;
} */
