# Android Bottom Tab Buttons — Hit Target Fix — Agent Brief

- **Date:** 2026-05-17
- **Source:** Pilot tester feedback — *"Adjust the 4 bottom buttons for android users (comment it's difficult to press)"*
- **Type:** UX/accessibility fix (low ambiguity, dual root cause)
- **Owner:** @ggmrcodes
- **Status:** Ready to dispatch

## Problem

Android pilot testers report the four bottom tab bar buttons (Passport, SymptomMonitor, Appointments, TransfusionHistory) are difficult to press. Two probable root causes — both must be addressed because we lack device-specific repro:

1. **Hit-target too small.** Current tab bar height is 68pt with `paddingBottom: 6`. Material guidelines call for ≥48dp tap targets; on phones with dense pixels and small icons (22pt) the effective hit area shrinks.
2. **System gesture bar collision.** Modern Android (10+) reserves a ~16pt insulation zone at the bottom for the swipe-home gesture. If the tab bar doesn't honor `useSafeAreaInsets().bottom`, the bottom row of the tab buttons sits inside the system gesture zone and the OS intercepts the tap.

## Decisions already made (do not re-ask)

- **Fix both causes in one PR.** Don't wait for tester repro — both are low-risk, well-understood fixes.
- **Use existing `react-native-safe-area-context`** (already a transitive dependency via React Navigation). Do not add new packages.
- **No design change.** Keep the existing layout (icon over label, active dot indicator). Just resize and respect insets.
- **Android-first but apply to iOS too.** SafeArea handling helps iOS too; the 48dp minimum is a universal a11y standard.

## Files to touch

- `src/navigation/MainTabNavigator.tsx` — the only file with `tabBarStyle`. Around line 60-80:
  - Wrap or use `useSafeAreaInsets()` to set `paddingBottom = Math.max(6, insets.bottom)` and `height = 56 + Math.max(6, insets.bottom)` (or use React Navigation's built-in inset handling if not already opted into).
  - Increase tab icon size from 22 to 24, label `fontSize` from 10 to 11 — small bumps that increase visual tap target.
  - Confirm each tab button's effective interactive area is ≥48dp tall; if not, add explicit `tabBarItemStyle: { paddingVertical: 6 }`.
- No other file should change.

## Acceptance criteria

- [ ] On Android phone with gesture navigation, tapping the bottom row of each tab icon registers reliably (no need to tap "above" the icon).
- [ ] On Android phone with 3-button navigation, no visual regression.
- [ ] On iOS phones with home indicator, tab bar sits above the indicator with breathing room.
- [ ] On iOS phones without home indicator (older), tab bar bottom padding does not look excessive.
- [ ] Tab icon + label still visually balanced — no overlap, no clipping, no obvious gap between bar and screen edge.
- [ ] Manual tap-target audit using accessibility inspector — every tab button reports ≥48dp height.

## Open questions / blocked on

- **Tester device model + Android version + nav mode (gesture vs 3-button)** — not blocking implementation, but useful for verification. Suggested copy-paste to send testers:
  > "Quick info to help debug — what's your phone model, Android version, and do you use the swipe-up gesture or three-button navigation at the bottom?"

## Out of scope

- Redesigning the active state, icons, or labels.
- Adding haptic feedback on tab change.
- Desktop sidebar layout (separate code path in `DesktopTabLayout` — unaffected).
- Restoring tab bar shadow/elevation (currently 0 by design).
