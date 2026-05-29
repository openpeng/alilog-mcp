# Skills 使用指南

本项目提供以下 MCP 工具技能，用于操作阿里云日志服务 (SLS)。

## 技能列表

### aliyun-sls-logs

**触发场景：** 用户需要查日志、排查错误、追踪请求链路、查看服务运行状态时使用。

**包含工具：**

| 工具 | 说明 |
|------|------|
| `sls_query_logs` | 查询日志（支持关键字和 SQL 两种模式） |
| `sls_tail_logs` | 获取最近 N 条日志（快速查看当前状态） |
| `sls_list_projects` | 列出 SLS 项目（支持模糊搜索） |
| `sls_list_logstores` | 列出 logstore（支持模糊搜索） |
| `sls_get_credentials` | 验证当前凭证配置 |

---

## 日志查询决策流程（核心）

当用户要求查日志时，按以下三步操作：

### Step 1: 识别环境 → 映射 Project

从用户描述中提取环境关键词，直接映射到 project（不需要调用工具）：

| 用户关键词 | project |
|-----------|---------|
| 正式 / 生产 / prod / 线上 | `<生产环境 project>` |
| 测试 / test / 测试环境 | `<测试环境 project>` |
| 预发 / pre | `<预发环境 project>` |
| 开发 / dev / 开发环境 | `<开发环境 project>` |

> 具体映射值请在 `.kiro/skills/aliyun-sls-logs.md` 中维护。
> 如果用户未指定环境，主动询问；如果上下文明确则直接使用。

### Step 2: 识别服务 → 动态查找 LogStore

用用户提到的服务名作为 filter 查询：

```
sls_list_logstores(project="<Step1的project>", filter="<服务关键词>")
```

从结果中匹配最相关的 logStore。命名规则参考：
- 测试环境：`test-{团队}-{服务名}`，如 `test-sail-ep-backend`
- 开发环境：`dev-{团队}-{服务名}`，如 `dev-onepieceplus-thor`
- 生产环境：`{团队}-{服务名}` 或类似格式

### Step 3: 执行查询

根据用户意图选择查询方式：

| 用户意图 | 操作 |
|---------|------|
| 看看有没有报错 | `sls_query_logs(query="level:ERROR", fromMinutesAgo=15)` |
| 看看当前状态 | `sls_tail_logs(lastMinutes=5)` |
| 追踪某个请求 | `sls_query_logs(query="traceId:xxx", fromMinutesAgo=60)` |
| 统计错误分布 | `sls_query_logs(query="level:ERROR \| select ...", fast=false)` |

### 完整示例

```
用户："查下测试环境 ep-backend 的报错"

Step 1: "测试环境" → 查映射表得到 project
Step 2: sls_list_logstores(project="<测试环境project>", filter="ep-backend")
        → 匹配到 test-sail-ep-backend
Step 3: sls_query_logs(project=..., logStore="test-sail-ep-backend", query="level:ERROR", fromMinutesAgo=30)
```

---

## 典型使用流程

### 1. 定位服务

不确定日志在哪个 project / logstore 时，先模糊搜索：

```
sls_list_projects(filter="关键字")
sls_list_logstores(project="your-project", filter="服务名")
```

### 2. 快速查看近况

```
sls_tail_logs(project="your-project", logStore="your-logstore", lastMinutes=5)
```

### 3. 精确查询

```
sls_query_logs(query="level:ERROR AND serviceName:order-service", fromMinutesAgo=30)
```

### 4. 链路追踪

```
sls_query_logs(query="traceId:abc123def456", fromMinutesAgo=60)
```

### 5. 统计分析（SQL 模式）

```
sls_query_logs(query="* | select level, count(*) as cnt group by level order by cnt desc", fast=false, fromMinutesAgo=60)
```

---

## 查询优化要点

| 要点 | 说明 |
|------|------|
| 默认用 `fast=true` | 关键字查询走 GetLogs，速度快 |
| SQL 用 `fast=false` | 仅在需要 `| select ...` 聚合时切换 |
| 缩小时间范围 | `fromMinutesAgo` 越小越快，避免全量扫描 |
| 精确字段过滤 | `level:ERROR`、`traceId:xxx` 比 `*` 快得多 |
| 分页获取 | 单次最多 100 条，用 `offset` 翻页 |
| 避免大范围 `*` | 24h 全量扫描会非常慢 |

---

## 环境配置

### 安装

```bash
npm install -g @openpeng/alilog-mcp
```

### MCP Server 接入配置

在 Claude Desktop / Kiro / settings.json 中添加：

```json
{
  "mcpServers": {
    "aliyun": {
      "command": "npx",
      "args": ["@openpeng/alilog-mcp"],
      "env": {
        "CRED_SOURCE": "consul",
        "CONSUL_URL": "https://your-consul-url"
      }
    }
  }
}
```

### 凭证来源

通过 `CRED_SOURCE` 环境变量切换：

| 模式 | 说明 | 适用场景 |
|------|------|----------|
| `consul`（默认） | 从 Consul KV 获取 AK/SK | 共享开发环境 |
| `env` | 从环境变量读取 | CI/CD、本地覆盖 |
| `static` | 同 env，启动时加载一次 | 固定配置场景 |

#### Consul 模式环境变量

```env
CRED_SOURCE=consul
CONSUL_URL=https://your-consul-url
CONSUL_TOKEN=
CONSUL_PATH_ENDPOINT=your/path/ALI_SLS_ENDPOINT
CONSUL_PATH_AK_ID=your/path/ALI_SLS_ACCESS_KEY_ID
CONSUL_PATH_AK_SECRET=your/path/ALI_SLS_ACCESS_KEY_SECRET
CONSUL_PATH_PROJECT=your/path/ALI_SLS_PROJECT
CONSUL_PATH_LOGSTORE=your/path/ALI_SLS_LOGSTORE
```

#### Env / Static 模式环境变量

```env
CRED_SOURCE=env
ALI_SLS_ENDPOINT=cn-hangzhou.log.aliyuncs.com
ALI_SLS_ACCESS_KEY_ID=your-ak-id
ALI_SLS_ACCESS_KEY_SECRET=your-ak-secret
ALI_SLS_PROJECT=your-project
ALI_SLS_LOGSTORE=your-logstore
```

---

## 故障排查示例

### 某服务报 500 错误

```
sls_list_logstores(project="your-project", filter="order")
sls_query_logs(query="status:500 AND serviceName:order-service", project="your-project", logStore="order-logstore", fromMinutesAgo=30)
```

### OOM 排查

```
sls_query_logs(query="OutOfMemoryError", fromMinutesAgo=120)
```

### 慢查询定位

```
sls_query_logs(query="* | select requestUri, avg(rt) as avg_rt group by requestUri having avg_rt > 3000 order by avg_rt desc limit 20", fast=false, fromMinutesAgo=60)
```

### 验证凭证是否正常

```
sls_get_credentials()
```
