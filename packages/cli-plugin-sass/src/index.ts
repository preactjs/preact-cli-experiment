import { PluginAPI } from "@preact/cli";

export const build = addSass;
export const watch = addSass;

async function addSass(api: PluginAPI) {
	api.chainWebpack(chain =>
		chain.module
			.rule("sass")
			.enforce("pre")
			.test(/\.s[ac]ss$/)
			.use("sass")
			.loader(require.resolve("sass-loader"))
			.options({
				sourceMap: true
			})
	);
}
