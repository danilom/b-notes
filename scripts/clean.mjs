import { rm } from 'node:fs/promises';

// electron-builder appends to its output directory rather than replacing it, so
// old installers pile up and it stops being obvious which one is current.
await rm('release', { recursive: true, force: true });
// The build writes into these and never removes what it no longer writes, so a
// file dropped from the app (the old Lektor's company marks) stayed in every
// installer after it. A release build starts from nothing.
await rm('dist', { recursive: true, force: true });
await rm('dist-browser', { recursive: true, force: true });
console.log('cleaned release/, dist/ and dist-browser/');
