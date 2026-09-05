// WordPress Configuration
// This file contains the hardcoded WordPress configuration
// Update these values with your WordPress site details

export type PublishSiteId = 'inscience' | 'arthra';

export type PublishDestination = PublishSiteId | 'both';

export type SiteConnectionState = 'checking' | 'connected' | 'failed';

export interface WPSiteConfig {
  id: PublishSiteId;
  label: string;
  description: string;
  siteUrl: string;
  username: string;
  password: string;
}

const SHARED_AUTH = {
  username: 'nesimk',
  password: 'AuTF FQcG tBld UZuA UdMp mcvH'
};

export const WORDPRESS_SITES: Record<PublishSiteId, WPSiteConfig> = {
  inscience: {
    id: 'inscience',
    label: 'inscience.gr',
    description: 'Legacy WordPress site',
    siteUrl: 'https://inscience.gr/',
    ...SHARED_AUTH
  },
  arthra: {
    id: 'arthra',
    label: 'arthra.inscience.gr',
    description: 'InScience v2 CMS (GraphQL source for the Astro frontend)',
    siteUrl: 'https://arthra.inscience.gr/',
    ...SHARED_AUTH
  }
};

/** Default / fetch-posts target — the live legacy site. */
export const WORDPRESS_CONFIG = WORDPRESS_SITES.inscience;

/** Public Astro article URL. `category` is the subject slug, never `private`. */
export function publicArticleUrl(categorySlug: string, postSlug: string): string {
  const category = categorySlug.replace(/^\/+|\/+$/g, '');
  const slug = postSlug.replace(/^\/+|\/+$/g, '');
  return `https://inscience.gr/${category}/${slug}/`;
}

export function resolvePublishSites(destination: PublishDestination): WPSiteConfig[] {
  switch (destination) {
    case 'inscience':
      return [WORDPRESS_SITES.inscience];
    case 'arthra':
      return [WORDPRESS_SITES.arthra];
    case 'both':
      return [WORDPRESS_SITES.inscience, WORDPRESS_SITES.arthra];
    default: {
      const _exhaustive: never = destination;
      return _exhaustive;
    }
  }
}

export function overallConnectionStatus(
  destination: PublishDestination,
  statuses: Partial<Record<PublishSiteId, SiteConnectionState>>
): SiteConnectionState | null {
  const sites = resolvePublishSites(destination);
  if (sites.length === 0) return null;
  if (sites.some((site) => statuses[site.id] === 'checking')) return 'checking';
  if (sites.some((site) => !statuses[site.id])) return null;
  if (sites.some((site) => statuses[site.id] === 'failed')) return 'failed';
  if (sites.every((site) => statuses[site.id] === 'connected')) return 'connected';
  return null;
}

// Backend API URL
export const API_URL = 'http://localhost:3007';
