import ip from "ip";
import fs from "fs";
import path from "path";
import util from "util";
import DevServer from "webpack-dev-server";
import getPort from "get-port";
import webpack from "webpack";
import chalk from "chalk";
import configClient from "./config-client";
import { clearConsole, isDir } from "../../utils";
import PluginAPI from "../../api/plugin";
import configServer from "./config-server";
import { BuildArgv, WatchArgv } from "../../plugins/build";
import { WebpackEnvironmentWatch, WebpackEnvironmentBuild } from "./types";
import { WebpackEnvironment, WebpackTransformer } from "../../types";

export async function runWebpack(
	api: PluginAPI,
	env: WebpackEnvironment<WatchArgv | BuildArgv>,
	transformer: WebpackTransformer,
	watch = false
) {
	const isWatch = !!watch;
	const isProd = isWatch ? false : (env as WebpackEnvironment<BuildArgv>).production;
	const cwd = path.resolve(env.cwd || process.cwd());

	let src = path.resolve(env.cwd, "src");
	src = isDir(src) ? src : env.cwd;
	const source = (dir: string) => path.resolve(src, dir);

	const readFile = util.promisify(fs.readFile);
	const packageFilepath = path.resolve(env.cwd, "./package.json");

	let manifest: any;
	try {
		manifest = JSON.parse(fs.readFileSync(source("manifest.json")).toString());
	} catch (err) {}

	const extra = {
		isProd,
		isWatch,
		cwd,
		src,
		source,
		manifest,
		pkg: JSON.parse((await readFile(packageFilepath)).toString()),
		log: api.setStatus
	};
	if (watch) {
		return devBuild(api, Object.assign({}, env as WebpackEnvironment<WatchArgv>, extra), transformer);
	} else {
		return prodBuild(api, Object.assign({ rhl: false }, env as WebpackEnvironment<BuildArgv>, extra), transformer);
	}
}

async function devBuild(api: PluginAPI, env: WebpackEnvironmentWatch, transformer: WebpackTransformer) {
	const config = await configClient(env).then(transformer);
	const port = await getPort({ port: [env.port, 3000] });

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
				if (env.port !== port) {
					api.setStatus(
						`Port ${chalk.bold(env.port.toFixed())} is still in use, using ${chalk.bold(
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

async function prodBuild(api: PluginAPI, env: WebpackEnvironmentBuild, transformer: WebpackTransformer) {
	const config = await configClient(env)
		.then(transformer)
		.then(c => c.toConfig());
	if (env.prerender) {
		const ssrConfig = await Promise.resolve(env)
			.then(configServer)
			.then(transformer)
			.then(c => c.toConfig());
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
				reject(
					err ||
						new Error(
							"Build failed!\n" +
								allFields(stats, "errors")
									.map(stripLoaderPrefix)
									.join("\n")
						)
				);
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
