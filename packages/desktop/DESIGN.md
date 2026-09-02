---
name: SUD-D Desktop
description: Clean local-first Windows control center for a secure AI runtime.
colors:
  primary: "#0866ff"
  primary-hover: "#0057df"
  primary-soft: "#edf5ff"
  surface-base: "#f5f7fa"
  surface: "#ffffff"
  surface-elevated: "#f8fafc"
  border: "#e3e8ef"
  border-strong: "#cdd6e1"
  text-primary: "#0d1b35"
  text-secondary: "#5e6c84"
  text-muted: "#667085"
  success: "#238636"
  success-soft: "#f1fbf3"
  warning: "#c55b0a"
  warning-soft: "#fff7ed"
  danger: "#c0342b"
  danger-soft: "#fff1f0"
typography:
  headline:
    fontFamily: "Segoe UI, system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "30px"
    fontWeight: 760
    lineHeight: 1.18
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Segoe UI, system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "17px"
    fontWeight: 700
    lineHeight: 1.25
  body:
    fontFamily: "Segoe UI, system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Segoe UI, system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.4
rounded:
  sm: "8px"
  md: "12px"
  lg: "14px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "20px"
  xl: "28px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.sm}"
    padding: "7px 14px"
    height: "36px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.surface}"
    rounded: "{rounded.sm}"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.lg}"
  nav-active:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.primary}"
    rounded: "{rounded.sm}"
---

# Design System: SUD-D Desktop

## Overview

**Creative North Star: "Trusted Local Control Center"**

SUD-D Desktop is an Operate-mode Windows interface: the user should scan state, understand the next safe action, and continue working without interpreting runtime internals. The visual system stays quiet and familiar—cool white surfaces, precise neutral rules, one SUD-D blue action voice, and compact state color only where meaning requires it.

Brand character comes from the approved SUD-D logo, disciplined blue selection/action treatment, consistent line icons, and deliberate information hierarchy rather than decorative effects. The shared shell should recede behind the task while remaining recognizably SUD-D.

**Key Characteristics:**
- Restrained white and cool-gray surfaces with one primary blue accent.
- Dark navy hierarchy and readable muted copy.
- Thin rules, 8–14px corner language, and low ambient elevation.
- Line icons with consistent stroke weight; status meaning includes text, not color alone.
- Dense enough for desktop operation, with responsive reflow before content clips.

## Colors

The palette is restrained: blue is reserved for current selection and primary actions, while green, amber, and red communicate real state.

### Primary
- **SUD-D Action Blue** (#0866ff): primary buttons, active navigation, actionable links, and selected state.
- **Action Blue Hover** (#0057df): hover state for primary actions.
- **Action Blue Wash** (#edf5ff): active navigation and quiet informational emphasis.

### Neutral
- **Cool Canvas** (#f5f7fa): application background.
- **Control Surface** (#ffffff): cards, top bar, and primary working surfaces.
- **Quiet Surface** (#f8fafc): low-emphasis controls and internal rows.
- **Navy Ink** (#0d1b35): headings and primary content.
- **Slate Copy** (#5e6c84): secondary copy and metadata.
- **Readable Muted** (#667085): tertiary UI text; keep normal-size text at or above 4.5:1 against white.
- **Neutral Rule** (#e3e8ef): normal separators and card borders.
- **Strong Rule** (#cdd6e1): stronger control outlines.

### State
- **Safe Green** (#238636) / **Safe Wash** (#f1fbf3): healthy, connected, or explicitly safe state.
- **Attention Amber** (#c55b0a) / **Attention Wash** (#fff7ed): setup or approval attention.
- **Failure Red** (#c0342b) / **Failure Wash** (#fff1f0): error or denied state.

**The One Action Voice Rule.** Use SUD-D blue for current selection and actionable controls, not as general decoration.

## Typography

**Display Font:** Segoe UI (system-ui fallback)
**Body Font:** Segoe UI (system-ui fallback)

**Character:** One workhorse Windows UI family carries the whole interface. Hierarchy comes from size, weight, and spacing rather than a decorative display face.

### Hierarchy
- **Headline** (760, 30px, 1.18): page titles such as Overview; 28px at narrower desktop widths.
- **Title** (700, ~17px, 1.25): card and section headings.
- **Body** (400, 14px, 1.5): working copy and explanatory text.
- **Label** (600, 11–12px): navigation, status labels, metadata, and compact controls.

**The Operate Type Rule.** Keep typography fixed-scale and compact; do not introduce decorative display fonts into labels or controls.

## Layout

The desktop shell uses a 238px persistent left sidebar and a 76px top bar. Main content is centered within a maximum width of roughly 1220px and uses 20px section gaps. The Overview hierarchy is deliberately linear: page heading, one wide connection/status card, approved workspace summary, then a two-column Recent Activity / Safety Status row.

Responsive behavior is structural. At 1180px the connection action moves below the status columns. At 1020px the sidebar collapses to icon-only navigation. At 940px the connection card and bottom Overview summaries become single-column. At 760px top-bar labels collapse to icon controls. Coarse-pointer controls receive a 44px minimum target height.

## Elevation & Depth

SUD-D is flat by default. Separation comes primarily from neutral rules and tonal surfaces; cards receive only a soft ambient shadow (`0 1px 2px rgba(15, 23, 42, 0.035), 0 8px 24px rgba(15, 23, 42, 0.025)`). Buttons may use a small blue-tinted lift, but no glow or glass treatment.

**The Flat-By-Default Rule.** Prefer borders and tonal layering; shadows remain subtle and never become decoration.

## Shapes

Controls use 8px corners, ordinary cards 12px, and major shell/Overview cards 14px. Pills are reserved for compact state chips. Borders are 1px neutral strokes. Do not use geometric masks, heavy side accents, or oversized rounded “card soup” containers as decoration.

## Components

### Buttons
- **Shape:** 8px radius, 36px desktop minimum height; 44px under coarse pointer input.
- **Primary:** SUD-D Action Blue with white text; one clear primary action per local task cluster.
- **Hover / Focus:** darker blue on hover; visible 3px translucent-blue focus outline with 2px offset.
- **Ghost / Link:** white outlined ghost buttons for secondary actions; transparent blue text controls for tertiary navigation.
- **Disabled / Loading:** disabled controls lose opacity and pointer affordance; labels name loading state (`Checking…`, `Working…`, `Opening…`).

### Chips
- **Style:** compact pill shape with text plus a visible status dot where appropriate.
- **State:** semantic text and background pair with the state color; color never carries meaning alone.

### Cards / Containers
- **Corner Style:** 12–14px.
- **Background:** Control Surface or Quiet Surface.
- **Shadow Strategy:** low ambient only; use one depth cue rather than stacking heavy border and shadow.
- **Border:** 1px Neutral Rule.
- **Internal Padding:** generally 18–28px, reduced at narrow desktop widths.

### Inputs / Fields
- **Style:** white field, Strong Rule outline, 8px radius, compact Segoe UI copy.
- **Focus:** blue border shift plus a low-opacity blue focus ring.
- **Error / Disabled:** semantic danger treatment or reduced opacity without removing readable copy.

### Navigation
- Persistent left rail on normal desktop sizes; active item uses Action Blue Wash plus blue icon/text. Inactive items remain neutral and gain a quiet surface on hover. At <=1020px, the rail collapses to icons while preserving the same page IDs and navigation semantics.

### Overview Status Card
- The first major Overview block owns connection/setup state and one primary next action.
- Status rows use backend-derived Workspace, Runtime API Key, and Secure Tunnel state only.
- Deeper setup remains on the existing Connection/Workspaces surfaces rather than expanding into Overview.

## Do's and Don'ts

### Do:
- **Do** preserve product truth and derive state from existing safe DTOs.
- **Do** use the approved SUD-D logo in the shared shell.
- **Do** keep blue rare enough that current selection and primary action remain obvious.
- **Do** preserve visible keyboard focus, readable muted text, and breakpoint-driven reflow.
- **Do** use one line-icon vocabulary with consistent stroke weight.

### Don't:
- **Don't** reintroduce a Connection Method selector into Overview.
- **Don't** invent account, update, session, permission, uptime, encryption, or other unsupported claims.
- **Don't** expose secrets, API-key suffixes, arbitrary URLs, executables, argv, cwd, or env through renderer-facing UI.
- **Don't** redesign page-specific content in other tabs merely because they inherit the shared shell.
- **Don't** use decorative gradients, glassmorphism, excessive badges, or raw Unicode glyphs as the final icon system.
