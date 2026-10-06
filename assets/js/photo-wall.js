/* ==========================================================
   OSKR17th Anniversary — Photo Wall (photo-wall.html) สำหรับจอใหญ่วันงาน
   ?screen=main  จอกลาง (2305×1092) — 3 รูปเรียงกัน + แถบ QR ด้านขวา (ค่าเริ่มต้น)
   ?screen=side  จอข้าง (1240×780)  — 1 รูปเต็มจอ + QR มุมขวาล่าง
   ?slots=N / ?interval=วินาที  — ปรับจำนวนรูปต่อจอ / เวลาที่แต่ละรูปค้างไว้
   กดปุ่ม F หรือคลิกที่จอ = เต็มจอ
   ========================================================== */

const WALL_PARAMS = new URLSearchParams(location.search);
const WALL_SCREEN = WALL_PARAMS.get('screen') === 'side' ? 'side' : 'main';
const WALL_CONFIG = {
  scriptUrl: 'https://script.google.com/macros/s/AKfycbwe3cldBEPaTPYn102wAOT8Yq2EyqUIqQ1y7_h4Wjvfg9FggSmmHbmpLnaYXHIHcyiG/exec',
  slotCount: Number(WALL_PARAMS.get('slots')) || (WALL_SCREEN === 'side' ? 1 : 3),
  secondsPerPhoto: Number(WALL_PARAMS.get('interval')) || 8,
  feedRefreshMs: 20000,
  uploadUrl: new URL('photo-upload.html', location.href).href,
};

const wallState = {
  photos: new Map(),
  order: [],
  freshQueue: [],
  failed: new Set(),
  cursor: 0,
  loadedOnce: false,
  slots: [],
  nextSlot: 0,
};

function renderQrCodes() {
  if (typeof qrcode !== 'function') return;
  const qr = qrcode(0, 'M');
  qr.addData(WALL_CONFIG.uploadUrl);
  qr.make();
  const src = qr.createDataURL(10, 0);
  document.querySelectorAll('[data-qr]').forEach((el) => {
    el.innerHTML = '';
    const img = document.createElement('img');
    img.src = src;
    img.alt = 'QR แชร์รูปขึ้นจอ';
    el.appendChild(img);
  });
}

function buildSlots() {
  const container = document.getElementById('slots');
  for (let i = 0; i < WALL_CONFIG.slotCount; i++) {
    const el = document.createElement('div');
    el.className = 'slot';
    const layers = [0, 1].map(() => {
      const layer = document.createElement('div');
      layer.className = 'layer';
      layer.innerHTML = '<div class="layer-bg"></div><img class="layer-img" alt=""><div class="layer-caption"></div>';
      el.appendChild(layer);
      return layer;
    });
    container.appendChild(el);
    wallState.slots.push({ el, layers, active: 0, photoId: null });
  }
}

function captionFor(photo) {
  if (photo.name) return '📸 ' + photo.name;
  if (photo.source === 'instagram') return 'Instagram #oskr17timemachine';
  return '';
}

// รูปใหม่ (เพิ่งอัปโหลด) ได้คิวก่อน ที่เหลือวนตามลำดับ — ไม่ซ้ำกับรูปที่อยู่บนจอแล้ว
function pickNextPhotoId() {
  const onScreen = new Set(wallState.slots.map((s) => s.photoId));
  const usable = (id) => wallState.photos.has(id) && !onScreen.has(id) && !wallState.failed.has(id);

  while (wallState.freshQueue.length) {
    const id = wallState.freshQueue.shift();
    if (usable(id)) return id;
  }
  for (let i = 0; i < wallState.order.length; i++) {
    const id = wallState.order[wallState.cursor % wallState.order.length];
    wallState.cursor++;
    if (usable(id)) return id;
  }
  return null;
}

function showInSlot(slot, attemptsLeft = 3) {
  const id = pickNextPhotoId();
  if (!id) return;
  const photo = wallState.photos.get(id);
  const previousId = slot.photoId;
  slot.photoId = id;

  const preload = new Image();
  preload.onload = () => {
    if (slot.photoId !== id) return;
    const nextIndex = 1 - slot.active;
    const layer = slot.layers[nextIndex];
    layer.querySelector('.layer-bg').style.backgroundImage = `url("${photo.src}")`;
    const img = layer.querySelector('.layer-img');
    img.src = photo.src;
    layer.querySelector('.layer-caption').textContent = captionFor(photo);
    // restart the zoom animation for the incoming layer
    img.style.animation = 'none';
    void img.offsetWidth;
    img.style.animation = '';
    layer.classList.add('is-active');
    slot.layers[slot.active].classList.remove('is-active');
    slot.active = nextIndex;
  };
  preload.onerror = () => {
    // Drive อาจยังสร้าง thumbnail ของรูปที่เพิ่งอัปโหลดไม่เสร็จ — ลองใหม่รอบ feed ถัดไป
    wallState.failed.add(id);
    if (slot.photoId !== id) return;
    slot.photoId = previousId;
    if (attemptsLeft > 0) showInSlot(slot, attemptsLeft - 1);
  };
  preload.src = photo.src;
}

function clearSlot(slot) {
  slot.photoId = null;
  slot.layers.forEach((layer) => layer.classList.remove('is-active'));
}

function applyFeed(photos) {
  const known = new Set(wallState.photos.keys());
  const retry = Array.from(wallState.failed);
  wallState.failed.clear();

  wallState.photos = new Map(photos.map((p) => [p.id, p]));
  wallState.order = photos.map((p) => p.id);
  if (wallState.loadedOnce) {
    photos.filter((p) => !known.has(p.id)).forEach((p) => wallState.freshQueue.push(p.id));
  }
  retry.forEach((id) => wallState.freshQueue.push(id));
  wallState.loadedOnce = true;

  document.getElementById('empty').classList.toggle('hidden', photos.length > 0);

  // รูปที่ถูกซ่อน (คอลัมน์ Hide ในชีท) และยังค้างอยู่บนจอ — เปลี่ยนออกทันที
  wallState.slots.forEach((slot) => {
    if (slot.photoId && !wallState.photos.has(slot.photoId)) {
      clearSlot(slot);
      showInSlot(slot);
    } else if (!slot.photoId) {
      showInSlot(slot);
    }
  });
}

async function refreshFeed() {
  try {
    const response = await fetch(`${WALL_CONFIG.scriptUrl}?action=photoWallFeed`);
    const result = await response.json();
    if (result.result === 'success') applyFeed(result.photos || []);
  } catch (err) {
    // เน็ตสะดุด — แสดงรูปเดิมต่อไป แล้วลองใหม่รอบหน้า
  }
}

function advanceOneSlot() {
  if (wallState.order.length === 0) return;
  const slot = wallState.slots[wallState.nextSlot];
  wallState.nextSlot = (wallState.nextSlot + 1) % wallState.slots.length;
  showInSlot(slot);
}

function enterFullscreen() {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
}

async function keepScreenAwake() {
  try {
    await navigator.wakeLock?.request('screen');
  } catch (err) {
    // ไม่รองรับ/ไม่ได้รับอนุญาต — ตั้งค่าเครื่องไม่ให้จอดับเองแทน
  }
}

function initPhotoWall() {
  document.getElementById(WALL_SCREEN === 'side' ? 'qr-badge' : 'sidebar').classList.remove('hidden');
  renderQrCodes();
  buildSlots();
  refreshFeed();
  setInterval(refreshFeed, WALL_CONFIG.feedRefreshMs);
  setInterval(advanceOneSlot, (WALL_CONFIG.secondsPerPhoto * 1000) / WALL_CONFIG.slotCount);

  document.addEventListener('click', enterFullscreen);
  document.addEventListener('keydown', (e) => { if (e.key === 'f' || e.key === 'F') enterFullscreen(); });
  keepScreenAwake();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') keepScreenAwake();
  });
}

document.addEventListener('DOMContentLoaded', initPhotoWall);
