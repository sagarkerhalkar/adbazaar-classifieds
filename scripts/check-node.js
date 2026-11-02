'use strict';
// Exits with an error if Node.js is older than 22.13 (needed for the built-in SQLite).
const [major, minor] = process.versions.node.split('.').map(Number);
if (major > 22 || (major === 22 && minor >= 13)) {
  console.log(`Node.js ${process.versions.node} — OK`);
} else {
  console.error(`Your Node.js is ${process.versions.node}. AdBazaar needs 22.13 or newer.`);
  console.error('Download the "LTS" version from https://nodejs.org and install it, then try again.');
  process.exit(1);
}
