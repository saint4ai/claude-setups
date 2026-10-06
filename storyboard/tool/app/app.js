// Доска раскадровки: кадры ролика, видео фильма по сегменту кадра, оценки, ветки комментариев, вложения, паттерны.
// Все правки уходят на локальный сервер операциями (/api/frame, /api/comment …) и пишутся в videos/<проект>/storyboard/review.json.
const $ = (s, el = document) => el.querySelector(s);
const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
};
const S = {project: null, board: null, review: {frames: {}}, sel: null, filter: 'all', loop: true, typing: false};
const store = {get: (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} }};
const tc = (s) => { const m = Math.floor(s / 60), x = s - m * 60; return `${m}:${x.toFixed(1).padStart(4, '0')}`; };
const media = (p) => (p ? `/p/${encodeURIComponent(S.project)}/${p.split('/').map(encodeURIComponent).join('/')}` : '');
const fr = (id) => S.review.frames?.[id] ?? {status: null, note: '', comments: [], attachments: [], links: [], patterns: [], refs: []};
const author = () => $('#author').value.trim() || 'Автор';
const toast = (t) => { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (el.hidden = true), 1800); };
const STATUS = {ok: 'Нравится', fix: 'Нужна правка', ask: 'Вопрос'};

async function api(path, body) {
  const r = await fetch(`/api/${path}?project=${encodeURIComponent(S.project)}`, body ? {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)} : undefined);
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}
async function op(name, payload) {
  const j = await api(name, payload);
  S.review = j.review;
  renderStats(); renderRibbon(); renderGrid(true); renderPanel();
}

async function boot() {
  const ps = await (await fetch('/api/projects')).json();
  const sel = $('#project');
  sel.innerHTML = '';
  for (const p of ps) sel.append(h('option', {value: p.id}, p.title));
  if (!ps.length) { $('#grid').append(h('p', {class: 'empty'}, 'Досок пока нет. Попроси Claude: «собери доску для моего ролика» (файл videos/<проект>/storyboard/board.json).')); return; }
  const want = new URLSearchParams(location.search).get('project') || store.get('sb-project', ps[0].id);
  sel.value = ps.some((p) => p.id === want) ? want : ps[0].id;
  sel.onchange = () => load(sel.value);
  $('#author').value = store.get('sb-author', 'Автор');
  $('#author').oninput = (e) => store.set('sb-author', e.target.value);
  $('#summaryBtn').onclick = openSummary;
  $('#helpBtn').onclick = openHelp;
  await load(sel.value);
  if (store.get('sb-help-seen', '') !== '1') { openHelp(); store.set('sb-help-seen', '1'); }
  setInterval(refresh, 4000);
  document.addEventListener('keydown', keys);
  document.addEventListener('paste', onPaste);
}
async function load(project) {
  S.project = project;
  store.set('sb-project', project);
  const j = await api('board');
  S.board = j.board; S.review = j.review;
  // формат кадра: board.aspect (ширина / высота), по умолчанию 16:9; вертикальные ролики (aspect < 1) получают свою раскладку
  const ar = Number(S.board.aspect) || (S.board.width && S.board.height ? S.board.width / S.board.height : 16 / 9);
  document.documentElement.style.setProperty('--ar', String(ar));
  document.body.classList.toggle('portrait', ar < 1);
  document.title = `${S.board.title ?? project} · раскадровка`;
  $('#title').textContent = S.board.title ?? project;
  S.sel = store.get(`sb-sel-${project}`, S.board.frames[0]?.id);
  renderFilters(); renderStats(); renderRibbon(); renderGrid(); renderPanel();
}
// подтягиваем ответы агента и правки с другого окна, пока автор не печатает
async function refresh() {
  if (S.typing || !S.project) return;
  try {
    const j = await api('board');
    if (j.review.updatedAt !== S.review.updatedAt) { S.review = j.review; renderStats(); renderRibbon(); renderGrid(true); renderPanel(true); }
  } catch {}
}

const visible = () => S.board.frames.filter((f) => {
  const r = fr(f.id);
  if (S.filter === 'fix') return r.status === 'fix' || r.status === 'ask';
  if (S.filter === 'cmt') return (r.comments ?? []).some((c) => c.status !== 'resolved');
  if (S.filter === 'ok') return r.status === 'ok';
  if (S.filter === 'none') return !r.status;
  return true;
});
function renderFilters() {
  const box = $('#filters');
  box.innerHTML = '';
  for (const [k, t] of [['all', 'Все'], ['none', 'Без оценки'], ['fix', 'Правки и вопросы'], ['cmt', 'Открытые комментарии'], ['ok', 'Нравится']]) {
    box.append(h('button', {class: `chip${S.filter === k ? ' on' : ''}`, onclick: () => { S.filter = k; renderFilters(); renderGrid(); }}, t));
  }
}
function renderStats() {
  const fs = S.board.frames, rs = fs.map((f) => fr(f.id));
  const open = rs.reduce((n, r) => n + (r.comments ?? []).filter((c) => c.status !== 'resolved' && !c.parent).length, 0);
  $('#stats').innerHTML = `<span><b>${fs.length}</b> кадров</span><span><b>${rs.filter((r) => r.status === 'ok').length}</b> нравится</span>`
    + `<span><b>${rs.filter((r) => r.status === 'fix').length}</b> правок</span><span><b>${open}</b> открытых комментариев</span>`;
}
function renderRibbon() {
  const rb = $('#ribbon'), D = S.board.duration ?? S.board.frames.at(-1).t1;
  rb.innerHTML = '';
  const blocks = h('div', {class: 'blocks'}), segs = h('div', {class: 'segs'});
  for (const b of S.board.blocks ?? []) blocks.append(h('div', {class: 'blk', style: `left:${(b.t0 / D) * 100}%;width:${((b.t1 - b.t0) / D) * 100}%`}, b.name));
  for (const f of S.board.frames) {
    const r = fr(f.id), n = (r.comments ?? []).filter((c) => c.status !== 'resolved' && !c.parent).length;
    segs.append(h('div', {class: `seg${f.id === S.sel ? ' sel' : ''}`, title: `${f.id} · ${f.phrase}`, style: `left:${(f.t0 / D) * 100}%;width:calc(${((f.t1 - f.t0) / D) * 100}% - 2px)`, onclick: () => select(f.id, true)},
      f.img ? h('img', {src: media(f.img), loading: 'lazy'}) : null, r.status ? h('span', {class: `st ${r.status}`}) : null, n ? h('span', {class: 'cnt'}, n) : null));
  }
  rb.append(blocks, segs, h('div', {class: 'head', id: 'head', style: 'display:none'}));
}
function renderGrid(keepScroll) {
  const g = $('#grid'), top = g.scrollTop;
  g.innerHTML = '';
  const fs = visible();
  if (!fs.length) g.append(h('p', {class: 'empty'}, 'По этому фильтру кадров нет.'));
  const byBlock = [];
  for (const f of fs) { const last = byBlock.at(-1); if (last && last.name === f.block) last.frames.push(f); else byBlock.push({name: f.block, frames: [f]}); }
  for (const b of byBlock) {
    const cards = h('div', {class: 'cards'});
    for (const f of b.frames) {
      const r = fr(f.id), n = (r.comments ?? []).filter((c) => c.status !== 'resolved' && !c.parent).length, a = (r.attachments ?? []).filter((x) => !x.removed).length;
      cards.append(h('div', {class: `card${f.id === S.sel ? ' sel' : ''}`, id: `card-${f.id}`, onclick: () => select(f.id, true)},
        h('div', {class: 'thumb'}, f.img ? h('img', {src: media(f.img), loading: 'lazy'}) : null, h('span', {class: 'id'}, f.id),
          h('span', {class: 'badges'}, n ? h('span', {class: 'badge hot'}, `💬 ${n}`) : null, a ? h('span', {class: 'badge'}, `📎 ${a}`) : null, (r.patterns ?? []).length ? h('span', {class: 'badge'}, `✦ ${r.patterns.length}`) : null),
          r.status ? h('span', {class: `st ${r.status}`}) : null),
        h('div', {class: 'meta'}, h('span', {class: 'tc'}, `${tc(f.t0)} – ${tc(f.t1)}`), h('span', {class: 'ph'}, f.phrase))));
    }
    g.append(h('div', {class: 'block'}, h('h2', {}, b.name, h('span', {}, `${b.frames.length} кадр.`)), cards));
  }
  if (keepScroll) g.scrollTop = top;
}
function select(id, seek) {
  S.sel = id;
  store.set(`sb-sel-${S.project}`, id);
  document.querySelectorAll('.card.sel, .seg.sel').forEach((el) => el.classList.remove('sel'));
  $(`#card-${CSS.escape(id)}`)?.classList.add('sel');
  renderRibbon();
  renderPanel();
  $(`#card-${CSS.escape(id)}`)?.scrollIntoView({block: 'nearest', behavior: 'smooth'});
}
const cur = () => S.board.frames.find((f) => f.id === S.sel) ?? S.board.frames[0];
function playSeg(play = true) {
  const v = $('#vid'), f = cur();
  if (!v) return;
  v.currentTime = f.t0 + 0.02;
  if (play) v.play().catch(() => {});
}

let FILM = null;
function filmEl() {
  if (FILM && FILM.dataset.src === media(S.board.film)) return FILM;
  FILM = h('video', {id: 'vid', src: media(S.board.film), preload: 'auto', playsinline: true});
  FILM.dataset.src = media(S.board.film);
  FILM.addEventListener('timeupdate', () => {
    const ff = cur();
    const t = FILM.currentTime;
    const pt = $('#ptime');
    if (pt) pt.textContent = `${tc(t)} / сегмент ${tc(ff.t0)}–${tc(ff.t1)}`;
    const D = S.board.duration ?? 1, head = $('#head');
    if (head) { head.style.display = 'block'; head.style.left = `calc(18px + (100% - 36px) * ${t / D})`; }
    if (t > ff.t1 && !FILM.paused) { if (S.loop) FILM.currentTime = ff.t0 + 0.02; else FILM.pause(); }
  });
  return FILM;
}
function renderPanel(soft) {
  const p = $('#panel'), f = cur();
  if (!f) return;
  const r = fr(f.id);
  // при фоновом обновлении не трогаем видео и поле заметки, если они в работе
  const v0 = $('#vid');
  const keepTime = soft && v0 ? v0.currentTime : null;
  const wasPlaying = soft && v0 && !v0.paused;
  p.innerHTML = '';
  const body = h('div', {class: 'pbody'});
  const i = S.board.frames.indexOf(f);
  body.append(h('div', {class: 'phead'}, h('h1', {}, f.id), h('span', {class: 'tc'}, `${tc(f.t0)} – ${tc(f.t1)} · ${f.block}`),
    h('div', {class: 'nav'}, h('button', {class: 'btn sm', onclick: () => i > 0 && select(S.board.frames[i - 1].id, true), title: '←'}, '←'),
      h('button', {class: 'btn sm', onclick: () => i < S.board.frames.length - 1 && select(S.board.frames[i + 1].id, true), title: '→'}, '→'))));
  // плеер: один элемент видео на всю сессию: при смене кадра только перемотка, фильм не перезагружается
  const player = h('div', {class: 'player'});
  if (S.board.film) {
    const vid = filmEl();
    player.append(vid);
    if (!soft) { if (vid.readyState >= 1) vid.currentTime = f.t0 + 0.02; else vid.addEventListener('loadedmetadata', () => (vid.currentTime = cur().t0 + 0.02), {once: true}); }
    else if (keepTime != null && wasPlaying) vid.play().catch(() => {});
  } else if (f.img) player.append(h('img', {src: media(f.img)}));
  const ptop = h('div', {class: 'ptop'}), pl = h('div', {class: 'pl'}), pr = h('div', {class: 'pr'});
  pl.append(player);
  if (S.board.film) pr.append(h('div', {class: 'pctrl'},
    h('button', {class: 'btn gold sm', onclick: () => playSeg(true)}, '▶ Сегмент'),
    h('button', {class: 'btn sm', onclick: () => { const v = $('#vid'); v.paused ? v.play() : v.pause(); }}, 'Пауза / дальше'),
    h('label', {class: 'pctrl'}, h('input', {type: 'checkbox', checked: S.loop, onchange: (e) => (S.loop = e.target.checked)}), 'по кругу'),
    h('span', {class: 'time', id: 'ptime'}, '')));
  pr.append(h('div', {class: 'phrase'}, `«${f.phrase}»`));
  const kv = h('dl', {class: 'kv'});
  const row = (k, v) => v && kv.append(h('dt', {}, k), h('dd', {}, v));
  row('Что в кадре', f.see); row('Движение', f.motion);
  if (f.transition) row('Переход →', h('span', {}, h('b', {}, f.transition.type), f.transition.dur ? ` · ${f.transition.dur}` : '', f.transition.why ? ` · ${f.transition.why}` : ''));
  row('Звук', f.sound); row('Вставки', (f.inserts ?? []).map((x) => `${x.what}: ${x.src}`).join('; ')); row('Текст в кадре', f.text);
  if (kv.children.length) pr.append(kv);
  ptop.append(pl, pr);
  body.append(ptop);

  // оценка и заметка
  const st = h('div', {class: 'status'});
  for (const [k, t] of Object.entries(STATUS)) st.append(h('button', {class: `${k}${r.status === k ? ' on' : ''}`, onclick: () => op('frame', {frame: f.id, patch: {status: r.status === k ? null : k}})}, t));
  const note = h('textarea', {placeholder: 'Заметка к кадру: что поменять, что оставить…'});
  note.value = r.note ?? '';
  let tmr;
  note.addEventListener('focus', () => (S.typing = true));
  note.addEventListener('blur', () => { S.typing = false; });
  note.addEventListener('input', () => { clearTimeout(tmr); tmr = setTimeout(() => api('frame', {frame: f.id, patch: {note: note.value}}).then((j) => { S.review = j.review; $('#noteSaved').textContent = 'сохранено'; }), 600); });
  body.append(h('div', {class: 'sec'}, h('h3', {}, 'Оценка'), st, note, h('span', {class: 'saved', id: 'noteSaved'}, r.updatedAt ? `изменено ${new Date(r.updatedAt).toLocaleString('ru')}` : '')));

  // ветка комментариев
  const roots = (r.comments ?? []).filter((c) => !c.parent);
  const thread = h('div', {class: 'thread'});
  const cmtEl = (c, reply) => h('div', {class: `cmt${reply ? ' reply' : ''}${c.status === 'resolved' ? ' resolved' : ''}`},
    h('div', {class: 'who'}, h('b', {class: /claude|агент|codex/i.test(c.author) ? 'agent' : null}, c.author), h('span', {}, new Date(c.createdAt).toLocaleString('ru', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'})),
      c.at != null ? h('span', {class: 'at', title: 'Перейти к моменту', onclick: () => { const v = $('#vid'); if (v) { v.currentTime = c.at; v.play().catch(() => {}); } }}, `⏱ ${tc(c.at)}`) : null,
      c.status === 'resolved' ? h('span', {}, '· решено') : null),
    h('div', {class: 'txt'}, c.text),
    h('div', {class: 'acts'},
      !reply ? h('button', {onclick: (e) => openReply(e.target, c)}, 'Ответить') : null,
      h('button', {onclick: () => op('comment-status', {frame: f.id, id: c.id, status: c.status === 'resolved' ? 'open' : 'resolved'})}, c.status === 'resolved' ? 'Открыть снова' : 'Решено')));
  for (const c of roots) {
    thread.append(cmtEl(c, false));
    for (const rp of (r.comments ?? []).filter((x) => x.parent === c.id)) thread.append(cmtEl(rp, true));
  }
  if (!roots.length) thread.append(h('span', {class: 'empty'}, 'Комментариев пока нет.'));
  const ta = h('textarea', {placeholder: 'Комментарий к кадру. Ctrl+Enter: отправить'});
  ta.addEventListener('focus', () => (S.typing = true));
  ta.addEventListener('blur', () => (S.typing = false));
  const withTime = h('input', {type: 'checkbox', checked: true});
  const sendC = () => {
    const text = ta.value.trim(); if (!text) return;
    const v = $('#vid');
    op('comment', {frame: f.id, text, author: author(), at: withTime.checked && v ? Math.round(v.currentTime * 100) / 100 : null}).then(() => toast('Комментарий сохранён'));
  };
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) sendC(); });
  body.append(h('div', {class: 'sec'}, h('h3', {}, 'Комментарии', h('span', {class: 'n'}, roots.length || '')), thread,
    h('div', {class: 'compose'}, ta, h('div', {class: 'row'}, h('button', {class: 'btn gold sm', onclick: sendC}, 'Отправить'), h('label', {}, withTime, 'привязать к моменту видео')))));

  // вложения: скриншоты и видео эффектов
  const atts = h('div', {class: 'atts'});
  for (const a of (r.attachments ?? []).filter((x) => !x.removed)) {
    const url = media(a.path);
    atts.append(h('div', {class: 'att', title: a.name},
      a.kind === 'video' ? h('video', {src: url, muted: true, loop: true, playsinline: true, onmouseenter: (e) => e.target.play(), onmouseleave: (e) => e.target.pause()}) : h('img', {src: url, onclick: () => window.open(url, '_blank')}),
      h('span', {class: 'lbl'}, a.label || a.name), h('button', {class: 'x', title: 'Убрать', onclick: () => op('attach-remove', {frame: f.id, id: a.id})}, '×')));
  }
  const pick = h('input', {type: 'file', multiple: true, accept: 'image/*,video/*', style: 'display:none', onchange: (e) => upFiles([...e.target.files], f.id)});
  const drop = h('div', {class: 'drop'}, 'Перетащи сюда скриншоты или видео эффектов, вставь из буфера (Ctrl+V) или ', h('a', {href: '#', onclick: (e) => { e.preventDefault(); pick.click(); }}, 'выбери файлы'), pick);
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); upFiles([...e.dataTransfer.files], f.id); });
  body.append(h('div', {class: 'sec'}, h('h3', {}, 'Вложения', h('span', {class: 'n'}, atts.children.length || '')), atts.children.length ? atts : null, drop));

  // ссылки
  const links = h('div', {class: 'links'});
  for (const [k, l] of (r.links ?? []).entries()) links.append(h('div', {class: 'pill'}, h('a', {href: l.url, target: '_blank', rel: 'noopener'}, l.label || l.url),
    h('button', {onclick: () => op('frame', {frame: f.id, patch: {links: r.links.filter((_, j) => j !== k)}})}, '×')));
  const lu = h('input', {placeholder: 'https://… ссылка на референс'}), ll = h('input', {placeholder: 'подпись'});
  body.append(h('div', {class: 'sec'}, h('h3', {}, 'Ссылки'), links, h('div', {class: 'compose'}, h('div', {class: 'row'}, lu, ll,
    h('button', {class: 'btn sm', onclick: () => lu.value.trim() && op('frame', {frame: f.id, patch: {links: [...(r.links ?? []), {url: lu.value.trim(), label: ll.value.trim()}]}})}, 'Добавить')))));

  // паттерны и референсы
  const pp = h('div', {class: 'pills'});
  for (const code of r.patterns ?? []) {
    const pt = (S.board.patterns ?? []).find((x) => x.code === code);
    pp.append(h('span', {class: 'pill', title: pt?.how ?? ''}, pt?.img ? h('img', {src: media(pt.img)}) : null, `${code} ${pt?.name ?? ''}`,
      h('button', {onclick: () => op('frame', {frame: f.id, patch: {patterns: r.patterns.filter((x) => x !== code)}})}, '×')));
  }
  const rp = h('div', {class: 'pills'});
  for (const [k, rf] of (r.refs ?? []).entries()) {
    const R = (S.board.refs ?? []).find((x) => x.id === rf.id);
    rp.append(h('span', {class: 'pill'}, R?.img ? h('img', {src: media(R.img)}) : null, `${rf.id}${rf.time ? ` · ${rf.time}` : ''}${rf.note ? ` · ${rf.note}` : ''}`,
      h('button', {onclick: () => op('frame', {frame: f.id, patch: {refs: r.refs.filter((_, j) => j !== k)}})}, '×')));
  }
  // паттерны и референсы необязательны: блоки видны, только если они есть в board.json (patterns[], refs[]) или уже выбраны в кадре
  if ((S.board.patterns ?? []).length || (r.patterns ?? []).length) body.append(h('div', {class: 'sec'}, h('h3', {}, 'Паттерны монтажа', h('span', {class: 'n'}, (r.patterns ?? []).length || '')), pp,
    (S.board.patterns ?? []).length ? h('div', {class: 'row'}, h('button', {class: 'btn sm', onclick: () => openPatterns(f.id)}, '+ Паттерн')) : null));
  if ((S.board.refs ?? []).length || (r.refs ?? []).length) {
    const refSel = h('select', {}, ...(S.board.refs ?? []).map((R) => h('option', {value: R.id}, `${R.id} · ${R.title}`)));
    const refT = h('input', {placeholder: 'время, напр. 4,4–4,6 с', style: 'width:150px'}), refN = h('input', {placeholder: 'что взять'});
    body.append(h('div', {class: 'sec'}, h('h3', {}, 'Референсы'), rp, (S.board.refs ?? []).length ? h('div', {class: 'compose'}, h('div', {class: 'row'}, refSel, refT, refN,
      h('button', {class: 'btn sm', onclick: () => op('frame', {frame: f.id, patch: {refs: [...(r.refs ?? []), {id: refSel.value, time: refT.value.trim(), note: refN.value.trim()}]}})}, 'Добавить'))) : null));
  }
  p.append(body);
}
function openReply(btn, c) {
  const f = cur();
  const box = btn.closest('.cmt');
  if (box.nextSibling?.classList?.contains('compose')) return;
  const ta = h('textarea', {placeholder: 'Ответ…'});
  ta.addEventListener('focus', () => (S.typing = true));
  ta.addEventListener('blur', () => (S.typing = false));
  const send = () => ta.value.trim() && op('comment', {frame: f.id, text: ta.value.trim(), author: author(), parent: c.id});
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(); });
  box.after(h('div', {class: 'compose', style: 'margin-left:22px'}, ta, h('div', {class: 'row'}, h('button', {class: 'btn gold sm', onclick: send}, 'Ответить'))));
  ta.focus();
}
async function upFiles(files, frame) {
  for (const file of files) {
    const kind = file.type.startsWith('video') ? 'video' : 'image';
    const r = await fetch(`/api/upload?project=${encodeURIComponent(S.project)}&frame=${encodeURIComponent(frame)}&name=${encodeURIComponent(file.name || `вставка.${kind === 'video' ? 'mp4' : 'png'}`)}`, {method: 'POST', body: file});
    const j = await r.json();
    if (!r.ok) { toast(j.error || 'не загрузилось'); continue; }
    await op('attach', {frame, path: j.path, name: file.name || 'из буфера', kind, author: author()});
  }
  toast(files.length > 1 ? `Загружено ${files.length}` : 'Вложение сохранено');
}
function onPaste(e) {
  if (!S.sel || /textarea|input/i.test(document.activeElement?.tagName ?? '')) return;
  const files = [...(e.clipboardData?.files ?? [])];
  if (files.length) { e.preventDefault(); upFiles(files, S.sel); }
}
function keys(e) {
  if (/textarea|input|select/i.test(document.activeElement?.tagName ?? '')) return;
  const i = S.board.frames.findIndex((f) => f.id === S.sel);
  if (e.key === 'ArrowRight' && i < S.board.frames.length - 1) { select(S.board.frames[i + 1].id, true); e.preventDefault(); }
  if (e.key === 'ArrowLeft' && i > 0) { select(S.board.frames[i - 1].id, true); e.preventDefault(); }
  if (e.key === ' ') { const v = $('#vid'); if (v) { v.paused ? playSeg(true) : v.pause(); e.preventDefault(); } }
  if (e.key === 'Escape') closeModal();
}

// окна: паттерны и сводка правок
const closeModal = () => { const m = $('#modal'); m.hidden = true; m.innerHTML = ''; };
function modal(title, content, extra) {
  const m = $('#modal');
  m.innerHTML = '';
  m.append(h('div', {class: 'mbox'}, h('div', {class: 'mhead'}, h('h2', {}, title), extra ?? null, h('button', {class: 'btn sm', onclick: closeModal}, 'Закрыть')), h('div', {class: 'mbody'}, content)));
  m.hidden = false;
  m.onclick = (e) => e.target === m && closeModal();
}
function openPatterns(frame) {
  const r = fr(frame), chosen = new Set(r.patterns ?? []);
  const q = h('input', {placeholder: 'поиск: портал, стаккато, счётчик…', style: 'width:280px'});
  const grid = h('div', {class: 'pgrid'});
  const draw = () => {
    grid.innerHTML = '';
    const s = q.value.trim().toLowerCase();
    for (const pt of S.board.patterns ?? []) {
      if (s && !`${pt.code} ${pt.name} ${pt.how ?? ''} ${pt.where ?? ''}`.toLowerCase().includes(s)) continue;
      grid.append(h('button', {class: `pcard${chosen.has(pt.code) ? ' on' : ''}`, onclick: () => { chosen.has(pt.code) ? chosen.delete(pt.code) : chosen.add(pt.code); draw(); }},
        pt.img ? h('img', {src: media(pt.img), loading: 'lazy'}) : null, h('span', {class: 'pt'}, h('b', {}, `${pt.code} · ${pt.name}`), h('span', {}, pt.how ?? ''), h('span', {}, pt.where ?? ''))));
    }
  };
  q.oninput = draw; draw();
  modal('Паттерны монтажа', grid, h('div', {class: 'row', style: 'display:flex;gap:8px'}, q,
    h('button', {class: 'btn gold sm', onclick: () => { op('frame', {frame, patch: {patterns: [...chosen]}}); closeModal(); }}, 'Готово')));
}
function openHelp() {
  const step = (n, t, d) => h('div', {style: 'display:flex;gap:14px;align-items:flex-start'}, h('span', {style: 'flex:none;width:34px;height:34px;border-radius:50%;background:var(--gold);color:#2A211C;display:grid;place-items:center;font:700 15px var(--head)'}, n),
    h('div', {}, h('b', {style: 'font-size:15px'}, t), h('div', {style: 'color:var(--muted);margin-top:3px'}, d)));
  modal('Как работать с доской', h('div', {style: 'display:flex;flex-direction:column;gap:16px;max-width:760px'},
    step(1, 'Выбери кадр', 'Кликни карточку или отрезок на ленте сверху. Справа фильм проиграет ровно этот кадр (кнопка «▶ Сегмент», стрелки ← → листают кадры).'),
    step(2, 'Оцени', '«Нравится», «Нужна правка» или «Вопрос». Цвет оценки виден на карточке и на ленте.'),
    step(3, 'Напиши комментарий', 'Что поменять. Галочка «привязать к моменту» запоминает секунду видео: Claude увидит, о каком месте речь.'),
    step(4, 'Покажи, как надо', 'Перетащи скриншот или видео эффекта в блок «Вложения» или вставь из буфера (Ctrl+V). Можно добавить ссылку. Если в доске есть паттерны и референсы, их тоже можно прикрепить.'),
    step(5, 'Напиши Claude «оставил комментарии»', 'Он прочитает все правки, переделает монтаж и ответит в тех же ветках. Ответы появятся на доске сами, ничего обновлять не нужно.'),
    h('div', {style: 'color:var(--dim);font-size:12.5px'}, 'Фильтры сверху показывают кадры без оценки, с правками и с открытыми комментариями. «Сводка правок» собирает всё в текст.')));
}
function summaryMd() {
  const L = [`# Правки: ${S.board.title}`, '', `Обновлено ${new Date(S.review.updatedAt ?? Date.now()).toLocaleString('ru')}`, ''];
  for (const f of S.board.frames) {
    const r = fr(f.id);
    const cs = (r.comments ?? []);
    const live = r.status || r.note || cs.length || (r.attachments ?? []).some((a) => !a.removed) || (r.patterns ?? []).length || (r.refs ?? []).length || (r.links ?? []).length;
    if (!live) continue;
    L.push(`## ${f.id} · ${tc(f.t0)}–${tc(f.t1)} · «${f.phrase}»${r.status ? ` · ${STATUS[r.status]}` : ''}`);
    if (r.note) L.push(`Заметка: ${r.note}`);
    for (const c of cs.filter((x) => !x.parent)) {
      L.push(`- ${c.status === 'resolved' ? '[решено] ' : ''}${c.author}${c.at != null ? ` (⏱ ${tc(c.at)})` : ''}: ${c.text}`);
      for (const rp of cs.filter((x) => x.parent === c.id)) L.push(`  - ${rp.author}: ${rp.text}`);
    }
    const at = (r.attachments ?? []).filter((a) => !a.removed);
    if (at.length) L.push(`Вложения: ${at.map((a) => a.path).join(', ')}`);
    if ((r.patterns ?? []).length) L.push(`Паттерны: ${r.patterns.join(', ')}`);
    if ((r.refs ?? []).length) L.push(`Референсы: ${r.refs.map((x) => `${x.id} ${x.time ?? ''} ${x.note ?? ''}`.trim()).join('; ')}`);
    if ((r.links ?? []).length) L.push(`Ссылки: ${r.links.map((x) => x.url).join(', ')}`);
    L.push('');
  }
  return L.join('\n');
}
function openSummary() {
  const md = summaryMd();
  modal('Сводка правок', h('pre', {class: 'md'}, md), h('button', {class: 'btn gold sm', onclick: () => navigator.clipboard.writeText(md).then(() => toast('Скопировано'), () => toast('Выдели текст и скопируй'))}, 'Скопировать'));
}
boot();
