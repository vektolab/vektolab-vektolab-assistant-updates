const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const projectRoot = path.resolve(__dirname, '..');
const root = path.join(projectRoot, 'content');
const output = path.join(root, 'manifest.json');
const files = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (full !== output) {
      const rel = path.relative(projectRoot, full).split(path.sep).join('/');
      const sha256 = crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');
      files.push({ path: rel, sha256 });
    }
  }
}

walk(root);
files.sort((a, b) => a.path.localeCompare(b.path));

const manifest = {
  schemaVersion: 1,
  files
};

fs.writeFileSync(output, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Manifest generado: ${files.length} archivos`);
