/**
 * Server-side Expo/EAS HTTP client.
 *
 * Uses Cartaisy's robot token from the environment. The token is sent only as
 * an Authorization header to api.expo.dev. It is never written into the body,
 * the query string, logs, or API responses.
 */

const EAS_API_ORIGIN = 'https://api.expo.dev';
const REQUEST_TIMEOUT_MS = 15_000;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isEasUuid = (value: string): boolean => UUID_PATTERN.test(value);

export interface EasWorkflowJob {
  type: string | null;
  key: string | null;
  name: string | null;
  status: string | null;
  buildId: string | null;
}

export interface EasWorkflowRun {
  id: string;
  status: string;
  jobs: EasWorkflowJob[];
}

export interface EasBuildRecord {
  id: string;
  status: string;
  platform: string;
  projectId: string | null;
  buildUrl: string | null;
  applicationArchiveUrl: string | null;
}

export type EasCallFailure = {
  ok: false;
  status: number;
  kind: 'http' | 'network' | 'parse';
};

export type EasDispatchResult =
  | { ok: true; workflowRunId: string }
  | EasCallFailure;

export type EasWorkflowRunResult =
  | { ok: true; run: EasWorkflowRun }
  | EasCallFailure;

export type EasBuildResult =
  | { ok: true; build: EasBuildRecord | null }
  | EasCallFailure;

const BUILD_BY_ID_QUERY = `query EasBuildById($buildId: ID!) {
  builds {
    byId(buildId: $buildId) {
      id
      status
      platform
      project { id }
      artifacts { buildUrl applicationArchiveUrl }
    }
  }
}`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const textOrNull = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const redactSecrets = (text: string): string => {
  const token = process.env.EXPO_TOKEN?.trim();
  let out = text.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]');
  if (token && token.length >= 8 && out.includes(token)) {
    out = out.split(token).join('[redacted]');
  }
  return out.slice(0, 300);
};

export const redactEasLogText = (text: string): string => redactSecrets(text);

interface EasHttpResult {
  ok: true;
  status: number;
  data: unknown;
}

const easHttp = async (options: {
  token: string;
  method: 'GET' | 'POST';
  path: string;
  body?: unknown;
}): Promise<EasHttpResult | EasCallFailure> => {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    Authorization: `Bearer ${options.token}`,
  };
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  try {
    const response = await fetch(`${EAS_API_ORIGIN}${options.path}`, {
      method: options.method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const text = await response.text();
    if (!response.ok) {
      return { ok: false, status: response.status, kind: 'http' };
    }
    if (!text) {
      return { ok: true, status: response.status, data: null };
    }
    try {
      return { ok: true, status: response.status, data: JSON.parse(text) as unknown };
    } catch {
      return { ok: false, status: response.status, kind: 'parse' };
    }
  } catch {
    // Drop the thrown message. Fetch errors can echo the request URL, and this
    // path must not grow a log line that includes the bearer token.
    return { ok: false, status: 0, kind: 'network' };
  }
};

const parseJobs = (value: unknown): EasWorkflowJob[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const jobs: EasWorkflowJob[] = [];
  for (const item of value) {
    if (!isRecord(item)) {
      continue;
    }
    const buildId = textOrNull(item.buildId);
    jobs.push({
      type: textOrNull(item.type),
      key: textOrNull(item.key),
      name: textOrNull(item.name),
      status: textOrNull(item.status),
      buildId: buildId && isEasUuid(buildId) ? buildId : null,
    });
  }
  return jobs;
};

export const dispatchEasWorkflow = async (input: {
  token: string;
  appId: string;
  gitRef: string;
  fileName: string;
  inputs: Record<string, string>;
}): Promise<EasDispatchResult> => {
  const result = await easHttp({
    token: input.token,
    method: 'POST',
    path: '/v2/workflows/dispatch',
    body: {
      appId: input.appId,
      gitRef: input.gitRef,
      fileName: input.fileName,
      inputs: input.inputs,
    },
  });
  if (result.ok === false) {
    return { ok: false, status: result.status, kind: result.kind };
  }

  const data = isRecord(result.data) ? result.data.data : null;
  const id = isRecord(data) ? textOrNull(data.id) : null;
  if (!id || !isEasUuid(id)) {
    return { ok: false, status: result.status, kind: 'parse' };
  }
  return { ok: true, workflowRunId: id };
};

export const getEasWorkflowRun = async (input: {
  token: string;
  workflowRunId: string;
}): Promise<EasWorkflowRunResult> => {
  if (!isEasUuid(input.workflowRunId)) {
    return { ok: false, status: 400, kind: 'parse' };
  }

  const result = await easHttp({
    token: input.token,
    method: 'GET',
    path: `/v2/workflows/runs/${input.workflowRunId}`,
  });
  if (result.ok === false) {
    return { ok: false, status: result.status, kind: result.kind };
  }

  const data = isRecord(result.data) ? result.data.data : null;
  if (!isRecord(data)) {
    return { ok: false, status: result.status, kind: 'parse' };
  }
  const id = textOrNull(data.id);
  const status = textOrNull(data.status);
  if (!id || !isEasUuid(id) || !status) {
    return { ok: false, status: result.status, kind: 'parse' };
  }
  return {
    ok: true,
    run: {
      id,
      status: status.toLowerCase(),
      jobs: parseJobs(data.jobs),
    },
  };
};

export const getEasBuild = async (input: {
  token: string;
  buildId: string;
}): Promise<EasBuildResult> => {
  if (!isEasUuid(input.buildId)) {
    return { ok: false, status: 400, kind: 'parse' };
  }

  const result = await easHttp({
    token: input.token,
    method: 'POST',
    path: '/graphql',
    body: {
      query: BUILD_BY_ID_QUERY,
      variables: { buildId: input.buildId },
    },
  });
  if (result.ok === false) {
    return { ok: false, status: result.status, kind: result.kind };
  }

  const root = isRecord(result.data) ? result.data.data : null;
  const builds = isRecord(root) ? root.builds : null;
  const byId = isRecord(builds) ? builds.byId : null;
  if (!isRecord(byId)) {
    return { ok: true, build: null };
  }

  const id = textOrNull(byId.id);
  const status = textOrNull(byId.status);
  const platform = textOrNull(byId.platform);
  if (!id || !status || !platform) {
    return { ok: true, build: null };
  }

  const project = isRecord(byId.project) ? textOrNull(byId.project.id) : null;
  const artifacts = isRecord(byId.artifacts) ? byId.artifacts : null;
  return {
    ok: true,
    build: {
      id,
      status: status.toUpperCase(),
      platform: platform.toUpperCase(),
      projectId: project,
      buildUrl: artifacts ? textOrNull(artifacts.buildUrl) : null,
      applicationArchiveUrl: artifacts ? textOrNull(artifacts.applicationArchiveUrl) : null,
    },
  };
};
