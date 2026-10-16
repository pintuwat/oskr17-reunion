/* ==========================================================
   OSKR17th Anniversary — Quiz host screen (quiz-host.html?key=...)
   คุมเกมด้วยปุ่มมุมขวาล่าง หรือกด Enter / Space / → = ปุ่มหลัก, F = เต็มจอ
   เฉลยอัตโนมัติเมื่อหมดเวลา หรือเมื่อทุกคนตอบครบ
   ========================================================== */

const QUIZ_HOST_CONFIG = {
  scriptUrl: 'https://script.google.com/macros/s/AKfycbwe3cldBEPaTPYn102wAOT8Yq2EyqUIqQ1y7_h4Wjvfg9FggSmmHbmpLnaYXHIHcyiG/exec',
  statusPollMs: 2000,
  autoRevealDelayMs: 2000,
  joinUrl: new URL('quiz-play.html', location.href).href,
};
const QUIZ_HOST_SHAPES = ['▲', '◆', '●', '■'];
const hostKey = new URLSearchParams(location.search).get('key');

const host = {
  view: null,
  offsetMs: 0,
  busy: false,
  seq: 0,
  appliedSeq: 0,
  renderedKey: '',
  chipsKey: '',
  autoRevealedFor: '',
};

async function hostCall(cmd) {
  const response = await fetch(QUIZ_HOST_CONFIG.scriptUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'quizHost', key: hostKey, cmd }),
  });
  let data;
  try {
    data = JSON.parse(await response.text());
  } catch (err) {
    throw new Error('ระบบยุ่ง');
  }
  if (data.result !== 'success') throw new Error(data.message || 'เกิดข้อผิดพลาด');
  return data;
}

// status ที่ส่งไปก่อนคำสั่งแต่ตอบกลับทีหลัง ต้องไม่ทับผลของคำสั่ง — ใช้ seq กันไว้
async function refresh(cmd = 'status') {
  if (cmd === 'status' && host.busy) return;
  const seq = ++host.seq;
  if (cmd !== 'status') {
    host.busy = true;
    renderControls();
  }
  try {
    const view = await hostCall(cmd);
    if (seq > host.appliedSeq) {
      host.appliedSeq = seq;
      host.offsetMs = view.now - Date.now();
      host.view = view;
      render();
    }
    setStatus('');
  } catch (err) {
    setStatus(`⚠ ${err.message || 'เชื่อมต่อไม่ได้'} — กำลังลองใหม่`);
  } finally {
    if (cmd !== 'status') host.busy = false;
    renderControls();
  }
}

function setStatus(text) {
  document.getElementById('status').textContent = text;
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('is-active', s.id === id));
}

/* ---------------- Rendering ---------------- */

function render() {
  const view = host.view;
  if (view.phase === 'lobby') renderLobby(view);
  else if (view.phase === 'question') renderQuestion(view);
  else if (view.phase === 'reveal') renderReveal(view);
  else if (view.phase === 'end') renderEnd(view);
}

function renderLobby(view) {
  showScreen('screen-lobby');
  host.renderedKey = 'lobby';
  document.getElementById('lobby-count').textContent = view.playerCount;
  const key = view.recentPlayers.join('|');
  if (key === host.chipsKey) return;
  host.chipsKey = key;
  const chips = document.getElementById('lobby-chips');
  chips.innerHTML = '';
  view.recentPlayers.slice().reverse().forEach((name) => {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = name;
    chips.appendChild(chip);
  });
}

function buildOptions(container, question, counts, correct) {
  container.innerHTML = '';
  const total = counts ? counts.reduce((a, b) => a + b, 0) : 0;
  question.options.forEach((text, i) => {
    const opt = document.createElement('div');
    opt.className = `opt opt-${i + 1}`;
    if (correct) opt.classList.add(i + 1 === correct ? 'is-correct' : 'is-dim');
    const shape = document.createElement('span');
    shape.className = 'shape';
    shape.textContent = QUIZ_HOST_SHAPES[i];
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = text;
    opt.append(shape, label);
    if (counts) {
      const count = document.createElement('span');
      count.className = 'count';
      count.textContent = counts[i];
      const bar = document.createElement('div');
      bar.className = 'bar';
      bar.style.width = '0%';
      opt.append(count, bar);
      requestAnimationFrame(() => { bar.style.width = `${total ? (counts[i] / total) * 100 : 0}%`; });
    }
    container.appendChild(opt);
  });
}

function renderQuestion(view) {
  showScreen('screen-question');
  document.getElementById('q-answered').textContent = `ตอบแล้ว ${view.answered} / ${view.playerCount}`;
  const key = `q${view.q}`;
  if (host.renderedKey !== key) {
    host.renderedKey = key;
    document.getElementById('q-no').textContent = `ข้อ ${view.q + 1} / ${view.total}`;
    document.getElementById('q-text').textContent = view.question.text;
    const img = document.getElementById('q-image');
    img.hidden = !view.question.image;
    if (view.question.image) img.src = view.question.image;
    buildOptions(document.getElementById('q-options'), view.question, null, 0);
  }
  tickCountdown();
}

function renderReveal(view) {
  showScreen('screen-reveal');
  const key = `r${view.q}`;
  const isLast = view.q + 1 >= view.total;
  document.getElementById('r-no').textContent = `ข้อ ${view.q + 1} / ${view.total}${isLast ? ' (ข้อสุดท้าย)' : ''}`;
  document.getElementById('r-answered').textContent = `ตอบ ${view.answered} / ${view.playerCount} คน`;
  if (host.renderedKey !== key) {
    host.renderedKey = key;
    document.getElementById('r-text').textContent = view.question.text;
    buildOptions(document.getElementById('r-options'), view.question, view.counts, view.question.correct);
  }
  renderBoard(document.getElementById('r-board'), (view.top || []).slice(0, 5), 1);
}

function renderBoard(container, rows, startRank) {
  container.innerHTML = '';
  rows.forEach((row, i) => {
    const el = document.createElement('div');
    el.className = 'lb-row';
    [['rank', String(startRank + i)], ['name', row.nickname], ['pts', row.score.toLocaleString()]].forEach(([cls, text]) => {
      const span = document.createElement('span');
      span.className = cls;
      span.textContent = text;
      el.appendChild(span);
    });
    container.appendChild(el);
  });
}

function renderEnd(view) {
  showScreen('screen-end');
  if (host.renderedKey === 'end') return;
  host.renderedKey = 'end';
  const top = view.top || [];
  const podium = document.getElementById('end-podium');
  podium.innerHTML = '';
  [1, 0, 2].forEach((idx) => {
    const row = top[idx];
    if (!row) return;
    const col = document.createElement('div');
    col.className = `podium-col podium-${idx + 1}`;
    const name = document.createElement('div');
    name.className = 'podium-name';
    name.textContent = row.nickname;
    const score = document.createElement('div');
    score.className = 'podium-score';
    score.textContent = `${row.score.toLocaleString()} คะแนน`;
    const block = document.createElement('div');
    block.className = 'podium-block';
    block.textContent = String(idx + 1);
    col.append(name, score, block);
    podium.appendChild(col);
  });
  const rest = document.getElementById('end-rest');
  rest.innerHTML = '';
  top.slice(3, 10).forEach((row, i) => {
    const span = document.createElement('span');
    span.textContent = `${i + 4}. ${row.nickname} (${row.score.toLocaleString()})`;
    rest.appendChild(span);
  });
}

function tickCountdown() {
  const view = host.view;
  if (!view || view.phase !== 'question') return;
  const remaining = view.endsAt - (Date.now() + host.offsetMs);
  const el = document.getElementById('q-countdown');
  el.textContent = Math.max(0, Math.ceil(remaining / 1000));
  el.classList.toggle('is-urgent', remaining <= 5000);

  const everyoneAnswered = view.playerCount > 0 && view.answered >= view.playerCount;
  const timeUp = remaining <= -QUIZ_HOST_CONFIG.autoRevealDelayMs;
  if ((everyoneAnswered || timeUp) && host.autoRevealedFor !== `q${view.q}` && !host.busy) {
    host.autoRevealedFor = `q${view.q}`;
    refresh('reveal');
  }
}

/* ---------------- Controls ---------------- */

function primaryAction() {
  const view = host.view;
  if (!view) return null;
  if (view.phase === 'lobby') return { label: 'เริ่มเกม ▶', cmd: 'start', disabled: view.playerCount === 0 };
  if (view.phase === 'question') return { label: 'เฉลยเลย', cmd: 'reveal' };
  if (view.phase === 'reveal') {
    return view.q + 1 >= view.total ? { label: 'ดูผลสรุป 🏆', cmd: 'next' } : { label: 'ข้อต่อไป ▶', cmd: 'next' };
  }
  return null;
}

function renderControls() {
  const controls = document.getElementById('controls');
  controls.innerHTML = '';
  const view = host.view;
  if (!view) return;

  if (view.phase === 'lobby' || view.phase === 'end') {
    const reset = document.createElement('button');
    reset.className = 'secondary';
    reset.textContent = view.phase === 'end' ? 'เริ่มเกมใหม่ (ล้างคะแนน)' : 'ล้างผู้เล่น';
    reset.disabled = host.busy;
    reset.addEventListener('click', () => {
      if (confirm('ล้างผู้เล่นและคะแนนทั้งหมด แล้วเริ่มเกมใหม่?')) refresh('reset');
    });
    controls.appendChild(reset);
  }
  const action = primaryAction();
  if (action) {
    const btn = document.createElement('button');
    btn.id = 'primary-btn';
    btn.textContent = host.busy ? 'กำลังทำงาน…' : action.label;
    btn.disabled = host.busy || action.disabled;
    btn.addEventListener('click', () => refresh(action.cmd));
    controls.appendChild(btn);
  }
}

function renderJoinQr() {
  document.getElementById('join-url').textContent = QUIZ_HOST_CONFIG.joinUrl.replace(/^https?:\/\//, '');
  if (typeof qrcode !== 'function') return;
  const qr = qrcode(0, 'M');
  qr.addData(QUIZ_HOST_CONFIG.joinUrl);
  qr.make();
  const img = document.createElement('img');
  img.src = qr.createDataURL(10, 0);
  img.alt = 'QR เข้าร่วมเกม';
  document.getElementById('join-qr').appendChild(img);
}

document.addEventListener('DOMContentLoaded', () => {
  if (!hostKey) {
    document.getElementById('key-missing').hidden = false;
    return;
  }
  renderJoinQr();
  refresh();
  setInterval(refresh, QUIZ_HOST_CONFIG.statusPollMs);
  setInterval(tickCountdown, 200);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'f' || e.key === 'F') {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
      return;
    }
    if (['Enter', ' ', 'ArrowRight'].includes(e.key)) {
      e.preventDefault();
      document.getElementById('primary-btn')?.click();
    }
  });
  navigator.wakeLock?.request('screen').catch(() => {});
});
