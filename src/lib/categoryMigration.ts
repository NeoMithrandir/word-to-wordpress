/**
 * Maps legacy WordPress category slugs (and a few name fallbacks) to the
 * InScience v2 category slugs and display names per wp-config/setup-guide.md.
 */

export interface CategoryTarget {
  slug: string;
  name: string;
}

/** Old slug -> new category (slug + Greek display name) */
const SLUG_MIGRATION: Record<string, CategoryTarget> = {
  // Physics
  physics: { slug: "fysiki", name: "ΦΥΣΙΚΗ" },
  fysiki: { slug: "fysiki", name: "ΦΥΣΙΚΗ" },

  // Biology & medicine merge
  biology: { slug: "viologia-iatriki", name: "ΒΙΟΛΟΓΙΑ & ΙΑΤΡΙΚΗ" },
  iatriki: { slug: "viologia-iatriki", name: "ΒΙΟΛΟΓΙΑ & ΙΑΤΡΙΚΗ" },
  "viologia-iatriki": { slug: "viologia-iatriki", name: "ΒΙΟΛΟΓΙΑ & ΙΑΤΡΙΚΗ" },

  // Mathematics & IT merge
  mathematics: { slug: "mathimatika-pliroforiki", name: "ΜΑΘΗΜΑΤΙΚΑ & ΠΛΗΡΟΦΟΡΙΚΗ" },
  "information-technology-and-telecommunications": {
    slug: "mathimatika-pliroforiki",
    name: "ΜΑΘΗΜΑΤΙΚΑ & ΠΛΗΡΟΦΟΡΙΚΗ",
  },
  "mathimatika-pliroforiki": {
    slug: "mathimatika-pliroforiki",
    name: "ΜΑΘΗΜΑΤΙΚΑ & ΠΛΗΡΟΦΟΡΙΚΗ",
  },

  // Space
  space: { slug: "diastima", name: "ΔΙΑΣΤΗΜΑ" },
  diastima: { slug: "diastima", name: "ΔΙΑΣΤΗΜΑ" },

  // Chemistry
  chemistry: { slug: "chimeia", name: "ΧΗΜΕΙΑ" },
  chimeia: { slug: "chimeia", name: "ΧΗΜΕΙΑ" },

  // AI
  "techniti-noimosini-artificial-intelligence": {
    slug: "texniti-noimosyni",
    name: "ΤΕΧΝΗΤΗ ΝΟΗΜΟΣΥΝΗ",
  },
  "texniti-noimosyni": { slug: "texniti-noimosyni", name: "ΤΕΧΝΗΤΗ ΝΟΗΜΟΣΥΝΗ" },
};

/** Greek category names from exports (name field) -> target when slug is missing or percent-encoded */
const NAME_MIGRATION: Record<string, CategoryTarget> = {
  ΦΥΣΙΚΗ: { slug: "fysiki", name: "ΦΥΣΙΚΗ" },
  ΒΙΟΛΟΓΙΑ: { slug: "viologia-iatriki", name: "ΒΙΟΛΟΓΙΑ & ΙΑΤΡΙΚΗ" },
  ΙΑΤΡΙΚΗ: { slug: "viologia-iatriki", name: "ΒΙΟΛΟΓΙΑ & ΙΑΤΡΙΚΗ" },
  ΜΑΘΗΜΑΤΙΚΑ: { slug: "mathimatika-pliroforiki", name: "ΜΑΘΗΜΑΤΙΚΑ & ΠΛΗΡΟΦΟΡΙΚΗ" },
  "ΠΛΗΡΟΦΟΡΙΚΗ-ΤΗΛΕΠΙΚΟΙΝΩΝΙΕΣ": {
    slug: "mathimatika-pliroforiki",
    name: "ΜΑΘΗΜΑΤΙΚΑ & ΠΛΗΡΟΦΟΡΙΚΗ",
  },
  ΔΙΑΣΤΗΜΑ: { slug: "diastima", name: "ΔΙΑΣΤΗΜΑ" },
  ΧΗΜΕΙΑ: { slug: "chimeia", name: "ΧΗΜΕΙΑ" },
  "ΤΕΧΝΗΤΗ ΝΟΗΜΟΣΥΝΗ": { slug: "texniti-noimosyni", name: "ΤΕΧΝΗΤΗ ΝΟΗΜΟΣΥΝΗ" },
};

export function mapCategoryToTarget(cat: { slug: string; name: string }): CategoryTarget {
  const slugKey = (cat.slug || "").toLowerCase().trim();
  if (slugKey && SLUG_MIGRATION[slugKey]) {
    return SLUG_MIGRATION[slugKey];
  }
  const nameKey = (cat.name || "").trim();
  if (nameKey && NAME_MIGRATION[nameKey]) {
    return NAME_MIGRATION[nameKey];
  }
  return { slug: cat.slug, name: cat.name };
}
