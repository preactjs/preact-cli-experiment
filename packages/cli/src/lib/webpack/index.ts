import ip from "ip";
import fs from "fs";
import path from "path";
import util from "util";
import Config from "webpack-chain";
import DevServer from "webpack-dev-server";
import getPort from "get-port";
import webpack from "webpack";
import chalk from "chalk";
import configClient from "./config-client";
import { clearConsole, isDir } from "../../utils";
import PluginAPI from "../../api/plugin";
import configServer from "./config-server";
import { WebpackEnvironment, WebpackTransformer, WebpackEnvExtra } from "../../types";

export async function runWebpack(
	api: PluginAPI,
	env: WebpackEnvironment<{}>,
	transformer: WebpackTransformer,
	watch = false
) {
	const isProd = env.production;
	const isWatch = !!watch;
	const cwd = path.resolve(env.cwd || process.cwd());

	let src = path.resolve(env.cwd, "src");
	src = isDir(src) ? src : env.cwd;
	const source = (dir: string) => path.resolve(src, dir);

	const readFile = util.promisify(fs.readFile);
	const packageFilepath = path.resolve(src, "./package.json");

	return (watch ? devBuild : prodBuild)(
		api,
		Object.assign({}, env, {
			isProd,
			isWatch,
			cwd,
			src,
			source,
			pkg: JSON.parse((await readFile(packageFilepath)).toString())
		}) as WebpackEnvExtra,
		transformer
	);
}

async function devBuild(api: PluginAPI, env: WebpackEnvExtra, transformer: WebpackTransformer) {
	const config = await normalizeMaybePromise(transformer(configClient(env)));
	const userPort = parseInt(process.env.PORT || config.get("devServer").port, 10) || 8080;
	const port = await getPort({ port: userPort });

	const compiler = webpack(config.toConfig());

	return new Promise((resolve, reject) => {
		compiler.hooks.emit.tapAsync("CliDevPlugin", (compilation, callback) => {
			const missingDeps = compilation.missingDependencies;
			const nodeModulesPath = path.resolve(__dirname, "../../../node_modules");
			if (Array.from(missingDeps).some(file => file.indexOf(nodeModulesPath) !== -1)) {
				compilation.contextDependencies.add(nodeModulesPath);
			}

			callback();
		});
		compiler.hooks.done.tap("CliDevPlugin", stats => {
			const devServer = config.get("devServer");
			const protocol = process.env.HTTPS || devServer.https ? "https" : "http";
			const host = process.env.HOST || devServer.host || "localhost";

			const serverAddr = `${protocol}://${host}:${chalk.bold(port.toFixed())}`;
			const localIpAddr = `${protocol}://${ip.address()}:${chalk.bold(port.toFixed())}`;

			clearConsole(true);
			if (stats.hasErrors()) {
				api.setStatus("Build failed!", "error");
			} else {
				api.setStatus("Compiled successfully!", "success");
				if (userPort !== port) {
					api.setStatus(
						`Port ${chalk.bold(userPort.toFixed())} is still in use, using ${chalk.bold(
							port.toFixed()
						)} instead`,
						"info"
					);
				}
				api.setStatus(
					`You can view the application in browser.\n\n${chalk.bold(
						chalk.magenta("Local")
					)}:\t\t\t${serverAddr}\n${chalk.bold(chalk.magenta("On your network"))}:\t\t${localIpAddr}`,
					"info"
				);
				api.setStatus();
			}
			showStats(api, stats);
		});

		compiler.hooks.failed.tap("CliDevPlugin", reject);
		const c = Object.assign({}, config.get("devServer"), { stats: { colors: true } });
		const server = new DevServer(compiler, c);
		server.listen(port);
		resolve(server);
	});
}

async function prodBuild(api: PluginAPI, env: WebpackEnvExtra, transformer: WebpackTransformer) {
	const config = (await normalizeMaybePromise(transformer(configClient(env)))).toConfig();
	if (env.prerender) {
		const ssrConfig = (await normalizeMaybePromise(transformer(configServer(env)))).toConfig();
		const serverCompiler = webpack(ssrConfig);
		api.setStatus("Building server...");
		api.setStatus();
		await runCompiler(api, serverCompiler);
	}
	const clientCompiler = webpack(config);
	api.setStatus("Building client...");
	api.setStatus();
	const stats = await runCompiler(api, clientCompiler);

	// Timeout for plugins that work on `after-emit` event of webpack
	await new Promise(res => setTimeout(res, 20));

	return showStats(stats);
}

async function runCompiler(api: PluginAPI, compiler: webpack.Compiler): Promise<any> {
	return new Promise((resolve, reject) => {
		compiler.run((err, stats) => {
			showStats(api, stats);

			if (err || (stats && stats.hasErrors())) {
				reject(new Error("Build failed! " + err || ""));
			}

			resolve(stats);
		});
	});
}

function showStats(api: PluginAPI, stats?: webpack.Stats) {
	if (stats) {
		if (stats.hasErrors()) {
			allFields(stats, "errors")
				.map(stripLoaderPrefix)
				.forEach(e => api.setStatus(e, "error"));
		}
		if (stats.hasWarnings()) {
			allFields(stats, "warnings")
				.map(stripLoaderPrefix)
				.forEach(e => api.setStatus(e, "info"));
		}
	}
}

function allFields(stats: webpack.Stats, field: "errors" | "warnings", fields: string[] = [], name?: string) {
	const info = stats.toJson({
		errors: true,
		warnings: false,
		errorDetails: false
	});
	const addCompilerPrefix = (msg: string) => (name ? chalk.bold(chalk.magenta(name + ": ")) + msg : msg);
	if (field === "errors" && stats.hasErrors()) {
		fields = fields.concat(info.errors.map(addCompilerPrefix));
	}
	if (field === "warnings" && stats.hasWarnings()) {
		fields = fields.concat(info.warnings.map(addCompilerPrefix));
	}
	if (stats.compilation.children) {
		stats.compilation.children.forEach((child, index) => {
			const name = child.name || `Child Compiler ${index + 1}`;
			const stats = child.getStats();
			fields = allFields(stats, field, fields, name);
		});
	}
	return fields;
}

function normalizeMaybePromise<T>(val: PromiseLike<T> | T): PromiseLike<T> {
	if ("then" in val) return val;
	return Promise.resolve(val);
}

/** Removes all loaders from any resource identifiers found in a string */
function stripLoaderPrefix(input: string) {
	if (typeof input === "string") {
		input = input.replace(
			/(?:(\()|(^|\b|@))(\.\/~|\.{0,2}\/(?:[^\s]+\/)?node_modules)\/\w+-loader(\/[^?!]+)?(\?\?[\w_.-]+|\?({[\s\S]*?})?)?!/g,
			"$1"
		);
		input = input.replace(/(\.?\.?(?:\/[^/ ]+)+)\s+\(\1\)/g, "$1");
		input = replaceAll(input, process.cwd(), ".");
		return input;
	}
	return input;
}

// https://gist.github.com/developit/1a40a6fee65361d1182aaa22ab8c334c
function replaceAll(input: string, find: string, replace: string) {
	let s = "",
		index,
		next;
	while (~(next = input.indexOf(find, index))) {
		s += input.substring(index, next) + replace;
		index = next + find.length;
	}
	return s + input.substring(index);
}
