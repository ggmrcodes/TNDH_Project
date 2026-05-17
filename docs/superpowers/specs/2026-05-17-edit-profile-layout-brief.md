# Edit Profile Layout — Padding + Chip Sizing — Agent Brief

- **Date:** 2026-05-17
- **Source:** Pilot tester feedback — *"Adjust the profile (edit profile) format (the blocking is a bit too wide)"*
- **Type:** UI polish (screenshot confirmed; three distinct issues)
- **Owner:** @ggmrcodes
- **Status:** Ready to dispatch

## Problem

The patient edit-profile screen (`แก้ไขโปรไฟล์`) has three visual issues, confirmed by tester screenshot on iPhone (Dynamic Island visible — iOS):

1. **No horizontal padding on the outer container.** Labels (ชื่อ-นามสกุล, หมู่เลือด, Rh Factor, แอนติบอดี, …) sit flush against the left screen edge. Inputs span literally edge-to-edge.
2. **Blood-type chips (A / B / AB / O) and Rh-factor chips (Rh+ / Rh-) are massively oversized.** A/B/AB/O each consume ~quarter screen width; Rh+/Rh- each consume half. They look like jumbo buttons rather than compact selection pills.
3. **Multiline text areas (`knownReactions`, `medications`) read as heavy gray "blocks"** — almost certainly what the tester meant by *"blocking is a bit too wide."* They look like wide gray rectangles, not text fields.

The cumulative effect: the form feels cramped against the edges and dominated by oversized chip buttons, which makes the multiline inputs look like awkward content blocks rather than form fields.

## Decisions already made (do not re-ask)

- **Three concrete fixes in one pass.** Padding + chip sizing + multiline polish — together they're what "blocking is too wide" actually means.
- **Audit both edit surfaces in scope:** the patient `ProfileEditForm` AND the initial `ProfileCompletionScreen` — same component family, same problem class.
- **Use existing responsive infrastructure.** Honor `MAX_CONTENT_WIDTH = 600` from `src/utils/responsive.ts` and standard `SPACING` tokens from `src/config/theme.ts`. Do not introduce a new layout system.
- **Don't restructure the form.** No field reordering, renaming, or visual redesign of inputs (border style / focus state stays).

## Files to touch

- `src/components/passport/ProfileEditForm.tsx` — primary file:
  - Wrap the outer scroll content with horizontal padding (`paddingHorizontal: SPACING.lg`) so labels and inputs no longer touch screen edges.
  - Constrain content max-width with `maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center', width: '100%'` so the form is centered on tablet/desktop.
  - Blood-type chip row: use `flexWrap` or fixed `minWidth: 56, paddingHorizontal: SPACING.md` per chip; do NOT use `flex: 1` (that's what's blowing them up). Visual target: 4 chips that read as ~60-72pt wide each on iPhone, not 90+pt.
  - Rh-factor chip row: same treatment. Two pills that look like selection chips, not two big buttons.
  - Multiline inputs (`knownReactions`, `medications`): keep multiline but consider reducing default `numberOfLines` from 3 to 2, OR add subtler border / lighter background so they don't read as heavy gray blocks. Implementer's call based on visual balance.
- `src/screens/auth/ProfileCompletionScreen.tsx` — apply the same three fixes if the same component family is used (likely shares chip components with `ProfileEditForm`).
- `src/utils/responsive.ts` — read only; do not modify.
- Cross-reference: any other screen already using `MAX_CONTENT_WIDTH` (e.g., `PassportScreen`) — match its pattern exactly.

## Acceptance criteria

- [ ] On iPhone (the device in the bug screenshot), labels and inputs have visible left/right padding from the screen edges — nothing touches edge 0.
- [ ] Blood-type chips A / B / AB / O render as compact selection pills (~60-72pt wide each), not as quarter-screen-wide buttons.
- [ ] Rh+ / Rh- chips render as two compact pills side-by-side, not as half-screen-wide buttons.
- [ ] Multiline inputs no longer read as oversized gray blocks — either reduced height, refined border, or both. Side-by-side before/after must look meaningfully calmer.
- [ ] On tablet/desktop (>600pt), form is centered horizontally with `maxWidth: MAX_CONTENT_WIDTH`.
- [ ] `ProfileCompletionScreen` gets the same treatment if it shares the layout.
- [ ] No visual regression on other tabs (`PassportScreen`, `SymptomMonitorScreen`, `AppointmentsScreen`, `TransfusionHistoryScreen`).
- [ ] Before/after screenshots on iPhone + Android phone + tablet attached to PR.
- [ ] Thai layout still reads correctly (Thai text is taller than Latin — verify nothing clips).

## Open questions / blocked on

- **Save button width** (cut off in screenshot — visible as a teal bar at the bottom). Implementer should verify it's not also stretched edge-to-edge; if it is, apply the same `maxWidth` treatment.
- **Header back-button pill (`กลับ`)** looks visually heavy in the screenshot — out of scope for this brief unless the implementer judges it's part of the same problem; if so, flag in PR description but don't fix in this PR.

## Out of scope

- Field reordering, renaming, adding/removing fields.
- Visual redesign of input border style, focus state, color palette.
- Profile-completion **logic** changes (validation, required-field rules).
- The transfusion-interval field's day→week conversion (separate brief: `2026-05-17-transfusion-interval-weeks-brief.md`) — that change will happen in the same file, so coordinate landing order: ship the layout fix first, then the interval-unit change rebases cleanly.
