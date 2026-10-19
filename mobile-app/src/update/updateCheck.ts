/**
 * "Is there a newer APK?" logic. The app is sideloaded from GitHub Releases
 * (.github/workflows/android-apk.yml publishes one per `app-vX.Y.Z` tag), so
 * there's no Play Store to push updates - instead the app compares its own
 * version with the newest release on launch and blocks until the rider
 * installs it. Pure (no fetch/RN) so it's unit-tested in updateCheck.test.ts.
 */

export const RELEASE_TAG_PREFIX = "app-v";

export interface AvailableUpdate {
  version: string;
  /** Direct APK download, or the release page if no APK asset was found. */
  downloadUrl: string;
  pageUrl: string;
  notes: string;
}

/** "app-v1.2.0" -> "1.2.0"; null for tags that aren't app releases. */
export function versionFromTag(tag: string): string | null {
  if (!tag.startsWith(RELEASE_TAG_PREFIX)) {
    return null;
  }
  const v = tag.slice(RELEASE_TAG_PREFIX.length);
  return /^\d+(\.\d+){0,2}$/.test(v) ? v : null;
}

/** Numeric semver-ish compare: -1 if a < b, 0 if equal, 1 if a > b. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length, 3); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
}

type GithubRelease = {
  tag_name?: string;
  draft?: boolean;
  prerelease?: boolean;
  html_url?: string;
  body?: string | null;
  assets?: { name?: string; browser_download_url?: string }[];
};

/** Newest published (non-draft, non-prerelease) `app-v*` release that's newer than `currentVersion`. */
export function findUpdate(releases: unknown, currentVersion: string): AvailableUpdate | null {
  if (!Array.isArray(releases)) {
    return null;
  }
  let best: { version: string; release: GithubRelease } | null = null;
  for (const release of releases as GithubRelease[]) {
    if (!release || release.draft || release.prerelease || !release.tag_name) {
      continue;
    }
    const version = versionFromTag(release.tag_name);
    if (!version) {
      continue;
    }
    if (!best || compareVersions(version, best.version) > 0) {
      best = { version, release };
    }
  }
  if (!best || compareVersions(best.version, currentVersion) <= 0) {
    return null;
  }
  const pageUrl = best.release.html_url ?? "";
  const apk = best.release.assets?.find((a) => a.name?.toLowerCase().endsWith(".apk") && a.browser_download_url);
  return {
    version: best.version,
    downloadUrl: apk?.browser_download_url ?? pageUrl,
    pageUrl,
    notes: (best.release.body ?? "").trim(),
  };
}
