import axios from "axios";

export interface SlsCredentials {
  endpoint: string;
  accessKeyId: string;
  accessKeySecret: string;
  project: string;
  logStore?: string;
}

export interface CredentialConfig {
  source: "env" | "consul" | "static";
  consulUrl?: string;
  consulToken?: string;
  // consul KV paths
  consulPaths?: {
    endpoint?: string;
    accessKeyId?: string;
    accessKeySecret?: string;
    project?: string;
    logStore?: string;
  };
  // static values (override)
  static?: Partial<SlsCredentials>;
}

async function fetchConsulKV(baseUrl: string, key: string, token?: string): Promise<string> {
  const url = `${baseUrl.replace(/\/$/, "")}/v1/kv/${key}?raw`;
  const headers: Record<string, string> = {};
  if (token) headers["X-Consul-Token"] = token;
  const res = await axios.get(url, { headers, timeout: 5000 });
  return String(res.data).trim();
}

export async function loadCredentials(config: CredentialConfig): Promise<SlsCredentials> {
  if (config.source === "consul") {
    const base = config.consulUrl!;
    const token = config.consulToken;
    const paths = config.consulPaths ?? {};

    const [endpoint, accessKeyId, accessKeySecret, project, logStore] = await Promise.all([
      fetchConsulKV(base, paths.endpoint ?? "gaodun/config_center/public/ALI_SLS_ENDPOINT", token),
      fetchConsulKV(base, paths.accessKeyId ?? "gaodun/config_center/public/ALI_SLS_ACCESS_KEY_ID", token),
      fetchConsulKV(base, paths.accessKeySecret ?? "gaodun/config_center/public/ALI_SLS_ACCESS_KEY_SECRET", token),
      fetchConsulKV(base, paths.project ?? "gaodun/config_center/public/ALI_SLS_PROJECT", token),
      paths.logStore
        ? fetchConsulKV(base, paths.logStore, token).catch(() => "")
        : Promise.resolve(""),
    ]);

    return { endpoint, accessKeyId, accessKeySecret, project, logStore: logStore || undefined };
  }

  if (config.source === "env") {
    const endpoint = process.env.ALI_SLS_ENDPOINT ?? "";
    const accessKeyId = process.env.ALI_SLS_ACCESS_KEY_ID ?? "";
    const accessKeySecret = process.env.ALI_SLS_ACCESS_KEY_SECRET ?? "";
    const project = process.env.ALI_SLS_PROJECT ?? "";
    const logStore = process.env.ALI_SLS_LOGSTORE;
    if (!endpoint || !accessKeyId || !accessKeySecret || !project) {
      throw new Error("Missing required env vars: ALI_SLS_ENDPOINT, ALI_SLS_ACCESS_KEY_ID, ALI_SLS_ACCESS_KEY_SECRET, ALI_SLS_PROJECT");
    }
    return { endpoint, accessKeyId, accessKeySecret, project, logStore };
  }

  // static
  const s = config.static!;
  if (!s.endpoint || !s.accessKeyId || !s.accessKeySecret || !s.project) {
    throw new Error("Static credentials incomplete");
  }
  return s as SlsCredentials;
}
