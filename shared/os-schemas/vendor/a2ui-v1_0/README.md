# Vendored A2UI v1.0 schemas (conformance tests only)

These three files are copied unmodified from the `@a2ui/web_core@0.16.1` npm
tarball (`src/v1_0/schemas/`), published by the A2UI project
(repository `github.com/a2ui-project/a2ui`, license Apache-2.0, see `LICENSE`):

- `agent_to_renderer.json` (`$id` https://a2ui.org/specification/v1_0/agent_to_renderer.json)
- `renderer_to_agent.json` (`$id` https://a2ui.org/specification/v1_0/renderer_to_agent.json)
- `common_types.json` (`$id` https://a2ui.org/specification/v1_0/common_types.json)

Tarball: https://registry.npmjs.org/@a2ui/web_core/-/web_core-0.16.1.tgz
(sha256 `545b76606daf8cb1698983e73366fb13d6df68e34c9e5e4a157634b066817dd4`).

They are used only by `backend/tests/test_os_a2ui_conformance.py`, which checks
that every A2UI message in Forge's example payloads is also valid against the
official v1.0 schemas. They are not loaded at runtime and are not part of the
frontend or backend images. See `docs/os/A2UI_DECISION.md`.
