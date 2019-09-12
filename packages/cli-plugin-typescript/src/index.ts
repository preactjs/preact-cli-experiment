import path from "path";
import ForkTSChecker from "fork-ts-checker-webpack-plugin";
import { PluginAPI, CLIArguments } from "@preact/cli";

export const build = addTypeScript;
export const watch = addTypeScript;

function addTypeScript(api: PluginAPI, { cwd }: CLIArguments) {
	const tsconfig = path.resolve(cwd, "tsconfig.json");
	api.chainWebpack(chain => {
		chain.module
			.rule("external-styles")
			.use("css")
			.merge({
				loader: require.resolve("typings-for-css-modules-loader"),
				options: {
					camelCase: true,
					banner: "// This file is automatically generated from your CSS. Any edits will be overwritten.",
					namedExport: true,
					silent: true
				}
			});

		return chain.module
			.rule("typescript")
			.test(/\.tsx?$/)
			.use("ts")
			.loader(require.resolve("ts-loader"))
			.options({ transpileOnly: true, configFile: tsconfig })
			.end()
			.end()
			.end()
			.plugin("ts-checker")
			.use(ForkTSChecker, [{ tsconfig }])
			.end()
			.resolve.extensions.merge([".ts", ".tsx"])
			.end()
			.end();
	});
}
