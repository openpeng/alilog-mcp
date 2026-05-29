---
name: aliyun-sls-logs
description: 查询阿里云 SLS 日志，排查错误、追踪请求、查看服务状态。当用户要求查日志、找报错、追踪链路时使用。
---

# Aliyun SLS 日志查询

## 可用工具

| 工具 | 说明 | 使用场景 |
|------|------|----------|
| `sls_query_logs` | 查询日志（关键字 / SQL） | 搜索错误、关键字、traceId |
| `sls_tail_logs` | 获取最近 N 条日志 | 快速查看当前状态 |
| `sls_list_projects` | 列出 SLS 项目（模糊搜索） | 定位服务所属项目 |
| `sls_list_logstores` | 列出 logstore（模糊搜索） | 定位服务的日志存储 |
| `sls_get_credentials` | 显示当前凭证配置（脱敏） | 验证配置是否正确 |

## 日志查询决策流程

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

命名规则参考：
- 测试环境：`test-{团队}-{服务名}`
- 开发环境：`dev-{团队}-{服务名}`
- 生产环境：`{团队}-{服务名}` 或类似格式

### Step 3: 执行查询

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

## 常用查询模式

### 关键字查询（fast=true，默认）
```
sls_query_logs(query="level:ERROR", fromMinutesAgo=15)
sls_query_logs(query="OutOfMemoryError", fromMinutesAgo=60)
sls_query_logs(query="userId:12345 AND status:500", fromMinutesAgo=30)
```

### SQL 聚合（fast=false）
```
sls_query_logs(query="* | select level, count(*) as cnt group by level", fast=false, fromMinutesAgo=60)
sls_query_logs(query="level:ERROR | select serviceName, count(*) as cnt group by serviceName order by cnt desc limit 10", fast=false)
```

### 时间范围
```
sls_query_logs(query="Exception", fromMinutesAgo=120, toMinutesAgo=60)
```

### 分页
```
sls_query_logs(query="level:ERROR", line=100, offset=0)
sls_query_logs(query="level:ERROR", line=100, offset=100)
```

## 性能要点

- 默认用 `fast=true`，仅 SQL 聚合时切 `fast=false`
- 缩小 `fromMinutesAgo`，避免大范围扫描
- 用精确字段过滤（`level:ERROR`、`traceId:xxx`）而非 `*`
- 单次最多 100 条，用 `offset` 翻页

## 安装与配置

```bash
npm install -g @openpeng/alilog-mcp
```

MCP 接入配置：

```json
{
  "mcpServers": {
    "aliyun-log": {
      "command": "npx",
      "args": ["-y", "@openpeng/alilog-mcp"],
      "env": {
        "CRED_SOURCE": "consul",
        "CONSUL_URL": "https://your-consul-url"
      }
    }
  }
}
```

凭证模式：

| 模式 | 说明 | 适用场景 |
|------|------|----------|
| `consul`（默认） | 从 Consul KV 获取 AK/SK | 共享开发环境 |
| `env` | 从环境变量读取 | CI/CD、本地覆盖 |
| `static` | 同 env，启动时加载一次 | 固定配置场景 |
