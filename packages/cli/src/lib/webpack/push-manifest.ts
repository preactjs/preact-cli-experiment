import webpack from "webpack";
import createLoadManifest from "./create-load-manifest";

export default class PushManifestPlugin extends webpack.Plugin {
	isESMBuild_: any;
	constructor(env: any = {}) {
		super();
		this.isESMBuild_ = env.esm;
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
