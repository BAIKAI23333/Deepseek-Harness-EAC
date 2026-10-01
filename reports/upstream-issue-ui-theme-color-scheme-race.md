# [ui-theme] 快速切换深浅色时 UI 来回闪（adopt() 无时序守卫）

## 环境

- 包：`@deepseek-ai/dsh-client-ui-theme@0.1.7-rc.2`
- 内核：`@deepseek-ai/dsh@0.1.7-rc.2`
- 平台：Windows x64（Tauri 壳内 WebView2，但**与壳无关** —— 纯客户端主题逻辑）
- 宿主：Deepseek Harness EAC（Tauri 桌面客户端），L3 内核零修改

## 现象

在外观设置里**快速连续点击**深浅色切换（如 dark → light，或连点同一个 cube），界面有**概率来回闪**（先跳到目标色，随即闪回上一个色，再跳回）。

- **必须"快"**：慢速点击（等上一次生效）不会出现。
- **"刚点击时"概率最高**：即上一次写入尚未回读完成时。
- 影响**全局**（整个客户端界面），不只某个面板。

## 定位

### 相关代码（`lib/client.js`）

**① 偏好写入是同步的（@1411）**

```js
setTheme(id) {
  if (id !== "system" && !this.themes.some((t) => t.id === id)) throw new Error(...);
  if (this.preference === id) return;
  this.preference = id;
  if (isThemePreference(id)) this.host.set(THEME_PREFERENCE_FIELD, id);  // ← 写入 durable 文档
  this.publish();                                                       // ← emit theme/change
}
```

**② `publish()` 自增 revision 并同步 emit（@1515）**

```js
publish() {
  this.revision += 1;
  this.snapshot = this.buildSnapshot();
  this.ctx.emit("theme/change", this.snapshot);
}
```

**③ UI 侧有 revision 守卫（@1116）**

```js
actions: { sync: (d, preference, revision) => {
  if (revision <= d.revision) return;   // 丢弃更旧的 revision
  d.preference = preference;
  d.revision = revision;
} }
```

**④ 但 `adopt()` 没有守卫（@1429）**

```js
/** Adopt the scope's accepted durable preference without writing it back. */
adopt() {
  const section = this.host.getSnapshot().value;
  if (section === void 0) return;
  if (this.preference === section.preference && this.fontSize === section.fontSize) return;
  this.preference = section.preference;   // ← 无条件覆盖内存
  this.fontSize = section.fontSize;
  this.publish();                          // ← 再 emit，覆盖 UI
}
```

**⑤ `adopt()` 由 settings 文档的异步变更回调驱动（@1381）**

```js
ctx.effect(() => host.subscribe(() => {
  this.adopt();
}), "ui-theme: settings scope adoption");
```

### 竞态时序

```
t0  点击 dark   → setTheme('dark')  → host.set()（异步写文档）→ publish(rev=1)
t1  点击 light  → setTheme('light') → host.set()（异步写文档）→ publish(rev=2)
t2  文档变更回调（dark 那次先写、后回调）→ adopt()
      → 读文档得 preference='dark'
      → 无守卫，直接覆盖内存（此时内存已是 'light'）
      → publish() → UI 闪回 dark      ← 「来回闪」
t3  第二个回调到达 → adopt() → 又覆盖回 light → UI 再跳回
```

**关键**：`adopt()` 与 UI 的 `sync()` 不同，**没有 revision/序号/时间戳守卫**，因此无法区分"这次回调携带的偏好是新的还是过期的"。当两次异步写入的回调**乱序到达**时，旧值会覆盖新值。

### 为什么 `sync()` 的守卫救不了

`sync()` 保护的是 **UI 行组件**（AppearanceRow），它按 revision 丢弃旧快照。但 `adopt()` 是在 **ThemeRuntime 自身**上覆盖 `this.preference` 并重新 `publish()` —— 每次 `publish()` 都产生**更高的 revision**，所以 UI 侧会认为"这是新状态"而照单全收。守卫在错误的层级。

## 建议修法（供参考）

任选其一，核心都是**给 `adopt()` 加时序守卫**：

1. **偏好快照携带 revision**：让 settings 文档的 value 带上单调递增的 revision，`adopt()` 仅在 `snapshot.revision > this.appliedRevision` 时采纳（与 `sync()` 同一策略，但放在正确的层级）。
2. **忽略自己发起的回读**：`setTheme()` 写入时记录 `pendingPreference`，`adopt()` 若 `section.preference === pendingPreference` 则视为自己那次写入的回显，跳过覆盖。
3. **`setTheme()` 后短窗口内不 adopt**：写入后设 `suppressAdoptUntil` 时间戳/序号，窗口内忽略外部回读。

我倾向 **(1)**：与现有 `revision` 设计一致，且能正确处理多来源（不只本端写入，还有其它客户端/文档外部修改）的乱序。

## 复现步骤

1. 打开「设置 → 通用 → 外观」
2. 快速点击深/浅色 cube（间隔 < 回读延迟，约连点 3–5 次）
3. 观察界面在最终色与中间色之间闪回

**可复现性**：间歇性（依赖写盘/回读完成顺序），快速连点时概率显著上升。

## 影响

- 用户可见的视觉抖动（非数据损坏 —— 最终持久化的偏好是最后一次点击的值）
- 对"快速切换外观"这一常见操作体验有直接影响
- 与 Tauri 壳/客户端封装无关，纯客户端主题逻辑，上游修复即可

## 备注

我是从下游客户端（Deepseek Harness EAC）侧定位的，**未修改**该包任何代码（遵循不修改内核的约束）。上述行号基于 0.1.7-rc.2 的 `lib/client.js`（构建产物）。
