import path from 'path';

/** Sibling inscience-v2 checkout. Override with INSCIENCE_V2_DIR. */
export function defaultInscienceV2Dir(): string {
  const fromEnv = process.env.INSCIENCE_V2_DIR?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  // src/services or dist/services → repo sibling ../inscience-v2
  return path.resolve(__dirname, '..', '..', '..', 'inscience-v2');
}
