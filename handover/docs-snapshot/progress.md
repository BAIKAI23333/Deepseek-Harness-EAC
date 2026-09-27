# SDD ledger — plan: .trae/documents/2026-09-26-dsh-eac-ecosystem-packaging-plan.md

## Protected baseline

- Workspace: `D:\DeepSeek Harness\dsh max`
- Desktop repo branch: `feat/eac-ecosystem-m0-m8`
- Baseline commit before implementation: `a9b90e254800dfe84c65c01d150a8596e94f6a31`
- Upstream baseline: `origin/main` at `a9b90e254800dfe84c65c01d150a8596e94f6a31`
- Protected untracked paths (must not be overwritten, deleted, or staged):
  - `dsh_desktop/probe-remote-session.cjs`
  - `dsh_desktop/tauri-shell/release/`
  - `dsh_desktop/tauri-shell/sidecar/phone-bridge.js`
  - `dsh_desktop/tauri-shell/sidecar/rescue-integration.js`
- Separate worktree `dsh-v6-task-3.2` is out of scope and must not be changed.
- Real user home `C:/Users/HUAWEI/.dsh` is out of scope; all runtime checks use isolated homes.

## Preflight conflict scan and rulings

| Area | Plan requirement | Existing interface | Ruling |
|---|---|---|---|
| Web client skins vs Tauri shell skin | loader must be the user skin control plane; Stage 2 asks to remove manager user entry | ADR 0010 manager artifact currently supplies shell boot/recovery resources | Keep only a non-selectable shell recovery fallback; remove manager as user-facing Web skin selector, but do not remove the recovery asset until replacement tests and packaging are green. |
| `.dshpack` formats | M4 requires Mojobox packs; EAC already has Feature Pack v1 | Mojobox repo uses its own catalog/pack contract; EAC feature-pack CLI is a different implementation | Implement Mojobox-native Pack/Lock/Evidence and `.dshpack`; add explicit adapter/import path for EAC where needed. Do not claim one format is the other. |
| plugin tier metadata | plan asks to add tier | upstream has `distributionClass` | Treat `distributionClass` as canonical tier field and add UI/runtime behavior without duplicate `tier` keys. |
| publishing | M8 requires releases/issues | repository policy forbids implicit push; publication is outward-facing | Build and verify all release assets locally. Publish/close issues only when the user’s explicit M8 authorization is treated as durable; otherwise report exact publish-ready commands and blocked status. |

## Stage status

- M0: COMPLETE before this branch; synchronized to `a9b90e2`. This implementation branch records and verifies it.
- M1: COMPLETE_WITH_DEFERRED — loader v1.1.0, 14 release-ready tgz (loader + 13 skins), deep-whale pinned conversion included; Endfield deferred as a feature-rich host/client plugin requiring separate re-platforming. Full report: `s2-loader-report.md` and final artifacts under `loader/.verify/pkgs-v1.1.0-final/`.
- M2: COMPLETE — #415 legacy skin-switch retired; loader + 13 verified skin packages are now preinstalled/staged/profile-synced; default native fallback preserved; focused, full, and staged isolated-home tests green. Reports: `s2-loader-desktop-integration-report.md`, `s7-official-ui-report.md`.
- M3: COMPLETE — #416 distributionClass runtime/UI behavior, 202/202 desktop tests and 15/15 isolated-home smoke green. Report: `s3-issue-416-report.md`.
- M4: COMPLETE_WITH_CONCERNS_RESOLVED — Mojobox catalog/Pack/Lock/evidence/coverage gates green; v1.1 skin/free-model catalog refresh remains a post-publish M8 action.
- M5: COMPLETE_LOCAL_RELEASE_READY — `dsh-eac-pack-installer` local package, 93 tests, typecheck/lint/build/pack/offline smoke green; official account/install UI reused through adapter seams, credentials remain host-owned. Report: `s5-installer-report.md`.
- M6: COMPLETE_WITH_CONCERNS_RESOLVED — free-model 1.3.0 catalog identity/version/integrity fixes green; publish/catalog release still pending authorization.
- M7: NOT STARTED.
- M8: NOT STARTED; push, release, and issue close require explicit authorization.

## Agent reports

Agents must write a full report and diff/evidence file under this directory. A stage is not complete until an independent audit has returned SPEC PASS and QUALITY PASS, or every remaining finding has a recorded ruling.

## M0 evidence entry (2026-09-26, read-only verification)

- Report: `.trae/sdd/plan/s0-report.md`. Method: read-only commands only (`rev-parse`, `ls-tree`, `log`, `status`, `git ls-remote`, `curl` GET); no fetch/checkout/push/commit; no repo edits; protected untracked paths untouched.
- Baseline re-verified: `dsh_desktop` HEAD = `a9b90e254800dfe84c65c01d150a8596e94f6a31` on `feat/eac-ecosystem-m0-m8`, equals local `origin/main`; working tree clean except the 4 protected untracked paths, which match the ledger list exactly.
- `deepseek-ai/deepseek-harness` tag `dsh-v0.1.7-rc.2` verified = `477b4f420553e8a52c2fbccc464d7561b239c443` (ls-remote).
- `DSH-EAC/dsh-ui-skin-loader` release v1.0.0 (published 2026-09-26T01:32:53Z) verified with exactly 6 tgz assets: ui-skin-loader 1.0.0 + skins aurora / dragon-heir / inkwash / trading / whale-song, each 1.0.0.
- `DSH-EAC/dsh-mojobox` exists (default branch `main`) with no local clone in workspace; `DSH-EAC/dsh-eac-pack-installer` is absent/404 ("Repository not found") — must be created in M5. Also confirmed present: `dsh-ui-skin-loader-convention`, `zouyuxuan122/dsh-our-free-model`, `T-Auto/dsh-ecosystem-spec` (all default branch `main`).
- Skins at baseline: `dsh-desktop/assets/skins/` absent (removal commit `6687b40`, ancestor of HEAD — #415 reference); `dsh-desktop/assets/plugins/dsh-skin-switch/` still tracked (4 files) — M2 removal target. Actual `assets/plugins/` set is 14 plugins, not the plan's historical ~45+.
- Milestone status unchanged: M0 DONE (this verification); M1–M8 NOT STARTED.

## Stage 1 (kernel rc2) — COMPLETE

- Branch commit: see `git log feat/eac-ecosystem-m0-m8` (kernel-upgrade commit made 2026-09-26, local only, NOT pushed)
- Tag pin verified: dsh-v0.1.7-rc.2 → 477b4f420553e8a52c2fbccc464d7561b239c443
- Vendor built: 323 tarballs; package.json/lock rewired; installed kernel probe = 0.1.7-rc.2
- Tests: npm test 180/180 green; drift gate green; plugin-kernel-compat green
- Reports: s1-kernel-report.md / s1-kernel-diff.txt
- Deferred: staged-runtime smoke + tauri artifacts to M8; patch-deps skipped anchors to M2+ re-eval

## Parallel agent outcomes (2026-09-26)

- M4 Mojobox: DONE_WITH_CONCERNS — clone `D:\DeepSeek Harness\dsh max\dsh-mojobox` (main @ d76f5ea, local only); 21 catalog records, eac.recommended.v1 pack+lock (archify 0.1.0 only lockable member), 7 Level-1 evidence, coverage doc + guard script; npm test green; .dshpack built+reproducible (sha256 3e58939e…). Builtin/skins/free-model packs remain draft/source-pending (no publishable npm artifacts exist yet). Reports: s4-mojobox-report.md / s4-mojobox-diff.txt
- M6 free-model: DONE_WITH_CONCERNS — `D:\our free model\dsh-our-free-model` modified, uncommitted; adapter/kernel.js seam; managed-install mode stands down self-updater/announcements; manifest 0.15 + provenance/integrity records catalog-ready (no invented hashes); npm test 16/16 + tsc clean. Not yet in Mojobox catalog; no release digest. Reports: s6-free-model-report.md / s6-free-model-diff.txt

## Phase A/C (2026-09-27, closeout + live verification)

- **M7: SKIPPED** (user ruling: 收集素材阶段跳过).
- **Phase A COMPLETE (local only)**: all five repos committed, no push. Desktop `e620992` (M2/M3 closeout, 161 files) on `feat/eac-ecosystem-m0-m8`; loader `59d67b5` + tag v1.1.0; free-model `13dc267` + tag v1.3.0; mojobox `13e72e1`; installer `8a5816f` (git-init'd, tag v1.0.0). Protected untracked paths untouched.
- **Phase C COMPLETE**: live skin-switch verification done in real browser against staged runtime with isolated DSH_HOME (harness: `dsh-desktop/.verify/live-skin/live-boot.mjs`, untracked scratch). Two P0 regressions surfaced (invisible to the old server-side-only smokes) and fixed:
  1. kernel 0.1.7-rc.2 removed the `settingsScope` cordis service → dsh-compact/dsh-easy-setup never activated → web boot failure screen. Fixed by migrating both plugins to `configForms` (desktop `60a2dab`); drift gate `test/kernel-service-compat.test.ts` added (247/247 green).
  2. 5 generator-batch skins (miku/minecraft/qq98/ths/xp) shipped a CSS map scoped inside `apply()` while `cls` referenced it at module scope → activation threw ReferenceError, loader marked fault, miku left a V5 body-style residue. Fixed at source in loader repo (`2bc5da2`), 5 tgz repacked in `.verify/pkgs-v1.1.0-final/` (SHA256SUMS regenerated; **publish from that dir**), desktop assets synced, staged resources rebuilt.
- **A27/A28 MET**: 13/13 skins activate + deactivate with zero residue and zero console errors; deep-whale vs maid-atelier R3 coexistence visually clean (theme state restores byte-exact). Evidence: `.trae/sdd/plan/s9-phase-c-live-verification-report.md` + screenshots in `.verify/live-skin/`.
- **M8 still blocked on explicit user authorization** (push, releases, installer repo creation, Mojobox digest refresh incl. the 5 repacked skins, Tauri/NSIS build, issue close). A29 (Rust build chain) remains environment-blocked.

## Official-track smoke (2026-09-27, IN PROGRESS → handed over)

- NSIS app bundle BUILT locally: `tauri-shell/target/release/bundle/nsis/Deepseek Harness EAC_6.0.0_x64-setup.exe` (210.79 MiB, ~7min incremental; machine HAS Rust 1.98 — plan's "no Rust chain" is stale). Portable not yet made.
- Official-track real smoke ~80%: installer plugin installed into prepared isolated home via official `dsh plugin add`; found & locally worked around a REAL M5 defect (self-insert patch row + bundle membership double-registers the `eacPackInstaller` service → full boot failure screen on the official CLI install path); local HTTP catalog+tgz site ready; blocked on pluginManager service not mounting in the handmade home → plugins page shows "本部署没有可管理的 profile". Exact next steps + recovery commands: `.trae/sdd/plan/HANDOVER-2026-09-27-official-track-smoke.md`.
- M8 still fully gated on explicit user authorization.
