/* ==========================================================
   OSKR17th Anniversary — Costume contest voting (costume-vote.html)
   1 เครื่อง = 1 เสียง (voterId ใน localStorage) เปลี่ยนใจได้จนกว่าทีมงานจะปิดโหวต
   action: 'costumeVote' / GET action=costumeState — จัดการโดย Costume.gs
   ========================================================== */

const CV_CONFIG = {
  scriptUrl: 'https://script.google.com/macros/s/AKfycbwe3cldBEPaTPYn102wAOT8Yq2EyqUIqQ1y7_h4Wjvfg9FggSmmHbmpLnaYXHIHcyiG/exec',
  refreshMs: 15000,
  refreshJitterMs: 5000,
  storageKey: 'oskr17_costume_voter',
};

const voter = (() => {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(CV_CONFIG.storageKey)) || {}; } catch (err) { saved = {}; }
  if (!saved.voterId) saved.voterId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return saved;
})();
const cv = { state: null, selected: null, sending: false, gridKey: '' };

function saveVoter() {
  try { localStorage.setItem(CV_CONFIG.storageKey, JSON.stringify(voter)); } catch (err) { /* private mode */ }
}

function cvStatusText(state) {
  if (state.phase === 'register') return 'ยังไม่เปิดโหวต — ดูผู้เข้าประกวดไปก่อนได้เลย';
  if (state.phase === 'closed') return voter.votedNo ? `ปิดโหวตแล้ว · คุณโหวต <strong>#${voter.votedNo}</strong> — รอประกาศผล` : 'ปิดโหวตแล้ว — รอประกาศผล';
  if (state.phase === 'results') return '🏆 ประกาศผลแล้ว!';
  return voter.votedNo
    ? `คุณโหวต <strong>#${voter.votedNo}</strong> แล้ว · เปลี่ยนใจได้จนกว่าจะปิดโหวต`
    : 'แตะเลือกชุดที่ชอบ แล้วกดโหวต';
}

function cvRenderGrid(state) {
  const grid = document.getElementById('grid');
  const key = JSON.stringify(state.contestants.map((c) => [c.no, c.name, c.src]));
  if (key !== cv.gridKey) {
    cv.gridKey = key;
    grid.innerHTML = '';
    state.contestants.forEach((c) => {
      const card = document.createElement('button');
      card.className = 'card';
      card.dataset.no = c.no;
      const img = document.createElement('img');
      img.src = c.src;
      img.alt = '';
      img.loading = 'lazy';
      const no = document.createElement('span');
      no.className = 'no';
      no.textContent = `#${c.no}`;
      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.textContent = c.name;
      card.append(img, no, meta);
      card.addEventListener('click', () => {
        if (cv.state.phase !== 'voting') return;
        cv.selected = c.no;
        cvRenderSelection();
      });
      grid.appendChild(card);
    });
  }
  cvRenderSelection();
}

function cvRenderSelection() {
  document.querySelectorAll('.card').forEach((card) => {
    const no = Number(card.dataset.no);
    card.classList.toggle('is-selected', no === cv.selected);
    card.classList.toggle('is-voted', no === voter.votedNo);
  });
  const btn = document.getElementById('vote-btn');
  const voting = cv.state && cv.state.phase === 'voting';
  document.getElementById('bar').hidden = !voting;
  if (cv.sending) {
    btn.textContent = 'กำลังส่งโหวต…';
    btn.disabled = true;
  } else if (!cv.selected) {
    btn.textContent = 'เลือกผู้เข้าประกวดก่อน';
    btn.disabled = true;
  } else if (cv.selected === voter.votedNo) {
    btn.textContent = `โหวต #${cv.selected} แล้ว ✓`;
    btn.disabled = true;
  } else {
    btn.textContent = voter.votedNo ? `เปลี่ยนโหวตเป็น #${cv.selected}` : `โหวต #${cv.selected}`;
    btn.disabled = false;
  }
}

function cvRenderResults(results) {
  const box = document.getElementById('results');
  box.innerHTML = '';
  const medals = ['🥇', '🥈', '🥉'];
  results.forEach((r) => {
    const row = document.createElement('div');
    row.className = 'r-row';
    const rank = document.createElement('span');
    rank.className = 'r-rank';
    rank.textContent = medals[r.rank - 1] || String(r.rank);
    const img = document.createElement('img');
    img.src = r.src;
    img.alt = '';
    const name = document.createElement('span');
    name.className = 'r-name';
    name.textContent = `#${r.no} ${r.name}`;
    const votes = document.createElement('span');
    votes.className = 'r-votes';
    votes.textContent = `${r.votes} เสียง`;
    row.append(rank, img, name, votes);
    box.appendChild(row);
  });
}

function cvApply(state) {
  cv.state = state;
  document.getElementById('status').innerHTML = cvStatusText(state);
  const showResults = state.phase === 'results' && state.results;
  document.getElementById('results').hidden = !showResults;
  document.getElementById('grid').hidden = showResults;
  if (showResults) {
    document.getElementById('bar').hidden = true;
    cvRenderResults(state.results);
    return;
  }
  if (!state.contestants.length) {
    document.getElementById('status').textContent = 'ยังไม่มีผู้เข้าประกวด — รอสักครู่';
  }
  if (cv.selected === null && voter.votedNo) cv.selected = voter.votedNo;
  cvRenderGrid(state);
}

async function cvRefresh() {
  try {
    const response = await fetch(`${CV_CONFIG.scriptUrl}?action=costumeState`);
    cvApply(JSON.parse(await response.text()));
  } catch (err) {
    // เน็ตสะดุด — ลองใหม่รอบหน้า
  }
}

async function cvRefreshLoop() {
  await cvRefresh();
  setTimeout(cvRefreshLoop, CV_CONFIG.refreshMs + Math.random() * CV_CONFIG.refreshJitterMs);
}

async function cvVote() {
  if (!cv.selected || cv.sending) return;
  cv.sending = true;
  document.getElementById('vote-error').textContent = '';
  cvRenderSelection();
  try {
    let result;
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        const response = await fetch(CV_CONFIG.scriptUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: 'costumeVote', voterId: voter.voterId, no: cv.selected }),
        });
        result = JSON.parse(await response.text());
        break;
      } catch (err) {
        if (attempt === 4) throw err;
        await new Promise((r) => setTimeout(r, 700 * attempt + Math.random() * 800));
      }
    }
    if (result.result === 'success') {
      voter.votedNo = result.no;
      saveVoter();
      document.getElementById('status').innerHTML = cvStatusText(cv.state);
    } else {
      document.getElementById('vote-error').textContent = result.message || 'โหวตไม่สำเร็จ';
      if (result.code === 'closed') cvRefresh();
    }
  } catch (err) {
    document.getElementById('vote-error').textContent = 'ส่งไม่สำเร็จ (เน็ตสะดุด/ระบบยุ่ง) — กดอีกครั้ง';
  } finally {
    cv.sending = false;
    cvRenderSelection();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  saveVoter();
  document.getElementById('vote-btn').addEventListener('click', cvVote);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') cvRefresh(); });
  cvRefreshLoop();
});
