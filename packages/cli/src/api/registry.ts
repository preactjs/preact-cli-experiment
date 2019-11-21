import chalk from "chalk";
import commander, { Command } from "commander";
import _debug from "debug";
import { dirname } from "path";
import Config from "webpack-chain";

import { getGlobalPackages, getPackageJson, memoizeAsync } from "../utils";

import PluginAPI from "./plugin";

const debug = _debug("@preact/cli:registry");

export class PluginRegistry {
	private registry: Map<string, PluginAPI>;

	public static hookPlugins = memoizeAsync(PluginRegistry._hookPlugins);

	/**
	 * Creates a PluginRegistry from a list of packages.
	 * @param base Base folder which plugins will consider to be the project
	 *     root.
	 * @param commander Commander instance used to register new commands
	 * @param plugins List of package names to be included in the registry
	 */
	public static fromPlugins(base: string, commander: Command, plugins: string[]) {
		return plugins
			.map(name => {
				const path = require.resolve(name);
				debug("Resolving plugin %o to %o", name, path);
				return new PluginAPI(base, name, path, commander);
			})
			.reduce((registry, plugin) => {
				registry.add(plugin);
				return registry;
			}, new PluginRegistry());
	}
	/**
	 * Initializes an empty registry
	 */
	constructor() {
		this.registry = new Map();
	}

	/**
	 * Adds a plugin to the registry
	 * @param plugin Plugin to add
	 */
	public add(plugin: PluginAPI) {
		if (this.registry.has(plugin.id)) throw new Error("Plugin is already in the registry!");
		debug("Adding plugin ID %o", plugin.id);
		this.registry.set(plugin.id, plugin);
	}

	/**
	 * Returns a wrapper API around a single plugin
	 * @param name Name or API instance of the plugin
	 */
	public plugin(name: string | PluginAPI) {
		if (typeof name === "string") {
			if (this.registry.has(`@preact/cli-plugin-${name}`)) name = `@preact/cli-plugin-${name}`;
			else if (this.registry.has("preact-cli-plugin-" + name)) name = "preact-cli-plugin-" + name;
			else throw new Error("Couldn't find plugin " + name);
		}
		const plugin = typeof name === "string" ? this.registry.get(name) : name;
		return {
			invoke: async <T = void>(funcName: string, options: any = {}) => {
				const mod = require(plugin.importBase)[funcName];
				debug(
					"Invoking %o from plugin %o " + chalk.grey(!!mod ? "exists" : "doesn't exist"),
					funcName,
					plugin.id
				);
				if (mod) {
					try {
						const result = await normalizePromise(mod(plugin, Object.assign({}, options))).catch(err => {
							plugin.setStatus(`Plugin execution error, skipping`, "error");
							debug("Plugin %o exec error %O", plugin.id, err);
						});
						plugin.setStatus();
						return result as T;
					} catch (err) {
						plugin.setStatus(`Plugin error: ${err}`, "fatal");
					}
				}
				return undefined;
			},
			instance: () => plugin
		};
	}

	/**
	 * Transforms the input webpack configuration by installed plugins
	 * @param config `webpack-chain` configuraiton to be transformed by the
	 *     plugins' transformer functions
	 */
	public hookWebpackChain(config: Config) {
		for (const plugin of this.registry.values()) {
			debug(`Applying ${chalk.greenBright("webpack-chain")} functions for %o`, plugin.id);
			plugin.getChains().forEach(chainer => chainer(config));
		}
		return config;
	}

	/**
	 * Invoke an exported function from plugins that define it.
	 * @param funcName Exported function to invoke in each plugin
	 * @param options Extra options to pass to the invoked options
	 */
	public async invoke<A = void>(funcName: string, options: any = {}): Promise<(A | undefined)[]> {
		debug("calling function %o on plugins %o", funcName, [...this.registry.values()].map(p => p.id));
		return Promise.all(
			[...this.registry.values()].map(async plugin => this.plugin(plugin).invoke<A>(funcName, options))
		);
	}

	private static async _hookPlugins(program: commander.Command, cwd = process.cwd()) {
		try {
			const {
				path,
				contents: { dependencies, devDependencies }
			} = await getPackageJson(cwd);

			const globalPackages = await getGlobalPackages();
			debug("Global packages: %O", globalPackages);
			const matchingDependencies = new Set(
				Object.keys({ ...globalPackages, ...dependencies }).filter(this.filterPluginDependencies)
			);
			if (matchingDependencies.size > 0) {
				console.warn(chalk.yellow("WARNING") + ": CLI plugins should be added as development dependencies.");
			}
			Object.keys(devDependencies)
				.filter(this.filterPluginDependencies)
				.forEach(dep => matchingDependencies.add(dep));
			return PluginRegistry.fromPlugins(dirname(path), program, [...matchingDependencies.values()]);
		} catch (err) {
			return new PluginRegistry();
		}
	}
	private static filterPluginDependencies(dep: string): boolean {
		return dep.startsWith("preact-cli-plugin-") || dep.startsWith("@preact/cli-plugin-");
	}
}

function normalizePromise<T>(val: T | Promise<T>): Promise<T> {
	if (val instanceof Promise) return val;
	return Promise.resolve(val);
}
