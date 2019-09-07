import path from "path";
import mkdirp from "mkdirp";

import PluginAPI from "../api/plugin";
import { getPackageManager } from "../api/PackageManager";
import { execAsync } from "../utils";

export function cli(api: PluginAPI, { packageManager, cwd }: Record<string, any>) {
	api.registerCommand("new <name> [dir]")
		.description("Creates a new Preact project")
		.action(async (name: string, dir?: string) => {
			if (!dir) dir = "./" + name;
			const fullDir = path.resolve(cwd, dir);
			mkdirp.sync(fullDir);

			const pkg = {
				name,
				version: "0.1.0",
				author: {},
				dependencies: {
					preact: "^10.0.0-rc1"
				},
				devDependencies: {
					"@preact/cli": "latest"
				}
			};
			const templateBase = path.join(__dirname, "../../assets/baseProject");
			const files = await api.applyTemplate(templateBase, {}, templateBase);
			files["package.json"] = JSON.stringify(pkg, null, 2);
			api.debug("Writing file tree: %O", files);
			await api.writeFileTree(files, fullDir);
			await execAsync(getPackageManager(packageManager).getInstallCommand());
		});
}
