export function getAppUrl() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL;
  if (appUrl) return appUrl;
  return 'http://localhost:3000';
}

export function normalizeServerUrl(url?: string | null): string | null {
  if (!url) return null;

  try {
    const parsed = new URL(url.trim());
    const path = parsed.pathname.replace(/\/+$/, '') || '/';
    return `${parsed.origin}${path}${parsed.search}`;
  } catch {
    return url.trim().replace(/\/+$/, '');
  }
}
