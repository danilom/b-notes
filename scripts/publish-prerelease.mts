/**
 * Builds this commit and publishes it as a pre-release, which cannot reach him.
 * It never makes a release live; see "Shipping a new version" in DESIGN.md.
 *
 *   npm run release
 *   npm run release -- --notes-file notes.md
 */
import { execFile, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { promisify, parseArgs } from 'node:util';

import {
  type PublishingFacts,
  type ReleaseAsset,
  manifestProblems,
  parsePublishedRelease,
  problemsAfterPublishing,
  reasonsNotToPublish,
} from './prerelease-checks.mts';

const REPOSITORY = 'danilom/b-notes';
const RELEASE_FOLDER = 'release';

const execute = promisify(execFile);

async function output(command: string, ...args: string[]): Promise<string> {
  const { stdout } = await execute(command, args, { windowsHide: true });
  return stdout.trim();
}

function stopBecause(heading: string, reasons: readonly string[]): never {
  console.error(`${heading}\n${reasons.map((reason) => `  - ${reason}`).join('\n')}`);
  process.exit(1);
}

const latestTag = (): Promise<string> =>
  output('gh', 'api', `repos/${REPOSITORY}/releases/latest`, '--jq', '.tag_name');

/** A tag that isn't there comes back as no output and no error from both of these. */
async function localTagCommit(tag: string): Promise<string | null> {
  const peeledThenOwn = await output('git', 'for-each-ref', `refs/tags/${tag}`, '--format=%(*objectname) %(objectname)');
  return peeledThenOwn.split(/\s+/)[0] || null;
}

async function gitHubTagCommit(tag: string): Promise<string | null> {
  const lines = await output('git', 'ls-remote', 'origin', `refs/tags/${tag}`, `refs/tags/${tag}^{}`);
  // An annotated tag lists its own object first and the commit it marks last.
  return lines.split(/\r?\n/).at(-1)?.split(/\s+/)[0] || null;
}

async function gatherFacts(version: string): Promise<PublishingFacts> {
  const tag = `v${version}`;
  const [status, head, localCommit, gitHubCommit, releaseTags, latest] = await Promise.all([
    output('git', 'status', '--porcelain'),
    output('git', 'rev-parse', 'HEAD'),
    localTagCommit(tag),
    gitHubTagCommit(tag),
    output('gh', 'api', '--paginate', `repos/${REPOSITORY}/releases`, '--jq', '.[].tag_name'),
    latestTag(),
  ]);
  return {
    version,
    treeIsClean: status === '',
    head,
    localTagCommit: localCommit,
    gitHubTagCommit: gitHubCommit,
    existingReleaseTags: releaseTags.split(/\r?\n/),
    latestTag: latest,
  };
}

async function sha512Of(file: string): Promise<string> {
  const hash = createHash('sha512');
  await pipeline(createReadStream(file), hash);
  return hash.digest('base64');
}

function build(): void {
  // npm is a batch file on Windows, which only starts through a shell.
  const built = spawnSync('npm', ['run', 'dist'], { stdio: 'inherit', shell: true });
  if (built.status !== 0) stopBecause('Nothing was published.', ['The build failed.']);
}

async function checkBuild(version: string): Promise<{ files: string[]; expectedAssets: ReleaseAsset[] }> {
  const installerName = `b-notes-setup-${version}.exe`;
  const names = [installerName, `${installerName}.blockmap`, 'latest.yml'];
  const files = names.map((name) => path.join(RELEASE_FOLDER, name));
  const sizes = await Promise.all(files.map(async (file) => (await stat(file)).size));
  const manifest = await readFile(path.join(RELEASE_FOLDER, 'latest.yml'), 'utf8');
  const installerSha512 = await sha512Of(path.join(RELEASE_FOLDER, installerName));
  const problems = manifestProblems(manifest, version, installerName, installerSha512);
  if (problems.length > 0) stopBecause('Nothing was published.', problems);
  return { files, expectedAssets: names.map((name, index) => ({ name, size: sizes[index] ?? -1 })) };
}

async function publish(tag: string, files: readonly string[], notesFile: string | undefined): Promise<void> {
  const notes = notesFile === undefined ? ['--notes', ''] : ['--notes-file', notesFile];
  // --verify-tag: without it, a tag that isn't there is made on the default
  // branch, and the release points at code that wasn't built.
  await output('gh', 'release', 'create', tag, '--repo', REPOSITORY, '--prerelease', '--verify-tag', '--title', tag, ...notes, ...files);
}

async function checkPublished(tag: string, expectedAssets: readonly ReleaseAsset[], latestBefore: string): Promise<void> {
  const described = await output('gh', 'api', `repos/${REPOSITORY}/releases/tags/${tag}`);
  const problems = problemsAfterPublishing({
    release: parsePublishedRelease(JSON.parse(described)),
    expectedAssets,
    latestBefore,
    latestAfter: await latestTag(),
  });
  if (problems.length > 0) stopBecause(`${tag} was published, and something is wrong:`, problems);
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { 'notes-file': { type: 'string' } } });
  const packageJson: unknown = JSON.parse(await readFile('package.json', 'utf8'));
  const version = (packageJson as { version?: unknown }).version;
  if (typeof version !== 'string') stopBecause('Nothing was published.', ['package.json has no version.']);
  const tag = `v${version}`;

  const facts = await gatherFacts(version);
  const reasons = reasonsNotToPublish(facts);
  if (reasons.length > 0) stopBecause('Nothing was built or published.', reasons);

  build();
  const { files, expectedAssets } = await checkBuild(version);
  await publish(tag, files, values['notes-file']);
  await checkPublished(tag, expectedAssets, facts.latestTag);

  console.log(`\n${tag} is up as a pre-release. It has not reached him: the live release is still ${facts.latestTag}.`);
}

await main();
