const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.join(__dirname, '..');
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
const images = [...readme.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)].map(match => match[1]);

test('README has public commit-pinned image URLs, not relative paths or embedded data', () => {
  assert.equal(images.length, 3);
  for (const image of images) {
    assert.match(image, /^https:\/\/raw\.githubusercontent\.com\/gcalpay\/vscode-universal-dictate\/[0-9a-f]{40}\/media\/(status-bar-controls\.webp|waveform-original\.png|log-spectrogram-original\.png)$/);
  }
  assert.doesNotMatch(readme, /data:image\//);
});

test('both original overlay screenshots are included before Settings', () => {
  const expected = {
    'waveform-original.png': 'd9a8dd14e64402155e1a69b44513323baa6b4b215e04de1ad866994cc610f667',
    'log-spectrogram-original.png': '51693b2191a91132eeb5b6c3053b52bfeea8b3942fb0bbc35f0fa94963b3a560'
  };
  for (const [name, hash] of Object.entries(expected)) {
    const position = readme.indexOf(`media/${name}`);
    assert.ok(position >= 0 && position < readme.indexOf('## Settings'));
    const bytes = fs.readFileSync(path.join(root, 'media', name));
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), hash);
  }
});

test('README preserves the approved agent examples, preview wording and optional default', () => {
  assert.match(readme, /Dictate into editors and agent\/chat prompts such as Codex or Claude Code/);
  assert.match(readme, /including automatic punctuation and live text preview while speaking, and sends/);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(manifest.version, '1.2.0');
  assert.equal(manifest.contributes.configuration.properties['universalDictate.livePreview'].default, false);
  assert.match(readme, /\| \*\*Live preview\*\* \|[^\n]+\| \*\*Off\*\* \|/);
});


test('README document links resolve from the current source checkout', () => {
  const links = [...readme.matchAll(/(?<!!)\[[^\]]*\]\(([^)\s]+)\)/g)].map(match => match[1]);
  for (const link of links) {
    assert.doesNotMatch(link, /github\.com\/gcalpay\/vscode-universal-dictate\/blob\/[0-9a-f]{40}\//,
      'document links must follow the release source, not an older build');
    if (/^https?:/.test(link)) continue;
    assert.ok(fs.existsSync(path.join(root, link)), `missing linked document: ${link}`);
  }
});
