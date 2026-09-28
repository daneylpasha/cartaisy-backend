import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * Holds credential bytes in a 0600 file for one submit call, then overwrites
 * and deletes the file. The directory name is random and does not include
 * the secret. Callers must not log the path or the file contents.
 */
export const EPHEMERAL_SECRET_DIR_PREFIX = 'cartaisy-eas-submit-';

export async function withEphemeralSecretFile<T>(
  contents: Buffer,
  run: (readBack: () => Promise<Buffer>) => Promise<T>
): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), EPHEMERAL_SECRET_DIR_PREFIX));
  const filePath = join(dir, 'key');
  const length = contents.length;
  try {
    await writeFile(filePath, contents, { mode: 0o600, flag: 'w' });
    return await run(() => readFile(filePath));
  } finally {
    const wipe = Buffer.alloc(length);
    try {
      await writeFile(filePath, wipe, { mode: 0o600, flag: 'w' });
    } catch {
      // Removal below still drops the file if the overwrite could not run.
    }
    wipe.fill(0);
    contents.fill(0);
    await rm(dir, { recursive: true, force: true });
  }
}
