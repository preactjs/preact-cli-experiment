import { PluginAPI, CLIArguments } from "@preact/cli";

async function addStylus(api: PluginAPI) {
	api.chainWebpack(chain =>
		chain.module
			.rule("stylus")
			.test(/\.styl$/)
			.use("stylus")
			.loader(require.resolve("stylus-loader"))
			.options({ sourceMaps: true })
	);
}
