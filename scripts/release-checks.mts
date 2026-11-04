/**
 * What must be true before and after a release goes up or goes live. Kept apart
 * from `publish-release.mts` so it can be tested without publishing anything: a
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
  readonly tag: string;
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

/** What GitHub and the app need to do with a release, for making it live. */
export interface ReleaseHost {
  listReleases(): Promise<PublishedRelease[]>;
  latestTag(): Promise<string>;
  manifestOf(tag: string): Promise<string>;
  markLive(tag: string): Promise<void>;
}

export type MakeLiveOutcome =
  | { readonly kind: 'refused'; readonly reasons: readonly string[] }
  | { readonly kind: 'declined'; readonly typed: string }
  | { readonly kind: 'failed'; readonly problem: string }
  | { readonly kind: 'live'; readonly tag: string; readonly previousTag: string };

/** The installer, its blockmap and the manifest, as a release must carry them. */
export function releaseFileNames(version: string): [installer: string, blockmap: string, manifest: string] {
  const installer = `b-notes-setup-${version}.exe`;
  return [installer, `${installer}.blockmap`, 'latest.yml'];
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

/** A top-level field of `latest.yml`; the same names recur indented under `files`. */
function manifestField(manifest: string, name: string): string | undefined {
  return new RegExp(`^${name}: (.+)$`, 'm').exec(manifest)?.[1];
}

function manifestIdentityProblems(manifest: string, version: string, installerName: string): string[] {
  const problems: string[] = [];
  if (manifestField(manifest, 'version') !== version) problems.push(`latest.yml does not say version ${version}.`);
  if (manifestField(manifest, 'path') !== installerName) problems.push(`latest.yml does not point at ${installerName}.`);
  return problems;
}

/** Whether a freshly built `latest.yml` really describes this installer. */
export function manifestProblems(
  manifest: string,
  version: string,
  installerName: string,
  installerSha512: string,
): string[] {
  const problems = manifestIdentityProblems(manifest, version, installerName);
  if (manifestField(manifest, 'sha512') !== installerSha512) {
    problems.push(`latest.yml's sha512 does not match ${installerName}.`);
  }
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
  const { tag_name: tag, prerelease, draft, assets } = json as {
    tag_name?: unknown;
    prerelease?: unknown;
    draft?: unknown;
    assets?: unknown;
  };
  if (typeof tag !== 'string' || typeof prerelease !== 'boolean' || typeof draft !== 'boolean' || !Array.isArray(assets)) {
    throw new Error('GitHub described the release in an unexpected shape.');
  }
  return { tag, prerelease, draft, assets: assets.filter(isReleaseAsset) };
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

/** The highest-numbered pre-release, or null when there is none. */
export function newestPreRelease(releases: readonly PublishedRelease[]): PublishedRelease | null {
  let newest: PublishedRelease | null = null;
  for (const release of releases) {
    if (!release.prerelease || release.draft) continue;
    if (versionParts(release.tag.replace(/^v/, '')) === null) continue;
    if (newest === null || isNewerVersion(release.tag, newest.tag)) newest = release;
  }
  return newest;
}

/** Every reason this pre-release must not go to his machines; empty when it may. */
export function reasonsNotToMakeLive(release: PublishedRelease, latestTag: string, manifest: string): string[] {
  const version = release.tag.replace(/^v/, '');
  const reasons: string[] = [];
  if (!isNewerVersion(version, latestTag)) {
    reasons.push(`${release.tag} is not higher than the live release, ${latestTag}, so nothing would update.`);
  }
  const fileNames = releaseFileNames(version);
  for (const name of fileNames) {
    const size = release.assets.find((asset) => asset.name === name)?.size ?? 0;
    if (size === 0) reasons.push(`${name} is missing from the release.`);
  }
  const [installerName] = fileNames;
  reasons.push(...manifestIdentityProblems(manifest, version, installerName));
  const installerSize = release.assets.find((asset) => asset.name === installerName)?.size;
  // The updater rejects a download that doesn't match the manifest, so a
  // mismatch means every machine fetches 100MB and then discards it.
  if (/^\s+size: (\d+)$/m.exec(manifest)?.[1] !== String(installerSize)) {
    reasons.push(`latest.yml gives a different size for ${installerName}.`);
  }
  return reasons;
}

/**
 * Makes the newest pre-release live, only if it passes every check and exactly
 * its version number is typed. Asking for the number rather than a fixed word
 * means looking at what is being sent, every time.
 *
 * @param ask shows the question and returns what was typed in answer
 */
export async function makeNewestPreReleaseLive(
  host: ReleaseHost,
  ask: (question: string) => Promise<string>,
): Promise<MakeLiveOutcome> {
  const [releases, previousTag] = await Promise.all([host.listReleases(), host.latestTag()]);
  const release = newestPreRelease(releases);
  if (release === null) return { kind: 'refused', reasons: ['There is no pre-release to make live.'] };

  const hasManifest = release.assets.some((asset) => asset.name === 'latest.yml');
  const manifest = hasManifest ? await host.manifestOf(release.tag) : '';
  const reasons = reasonsNotToMakeLive(release, previousTag, manifest);
  if (reasons.length > 0) return { kind: 'refused', reasons };

  const version = release.tag.replace(/^v/, '');
  const typed = await ask(
    `This goes to his machines the next time each one starts, without asking, and cannot be taken back.\n` +
      `  ${previousTag} -> ${release.tag}\n` +
      `To go ahead, type ${version}: `,
  );
  if (typed.trim() !== version) return { kind: 'declined', typed };

  await host.markLive(release.tag);
  const latestAfter = await host.latestTag();
  if (latestAfter !== release.tag) {
    return { kind: 'failed', problem: `${release.tag} was marked live, but GitHub's latest release is ${latestAfter}.` };
  }
  return { kind: 'live', tag: release.tag, previousTag };
}
