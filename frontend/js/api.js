/* Thin client for the Blog API. */
(function () {
  'use strict';

  const cfg = window.LONGHAND || {};
  const BASE = (cfg.apiBase || '/api/v1').replace(/\/$/, '');
  const KEY = 'longhand.token';

  class ApiError extends Error {
    constructor(status, message) {
      super(message);
      this.status = status;
    }
  }

  const token = {
    get() { try { return localStorage.getItem(KEY); } catch { return null; } },
    set(t) { try { t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY); } catch { /* storage blocked */ } },
  };

  function detailText(d) {
    if (!d) return '';
    if (typeof d === 'string') return d;
    if (Array.isArray(d)) {
      return d
        .map((e) => {
          const field = (e.loc || []).filter((x) => x !== 'body' && x !== 'query' && typeof x === 'string').pop();
          const msg = String(e.msg || 'Invalid value');
          return field ? `${field.charAt(0).toUpperCase() + field.slice(1).replace(/_/g, ' ')}: ${msg}` : msg;
        })
        .join('\n');
    }
    return '';
  }

  async function call(method, path, { body, query } = {}) {
    const url = new URL(BASE + path, location.href);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
      }
    }
    const headers = { Accept: 'application/json' };
    const tk = token.get();
    if (tk) headers.Authorization = 'Bearer ' + tk;
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    let res;
    try {
      res = await fetch(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    } catch {
      throw new ApiError(0, `Can't reach the API at ${BASE}. Check that the server is running and the address in config.js is right.`);
    }

    let data = null;
    if (res.status !== 204) {
      try { data = await res.json(); } catch { /* empty or non-JSON body */ }
    }
    if (!res.ok) {
      if (res.status === 401 && tk && path !== '/auth/login') {
        token.set(null);
        window.dispatchEvent(new Event('longhand:signed-out'));
      }
      throw new ApiError(res.status, detailText(data && data.detail) || `Request failed (${res.status})`);
    }
    return data;
  }

  const enc = encodeURIComponent;

  window.API = {
    BASE,
    ApiError,
    token,
    register: (b) => call('POST', '/auth/register', { body: b }),
    login: (email, password) => call('POST', '/auth/login', { body: { email, password } }),
    me: () => call('GET', '/users/me'),
    updateMe: (b) => call('PUT', '/users/me', { body: b }),

    posts: (q) => call('GET', '/posts', { query: q }),
    popular: (q) => call('GET', '/posts/popular', { query: q }),
    post: (id) => call('GET', `/posts/${id}`),
    createPost: (b) => call('POST', '/posts', { body: b }),
    updatePost: (id, b) => call('PUT', `/posts/${id}`, { body: b }),
    deletePost: (id) => call('DELETE', `/posts/${id}`),
    like: (id) => call('POST', `/posts/${id}/like`),
    unlike: (id) => call('DELETE', `/posts/${id}/like`),
    bookmark: (id) => call('POST', `/posts/${id}/bookmark`),
    unbookmark: (id) => call('DELETE', `/posts/${id}/bookmark`),

    categories: () => call('GET', '/categories'),
    createCategory: (name) => call('POST', '/categories', { body: { name } }),
    tags: () => call('GET', '/tags'),

    comments: (id, q) => call('GET', `/posts/${id}/comments`, { query: q }),
    addComment: (id, b) => call('POST', `/posts/${id}/comments`, { body: b }),

    profile: (u) => call('GET', `/profiles/${enc(u)}`),
    follow: (u) => call('POST', `/profiles/${enc(u)}/follow`),
    unfollow: (u) => call('DELETE', `/profiles/${enc(u)}/follow`),
  };
})();
