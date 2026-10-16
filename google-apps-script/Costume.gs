/**
 * OSKR17th Anniversary — ประกวดชุดแต่งกาย (Costume contest)
 *   costume-staff.html?key=…   ทีมงานลงทะเบียนผู้เข้าประกวด (รูป + ชื่อ → ได้หมายเลขอัตโนมัติ) และคุมการโหวต
 *   costume-screen.html        จอข้าง/จอกลาง แสดงผู้เข้าประกวด + QR โหวต + ประกาศผล
 *   costume-vote.html          มือถือ สแกน QR แล้วโหวต (1 เครื่อง 1 โหวต เปลี่ยนได้จนกว่าจะปิดโหวต)
 *
 * คีย์ทีมงาน = Script Property QUIZ_HOST_KEY (ตัวเดียวกับ Quiz)
 * ข้อมูลผู้เข้าประกวด: แท็บ "Costume Contest" (No, Name, Drive File ID, Registered At, Hide, Votes)
 *   ซ่อนคนที่ลงผิด: พิมพ์อะไรก็ได้ในคอลัมน์ Hide แล้วกด "รีเฟรชรายชื่อ" ในหน้าทีมงาน
 *
 * ออกแบบตามบทเรียนจาก load test ของ Quiz: request จากมือถือ (costumeState / costumeVote)
 * ห้ามแตะ SpreadsheetApp — สถานะสาธารณะเก็บใน cache + Script Properties, โหวตเก็บ
 * Script Property คีย์ละเครื่อง (CV_<voterId>) เขียนชีทเฉพาะตอนทีมงานกดปุ่ม
 * ทุกชื่อในไฟล์นี้ขึ้นต้นด้วย costume/COSTUME — ห้ามซ้ำกับไฟล์อื่น
 */

const COSTUME_SHEET_NAME = 'Costume Contest';
const COSTUME_HEADERS = ['No', 'Name', 'Drive File ID', 'Registered At', 'Hide', 'Votes'];
const COSTUME_PUBLIC_KEY = 'COSTUME_PUBLIC';
const COSTUME_PHASES = ['register', 'voting', 'closed', 'results'];

/* ---------------- Public (มือถือ + จอ) ---------------- */

function handleCostumeState() {
  const cache = CacheService.getScriptCache();
  let pub = cache.get(COSTUME_PUBLIC_KEY);
  if (!pub) {
    pub = PropertiesService.getScriptProperties().getProperty(COSTUME_PUBLIC_KEY) || '{"phase":"register","contestants":[]}';
    cache.put(COSTUME_PUBLIC_KEY, pub, 21600);
  }
  return ContentService.createTextOutput(pub).setMimeType(ContentService.MimeType.JSON);
}

function handleCostumeVote(data) {
  const props = PropertiesService.getScriptProperties();
  const pub = JSON.parse(props.getProperty(COSTUME_PUBLIC_KEY) || '{"phase":"register","contestants":[]}');
  if (pub.phase !== 'voting') {
    return jsonOutput({ result: 'error', code: 'closed', message: pub.phase === 'register' ? 'ยังไม่เปิดโหวต' : 'ปิดโหวตแล้ว' });
  }
  const voterId = String(data.voterId || '');
  const no = Number(data.no);
  if (!/^[\w-]{8,40}$/.test(voterId) || !pub.contestants.some((c) => c.no === no)) {
    return jsonOutput({ result: 'error', message: 'ข้อมูลโหวตไม่ถูกต้อง' });
  }
  props.setProperty('CV_' + voterId, String(no));
  return jsonOutput({ result: 'success', no: no });
}

/* ---------------- Staff ---------------- */

function handleCostumeStaff(data) {
  const props = PropertiesService.getScriptProperties();
  const key = props.getProperty('QUIZ_HOST_KEY');
  if (!key || data.key !== key) return jsonOutput({ result: 'error', message: 'Staff key ไม่ถูกต้อง' });

  if (data.cmd === 'status') return jsonOutput(costumeStaffView());

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const pub = costumeLoadPublic();
    if (data.cmd === 'register') {
      const name = String(data.name || '').trim().slice(0, 40);
      const matches = String(data.imageBase64 || '').match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
      if (!name || !matches) return jsonOutput({ result: 'error', message: 'กรุณาใส่ชื่อและรูปภาพ' });
      const sheet = costumeSheet();
      const lastRow = sheet.getLastRow();
      const nos = lastRow < 2 ? [] : sheet.getRange(2, 1, lastRow - 1, 1).getValues().map((r) => Number(r[0]) || 0);
      const no = nos.length ? Math.max.apply(null, nos) + 1 : 1;
      const blob = Utilities.newBlob(Utilities.base64Decode(matches[2]), matches[1], 'costume_' + no + '_' + name);
      const fileId = costumeSaveBlob(blob);
      sheet.appendRow([no, name, fileId, new Date(), '', '']);
      costumeRebuildPublic(pub.phase, pub.results);
      const view = costumeStaffView();
      view.registeredNo = no;
      return jsonOutput(view);
    }
    if (data.cmd === 'phase' && COSTUME_PHASES.indexOf(data.phase) !== -1) {
      let results = null;
      if (data.phase === 'results' || data.phase === 'closed') {
        results = costumeTally(costumeContestantsFromSheet());
        costumeWriteVotes(results);
      }
      costumeRebuildPublic(data.phase, data.phase === 'results' ? results : null);
    } else if (data.cmd === 'refresh') {
      costumeRebuildPublic(pub.phase, pub.results);
    } else if (data.cmd === 'resetVotes') {
      props.getKeys().filter((k) => k.indexOf('CV_') === 0).forEach((k) => props.deleteProperty(k));
      costumeRebuildPublic('register', null);
    }
    return jsonOutput(costumeStaffView());
  } finally {
    lock.releaseLock();
  }
}

function costumeStaffView() {
  const pub = costumeLoadPublic();
  const tally = costumeTally(pub.contestants);
  return {
    result: 'success',
    phase: pub.phase,
    contestants: tally,
    totalVotes: tally.reduce((sum, c) => sum + c.votes, 0),
  };
}

/* ---------------- Helpers ---------------- */

function costumeLoadPublic() {
  const raw = PropertiesService.getScriptProperties().getProperty(COSTUME_PUBLIC_KEY);
  return raw ? JSON.parse(raw) : { phase: 'register', contestants: [] };
}

// สร้างสถานะสาธารณะจากชีท แล้วเก็บทั้งใน Script Properties (ถาวร) และ cache (เร็ว)
function costumeRebuildPublic(phase, results) {
  const pub = { phase: phase, contestants: costumeContestantsFromSheet() };
  if (results) pub.results = results;
  const str = JSON.stringify(pub);
  PropertiesService.getScriptProperties().setProperty(COSTUME_PUBLIC_KEY, str);
  CacheService.getScriptCache().put(COSTUME_PUBLIC_KEY, str, 21600);
  return pub;
}

function costumeContestantsFromSheet() {
  const sheet = costumeSheet();
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getValues()
    .filter((r) => Number(r[0]) && r[2] && !String(r[4]).trim())
    .map((r) => ({
      no: Number(r[0]),
      name: String(r[1]),
      src: 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(r[2]) + '&sz=w1600',
    }))
    .sort((a, b) => a.no - b.no);
}

// นับโหวตจาก Script Properties (CV_<voterId> = หมายเลข) — เรียงคะแนนมากไปน้อย พร้อมอันดับ (คะแนนเท่ากัน = อันดับเท่ากัน)
function costumeTally(contestants) {
  const counts = {};
  const all = PropertiesService.getScriptProperties().getProperties();
  Object.keys(all).forEach((k) => {
    if (k.indexOf('CV_') === 0) counts[all[k]] = (counts[all[k]] || 0) + 1;
  });
  const ranked = contestants
    .map((c) => ({ no: c.no, name: c.name, src: c.src, votes: counts[String(c.no)] || 0 }))
    .sort((a, b) => b.votes - a.votes || a.no - b.no);
  ranked.forEach((c, i) => { c.rank = i > 0 && c.votes === ranked[i - 1].votes ? ranked[i - 1].rank : i + 1; });
  return ranked;
}

function costumeWriteVotes(results) {
  const sheet = costumeSheet();
  if (sheet.getLastRow() < 2) return;
  const votesByNo = {};
  results.forEach((c) => { votesByNo[c.no] = c.votes; });
  const nos = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  sheet.getRange(2, 6, nos.length, 1).setValues(nos.map((r) => [votesByNo[Number(r[0])] !== undefined ? votesByNo[Number(r[0])] : '']));
}

function costumeSheet() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName(COSTUME_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(COSTUME_SHEET_NAME);
    sheet.getRange(1, 1, 1, COSTUME_HEADERS.length).setValues([COSTUME_HEADERS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function costumeSaveBlob(blob) {
  const props = PropertiesService.getScriptProperties();
  let folder = null;
  try {
    const folderId = props.getProperty('COSTUME_FOLDER_ID');
    folder = folderId && DriveApp.getFolderById(folderId);
  } catch (err) {
    folder = null;
  }
  if (!folder) {
    folder = DriveApp.createFolder('OSKR17 Costume Contest');
    props.setProperty('COSTUME_FOLDER_ID', folder.getId());
  }
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file.getId();
}
