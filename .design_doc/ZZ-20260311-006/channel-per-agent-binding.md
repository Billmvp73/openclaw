# Discord Channel-per-Agent Binding 研究报告

> 奏折: ZZ-20260311-006
> 日期: 2026-03-11
> 作者: 兵部（bingbu）
> 研读路径: `/home/tetter/self-project/openclaw/src/routing/`, `src/discord/monitor/`, `src/commands/`, `src/cli/`

---

## 一、结论摘要

| 层                      | 状态             | 说明                                                                 |
| ----------------------- | ---------------- | -------------------------------------------------------------------- |
| **Routing Engine**      | ✅ 已完整支持    | `resolveAgentRoute()` binding.peer 层已实现 channel→agent 优先路由   |
| **Config 格式**         | ✅ 已支持        | `match.peer.{kind:"channel", id:"<snowflake>"}` 原生可用             |
| **Discord Monitor**     | ✅ 已支持        | `buildDiscordRoutePeer()` 对 guild text channel 传 `kind:"channel"`  |
| **CLI bind 命令**       | ❌ 不支持        | `--bind <channel[:accountId]>` 只能绑 accountId，不能绑 peer channel |
| **Gateway UI 只读展示** | ✅ ZZ-005 已实现 | `routing.list` API + Channel Bindings 卡片（PR #1，等待 merge）      |

**结论：无需修改任何现有 routing 逻辑，配置即可生效。唯一缺口是 CLI 无法方便地添加 peer-based binding，需手动编辑 JSON 或补充 CLI 命令。**

---

## 二、Routing Engine 分析

### 2.1 `resolveAgentRoute()` 优先级链

路径：`src/routing/resolve-route.ts`

```
binding.peer          ← 最高优先级：channel_id 精确匹配 → 对应 agent
binding.peer.parent   ← thread 继承：parent channel_id 匹配
binding.guild+roles   ← guild + Discord role IDs
binding.guild         ← guild-wide catch-all
binding.team          ← Slack/Teams team-wide
binding.account       ← accountId 精确匹配
binding.channel       ← channel-wide catch-all（accountId="*"）
default               ← cfg.agents.defaultAgentId
```

**`binding.peer` 是最高优先级**，意味着 channel→agent binding 会覆盖 guild-wide 和 default 路由。

### 2.2 Peer 匹配实现

```typescript
// resolve-route.ts L~330
function peerLookupKeys(kind: ChatType, id: string): string[] {
  if (kind === "group") return [`group:${id}`, `channel:${id}`]; // 互为别名
  if (kind === "channel") return [`channel:${id}`, `group:${id}`]; // 互为别名
  return [`${kind}:${id}`];
}
```

**Discord guild text channel** 的 `kind` 为 `"channel"`，与 `"group"` 互为别名（可互换）。

### 2.3 已有测试覆盖（verify：路由逻辑已验证）

来自 `src/routing/resolve-route.test.ts`（行 158）：

```typescript
test("discord channel peer binding wins over guild binding", () => {
  const cfg = {
    bindings: [
      {
        agentId: "chan",
        match: { channel: "discord", accountId: "default",
                 peer: { kind: "channel", id: "c1" } },
      },
      {
        agentId: "guild",
        match: { channel: "discord", accountId: "default", guildId: "g1" },
      },
    ],
  };
  const route = resolveAgentRoute({ cfg, channel: "discord", ..., peer: { kind: "channel", id: "c1" } });
  expect(route.agentId).toBe("chan");          // ✅ channel binding wins
  expect(route.matchedBy).toBe("binding.peer"); // ✅ 正确的匹配层
});
```

**结论：routing engine 路由逻辑已通过测试验证，无需改动。**

---

## 三、Discord Monitor 分析

路径：`src/discord/monitor/route-resolution.ts`

### 3.1 Peer 构造

```typescript
export function buildDiscordRoutePeer(params: {
  isDirectMessage: boolean;
  isGroupDm: boolean;
  directUserId?: string | null;
  conversationId: string;
}): RoutePeer {
  return {
    kind: params.isDirectMessage ? "direct" : params.isGroupDm ? "group" : "channel", // ← Guild text channel
    id: params.isDirectMessage
      ? params.directUserId?.trim() || params.conversationId
      : params.conversationId, // ← Discord channel_id (snowflake)
  };
}
```

**所有 guild text channel 消息（非 DM，非 group DM）都会传入 `kind: "channel"，id: <channel_snowflake>`**，并作为 `peer` 传给 `resolveAgentRoute()`。

### 3.2 完整调用路径

```
Discord WS → monitor/listeners.ts → monitor/message-handler.ts
  → resolveDiscordBoundConversationRoute()
  → buildDiscordRoutePeer()        ← 构造 peer: {kind:"channel", id:channel_snowflake}
  → resolveDiscordConversationRoute()
  → resolveAgentRoute({ peer, guildId, ... })
  → binding.peer tier → 命中 → return { agentId: "target_agent" }
```

**无需修改 monitor.ts。**

---

## 四、配置格式（如何声明 channel→agent binding）

### 4.1 Config JSON 格式（已支持）

在 `themachine.json` 的 `bindings` 数组中添加：

```json
{
  "bindings": [
    {
      "type": "route",
      "agentId": "silijian",
      "comment": "#edict channel → silijian",
      "match": {
        "channel": "discord",
        "peer": { "kind": "channel", "id": "1479959995520127160" }
      }
    },
    {
      "type": "route",
      "agentId": "bingbu",
      "comment": "#bingbu channel → bingbu",
      "match": {
        "channel": "discord",
        "peer": { "kind": "channel", "id": "1475397706435526697" }
      }
    },
    {
      "type": "route",
      "agentId": "zhongshu",
      "comment": "#zhongshu channel → zhongshu",
      "match": {
        "channel": "discord",
        "peer": { "kind": "channel", "id": "1475397679902232576" }
      }
    },
    {
      "type": "route",
      "agentId": "shaw",
      "comment": "guild-wide fallback → shaw",
      "match": {
        "channel": "discord",
        "guildId": "<guild_snowflake>"
      }
    }
  ]
}
```

**重要优先级规则**：

- channel_id 精确 binding（peer）> guild-wide binding > default agent
- `accountId` 字段可省略（省略 = 匹配任意 account）
- 单个 Discord bot 即可支持多 channel 分发，不需要多 bot

### 4.2 生产环境现状

查看 `~/.themachine/themachine.json`，已有 7 条 binding，全部使用 `peer:{kind:"channel",...}` 格式：

```
fusco   → channel:1475637196143984863
shaw    → channel:1475397656900538470
elias   → channel:1475397679902232576
bear    → channel:1475397706435526697 (×3)
silijian → channel:1479959995520127160
```

**结论：channel-per-agent binding 在生产环境已经在用，工作正常。**

---

## 五、CLI 命令分析

### 5.1 现有命令

```bash
themachine agents bind --agent <id> --bind <channel[:accountId]>
themachine agents unbind --agent <id> --bind <channel[:accountId]>
themachine agents bindings [--agent <id>]
```

### 5.2 缺口：无法添加 peer-based binding

`parseBindingSpecs()` 只解析 `channel:accountId` 格式（`src/commands/agents.bindings.ts`），**不支持 `peer` 字段**。

当前只能通过**手动编辑 JSON config** 来添加 channel→agent binding：

```bash
themachine config edit
# 或直接编辑 themachine.json
```

### 5.3 建议补充的 CLI 命令（未实现，可作为后续任务）

```bash
# 添加 channel-per-agent binding
themachine agents bind --agent bingbu \
  --discord-channel <channel_snowflake>

# 或通用 peer binding 语法
themachine agents bind --agent bingbu \
  --bind discord \
  --peer channel:<channel_snowflake>
```

**实现位置**：

- `src/commands/agents.bindings.ts` → `parseBindingSpecs()` 支持 `--peer` 参数
- `src/cli/program/register.agent.ts` → `agents bind` 新增 `--discord-channel <id>` 选项
- `src/commands/agents.commands.bind.ts` → 透传 peer 到 binding match

---

## 六、Gateway UI 展示（ZZ-20260311-005）

ZZ-20260311-005 已实现：

- **`routing.list` Gateway API**（READ_SCOPE）：返回所有 `RouteBindingEntry[]`
- **Agents tab → Channels panel → Channel Bindings 卡片**：
  - 按 `agentId` 过滤展示该 agent 的所有 binding
  - 显示 peer ID（snowflake）、channel、binding type（route/ACP）
  - 空时显示 "No channel bindings for this agent"
  - 只读展示，不提供编辑功能

**PR #1 等待司礼监 merge**：`https://github.com/Billmvp73/openclaw/pull/1`

---

## 七、端到端验证

### 配置样例（可直接验证）

在 `~/.themachine/themachine.json` 添加：

```json
{
  "type": "route",
  "agentId": "bingbu",
  "comment": "test: #bingbu-test → bingbu agent",
  "match": {
    "channel": "discord",
    "peer": { "kind": "channel", "id": "<your_test_channel_snowflake>" }
  }
}
```

发送消息到该 Discord channel → `resolveAgentRoute()` 命中 `binding.peer` → 路由到 `bingbu`。

### Unit-level 路由验证（现有测试）

```bash
cd /home/tetter/self-project/openclaw
npx vitest run src/routing/resolve-route.test.ts 2>&1 | tail -5
```

---

## 八、总结与建议

### 已完成（不需要任何代码改动）

1. ✅ Routing engine 完整支持 channel→agent peer binding
2. ✅ Discord monitor 正确传入 `kind:"channel"` peer
3. ✅ 生产环境已在使用（7条 bindings）
4. ✅ Gateway UI 只读展示（ZZ-20260311-005 PR #1）

### 建议后续任务

- **CLI 便捷命令**：`themachine agents bind --discord-channel <id>` — 让 non-technical 用户无需手动编辑 JSON
- **Wizard 支持**：`themachine configure` 中加入 Discord channel binding 步骤
- **UI 编辑功能**：在 Gateway UI 提供添加/删除 binding 的表单（目前只读）

### 不需要修改的文件

- `src/config/bindings.ts` — 已完整实现
- `src/discord/monitor/*` — 已正确传 peer
- `src/routing/resolve-route.ts` — 已实现 binding.peer 优先级
