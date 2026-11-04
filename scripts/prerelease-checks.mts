/**
 * What must be true before and after a pre-release goes up. Kept apart from
 * `publish-prerelease.mts` so it can be tested without publishing anything: a
 * wrong answer here looks just like a right one until a release has gone out.
 */

export interface PublishingFacts {
  readonly version: string;
  readonly treeIsClean: boolean;
  readonly head: string;
  readonly localTagCommit: string | null;
  readonly gitHubTagCommit: string | null;
  readonly existingReleaseTags: readonly string[];
  readonly latestTag: string;
}

export interface ReleaseAsset {
  readonly name: string;
  readonly size: number;
}

export interface PublishedRelease {
  readonly prerelease: boolean;
  readonly draft: boolean;
  readonly assets: readonly ReleaseAsset[];
}

export interface PublishedOutcome {
  readonly release: PublishedRelease;
  readonly expectedAssets: readonly ReleaseAsset[];
  readonly latestBefore: string;
  readonly latestAfter: string;
}

function versionParts(version: string): number[] | null {
  return /^\d+\.\d+\.\d+$/.test(version) ? version.split('.').map(Number) : null;
}

/** Compares `1.2.3` numbers, with or without a leading `v`; anything else is never newer. */
export function isNewerVersion(candidate: string, current: string): boolean {
  const candidateParts = versionParts(candidate.replace(/^v/, ''));
  const currentParts = versionParts(current.replace(/^v/, ''));
  if (candidateParts === null || currentParts === null) return false;
  for (const [index, part] of candidateParts.entries()) {
    const other = currentParts[index] ?? 0;
    if (part !== other) return part > other;
  }
  return false;
}

/** Every reason this commit must not be published; empty when it may be. */
export function reasonsNotToPublish(facts: PublishingFacts): string[] {
  const tag = `v${facts.version}`;
  const reasons: string[] = [];
  // Making a pre-release live changes only its mark, so the number it carries
  // now is the number he gets. A -beta build could never be made live as it is.
  if (versionParts(facts.version) === null) {
    reasons.push(`Version ${facts.version} is not a plain number like 1.2.3.`);
  } else if (!isNewerVersion(facts.version, facts.latestTag)) {
    reasons.push(`Version ${facts.version} is not higher than the live release, ${facts.latestTag}. Bump it.`);
  }
  if (!facts.treeIsClean) reasons.push('There are uncommitted changes, so the build would not match its tag.');
  if (facts.localTagCommit !== facts.head) reasons.push(`Tag ${tag} is not on this commit.`);
  if (facts.gitHubTagCommit !== facts.head) reasons.push(`Tag ${tag} on GitHub is not this commit. Push it.`);
  if (facts.existingReleaseTags.includes(tag)) reasons.push(`A release for ${tag} already exists.`);
  return reasons;
}

/** Whether a freshly built `latest.yml` really describes this installer. */
export function manifestProblems(
  manifest: string,
  version: string,
  installerName: string,
  installerSha512: string,
): string[] {
  const field = (name: string): string | undefined =>
    new RegExp(`^${name}: (.+)$`, 'm').exec(manifest)?.[1];
  const problems: string[] = [];
  if (field('version') !== version) problems.push(`latest.yml does not say version ${version}.`);
  if (field('path') !== installerName) problems.push(`latest.yml does not point at ${installerName}.`);
  if (field('sha512') !== installerSha512) problems.push(`latest.yml's sha512 does not match ${installerName}.`);
  return problems;
}

function isReleaseAsset(value: unknown): value is ReleaseAsset {
  if (typeof value !== 'object' || value === null) return false;
  const { name, size } = value as { name?: unknown; size?: unknown };
  return typeof name === 'string' && typeof size === 'number';
}

/** Reads GitHub's answer about a release, without trusting its shape. */
export function parsePublishedRelease(json: unknown): PublishedRelease {
  if (typeof json !== 'object' || json === null) throw new Error('GitHub did not describe the release.');
  const { prerelease, draft, assets } = json as { prerelease?: unknown; draft?: unknown; assets?: unknown };
  if (typeof prerelease !== 'boolean' || typeof draft !== 'boolean' || !Array.isArray(assets)) {
    throw new Error('GitHub described the release in an unexpected shape.');
  }
  return { prerelease, draft, assets: assets.filter(isReleaseAsset) };
}

/** Everything wrong with a release that has just gone up; empty when it landed as intended. */
export function problemsAfterPublishing(outcome: PublishedOutcome): string[] {
  const { release, expectedAssets, latestBefore, latestAfter } = outcome;
  const problems: string[] = [];
  if (latestAfter !== latestBefore) {
    problems.push(`The live release changed from ${latestBefore} to ${latestAfter}: IT WILL REACH HIM.`);
  }
  if (!release.prerelease) problems.push('The release is not marked pre-release: IT CAN REACH HIM.');
  if (release.draft) problems.push('The release is a draft, so it cannot be downloaded to try.');
  for (const expected of expectedAssets) {
    const found = release.assets.find((asset) => asset.name === expected.name);
    if (found === undefined) problems.push(`${expected.name} is missing from the release.`);
    else if (found.size !== expected.size) {
      problems.push(`${expected.name} is ${found.size} bytes on GitHub and ${expected.size} here.`);
    }
  }
  return problems;
}
