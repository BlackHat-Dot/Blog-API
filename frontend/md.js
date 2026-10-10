/* Small, safe Markdown renderer. All input is HTML-escaped first. */
(function () {
  'use strict';

  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const safeUrl = (u) => (/^(https?:\/\/|mailto:)/i.test(u.trim()) ? u.trim() : null);

  function inline(raw) {
    let s = esc(raw);
    const codes = [];
    s = s.replace(/`([^`]+)`/g, (m, c) => {
      codes.push(c);
      return '\u0000' + (codes.length - 1) + '\u0000';
    });
    s = s.replace(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g, (m, alt, url) => `<img src="${url}" alt="${alt}" loading="lazy">`);
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, text, url) => {
      const ok = safeUrl(url);
      return ok ? `<a href="${ok}" target="_blank" rel="noopener noreferrer">${text}</a>` : text;
    });
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\*)/g, '$1<em>$2</em>');
    s = s.replace(/(^|[^_\w])_([^_\s][^_]*?)_(?![_\w])/g, '$1<em>$2</em>');
    s = s.replace(/\u0000(\d+)\u0000/g, (m, i) => `<code>${codes[Number(i)]}</code>`);
    return s;
  }

  const isBlockStart = (l) =>
    /^```/.test(l) || /^#{1,4}\s/.test(l) || /^>\s?/.test(l) || /^\s*[-*+]\s+/.test(l) || /^\s*\d+[.)]\s+/.test(l) || /^(\*{3,}|-{3,}|_{3,})\s*$/.test(l);

  function render(src) {
    const lines = String(src || '').replace(/\r\n?/g, '\n').split('\n');
    const out = [];
    let i = 0;
    while (i < lines.length) {
      const l = lines[i];
      if (/^\s*$/.test(l)) { i++; continue; }

      if (/^```/.test(l)) {
        const buf = [];
        i++;
        while (i < lines.length && !/^```\s*$/.test(lines[i])) buf.push(lines[i++]);
        i++;
        out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`);
        continue;
      }

      let m = l.match(/^(#{1,4})\s+(.*)$/);
      if (m) {
        const lvl = m[1].length + 1; // post title is the h1
        out.push(`<h${lvl}>${inline(m[2].trim())}</h${lvl}>`);
        i++;
        continue;
      }

      if (/^(\*{3,}|-{3,}|_{3,})\s*$/.test(l)) { out.push('<hr>'); i++; continue; }

      if (/^>\s?/.test(l)) {
        const buf = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
        out.push(`<blockquote>${render(buf.join('\n'))}</blockquote>`);
        continue;
      }

      if (/^\s*[-*+]\s+/.test(l)) {
        const items = [];
        while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
          let t = lines[i++].replace(/^\s*[-*+]\s+/, '');
          while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*[-*+]\s+/.test(lines[i])) t += ' ' + lines[i++].trim();
          items.push(`<li>${inline(t)}</li>`);
        }
        out.push(`<ul>${items.join('')}</ul>`);
        continue;
      }

      if (/^\s*\d+[.)]\s+/.test(l)) {
        const items = [];
        while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
          let t = lines[i++].replace(/^\s*\d+[.)]\s+/, '');
          while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*\d+[.)]\s+/.test(lines[i])) t += ' ' + lines[i++].trim();
          items.push(`<li>${inline(t)}</li>`);
        }
        out.push(`<ol>${items.join('')}</ol>`);
        continue;
      }

      const buf = [];
      while (i < lines.length && !/^\s*$/.test(lines[i]) && (buf.length === 0 || !isBlockStart(lines[i]))) buf.push(lines[i++].trim());
      out.push(`<p>${inline(buf.join(' '))}</p>`);
    }
    return out.join('\n');
  }

  function excerpt(body, max) {
    const t = String(body || '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/^#{1,6}\s.*$/gm, ' ')
      .replace(/^[>\-*+\s\d.)]+/gm, '')
      .replace(/[*_`]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (t.length <= max) return t;
    const cut = t.slice(0, max);
    return cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 30)).replace(/[,.;:\s]+$/, '') + '…';
  }

  window.MD = { render, excerpt, esc };
})();
