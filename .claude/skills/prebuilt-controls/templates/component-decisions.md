# Component decisions

Decision matrix for replacing hand-rolled controls with prebuilt ones. One row per control.
Keep it with the code (`docs/component-decisions.md`) and update it as slices land.

| Need | Current solution | Candidate (package, version, licence) | Keep / replace | Accessibility gain | Migration effort | Rollback | Decision and reason |
|---|---|---|---|---|---|---|---|
| Toasts | `Toast.tsx`, one at a time | Sonner 2.0, MIT | replace | announcements, stacking, pause on hover | small: 1 file, global | revert 1 file | |
| Dialogs | `Modal.tsx` | Base UI Dialog 1.9, MIT | replace | focus trap, return focus, Escape | small | revert wrapper | |
| … | | | | | | | |

## Not verified
- <licence tier, framework compatibility, device behaviour you could not check>

## Slices
1. <global toast + dialog>  2. <heaviest screen>  3. <menus>  4. <tables>
