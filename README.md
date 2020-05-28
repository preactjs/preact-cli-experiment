# ⚛️ Preact CLI (Experiment)

[![Build Status](https://travis-ci.org/preactjs/preact-cli-experiment.svg?branch=master)](https://travis-ci.org/preactjs/preact-cli-experiment)

New CLI for Preact featuring a plugin-based system.

<!-- prettier-ignore-start -->

- [⚛️ Preact CLI (Experiment)](#%e2%9a%9b%ef%b8%8f-preact-cli-experiment)
	- [Install for development](#install-for-development)
- [Run](#run)
	- [Run for development](#run-for-development)
- [Reference guide](#reference-guide)
	- [The Plugin API](#the-plugin-api)
		- [List of available hooks](#list-of-available-hooks)
			- [`install`](#install)
			- [`cli`](#cli)
			- [`build` / `watch`](#build--watch)
		- [`PluginAPI` instance](#pluginapi-instance)
			- [`setStatus(text?: string, type?: "info" | "error" | "fatal" | "success")`](#setstatustext-string-type-%22info%22--%22error%22--%22fatal%22--%22success%22)
			- [`async getRegistry(): Promise<PluginRegistry>`](#async-getregistry-promisepluginregistry)
			- [`registerCommand(name: string, options?: CommandOptions): Command`](#registercommandname-string-options-commandoptions-command)
			- [`chainWebpack(chainer: WebpackChainer)`](#chainwebpackchainer-webpackchainer)
			- [`async applyTemplate(fileOrFolder: string, context: Record<string, string>, base?: string): Promise<Record<string, string>>`](#async-applytemplatefileorfolder-string-context-recordstring-string-base-string-promiserecordstring-string)
			- [`async writeFileTree(files: Record<string, string>, base?: string)`](#async-writefiletreefiles-recordstring-string-base-string)
			- [`getChains(): WebpackChainer[]`](#getchains-webpackchainer)
		- [The Plugin Registry](#the-plugin-registry)
			- [`plugin(name:string|PluginAPI): RegistryPluginActionWrapper`](#pluginnamestringpluginapi-registrypluginactionwrapper)
			- [`hookWebpackChain(config: import("webpack-chain")): void`](#hookwebpackchainconfig-import%22webpack-chain%22-void)
			- [`async invoke<T>(funcName: string, options?:any): Promise<(T|undefined)[]>`](#async-invoketfuncname-string-optionsany-promisetundefined)

<!-- prettier-ignore-end -->

 # Install

```bash
npm install -g @preact/cli
```

**WARNING**: This will shadow the existing `preact-cli` endpoint. Uninstall this package to get the stable version back.

## Install for development

This project is a monorepo and uses `yarn` and `lerna` to manage internal and external dependencies.

# Run

```bash
Usage: preact [options] [command]

Options:
  -V, --version                              output the version number
  --cwd <cwd>                                Sets working directory (default is current)
  --pm <npm|yarn>                            Sets package manager (default NPM)
  -d, --debug                                Activate debug options
  -h, --help                                 output usage information

Commands:
  add <plugin>                               Add a Preact CLI plugin to the project
  build [options] [src]                      Build the current project into static files
  watch [options] [src]                      Launch a dev server with hot-reload
  create [options] [template] [name] [dest]  Legacy command to create a project from either the official template,
                                             or a user-defined one
  info                                       Outputs information about your system. Used to troubleshoot issues.
  invoke [options] [plugin]                  Invokes plugin(s) to finish installation
  new [options] [name] [dir]                 Creates a new Preact projec
```

## Run for development

You can run a development version (without transpiling) of the CLI by going to `packages/cli` and running `yarn dev` .

**Note**: As it is in its early stages, running the CLI this way only works in Unix-style environments. Windows users, use MSYS or WSL.

# Reference guide

The CLI resolves any installed plugins at startup, and hooks into exported functions for them to tap into the CLI. With plugins, you can **create new commands**, **mutate the webpack configuration** (uses `webpack-chain` ), and even create new functionality by invoking other plugins' exported functions.

You can take a look at how the [`new`](packages/cli/src/plugins/new.ts) command is built as an internal plugin, and how the [`build`](packages/cli/plugins/build.ts) command hooks into other plugins to mutate the webpack configuration.

## The Plugin API

Each exported function from a plugin, when called, is passed a `PluginAPI` instance it can use to interact with the CLI. Each exported function is used with the following signature:

```typescript
/**
 * Hooks into the Preact CLI.
 * @param api API instance for the plugin
 * @param opts Options for the hook, contains the global CLI options, can contain more depending on the hook
 * @return Value defined and used depending on the hook.
 */
function hook(api: PluginAPI, opts: CLIArguments /* Can also include more properties depending on the hook */): any {}
```

### List of available hooks

#### `install`

Gets called when the plugin is installed via `preact add <plugin>`, or invoked manually with `preact invoke <plugin>`.

#### `cli`

Gets called on CLI startup.

```typescript
function cli(api: PluginAPI, opts: CLIArguments): void {}
```

#### `build` / `watch`

Gets called at the start of the build step.s

```typescript
interface BuildArgv {
    analyze: boolean;
    brotli: boolean;
    clean: boolean;
    dest: string;
    esm: boolean;
    inlineCss: boolean;
    prerender: boolean;
    preload: boolean;
    production: boolean;
    sw: boolean;
    template?: string;
}

function build(api: PluginAPI, opts: CLIArguments & BuildArgv): void;
```

### `PluginAPI` instance

The Plugin API object is a class instance that's shared between hooks, though a shared state cannot be saved there.

#### `setStatus(text?: string, type?: "info" | "error" | "fatal" | "success")`

Prints to terminal the current status of the process. This is used for end-user logging. Proper feedback is important, as otherwise the user might think the CLI is stuck, and _will_ abort it early. Internally, Preact CLI uses `ora` to show an animated spinner.

When called without arguments, this stops and removes the spinner, persisting the last message into stderr. When called with one argument, the new status text, the spinner updates its status text. When called with two arguments, a logging text and a type identifier, the spinner persists the input text prefixed with an icon corresponding to the type.

**Examples**:

```typescript
api.setStatus("Status"); // @preact/cli:plugin:foo [/] Status
api.setStatus(); // @preact/cli:plugin:foo  Status
api.setStatus("Working..."); // @preact/cli:plugin:foo [/] Working...
api.setStatus("Creation complete", "success"); // @preact/cli:plugin:foo ✔️ Creaction complete \n @preact/cli:plugin:foo [/] Working...
api.setStatus("FATAL ERROR", "fatal"); // @preact/cli:plugin:foo ❌ FATAL ERROR [program exists with code 1]
```

#### `async getRegistry(): Promise<PluginRegistry>`

Returns a promise to the current PluginRegistry instance. See the [PluginRegistry](#the-plugin-registry) reference entry for more info.

#### `registerCommand(name: string, options?: CommandOptions): Command`

Registers a new command to add to the CLI. This returns a `Command` object from te `commander` package allowing you to personalize the command, add options, and set an action callback.

**Example**: [The `new` command](packages/cli/src/plugins/new.ts)

#### `chainWebpack(chainer: WebpackChainer)`

```typescript
type WebpackChainer = (config: webpackChain.Config) => void;
```

Adds a transformer function for the webpack configuration.

The function doesn't get called immediately; rather all transformer functions are collected and applied during the build step.

**Example**:

```typescript
// Add a minifier plugin
api.chainWebpack(config => config.plugin("terser").use(TerserPlugin, [terserOptions]));
```

#### `async applyTemplate(fileOrFolder: string, context: Record<string, string>, base?: string): Promise<Record<string, string>>`

Renders a file or folder template into the project. Returns an object with relative filenames as keys, and file contents as values, to be passed to `writeFileTree` to write to disk.

- `fileOrFolder` is the file or folder to render; is relative to `base` or absolute.
- `context` is an object containing template variables as keys and their content as values. This context gets merged with a default context which contains the environment variables as `env` and the current working directory as `cwd` .
- `base` is the base folder - it maps to the project folder. All output files are applied form this base folder into the project root. When unspecified, it is the project directory.

**Example**:

See [The `build` command](packages/cli/src/plugins/build.ts) for an example of plugin using `applyTemplate` .

#### `async writeFileTree(files: Record<string, string>, base?: string)`

Writes the given object to disk, relative to `base` .

- `files` is a dictionary of relative path keys and content values (like the object returned by `applyTemplate` ) to write to disk.
- `base` is the base directory from which all relatives files are mapped to. If unspecified, it is the project directory. If relative, it is relative to the project directory.

**Example**

```typescript
const project = {
    "package.json" : JSON.stringify(pkg, null, 2),
    "README.md": generateReadme();
    "src/index.js": createEntrypoint({name: "foobar"})
};
api.writeFileTree(project);

const sources = {
    "routes/index.jsx": createRoute("index"),
    "routes/profile/index.jsx": createRoute("profile", "developit"),
    "routes/prodile/solarliner.jsx": createRoute("profile", "solarliner")
}
api.writeFileTree(files, "src");
```

#### `getChains(): WebpackChainer[]`

**WARNING**: Internal function.

Returns an array of all defined `webpack-chain` transform functions by the plugin.

### The Plugin Registry

The plugin registry holds instances of plugins for all installed Preact CLI plugins. This allows you to call other plugins' exposed functions to tap into the CLI's pluggable features to extends its functionalities.

#### `plugin(name:string|PluginAPI): RegistryPluginActionWrapper`

```typescript
interface RegistryPluginActionWrapper {
    /** Invoke the plugin's hook named `funcName`. */
    async invoke<T>(funcName:string, options?:any): T;
    /** Return the PluginAPI instance wrapping the plugin. */
    instance(): PluginAPI;
}
```

Return a wrapper object on registry action, but for one plugin. `name` can either be a string object or an existing `PluginAPI` object. In the former case, the plugin will be resolved and loaded. In the later case, the instance is directly used.

#### `hookWebpackChain(config: import("webpack-chain")): void`

Transforms the `config` object using all transform functions defined by plugins in the registry. Note that these functions get registered when running hooks, so if you're writing a new command, you _need_ to take care of calling the appropriate hook.

#### `async invoke<T>(funcName: string, options?:any): Promise<(T|undefined)[]>`

Invokes the hook `funcName` on every plugin that implements it. The return value is the return value of the hooks.
