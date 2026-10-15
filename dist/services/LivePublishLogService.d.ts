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
export declare function parseLivePublishSource(value: unknown, fallback: LivePublishSource): LivePublishSource;
export declare class LivePublishLogService {
    private filePath;
    constructor();
    list(): LivePublishLogEntry[];
    findById(id: string): LivePublishLogEntry | undefined;
    findLatestBySlug(slug: string): LivePublishLogEntry | undefined;
    append(input: LivePublishInput & {
        simplifications: LivePublishStepResult;
        deploy: LivePublishStepResult;
    }): LivePublishLogEntry;
    private read;
}
//# sourceMappingURL=LivePublishLogService.d.ts.map