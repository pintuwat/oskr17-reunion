/* ==========================================================
   OSKR17th Anniversary — Costume contest staff page (costume-staff.html?key=…)
   action: 'costumeStaff' จัดการโดย Costume.gs (key = QUIZ_HOST_KEY)
   ========================================================== */

const COSTUME_STAFF_CONFIG = {
  scriptUrl: 'https://script.google.com/macros/s/AKfycbwe3cldBEPaTPYn102wAOT8Yq2EyqUIqQ1y7_h4Wjvfg9FggSmmHbmpLnaYXHIHcyiG/exec',
  statusPollMs: 5000,
  maxDimension: 1600,
};
const COSTUME_PHASE_LABELS = { register: 'รับสมัคร (ยังไม่เปิดโหวต)', voting: 'กำลังโหวต', closed: 'ปิดโหวตแล้ว', results: 'ประกาศผลแล้ว' };
const staffKey = new URLSearchParams(location.search).get('key');
let staffPhoto = null;
let staffBusy = false;

async function staffCall(payload) {
  const response = await fetch(COSTUME_STAFF_CONFIG.scriptUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(Object.assign({ action: 'costumeStaff', key: staffKey }, payload)),
  });
  let data;
  try {
    data = JSON.parse(await response.text());
  } catch (err) {
    throw new Error('ระบบยุ่ง ลองใหม่อีกครั้ง');
  }
  if (data.result !== 'success') throw new Error(data.message || 'เกิดข้อผิดพลาด');
  return data;
}

function showBanner(message) {
  const banner = document.getElementById('form-banner');
  banner.textContent = message;
  banner.hidden = !message;
}

function renderView(view) {
  document.getElementById('phase-label').textContent = COSTUME_PHASE_LABELS[view.phase] || view.phase;
  document.getElementById('total-votes').textContent = view.totalVotes;
  document.querySelectorAll('.phase-btn').forEach((btn) => {
    btn.classList.toggle('is-current', btn.dataset.phase === view.phase);
    btn.disabled = staffBusy;
  });
  document.getElementById('count').textContent = view.contestants.length;

  const list = document.getElementById('list');
  list.innerHTML = '';
  view.contestants.slice().sort((a, b) => a.no - b.no).forEach((c) => {
    const card = document.createElement('div');
    card.className = 'rounded-xl border border-navy/10 overflow-hidden bg-white';
    const img = document.createElement('img');
    img.src = c.src;
    img.alt = '';
    img.loading = 'lazy';
    img.className = 'w-full aspect-square object-cover';
    const meta = document.createElement('div');
    meta.className = 'p-2 text-sm';
    const title = document.createElement('div');
    title.className = 'font-semibold truncate';
    title.textContent = `#${c.no} ${c.name}`;
    const votes = document.createElement('div');
    votes.className = 'text-ink/60';
    votes.textContent = `${c.votes} เสียง`;
    meta.append(title, votes);
    card.append(img, meta);
    list.appendChild(card);
  });
}

async function refreshStatus(cmd = 'status', extra = {}) {
  if (cmd === 'status' && staffBusy) return null;
  if (cmd !== 'status') staffBusy = true;
  try {
    const view = await staffCall(Object.assign({ cmd }, extra));
    renderView(view);
    showBanner('');
    return view;
  } catch (err) {
    showBanner(err.message);
    return null;
  } finally {
    if (cmd !== 'status') {
      staffBusy = false;
      document.querySelectorAll('.phase-btn').forEach((btn) => { btn.disabled = false; });
    }
  }
}

function resizeToJpegDataUrl(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, COSTUME_STAFF_CONFIG.maxDimension / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('เปิดไฟล์รูปนี้ไม่ได้ ลองรูปอื่น'));
    };
    img.src = url;
  });
}

function initStaff() {
  if (!staffKey) {
    document.getElementById('key-missing').hidden = false;
    return;
  }
  const site = new URL('.', location.href).href;
  document.getElementById('link-side').href = `${site}costume-screen.html?screen=side`;
  document.getElementById('link-main').href = `${site}costume-screen.html?screen=main`;
  document.getElementById('link-vote').href = `${site}costume-vote.html`;

  document.getElementById('photo').addEventListener('change', (e) => {
    staffPhoto = e.target.files[0] || null;
    const preview = document.getElementById('preview');
    preview.hidden = !staffPhoto;
    if (staffPhoto) preview.src = URL.createObjectURL(staffPhoto);
  });

  document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('name').value.trim();
    if (!name || !staffPhoto) {
      showBanner('กรุณาใส่ชื่อและเลือกรูป');
      return;
    }
    const btn = document.getElementById('register-btn');
    btn.disabled = true;
    document.getElementById('register-label').textContent = 'กำลังลงทะเบียน…';
    try {
      const imageBase64 = await resizeToJpegDataUrl(staffPhoto);
      const view = await refreshStatus('register', { name, imageBase64 });
      if (view && view.registeredNo) {
        document.getElementById('registered-no').textContent = `#${view.registeredNo}`;
        document.getElementById('registered').hidden = false;
        document.getElementById('register-form').reset();
        document.getElementById('preview').hidden = true;
        staffPhoto = null;
      }
    } catch (err) {
      showBanner(err.message);
    } finally {
      btn.disabled = false;
      document.getElementById('register-label').textContent = 'ลงทะเบียน';
    }
  });

  document.querySelectorAll('.phase-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const labels = { voting: 'เปิดให้โหวต?', closed: 'ปิดโหวต? (ทุกคนจะโหวตไม่ได้แล้ว)', results: 'ประกาศผลบนจอและมือถือทุกเครื่อง?', register: 'กลับไปโหมดรับสมัคร? (ปิดโหวต)' };
      if (confirm(labels[btn.dataset.phase])) refreshStatus('phase', { phase: btn.dataset.phase });
    });
  });
  document.getElementById('refresh-btn').addEventListener('click', () => refreshStatus('refresh'));
  document.getElementById('reset-votes-btn').addEventListener('click', () => {
    if (confirm('ล้างคะแนนโหวตทั้งหมด และกลับไปโหมดรับสมัคร?')) refreshStatus('resetVotes');
  });

  refreshStatus();
  setInterval(() => refreshStatus(), COSTUME_STAFF_CONFIG.statusPollMs);
}

document.addEventListener('DOMContentLoaded', initStaff);
