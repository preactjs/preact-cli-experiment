import path from "path";
import { CommanderStatic } from "commander";
import _debug from "debug";
import Config from "webpack-chain";

import PluginAPI from "./plugin";
import chalk from "chalk";

const debug = _debug("@preact/cli:registry");

export class PluginRegistry {
	private registry: Map<string, PluginAPI>;

	public static fromPlugins(base: string, commander: CommanderStatic, plugins: string[]) {
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
	constructor() {
		this.registry = new Map();
	}
	public add(plugin: PluginAPI) {
		if (this.registry.has(plugin.id)) throw new Error("Plugin is already in the registry!");
		debug("Adding plugin ID %o", plugin.id);
		this.registry.set(plugin.id, plugin);
	}

	public hookWebpackChain(config: Config) {
		for (const plugin of this.registry.values()) {
			debug(`Applying ${chalk.greenBright("webpack-chain")} functions for %o`, plugin.id);
			plugin.getChains().forEach(chainer => chainer(config));
		}
		return config;
	}

	public invoke<A = void>(funcName: string, options: any = {}): (A | undefined)[] {
		return [...this.registry.values()].map(plugin => {
			const mod = require(plugin.importBase)[funcName];
			debug("Invoking %o from plugin %o " + chalk.grey(!!mod ? "exists" : "doesn't exist"), funcName, plugin.id);
			if (mod) {
				try {
					const result = mod(plugin, Object.assign({}, options));
					plugin.setStatus();
					return result;
				} catch (err) {
					plugin.setStatus(`Plugin ${chalk.magenta(plugin.id)} error: ${err}`, "error");
				}
			}
			return undefined;
		});
	}
}
