# Install Codex Agents Workflow

[中文](INSTALL.zh-CN.md) · [User guide](docs/guides/usage.md)

This is an executable installation procedure for a person or an LLM. Once the user requests installation, carry out the applicable steps, reuse working dependencies, and verify the result. Keep the checkout and temporary downloads in one chosen installation directory. Discover the receiving computer's paths; examples below are not fixed machine paths.

## 1. Check the receiving host

Detect the operating system and architecture, then run each available command separately:

```sh
node --version
git --version
codex --version
codex plugin --help
```

The engine requires **Node.js 20+**, **Git**, and a Codex host supporting plugins and MCP Extensions. Prefer a maintained Node LTS release of 22 or newer for new installations; it also covers the video package's Node requirement. A normal plugin installation does not require Python, FFmpeg, a browser download, or development npm dependencies.

Install only missing prerequisites with the receiving system's package manager:

| System | Node.js | Git |
| --- | --- | --- |
| Windows, with WinGet | `winget install --id OpenJS.NodeJS.LTS -e --source winget` | `winget install --id Git.Git -e --source winget` |
| macOS, with Homebrew | `brew install node` | `brew install git` |
| Debian/Ubuntu | Check the offered `nodejs` version before installing it with `npm`; if it is too old, use the official Node download for the detected architecture | `sudo apt-get update`, then `sudo apt-get install -y git` |

Sources: [Node downloads and verification](https://nodejs.org/en/download), [WinGet Node package](https://github.com/microsoft/winget-pkgs/tree/master/manifests/o/OpenJS/NodeJS/LTS), [Git on Windows](https://git-scm.com/install/windows), [Homebrew Node](https://formulae.brew.sh/formula/node).

If a package manager or administrator access is unavailable, use an official portable Node distribution matching the OS and architecture, verify its published checksums, and supply its executable directory to the host. Recheck executable locations and versions after installation; an existing host process may still have its previous PATH. Obtain a plugin-capable Codex host if `codex plugin --help` is unavailable. Report the actual missing prerequisite instead of silently skipping it.

## 2. Install the plugin and its native context profile

In the chosen parent directory:

```sh
git clone https://github.com/TohmaN233/codex-agents-workflow.git
cd codex-agents-workflow
codex plugin marketplace add .
node plugins/codex-agents-workflow/scripts/install-local.mjs
```

For an existing checkout, verify its origin and worktree first. Update a clean `main` with `git pull --ff-only`; preserve local edits and report a divergence instead of resetting it. Reuse a matching marketplace registration. The installer invokes `codex plugin add codex-agents-workflow@codex-agents-workflow`, registers the plugin-owned `caw_native_builtins` context profile, and retires verified obsolete plugin-cache versions after installation succeeds. Use this wrapper so the profile is installed too.

Inspect the installer's JSON result: it must report `installed: true` and a successful native context profile registration. Treat a nonzero exit as a failure. Do not manufacture installed-plugin records or edit a configuration version number to force acceptance.

## 3. Confirm the live connection

Refresh the current host's plugin/MCP connection if it still exposes the previous installation. Use a host refresh/reload operation when available; request a restart only if that operation is unavailable or fails. Then discover the **current conversation's** CAW tools and call `workflow_list` and `workflow_role_templates`. These are metadata checks and do not invoke a model or launch a business Run.

Successful CLI installation or an independent server handshake does not prove that the current conversation is connected. If using `scripts/check-mcp-startup.mjs` for diagnostics, run it from the actual installed plugin, whose stable cache namespace supplies the bootstrap context, rather than from a source checkout.

A fresh installation creates current **v7** configuration and its Workflow store directly, with **Build Workflow**, **Skill to Workflow**, and the current built-in Roles. Native Providers are enabled by default; external Providers are optional. Preserve existing Providers, Workflows, credentials and Runs when updating. Existing legacy configurations use the supported upgrade/restore flow in the [user guide](docs/guides/usage.md); fresh installations need no legacy migration.

The Strict executor capability is enabled in new defaults. When a selected route needs a local Codex executor, the Host discovers the receiving installation, computes its executable digest and checks the required capabilities before execution. Users and LLMs do not fill a path/hash pair for first use. Existing explicit disable and authentication settings are preserved. A missing executable, unavailable login or incompatible host remains a concrete setup error; enabling the executor does not bypass those requirements. Ordinary cooperative execution has its own qualification and is not gated by the optional Strict switch.

The executor switch does not select a Workflow's policy. Skill to Workflow and Build Workflow generate cooperative Workflows by default; enabling the executor does not convert them to Strict.

## 4. Optionally install reusable Workflows

Follow the [Workflow Package installation procedure](https://github.com/TohmaN233/workflow-package/blob/main/workflow_explanations/install.md) for the selected package. It describes the package importer, file digest, bundled resources, Provider requirements, and route-specific dependencies.

Importing a package restores its declared files and tools. It does not install external programs or supply service credentials. Use both the package dependency list and the selected nodes' `runtime_requirements`; install only dependencies of the intended route. Bind executable paths discovered on this computer in the workbench dependency settings when automatic discovery needs help. Configure optional external services only when the user intends to use them.

## 5. Finish with evidence

Report the installed source/release, resolved executable versions and paths, live MCP metadata-check result, and any installed package IDs with remaining route-specific prerequisites. Installation acceptance uses metadata and local diagnostics; running benchmarks, paid speech generation, or the repository's full developer test suite is unnecessary.

If a real blocker remains, identify the exact failed step and error. Complete the independent steps first; ask only for a decision, account login, credential, or administrator action that the available interfaces cannot perform. Do not report a partly connected or dependency-incomplete selected route as ready.

For contributor checks, see the [repository README](README.md). The committed browser assets are already included for ordinary installation.
