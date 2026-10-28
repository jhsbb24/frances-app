// ─────────────────────────────────────────────────────────────
// GitHub FALSO para las pruebas (solo se usa en tests/).
// Imita la API «Contents» de GitHub en memoria: sha de cada
// versión, 404 si el archivo no existe, 409/422 si el sha no
// coincide, commits con su mensaje y modo «sin conexión».
// ─────────────────────────────────────────────────────────────
import { createHash } from 'node:crypto';

export const TOKEN = 'github_pat_PRUEBA_1234567890abcdefXYZ9';
export const REPO = 'jhsbb24/frances-datos';

/** sha de git para un archivo («blob <tamaño>\0<contenido>»). */
export function gitSha(text) {
  const bytes = Buffer.from(text, 'utf8');
  return createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes])).digest('hex');
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type, x-github-api-version, accept',
  'access-control-allow-methods': 'GET, PUT, OPTIONS',
  'access-control-expose-headers': 'x-ratelimit-remaining, retry-after',
};

export function createFakeGitHub({ token = TOKEN, repo = REPO, path = 'data.json' } = {}) {
  const gh = {
    file: null, // { text, sha }
    commits: [], // { message, sha, text }
    requests: [], // { method, url }
    offline: false,
    loseNextPutResponse: false,
    serveStaleOnce: false,
    puts: 0,
    gets: 0,

    /** Otro dispositivo guarda una versión distinta. */
    setRemote(text, message = 'Cambio desde otro dispositivo') {
      const sha = gitSha(text);
      gh.file = { text, sha };
      gh.commits.push({ message, sha, text });
      return sha;
    },

    json() {
      return gh.file ? JSON.parse(gh.file.text) : null;
    },

    handle({ method, url, headers = {}, body = '' }) {
      gh.requests.push({ method, url });
      const reply = (status, data) => ({ status, headers: { 'content-type': 'application/json; charset=utf-8', ...CORS }, body: data === undefined ? '' : JSON.stringify(data) });
      if (method === 'OPTIONS') return { status: 204, headers: CORS, body: '' };
      if (gh.offline) return { network: true };
      const auth = headers.authorization || headers.Authorization || '';
      if (auth !== `Bearer ${token}`) return reply(401, { message: 'Bad credentials' });

      const u = new URL(url);
      if (u.origin !== 'https://api.github.com') return reply(400, { message: 'Origen inesperado' });
      const repoPath = `/repos/${repo}`;
      const contentsPath = `${repoPath}/contents/${path}`;

      if (method === 'GET' && u.pathname === repoPath) {
        return reply(200, { full_name: repo, private: true, default_branch: 'main', permissions: { push: true } });
      }
      if (method === 'GET' && u.pathname === contentsPath) {
        gh.gets += 1;
        if (!gh.file) return reply(404, { message: 'Not Found' });
        let file = gh.file;
        if (gh.serveStaleOnce && gh.commits.length >= 2) {
          // GitHub a veces tarda un instante en mostrar el último commit.
          gh.serveStaleOnce = false;
          file = gh.commits[gh.commits.length - 2];
        }
        const b64 = Buffer.from(file.text, 'utf8').toString('base64').replace(/(.{60})/g, '$1\n');
        return reply(200, { type: 'file', name: path, path, sha: file.sha, size: file.text.length, encoding: 'base64', content: b64 });
      }
      if (method === 'PUT' && u.pathname === contentsPath) {
        const data = JSON.parse(body || '{}');
        if (gh.file && !data.sha) return reply(422, { message: 'Invalid request.\n\n"sha" wasn\'t supplied.' });
        if (gh.file && data.sha !== gh.file.sha) return reply(409, { message: `${path} does not match ${data.sha}` });
        if (!gh.file && data.sha) return reply(409, { message: `${path} does not match ${data.sha}` });
        const created = !gh.file;
        const text = Buffer.from(data.content, 'base64').toString('utf8');
        const sha = gitSha(text);
        gh.file = { text, sha };
        gh.commits.push({ message: data.message, sha, text });
        gh.puts += 1;
        if (gh.loseNextPutResponse) {
          gh.loseNextPutResponse = false;
          return { network: true }; // GitHub guardó, pero la respuesta no llegó
        }
        return reply(created ? 201 : 200, { content: { name: path, path, sha }, commit: { sha: `c${gh.commits.length}`, message: data.message, html_url: `https://github.com/${repo}/commit/c${gh.commits.length}` } });
      }
      return reply(404, { message: 'Not Found' });
    },

    /** fetch() falso para Node. */
    async fetch(url, options = {}) {
      const headers = {};
      for (const [k, v] of Object.entries(options.headers || {})) headers[k.toLowerCase()] = v;
      const res = gh.handle({ method: options.method || 'GET', url, headers, body: options.body || '' });
      if (res.network) throw new TypeError('Failed to fetch');
      return new Response(res.body || null, { status: res.status, headers: res.headers });
    },
  };
  return gh;
}
