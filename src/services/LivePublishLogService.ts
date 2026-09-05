import fs from 'fs';
import path from 'path';

export type LivePublishSource = 'publish' | 'replay' | 'manual';

export interface LivePublishStepResult {
  ok: boolean;
  message: string;
  /** Trailing process output, when a step spawned npm/npx. */
  output?: string;
}

export interface LivePublishLogEntry {
  id: string;
  slug: string;
  title?: string;
  postId?: number;
  postUrl?: string;
  publishedAt?: string;
  timestamp: string;
  source: LivePublishSource;
  simplifications: LivePublishStepResult;
  deploy: LivePublishStepResult;
}

export interface LivePublishInput {
  slug: string;
  title?: string;
  postId?: number;
  postUrl?: string;
  publishedAt?: string;
  source: LivePublishSource;
}

interface LivePublishLogFile {
  version: 1;
  entries: LivePublishLogEntry[];
}

function isLivePublishSource(value: unknown): value is LivePublishSource {
  return value === 'publish' || value === 'replay' || value === 'manual';
}

export function parseLivePublishSource(value: unknown, fallback: LivePublishSource): LivePublishSource {
  return isLivePublishSource(value) ? value : fallback;
}

export class LivePublishLogService {
  private filePath: string;

  constructor() {
    const dir = path.join(process.cwd(), 'saved-posts');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.filePath = path.join(dir, 'live-publish-log.json');
  }

  list(): LivePublishLogEntry[] {
    const log = this.read();
    return [...log.entries].reverse();
  }

  findById(id: string): LivePublishLogEntry | undefined {
    return this.read().entries.find((entry) => entry.id === id);
  }

  findLatestBySlug(slug: string): LivePublishLogEntry | undefined {
    const entries = this.list();
    return entries.find((entry) => entry.slug === slug);
  }

  append(
    input: LivePublishInput & {
      simplifications: LivePublishStepResult;
      deploy: LivePublishStepResult;
    }
  ): LivePublishLogEntry {
    const timestamp = new Date().toISOString();
    const entry: LivePublishLogEntry = {
      id: `${input.slug}-${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
      slug: input.slug,
      title: input.title,
      postId: input.postId,
      postUrl: input.postUrl,
      publishedAt: input.publishedAt,
      timestamp,
      source: input.source,
      simplifications: input.simplifications,
      deploy: input.deploy
    };

    const log = this.read();
    log.entries.push(entry);
    fs.writeFileSync(this.filePath, JSON.stringify(log, null, 2), 'utf8');
    console.log(`Live publish log appended: ${entry.id}`);
    return entry;
  }

  private read(): LivePublishLogFile {
    if (!fs.existsSync(this.filePath)) {
      return { version: 1, entries: [] };
    }

    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as Partial<LivePublishLogFile>;
      if (!parsed || !Array.isArray(parsed.entries)) {
        return { version: 1, entries: [] };
      }
      return { version: 1, entries: parsed.entries };
    } catch (error) {
      console.error('Failed to read live-publish-log.json, starting a new log:', error);
      return { version: 1, entries: [] };
    }
  }
}
