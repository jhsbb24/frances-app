// ─────────────────────────────────────────────────────────────
// Conexión con GitHub (API REST «Contents»).
// Lee y escribe data.json en tu repositorio privado.
// El token SOLO se envía a api.github.com, en la cabecera
// Authorization. Nunca aparece en direcciones ni en registros.
// ─────────────────────────────────────────────────────────────
import { API_BASE, DATA_PATH, TIMING } from './config.js';

export class GitHubError extends Error {
  /**
   * kind: 'network' (sin conexión), 'auth' (token), 'notfound',
   *       'conflict' (el archivo cambió), 'ratelimit', 'server', 'other'
   */
  constructor(kind, message, status = 0, retryAfterMs = 0) {
    super(message);
    this.kind = kind;
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

// ── Base64 con acentos (UTF-8) ────────────────────────────────

export function encodeBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export function decodeBase64(b64) {
  const binary = atob(String(b64).replace(/\s/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/** Acepta "usuario/repo" o una dirección https://github.com/usuario/repo */
export function parseRepo(text) {
  const value = String(text || '').trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '').replace(/\/+$/, '');
  const m = value.match(/^([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)$/);
  return m ? { owner: m[1], repo: m[2], full: `${m[1]}/${m[2]}` } : null;
}

/** Muestra solo el principio y el final del token. */
export function maskToken(token) {
  const t = String(token || '');
  if (!t) return '';
  if (t.length <= 12) return '••••';
  const prefix = t.startsWith('github_pat_') ? 'github_pat_' : t.slice(0, 4);
  return `${prefix}…${t.slice(-4)}`;
}

/**
 * Crea el cliente de GitHub.
 * getToken() y getRepo() se leen en cada petición, así un cambio en
 * Ajustes se aplica enseguida.
 */
export function createGitHubApi({ getToken, getRepo, fetchFn = (...args) => fetch(...args), timeoutMs = TIMING.timeout }) {
  function target() {
    const repo = parseRepo(getRepo());
    if (!repo) throw new GitHubError('other', 'El nombre del repositorio no es válido. Escríbelo como usuario/repositorio.');
    return repo;
  }

  async function request(method, path, body, { ifNoneMatch = '', withEtag = false } = {}) {
    const token = getToken();
    if (!token) throw new GitHubError('auth', 'Falta el token de GitHub. Ponlo en Ajustes.');
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    let res;
    try {
      res = await fetchFn(API_BASE + path, {
        method,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          // «¿Ha cambiado desde la última vez?» Si no, GitHub responde 304 sin datos.
          ...(ifNoneMatch ? { 'If-None-Match': ifNoneMatch } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        cache: 'no-store', // nunca usar una copia vieja guardada por el navegador
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        signal: controller?.signal,
      });
    } catch {
      throw new GitHubError('network', 'No hay conexión con GitHub.');
    } finally {
      if (timer) clearTimeout(timer);
    }
    if (res.status === 304) return { notModified: true };
    if (res.ok) {
      const json = res.status === 204 ? null : await res.json();
      return withEtag ? { json, etag: res.headers.get('etag') || '' } : json;
    }

    let message = '';
    try {
      message = (await res.json()).message || '';
    } catch {
      /* respuesta sin JSON */
    }
    const s = res.status;
    const remaining = res.headers.get('x-ratelimit-remaining');
    const retryAfter = Number(res.headers.get('retry-after')) || 0;
    if (s === 401) throw new GitHubError('auth', 'GitHub no acepta el token (puede haber caducado). Pon uno nuevo en Ajustes.', s);
    if (s === 429 || (s === 403 && (remaining === '0' || /rate limit/i.test(message)))) {
      throw new GitHubError('ratelimit', 'GitHub pide esperar un poco antes de seguir guardando. Se reintentará solo.', s, retryAfter * 1000 || 60000);
    }
    if (s === 403) throw new GitHubError('auth', 'El token no tiene permiso para escribir. Revisa que tenga «Contents: Read and write».', s);
    if (s === 404) throw new GitHubError('notfound', 'No encuentro el repositorio, o el token no tiene acceso a él.', s);
    if (s === 409 || (s === 422 && /sha/i.test(message))) throw new GitHubError('conflict', 'El archivo cambió en GitHub.', s);
    if (s >= 500) throw new GitHubError('server', 'GitHub no responde bien ahora mismo. Se reintentará solo.', s);
    throw new GitHubError('other', `GitHub respondió con un error (${s}). ${message}`.trim(), s);
  }

  const contentsPath = () => {
    const { owner, repo } = target();
    return `/repos/${owner}/${repo}/contents/${DATA_PATH}`;
  };

  // Última lectura: si GitHub dice que el archivo no ha cambiado (304),
  // no hace falta volver a descargarlo entero (con el plan, son cientos de KB).
  let last = null; // { path, etag, result }

  /** GET del archivo, preguntando antes si cambió. */
  async function getContents() {
    const path = contentsPath();
    const cached = last && last.path === path ? last : null;
    if (cached) {
      try {
        const res = await request('GET', path, undefined, { ifNoneMatch: cached.etag, withEtag: true });
        if (res.notModified) return { unchanged: cached.result };
        return res;
      } catch (err) {
        if (['auth', 'notfound', 'ratelimit'].includes(err.kind)) throw err;
        // Por si algún navegador no admite la pregunta: se pide entero.
      }
    }
    const res = await request('GET', path, undefined, { withEtag: true });
    if (res.notModified) throw new GitHubError('other', 'GitHub respondió «sin cambios» sin haber datos anteriores.');
    return res;
  }

  return {
    isConfigured: () => Boolean(getToken()) && Boolean(parseRepo(getRepo())),

    /** Devuelve { sha, text } o null si data.json todavía no existe. */
    async readFile() {
      let res;
      try {
        res = await getContents();
      } catch (err) {
        last = null;
        if (err.kind !== 'notfound') throw err;
        // ¿Falta el archivo o falta el repositorio?
        const { owner, repo } = target();
        await request('GET', `/repos/${owner}/${repo}`); // lanza 'notfound' si no hay acceso
        return null;
      }
      if (res.unchanged) return { ...res.unchanged };
      const json = res.json;
      if (!json || Array.isArray(json) || json.type !== 'file') {
        throw new GitHubError('other', `«${DATA_PATH}» no es un archivo en el repositorio.`);
      }
      let text;
      if (json.encoding === 'base64' && json.content) {
        text = decodeBase64(json.content);
      } else {
        // Archivos de más de 1 MB: GitHub no manda el contenido aquí.
        const { owner, repo } = target();
        const blob = await request('GET', `/repos/${owner}/${repo}/git/blobs/${json.sha}`);
        text = decodeBase64(blob.content);
      }
      const result = { sha: json.sha, text };
      last = res.etag ? { path: contentsPath(), etag: res.etag, result } : null;
      return { ...result };
    },

    /** Guarda el texto como un commit. `sha` = versión que reemplazamos (null si es nuevo). */
    async writeFile(text, sha, message) {
      const body = { message, content: encodeBase64(text) };
      if (sha) body.sha = sha;
      const json = await request('PUT', contentsPath(), body);
      return { sha: json.content.sha, commitUrl: json.commit?.html_url || '' };
    },

    /** Para «Probar conexión» en Ajustes. */
    async checkAccess() {
      const { owner, repo } = target();
      const info = await request('GET', `/repos/${owner}/${repo}`);
      return {
        fullName: info.full_name,
        isPrivate: Boolean(info.private),
        canWrite: info.permissions ? Boolean(info.permissions.push) : null,
        defaultBranch: info.default_branch || 'main',
      };
    },
  };
}
