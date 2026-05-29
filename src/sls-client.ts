import { createHmac } from "crypto";
import axios from "axios";
import { SlsCredentials } from "./credentials.js";

function buildSignature(
  method: string,
  resource: string,
  params: Record<string, string>,
  headers: Record<string, string>,
  sk: string
): string {
  const contentMd5 = "";
  const contentType = "";
  const date = headers["date"];

  const canonHeaders = Object.keys(headers)
    .filter((k) => k.startsWith("x-log-") || k.startsWith("x-acs-"))
    .sort()
    .map((k) => `${k}:${headers[k].trim()}`)
    .join("\n");

  const sortedParams = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join("&");
  const canonResource = sortedParams ? `${resource}?${sortedParams}` : resource;

  const stringToSign = `${method}\n${contentMd5}\n${contentType}\n${date}\n${canonHeaders}\n${canonResource}`;
  return createHmac("sha1", sk).update(stringToSign).digest("base64");
}

async function slsRequest<T>(
  endpoint: string,
  ak: string,
  sk: string,
  method: "GET" | "POST",
  path: string,
  params: Record<string, string>
): Promise<T> {
  const date = new Date().toUTCString();
  const headers: Record<string, string> = {
    date,
    "x-log-apiversion": "0.6.0",
    "x-log-signaturemethod": "hmac-sha1",
    "x-log-bodyrawsize": "0",
  };

  const sig = buildSignature(method, path, params, headers, sk);
  headers["authorization"] = `LOG ${ak}:${sig}`;

  const baseUrl = endpoint.startsWith("http") ? endpoint : `https://${endpoint}`;
  const res = await axios.request<T>({
    method,
    url: `${baseUrl}${path}`,
    params,
    headers,
    timeout: 30000,
  });
  return res.data;
}

export interface LogQueryResult {
  logs: Record<string, string>[];
  count: number;
  progress: string;
}

export interface QueryLogsOptions {
  project: string;
  logStore: string;
  query: string;
  from: number;
  to: number;
  line?: number;
  offset?: number;
  fast?: boolean;
  topic?: string;
}

export async function queryLogs(creds: SlsCredentials, opts: QueryLogsOptions): Promise<LogQueryResult> {
  const line = Math.min(opts.line ?? 100, 100);
  const path = `/logstores/${opts.logStore}`;
  const endpoint = `${opts.project}.${creds.endpoint.replace(/^https?:\/\//, "")}`;

  const params: Record<string, string> = {
    type: "log",
    from: String(opts.from),
    to: String(opts.to),
    query: opts.query,
    line: String(line),
    offset: String(opts.offset ?? 0),
    reverse: "false",
    powerSql: opts.fast === false ? "true" : "false",
  };
  if (opts.topic) params["topic"] = opts.topic;

  const data = await slsRequest<Record<string, string>[]>(
    endpoint, creds.accessKeyId, creds.accessKeySecret, "GET", path, params
  );

  return {
    logs: Array.isArray(data) ? data : [],
    count: Array.isArray(data) ? data.length : 0,
    progress: "Complete",
  };
}

export async function listProjects(
  creds: SlsCredentials,
  filter?: string
): Promise<{ projectName: string; description: string; region: string }[]> {
  const params: Record<string, string> = { offset: "0", size: "500" };
  const data = await slsRequest<{ projects: { projectName: string; description: string; region: string }[] }>(
    creds.endpoint, creds.accessKeyId, creds.accessKeySecret, "GET", "/", params
  );
  const projects = data.projects ?? [];
  if (!filter) return projects;
  const lower = filter.toLowerCase();
  return projects.filter(
    (p) => p.projectName?.toLowerCase().includes(lower) || p.description?.toLowerCase().includes(lower)
  );
}

export async function listLogStores(
  creds: SlsCredentials,
  project: string,
  filter?: string
): Promise<string[]> {
  const endpoint = `${project}.${creds.endpoint.replace(/^https?:\/\//, "")}`;
  const params: Record<string, string> = { offset: "0", size: "500" };
  const data = await slsRequest<{ logstores: string[] }>(
    endpoint, creds.accessKeyId, creds.accessKeySecret, "GET", "/logstores", params
  );
  const stores = data.logstores ?? [];
  if (!filter) return stores;
  const lower = filter.toLowerCase();
  return stores.filter((s) => s.toLowerCase().includes(lower));
}
