import fs from "fs";
import path from "path";
import webpack from "webpack";
import SizePlugin from "size-plugin";
import autoprefixer from "autoprefixer";
import browserslist from "browserslist";
import requireRelative from "require-relative";
import MiniCssExtractPlugin from "mini-css-extract-plugin";
import FixStyleOnlyEntriesPlugin from "webpack-fix-style-only-entries";
import ProgressBarPlugin from "progress-bar-webpack-plugin";
import ReplacePlugin from "webpack-plugin-replace";
import loadPostcssConfig from "postcss-load-config";
import Config from "webpack-chain";

import createBabelConfig from "../babel/config";

function readJson(file) {
	try {
		return JSON.parse(fs.readFileSync(file).toString());
	} catch (e) {}
}

// attempt to resolve a dependency, giving $CWD/node_modules priority:
// function resolveDep(dep, cwd) {
// 	try {
// 		return requireRelative.resolve(dep, cwd || process.cwd());
// 	} catch (e) {}
// 	try {
// 		return require.resolve(dep);
// 	} catch (e) {}
// 	return dep;
// }

function findAllNodeModules(startDir) {
	let dir = path.resolve(startDir);
	const dirs = [];
	const { root } = path.parse(startDir);

	// eslint-disable-next-line no-constant-condition
	while (true) {
		const joined = path.join(dir, "node_modules");
		if (fs.existsSync(joined)) {
			dirs.push(joined);
		}
		if (dir === root) {
			return dirs;
		}
		dir = path.dirname(dir);
	}
}

export default function configBase(env) {
	const { cwd, isProd, isWatch, src, source } = env;
	const config = new Config();

	// Apply base-level `env` values
	env.dest = path.resolve(cwd, env.dest || "build");
	env.manifest = readJson(source("manifest.json")) || {};
	env.pkg = readJson(path.resolve(cwd, "package.json")) || {};

	const babelrc = readJson(path.resolve(cwd, "old")) || {};

	// use browserslist config environment, config default, or default browsers
	// default browsers are > 0.25% global market share or Internet Explorer >= 9
	const browserslistDefaults = ["> 0.25%", "IE >= 9"];
	const browserlistConfig = Object(browserslist.findConfig(cwd));
	const browsers =
		(isProd ? browserlistConfig.production : browserlistConfig.development) ||
		browserlistConfig.default ||
		browserslistDefaults;

	const userNodeModules = findAllNodeModules(cwd);
	const cliNodeModules = findAllNodeModules(__dirname);
	const nodeModules = [...new Set([...userNodeModules, ...cliNodeModules])];

	let compat = "preact-compat";
	try {
		requireRelative.resolve("preact/compat", cwd);
		compat = "preact/compat";
	} catch (e) {}

	const babelConfig = Object.assign(
		{ babelrc: false },
		createBabelConfig(env, { browsers }),
		babelrc // intentionally overwrite our settings
	);

	let postcssPlugins;

	try {
		postcssPlugins = loadPostcssConfig.sync(cwd).plugins;
	} catch (error) {
		postcssPlugins = [autoprefixer({ overrideBrowserslist: browsers })];
	}

	config.context(src);
	[...nodeModules, "node_modules"].forEach(m => config.resolve.modules.add(m));
	config.resolve.extensions
		.merge([
			".mjs",
			".js",
			".jsx",
			".ts",
			".tsx",
			".json",
			".less",
			".pcss",
			".scss",
			".sass",
			".styl",
			".css",
			".wasm"
		])
		.end()
		.alias.merge({
			style: source("style"),
			"preact-cli-entrypoint": source("index"),
			// preact-compat aliases for supporting React dependencies:
			react: compat,
			"react-dom": compat,
			"react-addons-css-transition-group": "preact-css-transition-group",
			"preact-cli/async-component": require.resolve("@preact/async-loader/async")
		})
		.end();
	config.resolveLoader.modules
		.merge(nodeModules)
		.end()
		.alias.set("proxy-loader", require.resolve("./proxy-loader"))
		.end()
		.end();
	config.module
		.rule("es2015")
		.enforce("pre")
		.test(/\.m?[tj]sx?$/)
		.type("javascript/auto")
		.merge({ resolve: [{ mainFields: ["module", "jsnext:main", "browser", "main"] }] })
		.use("babel")
		.loader("babel-loader")
		.options(babelConfig);
	config.module
		.rule("less")
		.enforce("pre")
		.test(/\.less$/)
		.use("proxy")
		.loader("proxy-loader")
		.options({ cwd, loader: "less-loader", options: { sourceMap: true, paths: [...nodeModules] } });
	config.module
		.rule("sass")
		.enforce("pre")
		.test(/\.s[ac]ss$/)
		.use("proxy")
		.loader("proxy-loader")
		.options({ cwd, loader: "sass-loader", options: { sourceMap: true, includePaths: [...nodeModules] } });
	config.module
		.rule("stylus")
		.enforce("pre")
		.test(/\.styl$/)
		.use("proxy")
		.loader("proxy-loader")
		.options({ cwd, loader: "stylus-loader", options: { sourceMap: true, paths: [nodeModules] } });
	const userCssRule = config.module
		.rule("user-styles")
		.test(/\.(p?css|less|s[ac]ss|styl)$/)
		.include.merge([source("components"), source("routes")])
		.end();
	if (isWatch)
		userCssRule
			.use("style")
			.loader("style-loader")
			.options({ sourceMap: true });
	else userCssRule.use("css-extract").merge(MiniCssExtractPlugin.loader);
	userCssRule
		.use("css")
		.loader("css-loader")
		.options({
			modules: {
				localIdentName: "[local]__[hash:base64:5]"
			},
			importLoaders: 1,
			sourceMap: true
		});
	userCssRule
		.use("postcss")
		.loader("postcss-loader")
		.options({
			ident: "postcss",
			sourceMap: true,
			plugins: postcssPlugins
		});
	const externalCssRule = config.module
		.rule("external-styles")
		.test(/\.(p?css|less|s[ac]ss|styl)$/)
		.exclude.merge([source("components"), source("routes")])
		.end();
	if (isWatch)
		externalCssRule
			.use("style")
			.loader("style-loader")
			.options({ sourceMap: true });
	else externalCssRule.use("css-extract").merge(MiniCssExtractPlugin.loader);
	externalCssRule
		.use("css")
		.loader("css-loader")
		.options({ sourceMap: true });
	externalCssRule
		.use("postcss")
		.loader("postcss-loader")
		.options({
			ident: "postcss",
			sourceMap: true,
			plugins: postcssPlugins
		});
	const localFilesRule = config.module
		.rule("raw")
		.test(/\.(xml|html|txt|md)$/)
		.use("raw")
		.loader("raw-loader")
		.end()
		.end()
		.rule("files")
		.test(/\.(svg|woff2?|ttf|eot|jpe?g|png|webp|gif|mp4|mov|ogg|webm)(\?.*)?$/i);
	if (isProd) localFilesRule.use("file").loader("file-loader");
	else localFilesRule.use("url").loader("url-loader");

	config
		.plugin("error")
		.use(webpack.NoEmitOnErrorsPlugin)
		.end()
		.plugin("define")
		.use(webpack.DefinePlugin, [{ "process.env.NODE_ENV": JSON.stringify(isProd ? "production" : "development") }])
		.end()
		.plugin("provide")
		.use(webpack.ProvidePlugin, [{ h: ["preact", "h"], Fragment: ["preact", "Fragment"] }])
		.end()
		.plugin("fix-styles")
		.use(FixStyleOnlyEntriesPlugin)
		.end()
		.plugin("extract-css")
		.use(MiniCssExtractPlugin, [
			{
				filename: isProd ? "[name].[contenthash:5].css" : "[name].css",
				chunkFilename: isProd ? "[name].chunk.[contenthash:5].css" : "[name].chunk.css"
			}
		])
		.end()
		.plugin("progressbar")
		.use(ProgressBarPlugin, [
			{
				format:
					"\u001b[97m\u001b[44m Build \u001b[49m\u001b[39m [:bar] \u001b[32m\u001b[1m:percent\u001b[22m\u001b[39m (:elapseds) \u001b[2m:msg\u001b[22m",
				renderThrottle: 100,
				summary: false,
				clear: true
			}
		])
		.end()
		.plugin("size")
		.use(SizePlugin);
	if (isProd)
		config
			.plugin("hashed-ids")
			.use(webpack.HashedModuleIdsPlugin)
			.end()
			.plugin("loader-options")
			.use(webpack.LoaderOptionsPlugin)
			.end()
			.plugin("module-concatenation")
			.use(webpack.optimize.ModuleConcatenationPlugin)
			.end()
			.plugin("replace")
			.use(ReplacePlugin, [
				{
					include: /babel-helper$/,
					patterns: [
						{
							regex: /throw\s+(new\s+)?(Type|Reference)?Error\s*\(/g,
							value: s => `return;${Array(s.length - 7).join(" ")}(`
						}
					]
				}
			]);

	config.optimization
		.splitChunks({ minChunks: 3 })
		.end()
		.mode(isProd ? "production" : "development")
		.devtool(isWatch ? "cheap-module-eval-source-map" : "source-map")
		.node.merge({
			console: false,
			process: false,
			Buffer: false,
			__filename: false,
			__dirname: false,
			setImmediate: false
		});

	return config;
}

module.exports.readJson = readJson;
