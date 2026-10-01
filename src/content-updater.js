const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');

const OWNER = 'vektolab';
const REPO = 'vektolab-vektolab-assistant-updates';
const BRANCH = 'main';
const MANIFEST_URL = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/content/manifest.json`;

function requestBuffer(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('Demasiadas redirecciones'));
    https.get(url, { headers: { 'User-Agent': 'Vektolab-Assistant' } }, res => {
      const code = res.statusCode || 0;
      if (code >= 300 && code < 400 && res.headers.location) {
        res.resume();
        return requestBuffer(new URL(res.headers.location, url).toString(), redirects + 1).then(resolve, reject);
      }
      if (code !== 200) {
        res.resume();
        return reject(new Error(`GitHub respondió HTTP ${code}`));
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function safeRelativePath(rel) {
  const normalized = path.posix.normalize(rel.replace(/\\/g, '/'));
  return normalized.startsWith('../') || normalized.startsWith('/') || normalized.includes('/../') ? null : normalized;
}

class ContentUpdater {
  constructor(app) {
    this.app = app;
    this.root = path.join(app.getPath('userData'), 'content');
    this.state = { status: 'idle', version: null, percent: 0, updated: 0, error: null };
  }

  getState() { return this.state; }

  emit(next) {
    this.state = { ...this.state, ...next };
    if (this.onState) this.onState(this.state);
  }

  async ensureSeeded() {
    if (fs.existsSync(path.join(this.root, 'manifest.json'))) return;
    const bundled = path.join(__dirname, '..', 'content');
    if (!fs.existsSync(bundled)) return;
    fs.mkdirSync(this.root, { recursive: true });
    fs.cpSync(bundled, this.root, { recursive: true });
  }

  async sync() {
    if (this.state.status === 'checking' || this.state.status === 'downloading') return this.state;
    try {
      await this.ensureSeeded();
      this.emit({ status: 'checking', error: null, percent: 0 });
      const manifestBuffer = await requestBuffer(MANIFEST_URL);
      const manifest = JSON.parse(manifestBuffer.toString('utf8'));
      if (!manifest || !Array.isArray(manifest.files)) throw new Error('Manifest de contenido inválido');

      const localManifestPath = path.join(this.root, 'manifest.json');
      let localManifest = null;
      try { localManifest = JSON.parse(fs.readFileSync(localManifestPath, 'utf8')); } catch (_) {}
      const localMap = new Map((localManifest?.files || []).map(f => [f.path, f.sha256]));
      const remoteMap = new Map(manifest.files.map(f => [f.path, f.sha256]));
      const changed = manifest.files.filter(f => localMap.get(f.path) !== f.sha256);
      const removed = (localManifest?.files || []).filter(f => !remoteMap.has(f.path));

      if (!changed.length && !removed.length) {
        fs.mkdirSync(this.root, { recursive: true });
        fs.writeFileSync(localManifestPath, manifestBuffer);
        this.emit({ status: 'up-to-date', version: manifest.contentVersion || null, percent: 100, updated: 0 });
        return this.state;
      }

      this.emit({ status: 'downloading', version: manifest.contentVersion || null, percent: 0, updated: 0 });
      let done = 0;
      const total = changed.length + removed.length;
      for (const file of changed) {
        const rel = safeRelativePath(file.path);
        if (!rel) throw new Error(`Ruta no permitida: ${file.path}`);
        const url = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/${rel.split('/').map(encodeURIComponent).join('/')}`;
        const data = await requestBuffer(url);
        if (sha256(data) !== file.sha256) throw new Error(`SHA inválido para ${file.path}`);
        const localRel = rel.startsWith('content/') ? rel.slice('content/'.length) : rel;
        const target = path.join(this.root, localRel);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        const temp = `${target}.tmp`;
        fs.writeFileSync(temp, data);
        fs.renameSync(temp, target);
        done++;
        this.emit({ percent: Math.round(done / total * 100), updated: done });
      }
      for (const file of removed) {
        const rel = safeRelativePath(file.path);
        if (!rel) continue;
        const localRel = rel.startsWith('content/') ? rel.slice('content/'.length) : rel;
        const target = path.join(this.root, localRel);
        if (fs.existsSync(target)) fs.rmSync(target, { force: true });
        done++;
        this.emit({ percent: Math.round(done / total * 100), updated: done });
      }

      fs.writeFileSync(localManifestPath, manifestBuffer);
      this.emit({ status: 'updated', version: manifest.contentVersion || null, percent: 100, updated: done, error: null });
      return this.state;
    } catch (error) {
      console.warn('[Vektolab] content update:', error.message);
      this.emit({ status: 'error', error: error.message, percent: 0 });
      return this.state;
    }
  }

  localRoot() { return this.root; }
}

module.exports = { ContentUpdater };
