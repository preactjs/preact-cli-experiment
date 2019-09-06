export interface PackageManager {
	name: string;
	getInstallCommand(): string;
	getAddCommand(...packages: string[]): string;
	getRemoveCommand(...packages: string[]): string;
	getRunCommand(script: string): string;
}

class NPM implements PackageManager {
	name = "npm";

	getInstallCommand(): string {
		return "npm i";
	}
	getAddCommand(...packages: string[]): string {
		return `npm i --save ${packages.join(" ")}`;
	}
	getRemoveCommand(...packages: string[]): string {
		return `npm r --save ${packages.join(" ")}`;
	}
	getRunCommand(script: string): string {
		return `npm run ${script}`;
	}
}

class Yarn implements PackageManager {
	name = "yarn";

	getInstallCommand(): string {
		return "yarn";
	}
	getAddCommand(...packages: string[]): string {
		return `yarn add ${packages.join(" ")}`;
	}
	getRemoveCommand(...packages: string[]): string {
		return `yarn remove ${packages.join(" ")}`;
	}
	getRunCommand(script: string): string {
		return `yarn ${script}`;
	}
}

export function getPackageManager(name: string) {
	switch (name) {
		case "yarn":
			return new Yarn();
		case "npm":
		default:
			return new NPM();
	}
}
