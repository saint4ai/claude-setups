// Агент читает правки автора и отвечает в тех же ветках (без браузера).
//   node tools/storyboard/cli.mjs <проект>                              сводка: оценки, заметки, открытые комментарии, вложения
//   node tools/storyboard/cli.mjs <проект> --all                         включая решённые
//   node tools/storyboard/cli.mjs <проект> reply <кадр> <id> "текст"     ответ от Claude в ветке
//   node tools/storyboard/cli.mjs <проект> resolve <кадр> <id>           отметить комментарий решённым
//   node tools/storyboard/cli.mjs <проект> note <кадр> "текст"           комментарий агента к кадру (новая ветка)
// Папка проектов: текущая папка (<папка>/videos/<проект>/storyboard/); другая: --root <папка> и --videos <имя папки>.
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const take = (k, d) => { const i = argv.indexOf(k); if (i < 0) return d; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const ROOT = path.resolve(take('--root', process.env.STORYBOARD_ROOT ?? process.cwd()));
const VIDEOS = take('--videos', 'videos');
const [project, cmd, ...rest] = argv;
const boards = () => (fs.existsSync(path.join(ROOT, VIDEOS)) ? fs.readdirSync(path.join(ROOT, VIDEOS)).filter((p) => fs.existsSync(path.join(ROOT, VIDEOS, p, 'storyboard', 'board.json'))) : []);
if (!project || !boards().includes(project)) {
  console.log(`${project ? `нет доски «${project}». ` : ''}Доски в ${path.join(ROOT, VIDEOS)}: ${boards().join(', ') || 'нет'}`);
  console.log('использование: node tools/storyboard/cli.mjs <проект> [--all | reply <кадр> <id> "текст" | resolve <кадр> <id> | note <кадр> "текст"]');
  process.exit(1);
}
const dir = path.join(ROOT, VIDEOS, project, 'storyboard');
const boardF = path.join(dir, 'board.json'), reviewF = path.join(dir, 'review.json');
const board = JSON.parse(fs.readFileSync(boardF, 'utf8'));
const review = fs.existsSync(reviewF) ? JSON.parse(fs.readFileSync(reviewF, 'utf8')) : {frames: {}};
review.frames ??= {};
const tc = (s) => { const m = Math.floor(s / 60), x = s - m * 60; return `${m}:${x.toFixed(1).padStart(4, '0')}`; };
const ST = {ok: 'НРАВИТСЯ', fix: 'НУЖНА ПРАВКА', ask: 'ВОПРОС'};
const save = () => {
  const hist = path.join(dir, 'history');
  fs.mkdirSync(hist, {recursive: true});
  if (fs.existsSync(reviewF)) fs.copyFileSync(reviewF, path.join(hist, `review-${new Date().toISOString().replace(/[:.]/g, '-')}.json`));
  review.updatedAt = new Date().toISOString();
  fs.writeFileSync(`${reviewF}.tmp`, JSON.stringify(review, null, 1));
  fs.renameSync(`${reviewF}.tmp`, reviewF);
};
const frameOf = (id) => {
  if (!board.frames.some((f) => f.id === id)) { console.log(`нет кадра «${id}». Кадры: ${board.frames.map((f) => f.id).join(', ')}`); process.exit(1); }
  return (review.frames[id] ??= {status: null, note: '', comments: [], attachments: [], links: [], patterns: [], refs: []});
};
const rid = () => Math.random().toString(36).slice(2, 9);

if (cmd === 'reply' || cmd === 'note') {
  const [frame, a, b] = rest;
  const text = cmd === 'reply' ? b : a;
  if (!frame || !text || (cmd === 'reply' && !a)) { console.log('не хватает аргументов: reply <кадр> <id> "текст" или note <кадр> "текст"'); process.exit(1); }
  const f = frameOf(frame);
  if (cmd === 'reply' && !f.comments.some((x) => x.id === a)) { console.log(`в кадре ${frame} нет комментария ${a}`); process.exit(1); }
  f.comments.push({id: rid(), author: 'Claude', text, at: null, parent: cmd === 'reply' ? a : null, status: 'open', createdAt: new Date().toISOString()});
  save();
  console.log(`ок: ${cmd === 'reply' ? 'ответ' : 'комментарий'} в ${frame}`);
} else if (cmd === 'resolve') {
  const [frame, id] = rest;
  const c = frame && id ? frameOf(frame).comments.find((x) => x.id === id) : null;
  if (!c) { console.log('нет такого комментария'); process.exit(1); }
  c.status = 'resolved'; c.statusAt = new Date().toISOString();
  save();
  console.log(`ок: ${frame}/${id} решено`);
} else {
  const all = cmd === '--all';
  let n = 0;
  console.log(`# Правки: ${board.title} (обновлено ${review.updatedAt ?? 'никогда'})\n`);
  for (const g of review.general ?? []) if (all || g.status !== 'resolved') console.log(`[общее] ${g.author}: ${g.text}`);
  for (const fr of board.frames) {
    const r = review.frames?.[fr.id];
    if (!r) continue;
    const cs = (r.comments ?? []).filter((c) => all || c.status !== 'resolved' || (r.comments ?? []).some((x) => x.parent === c.id && x.status !== 'resolved'));
    const at = (r.attachments ?? []).filter((a) => !a.removed);
    if (!r.status && !r.note && !cs.length && !at.length && !(r.patterns ?? []).length && !(r.refs ?? []).length && !(r.links ?? []).length) continue;
    n++;
    console.log(`## ${fr.id} ${tc(fr.t0)}-${tc(fr.t1)} «${fr.phrase}»${r.status ? `  [${ST[r.status]}]` : ''}`);
    if (r.note) console.log(`  заметка: ${r.note}`);
    for (const c of cs.filter((x) => !x.parent)) {
      console.log(`  - (${c.id}) ${c.author}${c.at != null ? ` ⏱${tc(c.at)}` : ''}${c.status === 'resolved' ? ' [решено]' : ''}: ${c.text}`);
      for (const rp of (r.comments ?? []).filter((x) => x.parent === c.id)) console.log(`      ↳ (${rp.id}) ${rp.author}: ${rp.text}`);
    }
    for (const a of at) console.log(`  📎 ${path.join(VIDEOS, project, 'storyboard', a.path)}${a.label ? ` (${a.label})` : ''}`);
    if ((r.patterns ?? []).length) console.log(`  паттерны: ${r.patterns.join(', ')}`);
    for (const rf of r.refs ?? []) console.log(`  референс: ${rf.id} ${rf.time ?? ''} ${rf.note ?? ''}`);
    for (const l of r.links ?? []) console.log(`  ссылка: ${l.url}${l.label ? ` (${l.label})` : ''}`);
  }
  if (!n) console.log('Правок пока нет.');
}
