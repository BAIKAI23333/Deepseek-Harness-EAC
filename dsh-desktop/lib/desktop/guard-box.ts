'use strict';

// 插件保护中心入口（ADR 0002 L2 业务服务层；Wave 1 自 guard-box.js 类型化迁出）：
// 快照 / 回滚 / 静态体检 / 自动修复 / 守护启动 / 事故报告。
// 实例延迟创建（依赖 dshHome 与 settings 就绪）。

// CJS 直译导入：emit 结果与手写 require 逐行一致，避免 importStar 样板。
import path = require('node:path');
import os = require('node:os');

import guard = require('../../plugin-guard');
const { createGuard } = guard;

/** 注入接口：由宿主（Electron main / Tauri sidecar）在启动时提供。 */
export interface GuardBoxCtx {
  log(tag: string, msg: string): void;
  getDshHome(): string | null;
  getDesktopProfile(): string;
  getDshBin(): string;
}

/** 静态体检发现项（与 plugin-guard.ts 的 Finding 同形态）。 */
export interface Finding {
  code: string;
  severity: 'high' | 'medium' | 'low';
  message: string;
  fixable: boolean;
}

/** 保护中心快照档案（对应 plugin-guard 的 meta.json 形态）。 */
export interface GuardSnapshot {
  id: string;
  reason: string;
  at: string;
  files: string[];
  pluginRows: string[];
}

export type GuardInstance = ReturnType<typeof guard.createGuard>;

let ctx!: GuardBoxCtx;

export function init(d: GuardBoxCtx): void {
  ctx = d;
}

let guardInstance: GuardInstance | null = null;

export function ensureGuard(): GuardInstance {
  if (!guardInstance) {
    guardInstance = createGuard({
      getHome: () => ctx.getDshHome() || path.join(os.homedir(), '.dsh'),
      getProfile: () => ctx.getDesktopProfile(),
      dshBin: () => ctx.getDshBin(),
      log: ctx.log,
    });
  }
  return guardInstance;
}

type RestoreOutcome = NonNullable<ReturnType<GuardInstance['lastRestore']>>;
type RestoreCode = RestoreOutcome['code'];
export interface RestoreServiceDeps {
  guard: Pick<GuardInstance, 'prepareRestore' | 'recordRestore'>;
  stop(): Promise<void>;
  start(): Promise<{webUrl: string; port: number}>;
  isQuitting(): boolean;
  setIsRestarting(value: boolean): void;
}
export type RestoreTransactionResult = RestoreOutcome & {
  error?: RestoreCode;
  serviceStopped: boolean;
  statusSaved?: boolean;
  webUrl?: string;
  port?: number;
};

/** 配置事务归属L2；启动只消费恢复配置，不做preBootSync或overlay错误归因。 */
export async function restoreAndRestart(d: RestoreServiceDeps, value: unknown): Promise<RestoreTransactionResult> {
  const id = typeof value === 'string' && /^[a-zA-Z0-9][\w.-]{0,159}$/.test(value) ? value : '';
  const result = (code: RestoreCode, extra: Partial<RestoreTransactionResult> = {}): RestoreTransactionResult => ({
    snapshotId: id, at: new Date().toISOString(), phase: code === 'restore-cancelled' ? 'cancelled' : 'failed',
    code, error: code, ok: false, serviceStopped: false, ...extra,
  });
  if (!id) return result('invalid-snapshot');
  if (d.isQuitting()) return result('restore-cancelled');
  let prepared: ReturnType<GuardInstance['prepareRestore']>;
  try { prepared = d.guard.prepareRestore(id); } catch { return result('invalid-snapshot'); }
  let backupId: string | undefined;
  const persist = (r: RestoreOutcome): void => d.guard.recordRestore(r);
  const pending = (): RestoreOutcome => ({snapshotId: id, at: new Date().toISOString(), phase: 'pending',
    code: 'restore-in-progress', ok: false, ...(backupId ? {backupId} : {})});
  try { persist(pending()); } catch { return result('restore-status-write-failed'); }
  const finish = (code: RestoreCode, extra: Partial<RestoreTransactionResult> = {}): RestoreTransactionResult => {
    const r = result(code, {...(backupId ? {backupId} : {}), ...extra});
    try { persist(r); return {...r, statusSaved: true}; } catch {
      return {...r, code: 'restore-status-write-failed', error: 'restore-status-write-failed', statusSaved: false};
    }
  };
  const recover = async (code: RestoreCode, undo: boolean): Promise<RestoreTransactionResult> => {
    try { await d.stop(); } catch { return finish('restore-recovery-stop-unconfirmed'); }
    if (undo) {
      try { if (!prepared.undo().ok) return finish('restore-undo-failed', {serviceStopped: true, configurationRestored: false}); }
      catch { return finish('restore-undo-failed', {serviceStopped: true, configurationRestored: false}); }
    }
    if (d.isQuitting()) return finish('restore-cancelled', {serviceStopped: true, configurationRestored: true});
    let ready: {webUrl: string; port: number};
    try { ready = await d.start(); } catch {
      try { await d.stop(); } catch { return finish('restore-recovery-stop-unconfirmed', {configurationRestored: true}); }
      return finish(d.isQuitting() ? 'restore-cancelled' : 'restore-recovery-start-failed', {
        serviceStopped: true, configurationRestored: true, recovered: false,
      });
    }
    if (d.isQuitting()) {
      try { await d.stop(); } catch { return finish('restore-recovery-stop-unconfirmed', {configurationRestored: true}); }
      return finish('restore-cancelled', {serviceStopped: true, configurationRestored: true});
    }
    return finish(code, {...ready, recovered: true, configurationRestored: true});
  };
  d.setIsRestarting(true);
  try {
    try { await d.stop(); } catch { return finish('service-stop-unconfirmed', {configurationRestored: true}); }
    if (d.isQuitting()) return finish('restore-cancelled', {serviceStopped: true, configurationRestored: true});
    let applied: ReturnType<typeof prepared.apply>;
    try { applied = prepared.apply(); } catch { return await recover('restore-apply-failed', true); }
    backupId = applied.backupId;
    if (!applied.ok) {
      if (applied.recovered !== true) return finish('restore-undo-failed', {serviceStopped: true, configurationRestored: false});
      return await recover('restore-apply-failed', false);
    }
    try { persist(pending()); } catch { return await recover('restore-status-write-failed', true); }
    if (d.isQuitting()) return await recover('restore-cancelled', true);
    let ready: {webUrl: string; port: number};
    try { ready = await d.start(); } catch { return await recover('restore-start-failed', true); }
    if (d.isQuitting()) return await recover('restore-cancelled', true);
    const success: RestoreOutcome = {snapshotId: id, at: new Date().toISOString(), phase: 'succeeded',
      code: 'restore-succeeded', ok: true, ...(backupId ? {backupId} : {})};
    try { persist(success); } catch { return await recover('restore-status-write-failed', true); }
    return {...success, ...ready, serviceStopped: false, statusSaved: true};
  } finally { d.setIsRestarting(false); }
}
