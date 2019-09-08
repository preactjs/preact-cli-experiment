import path from "path";
import Config from "webpack-chain";
import { filter } from "minimatch";
import { normalizePath } from "../../utils";
import configBase from "./config-base";

export default function configClient(env: {
	cwd?: string;
	isProd: boolean;
	isWatch?: boolean;
	src: string;
	source: ((s: string) => string) | ((src: string) => string);
	dest: string;
	manifest?: any;
	pkg?: any;
}) {
	return clientConfiguration(configBase(env), env);
}

function clientConfiguration(
	config: Config,
	env: { isProd: boolean; dest: string; src: string; source: (s: string) => string }
) {
	config
		.entry("bundle")
		.add(path.resolve(__dirname, "../../../assets/entry"))
		.end()
		.entry("polyfills")
		.add(path.resolve(__dirname, "./polyfills"))
		.end();
	if (env.isProd) {
		config
			.entry("bundle")
			.add("webpack-dev-server/client")
			.add("webpack/hot/dev-server")
			.end();
	}
	config.output
		.path(env.dest)
		.publicPath("/")
		.filename(env.isProd ? "[name].[chunkhash:5].js" : "[name].js")
		.chunkFilename("[name].chunk.[chunkhash:5].js")
		.end();
	config.resolveLoader.alias
		.set("async", require.resolve("@preact/async-loader"))
		.end()
		.end();
	config.module
		.rule("components")
		.test(/\.[jt]sx?$/)
		.include.add(filter(env.source("routes") + "/{*,*/index}.{js,jsx,ts,tsx}") as any)
		.add(filter(env.source("components") + "/{routes,async}/{*,*/index}.js,jsx,ts,tsx}") as any)
		.end()
		.use(require.resolve("@preact/async-loader"))
		.options({
			name(filename: string) {
				const relative = normalizePath(filename).replace(normalizePath(env.src), "");
				if (!relative.includes("/routes/")) return false;
				return "route-" + cleanFilename(relative);
			},
			formatName(filename: string) {
				const relative = normalizePath(filename).replace(normalizePath(env.source(".")), "");
				return cleanFilename(relative);
			}
		})
		.end();
	return config;
}

function cleanFilename(name: string) {
	return name.replace(/(^\/(routes|components\/(routes|async))\/|(\/index)?\.js$)/g, "");
}
