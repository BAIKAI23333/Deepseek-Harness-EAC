'use strict';

// 安装形态（v5.4 单发行版双形态）：同一个安装包，安装器选择「完整版 / 精简版」。
// 安装器（NSIS POSTINSTALL 钩子）把选择写入 <payload>/profile.txt（"full"/"lite"，
// 便携包默认缺省 = full），companion-sync 启动时读取并把它作为「新行默认值」
// —— 已有注册行不重写、用户选择优先（与配套行的 disabled 标记同一语义），因此
// 精简版用户随时可在「设置 → 插件 → 管理」启用完整功能。

import fs = require('node:fs');
import path = require('node:path');

export type InstallProfile = 'full' | 'lite';

export const PROFILE_MARKER_FILE = 'profile.txt';

/**
 * 精简版默认停用的配套插件（companion id）。
 *
 * 精简原则：只保留最简体验必需项 —— 修复核心体验（滚动/视口/设置）、安全
 * 兜底（保护中心/压缩/文件回退）、省钱（余额/峰谷）与市场管理；高门槛或重
 * 外围能力默认停用，全部可在设置页一键启用。
 *
 * ISO-005 收敛（当前为空数组）：停用对象只能是「随包的增强插件」，而随包面
 * 收敛后（装配面 BUILTIN_PLUGIN_DIRS 9 项 = COMPANION_PLUGINS 9 项）这 9 个
 * 全部是 ADR 0008 的 builtin（= onboarding CORE_PLUGIN_IDS），既被核心组锁定
 * 停用路径（plugin-ops 拒绝停用），本身又正是精简版要保留的项：
 *   viewport-lock 视口钳制 / settings-scroll-fix 设置滚动修复 /
 *   compact 请求压缩 / plugin-shield 保护中心 / unified-market 市场管理 /
 *   file-changes + client-file-changes 文件视图 / easy-setup 快速配置 /
 *   eac-locale-compat 界面底座。
 * 收敛前登记的 14 项（agent-teams / dsh-stt / dsh-phone / computer-user /
 * dsh-dafeiyu / offpeak / change-review …）自 v6 Task 3.1 起已不随包（.sync
 * 分级 recommended/external，市场按需安装），不再是本清单的合法成员 —— 它们
 * 的「装完默认禁用」由 L3 外部层规划承接（plugin-manager-state）。
 *
 * 约束（ISO-005 复核）：
 *  - 必须是 COMPANION_PLUGINS 的子集；
 *  - 不得命中 scripts/onboarding 的 CORE_PLUGIN_IDS（核心组锁定停用路径，
 *    核心插件即便在精简版也保持默认启用 —— 如 compact）。
 * 当前 9 项随包插件全部落在上述两条约束内，故清单为空；将来有「随包但默认关」
 * 的增强插件接回时在此登记。
 */
export const LITE_DEFAULT_DISABLED: readonly string[] = [];

export function isLiteDisabled(id: string, profile: InstallProfile): boolean {
  return profile === 'lite' && LITE_DEFAULT_DISABLED.includes(id);
}

/** 读取安装形态标记：缺失 / 脏值 / 读失败一律回退 full（永不阻塞启动）。 */
export function readInstallProfile(appRoot: string): InstallProfile {
  try {
    const raw = fs.readFileSync(path.join(appRoot, PROFILE_MARKER_FILE), 'utf8');
    return raw.trim() === 'lite' ? 'lite' : 'full';
  } catch {
    return 'full';
  }
}
