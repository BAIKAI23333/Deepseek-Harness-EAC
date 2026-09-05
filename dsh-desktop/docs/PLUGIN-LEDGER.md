# 插件来源台账（SOURCES.json）

> 数据源：`DSH_EAC_Plugin_Audit_2026-09-05.xlsx`（2026-09-05 全量外部审计，对照
> awesome-dsh-plugin 名录 pin `44ae0afa`，含 git blame / SHA-256 / 双版本差异证据）。
> 审计口径：**缺证据 ≠ 未修改**。台账继承该口径——不确定的来源明确标
> `unverified` / `unresolved`，绝不写成"已确认"。

## 是什么

`assets/SOURCES.json` 记录 main 与 aio-v1 两条版本线上**每一个组件**的来源、
上游钉址与审计结论。它是治理手册"插件溯源"要求的机器可读实现：

- 任何插件都能一句话回答：上游是谁、对应哪个版本、我们改了什么、证据在哪。
- 上游发版时按台账重放补丁（配合 `-eac.N` 版本后缀递增），而不是考古。
- CI 门禁：改动插件必须同步台账，新增目录必须带条目（`plugin-ledger.mjs`）。

## 校验

```sh
npm run ledger:check          # 本地 / CI
node scripts/plugin-ledger.mjs --report   # 只看汇总，跳过版本比对
```

校验内容：结构合法（枚举、必填、`(id,line)` 唯一）；main 线每个
package.json 的 `name`/`version` 与台账一致（**改版必须同步台账，否则 CI 红**）；
`assets/{plugins,skins,agent-presets,sdk-plugins}` 下无孤儿目录；
`origin=upstream` 必须有 `upstream.repository`，`unresolved` 必须有 `candidates`。

## 字段说明

| 字段 | 说明 |
| --- | --- |
| `line` | `main` 或 `aio-v1`（AIO 为本仓库 aio-v1 分支，seed 代码不在 Git 内） |
| `type` | `plugin` / `skin` / `preset` / `sdk-sample` / `source-copy` / `seed` / `host-fused` |
| `origin` | 见下方四分类 |
| `upstream.repository` | 上游仓库；`refType: version` 表示目前只钉到版本号，后续升级为 commit hash |
| `audit.*` | 审计结论：`verdict`（名录匹配情况）、`compare`（与上游基线比对）、`note`（改动摘要）、`basis`（溯源依据）、`conflict`（来源冲突） |
| `candidates` | 同名待确认的候选上游（仅 `unresolved`） |
| `credits` | 宿主融合改写的能力出处致谢（非复制来源） |
| `postAuditChanges` | 审计基线（e01d2e2a）之后的 EAC 变更标注 |
| `dualVersion` | main / aio-v1 两线版本关系与文件数差异 |

## origin 四分类

| 值 | 含义 | 数量（2026-09-05） |
| --- | --- | --- |
| `upstream` | 来源确认：名录命中，或 package.repository / README 明确署名 | 55 |
| `eac-original` | EAC 自研（含审计确认的宿主融合改写、预设模块、SDK 样例、@local/* seed） | 27 |
| `unresolved` | 同名候选存在但无法证明同源，**待维护者裁决** | 10 |
| `unverified` | 无上游线索，**待维护者裁决**（是否 EAC 原创） | 21 |

`unresolved` + `unverified` 共 31 项是台账的开放问题清单。裁决动作：
确认上游 → 改 `upstream` 并补 repository/commit；确认自研 → 改 `eac-original`。
改完后 `npm run ledger:check` 保持绿。

## 维护规则

1. **新增插件/皮肤/预设**：目录进 `assets/` 的同时必须加台账条目（含 origin 与
   证据），否则 CI 拒绝。
2. **升级插件版本**：更新 `version`，若是 fork 记得 `-eac.N` 递增，并在
   `audit.note` 追加一行变更摘要。
3. **阶段 2 计划**：`upstream.refType` 从 `version` 升级为 `commit`（首选
   GitHub hash，无则 npm release）；为组件补 dsh-plugin.json（v0.15 manifest，
   模板见 `assets/plugins/dsh-composer-dynamic-island`）。
4. 台账是唯一事实源：不要在 README/注册表里另写一份来源信息。
