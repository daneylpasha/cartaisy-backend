/**
 * Shared checks for Expo install links and other https URLs we hand to EAS.
 * Token-shaped values are rejected before they can be stored or sent.
 */

export const TOKEN_SHAPED_URL =
  /shpat_|shpss_|shpca_|shpct_|shpua_|access_token|bearer\s|api_secret|client_secret|refresh_token|api_key/i;

const PERCENT_DECODE_PASSES = 3;

/**
 * Decode each valid `%XX` escape. A stray `%` is left in place so it cannot
 * abort the scan and hide an earlier encoded marker. Repeated passes catch
 * double-encoding such as `%255F`.
 */
const decodePercentEscapes = (value: string): string => {
  let current = value;
  for (let pass = 0; pass < PERCENT_DECODE_PASSES; pass += 1) {
    const decoded = current.replace(/%[0-9A-Fa-f]{2}/g, (escape) => {
      try {
        return decodeURIComponent(escape);
      } catch {
        return escape;
      }
    });
    if (decoded === current) {
      return current;
    }
    current = decoded;
  }
  return current;
};

export const hasTokenShapedText = (value: string): boolean =>
  TOKEN_SHAPED_URL.test(value) || TOKEN_SHAPED_URL.test(decodePercentEscapes(value));

const isExpoInstallHost = (hostname: string): boolean => {
  const host = hostname.toLowerCase();
  return (
    host === 'expo.dev' ||
    host.endsWith('.expo.dev') ||
    host === 'expo.io' ||
    host.endsWith('.expo.io')
  );
};

/**
 * Path and query stay percent-encoded on the URL object. Search params are
 * decoded once already. Scan both, plus host and hash, so an encoded marker
 * is not stored and later returned to the merchant.
 */
const urlContainsToken = (parsed: URL): boolean => {
  const parts: string[] = [parsed.pathname, parsed.hostname];
  if (parsed.hash) {
    parts.push(parsed.hash);
  }
  if (parsed.search.length > 1) {
    parts.push(parsed.search.slice(1));
  }
  parsed.searchParams.forEach((paramValue, paramName) => {
    parts.push(paramName, paramValue);
  });
  return parts.some((part) => hasTokenShapedText(part));
};

/** Https URL with no embedded credentials and no token-shaped text. */
export const safeHttpsUrl = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed || hasTokenShapedText(trimmed)) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || urlContainsToken(parsed)) {
    return null;
  }
  return trimmed;
};

/**
 * Install handoff URL. Same host and secret rules as the ops installUrl paste.
 * Returns the trimmed URL, or null when it must not be stored.
 */
export const safeExpoInstallUrl = (value: unknown): string | null => {
  const trimmed = safeHttpsUrl(value);
  if (!trimmed) {
    return null;
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (!isExpoInstallHost(parsed.hostname)) {
    return null;
  }
  return trimmed;
};
