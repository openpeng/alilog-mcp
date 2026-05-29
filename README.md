# aliyun-mcp

Aliyun MCP Server — 提供阿里云日志服务 (SLS) 的 MCP 工具，支持从 Consul 或环境变量加载凭证。

## 快速开始

```bash
npm install
npm run build
```

## 凭证配置

通过 `CRED_SOURCE` 环境变量选择凭证加载方式：

### Consul 模式（默认）

从 Consul KV 获取 AK/SK，适合共享开发环境。

```env
CRED_SOURCE=consul
CONSUL_URL=https://your-consul-url
CONSUL_TOKEN=                          # 无 token 留空即可
# 可选：覆盖默认 KV 路径
CONSUL_PATH_ENDPOINT=your/path/ALI_SLS_ENDPOINT
CONSUL_PATH_AK_ID=your/path/ALI_SLS_ACCESS_KEY_ID
CONSUL_PATH_AK_SECRET=your/path/ALI_SLS_ACCESS_KEY_SECRET
CONSUL_PATH_PROJECT=your/path/ALI_SLS_PROJECT
CONSUL_PATH_LOGSTORE=your/path/ALI_SLS_LOGSTORE
```

### Env 模式

直接从环境变量读取，适合 CI/CD 或本地覆盖。

```env
CRED_SOURCE=env
ALI_SLS_ENDPOINT=cn-hangzhou.log.aliyuncs.com
ALI_SLS_ACCESS_KEY_ID=xxx
ALI_SLS_ACCESS_KEY_SECRET=xxx
ALI_SLS_PROJECT=my-project
ALI_SLS_LOGSTORE=my-logstore           # 可选，默认 logstore
```

### Static 模式

与 env 相同，但凭证仅在启动时加载一次。

```env
CRED_SOURCE=static
ALI_SLS_ENDPOINT=cn-hangzhou.log.aliyuncs.com
ALI_SLS_ACCESS_KEY_ID=xxx
ALI_SLS_ACCESS_KEY_SECRET=xxx
ALI_SLS_PROJECT=my-project
ALI_SLS_LOGSTORE=my-logstore
```

## MCP 配置

在 Claude Desktop / Kiro / settings.json 中添加：

```json
{
  "mcpServers": {
    "aliyun": {
      "command": "node",
      "args": ["path/to/aliyun-mcp/dist/index.js"],
      "env": {
        "CRED_SOURCE": "consul",
        "CONSUL_URL": "https://your-consul-url"
      }
    }
  }
}
```

## 工具列表

| 工具 | 说明 | 使用场景 |
|------|------|----------|
| `sls_query_logs` | 查询日志，支持 SLS 查询语法和 SQL | 搜索错误、关键字、traceId |
| `sls_tail_logs` | 获取最近 N 条日志 | 快速查看当前状态 |
| `sls_list_projects` | 列出 SLS 项目（支持模糊搜索） | 定位服务所属项目 |
| `sls_list_logstores` | 列出项目下的 logstore（支持模糊搜索） | 定位服务的日志存储 |
| `sls_get_credentials` | 显示当前凭证配置（密钥脱敏） | 验证配置是否正确 |

## 查询优化

- **默认使用 `fast=true`** — 走 GetLogs 接口，关键字/字段查询速度快很多
- **仅在需要 SQL 聚合时用 `fast=false`** — 如 `* | select count(*) group by level`
- **缩小时间范围** — `fromMinutesAgo` 越小扫描量越少，查询越快
- **使用精确字段过滤** — `level:ERROR`、`traceId:xxx` 比 `*` 快得多
- **分页获取** — 单次最多 100 条，用 `offset` 翻页

## 项目结构

```
src/
├── index.ts          # MCP server 入口，注册所有工具
├── sls-client.ts     # SLS HTTP API 签名与请求（无原生依赖）
└── credentials.ts    # 凭证加载（Consul / env / static）
```

## 技术说明

- 不依赖阿里云官方 SDK（避免 `lz4` 等原生编译依赖）
- 使用 Node.js 内置 `crypto` 模块实现 SLS HMAC-SHA1 签名
- 签名规范：`Authorization: LOG <AK>:<Base64(HMAC-SHA1(StringToSign, SK))>`
- `CanonicalizedResource` 包含排序后的 query params
