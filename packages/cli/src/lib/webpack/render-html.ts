import fs, { existsSync } from "fs";
import os, { tmpdir, type } from "os";
import path, { extname } from "path";
import util from "util";
import Config from "webpack-chain";
import _debug from "debug";
import HtmlWebpackPlugin from "html-webpack-plugin";
import mkdirp from "mkdirp";
import createLoadManifest from "./create-load-manifest";
import prerender from "./prerender";
import { CommonWebpackEnv } from "./types";
import { templateVar, renderTemplate } from "../template";
import { isFile, normalizePath } from "../../utils";

const readFile = util.promisify(fs.readFile);
const mkdirP = util.promisify(mkdirp);
const writeFile = util.promisify(fs.writeFile);

const debug = _debug("@preact/cli:webpack");

export default async function renderHTML(config: Config, env: CommonWebpackEnv): Promise<Config> {
	const exists = util.promisify(fs.exists);
	const projectTemplate = env.source("template.html");
	let template = path.resolve(__dirname, "../../../assets/template.html");
	if (await exists(projectTemplate)) {
		template = projectTemplate;
	}

	template = env.template || template;

	let content = await read(template);
	if (templateVar("preact-head").test(content) || templateVar("preact-body").test(content)) {
		const head = await read("../../../assets/preact-head.html");
		const body = await read("../../../assets/preact-body.html");
		content = renderTemplate(content, { "preact-head": head, "preact-body": body });
	}

	// Saving to disk as the HTML plugin expects an actual file
	const tmpDir = os.tmpdir();
	await mkdirP(tmpDir);
	const tmpTemplateFile = path.join(tmpDir, "template.ejs");
	await writeFile(tmpTemplateFile, content);

	const htmlWebpackConfig = (values: HtmlWebpackPlugin.Options & { url: string }) => {
		const { url, title, ...routeData } = values;
		return Object.assign(values, {
			filename: path.resolve(env.dest, url.substring(1), "index.html"),
			template: `!!ejs-loader!${tmpTemplateFile}`,
			minify: env.isProd && {
				collapseWhitespace: true,
				removeScriptTypeAttributes: true,
				removeRedundantAttributes: true,
				removeStyleLinkTypeAttributes: true,
				removeComments: true
			},
			favicon: fs.existsSync(env.source("assets/favicon.ico")) ? "assets/favicon.ico" : "",
			inject: true,
			compile: true,
			inlineCss: env.inlineCss,
			preload: env.preload,
			manifest: env.manifest,
			title:
				title ||
				env.manifest.name ||
				env.manifest.short_name ||
				(env.pkg.name || "").replace(/^@[a-z]\//, "") ||
				"Preact App",
			excludeAssets: [/(bundle|polyfills)(\..*)?\.js$/],
			createLoadManifest: (assets: any, namedChunkGroups: any) => {
				if (assets["push-manifest.json"]) {
					return JSON.parse(assets["push-manifest.json"].source());
				}
				return createLoadManifest(assets, env.esm, namedChunkGroups);
			},
			config,
			url,
			ssr() {
				return env.prerender ? prerender(env, values) : "";
			},
			scriptLoading: "defer",
			CLI_DATA: { preRenderData: { url, ...routeData } }
		}) as HtmlWebpackPlugin.Options;
	};

	const extraUrls = [];
	const fullPrerenderPath = path.join(env.cwd, env.prerenderUrls);
	debug("prerender-urls path %o", fullPrerenderPath);
	if (await isFile(fullPrerenderPath)) {
		if (extname(env.prerenderUrls) === "json") {
			extraUrls.push(...JSON.parse(fullPrerenderPath));
		} else if (extname(env.prerenderUrls) == "js") {
			// eslint-disable-next-line @typescript-eslint/no-var-requires
			const res = require("esm")(fullPrerenderPath);
			if (typeof res === "function") {
				extraUrls.push(...(await Promise.resolve(res())));
			} else {
				extraUrls.push(...(await Promise.resolve(res)));
			}
		}
	}
	debug("extra urls %O", extraUrls);

	[{ url: "/" }, ...extraUrls]
		.map(htmlWebpackConfig)
		.forEach(c =>
			config.plugin(c.url === "/" ? "html-index" : "html-" + c.url.replace(/\//, "-")).use(HtmlWebpackPlugin, [c])
		);

	return config;
}

async function read(file: string): Promise<string> {
	return readFile(path.resolve(__dirname, file)).then(b => b.toString());
}
