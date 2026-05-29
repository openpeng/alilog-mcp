#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadCredentials, CredentialConfig } from "./credentials.js";
import { queryLogs, listProjects, listLogStores } from "./sls-client.js";

function getCredentialConfig(): CredentialConfig {
  const source = (process.env.CRED_SOURCE ?? "consul") as CredentialConfig["source"];
  if (source === "consul") {
    return {
      source: "consul",
      consulUrl: process.env.CONSUL_URL ?? "https://dev-consul.gaodunwangxiao.com",
      consulToken: process.env.CONSUL_TOKEN ?? undefined,
      consulPaths: {
        endpoint: process.env.CONSUL_PATH_ENDPOINT,
        accessKeyId: process.env.CONSUL_PATH_AK_ID,
        accessKeySecret: process.env.CONSUL_PATH_AK_SECRET,
        project: process.env.CONSUL_PATH_PROJECT,
        logStore: process.env.CONSUL_PATH_LOGSTORE,
      },
    };
  }
  if (source === "env") return { source: "env" };
  return {
    source: "static",
    static: {
      endpoint: process.env.ALI_SLS_ENDPOINT,
      accessKeyId: process.env.ALI_SLS_ACCESS_KEY_ID,
      accessKeySecret: process.env.ALI_SLS_ACCESS_KEY_SECRET,
      project: process.env.ALI_SLS_PROJECT,
      logStore: process.env.ALI_SLS_LOGSTORE,
    },
  };
}

const server = new McpServer({ name: "aliyun-mcp", version: "1.0.0" });

server.tool(
  "sls_query_logs",
  "Query Aliyun SLS logs. fast=true (default) for keyword/field queries; fast=false for SQL analytics.",
  {
    query: z.string().describe("SLS query or SQL, e.g. 'level:ERROR' or '* | select level, count(*) group by level'"),
    project: z.string().optional().describe("SLS project. Defaults to configured project."),
    logStore: z.string().optional().describe("Log store name. Defaults to configured logStore."),
    fromMinutesAgo: z.number().default(15).describe("Query start: N minutes ago."),
    toMinutesAgo: z.number().default(0).describe("Query end: N minutes ago (0 = now)."),
    line: z.number().default(100).describe("Max lines (1-100)."),
    offset: z.number().default(0).describe("Pagination offset."),
    fast: z.boolean().default(true).describe("Fast mode (GetLogs). Set false for SQL."),
    topic: z.string().optional(),
  },
  async (args) => {
    const creds = await loadCredentials(getCredentialConfig());
    const now = Math.floor(Date.now() / 1000);
    const result = await queryLogs(creds, {
      project: args.project ?? creds.project,
      logStore: args.logStore ?? creds.logStore ?? "",
      query: args.query,
      from: now - args.fromMinutesAgo * 60,
      to: now - args.toMinutesAgo * 60,
      line: args.line,
      offset: args.offset,
      fast: args.fast,
      topic: args.topic,
    });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "sls_tail_logs",
  "Get the most recent N log lines from a log store.",
  {
    project: z.string().optional(),
    logStore: z.string().optional(),
    query: z.string().default("*"),
    line: z.number().default(50),
    lastMinutes: z.number().default(5),
  },
  async (args) => {
    const creds = await loadCredentials(getCredentialConfig());
    const now = Math.floor(Date.now() / 1000);
    const result = await queryLogs(creds, {
      project: args.project ?? creds.project,
      logStore: args.logStore ?? creds.logStore ?? "",
      query: args.query,
      from: now - args.lastMinutes * 60,
      to: now,
      line: args.line,
      fast: true,
    });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "sls_list_projects",
  "List Aliyun SLS projects with optional fuzzy name filter.",
  { filter: z.string().optional() },
  async (args) => {
    const creds = await loadCredentials(getCredentialConfig());
    const projects = await listProjects(creds, args.filter);
    return { content: [{ type: "text", text: JSON.stringify(projects, null, 2) }] };
  }
);

server.tool(
  "sls_list_logstores",
  "List log stores in an SLS project with optional fuzzy filter.",
  {
    project: z.string().optional(),
    filter: z.string().optional(),
  },
  async (args) => {
    const creds = await loadCredentials(getCredentialConfig());
    const stores = await listLogStores(creds, args.project ?? creds.project, args.filter);
    return { content: [{ type: "text", text: JSON.stringify(stores, null, 2) }] };
  }
);

server.tool(
  "sls_get_credentials",
  "Show current SLS credential config (masks secret). Use to verify Consul/env setup.",
  {},
  async () => {
    const creds = await loadCredentials(getCredentialConfig());
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          endpoint: creds.endpoint,
          accessKeyId: creds.accessKeyId,
          accessKeySecret: creds.accessKeySecret.slice(0, 4) + "****",
          project: creds.project,
          logStore: creds.logStore,
        }, null, 2),
      }],
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
