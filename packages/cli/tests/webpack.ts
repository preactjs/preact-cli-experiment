import test, { ExecutionContext } from "ava";
import { WebpackEnvironmentBuild } from "../src/lib/webpack/types";
import { join, resolve } from "path";
import commander from "commander";
import { getPackageManager } from "../src/api/PackageManager";
import PluginAPI from "../src/api/plugin";
import { resolveWebpack } from "../src/lib/webpack";
import { readFileSync } from "fs";

const projectDir = join(__dirname, "subjects/default");
const defaultEnv: (t: ExecutionContext) => WebpackEnvironmentBuild = t => ({
	analyze: false,
	brotli: false,
	clean: true,
	cwd: projectDir,
	debug: false,
	dest: "build",
	esm: true,
	inlineCss: true,
	isProd: true, isWatch: false,
	log: msg => t.log(msg),
	parent: commander,
	pkg: JSON.parse(readFileSync(join(projectDir, "package.json")).toString()),
	pm: getPackageManager("npm"),
	preload: false,
	prerender: false,
	prerenderUrl: "prerender-urls.json",
	production: true,
	source: s => resolve(projectDir, "./src/", s),
	src: join(__dirname, "test-build/src"),
	sw: true, version: "unit-test"
});
const api = new PluginAPI(projectDir, "cli-test-stub", "", commander);

test("Builds server webpack configuration", async t => {
	const config = await resolveWebpack(api, defaultEnv(t), _ => _, true);
	t.snapshot(config);
});

test("Builds client webpack configuration", async t => {
	const config = await resolveWebpack(api, defaultEnv(t), _ => _, false);
	t.snapshot(config);
})
