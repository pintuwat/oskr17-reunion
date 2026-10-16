/**
 * OSKR17th Anniversary — Combined Web App
 * (Check-in / QR scan  +  Registration + Connection Map)
 *
 * โปรเจกต์นี้มี 3 ไฟล์หลักทำงานร่วมกันบน Sheet เดียวกัน:
 * 1) Code.gs (ไฟล์นี้) — Check-in/Scan QR (ของเดิม: searchAttendee(),
 *    checkInAttendee(), doGet() เสิร์ฟหน้า 'index') + Registration/
 *    Connection Map ใหม่ (doGet ?action=lookup, doPost สำหรับ
 *    register.html/manage.html)
 * 2) Register.gs — handlePaymentStatusEdit(e) ต้องตั้งเป็น installable
 *    trigger ("From spreadsheet - On edit") ผ่านหน้า Triggers เอง — ตั้งใจ
 *    ไม่ตั้งชื่อฟังก์ชันว่า "onEdit" เพราะ Apps Script จะจำชื่อนี้เป็น simple
 *    trigger อัตโนมัติเสมอ (รันคู่ขนานกับ installable trigger ทุกครั้งที่แก้ไข
 *    ชีท แล้วฝั่ง simple trigger จะพังเพราะเรียก GmailApp ไม่ได้) ฟังก์ชันนี้ยิง
 *    อีเมลยืนยันการชำระเงินพร้อม QR Code + ลิงก์ Connection Map เมื่อ
 *    ทีมงานเปลี่ยน "สถานะชำระเงิน" เป็น "ชำระเงินแล้ว"
 * 3) Email.html — Template อีเมลที่ Register.gs ใช้
 *
 * คอลัมน์ในชีท: Registration ID, Timestamp, Email address,
 * ชื่อ-นามสกุล, ชื่อเล่น, เบอร์โทรศัพท์, แพ้อาหาร (ถ้ามี โปรดระบุ),
 * สายอาชีพ, โปรดระบุรายละเอียดเพิ่มเติม, วันที่โอนเงิน, เวลาที่โอน,
 * แนบสลิปโอนเงิน, กดรับทราบเงื่อนไข, สถานะชำระเงิน, ส่งอีเมล, QR Code,
 * Check in, Check in Time, Wristband No., เปิดรับคุยเรื่องอะไร,
 * ช่องทางติดต่อที่เปิดเผย, Edit Token, Password Hash, Password Salt,
 * Password Reset Token, Password Reset Expiry (4 คอลัมน์หลังนี้สร้าง
 * อัตโนมัติผ่าน ensureColumn() ตอนใช้งานครั้งแรก — ดู ManagePassword.gs)
 *
 * "Registration ID" เป็นสูตรที่เตรียมไว้ล่วงหน้าในชีทต่อแถว (สร้างจาก
 * Timestamp เช่น =if(B57="","","C"&TEXT(B57,"yyMMdd")&TEXT(B57,"HHmmSS")))
 * — Code.gs จะไม่เขียนทับคอลัมน์นี้เด็ดขาด แต่จะหาแถวที่มีสูตรอยู่แล้ว
 * แต่ Timestamp ยังว่าง แล้วกรอกข้อมูลอื่นเข้าไปแทน จากนั้นอ่านค่าที่สูตร
 * คำนวณได้กลับมาใช้เป็น Registration ID จริง ตัวอักษรแรกของ ID บอกระดับ
 * บัตร (A=First 50, B=Early Bird, C=Regular, D=Final Call) — ระดับนี้ถูก
 * กำหนดโดยว่าแถวไหนถูกเติมก่อน ไม่ใช่วันที่ลงทะเบียน
 *
 * ส่วน Registration กรอกให้เอง: ทุกคอลัมน์ข้างบน ยกเว้น Registration ID
 * (สูตร), ส่งอีเมล, QR Code, Check in, Check in Time, Wristband No.
 * (ปล่อยว่างให้ Register.gs/ทีมงานจัดการทีหลัง)
 *
 * "กดรับทราบเงื่อนไข" เป็น checkbox เดียวที่รวมทั้งการรับทราบเงื่อนไข
 * และการยินยอมให้แสดงข้อมูลใน Connection Map — ถ้าติ๊ก จะบันทึกข้อความ
 * ยืนยัน (ดู CONSENT_TEXT) ถ้าไม่ติ๊กจะเว้นว่าง
 *
 * หมายเหตุ: Code.gs ไม่ส่งอีเมลยืนยันทันทีตอนลงทะเบียน (ตัดออกแล้ว) —
 * อีเมลจริงมาจาก Register.gs หลังตรวจสลิปเสร็จ ดูด้านบน
 *
 * doGet(e) ทำหน้าที่สองอย่างตาม query string:
 *  - ?action=lookup&id=..&token=..  -> เช็กว่าแถวนี้ตั้งรหัสผ่านไว้หรือยัง
 *    (คืน authStage: 'setup' | 'login' เท่านั้น ไม่คืนโปรไฟล์ — ดู
 *    ManagePassword.gs — ต้องผ่าน setPassword/verifyPassword ก่อนถึงจะได้
 *    โปรไฟล์กลับมา)
 *  - ไม่มี action                    -> เสิร์ฟหน้าเช็คอินสแกน QR (ของเดิม)
 * doPost(e) เป็นของฝั่ง Registration ล้วน (ไม่มีของเดิมชนกัน):
 *  - action: 'update' / 'delete'    -> manage.html แก้ไข/ลบข้อมูลตัวเอง
 *  - action: 'setPassword' / 'verifyPassword' / 'forgotPassword' /
 *    'resetPassword' / 'changePassword' -> รหัสผ่านของ manage.html (ดู
 *    ManagePassword.gs) — changePassword ใช้ตอนอยู่ในหน้า manage.html แล้ว
 *    (ผ่าน verifyPassword/setPassword มาแล้ว) กดปุ่ม "เปลี่ยนรหัสผ่าน" เอง
 *    ต้องกรอกรหัสผ่านเดิมยืนยันก่อนเสมอ ต่างจาก resetPassword ที่มาจากอีเมล
 *    ตอนลืมรหัสผ่าน (ไม่ต้องรู้รหัสผ่านเดิม)
 *  - ไม่มี action                    -> register.html ลงทะเบียนใหม่
 */


// TODO: ใส่ Folder ID ของ Google Drive ที่เตรียมไว้เก็บรูปสลิป
// (เอาจาก URL ของโฟลเดอร์ เช่น drive.google.com/drive/folders/FOLDER_ID_ตรงนี้)
const DRIVE_FOLDER_ID = '1s1sLccqW-hdGGhItMwDKkvs5EUclPz_diPUg5pCZ5megUCYYPu_dKCu44hpQDmVliJTxpai4';

// สถานะชำระเงินเริ่มต้นเมื่อมีการส่งฟอร์ม (รอทีมงานตรวจสลิป)
const DEFAULT_PAYMENT_STATUS = 'รอตรวจสอบ';

// ข้อความยืนยัน — บันทึกลงคอลัมน์ "กดรับทราบเงื่อนไข" เมื่อติ๊ก checkbox เดียว
// ที่รวมทั้งการรับทราบเงื่อนไขและการยินยอมให้แสดงข้อมูลใน Connection Map
const CONSENT_TEXT = 'ขอยืนยันว่าข้อมูลทั้งหมดถูกต้อง และยินยอมให้คณะผู้จัดเก็บ/แสดงข้อมูลเพื่อใช้ในการจัดงานตามวัตถุประสงค์';

// ระดับบัตรตามตัวอักษรแรกของ Registration ID (สูตรในชีทฝัง prefix ไว้ตามช่วงแถว
// ที่เตรียมล่วงหน้าให้แต่ละระดับ — ต้องตรงกับ ticketTier switch ใน checkInAttendee())
function ticketTierLabel(registrationId) {
  if (!registrationId) return 'Regular';
  const firstChar = registrationId.toString().charAt(0).toUpperCase();
  switch (firstChar) {
    // A (First 50) รวมมาแสดงเป็น "Early Bird" เดียวกับ B แล้ว — ไม่โชว์ "First 50"
    // ให้ผู้ใช้เห็นอีกต่อไป (ยังคงแยก A/B ในชีทเหมือนเดิมสำหรับงานภายใน เช่น ของพิเศษ)
    case 'A':
    case 'B': return 'Early Bird';
    case 'C': return 'Regular';
    case 'D': return 'Final Call';
    default: return 'Regular';
  }
}

/* ============================================================
   doGet / doPost — จุดเข้าเดียวของ Web App ทั้งสองส่วน
   ============================================================ */
function doGet(e) {
  const action = e.parameter && e.parameter.action;
  if (action === 'lookup') {
    return handleLookup(e.parameter.id, e.parameter.token);
  }
  if (action === 'tree') {
    return handleTree(e.parameter.token);
  }
  if (action === 'claimSearch') {
    return handleClaimSearch(e.parameter.q);
  }
  if (action === 'photoWallFeed') {
    return handlePhotoWallFeed();
  }
  if (action === 'quizState') {
    return handleQuizState();
  }
  if (action === 'costumeState') {
    return handleCostumeState();
  }

  // ค่าเริ่มต้น (ไม่มี action): หน้าเช็คอินสแกน QR ของเดิม
  var template = HtmlService.createTemplateFromFile('index');
  var htmlOutput = template.evaluate();
  return htmlOutput
    .setTitle('OSKR 17th Anniversary Check-in')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.action === 'update') return handleUpdate(data);
    if (data.action === 'delete') return handleDelete(data);
    if (data.action === 'login') return handleLogin(data);
    if (data.action === 'reveal') return handleReveal(data);
    if (data.action === 'vehiclePlate') return handleVehiclePlate(data);
    if (data.action === 'claimRequest') return handleClaimRequest(data);
    if (data.action === 'setPassword') return handleSetPassword(data);
    if (data.action === 'verifyPassword') return handleVerifyPassword(data);
    if (data.action === 'forgotPassword') return handleForgotPassword(data);
    if (data.action === 'resetPassword') return handleResetPassword(data);
    if (data.action === 'changePassword') return handleChangePassword(data);
    if (data.action === 'photoWallUpload') return handlePhotoWallUpload(data);
    if (data.action === 'vegetarianMeal') return handleVegetarianMeal(data);
    if (data.action === 'quizJoin') return handleQuizJoin(data);
    if (data.action === 'quizAnswer') return handleQuizAnswer(data);
    if (data.action === 'quizHost') return handleQuizHost(data);
    if (data.action === 'costumeVote') return handleCostumeVote(data);
    if (data.action === 'costumeStaff') return handleCostumeStaff(data);
    return handleNewRegistration(data);
  } catch (err) {
    return jsonOutput({ result: 'error', message: err.message });
  }
}

/* ============================================================
   ส่วนเช็คอิน / สแกน QR (ของเดิม — ไม่แก้ไข logic)
   ============================================================ */

// ฟังก์ชันค้นหาข้อมูลด้วย Reg ID หรือ เบอร์โทรศัพท์
function searchAttendee(keyword) {
  if (!keyword) return { success: false, message: "กรุณากรอกข้อความเพื่อค้นหา" };

  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(SHEET_NAME);

    // ดึงค่าแสดงผลแบบ Display Values เพื่อคงรูปแบบข้อความและเบอร์โทรศัพท์
    const displayValues = sheet.getDataRange().getDisplayValues();

    // แปลงข้อความค้นหา: ลบขีด ช่องว่าง และแปลงเป็นตัวพิมพ์เล็ก
    const cleanSearch = keyword.toString().toLowerCase().replace(/[^a-zA-Z0-9]/g, "");

    for (let i = 1; i < displayValues.length; i++) {
      const row = displayValues[i];

      const rawRegId = row[0] ? row[0].toString().trim() : "";        // Column A (Index 0)
      const rawFullName = row[3] ? row[3].toString().trim() : "";     // Column D (Index 3)
      const rawPhone = row[5] ? row[5].toString().trim() : "";        // Column F (Index 5)
      const rawShortRegId = row[18] ? row[18].toString().trim() : ""; // Column S (Index 18)

      // [ตัวป้องกันแถวว่าง]
      // ถ้าไม่มีทั้ง Reg ID, ชื่อ-นามสกุล, เบอร์โทร และ Short Reg ID ให้ข้ามแถวนี้ทันที (ไม่นำมาคิด)
      if (rawRegId === "" && rawFullName === "" && rawPhone === "" && rawShortRegId === "") {
        continue;
      }

      // แปลงข้อมูลใน Sheet เพื่อใช้เปรียบเทียบ
      const cleanRegId = rawRegId.toLowerCase().replace(/[^a-zA-Z0-9ก-๙]/g, "");
      const cleanPhone = rawPhone.toLowerCase().replace(/[^0-9]/g, "");
      const cleanShortRegId = rawShortRegId.toLowerCase().replace(/[^a-zA-Z0-9ก-๙]/g, "");

      // ตัวแปรค้นหาเบอร์โทรแบบตัวเลขล้วน
      const cleanSearchPhone = keyword.toString().replace(/[^0-9]/g, "");

      // เช็กความถูกต้อง (ต้องไม่เป็นค่าว่าง และตรงกับสิ่งที่ค้นหา)
      const isRegIdMatch = (cleanRegId !== "" && cleanRegId === cleanSearch);
      const isShortRegIdMatch = (cleanShortRegId !== "" && cleanShortRegId === cleanSearch);
      const isPhoneMatch = (cleanPhone !== "" && cleanSearchPhone !== "" && cleanPhone === cleanSearchPhone);


      if (isRegIdMatch || isShortRegIdMatch || isPhoneMatch) {

        // รวจสอบประเภท Ticket Tier จากตัวอักษรแรกของ Reg ID
        let ticketTier = "-";
        if (rawRegId.length > 0) {
          const firstChar = rawRegId.charAt(0).toUpperCase();
          switch (firstChar) {
            case 'A': ticketTier = "First 50"; break;
            case 'B': ticketTier = "Early Bird"; break;
            case 'C': ticketTier = "Regular"; break;
            case 'D': ticketTier = "Final Call"; break;
            default:  ticketTier = "-"; break;
          }
        }

        return {
          success: true,
          data: {
            rowIndex: i + 1,        // ตำแหน่งแถวจริงใน Google Sheet (เริ่มที่ Index 1)
            regId: row[0],          // Column A: Reg id
            ticketTier: ticketTier, // TicketTier
            fullName: row[3],       // Column D: ชื่อ-นามสกุล
            nickname: row[4],       // Column E: ชื่อเล่น
            phone: row[5],          // Column F: เบอร์โทรศัพท์
            email: row[2],          // Column C: Email
            paymentStatus: row[13], // Column N: สถานะชำระเงิน (Index 13)
            checkInStatus: row[16]  // Column Q: สถานะเช็คอิน (Index 16)
          }
        };
      }
    }

    return { success: false, message: "ไม่พบข้อมูลที่ค้นหา" };
  } catch (err) {
    return { success: false, message: "เกิดข้อผิดพลาดในการดึงข้อมูล: " + err.toString() };
  }
}

// ฟังก์ชันอัปเดต Wristband No. (Column S) และ สถานะเช็คอิน (Column Q) เป็น TRUE
function checkInAttendee(rowIndex, wristbandNo) {
  try {

    // ตรวจสอบตำแหน่งแถว ต้องไม่น้อยกว่าแถวที่ 2 (เพราะแถว 1 คือ Header)
    if (!rowIndex || rowIndex < 2) {
      return { success: false, message: "ตำแหน่งแถวไม่ถูกต้อง" };
    }

    const cleanWristband = wristbandNo ? wristbandNo.toString().trim() : "";
    if (!wristbandNo || wristbandNo.toString().trim() === "") {
      return { success: false, message: "กรุณากรอกเลข Wristband" };
    }

    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(SHEET_NAME);
    const displayValues = sheet.getDataRange().getDisplayValues();

    // วนลูปเช็กว่าเลข Wristband นี้เคยถูกใช้ไปแล้วหรือยัง
    for (let i = 1; i < displayValues.length; i++) {
      // ข้ามการเช็กแถวของตัวเอง (กรณีสตาฟกดบันทึกซ้ำที่คนเดิม)
      if (i + 1 === rowIndex) continue;

      // อ่านค่าจาก Column S (Index 18)
      const existingWristband = displayValues[i][18] ? displayValues[i][18].toString().trim() : "";

      // ถ้าเจอเลข Wristband ตรงกัน ให้ปฏิเสธทันที
      if (existingWristband !== "" && existingWristband === cleanWristband) {
        const existingName = displayValues[i][3] || "ผู้เข้าร่วมงานท่านอื่น"; // อ่านชื่อคอลัมน์ D มาแจ้งเตือน
        return {
          success: false,
          message: "Wristband หมายเลข [" + cleanWristband + "] ถูกใช้งานไปแล้วโดย: " + existingName
        };
      }
    }

    // บันทึก Wristband No. ลงใน Column S (คอลัมน์ที่ 19)
    sheet.getRange(rowIndex, 19).setValue(cleanWristband);

    // บันทึกสถานะ TRUE ลงใน Column Q (คอลัมน์ที่ 17)
    sheet.getRange(rowIndex, 17).setValue(true);

    return { success: true, message: "เช็คอินและบันทึกเรียบร้อยแล้ว!" };
  }
  catch (error) {
    return { success: false, message: "เกิดข้อผิดพลาด: " + error.toString() };
  }
}

/* ============================================================
   ส่วนลงทะเบียนใหม่ (สำหรับ register.html)
   ============================================================ */
function handleNewRegistration(data) {
  validateRequired(data);

  const sheet = getTargetSheet();
  const headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
  const colIndex = buildColIndex(headers);
  const ensureColumn = makeEnsureColumn(sheet, headers, colIndex);

  const regIdColIndex = colIndex['Registration ID'];
  if (regIdColIndex === undefined) {
    throw new Error('ไม่พบคอลัมน์ "Registration ID" ในชีท');
  }

  const editToken = generateEditToken();
  const slipUrl = saveSlipToDrive(data, editToken);
  const now = new Date();

  const row = {};
  const writtenCols = new Set();
  const set = (headerName, value) => {
    const idx = ensureColumn(headerName);
    row[idx] = value;
    writtenCols.add(idx);
  };

  set('Timestamp', now);
  set('Email address', data.email);
  set('ชื่อ-นามสกุล', data.fullName);
  set('ชื่อเล่น', data.nickname);
  const phoneColIndex = ensureColumn('เบอร์โทรศัพท์');
  set('เบอร์โทรศัพท์', data.phone);
  set('แพ้อาหาร (ถ้ามี โปรดระบุ)', data.allergy || '');
  set('สายอาชีพ', data.occupation);
  set('โปรดระบุรายละเอียดเพิ่มเติม', data.occupationDetail || '');
  set('วันที่โอนเงิน', data.transferDate || '');
  set('เวลาที่โอน', data.transferTime || '');
  set('แนบสลิปโอนเงิน', slipUrl);
  set('กดรับทราบเงื่อนไข', data.agree ? CONSENT_TEXT : '');
  set('สถานะชำระเงิน', DEFAULT_PAYMENT_STATUS);
  set('ช่องทางติดต่อที่เปิดเผย', data.agree ? contactVisibilityLabel(data.contactVisibility) : '');
  set('เปิดรับคุยเรื่องอะไร', data.agree ? (data.talkTopics || '') : '');
  set('LinkedIn', data.agree ? (data.linkedin || '') : '');
  set('Facebook', data.agree ? (data.facebook || '') : '');
  set('Resume Link', data.agree ? (data.resumeLink || '') : '');
  set('จังหวัดที่ทำธุรกิจ', data.agree ? (data.province || '') : '');
  set('Edit Token', editToken);

  // แถวถัดไปต่อจากแถวสุดท้ายที่มีข้อมูล — ไม่ค้นหาแถวที่เตรียมสูตรไว้แล้ว
  const targetRowNumber = sheet.getLastRow() + 1;

  // สร้าง Registration ID เอง ขึ้นต้นด้วย "D" เสมอ (เข้าสู่ช่วง Final Call แล้ว
  // ปิดรับ First 50/Early Bird/Regular หมดแล้ว) รูปแบบเดียวกับสูตรเดิม:
  // D + วันที่(yyMMdd) + เวลา(HHmmss)
  const tz = Session.getScriptTimeZone() || 'Asia/Bangkok';
  const registrationId = 'D' + Utilities.formatDate(now, tz, 'yyMMdd') + Utilities.formatDate(now, tz, 'HHmmss');
  row[regIdColIndex] = registrationId;
  writtenCols.add(regIdColIndex);

  // บังคับให้คอลัมน์เบอร์โทรศัพท์เป็นข้อความล้วน ป้องกัน Sheets ตัดเลข 0 นำหน้าออก
  sheet.getRange(targetRowNumber, phoneColIndex + 1).setNumberFormat('@');

  // เขียนเฉพาะคอลัมน์ที่ set() ไว้ข้างบนเท่านั้น ห้ามแตะคอลัมน์อื่น (เช่น QR Code,
  // ส่งอีเมล, Check in, Check in Time, Wristband No.) เพราะมีสูตร/ค่าที่ทีมงาน
  // หรือ API เตรียมไว้ล่วงหน้าในแถวนี้อยู่แล้ว
  writtenCols.forEach((i) => {
    sheet.getRange(targetRowNumber, i + 1).setValue(row[i]);
  });

  // ไม่ส่งอีเมลยืนยันทันทีตรงนี้ — อีเมลจริง (พร้อม QR + ลิงก์ Connection Map)
  // จะถูกส่งโดย Register.gs (handlePaymentStatusEdit installable trigger)
  // หลังทีมงานตรวจสลิปแล้วเปลี่ยน "สถานะชำระเงิน" เป็น "ชำระเงินแล้ว"

  return jsonOutput({ result: 'success', registrationId: registrationId, ticketTier: ticketTierLabel(registrationId) });
}

function validateRequired(data) {
  const required = ['fullName', 'nickname', 'phone', 'email', 'occupation', 'slipBase64', 'agree'];
  required.forEach((key) => {
    if (!data[key]) throw new Error('ข้อมูลไม่ครบ: ' + key);
  });
}

/* ----------------------------------------------------------
   เช็กสถานะรหัสผ่านของตัวเอง (สำหรับหน้า manage.html ตอนโหลดหน้าแรก)
   ไม่คืนข้อมูลโปรไฟล์ตรงนี้ — ต้องผ่าน setPassword (ครั้งแรก) หรือ
   verifyPassword (มีรหัสผ่านแล้ว) ใน ManagePassword.gs ก่อน ถึงจะได้โปรไฟล์
   กลับมา ป้องกันกรณีลิงก์อีเมลหลุดไปถึงมือคนอื่นแล้วเห็นข้อมูลได้ทันที
   ---------------------------------------------------------- */
function handleLookup(id, token) {
  const found = findRowByToken(id, token);
  if (!found) return jsonOutput({ result: 'error', message: 'ไม่พบข้อมูล หรือลิงก์ไม่ถูกต้อง' });

  const { row, colIndex } = found;
  const hasPassword = colIndex['Password Hash'] !== undefined && !!row[colIndex['Password Hash']];

  return jsonOutput({
    result: 'success',
    authStage: hasPassword ? 'login' : 'setup',
    ticketTier: ticketTierLabel(row[colIndex['Registration ID']]),
  });
}

/* ----------------------------------------------------------
   สร้าง object โปรไฟล์ — ใช้ร่วมกันหลังผ่าน setPassword/verifyPassword
   สำเร็จ (ดู ManagePassword.gs)
   ---------------------------------------------------------- */
function buildManageProfile(found) {
  const { row, colIndex } = found;
  const get = (name) => (name in colIndex ? row[colIndex[name]] : '');
  const visibilityLabel = get('ช่องทางติดต่อที่เปิดเผย');

  return {
    fullName: get('ชื่อ-นามสกุล'),
    nickname: get('ชื่อเล่น'),
    email: get('Email address'),
    phone: get('เบอร์โทรศัพท์'),
    occupation: get('สายอาชีพ'),
    occupationDetail: get('โปรดระบุรายละเอียดเพิ่มเติม'),
    allergy: get('แพ้อาหาร (ถ้ามี โปรดระบุ)'),
    connectionConsent: !!get('กดรับทราบเงื่อนไข'),
    contactVisibility: visibilityLabel === 'อีเมล + เบอร์โทรศัพท์' ? 'email_phone' : (visibilityLabel === 'เฉพาะอีเมล' ? 'email' : ''),
    talkTopics: get('เปิดรับคุยเรื่องอะไร'),
    linkedin: get('LinkedIn'),
    facebook: get('Facebook'),
    resumeLink: get('Resume Link'),
    province: get('จังหวัดที่ทำธุรกิจ'),
    ticketTier: ticketTierLabel(get('Registration ID')),
  };
}

/* ----------------------------------------------------------
   แก้ไขข้อมูลตัวเอง (สำหรับหน้า manage.html)
   ---------------------------------------------------------- */
function handleUpdate(data) {
  const found = findRowByToken(data.id, data.token);
  if (!found) return jsonOutput({ result: 'error', message: 'ไม่พบข้อมูล หรือลิงก์ไม่ถูกต้อง' });

  const { sheet, rowNumber, colIndex } = found;
  const headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
  const ensureColumn = makeEnsureColumn(sheet, headers, colIndex);

  const updates = {
    'ชื่อ-นามสกุล': data.fullName,
    'ชื่อเล่น': data.nickname,
    'เบอร์โทรศัพท์': data.phone,
    'สายอาชีพ': data.occupation,
    'โปรดระบุรายละเอียดเพิ่มเติม': data.occupationDetail || '',
    'แพ้อาหาร (ถ้ามี โปรดระบุ)': data.allergy || '',
    'กดรับทราบเงื่อนไข': data.connectionConsent ? CONSENT_TEXT : '',
    'ช่องทางติดต่อที่เปิดเผย': data.connectionConsent ? contactVisibilityLabel(data.contactVisibility) : '',
    'เปิดรับคุยเรื่องอะไร': data.connectionConsent ? (data.talkTopics || '') : '',
    'LinkedIn': data.connectionConsent ? (data.linkedin || '') : '',
    'Facebook': data.connectionConsent ? (data.facebook || '') : '',
    'Resume Link': data.connectionConsent ? (data.resumeLink || '') : '',
    'จังหวัดที่ทำธุรกิจ': data.connectionConsent ? (data.province || '') : '',
    'อัปเดตล่าสุด': new Date(),
  };

  Object.keys(updates).forEach((name) => {
    const colI = ensureColumn(name);
    const cell = sheet.getRange(rowNumber, colI + 1);
    // บังคับให้คอลัมน์เบอร์โทรศัพท์เป็นข้อความล้วน ป้องกัน Sheets ตัดเลข 0 นำหน้าออก
    if (name === 'เบอร์โทรศัพท์') cell.setNumberFormat('@');
    cell.setValue(updates[name]);
  });

  return jsonOutput({ result: 'success' });
}

/* ----------------------------------------------------------
   ลบข้อมูล Connection Map ของตัวเอง
   (ไม่ลบข้อมูลลงทะเบียน/การชำระเงินหลัก — แค่เอาชื่อ/อาชีพออกจากหน้า
   Connection Map สาธารณะ เพราะบัตร/สถานะเช็คอินยังต้องใช้อยู่)
   ---------------------------------------------------------- */
function handleDelete(data) {
  const found = findRowByToken(data.id, data.token);
  if (!found) return jsonOutput({ result: 'error', message: 'ไม่พบข้อมูล หรือลิงก์ไม่ถูกต้อง' });

  const { sheet, rowNumber, colIndex } = found;
  const clears = {
    'กดรับทราบเงื่อนไข': '',
    'ช่องทางติดต่อที่เปิดเผย': '',
    'เปิดรับคุยเรื่องอะไร': '',
    'โปรดระบุรายละเอียดเพิ่มเติม': '',
  };

  Object.keys(clears).forEach((name) => {
    if (name in colIndex) sheet.getRange(rowNumber, colIndex[name] + 1).setValue(clears[name]);
  });

  return jsonOutput({ result: 'success' });
}

/* ----------------------------------------------------------
   Helpers (ฝั่ง Registration)
   ---------------------------------------------------------- */
function getTargetSheet() {
  return SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
}

function buildColIndex(headers) {
  const colIndex = {};
  headers.forEach((name, i) => { if (name) colIndex[String(name).trim()] = i; });
  return colIndex;
}

// คืนฟังก์ชันที่หา index ของคอลัมน์ตามชื่อ ถ้ายังไม่มีในชีทจะสร้างคอลัมน์ใหม่ให้อัตโนมัติ
function makeEnsureColumn(sheet, headers, colIndex) {
  return function ensureColumn(name) {
    if (name in colIndex) return colIndex[name];
    const newIndex = headers.length;
    sheet.getRange(1, newIndex + 1).setValue(name);
    headers.push(name);
    colIndex[name] = newIndex;
    return newIndex;
  };
}

function findRowByToken(id, token) {
  if (!id || !token) return null;

  const sheet = getTargetSheet();
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const colIndex = buildColIndex(headers);
  if (!('Registration ID' in colIndex) || !('Edit Token' in colIndex)) return null;

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  const values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  const idx = values.findIndex((r) => r[colIndex['Registration ID']] === id);
  if (idx === -1) return null;
  if (values[idx][colIndex['Edit Token']] !== token) return null;

  return { sheet, rowNumber: idx + 2, row: values[idx], colIndex };
}

function contactVisibilityLabel(value) {
  if (value === 'email_phone') return 'อีเมล + เบอร์โทรศัพท์';
  // ค่าอื่นทั้งหมด (รวมถึงกรณีไม่ได้ส่งค่ามา/ค่าผิดคาด) ให้ถือเป็น "เฉพาะอีเมล"
  // เป็นค่า default เดียวกับที่ radio ในหน้า register.html/manage.html เลือกไว้
  // ให้อยู่แล้ว — ป้องกันไม่ให้คอลัมน์นี้ว่างเปล่าทั้งที่ผู้ใช้กดยินยอมแล้ว ซึ่ง
  // จะทำให้ปุ่ม "ดูช่องทางติดต่อ" ใน Connection Map ไม่มีข้อมูลขึ้นเลย (บั๊กที่เจอ)
  return 'เฉพาะอีเมล';
}

function generateEditToken() {
  return Utilities.getUuid().replace(/-/g, '').slice(0, 24);
}

function saveSlipToDrive(data, fileNamePrefix) {
  if (!data.slipBase64) return '';
  const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
  const matches = data.slipBase64.match(/^data:(.+);base64,(.*)$/);
  const mimeType = matches ? matches[1] : 'image/jpeg';
  const base64Data = matches ? matches[2] : data.slipBase64;
  const blob = Utilities.newBlob(
    Utilities.base64Decode(base64Data),
    mimeType,
    fileNamePrefix + '_' + data.fullName
  );
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file.getUrl();
}

function jsonOutput(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
