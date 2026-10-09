/* ==========================================================
   OSKR17th Anniversary — Vegetarian meal page (vegetarian-meal.html)
   action: 'vegetarianMeal' จัดการโดย VegetarianMeal.gs — ต้องส่ง action ทุกครั้ง
   ไม่งั้น doPost จะตกไปที่ handleNewRegistration (บั๊กเดียวกับที่เคยเจอใน vehicle-plate)
   ========================================================== */

const VEG_CONFIG = {
  scriptUrl: 'https://script.google.com/macros/s/AKfycbwe3cldBEPaTPYn102wAOT8Yq2EyqUIqQ1y7_h4Wjvfg9FggSmmHbmpLnaYXHIHcyiG/exec',
};

function showVegBanner(message) {
  const banner = document.getElementById('form-banner');
  banner.textContent = message;
  banner.classList.remove('hidden');
  banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function hideVegBanner() {
  document.getElementById('form-banner').classList.add('hidden');
}

function setVegSubmitting(isSubmitting) {
  const btn = document.getElementById('submit-btn');
  btn.disabled = isSubmitting;
  document.getElementById('submit-btn-label').textContent = isSubmitting ? 'กำลังบันทึก…' : 'บันทึกคำตอบ';
  btn.querySelector('.btn-spinner')?.remove();
  if (isSubmitting) {
    const spinner = document.createElement('span');
    spinner.className = 'btn-spinner';
    btn.appendChild(spinner);
  }
}

function showVegSuccess(answer) {
  document.getElementById('veg-answer').textContent = answer;
  document.getElementById('veg-form').classList.add('hidden');
  const success = document.getElementById('veg-success');
  success.classList.remove('hidden');
  success.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function initVegForm() {
  const form = document.getElementById('veg-form');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideVegBanner();

    const phone = document.getElementById('phone').value.trim();
    const wantVegetarian = document.querySelector('input[name="wantVegetarian"]:checked')?.value || '';

    if (!phone || !wantVegetarian) {
      showVegBanner('กรุณากรอกเบอร์โทรศัพท์และเลือกคำตอบให้ครบถ้วน');
      return;
    }

    setVegSubmitting(true);
    try {
      const response = await fetch(VEG_CONFIG.scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'vegetarianMeal', phone, wantVegetarian }),
      });
      const result = await response.json();
      if (result.result === 'success') {
        showVegSuccess(result.answer);
      } else {
        showVegBanner(result.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง หรือติดต่อทีมงาน');
        if (result.code === 'not_found') document.getElementById('phone').focus();
      }
    } catch (err) {
      showVegBanner('ไม่ได้รับการยืนยันจากระบบ (เครือข่ายมีปัญหา) — กดบันทึกซ้ำได้เลย ไม่ซ้ำซ้อน หากลองหลายครั้งแล้วไม่สำเร็จ กรุณาติดต่อทีมงานโดยตรง');
    } finally {
      setVegSubmitting(false);
    }
  });

  document.getElementById('veg-again-btn').addEventListener('click', () => {
    document.getElementById('veg-success').classList.add('hidden');
    form.classList.remove('hidden');
    hideVegBanner();
  });
}

document.addEventListener('DOMContentLoaded', initVegForm);
