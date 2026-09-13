'use strict';
// Diagnostic source change only. Never run against an installed VS Code.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const UPSTREAM = '8e35945bae3f2b0b3d0276963281180f1ce10cb0';
const SOURCE = 'src/vs/workbench/browser/parts/statusbar/statusbarItem.ts';
const SOURCE_BLOB = 'bbee47f5a3acada2ce92a71c83e189015436fe72';
const ITEM_ID = 'gcalpay.vscode-universal-dictate.universalDictate.dictate';
const ANCHOR = '\t\tthis.update(entry);\n';
const HANDLER = `\t\t// M1.2 H1 diagnostic: only Universal Dictate's genuine item and primary mouse.
\t\tthis._register(addDisposableListener(this.labelContainer, EventType.MOUSE_DOWN, e => {
\t\t\tif (e.button === 0 && this.container.id === '${ITEM_ID}') {
\t\t\t\te.preventDefault();
\t\t\t}
\t\t}));

`;

function blobHash(text) {
  const data = Buffer.from(text, 'utf8');
  return crypto.createHash('sha1').update(`blob ${data.length}\0`).update(data).digest('hex');
}
function transform(source) {
  if (source.split(ANCHOR).length !== 2) throw new Error('Expected one constructor anchor.');
  if (source.includes('M1.2 H1 diagnostic:')) throw new Error('Already patched.');
  return source.replace(ANCHOR, HANDLER + ANCHOR);
}
function workingTreeEol(canonical, working) {
  // Git attributes can select native CRLF even when core.autocrlf is false.
  // Permit only that exact checkout conversion, not arbitrary whitespace changes.
  if (working === canonical) return 'lf';
  if (!canonical.includes('\r') && working === canonical.replace(/\n/g, '\r\n')) return 'crlf';
  throw new Error(`Unexpected working-tree source: Git blob ${blobHash(canonical)}, working bytes ${blobHash(working)}.`);
}
function apply(root, variant) {
  if (!['baseline', 'h1'].includes(variant)) throw new Error('Variant must be baseline or h1.');
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
  if (git('rev-parse', 'HEAD') !== UPSTREAM) throw new Error('Wrong upstream revision.');
  if (git('status', '--porcelain')) throw new Error('Upstream checkout must be clean.');
  const file = path.join(root, SOURCE);
  const original = fs.readFileSync(file, 'utf8');
  // Read the pinned object without trim(): final newlines are part of its hash.
  const canonical = execFileSync('git', ['-C', root, 'cat-file', 'blob', `${UPSTREAM}:${SOURCE}`], { encoding: 'utf8' });
  if (blobHash(canonical) !== SOURCE_BLOB) {
    throw new Error(`Unexpected pinned source blob: expected ${SOURCE_BLOB}, got ${blobHash(canonical)}.`);
  }
  const eol = workingTreeEol(canonical, original);
  const source = variant === 'h1' ? transform(canonical) : canonical;
  const result = eol === 'crlf' ? source.replace(/\n/g, '\r\n') : source;
  if (variant === 'h1') fs.writeFileSync(file, result, 'utf8');
  return { upstream: UPSTREAM, variant, source: SOURCE, originalBlob: SOURCE_BLOB,
    testedSourceBlob: blobHash(source), worktreeSourceBlob: blobHash(result), worktreeEol: eol, itemId: ITEM_ID };
}
module.exports = { UPSTREAM, SOURCE, SOURCE_BLOB, ITEM_ID, ANCHOR, HANDLER, blobHash, transform, workingTreeEol, apply };
if (require.main === module) {
  try {
    const [root, variant, manifestPath] = process.argv.slice(2);
    if (!root || !manifestPath) throw new Error('Usage: node host-patch.cjs CHECKOUT baseline|h1 MANIFEST');
    const record = apply(path.resolve(root), variant);
    fs.writeFileSync(path.resolve(manifestPath), JSON.stringify(record, null, 2) + '\n');
    console.log(JSON.stringify(record));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
