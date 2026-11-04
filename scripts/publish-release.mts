/**
 * Publishes a release in two separate steps; see "Shipping a new version" in
 * DESIGN.md. Plain, it builds this commit and publishes it as a pre-release,
 * which cannot reach him. With --live, and only with a person at the keyboard,
 * it sends the newest pre-release to his machines.
 *
 *   npm run release
 *   npm run release -- --notes-file notes.md
 *   npm run release -- --live
 */
import { execFile, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { pipeline } from 'node:stream/promises';
import { promisify, parseArgs } from 'node:util';

import {
  type PublishingFacts,
  type ReleaseAsset,
  type ReleaseHost,
  makeNewestPreReleaseLive,
  manifestProblems,
  parsePublishedRelease,
  problemsAfterPublishing,
  reasonsNotToPublish,
  releaseFileNames,
} from './release-checks.mts';

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
  const names = releaseFileNames(version);
  const [installerName] = names;
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

async function publishPreRelease(notesFile: string | undefined): Promise<void> {
  const packageJson: unknown = JSON.parse(await readFile('package.json', 'utf8'));
  const version = (packageJson as { version?: unknown }).version;
  if (typeof version !== 'string') stopBecause('Nothing was published.', ['package.json has no version.']);
  const tag = `v${version}`;

  const facts = await gatherFacts(version);
  const reasons = reasonsNotToPublish(facts);
  if (reasons.length > 0) stopBecause('Nothing was built or published.', reasons);

  build();
  const { files, expectedAssets } = await checkBuild(version);
  await publish(tag, files, notesFile);
  await checkPublished(tag, expectedAssets, facts.latestTag);

  console.log(`\n${tag} is up as a pre-release. It has not reached him: the live release is still ${facts.latestTag}.`);
}

const gitHub: ReleaseHost = {
  latestTag,
  async listReleases() {
    const lines = await output(
      'gh', 'api', '--paginate', `repos/${REPOSITORY}/releases`,
      '--jq', '.[] | {tag_name, prerelease, draft, assets: [.assets[] | {name, size}]}',
    );
    return lines.split(/\r?\n/).map((line) => parsePublishedRelease(JSON.parse(line)));
  },
  manifestOf: (tag) => output('gh', 'release', 'download', tag, '--repo', REPOSITORY, '--pattern', 'latest.yml', '--output', '-'),
  async markLive(tag) {
    await output('gh', 'release', 'edit', tag, '--repo', REPOSITORY, '--prerelease=false', '--latest');
  },
};

async function askAtKeyboard(question: string): Promise<string> {
  const keyboard = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await keyboard.question(question);
  } finally {
    keyboard.close();
  }
}

async function makeLive(): Promise<void> {
  // A prompt that can be piped into protects nothing against a script or an
  // agent, which are the things most likely to run this without thinking.
  if (process.stdin.isTTY !== true) {
    stopBecause('Nothing was changed.', ['Making a release live has to be typed by a person, in a terminal.']);
  }
  const outcome = await makeNewestPreReleaseLive(gitHub, askAtKeyboard);
  switch (outcome.kind) {
    case 'refused':
      stopBecause('Nothing was changed.', outcome.reasons);
    case 'declined':
      stopBecause('Nothing was changed.', [`"${outcome.typed}" is not the version number.`]);
    case 'failed':
      stopBecause('Something is wrong:', [outcome.problem]);
    case 'live':
      console.log(`${outcome.tag} is live, replacing ${outcome.previousTag}. His machines get it the next time each one starts.`);
  }
}

const { values } = parseArgs({ options: { 'notes-file': { type: 'string' }, live: { type: 'boolean', default: false } } });
if (values.live) await makeLive();
else await publishPreRelease(values['notes-file']);
