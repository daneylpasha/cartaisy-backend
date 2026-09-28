import { NextFunction, Request, Response } from 'express';

/**
 * Query names that must not appear in access logs. Morgan records `originalUrl`.
 * Credential material belongs in the body or a file, never the URL.
 */
const SECRET_QUERY_FRAGMENTS = [
  'privatekey',
  'private_key',
  'serviceaccount',
  'credentials',
  'pem',
  'keyp8',
  'googleserviceaccountkeyjson',
];

export function redactCredentialQueryUrl(url: string): string {
  const queryIndex = url.indexOf('?');
  if (queryIndex === -1) {
    return url;
  }

  const path = url.slice(0, queryIndex);
  const rawQuery = url.slice(queryIndex + 1);
  const hashIndex = rawQuery.indexOf('#');
  const query = hashIndex === -1 ? rawQuery : rawQuery.slice(0, hashIndex);
  const hash = hashIndex === -1 ? '' : rawQuery.slice(hashIndex);

  const kept = query.split('&').filter(part => {
    if (part.length === 0) {
      return false;
    }
    const rawName = part.split('=')[0] ?? '';
    let name = rawName;
    try {
      name = decodeURIComponent(rawName.replace(/\+/g, ' '));
    } catch {
      name = rawName;
    }
    const lower = name.toLowerCase();
    return !SECRET_QUERY_FRAGMENTS.some(fragment => lower.includes(fragment));
  });

  if (kept.length === 0) {
    return `${path}${hash}`;
  }
  return `${path}?${kept.join('&')}${hash}`;
}

export const redactCredentialQuery = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  if (!req.originalUrl.includes('?') && !req.url.includes('?')) {
    next();
    return;
  }

  req.originalUrl = redactCredentialQueryUrl(req.originalUrl);
  req.url = redactCredentialQueryUrl(req.url);
  next();
};
