/* ==========================================================
   OSKR17th Anniversary — Costume contest screen (costume-screen.html)
   ?screen=side (ค่าเริ่มต้น) = ทีละ 1 คน · ?screen=main = 3 คนเรียงกัน
   ?interval=วินาที ต่อคน (ค่าเริ่มต้น 6) · กด F / คลิก = เต็มจอ
   ========================================================== */

const CS_PARAMS = new URLSearchParams(location.search);
const CS_CONFIG = {
  scriptUrl: 'https://script.google.com/macros/s/AKfycbwe3cldBEPaTPYn102wAOT8Yq2EyqUIqQ1y7_h4Wjvfg9FggSmmHbmpLnaYXHIHcyiG/exec',
  slotCount: Number(CS_PARAMS.get('slots')) || (CS_PARAMS.get('screen') === 'main' ? 3 : 1),
  secondsPerContestant: Number(CS_PARAMS.get('interval')) || 6,
  refreshMs: 10000,
  voteUrl: new URL('costume-vote.html', location.href).href,
};

const cs = { state: null, slots: [], cursor: 0, nextSlot: 0, resultsKey: '' };

function csRenderQr() {
  if (typeof qrcode !== 'function') return;
  const qr = qrcode(0, 'M');
  qr.addData(CS_CONFIG.voteUrl);
  qr.make();
  const src = qr.createDataURL(10, 0);
  document.querySelectorAll('[data-qr]').forEach((el) => {
    const img = document.createElement('img');
    img.src = src;
    img.alt = 'QR โหวต';
    el.appendChild(img);
  });
}

function csBuildSlots() {
  const stage = document.getElementById('stage');
  for (let i = 0; i < CS_CONFIG.slotCount; i++) {
    const el = document.createElement('div');
    el.className = 'slot';
    const layers = [0, 1].map(() => {
      const layer = document.createElement('div');
      layer.className = 'layer';
      layer.innerHTML = '<div class="layer-bg"></div><img class="layer-img" alt=""><div class="badge"></div><div class="name"></div>';
      el.appendChild(layer);
      return layer;
    });
    stage.appendChild(el);
    cs.slots.push({ layers, active: 0, no: null });
  }
}

function csNextContestant() {
  const list = (cs.state && cs.state.contestants) || [];
  if (!list.length) return null;
  const onScreen = new Set(cs.slots.map((s) => s.no));
  for (let i = 0; i < list.length; i++) {
    const c = list[cs.cursor % list.length];
    cs.cursor++;
    if (!onScreen.has(c.no) || list.length <= cs.slots.length) return c;
  }
  return null;
}

function csShow(slot) {
  const c = csNextContestant();
  if (!c) return;
  slot.no = c.no;
  const preload = new Image();
  preload.onload = () => {
    if (slot.no !== c.no) return;
    const next = 1 - slot.active;
    const layer = slot.layers[next];
    layer.querySelector('.layer-bg').style.backgroundImage = `url("${c.src}")`;
    layer.querySelector('.layer-img').src = c.src;
    layer.querySelector('.badge').textContent = `#${c.no}`;
    layer.querySelector('.name').textContent = c.name;
    layer.classList.add('is-active');
    slot.layers[slot.active].classList.remove('is-active');
    slot.active = next;
  };
  preload.src = c.src;
}

function csAdvance() {
  if (!cs.state || cs.state.phase === 'results' || !cs.state.contestants.length) return;
  const slot = cs.slots[cs.nextSlot];
  cs.nextSlot = (cs.nextSlot + 1) % cs.slots.length;
  csShow(slot);
}

function csRenderResults(results) {
  const key = JSON.stringify(results.map((r) => [r.no, r.votes]));
  if (key === cs.resultsKey) return;
  cs.resultsKey = key;
  const podium = document.getElementById('podium');
  podium.innerHTML = '';
  const medals = ['🥇', '🥈', '🥉'];
  [1, 0, 2].forEach((idx) => {
    const r = results[idx];
    if (!r) return;
    const col = document.createElement('div');
    col.className = `p-col p-${idx + 1}`;
    const medal = document.createElement('div');
    medal.className = 'p-medal';
    medal.textContent = medals[r.rank - 1] || `#${r.rank}`;
    const img = document.createElement('img');
    img.className = 'p-photo';
    img.src = r.src;
    img.alt = '';
    const name = document.createElement('div');
    name.className = 'p-name';
    name.textContent = `#${r.no} ${r.name}`;
    const votes = document.createElement('div');
    votes.className = 'p-votes';
    votes.textContent = `${r.votes} เสียง`;
    col.append(medal, img, name, votes);
    podium.appendChild(col);
  });
  const rest = document.getElementById('rest');
  rest.innerHTML = '';
  results.slice(3, 10).forEach((r) => {
    const span = document.createElement('span');
    span.textContent = `${r.rank}. #${r.no} ${r.name} (${r.votes})`;
    rest.appendChild(span);
  });
}

function csApply(state) {
  const firstLoad = !cs.state;
  const prevCount = cs.state ? cs.state.contestants.length : 0;
  cs.state = state;
  const isResults = state.phase === 'results' && state.results;
  document.getElementById('results').hidden = !isResults;
  document.getElementById('empty').hidden = isResults || state.contestants.length > 0;
  const badge = document.getElementById('qr-badge');
  badge.hidden = isResults;
  document.getElementById('qr-title').textContent =
    state.phase === 'voting' ? 'สแกนเพื่อโหวต' : state.phase === 'register' ? 'ดูผู้เข้าประกวด' : 'ปิดโหวตแล้ว';
  document.getElementById('qr-sub').textContent =
    state.phase === 'voting' ? 'ชุดที่ชอบที่สุด 1 เสียง' : state.phase === 'register' ? 'เปิดโหวตเร็ว ๆ นี้' : 'รอประกาศผล';
  if (isResults) {
    csRenderResults(state.results);
    return;
  }
  if (firstLoad || prevCount === 0) cs.slots.forEach((slot) => csShow(slot));
}

async function csRefresh() {
  try {
    const response = await fetch(`${CS_CONFIG.scriptUrl}?action=costumeState`);
    csApply(JSON.parse(await response.text()));
  } catch (err) {
    // เน็ตสะดุด — แสดงต่อจากข้อมูลเดิม
  }
}

document.addEventListener('DOMContentLoaded', () => {
  csRenderQr();
  csBuildSlots();
  csRefresh();
  setInterval(csRefresh, CS_CONFIG.refreshMs);
  setInterval(csAdvance, (CS_CONFIG.secondsPerContestant * 1000) / CS_CONFIG.slotCount);
  const fullscreen = () => { if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {}); };
  document.addEventListener('click', fullscreen);
  document.addEventListener('keydown', (e) => { if (e.key === 'f' || e.key === 'F') fullscreen(); });
  navigator.wakeLock?.request('screen').catch(() => {});
});
