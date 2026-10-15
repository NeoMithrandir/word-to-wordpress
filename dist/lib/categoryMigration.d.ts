/**
 * Maps legacy WordPress category slugs (and a few name fallbacks) to the
 * InScience v2 category slugs and display names per wp-config/setup-guide.md.
 */
export interface CategoryTarget {
    slug: string;
    name: string;
}
export declare function mapCategoryToTarget(cat: {
    slug: string;
    name: string;
}): CategoryTarget;
//# sourceMappingURL=categoryMigration.d.ts.map