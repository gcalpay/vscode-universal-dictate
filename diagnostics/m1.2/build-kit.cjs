'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '../..');
const out = path.resolve(process.argv[2] || path.join(root, '.m12-kit'));
const relative = path.relative(root, out);
if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Output must be a NEW subdirectory of this checkout.');
if (fs.existsSync(out)) throw new Error(`Refusing to overwrite ${out}. Choose a new output directory.`);
const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
if (git('hash-object', 'src/extension.ts') !== '12dea2216e01768f8a5699c10151aecea371d6ff') {
  throw new Error('Probe requires the reviewed baseline controller; reassess changed runtime before building.');
}
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (`${packageJson.publisher}.${packageJson.name}` !== 'gcalpay.vscode-universal-dictate') throw new Error('Wrong extension identity.');
for (const file of ['dist/extension.js', 'dist/core/dictation.js', 'resources/bin/windows-fast-paste.exe',
  'resources/bin/universal-dictate-recorder.exe', 'resources/bin/m12-release-gate.exe']) {
  if (!fs.existsSync(path.join(root, file))) throw new Error(`Build prerequisite missing: ${file}`);
}
fs.mkdirSync(out);
const extension = path.join(out, 'extension');
fs.mkdirSync(extension);
for (const dir of ['dist', 'media', 'third_party']) {
  if (fs.existsSync(path.join(root, dir))) fs.cpSync(path.join(root, dir), path.join(extension, dir), { recursive: true });
}
fs.mkdirSync(path.join(extension, 'resources', 'bin'), { recursive: true });
for (const file of ['windows-fast-paste.exe', 'universal-dictate-recorder.exe', 'm12-release-gate.exe']) {
  fs.copyFileSync(path.join(root, 'resources', 'bin', file), path.join(extension, 'resources', 'bin', file));
}
for (const file of ['LICENSE', 'THIRD_PARTY_NOTICES.md']) fs.copyFileSync(path.join(root, file), path.join(extension, file));
fs.copyFileSync(path.join(__dirname, 'probe.cjs'), path.join(extension, 'dist', 'm12-probe.cjs'));
packageJson.main = './dist/m12-probe.cjs';
packageJson.displayName = 'Universal Dictate (M1.2 diagnostic ONLY)';
packageJson.private = true;
packageJson.scripts = { 'vscode:prepublish': 'node -e "throw new Error(\'Diagnostic only; do not publish\')"' };
fs.writeFileSync(path.join(extension, 'package.json'), JSON.stringify(packageJson, null, 2) + '\n');
for (const file of ['launch.ps1', 'README.md']) fs.copyFileSync(path.join(__dirname, file), path.join(out, file));
fs.writeFileSync(path.join(out, 'probe-manifest.json'), JSON.stringify({
  diagnostic: 'M1.2', commit: git('rev-parse', 'HEAD'), extensionBase: 'f0265bc4398643c3b3a27e6d2ad64183b115b6ba',
  transcript: 'UD_TEST', releaseChord: 'Ctrl+Alt+Shift+F8', runtimeAcceptance: 'Not run'
}, null, 2) + '\n');
console.log(`Diagnostic development kit: ${out}`);
