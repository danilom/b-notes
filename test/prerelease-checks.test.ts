import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  type PublishedOutcome,
  type PublishingFacts,
  isNewerVersion,
  manifestProblems,
  parsePublishedRelease,
  problemsAfterPublishing,
  reasonsNotToPublish,
} from '../scripts/prerelease-checks.mts';

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
  release: { prerelease: true, draft: false, assets: [{ name: 'latest.yml', size: 343 }] },
  expectedAssets: [{ name: 'latest.yml', size: 343 }],
  latestBefore: 'v0.8.4',
  latestAfter: 'v0.8.4',
};

const MANIFEST = [
  'version: 0.9.0',
  'files:',
  '  - url: b-notes-setup-0.9.0.exe',
  '    sha512: not-the-top-level-one',
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
  assert.throws(() => parsePublishedRelease({ draft: false, assets: [] }), /unexpected shape/);
  assert.throws(() => parsePublishedRelease(null), /did not describe/);
});
