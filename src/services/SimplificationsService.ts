import fs from 'fs';
import path from 'path';
import { defaultInscienceV2Dir } from './inscienceV2Path';
import { spawnCommand } from './spawnCommand';

export { defaultInscienceV2Dir } from './inscienceV2Path';

export interface SimplificationsRunResult {
  ok: boolean;
  message: string;
  output: string;
}

const SLUG_PATTERN = /^[\p{L}\p{N}._~-]+$/u;
const MAX_SLUG_LENGTH = 200;
const DEFAULT_TIMEOUT_MS = 8 * 60 * 1000;
const GRAPHQL_RETRY_DELAY_MS = 5000;

/**
 * WordPress REST often returns Greek slugs percent-encoded, or callers pass a
 * permalink. Reduce that to the last path segment and decode before validation.
 */
export function normalizeSimplificationSlug(raw: string): string {
  let value = raw.trim();
  if (!value) return '';

  try {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
      const parts = new URL(value).pathname.split('/').filter(Boolean);
      value = parts[parts.length - 1] ?? '';
    } else if (value.includes('/') || value.includes('\\')) {
      const parts = value.split(/[/\\]/).filter(Boolean);
      value = parts[parts.length - 1] ?? '';
    }
  } catch {
    return '';
  }

  const cut = value.indexOf('?');
  if (cut !== -1) value = value.slice(0, cut);
  const hash = value.indexOf('#');
  if (hash !== -1) value = value.slice(0, hash);

  try {
    for (let i = 0; i < 2; i++) {
      if (!/%[0-9a-fA-F]{2}/.test(value)) break;
      const next = decodeURIComponent(value);
      if (next === value) break;
      value = next;
    }
  } catch {
    return '';
  }

  return value.trim();
}

export function isSafeSimplificationSlug(slug: string): boolean {
  const normalized = normalizeSimplificationSlug(slug);
  return (
    normalized.length > 0 &&
    normalized.length <= MAX_SLUG_LENGTH &&
    !normalized.includes('..') &&
    !normalized.includes('/') &&
    !normalized.includes('\\') &&
    SLUG_PATTERN.test(normalized)
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function looksLikeMissingPublishedArticle(output: string): boolean {
  return /No published article found for slug/i.test(output);
}

function runScript(slug: string, repoDir: string, timeoutMs: number): Promise<SimplificationsRunResult> {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawnCommand(
        'npm',
        ['run', 'generate:simplifications', '--', `--only=${slug}`, '--force'],
        {
          cwd: repoDir,
          env: { ...process.env }
        }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start generate:simplifications';
      resolve({
        ok: false,
        message,
        output: ''
      });
      return;
    }

    let output = '';
    const append = (chunk: Buffer | string) => {
      output += chunk.toString();
    };
    child.stdout?.on('data', append);
    child.stderr?.on('data', append);

    const timer = setTimeout(() => {
      child.kill();
      resolve({
        ok: false,
        message: `generate:simplifications timed out after ${Math.round(timeoutMs / 1000)}s`,
        output
      });
    }, timeoutMs);

    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({
        ok: false,
        message: error.message,
        output
      });
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      const trimmed = output.trim();
      if (code === 0) {
        resolve({
          ok: true,
          message: `Wrote Με πιο απλά Λόγια for "${slug}"`,
          output: trimmed
        });
        return;
      }
      resolve({
        ok: false,
        message: trimmed.split(/\r?\n/).filter(Boolean).slice(-1)[0] || `generate:simplifications exited with code ${code}`,
        output: trimmed
      });
    });
  });
}

export class SimplificationsService {
  async generateForSlug(slug: string): Promise<SimplificationsRunResult> {
    const normalized = normalizeSimplificationSlug(slug);
    if (!isSafeSimplificationSlug(normalized)) {
      return {
        ok: false,
        message: 'Invalid post slug',
        output: ''
      };
    }

    const repoDir = defaultInscienceV2Dir();
    const scriptPath = path.join(repoDir, 'scripts', 'generate-simplifications.ts');
    if (!fs.existsSync(scriptPath)) {
      return {
        ok: false,
        message: `inscience-v2 not found at ${repoDir}. Set INSCIENCE_V2_DIR.`,
        output: ''
      };
    }

    const timeoutMs = Number(process.env.SIMPLIFICATIONS_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
    // GraphQL often lags a few seconds behind a fresh REST publish.
    await sleep(2000);
    const first = await runScript(normalized, repoDir, timeoutMs);
    if (first.ok || !looksLikeMissingPublishedArticle(first.output || first.message)) {
      return first;
    }

    await sleep(GRAPHQL_RETRY_DELAY_MS);
    return runScript(normalized, repoDir, timeoutMs);
  }
}
