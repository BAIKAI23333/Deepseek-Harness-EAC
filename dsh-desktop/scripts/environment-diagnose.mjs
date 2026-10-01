#!/usr/bin/env node
'use strict';
// 环境诊断 / 清理的一次性脚本（P1 自愈链路，形态 1）。
//
// 为什么需要独立脚本：环境 fail-closed 时 **sidecar 已经退场**（process.exit(2)），
// bridge 与它的 RPC 一起没了，`/died` 页无法再通过 bridge 调 environment.status。
// 因此 L1 壳需要一条「不依赖 sidecar 存活」的诊断/清理通道。
//
// 分工（严格遵守 ADR 0002 分层与核心红线）：
//   - 本脚本**不实现**任何环境治理逻辑：注册表、清单、锁、删除全部走 dsh-dpx。
//   - 它只是 `lib/desktop/environment.ts` 适配层的一个 CLI 外壳：读参数 → 调
//     适配层 → 把结果打成一行 JSON 到 stdout。
//   - L1 壳只 spawn 本脚本并转发 JSON，不解析业务字段（不复制业务逻辑）。
//
// 用法：
//   node environment-diagnose.mjs --action=status
//   node environment-diagnose.mjs --action=plan    --purge        # dry run，不落盘
//   node environment-diagnose.mjs --action=remove  --purge        # 显式清理
//   node environment-diagnose.mjs --action=repair                 # 幂等重新确保
//
// 输出（stdout 单行 JSON）：
//   { ok: true,  action, isolation: {...}, diagnosis: {...} }
//   { ok: false, action, error: "..." }        # 失败也以 JSON 输出，退出码非 0
//
// 安全：本脚本**不会**自动执行任何删除。删除只在 `--action=remove` 且
// 调用方（用户点击）显式传入 `--purge` 时发生，且仍要过 dpx 的
// 「已登记才可移除」校验 —— 未登记目录一律拒绝。

import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

function parseArgs(argv) {
  const actionArg = argv.find((arg) => arg.startsWith('--action='));
  return {
    action: actionArg ? actionArg.slice('--action='.length) : 'status',
    purge: argv.includes('--purge'),
  };
}

/** 定位适配层：打包态在 <resources>/dsh-desktop/lib/desktop/，开发态在仓库里。 */
function loadEnvironmentModule() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // 1) 随包布局：scripts/ 与 lib/ 同在 dsh-desktop 下。
  const packaged = path.resolve(here, '..', 'lib', 'desktop', 'environment.js');
  // 2) 开发态（本脚本直接在 dsh-desktop/scripts 下运行时同 1；这里是兜底）。
  const development = path.resolve(here, '..', '..', 'dsh-desktop', 'lib', 'desktop', 'environment.js');
  for (const candidate of [packaged, development]) {
    try {
      return require(candidate);
    } catch (error) {
      if (error && error.code !== 'MODULE_NOT_FOUND') throw error;
    }
  }
  throw new Error('无法加载 environment.js（dsh-desktop/lib/desktop/environment.js 缺失）');
}

function isolationIdentity(environment) {
  return {
    productRoot: environment.environmentProductRoot(),
    storageRoot: environment.environmentStorageRoot(),
    registryHome: environment.environmentRegistryHome(),
    name: environment.environmentName(),
    channel: environment.environmentChannel(),
    root: environment.environmentRoot(),
    activeRoot: environment.activeEnvironmentRoot(),
  };
}

function main() {
  const { action, purge } = parseArgs(process.argv.slice(2));
  const environment = loadEnvironmentModule();
  const isolation = isolationIdentity(environment);

  if (action === 'status') {
    // 只读诊断。诊断本身**不因损坏而抛出** —— 损坏正是它要报告的内容。
    return { ok: true, action, isolation, diagnosis: environment.diagnoseEacEnvironment() };
  }
  if (action === 'plan') {
    // dry run：给用户看清"会删什么"，不落盘。
    return {
      ok: true,
      action,
      isolation,
      remove: environment.removeEacEnvironment({ purge, dryRun: true }),
      diagnosis: environment.diagnoseEacEnvironment(),
    };
  }
  if (action === 'remove') {
    // 显式清理：仍由 dpx 校验「已登记才可移除」。
    return {
      ok: true,
      action,
      isolation,
      remove: environment.removeEacEnvironment({ purge }),
    };
  }
  if (action === 'repair') {
    // 幂等重新确保（不重写注册表 —— 那是 dpx 的事）。
    const ensured = environment.ensureEacEnvironment();
    return {
      ok: true,
      action,
      isolation,
      repaired: {
        root: ensured.paths.root,
        dshHome: ensured.paths.dshHome,
        rootExistedBefore: ensured.rootExistedBefore,
      },
    };
  }
  throw new Error(`未知 action：${action}（可用：status / plan / remove / repair）`);
}

try {
  const result = main();
  process.stdout.write(JSON.stringify(result));
  process.exit(0);
} catch (error) {
  // 失败也以 JSON 输出：L1 壳据此在 /died 页显示可读原因，而不是空态。
  const message = String((error && error.message) || error);
  process.stdout.write(JSON.stringify({ ok: false, action: parseArgs(process.argv.slice(2)).action, error: message }));
  process.exit(1);
}
