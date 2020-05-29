import path from "path";
import webpack from "webpack";
import fs from "fs";
import { isRegExp } from "util";

// TODO: Correctly set types for properties
interface LoaderWrapper {
	rule: webpack.RuleSetRule;
	ruleIndex: number;
	loader: webpack.RuleSetUseItem;
	loaderIndex: number;
}

interface RuleWrapper {
	rule: webpack.RuleSetRule;
	index: number;
}

interface PluginWrapper {
	plugin: webpack.Plugin;
	index: number;
}

interface TypedPluginWrapper<P extends webpack.Plugin> extends PluginWrapper {
	plugin: P;
}

/**
 * WebpackConfigHelpers
 *
 * @class WebpackConfigHelpers
 */
export default class WebpackConfigHelpers {
	_cwd: string;
	constructor(cwd: string) {
		this._cwd = cwd;
	}

	/**
	 * Webpack module used to create config.
	 *
	 * @readonly
	 * @memberof WebpackConfigHelpers
	 */
	get webpack(): typeof webpack {
		return webpack;
	}

	/**
	 * Returns wrapper around all rules from config.
	 *
	 * @param config - [webpack config](https://webpack.js.org/configuration/#options).
	 *
	 * @memberof WebpackConfigHelpers
	 */
	getRules(config: webpack.Configuration): RuleWrapper[] {
		return [...(config.module.rules || [])].map((rule, index) => ({
			index,
			rule,
		}));
	}

	/**
	 * Returns wrapper around all loaders from config.
	 *
	 * @param config - [webpack config](https://webpack.js.org/configuration/#options).
	 *
	 * @memberof WebpackConfigHelpers
	 */
	getLoaders(config: webpack.Configuration): LoaderWrapper[] {
		return this.getRules(config)
			.map(({ rule, index: ruleIndex }) =>
				mapLoader(rule.loaders)
					.concat(mapLoader(rule.loader))
					.map((l) => Object.assign(l, { rule, ruleIndex }))
			)
			.reduce((arr, a) => arr.concat(a), []);
	}

	/**
	 * Returns wrapper around all plugins from config.
	 *
	 * @param config - [webpack config](https://webpack.js.org/configuration/#options).
	 *
	 * @memberof WebpackConfigHelpers
	 */
	getPlugins(config: webpack.Configuration): PluginWrapper[] {
		return (config.plugins || []).map((plugin, index) => ({ index, plugin }));
	}

	/**
	 *
	 *
	 * @param config - [webpack config](https://webpack.js.org/configuration/#options).
	 * @param file - path to test against loader. Resolved relatively to $PWD.
	 *
	 * @memberof WebpackConfigHelpers
	 */
	getRulesByMatchingFile(config: webpack.Configuration, file: string): RuleWrapper[] {
		const filePath = path.resolve(this._cwd, file);
		return this.getRules(config).filter((w) => conditionMatchesFile(w.rule.test, filePath));
	}

	/**
	 * Returns loaders that match provided name.
	 *
	 * @example
	 * helpers.getLoadersByName(config, 'less-loader')
	 * @param config - [webpack config](https://webpack.js.org/configuration/#options).
	 * @param name - name of loader.
	 * @returns {LoaderWrapper[]}
	 *
	 * @memberof WebpackConfigHelpers
	 */
	getLoadersByName(config: webpack.Configuration, name: string): webpack.Loader[] {
		return this.getLoaders(config)
			.map(({ rule, ruleIndex, loader }) =>
				Array.isArray(loader)
					? loader.map((loader, loaderIndex) => ({
							rule,
							ruleIndex,
							loader,
							loaderIndex,
					  }))
					: [{ rule, ruleIndex, loader: loader, loaderIndex: -1 }]
			)
			.reduce((arr, loader) => arr.concat(loader), [])
			.filter(({ loader }) => loader === name || (loader && loader.loader === name));
	}

	/**
	 * Returns plugins that match provided name.
	 *
	 * @example
	 * helpers.getPluginsByName(config, 'HtmlWebpackPlugin')
	 * @param config - [webpack config](https://webpack.js.org/configuration/#options).
	 * @param name - name of loader.
	 * @returns {PluginWrapper[]}
	 *
	 * @memberof WebpackConfigHelpers
	 */
	getPluginsByName(config: webpack.Configuration, name: string): PluginWrapper[] {
		return this.getPlugins(config).filter(
			(w) => w.plugin && w.plugin.constructor && w.plugin.constructor.name === name
		);
	}

	/**
	 * Returns plugins that match provided type.
	 *
	 * @example
	 * helpers.getPluginsByType(config, webpack.optimize.CommonsChunkPlugin)
	 * @param config - [webpack config](https://webpack.js.org/configuration/#options).
	 * @param type - type of plugin.
	 * @returns {PluginWrapper[]}
	 *
	 * @memberof WebpackConfigHelpers
	 */
	getPluginsByType<P extends webpack.Plugin, T extends new (...args: any) => P>(
		config: webpack.Configuration,
		type: T
	): Array<TypedPluginWrapper<P>> {
		return this.getPlugins(config).filter(({ plugin }) => plugin instanceof type) as Array<TypedPluginWrapper<P>>;
	}

	/**
	 * Sets template used by HtmlWebpackPlugin.
	 *
	 * @param config - [webpack config](https://webpack.js.org/configuration/#options).
	 * @param template - template path. See [HtmlWebpackPlugin docs](https://github.com/jantimon/html-webpack-plugin/blob/master/docs/template-option.md).
	 *
	 * @memberof WebpackConfigHelpers
	 */
	setHtmlTemplate(config: webpack.Configuration, template: string): void {
		let isPath = false;
		try {
			fs.statSync(template);
			isPath = true;
		} catch (e) {}

		const templatePath = isPath ? `!!ejs-loader!${path.resolve(this._cwd, template)}` : template;
		const { plugin: htmlWebpackPlugin } = this.getPluginsByName(config, "HtmlWebpackPlugin")[0];
		(htmlWebpackPlugin as any).options.template = templatePath;
	}
}

type LoaderWraperLoaderPart = Pick<LoaderWrapper, "loader" | "loaderIndex">;

function mapLoader(loader: webpack.RuleSetUse | undefined): Array<LoaderWraperLoaderPart> {
	if (!loader) return [];
	const loaders: LoaderWraperLoaderPart[] = [];
	if (typeof loader === "function") {
		const data = {}; // TODO: figure out what to put there
		loaders.push(...mapLoader(loader(data)));
	} else if (isRuleSetItem(loader)) {
		loaders.push({ loader, loaderIndex: -1 });
	} else if (Array.isArray(loader)) {
		loaders.push(...loader.map((loader, loaderIndex) => ({ loader, loaderIndex })));
	}
	return loaders;
}

function conditionMatchesFile(condition: webpack.RuleSetCondition | undefined, file: string): boolean {
	if (!condition) return false;
	if (isRegExp(condition)) {
		return condition.test(file);
	} else if (typeof condition === "string") {
		return file.startsWith(condition);
	} else if (typeof condition === "function") {
		return Boolean(condition(file));
	} else if (Array.isArray(condition)) {
		return condition.some((c) => conditionMatchesFile(c, file));
	}
	return Object.entries(condition)
		.map(([key, value]) => {
			switch (key) {
				case "test":
					return conditionMatchesFile(value, file);
				case "include":
					return conditionMatchesFile(value, file);
				case "exclude":
					return !conditionMatchesFile(value, file);
				case "and":
					return (value as webpack.RuleSetCondition[]).every((c) => conditionMatchesFile(c, file));
				case "or":
					return (value as webpack.RuleSetCondition[]).some((c) => conditionMatchesFile(c, file));
				case "not":
					return (value as webpack.RuleSetCondition[]).every((c) => !conditionMatchesFile(c, file));
				default:
					return true;
			}
		})
		.every((b) => b);
}

function isRuleSetItem(loader: webpack.RuleSetUse): loader is webpack.RuleSetUseItem {
	return (
		typeof loader === "string" ||
		typeof loader === "function" ||
		Object.keys(loader).some((k) => ["loader", "options", "indent", "query"].includes(k))
	);
}
