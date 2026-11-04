import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  type PublishedOutcome,
  type PublishedRelease,
  type PublishingFacts,
  type ReleaseHost,
  isNewerVersion,
  makeNewestPreReleaseLive,
  manifestProblems,
  newestPreRelease,
  parsePublishedRelease,
  problemsAfterPublishing,
  reasonsNotToMakeLive,
  reasonsNotToPublish,
} from '../scripts/release-checks.mts';

const READY: PublishingFacts = {
  version: '0.9.0',
  treeIsClean: true,
  head: 'abc',
  localTagCommit: 'abc',
  gitHubTagCommit: 'abc',
  existingReleaseTags: ['v0.8.4'],
  latestTag: 'v0.8.4',
};

const LANDED: PublishedOutcome = {
  release: { tag: 'v0.9.0', prerelease: true, draft: false, assets: [{ name: 'latest.yml', size: 343 }] },
  expectedAssets: [{ name: 'latest.yml', size: 343 }],
  latestBefore: 'v0.8.4',
  latestAfter: 'v0.8.4',
};

const MANIFEST = [
  'version: 0.9.0',
  'files:',
  '  - url: b-notes-setup-0.9.0.exe',
  '    sha512: not-the-top-level-one',
  '    size: 1000',
  'path: b-notes-setup-0.9.0.exe',
  'sha512: right==',
  "releaseDate: '2026-11-04T00:00:00.000Z'",
  '',
].join('\n');

test('compares versions as numbers, so 0.10.0 is newer than 0.9.0', () => {
  assert.equal(isNewerVersion('0.10.0', 'v0.9.0'), true);
  assert.equal(isNewerVersion('0.9.0', 'v0.10.0'), false);
});

test('an equal version is not newer', () => {
  assert.equal(isNewerVersion('0.8.4', 'v0.8.4'), false);
});

test('a version that is not plain numbers is never newer', () => {
  assert.equal(isNewerVersion('0.9.0-beta.1', 'v0.8.4'), false);
  assert.equal(isNewerVersion('0.9.0', 'v1'), false);
});

test('finds no reason to stop a tagged, clean, higher version', () => {
  assert.deepEqual(reasonsNotToPublish(READY), []);
});

for (const [what, change, expected] of [
  ['a -beta version', { version: '0.9.0-beta.1' }, /not a plain number/],
  ['a version no higher than the live one', { version: '0.8.4', existingReleaseTags: [] }, /not higher/],
  ['uncommitted changes', { treeIsClean: false }, /uncommitted/],
  ['a missing local tag', { localTagCommit: null }, /not on this commit/],
  ['a local tag on another commit', { localTagCommit: 'def' }, /not on this commit/],
  ['a tag not pushed', { gitHubTagCommit: null }, /on GitHub/],
  ['a tag on GitHub at another commit', { gitHubTagCommit: 'def' }, /on GitHub/],
  ['a release that already exists', { existingReleaseTags: ['v0.8.4', 'v0.9.0'] }, /already exists/],
] satisfies [string, Partial<PublishingFacts>, RegExp][]) {
  test(`refuses ${what}`, () => {
    const reasons = reasonsNotToPublish({ ...READY, ...change });
    assert.equal(reasons.length, 1, reasons.join('; '));
    assert.match(reasons[0] ?? '', expected);
  });
}

test('accepts a manifest describing this installer, reading the top-level sha512', () => {
  assert.deepEqual(manifestProblems(MANIFEST, '0.9.0', 'b-notes-setup-0.9.0.exe', 'right=='), []);
});

test('a manifest with Windows line endings still reads', () => {
  assert.deepEqual(manifestProblems(MANIFEST.replaceAll('\n', '\r\n'), '0.9.0', 'b-notes-setup-0.9.0.exe', 'right=='), []);
});

test('reports a manifest for another version, another installer or other bytes', () => {
  assert.match(manifestProblems(MANIFEST, '0.9.1', 'b-notes-setup-0.9.0.exe', 'right==').join(), /version 0\.9\.1/);
  assert.match(manifestProblems(MANIFEST, '0.9.0', 'other.exe', 'right==').join(), /point at other\.exe/);
  assert.match(manifestProblems(MANIFEST, '0.9.0', 'b-notes-setup-0.9.0.exe', 'wrong==').join(), /sha512/);
});

test('a release that landed as intended has no problems', () => {
  assert.deepEqual(problemsAfterPublishing(LANDED), []);
});

test('says so loudly when the live release moved', () => {
  assert.match(problemsAfterPublishing({ ...LANDED, latestAfter: 'v0.9.0' }).join(), /IT WILL REACH HIM/);
});

test('says so loudly when the release is not marked pre-release', () => {
  const release = { ...LANDED.release, prerelease: false };
  assert.match(problemsAfterPublishing({ ...LANDED, release }).join(), /IT CAN REACH HIM/);
});

test('reports a missing file and a file of the wrong size', () => {
  const missing = { ...LANDED.release, assets: [] };
  assert.match(problemsAfterPublishing({ ...LANDED, release: missing }).join(), /missing/);
  const short = { ...LANDED.release, assets: [{ name: 'latest.yml', size: 1 }] };
  assert.match(problemsAfterPublishing({ ...LANDED, release: short }).join(), /1 bytes on GitHub/);
});

test('refuses to read a release of an unexpected shape rather than assume it is fine', () => {
  assert.throws(() => parsePublishedRelease({ tag_name: 'v1', draft: false, assets: [] }), /unexpected shape/);
  assert.throws(() => parsePublishedRelease({ prerelease: true, draft: false, assets: [] }), /unexpected shape/);
  assert.throws(() => parsePublishedRelease(null), /did not describe/);
});

const READY_TO_GO_LIVE: PublishedRelease = {
  tag: 'v0.9.0',
  prerelease: true,
  draft: false,
  assets: [
    { name: 'b-notes-setup-0.9.0.exe', size: 1000 },
    { name: 'b-notes-setup-0.9.0.exe.blockmap', size: 10 },
    { name: 'latest.yml', size: 343 },
  ],
};

const LIVE_RELEASE: PublishedRelease = { ...READY_TO_GO_LIVE, tag: 'v0.8.4', prerelease: false };

test('picks the highest-numbered pre-release, as a number and whatever the order', () => {
  const nine = { ...READY_TO_GO_LIVE, tag: 'v0.9.0' };
  const ten = { ...READY_TO_GO_LIVE, tag: 'v0.10.0' };
  assert.equal(newestPreRelease([nine, ten])?.tag, 'v0.10.0');
  assert.equal(newestPreRelease([ten, nine])?.tag, 'v0.10.0');
});

test('does not count a live release, a draft or an oddly named tag as a pre-release', () => {
  const draft = { ...READY_TO_GO_LIVE, draft: true };
  const oddlyNamed = { ...READY_TO_GO_LIVE, tag: 'v1' };
  assert.equal(newestPreRelease([LIVE_RELEASE, draft, oddlyNamed]), null);
  assert.equal(newestPreRelease([oddlyNamed, READY_TO_GO_LIVE])?.tag, 'v0.9.0');
});

test('finds no reason to stop a complete, higher pre-release', () => {
  assert.deepEqual(reasonsNotToMakeLive(READY_TO_GO_LIVE, 'v0.8.4', MANIFEST), []);
});

test('will not make live a version no higher than the live one', () => {
  assert.match(reasonsNotToMakeLive(READY_TO_GO_LIVE, 'v0.9.0', MANIFEST).join(), /not higher/);
});

for (const missing of ['b-notes-setup-0.9.0.exe', 'b-notes-setup-0.9.0.exe.blockmap', 'latest.yml']) {
  test(`will not make live a release without ${missing}`, () => {
    const assets = READY_TO_GO_LIVE.assets.filter((asset) => asset.name !== missing);
    const reasons = reasonsNotToMakeLive({ ...READY_TO_GO_LIVE, assets }, 'v0.8.4', MANIFEST);
    assert.ok(reasons.includes(`${missing} is missing from the release.`), reasons.join('; '));
  });
}

test('will not make live an empty file', () => {
  const assets = READY_TO_GO_LIVE.assets.map((asset) => ({ ...asset, size: asset.name === 'latest.yml' ? 0 : asset.size }));
  assert.match(reasonsNotToMakeLive({ ...READY_TO_GO_LIVE, assets }, 'v0.8.4', MANIFEST).join(), /latest\.yml is missing/);
});

test('will not make live a release whose manifest describes something else', () => {
  const check = (manifest: string): string => reasonsNotToMakeLive(READY_TO_GO_LIVE, 'v0.8.4', manifest).join();
  assert.match(check(MANIFEST.replace('version: 0.9.0', 'version: 0.8.9')), /does not say version/);
  assert.match(check(MANIFEST.replace('path: b-notes-setup-0.9.0.exe', 'path: other.exe')), /does not point at/);
  assert.match(check(MANIFEST.replace('size: 1000', 'size: 999')), /different size/);
});

/** A GitHub that records whether anything was changed. */
function fakeHost(releases: PublishedRelease[], latestAfterMarking = 'v0.9.0'): ReleaseHost & { marked: string[] } {
  const marked: string[] = [];
  return {
    marked,
    listReleases: async () => releases,
    latestTag: async () => (marked.length > 0 ? latestAfterMarking : 'v0.8.4'),
    manifestOf: async () => MANIFEST,
    markLive: async (tag) => {
      marked.push(tag);
    },
  };
}

test('makes the pre-release live when exactly its number is typed', async () => {
  const host = fakeHost([LIVE_RELEASE, READY_TO_GO_LIVE]);
  const outcome = await makeNewestPreReleaseLive(host, async () => '0.9.0\n');
  assert.deepEqual(outcome, { kind: 'live', tag: 'v0.9.0', previousTag: 'v0.8.4' });
  assert.deepEqual(host.marked, ['v0.9.0']);
});

test('the question names what is live now, what replaces it and what to type', async () => {
  let question = '';
  await makeNewestPreReleaseLive(fakeHost([READY_TO_GO_LIVE]), async (asked) => {
    question = asked;
    return '';
  });
  assert.match(question, /v0\.8\.4 -> v0\.9\.0/);
  assert.match(question, /type 0\.9\.0:/);
});

for (const typed of ['', 'yes', 'y', 'v0.9.0', '0.9', '0.9.00', '0.8.4']) {
  test(`changes nothing when "${typed}" is typed`, async () => {
    const host = fakeHost([READY_TO_GO_LIVE]);
    const outcome = await makeNewestPreReleaseLive(host, async () => typed);
    assert.equal(outcome.kind, 'declined');
    assert.deepEqual(host.marked, []);
  });
}

test('does not even ask when the release fails its checks', async () => {
  const host = fakeHost([{ ...READY_TO_GO_LIVE, assets: [] }]);
  const outcome = await makeNewestPreReleaseLive(host, async () => {
    throw new Error('should not have asked');
  });
  assert.equal(outcome.kind, 'refused');
  assert.deepEqual(host.marked, []);
});

test('refuses when there is no pre-release', async () => {
  const host = fakeHost([LIVE_RELEASE]);
  const outcome = await makeNewestPreReleaseLive(host, async () => '0.9.0');
  assert.deepEqual(outcome, { kind: 'refused', reasons: ['There is no pre-release to make live.'] });
  assert.deepEqual(host.marked, []);
});

test('reports failure when GitHub does not show it as latest afterwards', async () => {
  const host = fakeHost([READY_TO_GO_LIVE], 'v0.8.4');
  const outcome = await makeNewestPreReleaseLive(host, async () => '0.9.0');
  assert.equal(outcome.kind, 'failed');
});
