/**
 * cloudPersist.ts
 *
 * Cross-environment JSON persistence helper.
 *
 * - In production (when DEFAULT_OBJECT_STORAGE_BUCKET_ID is set): reads and
 *   writes JSON to GCS so data survives redeploys.
 * - In local development (no bucket env var): falls back to the local
 *   filesystem so you can iterate without cloud credentials.
 */

import { Storage } from "@google-cloud/storage";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";

const BUCKET_ID = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
const GCS_PREFIX = "config/";

let _storage: Storage | null = null;
function getStorage(): Storage {
  if (!_storage) _storage = new Storage();
  return _storage;
}

/**
 * Read a JSON config file.  Returns `null` if the file does not exist yet.
 * @param name  Base filename, e.g. "dynamic_backends.json"
 */
export async function readJson<T>(name: string): Promise<T | null> {
  if (BUCKET_ID) {
    try {
      const bucket = getStorage().bucket(BUCKET_ID);
      const file = bucket.file(`${GCS_PREFIX}${name}`);
      const [exists] = await file.exists();
      if (!exists) return null;
      const [contents] = await file.download();
      return JSON.parse(contents.toString("utf8")) as T;
    } catch {
      return null;
    }
  }

  // Local fallback
  const localPath = resolve(process.cwd(), name);
  if (!existsSync(localPath)) return null;
  try {
    return JSON.parse(readFileSync(localPath, "utf8")) as T;
  } catch {
    return null;
  }
}

/**
 * Write a JSON config file.
 * @param name  Base filename, e.g. "dynamic_backends.json"
 * @param data  The data to serialise and persist.
 */
export async function writeJson<T>(name: string, data: T): Promise<void> {
  const json = JSON.stringify(data, null, 2);

  if (BUCKET_ID) {
    try {
      const bucket = getStorage().bucket(BUCKET_ID);
      const file = bucket.file(`${GCS_PREFIX}${name}`);
      await file.save(json, { contentType: "application/json" });
    } catch (err) {
      console.error(`[cloudPersist] GCS write failed for ${name}:`, err);
    }
    return;
  }

  // Local fallback
  const localPath = resolve(process.cwd(), name);
  writeFileSync(localPath, json, "utf8");
}
