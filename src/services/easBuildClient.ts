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
  /** INTERNAL, STORE, or SIMULATOR. Null when Expo omits the field. */
  distribution: string | null;
  isForIosSimulator: boolean;
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
      distribution
      isForIosSimulator
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
  const distribution = textOrNull(byId.distribution);
  return {
    ok: true,
    build: {
      id,
      status: status.toUpperCase(),
      platform: platform.toUpperCase(),
      projectId: project,
      distribution: distribution ? distribution.toUpperCase() : null,
      isForIosSimulator: byId.isForIosSimulator === true,
      buildUrl: artifacts ? textOrNull(artifacts.buildUrl) : null,
      applicationArchiveUrl: artifacts ? textOrNull(artifacts.applicationArchiveUrl) : null,
    },
  };
};

const CREATE_IOS_SUBMISSION = `mutation CreateIosSubmission(
  $appId: ID!
  $config: IosSubmissionConfigInput!
  $submittedBuildId: ID
) {
  submission {
    createIosSubmission(
      input: { appId: $appId, config: $config, submittedBuildId: $submittedBuildId }
    ) {
      submission { id status }
    }
  }
}`;

const CREATE_ANDROID_SUBMISSION = `mutation CreateAndroidSubmission(
  $appId: ID!
  $config: AndroidSubmissionConfigInput!
  $submittedBuildId: ID
) {
  submission {
    createAndroidSubmission(
      input: { appId: $appId, config: $config, submittedBuildId: $submittedBuildId }
    ) {
      submission { id status }
    }
  }
}`;

const SUBMISSION_BY_ID = `query SubmissionById($submissionId: ID!) {
  submissions {
    byId(submissionId: $submissionId) {
      id
      status
      platform
    }
  }
}`;

export interface EasSubmissionRecord {
  id: string;
  status: string;
  platform: string;
}

export type EasSubmissionCreateResult =
  | { ok: true; submissionId: string; status: string }
  | EasCallFailure;

export type EasSubmissionLookupResult =
  | { ok: true; submission: EasSubmissionRecord | null }
  | EasCallFailure;

const graphqlData = (
  payload: unknown
): { failed: true } | { failed: false; data: Record<string, unknown> | null } => {
  if (!isRecord(payload)) {
    return { failed: true };
  }
  if (Array.isArray(payload.errors) && payload.errors.length > 0 && !isRecord(payload.data)) {
    return { failed: true };
  }
  if (Array.isArray(payload.errors) && payload.errors.length > 0) {
    const data = payload.data;
    if (!isRecord(data) || Object.keys(data).length === 0) {
      return { failed: true };
    }
  }
  return { failed: false, data: isRecord(payload.data) ? payload.data : null };
};

const submissionNode = (value: unknown): { id: string; status: string } | null => {
  if (!isRecord(value)) {
    return null;
  }
  const id = textOrNull(value.id);
  const status = textOrNull(value.status);
  if (!id || !isEasUuid(id) || !status) {
    return null;
  }
  return { id, status: status.toUpperCase() };
};

const postGraphql = async (input: {
  token: string;
  query: string;
  variables: Record<string, unknown>;
}): Promise<{ ok: true; data: Record<string, unknown> | null; status: number } | EasCallFailure> => {
  const result = await easHttp({
    token: input.token,
    method: 'POST',
    path: '/graphql',
    body: { query: input.query, variables: input.variables },
  });
  if (result.ok === false) {
    return { ok: false, status: result.status, kind: result.kind };
  }
  const parsed = graphqlData(result.data);
  if (parsed.failed === true) {
    return { ok: false, status: result.status, kind: 'http' };
  }
  return { ok: true, data: parsed.data, status: result.status };
};

/**
 * Schedules an App Store submission. `keyP8` is the store .p8 PEM.
 * Callers must not log `input`.
 */
export const createEasIosSubmission = async (input: {
  token: string;
  appId: string;
  buildId: string;
  keyId: string;
  issuerId: string;
  keyP8: string;
}): Promise<EasSubmissionCreateResult> => {
  const result = await postGraphql({
    token: input.token,
    query: CREATE_IOS_SUBMISSION,
    variables: {
      appId: input.appId,
      submittedBuildId: input.buildId,
      config: {
        ascApiKey: {
          keyP8: input.keyP8,
          keyIdentifier: input.keyId,
          issuerIdentifier: input.issuerId,
        },
      },
    },
  });
  if (result.ok === false) {
    return { ok: false, status: result.status, kind: result.kind };
  }
  const submission = isRecord(result.data) ? result.data.submission : null;
  const created = isRecord(submission) ? submission.createIosSubmission : null;
  const node = isRecord(created) ? submissionNode(created.submission) : null;
  if (!node) {
    return { ok: false, status: result.status, kind: 'parse' };
  }
  return { ok: true, submissionId: node.id, status: node.status };
};

/**
 * Schedules a Play submission. `serviceAccountJson` is the store's
 * service-account JSON. Callers must not log `input`. Android uses the
 * Play internal track.
 */
export const createEasAndroidSubmission = async (input: {
  token: string;
  appId: string;
  buildId: string;
  serviceAccountJson: string;
}): Promise<EasSubmissionCreateResult> => {
  const result = await postGraphql({
    token: input.token,
    query: CREATE_ANDROID_SUBMISSION,
    variables: {
      appId: input.appId,
      submittedBuildId: input.buildId,
      config: {
        track: 'INTERNAL',
        googleServiceAccountKeyJson: input.serviceAccountJson,
      },
    },
  });
  if (result.ok === false) {
    return { ok: false, status: result.status, kind: result.kind };
  }
  const submission = isRecord(result.data) ? result.data.submission : null;
  const created = isRecord(submission) ? submission.createAndroidSubmission : null;
  const node = isRecord(created) ? submissionNode(created.submission) : null;
  if (!node) {
    return { ok: false, status: result.status, kind: 'parse' };
  }
  return { ok: true, submissionId: node.id, status: node.status };
};

/** Status only. Expo error text is not returned. */
export const getEasSubmission = async (input: {
  token: string;
  submissionId: string;
}): Promise<EasSubmissionLookupResult> => {
  if (!isEasUuid(input.submissionId)) {
    return { ok: false, status: 400, kind: 'parse' };
  }
  const result = await postGraphql({
    token: input.token,
    query: SUBMISSION_BY_ID,
    variables: { submissionId: input.submissionId },
  });
  if (result.ok === false) {
    return { ok: false, status: result.status, kind: result.kind };
  }
  const submissions = isRecord(result.data) ? result.data.submissions : null;
  const byId = isRecord(submissions) ? submissions.byId : null;
  if (!isRecord(byId)) {
    return { ok: true, submission: null };
  }
  const node = submissionNode(byId);
  const platform = textOrNull(byId.platform);
  if (!node || !platform) {
    return { ok: true, submission: null };
  }
  return {
    ok: true,
    submission: {
      id: node.id,
      status: node.status,
      platform: platform.toUpperCase(),
    },
  };
};
