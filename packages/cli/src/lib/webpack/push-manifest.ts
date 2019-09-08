import webpack from "webpack";
import createLoadManifest from "./create-load-manifest";
import { WebpackEnvironmentBuild } from "./types";

export default class PushManifestPlugin implements webpack.Plugin {
	isESMBuild_: boolean;
	constructor(env: Partial<WebpackEnvironmentBuild> = {}) {
		this.isESMBuild_ = Boolean(env.esm);
	}
	apply(compiler: webpack.Compiler) {
		compiler.hooks.emit.tap("PushManifestPlugin", compilation => {
			const manifest = createLoadManifest(compilation.assets, this.isESMBuild_, compilation.namedChunkGroups);

			const output = JSON.stringify(manifest);
			compilation.assets["push-manifest.json"] = {
				source() {
					return output;
				},
				size() {
					return output.length;
				}
			};

			return compilation;
		});
	}
}
