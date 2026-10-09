/**
 * OSKR17th Anniversary — ถามความต้องการอาหารเจ (สำหรับหน้า vegetarian-meal.html)
 *
 * รับเบอร์โทร + คำตอบ (ต้องการ/ไม่ต้องการอาหารเจ) จับคู่แถวผู้ลงทะเบียนด้วยเบอร์โทร
 * แล้วเขียนลงคอลัมน์ "อาหารเจ" (สร้างให้อัตโนมัติครั้งแรก) ในชีทลงทะเบียนหลัก
 * ไม่พบเบอร์ = ไม่เขียนอะไรลงชีท
 *
 * เรียกผ่าน doPost ใน Code.gs ด้วย action: 'vegetarianMeal'
 * body: { action: 'vegetarianMeal', phone, wantVegetarian: 'yes'|'no' }
 *
 * ใช้ normalizePhoneDigits() จาก VehiclePlate.gs และ getTargetSheet/buildColIndex/
 * makeEnsureColumn/jsonOutput จาก Code.gs (global scope เดียวกัน — ห้ามประกาศซ้ำ)
 */
function handleVegetarianMeal(data) {
  const phoneRaw = (data.phone || '').toString().trim();
  const answer = data.wantVegetarian === 'yes' ? 'ต้องการ'
    : (data.wantVegetarian === 'no' ? 'ไม่ต้องการ' : '');

  if (!phoneRaw || !answer) {
    return jsonOutput({ result: 'error', code: 'invalid_input', message: 'กรุณากรอกเบอร์โทรศัพท์และเลือกคำตอบให้ครบถ้วน' });
  }

  const normalizedInput = normalizePhoneDigits(phoneRaw);
  if (normalizedInput.length < 9) {
    return jsonOutput({ result: 'error', code: 'invalid_input', message: 'เบอร์โทรศัพท์ไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง' });
  }

  const notFound = { result: 'error', code: 'not_found', message: 'ไม่พบเบอร์โทรศัพท์นี้ในระบบลงทะเบียน กรุณาตรวจสอบและกรอกใหม่อีกครั้ง' };
  const sheet = getTargetSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return jsonOutput(notFound);

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const colIndex = buildColIndex(headers);
  const phoneColIdx = colIndex['เบอร์โทรศัพท์'];
  if (phoneColIdx === undefined) {
    return jsonOutput({ result: 'error', code: 'server_error', message: 'ระบบขัดข้อง กรุณาติดต่อทีมงาน' });
  }

  // อ่านเฉพาะคอลัมน์เบอร์โทร — การอ่านทั้งแถวของชีทนี้ช้ามาก (ดู VehiclePlate.gs)
  const phoneValues = sheet.getRange(2, phoneColIdx + 1, lastRow - 1, 1).getValues();
  const matchIndex = phoneValues.findIndex((r) => normalizePhoneDigits(r[0]) === normalizedInput);
  if (matchIndex === -1) return jsonOutput(notFound);

  const ensureColumn = makeEnsureColumn(sheet, headers, colIndex);
  const vegColIdx = ensureColumn('อาหารเจ');
  sheet.getRange(matchIndex + 2, vegColIdx + 1).setValue(answer);

  return jsonOutput({ result: 'success', answer: answer });
}
