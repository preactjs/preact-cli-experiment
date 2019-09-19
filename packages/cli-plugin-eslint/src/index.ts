import { PluginAPI } from "@preact/cli";

export const build = (api: PluginAPI) => addEsLint(api, false);
export const watch = (api: PluginAPI) => addEsLint(api, true);

function addEsLint(api: PluginAPI, watch = false) {
	api.chainWebpack(chain =>
		chain.module
			.rule("eslint")
			.enforce("pre")
			.test(/\.[tj]sx?$/)
			.exclude.add(/node_modules/)
			.end()
			.use("eslint")
			.loader(require.resolve("eslint-loader"))
			.options({ fix: true, failOnError: !watch })
	);
}
