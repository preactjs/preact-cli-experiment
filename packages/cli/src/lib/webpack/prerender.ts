/* eslint-disable @typescript-eslint/no-var-requires */
import fs from "fs";
import path from "path";
import URL from "url";
import stackTrace from "stack-trace";
import { SourceMapConsumer } from "source-map";
import util from "util";

import { CommonWebpackEnv } from "./types";
import chalk from "chalk";

const readFile = util.promisify(fs.readFile);

export default function prerender(env: CommonWebpackEnv, params: { url?: string } = {}) {
	const entry = path.resolve(env.dest, "./ssr-build/ssr-bundle.js");
	const url = params.url || "/";

	const history = {};
	const location = {
		...URL.parse(url)
	};

	try {
		const m = require(entry);
		const app = (m && m.default) || m;
		if (typeof app !== "function") {
			env.log("Entry does not export a Component function/class, aborting prerendering", "error");
			return "";
		}
		const preact = require(require.resolve(`${env.cwd}/node_modules/preact`));
		const renderToString = require(require.resolve(`${env.cwd}/node_modules/preact-render-to-string`));
		return renderToString(preact.h(app, { ...params, url }));
	} catch (err) {
		const stack = stackTrace.parse(err).find(s => s.getFileName() === entry);
		if (!stack) throw err;
		handlePrerenderError(err, env, stack, entry);
	}
}

async function handlePrerenderError(err: Error, env: CommonWebpackEnv, stack: stackTrace.StackFrame, entry: string) {
	const errorMessage = err.toString();
	const isReferenceError = errorMessage.startsWith("ReferenceError");
	const methodName = stack.getMethodName();
	let sourceMapContent: any,
		position: { source: string; line: number; column: any },
		sourcePath: any,
		sourceLines: any[],
		sourceCodeHighlight: string | Uint8Array;

	try {
		sourceMapContent = JSON.parse(await readFile(`${entry}.map`).then(b => b.toString()));
	} catch (err) {
		env.log(`Unable to read sourcemap: ${entry}.map\n`, "error");
	}

	if (sourceMapContent) {
		await SourceMapConsumer.with(sourceMapContent, null, consumer => {
			position = consumer.originalPositionFor({
				line: stack.getLineNumber(),
				column: stack.getColumnNumber()
			});
		});

		position.source = position.source
			.replace("webpack://", ".")
			.replace(/^.*~\/((?:@[^/]+\/)?[^/]+)/, (s, name) =>
				require.resolve(name).replace(/^(.*?\/node_modules\/(@[^/]+\/)?[^/]+)(\/.*)$/, "$1")
			);

		sourcePath = path.resolve(env.src, position.source);
		sourceLines;
		try {
			sourceLines = await readFile(sourcePath, "utf-8").then(s => s.toString().split("\n"));
		} catch (err) {
			try {
				sourceLines = await readFile(require.resolve(position.source), "utf-8").then(s =>
					s.toString().split("\n")
				);
			} catch (err) {
				env.log(`Unable to read file: ${sourcePath}\n`, "error");
			}
			// process.stderr.write(red(`Unable to read file: ${sourcePath}\n`));
		}
		sourceCodeHighlight = "";

		if (sourceLines) {
			for (let i = -4; i <= 4; i++) {
				const color = i === 0 ? chalk.red : chalk.yellow;
				const line = position.line + i;
				const sourceLine = sourceLines[line - 1];
				sourceCodeHighlight += sourceLine ? `${color(sourceLine)}\n` : "";
			}
		}
	}

	env.log("\n");
	env.log(`${errorMessage}`, "error");
	env.log(`method: ${methodName}`);
	if (sourceMapContent) {
		env.log(`at: ${sourcePath}:${position.line}:${position.column}\n`);
		env.log("\n");
		env.log("Source code:");
		env.log(normalizeString(sourceCodeHighlight));
		env.log("\n");
	} else {
		env.log(stack.toString() + "\n");
	}
	env.log(`This ${isReferenceError ? "is most likely" : "could be"} caused by using DOM or Web APIs.`);
	env.log(`Pre-render runs in node and has no access to globals available in browsers.`);
	env.log(`Consider wrapping code producing error in: 'if (typeof window !== "undefined") { ... }'`);

	if (methodName === "componentWillMount") {
		env.log(`or place logic in 'componentDidMount' method.`);
	}
	env.log("\n");
	env.log(`Alternatively use 'preact build --no-prerender' to disable prerendering.`);
	env.log("See https://github.com/developit/preact-cli#pre-rendering for further information.");
	env.log();
	process.exit(1);
}

function normalizeString(str: string | Buffer | Uint8Array) {
	if (typeof str === "string") return str;
	if (str instanceof Buffer) return str.toString();
	return str.toString();
}
