# ⚛️ Preact CLI (Experiment)

New CLI for Preact featuring a plugin-based system

# Install

This project is a monorepo and uses `yarn` and `lerna` to manage internal and external dependencies.

```bash
yarn lerna bootstrap
```

# Run

**Note**: As it is in its early stages, running the CLI only works in Unix-style environments. Windows users, use MSYS or WSL.

You can run a development version (without transpiling) of the CLI by going to `packages/cli` and running `yarn dev`.

```bash
cd packages/cli
yarn dev [options] <command> [options]
# Example
yarn dev --cwd /tmp/ new preact-app # Creates a project in a folder called "preact-app", working in the temp directory
```

# Reference guide

The CLI resolves any installed plugins at startup, and hooks into exported functions for them to tap into the CLI.
With plugins, you can **create new commands**, **mutate the webpack configuration** (uses `webpack-chain`), and even
create new functionality by invoking other plugins' exported functions.

You can take a look at how the [`new`](packages/cli/src/plugins/new.ts) command is built as an internal plugin, and how
the [`build`](packages/cli/plugins/build.ts) command hooks into other plugins to mutate the webpack configuration.

## The Plugin API

Each exported function from a plugin, when called, is passed a `PluginAPI` instance it can use to interact with the CLI.
Each exported function is used with the following signature:

```typescript
/**
 * Hooks into the Preact CLI.
 * @param api API instance for the plugin
 * @param opts Options for the hook, contains the global CLI options, can contain more depending on the hook
 * @return Value defined and used depending on the hook.
 */
function hook(api: PluginAPI, opts: CLIArguments /* Can also include more properties depending on the hook */): any {}
```

### `PluginAPI` instance

The Plugin API object is a class instance that's shared between hooks, though a shared state cannot be saved there.

#### `setStatus(text?: string, type?: "info" | "error" | "fatal" | "success")`

Prints to terminal the current status of the process. This is used for end-user logging. Proper feedback is important, as otherwise the user might think the CLI is stuck, and _will_ abort it early.
Internally, Preact CLI uses `ora` to show an animated spinner.

When called without arguments, this stops and removes the spinner, persisting the last message into stderr.
When called with one argument, the new status text, the spinner updates its status text.
When called with two arguments, a logging text and a type identifier, the spinner persists the input text prefixed with an icon corresponding to the type.

**Examples**:

```typescript
api.setStatus("Status"); // @preact/cli:plugin:foo [/] Status
api.setStatus(); // @preact/cli:plugin:foo  Status
api.setStatus("Working..."); // @preact/cli:plugin:foo [/] Working...
api.setStatus("Creation complete", "success"); // @preact/cli:plugin:foo ✔️ Creaction complete \n @preact/cli:plugin:foo [/] Working...
api.setStatus("FATAL ERROR", "fatal"); // @preact/cli:plugin:foo ❌ FATAL ERROR [program exists with code 1]
```

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

-   `fileOrFolder` is the file or folder to render; is relative to `base` or absolute.
-   `context` is an object containing template variables as keys and their content as values.
-   `base` is the base folder - it maps to the project folder. All output files are applied form this base folder into the project root. When unspecified, it is the

**Example**:

```typescript
//
```
