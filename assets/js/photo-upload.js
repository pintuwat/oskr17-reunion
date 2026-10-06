/* ==========================================================
   OSKR17th Anniversary — Photo upload page (photo-upload.html)
   ส่งรูปขึ้นจอใหญ่ — action: 'photoWallUpload' จัดการโดย PhotoWall.gs
   ========================================================== */

const PHOTO_UPLOAD_CONFIG = {
  scriptUrl: 'https://script.google.com/macros/s/AKfycbwe3cldBEPaTPYn102wAOT8Yq2EyqUIqQ1y7_h4Wjvfg9FggSmmHbmpLnaYXHIHcyiG/exec',
  maxFiles: 10,
  maxDimension: 2000,
  jpegQuality: 0.85,
};

let selectedFiles = [];

function showUploadBanner(message) {
  const banner = document.getElementById('form-banner');
  banner.textContent = message;
  banner.classList.remove('hidden');
  banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function hideUploadBanner() {
  document.getElementById('form-banner').classList.add('hidden');
}

function setUploadSubmitting(isSubmitting, label) {
  const btn = document.getElementById('submit-btn');
  btn.disabled = isSubmitting;
  document.getElementById('submit-btn-label').textContent = label || 'ส่งรูปขึ้นจอ';
  btn.querySelector('.btn-spinner')?.remove();
  if (isSubmitting) {
    const spinner = document.createElement('span');
    spinner.className = 'btn-spinner';
    btn.appendChild(spinner);
  }
}

function renderPreviews() {
  const grid = document.getElementById('preview-grid');
  grid.querySelectorAll('img').forEach((img) => URL.revokeObjectURL(img.src));
  grid.innerHTML = '';
  selectedFiles.forEach((file, index) => {
    const wrap = document.createElement('div');
    wrap.className = 'relative aspect-square';
    const img = document.createElement('img');
    img.src = URL.createObjectURL(file);
    img.alt = '';
    img.className = 'w-full h-full object-cover rounded-lg border border-navy/10';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'upload-remove-btn';
    remove.setAttribute('aria-label', 'ลบรูปนี้');
    remove.textContent = '×';
    remove.addEventListener('click', () => {
      selectedFiles.splice(index, 1);
      renderPreviews();
    });
    wrap.append(img, remove);
    grid.appendChild(wrap);
  });
}

// ย่อรูปฝั่งมือถือก่อนส่ง — รูปจากกล้องมือถือ 5-10MB ส่งช้ามากบนเน็ตในงาน
function resizeToJpegDataUrl(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, PHOTO_UPLOAD_CONFIG.maxDimension / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', PHOTO_UPLOAD_CONFIG.jpegQuality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('unsupported_image'));
    };
    img.src = url;
  });
}

async function uploadOnePhoto(file, name) {
  const imageBase64 = await resizeToJpegDataUrl(file);
  const response = await fetch(PHOTO_UPLOAD_CONFIG.scriptUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'photoWallUpload', name, imageBase64, consent: true }),
  });
  const result = await response.json();
  if (result.result !== 'success') throw new Error(result.message || 'upload_failed');
}

function initPhotoUpload() {
  const input = document.getElementById('photos');
  input.addEventListener('change', () => {
    const picked = Array.from(input.files).filter((f) => f.type.startsWith('image/'));
    selectedFiles = selectedFiles.concat(picked).slice(0, PHOTO_UPLOAD_CONFIG.maxFiles);
    input.value = '';
    hideUploadBanner();
    renderPreviews();
  });

  document.getElementById('upload-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    hideUploadBanner();

    if (selectedFiles.length === 0) {
      showUploadBanner('กรุณาเลือกรูปอย่างน้อย 1 รูป');
      return;
    }
    if (!document.getElementById('consent').checked) {
      showUploadBanner('กรุณาติ๊กยินยอมให้แสดงรูปบนจอ');
      return;
    }

    const name = document.getElementById('name').value.trim();
    const total = selectedFiles.length;
    let sent = 0;
    try {
      while (selectedFiles.length > 0) {
        setUploadSubmitting(true, `กำลังส่งรูป ${sent + 1}/${total}…`);
        await uploadOnePhoto(selectedFiles[0], name);
        // ตัดรูปที่ส่งสำเร็จออกทันที — ถ้ารูปถัดไปพัง กดส่งใหม่จะไม่ส่งรูปเดิมซ้ำ
        selectedFiles.shift();
        sent++;
      }
      renderPreviews();
      document.getElementById('upload-success-text').textContent =
        `ส่งแล้ว ${sent} รูป — รูปของคุณจะขึ้นจอใหญ่ภายในไม่กี่วินาที`;
      document.getElementById('upload-form').classList.add('hidden');
      document.getElementById('upload-success').classList.remove('hidden');
    } catch (err) {
      renderPreviews();
      const prefix = sent > 0 ? `ส่งสำเร็จ ${sent} รูปแล้ว — ` : '';
      showUploadBanner(err.message === 'unsupported_image'
        ? `${prefix}มีรูปที่เปิดไม่ได้ (ไฟล์ไม่รองรับ) กรุณาลบรูปนั้นแล้วลองใหม่`
        : `${prefix}รูปที่เหลือส่งไม่สำเร็จ กรุณากดส่งอีกครั้ง`);
    } finally {
      setUploadSubmitting(false);
    }
  });

  document.getElementById('upload-again-btn').addEventListener('click', () => {
    document.getElementById('upload-success').classList.add('hidden');
    document.getElementById('upload-form').classList.remove('hidden');
  });
}

document.addEventListener('DOMContentLoaded', initPhotoUpload);
