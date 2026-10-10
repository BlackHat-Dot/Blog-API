/* Longhand — single-page frontend for the Blog API (hash routing, no build step). */
(function () {
  'use strict';

  const CFG = window.LONGHAND || {};
  const APP = CFG.appName || 'Longhand';
  const API = window.API;
  const MD = window.MD;
  const esc = MD.esc;

  const $ = (s, r = document) => r.querySelector(s);
  const main = $('#main');

  try { localStorage.removeItem('longhand.gemini_key'); } catch {}

  /* ------------------------------------------------------------------ helpers */
  const S = { me: null, cats: null, tags: null, likes: new Set(), marks: new Set() };
  let nav = 0;
  let ctx = {};

  const slugify = (v) => v.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  const fmtDate = (iso) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const plural = (n, w) => `${Number(n).toLocaleString()} ${w}${n === 1 ? '' : 's'}`;
  const lenPct = (m) => Math.min(100, Math.round(12 + Math.log2(Math.max(1, m)) * 21));
  const words = (t) => (String(t).match(/[\p{L}\p{N}_]+/gu) || []).length;

  function timeAgo(iso) {
    const d = new Date(iso);
    const s = (Date.now() - d.getTime()) / 1000;
    const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
    if (s < 60) return 'just now';
    if (s < 3600) return rtf.format(-Math.floor(s / 60), 'minute');
    if (s < 86400) return rtf.format(-Math.floor(s / 3600), 'hour');
    if (s < 86400 * 30) return rtf.format(-Math.floor(s / 86400), 'day');
    return fmtDate(iso);
  }

  const postHref = (p) => `#/post/${p.id}/${encodeURIComponent(p.slug)}`;
  const userHref = (u) => `#/u/${encodeURIComponent(u)}`;

  const I = {
    heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2Z"/></svg>',
    mark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5h10a1 1 0 0 1 1 1V20l-6-4-6 4V5.5a1 1 0 0 1 1-1Z"/></svg>',
    chat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 5h13a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H11l-4.5 3.5V16h-1A1.5 1.5 0 0 1 4 14.5v-8A1.5 1.5 0 0 1 5.5 5Z"/></svg>',
  };

  function toast(msg, kind) {
    const el = document.createElement('div');
    el.className = 'toast' + (kind ? ' ' + kind : '');
    el.textContent = msg;
    $('#toasts').append(el);
    setTimeout(() => el.classList.add('out'), 3800);
    setTimeout(() => el.remove(), 4300);
  }

  function confirmDialog({ title, body, confirm = 'Delete' }) {
    return new Promise((resolve) => {
      const d = $('#dlg');
      d.innerHTML = `<form method="dialog"><h2>${esc(title)}</h2><p>${esc(body)}</p>
        <div class="row"><button class="btn btn-danger" value="ok">${esc(confirm)}</button>
        <button class="btn btn-ghost" value="cancel">Cancel</button></div></form>`;
      d.returnValue = '';
      d.addEventListener('close', () => resolve(d.returnValue === 'ok'), { once: true });
      d.showModal();
    });
  }

  /* keep keyboard focus on the same control after re-rendering its container */
  function swap(el, html) {
    const act = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.act : null;
    const inside = el.contains(document.activeElement);
    el.innerHTML = html;
    if (inside && act) {
      const again = el.querySelector(`[data-act="${act}"]`);
      if (again) again.focus({ preventScroll: true });
    }
  }

  async function busy(btn, fn) {
    if (btn) btn.disabled = true;
    try { return await fn(); } finally { if (btn) btn.disabled = false; }
  }

  /* per-account memory of what this browser has liked / saved (the API does not report it) */
  const lsKey = (n) => `longhand.${n}.${S.me ? S.me.id : 'anon'}`;
  const loadSet = (n) => { try { return new Set(JSON.parse(localStorage.getItem(lsKey(n)) || '[]')); } catch { return new Set(); } };
  const saveSet = (n, set) => { try { localStorage.setItem(lsKey(n), JSON.stringify([...set])); } catch { /* storage blocked */ } };

  function needAuth(msg) {
    try { sessionStorage.setItem('longhand.next', location.hash || '#/'); } catch { /* ignore */ }
    if (msg) toast(msg);
    location.hash = '#/login';
  }

  const getCats = async () => (S.cats = S.cats || (await API.categories()));
  const getTags = async () => (S.tags = S.tags || (await API.tags()));

  /* ------------------------------------------------------------------ chrome */
  function renderBar() {
    const me = S.me;
    $('#bar').innerHTML = `<div class="bar-in">
      <a class="brand" href="#/">${esc(APP)}</a>
      <nav aria-label="Primary">
        <a href="#/" data-nav="home">Read</a>
        <a href="#/saved" data-nav="saved">Saved</a>
        ${me ? `<a href="#/profile" data-nav="profile">Profile</a>` : ''}
      </nav>
      <div class="bar-end">${
        me
          ? `<a class="btn" href="#/write">Write</a>
             <details class="menu"><summary aria-label="Account menu">${esc(me.username)}</summary>
               <div class="menu-pop">
                 <a href="#/profile">Your profile</a>
                 <button type="button" class="btn-quiet" style="text-align:left;padding:8px 12px;color:var(--ink);width:100%" data-act="edit-profile">Edit profile</button>
                 <a href="${userHref(me.username)}?tab=drafts">Your drafts</a>
                 <a href="#/saved">Saved posts</a>
                 <button type="button" data-act="signout">Sign out</button>
               </div></details>`
          : `<a class="btn-quiet" href="#/login">Sign in</a><a class="btn" href="#/register">Create account</a>`
      }</div></div>`;
    $('#foot').innerHTML = `<span>${esc(APP)}</span><a href="${esc(API.BASE)}/docs" target="_blank" rel="noopener">API reference</a>`;
  }

  function setActiveNav(parts) {
    const key = !parts[0] ? 'home' : parts[0] === 'saved' ? 'saved' : (parts[0] === 'profile' || parts[0] === 'me' || (parts[0] === 'u' && S.me && parts[1] === S.me.username)) ? 'profile' : '';
    document.querySelectorAll('[data-nav]').forEach((a) => {
      if (a.dataset.nav === key) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  }

  function message(title, text, actions = '') {
    document.title = `${title} – ${APP}`;
    main.innerHTML = `<div class="msg"><h1>${esc(title)}</h1><p>${esc(text)}</p><div class="row">${actions}</div></div>`;
  }

  function viewError(e) {
    if (e && e.status === 0) {
      const currentApi = (window.LONGHAND && window.LONGHAND.apiBase) || '';
      message(
        "Can't reach the backend API",
        `${e.message}\n\nCurrent API Endpoint: ${currentApi}`,
        `<button class="btn" data-act="retry">Try again</button>
         <button class="btn btn-ghost" data-act="change-api">Change API URL</button>`
      );
    } else if (e && e.status === 403) {
      message("You can't do that", e.message, '<a class="btn btn-ghost" href="#/">Back to posts</a>');
    } else {
      message('Something went wrong', (e && e.message) || 'Unexpected error.', '<button class="btn" data-act="retry">Try again</button>');
    }
  }

  const notFound = (what) => message('Not found', `That ${what} doesn't exist, or it was removed.`, '<a class="btn btn-ghost" href="#/">Back to posts</a>');

  /* ------------------------------------------------------------------ feed pieces */
  function entry(p, { lead = false, i = 0, byline = true } = {}) {
    const sum = p.summary || MD.excerpt(p.body, lead ? 260 : 200);
    const mine = S.me && p.author && S.me.username === p.author.username;
    return `<article class="entry${lead ? ' lead' : ''}">
      <div class="len" style="--w:${lenPct(p.read_time)}%;--n:${Math.min(i, 8)}" aria-hidden="true"><i></i></div>
      <h2 class="entry-title"><a href="${postHref(p)}">${esc(p.title)}</a></h2>
      ${sum ? `<p class="entry-sum">${esc(sum)}</p>` : ''}
      <p class="entry-meta">
        ${byline ? `<a class="by" href="${userHref(p.author.username)}">${esc(p.author.username)}</a>` : ''}
        <time datetime="${esc(p.created_at)}">${fmtDate(p.created_at)}</time>
        <span>${p.read_time} min read</span>
        ${p.like_count ? `<span>${plural(p.like_count, 'like')}</span>` : ''}
        ${p.comment_count ? `<span>${plural(p.comment_count, 'comment')}</span>` : ''}
        ${p.state === 'draft' ? '<span class="flag">Draft</span>' : ''}
        ${mine ? `<span class="own" style="margin-left:auto"><a href="#/edit/${p.id}">Edit</a><button class="btn-quiet" style="padding:0;margin-left:8px" data-act="delete-entry-post" data-id="${p.id}">Delete</button></span>` : ''}
      </p></article>`;
  }

  function mountList({ list, more, first, load, lead = false, byline = true }) {
    const items = [...first.items];
    let total = first.total;
    const paint = (chunk, start) => chunk.map((p, k) => entry(p, { lead: lead && start + k === 0, i: start + k, byline })).join('');
    list.innerHTML = paint(items, 0);
    list.classList.add('anim');
    const sync = () => { more.hidden = items.length >= total; };
    sync();
    ctx.more = async () => {
      more.disabled = true;
      try {
        const r = await load(items.length);
        const start = items.length;
        items.push(...r.items);
        total = r.total;
        list.classList.remove('anim');
        list.insertAdjacentHTML('beforeend', paint(r.items, start));
      } catch (e) { toast(e.message, 'bad'); }
      more.disabled = false;
      sync();
    };
  }

  const skeleton = (n = 3) => `<div class="skel" aria-hidden="true">${'<div class="s-t"></div><div class="s-l"></div><div class="s-m"></div><div style="height:28px"></div>'.repeat(n)}</div>`;

  /* ------------------------------------------------------------------ home */
  async function viewHome(q, id) {
    const sort = q.get('sort') === 'popular' ? 'popular' : 'latest';
    const f = { search: q.get('q') || '', category: q.get('category') || '', tag: q.get('tag') || '' };
    const filtered = !!(f.search || f.category || f.tag);
    const popular = sort === 'popular' && !filtered;
    document.title = APP;
    main.innerHTML = `<div class="home"><div></div><div>${skeleton()}</div></div>`;

    const LIMIT = 12;
    const load = (offset) => (popular ? API.popular({ limit: LIMIT, offset }) : API.posts({ search: f.search, category: f.category, tag: f.tag, limit: LIMIT, offset }));
    const [cats, tags, page] = await Promise.all([getCats(), getTags(), load(0)]);
    if (id !== nav) return;

    const catName = f.category ? (cats.find((c) => c.slug === f.category) || {}).name || f.category : '';
    const tagName = f.tag ? tags.find((t) => slugify(t) === f.tag) || f.tag : '';
    let title = '';
    if (f.search) title = `Results for “${f.search}”`;
    else if (catName) title = catName;
    else if (tagName) title = `Tagged ${tagName}`;

    const catLinks = [`<li><a href="#/" ${!filtered && !popular ? 'aria-current="true"' : ''}>All posts</a></li>`]
      .concat(cats.map((c) => `<li><a href="#/?category=${encodeURIComponent(c.slug)}" ${f.category === c.slug ? 'aria-current="true"' : ''}>${esc(c.name)}</a></li>`)).join('');
    const tagLinks = tags.slice(0, 20).map((t) => `<a href="#/?tag=${encodeURIComponent(slugify(t))}" ${f.tag === slugify(t) ? 'aria-current="true"' : ''}>${esc(t)}</a>`).join('');

    main.innerHTML = `<div class="home">
      <aside class="rail" aria-label="Browse">
        <form class="search" role="search" data-form="search">
          <label class="sr" for="q">Search posts</label>
          <input id="q" name="q" type="search" placeholder="Search posts" value="${esc(f.search)}" autocomplete="off">
        </form>
        ${cats.length ? `<section class="cats"><h2>Categories</h2><ul>${catLinks}</ul></section>` : ''}
        ${tags.length ? `<section class="tags"><h2>Topics</h2><div>${tagLinks}</div></section>` : ''}
      </aside>
      <section aria-label="Posts">
        ${title
          ? `<header class="feed-head"><h1>${esc(title)}</h1><p>${plural(page.total, 'post')} <a href="#/">Clear</a></p></header>`
          : `<h1 class="sr">${popular ? 'Most liked posts' : 'Latest posts'}</h1>
             <nav class="sortbar" aria-label="Order"><a href="#/" ${!popular ? 'aria-current="true"' : ''}>Latest</a><a href="#/?sort=popular" ${popular ? 'aria-current="true"' : ''}>Most liked</a></nav>`}
        <div id="feed-list"></div>
        <button class="btn btn-ghost more" data-act="more" hidden>Show more posts</button>
      </section></div>`;

    const list = $('#feed-list');
    if (!page.items.length) {
      list.innerHTML = filtered
        ? `<div class="empty"><h2>Nothing matches</h2><p>Try fewer words, or browse all posts.</p><a class="btn btn-ghost" href="#/">Show all posts</a></div>`
        : `<div class="empty"><h2>No posts yet</h2><p>Be the first to publish something here.</p>${S.me ? '<a class="btn" href="#/write">Write a post</a>' : '<a class="btn" href="#/register">Create an account</a>'}</div>`;
      return;
    }
    mountList({ list, more: $('.more'), first: page, load, lead: !f.search });
  }

  /* ------------------------------------------------------------------ post */
  function actionsHtml(p) {
    const liked = (p && typeof p.is_liked === 'boolean') ? p.is_liked : S.likes.has(p.id);
    const saved = (p && typeof p.is_bookmarked === 'boolean') ? p.is_bookmarked : S.marks.has(p.id);
    return `
      <button class="act" data-act="like" aria-pressed="${liked}" aria-label="${liked ? 'Unlike' : 'Like'} this post">${I.heart}<span>${p.like_count}</span></button>
      <button class="act" data-act="bookmark" aria-pressed="${saved}" aria-label="${saved ? 'Remove from saved' : 'Save this post'}">${I.mark}<span>${p.bookmark_count}</span></button>
      <button class="act" data-act="to-comments" aria-label="Go to comments">${I.chat}<span>${p.comment_count}</span></button>`;
  }

  function authorCardHtml(p, prof) {
    const mine = S.me && S.me.username === p.author.username;
    const follow = prof && !mine
      ? `<button class="btn ${prof.is_following ? 'btn-ghost' : ''}" data-act="follow" data-user="${esc(p.author.username)}" aria-pressed="${prof.is_following}">${prof.is_following ? 'Following' : 'Follow'}</button>`
      : '';
    return `<div><h2><a href="${userHref(p.author.username)}">${esc(p.author.username)}</a></h2>
      ${p.author.bio ? `<p>${esc(p.author.bio)}</p>` : ''}
      ${prof ? `<p class="muted">${plural(prof.post_count, 'post')}, ${plural(prof.follower_count, 'follower')}</p>` : ''}</div>${follow}`;
  }

  function commentsHtml(list) {
    const known = new Set(list.map((c) => c.id));
    const kids = new Map();
    list.forEach((c) => {
      if (c.parent_id && known.has(c.parent_id)) {
        if (!kids.has(c.parent_id)) kids.set(c.parent_id, []);
        kids.get(c.parent_id).push(c);
      }
    });
    const roots = list.filter((c) => !c.parent_id || !known.has(c.parent_id));
    const who = (c) => (c.author && c.author.username) || c.author_username || c.username || (S.me && c.author_id === S.me.id ? 'You' : `Member ${c.author_id}`);
    const node = (c, depth) => {
      const ch = kids.get(c.id) || [];
      return `<li class="cm" id="cm-${c.id}">
        <div class="cm-head"><span class="cm-who">${esc(who(c))}</span><time datetime="${esc(c.created_at)}">${timeAgo(c.created_at)}</time></div>
        <p class="cm-body">${esc(c.body)}</p>
        <button class="btn-quiet cm-reply-btn" data-act="reply" data-id="${c.id}">Reply</button>
        <div class="cm-slot" id="slot-${c.id}" hidden></div>
        ${ch.length ? `<ol class="cm-replies${depth >= 2 ? ' flat' : ''}">${ch.map((k) => node(k, depth + 1)).join('')}</ol>` : ''}
      </li>`;
    };
    return roots.map((c) => node(c, 0)).join('');
  }

  function commentForm(parent) {
    const pid = parent ? `-r${parent}` : '';
    return `<form class="cm-form" data-form="comment" data-parent="${parent || ''}">
      <label class="sr" for="cm-body${pid}">${parent ? 'Your reply' : 'Add a comment'}</label>
      <textarea id="cm-body${pid}" name="body" rows="3" placeholder="${parent ? 'Write a reply' : 'Add a comment'}" required></textarea>
      <div class="row"><button class="btn">${parent ? 'Post reply' : 'Post comment'}</button>
      ${parent ? '<button type="button" class="btn-quiet" data-act="cancel-reply">Cancel</button>' : ''}
      <span class="err" role="alert"></span></div></form>`;
  }

  function renderComments() {
    const c = ctx.comments;
    const area = $('#comments');
    if (!area) return;
    area.innerHTML = `<h2 id="ch">Comments<span>${ctx.post.comment_count}</span></h2>
      ${S.me ? commentForm(null) : `<p class="muted"><a href="#/login" data-act="signin-next">Sign in</a> to join the discussion.</p>`}
      <ol class="cm-list" aria-labelledby="ch">${c.length ? commentsHtml(c) : ''}</ol>
      ${!c.length ? '<p class="muted" style="margin-top:24px">No comments yet.</p>' : ''}
      ${c.length && c.length % 100 === 0 ? '<button class="btn btn-ghost" data-act="more-comments" style="margin-top:20px">Show more comments</button>' : ''}`;
  }

  function startProgress() {
    const bar = $('#progress');
    const onScroll = () => {
      const el = $('.post .prose');
      if (!el) return;
      const r = el.getBoundingClientRect();
      const p = (innerHeight * 0.35 - r.top) / Math.max(1, r.height);
      bar.style.transform = `scaleX(${Math.min(1, Math.max(0, p))})`;
    };
    addEventListener('scroll', onScroll, { passive: true });
    ctx.stopScroll = () => { removeEventListener('scroll', onScroll); bar.style.transform = 'scaleX(0)'; };
    onScroll();
  }

  async function viewPost(idStr, id) {
    const pid = Number(idStr);
    if (!Number.isInteger(pid)) return notFound('post');
    document.title = APP;
    main.innerHTML = `<div class="post-wrap"><div></div><div>${skeleton(1)}</div></div>`;
    let p;
    try { p = await API.post(pid); } catch (e) { if (e.status === 404) return notFound('post'); throw e; }
    if (id !== nav) return;
    const [comments, prof] = await Promise.all([
      API.comments(pid, { limit: 100, offset: 0 }).catch(() => []),
      API.profile(p.author.username).catch(() => null),
    ]);
    if (id !== nav) return;
    if (typeof p.is_liked === 'boolean') { p.is_liked ? S.likes.add(p.id) : S.likes.delete(p.id); saveSet('likes', S.likes); }
    if (typeof p.is_bookmarked === 'boolean') { p.is_bookmarked ? S.marks.add(p.id) : S.marks.delete(p.id); saveSet('marks', S.marks); }
    Object.assign(ctx, { post: p, comments, prof });

    const mine = S.me && S.me.username === p.author.username;
    document.title = `${p.title} – ${APP}`;
    main.innerHTML = `<div class="post-wrap">
      <div class="actions" role="group" aria-label="Post actions">${actionsHtml(p)}</div>
      <article class="post">
        <div class="len" style="--w:${lenPct(p.read_time)}%" aria-hidden="true"><i></i></div>
        ${p.state === 'draft' ? '<p class="notice">This is a draft and isn’t published yet.</p>' : ''}
        <h1 class="post-title">${esc(p.title)}</h1>
        ${p.summary ? `<p class="standfirst">${esc(p.summary)}</p>` : ''}
        <div class="byline">
          <a class="by" href="${userHref(p.author.username)}">${esc(p.author.username)}</a>
          <time datetime="${esc(p.created_at)}">${fmtDate(p.created_at)}</time>
          <span>${p.read_time} min read</span>
          <span>${plural(p.word_count, 'word')}</span>
          ${p.category ? `<a href="#/?category=${encodeURIComponent(p.category.slug)}">${esc(p.category.name)}</a>` : ''}
          ${mine ? `<span class="own"><a href="#/edit/${p.id}">Edit</a><button class="btn-quiet" style="padding:0" data-act="delete-post">Delete</button></span>` : ''}
        </div>
        <div class="prose">${MD.render(p.body)}</div>
        ${p.tags.length ? `<p class="post-tags">${p.tags.map((t) => `<a href="#/?tag=${encodeURIComponent(slugify(t))}">${esc(t)}</a>`).join('')}</p>` : ''}
        <div class="author-card" id="author-card">${authorCardHtml(p, prof)}</div>
        <section class="comments" id="comments" aria-labelledby="ch"></section>
      </article></div>`;
    renderComments();
    startProgress();
  }

  async function refreshPost() {
    const p = await API.post(ctx.post.id);
    ctx.post = p;
    if (typeof p.is_liked === 'boolean') { p.is_liked ? S.likes.add(p.id) : S.likes.delete(p.id); saveSet('likes', S.likes); }
    if (typeof p.is_bookmarked === 'boolean') { p.is_bookmarked ? S.marks.add(p.id) : S.marks.delete(p.id); saveSet('marks', S.marks); }
    const a = $('.actions');
    if (a) swap(a, actionsHtml(p));
    return p;
  }

  /* ------------------------------------------------------------------ profile */
  function profileHead(prof) {
    const mine = S.me && S.me.username === prof.username;
    return `<div class="p-head">
      <h1 class="p-name">${esc(prof.username)}</h1>
      <p class="p-bio${prof.bio ? '' : ' muted'}">${prof.bio ? esc(prof.bio) : 'No bio yet.'}</p>
      <p class="p-stats"><span><b>${prof.post_count.toLocaleString()}</b>${prof.post_count === 1 ? 'post' : 'posts'}</span>
        <span><b>${prof.follower_count.toLocaleString()}</b>${prof.follower_count === 1 ? 'follower' : 'followers'}</span>
        <span><b>${prof.following_count.toLocaleString()}</b>following</span>
        <span>Joined ${fmtDate(prof.created_at)}</span></p>
      ${mine ? '<div class="row"><a class="btn" href="#/write">Write a post</a><button class="btn btn-ghost" data-act="edit-profile">Edit profile</button></div>'
        : `<button class="btn ${prof.is_following ? 'btn-ghost' : ''}" data-act="follow" data-user="${esc(prof.username)}" aria-pressed="${prof.is_following}">${prof.is_following ? 'Following' : 'Follow'}</button>`}
    </div>`;
  }

  async function viewProfile(username, q, id) {
    document.title = APP;
    main.innerHTML = `<div class="profile">${skeleton(2)}</div>`;
    let prof;
    try { prof = await API.profile(username); } catch (e) { if (e.status === 404) return notFound('author'); throw e; }
    const mine = S.me && S.me.username === prof.username;
    const drafts = mine && q.get('tab') === 'drafts';
    const LIMIT = 12;
    const load = (offset) => API.posts({ author: prof.username, state: drafts ? 'draft' : 'published', limit: LIMIT, offset });
    const page = await load(0);
    if (id !== nav) return;
    ctx.prof = prof;
    document.title = `${prof.username} – ${APP}`;
    const base = userHref(prof.username);
    main.innerHTML = `<div class="profile"><div id="p-head">${profileHead(prof)}</div>
      ${mine ? `<nav class="tabs" aria-label="Posts"><a href="${base}" ${!drafts ? 'aria-current="true"' : ''}>Published</a><a href="${base}?tab=drafts" ${drafts ? 'aria-current="true"' : ''}>Drafts</a></nav>` : ''}
      <div class="plist"><div id="feed-list"></div><button class="btn btn-ghost more" data-act="more" hidden>Show more posts</button></div></div>`;
    const list = $('#feed-list');
    if (!page.items.length) {
      list.innerHTML = drafts
        ? '<div class="empty"><h2>No drafts</h2><p>Drafts you save show up here until you publish them.</p><a class="btn" href="#/write">Start writing</a></div>'
        : `<div class="empty"><h2>Nothing published yet</h2><p>${mine ? 'Your published posts will appear here.' : 'This author hasn’t published anything yet.'}</p>${mine ? '<a class="btn" href="#/write">Write a post</a>' : ''}</div>`;
      return;
    }
    mountList({ list, more: $('.more'), first: page, load, byline: false });
  }

  /* ------------------------------------------------------------------ saved */
  async function viewSaved(id) {
    if (!S.me) return needAuth('Sign in to see your saved posts.');
    document.title = `Saved – ${APP}`;
    main.innerHTML = `<div class="profile"><h1 class="p-name" style="font-size:2.4rem">Saved</h1>${skeleton(2)}</div>`;
    let items = [];
    try {
      const data = await API.bookmarks({ limit: 50 });
      items = (data && data.items) || [];
      S.marks = new Set(items.map((p) => p.id));
      saveSet('marks', S.marks);
    } catch {
      const ids = [...S.marks].reverse();
      const res = await Promise.allSettled(ids.slice(0, 40).map((x) => API.post(x)));
      if (id !== nav) return;
      res.forEach((r, i) => {
        if (r.status === 'fulfilled') items.push(r.value);
        else if (r.reason && r.reason.status === 404) S.marks.delete(ids[i]);
      });
      saveSet('marks', S.marks);
    }
    if (id !== nav) return;
    main.innerHTML = `<div class="profile"><div class="p-head"><h1 class="p-name" style="font-size:clamp(2rem,5vw,3rem)">Saved</h1>
      <p class="p-bio muted" style="font-size:1rem">Stories you've bookmarked for later.</p></div>
      <div class="plist">${items.length ? items.map((p, i) => entry(p, { i })).join('') : '<div class="empty"><h2>Nothing saved yet</h2><p>Use the bookmark on a post to keep it here.</p><a class="btn btn-ghost" href="#/">Browse posts</a></div>'}</div></div>`;
    $('.plist').classList.add('anim');
  }

  const GMAIL_CHARS_RE = /^[a-z0-9.]+$/;
  function validateGmailAddress(email) {
    const s = String(email || '').trim().toLowerCase();
    if (!s.endsWith('@gmail.com')) {
      return { ok: false, msg: 'Fix email: only @gmail.com addresses are allowed (e.g. yourname@gmail.com)' };
    }
    const username = s.slice(0, -10);
    if (username.length < 6 || username.length > 30) {
      return { ok: false, msg: 'Fix email: Gmail username must be between 6 and 30 characters' };
    }
    if (!GMAIL_CHARS_RE.test(username)) {
      return { ok: false, msg: 'Fix email: Gmail username can only contain letters (a-z), numbers (0-9), and periods (.)' };
    }
    if (username.startsWith('.') || username.endsWith('.')) {
      return { ok: false, msg: 'Fix email: Gmail username cannot begin or end with a period' };
    }
    if (username.includes('..')) {
      return { ok: false, msg: 'Fix email: Gmail username cannot contain consecutive periods (..)' };
    }
    return { ok: true, email: s };
  }

  /* ------------------------------------------------------------------ auth */
  function viewAuth(mode) {
    if (S.me) { location.hash = '#/'; return; }
    const reg = mode === 'register';
    document.title = `${reg ? 'Create account' : 'Sign in'} – ${APP}`;
    main.innerHTML = `<div class="home auth">
      <aside class="rail"><section><h2>With an account you can</h2>
        <ul class="plain"><li>Write posts and keep drafts</li><li>Like and save what you read</li><li>Follow authors and join the discussion</li></ul></section></aside>
      <section class="auth-main"><h1>${reg ? 'Create your account' : 'Sign in'}</h1>
        <form data-form="${mode}" novalidate>
          <div class="field">
            <div class="label-with-info">
              <label for="a-email">Email</label>
              <span class="info-tip" tabindex="0" role="button" aria-label="Email information">
                <span class="info-badge">i</span>
                <span class="tip-content" role="tooltip">Email authentication was excluded due to cost constraints, as this is only a working prototype for testing, not a production client application.</span>
              </span>
            </div>
            <input id="a-email" name="email" type="email" autocomplete="email" required>
          </div>
          ${reg ? '<div class="field"><label for="a-user">Username</label><input id="a-user" name="username" type="text" autocomplete="username" minlength="3" maxlength="50" required><p class="hint">3 to 50 characters. This is the name readers see.</p></div>' : ''}
          <div class="field"><label for="a-pw">Password</label>
            <div class="pw"><input id="a-pw" name="password" type="password" autocomplete="${reg ? 'new-password' : 'current-password'}" required>
            <button type="button" data-act="toggle-pw" aria-label="Show password">Show</button></div>
            ${reg ? '<p class="hint">At least 8 characters.</p>' : ''}</div>
          <p class="err" role="alert"></p>
          <button class="btn">${reg ? 'Create account' : 'Sign in'}</button>
        </form>
        <p class="switch">${reg ? 'Already have an account? <a href="#/login">Sign in</a>' : 'New here? <a href="#/register">Create an account</a>'}</p>
      </section></div>`;
    $('input', main).focus();
  }

  async function signedIn() {
    S.me = await API.me();
    S.likes = loadSet('likes');
    S.marks = loadSet('marks');
    try {
      const bmData = await API.bookmarks({ limit: 100 });
      if (bmData && Array.isArray(bmData.items)) {
        bmData.items.forEach((p) => S.marks.add(p.id));
        saveSet('marks', S.marks);
      }
    } catch { /* ignore */ }
    renderBar();
    let next = '#/';
    try { next = sessionStorage.getItem('longhand.next') || '#/'; sessionStorage.removeItem('longhand.next'); } catch { /* ignore */ }
    location.hash = next.startsWith('#/login') || next.startsWith('#/register') ? '#/' : next;
  }

  /* ------------------------------------------------------------------ editor */
  const DRAFT_KEY = () => `longhand.draft.new.${S.me ? S.me.id : 'anon'}`;

  async function viewEditor(idStr, isEdit, id) {
    if (!S.me) return needAuth('Sign in to write.');
    let post = null;
    if (isEdit) {
      const pid = Number(idStr);
      if (!Number.isInteger(pid)) return notFound('post');
      try { post = await API.post(pid); } catch (e) { if (e.status === 404) return notFound('post'); throw e; }
      if (post.author.username !== S.me.username) return message("You can't edit this post", 'Only its author can change it.', `<a class="btn btn-ghost" href="${postHref(post)}">Back to the post</a>`);
    }
    const cats = await getCats();
    const tagNames = await getTags().catch(() => []);
    if (id !== nav) return;

    const E = post
      ? { title: post.title, summary: post.summary || '', body: post.body, category_id: post.category ? post.category.id : '', tags: [...post.tags], state: post.state }
      : { title: '', summary: '', body: '', category_id: '', tags: [], state: 'draft' };
    let restored = false;
    if (!post) {
      try {
        const saved = JSON.parse(localStorage.getItem(DRAFT_KEY()) || 'null');
        if (saved && (saved.title || saved.body)) { Object.assign(E, saved); restored = true; }
      } catch { /* ignore */ }
    }
    const hadCategory = !!(post && post.category);
    const wasPublished = !!(post && post.state === 'published');

    document.title = `${post ? 'Edit post' : 'New post'} – ${APP}`;
    main.innerHTML = `<form class="editor" data-form="editor" novalidate>
      <div class="ed-main">
        ${restored ? '<p class="restored">Restored your unsaved draft. <button type="button" class="btn-quiet" style="padding:0" data-act="discard-draft">Discard it</button></p>' : ''}
        <div class="ai-panel" id="ai-panel">
          <div class="ai-head-row" id="ai-head-toggle">
            <div class="ai-title-wrap">
              <span class="ai-badge">✨ AI</span>
              <div>
                <span class="ai-title">Write with AI</span>
                <span class="ai-desc">— Depict your idea and choose a dynamic tone</span>
              </div>
            </div>
            <button type="button" class="btn-quiet" id="ai-expand-btn">Expand</button>
          </div>
          <div class="ai-body" id="ai-body" hidden>
            <div class="ai-input-group">
              <input type="text" class="ai-input" id="ai-topic-in" placeholder="Depict your idea (e.g. Why Postgres connection pooling & WAL matter)..." autocomplete="off">
              <button type="button" class="btn" id="ai-tones-btn">Discover Tones</button>
            </div>
            <p class="ai-status" id="ai-status" hidden></p>
            <div class="ai-tones-section" id="ai-tones-section" hidden>
              <div class="ai-tones-header">
                <span>Suggested tones for this depiction:</span>
                <span class="muted" style="font-weight:normal;font-size:12px">Pick a tone to write the draft</span>
              </div>
              <div class="ai-tones-grid" id="ai-tones-grid"></div>
              <div class="ai-custom-row">
                <input type="text" class="ai-input" id="ai-custom-tone-in" placeholder="Or specify your custom tone...">
                <button type="button" class="btn" id="ai-write-btn" disabled>Write Post</button>
              </div>
            </div>
          </div>
        </div>
        <label class="sr" for="ed-title">Title</label>
        <input class="ed-title" id="ed-title" name="title" type="text" placeholder="Title" maxlength="255" autocomplete="off">
        <label class="sr" for="ed-sum">Summary</label>
        <textarea class="ed-sum" id="ed-sum" name="summary" rows="1" placeholder="A sentence or two that sets up the post (optional)"></textarea>
        <div class="ed-tabs" role="tablist" aria-label="Editor mode">
          <button type="button" role="tab" id="tab-write" aria-selected="true" aria-controls="ed-body" data-tab="write">Write</button>
          <button type="button" role="tab" id="tab-preview" aria-selected="false" aria-controls="ed-preview" data-tab="preview">Preview</button>
          <span class="hint">Markdown: # heading, **bold**, *italic*, &gt; quote, - list, \`code\`</span>
        </div>
        <label class="sr" for="ed-body">Body</label>
        <textarea class="ed-body" id="ed-body" name="body" placeholder="Start writing…"></textarea>
        <div class="prose" id="ed-preview" hidden></div>
      </div>
      <aside class="ed-side" aria-label="Post settings">
        <fieldset class="seg"><legend>Status</legend>
          <label><input type="radio" name="state" value="draft"><span>Draft</span></label>
          <label><input type="radio" name="state" value="published"><span>Published</span></label>
        </fieldset>
        <div class="field"><label for="ed-cat">Category</label>
          <select id="ed-cat" name="category_id">
            ${hadCategory ? '' : '<option value="">No category</option>'}
            ${cats.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
            <option value="__new__">New category…</option>
          </select>
          <input id="ed-newcat" type="text" placeholder="Category name" maxlength="100" hidden style="margin-top:8px" aria-label="New category name">
        </div>
        <div class="field"><label for="ed-tags">Tags</label>
          <div class="chips" id="chips"></div>
          <input id="ed-tags" type="text" list="tag-list" placeholder="Add a tag, then press Enter" autocomplete="off">
          <datalist id="tag-list">${tagNames.map((t) => `<option value="${esc(t)}">`).join('')}</datalist>
        </div>
        <p class="stats" id="ed-stats"></p>
        <p class="err" id="ed-err" role="alert"></p>
        <div class="ed-actions"><button class="btn" id="ed-submit"></button>
          <a class="btn-quiet" href="${post ? postHref(post) : '#/'}">Cancel</a></div>
      </aside></form>`;

    const f = $('.editor');
    const title = $('#ed-title'), sum = $('#ed-sum'), body = $('#ed-body'), cat = $('#ed-cat'), newcat = $('#ed-newcat');
    const tagIn = $('#ed-tags'), chips = $('#chips');
    title.value = E.title; sum.value = E.summary; body.value = E.body;
    cat.value = String(E.category_id || '');
    if (cat.value !== String(E.category_id || '')) cat.value = hadCategory ? String(post.category.id) : '';
    f.querySelector(`input[name="state"][value="${E.state}"]`).checked = true;

    const autosize = (el) => { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; };
    const label = () => {
      const st = f.querySelector('input[name="state"]:checked').value;
      $('#ed-submit').textContent = st === 'draft' ? 'Save draft' : post && wasPublished ? 'Save changes' : 'Publish';
    };
    const drawChips = () => {
      chips.innerHTML = E.tags.map((t, i) => `<span class="chip">${esc(t)}<button type="button" data-rm="${i}" aria-label="Remove tag ${esc(t)}">×</button></span>`).join('');
    };
    const stats = () => {
      const w = words(body.value);
      $('#ed-stats').textContent = `${plural(w, 'word')}, ${Math.max(1, Math.ceil(w / 200))} min read`;
    };
    let saveTimer;
    const persist = () => {
      if (post) return;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        try { localStorage.setItem(DRAFT_KEY(), JSON.stringify(E)); } catch { /* ignore */ }
      }, 600);
    };
    const sync = () => {
      E.title = title.value; E.summary = sum.value; E.body = body.value;
      E.state = f.querySelector('input[name="state"]:checked').value;
      E.category_id = cat.value === '__new__' ? '' : cat.value;
      stats(); label(); persist();
    };
    const addTag = (raw) => {
      const t = raw.trim().toLowerCase().replace(/,+$/, '').trim();
      if (t && !E.tags.includes(t)) { E.tags.push(t); drawChips(); persist(); }
      tagIn.value = '';
    };

    // ------------------------------------------------ AI Assistant wiring
    const aiPanel = $('#ai-panel', f);
    const aiHeadToggle = $('#ai-head-toggle', f);
    const aiExpandBtn = $('#ai-expand-btn', f);
    const aiBody = $('#ai-body', f);
    const aiTopicIn = $('#ai-topic-in', f);
    const aiTonesBtn = $('#ai-tones-btn', f);
    const aiStatus = $('#ai-status', f);
    const aiTonesSection = $('#ai-tones-section', f);
    const aiTonesGrid = $('#ai-tones-grid', f);
    const aiCustomToneIn = $('#ai-custom-tone-in', f);
    const aiWriteBtn = $('#ai-write-btn', f);

    let selectedTone = '';

    const toggleAiPanel = () => {
      const isHidden = aiBody.hidden;
      aiBody.hidden = !isHidden;
      aiPanel.classList.toggle('open', !aiBody.hidden);
      aiExpandBtn.textContent = aiBody.hidden ? 'Expand' : 'Collapse';
      if (!aiBody.hidden) aiTopicIn.focus();
    };

    aiHeadToggle.onclick = (e) => {
      if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'INPUT') toggleAiPanel();
    };
    aiExpandBtn.onclick = toggleAiPanel;

    // Step 1: Discover Dynamic Tones
    aiTonesBtn.onclick = async () => {
      const topic = aiTopicIn.value.trim();
      if (!topic) {
        aiStatus.hidden = false;
        aiStatus.textContent = 'Please depict your topic or idea first.';
        return;
      }
      aiTonesBtn.disabled = true;
      aiStatus.hidden = false;
      aiStatus.textContent = '✨ Analyzing your depiction and discovering tailored tones...';
      aiTonesSection.hidden = true;
      try {
        const res = await API.suggestTones(topic);
        const tones = res.tones || [];
        aiTonesGrid.innerHTML = tones.map((t, i) => `
          <div class="ai-tone-card" data-idx="${i}" data-tone="${esc(t.name)}">
            <div class="ai-tone-name">${esc(t.name)}</div>
            <div class="ai-tone-desc">${esc(t.description)}</div>
          </div>
        `).join('');

        selectedTone = tones.length ? tones[0].name : '';
        const firstCard = aiTonesGrid.querySelector('.ai-tone-card');
        if (firstCard) firstCard.classList.add('selected');
        aiCustomToneIn.value = selectedTone;
        aiWriteBtn.disabled = false;
        aiWriteBtn.textContent = `Write in "${selectedTone.slice(0, 20)}..."`;

        aiTonesGrid.querySelectorAll('.ai-tone-card').forEach((card) => {
          card.onclick = () => {
            aiTonesGrid.querySelectorAll('.ai-tone-card').forEach((c) => c.classList.remove('selected'));
            card.classList.add('selected');
            selectedTone = card.dataset.tone;
            aiCustomToneIn.value = selectedTone;
            aiWriteBtn.disabled = false;
            aiWriteBtn.textContent = `Write in "${selectedTone.slice(0, 20)}..."`;
          };
        });

        aiCustomToneIn.oninput = () => {
          selectedTone = aiCustomToneIn.value.trim();
          aiWriteBtn.disabled = !selectedTone;
          aiWriteBtn.textContent = selectedTone ? `Write in "${selectedTone.slice(0, 18)}..."` : 'Pick a tone';
        };

        aiStatus.hidden = true;
        aiTonesSection.hidden = false;
      } catch (err) {
        aiStatus.textContent = `Could not analyze tones: ${err.message}`;
      } finally {
        aiTonesBtn.disabled = false;
      }
    };

    // Step 2: Generate Post with Selected Tone
    aiWriteBtn.onclick = async () => {
      const topic = aiTopicIn.value.trim();
      const tone = (aiCustomToneIn.value.trim() || selectedTone).trim();
      if (!topic || !tone) return;

      aiWriteBtn.disabled = true;
      aiTonesBtn.disabled = true;
      aiStatus.hidden = false;
      aiStatus.textContent = `✍️ Writing post with impeccable grammar in "${tone}" tone...`;

      try {
        const existingCatNames = cats.map((c) => c.name);
        const res = await API.generatePost(topic, tone, existingCatNames);

        // Auto-fill Title, Summary, Body
        title.value = res.title;
        E.title = res.title;

        sum.value = res.summary;
        E.summary = res.summary;

        body.value = res.body;
        E.body = res.body;

        // Auto-fill tags
        if (Array.isArray(res.tags)) {
          E.tags = Array.from(new Set([...E.tags, ...res.tags]));
          drawChips();
        }

        // Auto-fill category
        if (res.category) {
          const matched = cats.find((c) => c.name.toLowerCase() === res.category.toLowerCase());
          if (matched) {
            cat.value = String(matched.id);
            E.category_id = matched.id;
          }
        }

        autosize(sum);
        autosize(body);
        stats();
        persist();

        // Highlight fields with gentle glow
        title.classList.add('ai-filled-glow');
        sum.classList.add('ai-filled-glow');
        body.classList.add('ai-filled-glow');
        setTimeout(() => {
          title.classList.remove('ai-filled-glow');
          sum.classList.remove('ai-filled-glow');
          body.classList.remove('ai-filled-glow');
        }, 1500);

        aiStatus.textContent = '✅ Post generated with impeccable grammar and structure!';
        toast('AI post draft generated!');
        setTimeout(() => {
          toggleAiPanel();
          title.focus();
        }, 1200);
      } catch (err) {
        aiStatus.textContent = `Post generation error: ${err.message}`;
      } finally {
        aiWriteBtn.disabled = false;
        aiTonesBtn.disabled = false;
      }
    };

    drawChips(); stats(); label(); autosize(body); autosize(sum);
    f.addEventListener('input', (e) => {
      if (e.target === body || e.target === sum) autosize(e.target);
      if (e.target === tagIn) return;
      $('#ed-err').textContent = '';
      sync();
    });
    f.addEventListener('change', (e) => {
      if (e.target === cat) newcat.hidden = cat.value !== '__new__';
      if (e.target === cat && cat.value === '__new__') newcat.focus();
      sync();
    });
    tagIn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagIn.value); }
      else if (e.key === 'Backspace' && !tagIn.value && E.tags.length) { E.tags.pop(); drawChips(); persist(); }
    });
    tagIn.addEventListener('blur', () => addTag(tagIn.value));
    chips.addEventListener('click', (e) => {
      const b = e.target.closest('[data-rm]');
      if (b) { E.tags.splice(Number(b.dataset.rm), 1); drawChips(); persist(); tagIn.focus(); }
    });
    f.addEventListener('click', (e) => {
      const t = e.target.closest('[data-tab]');
      if (!t) return;
      const preview = t.dataset.tab === 'preview';
      $('#tab-write').setAttribute('aria-selected', String(!preview));
      $('#tab-preview').setAttribute('aria-selected', String(preview));
      body.hidden = preview;
      $('#ed-preview').hidden = !preview;
      if (preview) $('#ed-preview').innerHTML = body.value.trim() ? MD.render(body.value) : '<p class="muted">Nothing to preview yet.</p>';
      else autosize(body);
    });
    f.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); f.requestSubmit(); }
    });

    ctx.dispose = () => clearTimeout(saveTimer);
    ctx.editor = {
      async submit() {
        sync();
        const err = $('#ed-err');
        err.textContent = '';
        addTag(tagIn.value);
        if (E.title.trim().length < 5) { err.textContent = 'Give the post a title of at least 5 characters.'; title.focus(); return; }
        if (E.body.trim().length < 20) { err.textContent = 'Write at least 20 characters in the body.'; body.focus(); return; }
        let categoryId = cat.value === '__new__' ? null : cat.value ? Number(cat.value) : null;
        if (cat.value === '__new__') {
          const name = newcat.value.trim();
          if (!name) { err.textContent = 'Name the new category, or pick an existing one.'; newcat.focus(); return; }
          const c = await API.createCategory(name);
          S.cats = null;
          categoryId = c.id;
        }
        const payload = { title: E.title.trim(), summary: post ? E.summary.trim() : E.summary.trim() || null, body: E.body, category_id: categoryId, tags: E.tags, state: E.state };
        const saved = post ? await API.updatePost(post.id, payload) : await API.createPost(payload);
        S.tags = null;
        clearTimeout(saveTimer);
        try { if (!post) localStorage.removeItem(DRAFT_KEY()); } catch { /* ignore */ }
        toast(E.state === 'draft' ? 'Draft saved' : post && wasPublished ? 'Changes saved' : 'Published');
        location.hash = postHref(saved);
      },
      discard() {
        clearTimeout(saveTimer);
        try { localStorage.removeItem(DRAFT_KEY()); } catch { /* ignore */ }
        route();
      },
    };
    title.focus();
  }

  /* ------------------------------------------------------------------ actions */
  const ACTS = {
    retry: () => route(),
    'change-api'() {
      const current = (window.LONGHAND && window.LONGHAND.apiBase) || '';
      const entered = window.prompt("Enter your deployed Backend API URL (e.g. https://your-backend.up.railway.app/api/v1):", current);
      if (entered && entered.trim()) {
        try { localStorage.setItem('longhand.apiBase', entered.trim()); } catch (_) {}
        window.location.reload();
      }
    },
    'edit-profile'() {
      if (!S.me) return needAuth('Sign in to edit your profile.');
      const d = $('#dlg');
      const curUser = S.me.username || '';
      const curBio = S.me.bio || '';
      d.innerHTML = `<form method="dialog" id="f-edit-profile">
        <h2>Edit profile</h2>
        <div class="field" style="margin-top:16px">
          <label for="ep-user">Username</label>
          <input id="ep-user" name="username" type="text" minlength="3" maxlength="50" value="${esc(curUser)}" required autocomplete="username">
          <p class="hint">3 to 50 characters.</p>
        </div>
        <div class="field">
          <label for="ep-bio">Bio</label>
          <textarea id="ep-bio" name="bio" rows="3" placeholder="Tell readers a bit about yourself">${esc(curBio)}</textarea>
        </div>
        <p class="err" id="ep-err" role="alert" style="margin-bottom:14px"></p>
        <div class="row">
          <button type="submit" class="btn" id="ep-save">Save changes</button>
          <button type="button" class="btn btn-ghost" value="cancel" data-act="dlg-cancel">Cancel</button>
        </div>
      </form>`;

      const f = $('#f-edit-profile', d);
      const errEl = $('#ep-err', d);
      const saveBtn = $('#ep-save', d);

      $('[data-act="dlg-cancel"]', d).onclick = () => d.close();

      f.onsubmit = async (e) => {
        e.preventDefault();
        errEl.textContent = '';
        const newUsername = $('#ep-user', f).value.trim();
        const newBio = $('#ep-bio', f).value.trim();

        if (newUsername.length < 3) {
          errEl.textContent = 'Username must be at least 3 characters.';
          return;
        }

        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
        try {
          const updated = await API.updateMe({ username: newUsername, bio: newBio });
          S.me = updated;
          renderBar();
          d.close();
          toast('Profile updated');
          location.hash = userHref(updated.username);
        } catch (err) {
          errEl.textContent = err.message || 'Failed to update profile.';
        } finally {
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save changes';
        }
      };

      d.showModal();
      $('#ep-user', d).focus();
    },
    more: (t) => ctx.more && ctx.more(),
    signout() {
      API.token.set(null);
      S.me = null; S.likes = new Set(); S.marks = new Set();
      renderBar();
      toast('Signed out');
      if (location.hash === '#/' || location.hash === '') route(); else location.hash = '#/';
    },
    'toggle-pw'(t) {
      const input = t.parentElement.querySelector('input');
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      t.textContent = show ? 'Hide' : 'Show';
      t.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    },
    'signin-next'() { try { sessionStorage.setItem('longhand.next', location.hash); } catch { /* ignore */ } },
    'to-comments'() { const c = $('#comments'); if (c) { c.scrollIntoView({ behavior: 'smooth', block: 'start' }); const ta = $('#cm-body'); if (ta) ta.focus({ preventScroll: true }); } },

    async like(t) {
      if (!S.me) return needAuth('Sign in to like posts.');
      const p = ctx.post, run = nav;
      const had = (p && typeof p.is_liked === 'boolean') ? p.is_liked : S.likes.has(p.id);
      await busy(t, async () => {
        try {
          if (had) { try { await API.unlike(p.id); } catch (e) { if (e.status !== 400) throw e; } } else await API.like(p.id);
          had ? S.likes.delete(p.id) : S.likes.add(p.id);
          saveSet('likes', S.likes);
          if (run === nav) await refreshPost();
        } catch (e) { toast(e.message, 'bad'); }
      });
    },
    async bookmark(t) {
      if (!S.me) return needAuth('Sign in to save posts.');
      const p = ctx.post, run = nav;
      const had = (p && typeof p.is_bookmarked === 'boolean') ? p.is_bookmarked : S.marks.has(p.id);
      await busy(t, async () => {
        try {
          if (had) { try { await API.unbookmark(p.id); } catch (e) { if (e.status !== 400) throw e; } } else await API.bookmark(p.id);
          had ? S.marks.delete(p.id) : S.marks.add(p.id);
          saveSet('marks', S.marks);
          if (run === nav) await refreshPost();
          toast(had ? 'Removed from saved' : 'Saved');
        } catch (e) { toast(e.message, 'bad'); }
      });
    },
    async follow(t) {
      if (!S.me) return needAuth('Sign in to follow authors.');
      const user = t.dataset.user, run = nav;
      const was = t.getAttribute('aria-pressed') === 'true';
      await busy(t, async () => {
        try {
          if (was) { try { await API.unfollow(user); } catch (e) { if (e.status !== 400) throw e; } } else await API.follow(user);
          const prof = await API.profile(user);
          if (run !== nav) return;
          ctx.prof = prof;
          if ($('#p-head')) swap($('#p-head'), profileHead(prof));
          if ($('#author-card') && ctx.post) swap($('#author-card'), authorCardHtml(ctx.post, prof));
        } catch (e) { toast(e.message, 'bad'); }
      });
    },
    async 'delete-post'() {
      const p = ctx.post;
      if (!(await confirmDialog({ title: 'Delete this post?', body: 'The post, its comments and likes are removed for good.', confirm: 'Delete post' }))) return;
      try { await API.deletePost(p.id); toast('Post deleted'); location.hash = '#/'; } catch (e) { toast(e.message, 'bad'); }
    },
    async 'delete-entry-post'(t) {
      const id = Number(t.dataset.id);
      if (!id) return;
      if (!(await confirmDialog({ title: 'Delete this post?', body: 'The post, its comments and likes are removed for good.', confirm: 'Delete post' }))) return;
      try { await API.deletePost(id); toast('Post deleted'); route(); } catch (e) { toast(e.message, 'bad'); }
    },
    reply(t) {
      if (!S.me) return needAuth('Sign in to reply.');
      document.querySelectorAll('.cm-slot').forEach((s) => { s.hidden = true; s.innerHTML = ''; });
      const slot = $(`#slot-${t.dataset.id}`);
      slot.innerHTML = commentForm(t.dataset.id);
      slot.hidden = false;
      slot.querySelector('textarea').focus();
    },
    'cancel-reply'(t) { const s = t.closest('.cm-slot'); s.hidden = true; s.innerHTML = ''; },
    async 'more-comments'(t) {
      await busy(t, async () => {
        try {
          const more = await API.comments(ctx.post.id, { limit: 100, offset: ctx.comments.length });
          ctx.comments = ctx.comments.concat(more);
          renderComments();
        } catch (e) { toast(e.message, 'bad'); }
      });
    },
    'discard-draft'() { ctx.editor && ctx.editor.discard(); },
  };

  const FORMS = {
    search(f) {
      const v = new FormData(f).get('q').toString().trim();
      location.hash = v ? `#/?q=${encodeURIComponent(v)}` : '#/';
    },

    async login(f) {
      const d = Object.fromEntries(new FormData(f));
      const err = $('.err', f);
      err.textContent = '';
      const emailCheck = validateGmailAddress(d.email);
      if (!emailCheck.ok) { err.textContent = emailCheck.msg; return; }
      if (!d.password) { err.textContent = 'Enter your password.'; return; }
      await busy($('.btn', f), async () => {
        try {
          const t = await API.login(emailCheck.email, d.password);
          API.token.set(t.access_token);
          await signedIn();
        } catch (e) { err.textContent = e.message; }
      });
    },

    async register(f) {
      const d = Object.fromEntries(new FormData(f));
      const err = $('.err', f);
      err.textContent = '';
      const emailCheck = validateGmailAddress(d.email);
      if (!emailCheck.ok) { err.textContent = emailCheck.msg; return; }
      if ((d.username || '').trim().length < 3) { err.textContent = 'Choose a username of at least 3 characters.'; return; }
      if ((d.password || '').length < 8) { err.textContent = 'Use a password of at least 8 characters.'; return; }
      await busy($('.btn', f), async () => {
        try {
          await API.register({ email: emailCheck.email, username: d.username.trim(), password: d.password });
          const t = await API.login(emailCheck.email, d.password);
          API.token.set(t.access_token);
          await signedIn();
          toast('Account created');
        } catch (e) { err.textContent = e.message; }
      });
    },

    async comment(f) {
      const err = $('.err', f);
      err.textContent = '';
      const text = f.elements.body.value.trim();
      if (!text) { err.textContent = 'Write something first.'; return; }
      const parent = f.dataset.parent ? Number(f.dataset.parent) : null;
      const run = nav;
      await busy($('.btn', f), async () => {
        try {
          const c = await API.addComment(ctx.post.id, { body: text, parent_id: parent });
          if (run !== nav) return;
          ctx.comments = await API.comments(ctx.post.id, { limit: Math.max(100, ctx.comments.length + 1), offset: 0 });
          ctx.post = await API.post(ctx.post.id);
          renderComments();
          const actions = $('.actions');
          if (actions) swap(actions, actionsHtml(ctx.post));
          const el = $(`#cm-${c.id}`);
          if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
          toast(parent ? 'Reply posted' : 'Comment posted');
        } catch (e) { err.textContent = e.message; }
      });
    },

    async editor(f) {
      const btn = $('#ed-submit');
      await busy(btn, async () => {
        try { await ctx.editor.submit(); } catch (e) { $('#ed-err').textContent = e.message; }
      });
    },
  };

  /* ------------------------------------------------------------------ router */
  function parseHash() {
    const raw = location.hash.slice(1) || '/';
    const [path, qs = ''] = raw.split('?');
    return { parts: path.split('/').filter(Boolean), q: new URLSearchParams(qs) };
  }

  async function route() {
    const run = ++nav;
    if (ctx.stopScroll) ctx.stopScroll();
    if (ctx.dispose) ctx.dispose();
    ctx = {};
    const menu = $('.menu');
    if (menu) menu.open = false;
    const { parts, q } = parseHash();
    window.scrollTo(0, 0);
    setActiveNav(parts);
    try {
      const [a, b] = parts;
      if (!a) await viewHome(q, run);
      else if (a === 'post') await viewPost(b, run);
      else if (a === 'u') await viewProfile(decodeURIComponent(b || ''), q, run);
      else if (a === 'profile' || a === 'me') {
        if (!S.me) return needAuth('Sign in to view your profile.');
        await viewProfile(S.me.username, q, run);
      }
      else if (a === 'write') await viewEditor(null, false, run);
      else if (a === 'edit') await viewEditor(b, true, run);
      else if (a === 'saved') await viewSaved(run);
      else if (a === 'login' || a === 'register') viewAuth(a);
      else notFound('page');
    } catch (e) {
      if (run !== nav) return;
      viewError(e);
    }
    if (run === nav) main.focus({ preventScroll: true });
  }

  /* ------------------------------------------------------------------ wiring */
  document.addEventListener('click', (e) => {
    const skip = e.target.closest('[data-skip]');
    if (skip) { e.preventDefault(); main.focus(); return; }
    const menu = $('.menu');
    if (menu && menu.open && !menu.contains(e.target)) menu.open = false;
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const fn = ACTS[t.dataset.act];
    if (fn) fn(t, e);
  });

  document.addEventListener('submit', (e) => {
    const f = e.target.closest('[data-form]');
    if (!f) return;
    e.preventDefault();
    const fn = FORMS[f.dataset.form];
    if (fn) fn(f);
  });

  window.addEventListener('hashchange', route);
  window.addEventListener('longhand:signed-out', () => {
    S.me = null; S.likes = new Set(); S.marks = new Set();
    renderBar();
    toast('Your session ended. Sign in again to continue.');
  });

  (async function boot() {
    if (API.token.get()) {
      try { S.me = await API.me(); } catch { /* signed out or offline; the view reports it */ }
    }
    if (S.me) {
      S.likes = loadSet('likes');
      S.marks = loadSet('marks');
      try {
        const bmData = await API.bookmarks({ limit: 100 });
        if (bmData && Array.isArray(bmData.items)) {
          bmData.items.forEach((p) => S.marks.add(p.id));
          saveSet('marks', S.marks);
        }
      } catch { /* offline / fallback */ }
    }
    renderBar();
    route();
  })();
})();
