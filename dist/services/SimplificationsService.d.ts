export { defaultInscienceV2Dir } from './inscienceV2Path';
export interface SimplificationsRunResult {
    ok: boolean;
    message: string;
    output: string;
}
/**
 * WordPress REST often returns Greek slugs percent-encoded, or callers pass a
 * permalink. Reduce that to the last path segment and decode before validation.
 */
export declare function normalizeSimplificationSlug(raw: string): string;
export declare function isSafeSimplificationSlug(slug: string): boolean;
export declare class SimplificationsService {
    generateForSlug(slug: string): Promise<SimplificationsRunResult>;
}
//# sourceMappingURL=SimplificationsService.d.ts.map