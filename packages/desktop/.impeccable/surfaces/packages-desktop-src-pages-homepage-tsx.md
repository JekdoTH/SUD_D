---
version: 1
slug: "packages-desktop-src-pages-homepage-tsx"
primary_target: "packages/desktop/src/pages/HomePage.tsx"
related_targets: ["packages/desktop/src/App.tsx","packages/desktop/src/index.css"]
---

# Overview surface brief

Mode: Operate
Scope: Shared App Shell + Overview only.
Audience/job: Primary Windows user needs to scan connection, workspace, activity, and safety state quickly, then take the next trusted action.
Primary action: Resolve the current connection/setup state or open ChatGPT Web through the fixed-purpose Desktop action.
Content/proof: Existing connection snapshot, approved workspace list, audit events, health check, and documented security policy only.
Constraints: Preserve all page IDs and backend truth; no Connection Method selector; no fake account/update/session/permission/uptime/encryption claims; other tab internals remain unchanged.

## Direction contract

THESIS: A precise Windows control center that makes trust and next action obvious; refuse the old card-grid dashboard clutter.
OWN-WORLD: Restrained white/cool-gray surfaces, SUD-D blue only for selection/actions, navy text, thin neutral rules, line icons, consistent rounded controls.
STORY: See health → understand connection → confirm workspace → scan recent activity and safety → move to the relevant existing page/action.
FIRST VIEWPORT: 238px light sidebar with approved logo; slim breadcrumb/status/action bar; large Overview header; one wide connection card; compact workspace list; balanced Activity/Safety split below.
FORM: User-approved hybrid desktop control-center preview; pinned comp, position 1; seed key `user-approved-overview-preview-2026-09-02`.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
