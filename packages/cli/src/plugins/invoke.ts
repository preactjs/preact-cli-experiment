import fs from "fs";
import path from "path";
import { all as deepmerge } from "deepmerge";
import { CLIArguments, CommandArguments } from "../types";
import PluginAPI from "../api/plugin";
import { promisify } from "util";

type Argv = CommandArguments<{
	hook: string;
}>;

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

export function cli(api: PluginAPI, opts: CLIArguments) {
	api.registerCommand("invoke [plugin]")
		.description("Invokes plugin(s) to finish installation")
		.option("--hook [hook]", "Change hook to use (WARNING: internal)", "install")
		.action(async (plugin: string | undefined, argv: Argv) => {
			const registry = await api.getRegistry();
			if (plugin != undefined) {
				const dependencies = await registry
					.plugin(plugin)
					.invoke<{ dependencies?: Record<string, any>; devDependencies?: object }>(argv.hook, opts);
				if (argv.hook === "install") {
					api.setStatus("Installing plugin's additional dependencies...");
					await updatePackageJson(dependencies, opts.cwd);
					opts.pm.runInstall();
				}
			} else {
				const dependencies = await registry.invoke<{
					dependencies?: Record<string, any>;
					devDependencies?: object;
				}>(argv.hook, opts);
				if (argv.hook === "install") {
					api.setStatus("Installing plugin's additional dependencies...");
					await updatePackageJson(deepmerge(dependencies.filter(Boolean)), opts.cwd);
					opts.pm.runInstall();
				}
			}
			api.setStatus();
			api.setStatus("Done", "success");
		});
}

async function updatePackageJson(data: object, dir: string) {
	const pkgPath = path.resolve(dir, "package.json");
	const pkg = await readFile(pkgPath).then(b => JSON.parse(b.toString()));
	await writeFile(pkgPath, JSON.stringify(deepmerge([pkg, data]), null, "\t"));
}
