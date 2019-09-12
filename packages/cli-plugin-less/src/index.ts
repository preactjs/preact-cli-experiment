import { PluginAPI, CLIArguments } from "@preact/cli";

async function addLess(api: PluginAPI) {
	api.chainWebpack(chain =>
		chain.module
			.rule("less")
			.test(/\.less$/)
			.use("less")
			.loader("less-loader")
			.options({ sourceMaps: true })
			.end()
			.end()
			.end()
	);
}
