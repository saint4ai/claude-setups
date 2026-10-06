// Собирает доску раскадровки из готового ролика: кадр каждые 2 секунды, фильм 720p для просмотра, board.json.
//   node tools/storyboard/build-board.mjs <проект> --video <ролик.mp4> [--words <слова.json>] [--title "Название"]
//        [--every 2] [--block 10] [--max <секунд>] [--root <папка>] [--videos videos] [--out <папка доски>]
//
//   <проект>     имя доски (папка), например reel-01. Доска будет в <root>/videos/<проект>/storyboard/
//   --video      готовый ролик, любой формат, который читает ffmpeg (вертикальный и горизонтальный)
//   --words      необязательно: JSON со словами речи и таймингами [["слово", начало_сек, конец_сек], ...];
//                слова попадают в «фразу» кадра, на котором начались
//   --title      название на доске (по умолчанию имя файла ролика)
//   --every      шаг кадров в секундах (по умолчанию 2)
//   --block      длина блока в секундах: блоки группируют кадры на доске (по умолчанию 10, 0 = один блок)
//   --max        взять только первые N секунд ролика
//
// Пишет: board.json, film.mp4 (720p), frames/К001.jpg, К002.jpg, ... review.json (правки автора) не трогает,
// поэтому доску можно пересобрать по новой версии ролика: комментарии остаются привязаны к номерам кадров.
// Нужны только Node и ffmpeg (вместе с ним ставится ffprobe), npm-пакеты не нужны.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const VALUE_OPTS = new Set(['--video', '--words', '--title', '--every', '--block', '--max', '--root', '--videos', '--out']);
const opts = {}, pos = [];
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (VALUE_OPTS.has(a)) opts[a] = process.argv[++i];
  else if (a.startsWith('--')) { console.error(`неизвестный параметр ${a}`); process.exit(1); }
  else pos.push(a);
}
const fail = (m) => { console.error(m); process.exit(1); };
const [project] = pos;
if (!project || !opts['--video']) fail('использование: node tools/storyboard/build-board.mjs <проект> --video <ролик.mp4> [--words <слова.json>] [--title "Название"] [--every 2] [--block 10] [--max <сек>]');
if (/[\\/]/.test(project)) fail('имя проекта без слэшей: например reel-01');
const VIDEO = path.resolve(opts['--video']);
if (!fs.existsSync(VIDEO)) fail(`нет файла ролика: ${VIDEO}`);
const ROOT = path.resolve(opts['--root'] ?? process.env.STORYBOARD_ROOT ?? process.cwd());
const OUT = path.resolve(opts['--out'] ?? path.join(ROOT, opts['--videos'] ?? 'videos', project, 'storyboard'));
const EVERY = Number(opts['--every'] ?? 2), BLOCK = Number(opts['--block'] ?? 10), MAX = opts['--max'] != null ? Number(opts['--max']) : Infinity;
if (!(EVERY > 0) || !(BLOCK >= 0) || !(MAX > 0)) fail('--every и --max должны быть больше нуля, --block не меньше нуля');

const run = (cmd, args, what) => {
  const r = spawnSync(cmd, args, {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024});
  if (r.error?.code === 'ENOENT') fail(`не найден ${cmd}: установи ffmpeg (в нём есть и ffprobe) и запусти снова`);
  if (r.status !== 0) fail(`${what ?? cmd} не удалось:\n${(r.stderr || '').split('\n').slice(-8).join('\n')}`);
  return r.stdout;
};
const r2 = (x) => Math.round(x * 100) / 100;
const tc = (s) => { const m = Math.floor(s / 60), x = Math.floor(s - m * 60); return `${m}:${String(x).padStart(2, '0')}`; };

// размеры, частота и длительность ролика (с учётом поворота из метаданных телефона)
const info = JSON.parse(run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_streams', '-show_format', '-of', 'json', VIDEO], 'ffprobe'));
const vs = info.streams?.[0];
if (!vs) fail('в файле нет видеодорожки');
const rot = Math.abs(Number(vs.tags?.rotate ?? vs.side_data_list?.find((x) => x.rotation != null)?.rotation ?? 0)) % 180 === 90;
const W = rot ? vs.height : vs.width, H = rot ? vs.width : vs.height;
const fps = (() => { const [a, b] = String(vs.r_frame_rate ?? '30/1').split('/').map(Number); return b ? a / b : a || 30; })();
const full = Number(info.format?.duration ?? vs.duration);
if (!(full > 0)) fail('не удалось узнать длительность ролика');
const D = r2(Math.min(full, MAX));
const portrait = H > W;

// слова речи с таймингами (необязательно)
let words = [];
if (opts['--words']) {
  let raw;
  try { raw = JSON.parse(fs.readFileSync(path.resolve(opts['--words']), 'utf8')); } catch (e) { fail(`файл слов не читается: ${e.message}`); }
  raw = Array.isArray(raw) ? raw : raw.words ?? [];
  words = raw.map((w) => (Array.isArray(w) ? {text: w[0], s: Number(w[1]), e: Number(w[2])} : {text: w.word ?? w.text, s: Number(w.start ?? w.s), e: Number(w.end ?? w.e)}))
    .filter((w) => w.text != null && Number.isFinite(w.s) && Number.isFinite(w.e));
  if (!words.length) fail('в файле слов нет ни одной записи вида ["слово", начало, конец]');
}

// кадры: каждые EVERY секунд; слишком короткий хвост присоединяется к последнему кадру
const starts = [];
for (let i = 0; i * EVERY < D - 0.05; i++) starts.push(r2(i * EVERY));
let frames = starts.map((t0, i) => ({t0, t1: r2(i + 1 < starts.length ? starts[i + 1] : D)}));
if (frames.length > 1 && frames.at(-1).t1 - frames.at(-1).t0 < EVERY * 0.3) { const last = frames.pop(); frames.at(-1).t1 = last.t1; }
const pad = String(frames.length).length > 3 ? String(frames.length).length : 3;
const inBlock = (t0) => (BLOCK > 0 ? Math.floor(t0 / BLOCK) : 0);
const blockName = (k) => (BLOCK > 0 ? `${tc(k * BLOCK)} – ${tc(Math.min(D, (k + 1) * BLOCK))}` : 'Ролик');
frames = frames.map((f, i) => {
  const last = i === frames.length - 1;
  const text = words.filter((w) => { const mid = (w.s + w.e) / 2; return mid >= f.t0 && (last ? mid <= f.t1 + 0.5 : mid < f.t1); }).map((w) => w.text).join(' ').trim();
  return {id: `К${String(i + 1).padStart(pad, '0')}`, block: blockName(inBlock(f.t0)), t0: f.t0, t1: f.t1,
    phrase: text || (words.length ? '(без речи)' : `Кадр на ${tc(f.t0)}`), img: `frames/К${String(i + 1).padStart(pad, '0')}.jpg`};
});
const blocks = [];
for (const f of frames) { const b = blocks.at(-1); if (b && b.name === f.block) b.t1 = f.t1; else blocks.push({name: f.block, t0: f.t0, t1: f.t1}); }

fs.mkdirSync(path.join(OUT, 'frames'), {recursive: true});
console.log(`Ролик ${path.basename(VIDEO)}: ${W}x${H}, ${D} с${D < full ? ` (из ${r2(full)})` : ''}. Кадров: ${frames.length}, каждые ${EVERY} с.`);

// картинки кадров: из середины отрезка, 540 px по ширине для вертикального ролика, 960 для горизонтального
const thumb = portrait ? 'scale=540:-2' : 'scale=960:-2';
for (const [i, f] of frames.entries()) {
  run('ffmpeg', ['-v', 'error', '-y', '-ss', String(r2((f.t0 + f.t1) / 2)), '-i', VIDEO, '-frames:v', '1', '-vf', thumb, '-q:v', '3', path.join(OUT, f.img)], `кадр ${f.id}`);
  if ((i + 1) % 5 === 0 || i === frames.length - 1) console.log(`  кадры: ${i + 1} из ${frames.length}`);
}

// фильм для просмотра на доске: 720p по короткой стороне, ключевые кадры каждые 0,5 с (быстрая перемотка)
console.log('  фильм 720p…');
run('ffmpeg', ['-v', 'error', '-y', '-i', VIDEO, '-t', String(D), '-vf', `${portrait ? 'scale=720:-2' : 'scale=-2:720'},fps=${Math.min(Math.round(fps), 30)}`,
  '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-g', '15', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', path.join(OUT, 'film.mp4')], 'фильм 720p');

const title = opts['--title'] ?? path.basename(VIDEO, path.extname(VIDEO));
const board = {title, duration: D, film: 'film.mp4', width: W, height: H, aspect: Math.round((W / H) * 10000) / 10000, blocks, frames, patterns: [], refs: []};
const boardF = path.join(OUT, 'board.json');
const existed = fs.existsSync(boardF);
fs.writeFileSync(`${boardF}.tmp`, JSON.stringify(board, null, 1));
fs.renameSync(`${boardF}.tmp`, boardF);
const mb = (fs.statSync(path.join(OUT, 'film.mp4')).size / 1048576).toFixed(1);
console.log(`Готово: ${OUT}\n  ${existed ? 'board.json обновлён, review.json не тронут' : 'board.json создан'}; фильм ${mb} МБ.\n  Запуск доски: node tools/storyboard/server.mjs  →  http://localhost:4321`);
