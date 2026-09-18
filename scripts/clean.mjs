import { rm } from 'node:fs/promises';

// electron-builder appends to its output directory rather than replacing it, so
// old installers pile up and it stops being obvious which one is current.
await rm('release', { recursive: true, force: true });
console.log('cleaned release/');
