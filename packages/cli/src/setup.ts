import { PackageManager } from "./api/PackageManager";

export function addScripts(cwd: string, pm: PackageManager) {
	return {
		build: "preact build",
		serve: "preact build && preact serve",
		start: `if-env NODE_ENV=production && ${pm.getRunCommand("serve", "-s")} || ${pm.getRunCommand("watch", "-s")}`,
		watch: "preact watch"
	};
}
