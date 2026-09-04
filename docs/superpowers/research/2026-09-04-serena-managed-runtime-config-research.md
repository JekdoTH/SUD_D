# Serena Managed Runtime Configuration Research

Date: 2026-09-04

Scope: facts required to turn the Milestone A Serena compatibility spike into the Milestone B product-owned runtime foundation. All Serena facts below are pinned to the approved Serena v1.7.0 upstream commit `949a27ef1e5fda1a6e7b561e777bcece345c6ffd` unless stated otherwise.

## Conclusion

Milestone B can keep Serena configuration and project metadata out of both the user's global Serena state and the active source Workspace.

The product runtime should:

1. set `SERENA_HOME` to a SUD-D-owned directory under `%LOCALAPPDATA%\SUD-D`;
2. materialize a SUD-D-owned `serena_config.yml` there;
3. set `project_serena_folder_location` to a SUD-D-owned per-Workspace metadata path;
4. **pre-create that configured per-Workspace Serena folder before Serena starts** so Serena cannot fall back to an existing `<workspace>\.serena` folder;
5. use the `no-memories` mode in Product Mode, because `no-onboarding` alone still retains memory tools;
6. continue using the pinned LSP + stdio process model proven by Milestone A.

This lets SUD-D remain the source of truth for runtime/workflow state while keeping any developer-owned `.serena/` folder in the repository outside Product Mode ownership.

## 1. Serena home is relocatable with `SERENA_HOME`

Serena's `SerenaPaths` checks the `SERENA_HOME` environment variable. If it is unset/blank it uses `~/.serena`; otherwise it uses the supplied location as Serena's user configuration/data root.

The official configuration documentation also states that the Serena data directory defaults to `~/.serena` and can be changed with `SERENA_HOME`. The global `serena_config.yml`, logs, contexts, modes, and related Serena-managed data live under that home.

**Milestone B implication:** Product Mode must set `SERENA_HOME` explicitly rather than read or mutate the user's ordinary Serena installation/configuration.

Sources:

- Serena v1.7.0 `SerenaPaths`: https://github.com/oraios/serena/blob/949a27ef1e5fda1a6e7b561e777bcece345c6ffd/src/serena/config/serena_config.py
- Serena v1.7.0 configuration documentation: https://github.com/oraios/serena/blob/949a27ef1e5fda1a6e7b561e777bcece345c6ffd/docs/02-usage/050_configuration.md

## 2. Per-project Serena state can be moved outside the Workspace

Serena's global config exposes `project_serena_folder_location`. It supports `$projectDir` and `$projectFolderName` placeholders. The default is `$projectDir/.serena`, but the configured value may point to a central directory elsewhere.

Serena uses this fallback order when resolving project state:

1. configured project Serena folder, if it already exists;
2. the legacy/default `<project-root>/.serena`, if it exists;
3. otherwise the configured path, which will be created as needed.

The source implementation in `SerenaConfig.get_project_serena_folder()` matches the documented order.

**Milestone B implication:** Merely configuring a central path is not sufficient. A user/developer may already have `.serena/` in the source repository. SUD-D must pre-create its configured project-data directory before launching Serena so resolution stops at step 1 and Product Mode does not adopt or mutate developer tooling state in the Workspace.

Sources:

- Serena v1.7.0 configuration documentation, “Per-Project Serena Folder Location”: https://github.com/oraios/serena/blob/949a27ef1e5fda1a6e7b561e777bcece345c6ffd/docs/02-usage/050_configuration.md
- Serena v1.7.0 `get_project_serena_folder`: https://github.com/oraios/serena/blob/949a27ef1e5fda1a6e7b561e777bcece345c6ffd/src/serena/config/serena_config.py
- Serena v1.7.0 `Project` construction and `.gitignore` creation in the resolved Serena data folder: https://github.com/oraios/serena/blob/949a27ef1e5fda1a6e7b561e777bcece345c6ffd/src/serena/project.py

## 3. Global config can be product-owned and deterministic

`SerenaConfig.from_config_file()` resolves the global file from Serena home as `serena_config.yml`. If it is missing, Serena generates it from its bundled template. The v1.7.0 template includes the controls Milestone B needs, including:

- `language_backend: LSP`;
- dashboard/GUI settings;
- `base_modes` / `default_modes`;
- `project_serena_folder_location`;
- `trusted_project_path_patterns`;
- `projects`.

**Milestone B implication:** SUD-D should materialize its own deterministic config under the managed `SERENA_HOME` instead of inheriting user-global settings. This config is implementation state owned by the pinned engine version, not a user-facing file.

Sources:

- Serena v1.7.0 config loading/generation: https://github.com/oraios/serena/blob/949a27ef1e5fda1a6e7b561e777bcece345c6ffd/src/serena/config/serena_config.py
- Serena v1.7.0 config template: https://github.com/oraios/serena/blob/949a27ef1e5fda1a6e7b561e777bcece345c6ffd/src/serena/resources/serena_config.template.yml

## 4. `no-onboarding` is not the same as memory-off

The official Serena config docs describe `no-onboarding` as skipping the initial onboarding flow while retaining memory tools.

Serena v1.7.0 also ships a `no-memories` mode. Its exact exclusions are:

- `write_memory`
- `read_memory`
- `delete_memory`
- `edit_memory`
- `rename_memory`
- `list_memories`
- `onboarding`

Milestone A intentionally used `no-onboarding` and captured 29 tools. Removing those seven memory/onboarding tools yields an expected Product Mode discovery surface of 22 upstream Serena tools before SUD-D applies its own future facade/classification.

**Milestone B implication:** Product Mode should start Serena with `--mode no-memories`, not `--mode no-onboarding`. The 22-name tool contract must be verified by a real managed-runtime acceptance test rather than assumed only from subtraction.

Sources:

- Serena v1.7.0 configuration docs, Modes: https://github.com/oraios/serena/blob/949a27ef1e5fda1a6e7b561e777bcece345c6ffd/docs/02-usage/050_configuration.md
- Serena v1.7.0 `no-memories.yml`: https://github.com/oraios/serena/blob/949a27ef1e5fda1a6e7b561e777bcece345c6ffd/src/serena/resources/config/modes/no-memories.yml
- SUD-D Milestone A canonical 29-tool snapshot: `docs/superpowers/research/2026-09-04-serena-v1.7.0-tool-schema.json`

## 5. Active-project and LSP health can be checked through Serena itself

Serena exposes `get_current_config`. Its implementation delegates to `SerenaAgent.get_current_config_overview()`. For an active project the returned text includes:

- Serena version;
- `Active project: <project-name>`;
- language backend;
- language-server status;
- active context/modes/tools.

The active-project field is a project **name**, not an absolute path. Therefore this check should be paired with SUD-D's own fixed launch context, which supplies the exact canonical Workspace path via `--project` to the specific child process being health-checked. The combination is stronger than parsing the name alone.

**Milestone B implication:** health should require both:

- the SUD-D-owned launch context still matches the expected canonical Workspace; and
- `get_current_config` reports the expected active project name and LSP backend/status.

A semantic read probe through that same MCP session should provide the final LSP-usable proof.

Sources:

- Serena v1.7.0 `GetCurrentConfigTool`: https://github.com/oraios/serena/blob/949a27ef1e5fda1a6e7b561e777bcece345c6ffd/src/serena/tools/config_tools.py
- Serena v1.7.0 `get_current_config_overview`: https://github.com/oraios/serena/blob/949a27ef1e5fda1a6e7b561e777bcece345c6ffd/src/serena/agent.py

## 6. Milestone A facts remain the runtime compatibility baseline

Milestone A already proved on Work-PC:

- `serena-agent==1.7.0`;
- Python 3.13 via uv-managed isolated directories;
- stdio MCP through `@modelcontextprotocol/client@2.0.0`;
- LSP backend;
- exact package/tag/commit/wheel hash;
- real semantic `get_symbols_overview` behavior;
- deterministic Windows process-tree cleanup.

Milestone B should promote these proven mechanics into production backend modules rather than redesign the transport or choose a new Serena version.

Source:

- `docs/superpowers/research/2026-09-04-serena-runtime-spike-results.md`

## 7. Hash enforcement is broader than one top-level Serena wheel

Astral's uv CLI supports `--require-hashes` for tool installation, but hash-checking mode is all-or-nothing: every requirement must be pinned and have a matching hash (or be a direct URL). Serena has transitive dependencies, so the single approved `serena-agent` wheel hash recorded by Milestone A is not by itself a complete hash-locked dependency graph.

**Milestone B implication:** keep the exact Serena package/version/upstream commit/top-level wheel hash in the engine manifest, but do not claim that the Milestone B bootstrap path is a fully supply-chain-locked updater. Milestone B does not enable Serena auto-update or user-facing update. Before Milestone F enables production update/promotion, SUD-D must define and test a complete artifact/dependency verification strategy.

Sources:

- uv CLI reference, `uv tool install --require-hashes`: https://docs.astral.sh/uv/reference/cli/#uv-tool-install
- uv settings reference, hash-checking constraints: https://docs.astral.sh/uv/reference/settings/#require-hashes

## Product constraints carried forward

- No direct Product Mode AI → Serena connection.
- No production `code.*` in Milestone B.
- No `code.run` in Milestone B.
- No renderer-visible UI in Milestone B.
- Native Workspace/Git/Team behavior remains unchanged.
- No silent fallback to a global Serena, PowerShell, another engine, HTTP/SSE, or an unpinned version.
- Serena config/log/project metadata must remain under SUD-D-owned managed storage and must not enter repository state.
- Raw Serena stdout/stderr or environment data must not be persisted into audit/UI/errors.
- `.serena/` in a developer repository remains developer-local tooling state and is never committed by SUD-D.