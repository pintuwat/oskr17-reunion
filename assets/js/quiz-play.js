/* ==========================================================
   OSKR17th Anniversary — Quiz player page (quiz-play.html)
   poll สถานะเกมทุก ~4 วินาที (action=quizState อ่านแค่ cache ฝั่ง Apps Script)
   ส่งคำตอบ action: 'quizAnswer' / เข้าร่วม action: 'quizJoin' — จัดการโดย Quiz.gs
   ========================================================== */

const QUIZ_PLAY_CONFIG = {
  scriptUrl: 'https://script.google.com/macros/s/AKfycbwe3cldBEPaTPYn102wAOT8Yq2EyqUIqQ1y7_h4Wjvfg9FggSmmHbmpLnaYXHIHcyiG/exec',
  pollMs: 4000,
  pollJitterMs: 1000,
  storageKey: 'oskr17_quiz_player',
};
const QUIZ_SHAPES = ['▲', '◆', '●', '■'];

const player = loadPlayer();
const play = {
  state: null,
  offsetMs: 0,
  shownKey: '',
  shownAt: 0,
  sending: false,
  failures: 0,
  pollTimer: null,
  forceJoinView: false,
};

function loadPlayer() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(QUIZ_PLAY_CONFIG.storageKey)) || {}; } catch (err) { saved = {}; }
  if (!saved.playerId) {
    saved.playerId = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
  }
  saved.answers = saved.answers || {};
  return saved;
}

function savePlayer() {
  try { localStorage.setItem(QUIZ_PLAY_CONFIG.storageKey, JSON.stringify(player)); } catch (err) { /* private mode */ }
}

function show(viewId) {
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('is-active', v.id === viewId));
}

function serverNow() {
  return Date.now() + play.offsetMs;
}

async function postAction(payload) {
  const response = await fetch(QUIZ_PLAY_CONFIG.scriptUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  });
  return response.json();
}

/* ---------------- Polling ---------------- */

async function poll() {
  if (play.inFlight) return;
  play.inFlight = true;
  clearTimeout(play.pollTimer);
  try {
    const response = await fetch(`${QUIZ_PLAY_CONFIG.scriptUrl}?action=quizState`);
    const data = await response.json();
    play.offsetMs = data.now - Date.now();
    play.state = data.state;
    play.failures = 0;
    document.getElementById('net-warning').style.display = 'none';
    render();
  } catch (err) {
    play.failures++;
    if (play.failures >= 2) document.getElementById('net-warning').style.display = 'block';
  }
  play.inFlight = false;
  play.pollTimer = setTimeout(poll, QUIZ_PLAY_CONFIG.pollMs + Math.random() * QUIZ_PLAY_CONFIG.pollJitterMs);
}

/* ---------------- Rendering ---------------- */

function render() {
  const state = play.state;
  if (!state) return;

  if (play.forceJoinView || player.gameId !== state.gameId || !player.nickname) {
    renderJoin();
    return;
  }

  document.getElementById('hdr-name').textContent = player.nickname;
  const me = state.players && state.players[player.playerId];
  if (me) document.getElementById('hdr-score').textContent = `${me[0].toLocaleString()} คะแนน`;
  if (state.phase === 'lobby') document.getElementById('hdr-score').textContent = '';

  if (state.phase === 'lobby') {
    show('view-lobby');
  } else if (state.phase === 'question') {
    renderQuestion(state);
  } else if (state.phase === 'reveal') {
    renderReveal(state, me);
  } else if (state.phase === 'end') {
    renderEnd(state, me);
  }
}

function renderJoin() {
  if (!document.getElementById('view-join').classList.contains('is-active')) {
    document.getElementById('nickname').value = player.nickname || '';
    document.getElementById('join-error').textContent = '';
    show('view-join');
  }
}

function answerKey(state) {
  return `${state.gameId}_${state.q}`;
}

function renderQuestion(state) {
  const key = answerKey(state);
  if (player.answers[key]) {
    show('view-answered');
    return;
  }
  const endsAtLocal = state.endsAt - play.offsetMs;
  if (Date.now() > endsAtLocal) {
    show('view-timeout');
    return;
  }
  if (play.shownKey === key) return;

  play.shownKey = key;
  play.shownAt = Date.now();
  document.getElementById('q-no').textContent = `ข้อ ${state.q + 1} / ${state.total}`;
  document.getElementById('q-text').textContent = state.question.text;
  document.getElementById('q-error').textContent = '';
  const img = document.getElementById('q-image');
  img.hidden = !state.question.image;
  if (state.question.image) img.src = state.question.image;

  const options = document.getElementById('q-options');
  options.innerHTML = '';
  state.question.options.forEach((text, i) => {
    const btn = document.createElement('button');
    btn.className = `opt opt-${i + 1}`;
    const shape = document.createElement('span');
    shape.className = 'shape';
    shape.textContent = QUIZ_SHAPES[i];
    const label = document.createElement('span');
    label.textContent = text;
    btn.append(shape, label);
    btn.addEventListener('click', () => submitAnswer(state, i + 1));
    options.appendChild(btn);
  });
  show('view-question');
  tickTimer();
}

function tickTimer() {
  const state = play.state;
  if (!state || state.phase !== 'question' || play.shownKey !== answerKey(state)) return;
  if (!document.getElementById('view-question').classList.contains('is-active')) return;
  const remaining = Math.max(0, state.endsAt - serverNow());
  document.getElementById('q-seconds').textContent = `${Math.ceil(remaining / 1000)} วินาที`;
  document.getElementById('q-timer').style.width = `${(remaining / (state.duration * 1000)) * 100}%`;
  if (remaining <= 0) {
    show('view-timeout');
    return;
  }
  setTimeout(tickTimer, 250);
}

async function submitAnswer(state, choice) {
  if (play.sending) return;
  play.sending = true;
  const key = answerKey(state);
  const buttons = document.querySelectorAll('#q-options .opt');
  buttons.forEach((b, i) => { b.disabled = i + 1 !== choice; });
  try {
    const result = await postAction({
      action: 'quizAnswer',
      gameId: state.gameId,
      q: state.q,
      playerId: player.playerId,
      choice,
      elapsedMs: Date.now() - play.shownAt,
    });
    if (result.result === 'success') {
      player.answers[key] = choice;
      savePlayer();
      show('view-answered');
    } else {
      document.getElementById('q-error').textContent = result.message || 'ส่งคำตอบไม่สำเร็จ';
      if (result.code === 'closed') {
        show('view-timeout');
      } else {
        buttons.forEach((b) => { b.disabled = false; });
      }
    }
  } catch (err) {
    document.getElementById('q-error').textContent = 'ส่งไม่สำเร็จ (เน็ตสะดุด) — กดตอบอีกครั้ง';
    buttons.forEach((b) => { b.disabled = false; });
  } finally {
    play.sending = false;
  }
}

function renderReveal(state, me) {
  const myChoice = player.answers[answerKey(state)];
  const box = document.getElementById('reveal-box');
  const points = me ? me[2] : 0;
  const rankLine = me ? `อันดับที่ ${me[1]} จาก ${state.playerCount} คน` : '';
  let cls, headline, sub;
  if (!myChoice) {
    cls = 'result-none'; headline = '😶 ไม่ได้ตอบข้อนี้'; sub = '+0';
  } else if (myChoice === state.correct) {
    cls = 'result-correct'; headline = '✅ ถูกต้อง!'; sub = `+${points.toLocaleString()}`;
  } else {
    cls = 'result-wrong'; headline = '❌ ยังไม่ถูก'; sub = `เฉลย: ${QUIZ_SHAPES[state.correct - 1]} ${state.question.options[state.correct - 1] || ''}`;
  }
  box.className = cls;
  box.innerHTML = '';
  [['big', headline], ['big', sub], ['pill', rankLine]].forEach(([c, text]) => {
    if (!text) return;
    const el = document.createElement('p');
    el.className = c;
    el.style.margin = '8px 0';
    el.textContent = text;
    box.appendChild(el);
  });
  show('view-reveal');
}

function renderEnd(state, me) {
  const rank = me ? me[1] : null;
  document.getElementById('end-emoji').textContent = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '🏆';
  document.getElementById('end-rank').textContent = rank ? `อันดับที่ ${rank} จาก ${state.playerCount} คน` : 'จบเกมแล้ว';
  document.getElementById('end-score').textContent = me ? `คะแนนรวม ${me[0].toLocaleString()} คะแนน` : '';
  show('view-end');
}

/* ---------------- Join ---------------- */

async function join() {
  const nickname = document.getElementById('nickname').value.trim();
  const errorEl = document.getElementById('join-error');
  if (!nickname) {
    errorEl.textContent = 'กรุณาใส่ชื่อเล่น';
    return;
  }
  const btn = document.getElementById('join-btn');
  btn.disabled = true;
  btn.textContent = 'กำลังเข้าร่วม…';
  try {
    const result = await postAction({ action: 'quizJoin', playerId: player.playerId, nickname });
    if (result.result !== 'success') throw new Error(result.message);
    player.nickname = nickname;
    player.gameId = result.gameId;
    savePlayer();
    play.forceJoinView = false;
    show('view-loading');
    poll();
  } catch (err) {
    errorEl.textContent = err.message || 'เข้าร่วมไม่สำเร็จ ลองอีกครั้ง';
  } finally {
    btn.disabled = false;
    btn.textContent = 'เข้าร่วมเกม';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('join-btn').addEventListener('click', join);
  document.getElementById('nickname').addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });
  document.getElementById('rename-btn').addEventListener('click', () => {
    play.forceJoinView = true;
    renderJoin();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') poll();
  });
  poll();
});
