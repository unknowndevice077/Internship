const ACCESS_KEY = "sb.access";
const REFRESH_KEY = "sb.refresh";
const WORKSPACE_KEY = "sb.workspace";

function read(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // storage may be blocked in private mode
  }
}

export const session = {
  get access() {
    return read(ACCESS_KEY);
  },
  get refresh() {
    return read(REFRESH_KEY);
  },
  get workspace() {
    return read(WORKSPACE_KEY);
  },
  setTokens(access: string, refresh?: string) {
    write(ACCESS_KEY, access);
    if (refresh) write(REFRESH_KEY, refresh);
  },
  setWorkspace(slug: string | null) {
    write(WORKSPACE_KEY, slug);
  },
  clear() {
    write(ACCESS_KEY, null);
    write(REFRESH_KEY, null);
  },
};

export class ApiError extends Error {
  constructor(
    public status: number,
    public data: unknown,
  ) {
    super(
      typeof data === "object" && data && "detail" in data
        ? String((data as { detail: unknown }).detail)
        : `HTTP ${status}`,
    );
  }

  get isPlanLimit() {
    return this.status === 402;
  }

  get code() {
    const code = typeof this.data === "object" && this.data ? (this.data as { code?: unknown }).code : null;
    return typeof code === "string" ? code : null;
  }
}

type Options = {
  method?: string;
  body?: unknown;
  auth?: boolean;
};

let refreshing: Promise<boolean> | null = null;

async function refreshAccess(): Promise<boolean> {
  const refresh = session.refresh;
  if (!refresh) return false;
  // share one in-flight refresh between concurrent 401s
  refreshing ??= fetch("/api/auth/token/refresh/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh }),
  })
    .then(async (res) => {
      if (!res.ok) return false;
      const data = await res.json();
      session.setTokens(data.access, data.refresh);
      return true;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

export async function api<T = unknown>(
  path: string,
  { method = "GET", body, auth = true }: Options = {},
  retry = true,
): Promise<T> {
  const headers: Record<string, string> = {};
  const isForm = body instanceof FormData;
  if (body !== undefined && !isForm) headers["Content-Type"] = "application/json";
  if (auth && session.access) headers.Authorization = `Bearer ${session.access}`;
  if (session.workspace) headers["X-Workspace"] = session.workspace;

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  });

  if (res.status === 401 && auth && retry && (await refreshAccess())) {
    return api<T>(path, { method, body, auth }, false);
  }
  if (res.status === 204) return undefined as T;

  const data = res.headers.get("content-type")?.includes("application/json") ? await res.json() : await res.text();
  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}

export function fieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError) || typeof error.data !== "object" || !error.data) return {};
  return Object.fromEntries(
    Object.entries(error.data as Record<string, unknown>).map(([k, v]) => [
      k,
      Array.isArray(v) ? v.join(" ") : String(v),
    ]),
  );
}

export async function downloadFile(path: string, filename: string) {
  // needs auth headers, so a plain link won't work
  const doFetch = () =>
    fetch(path, {
      headers: {
        ...(session.access ? { Authorization: `Bearer ${session.access}` } : {}),
        ...(session.workspace ? { "X-Workspace": session.workspace } : {}),
      },
    });
  let res = await doFetch();
  if (res.status === 401 && (await refreshAccess())) res = await doFetch();
  if (!res.ok) throw new ApiError(res.status, null);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
