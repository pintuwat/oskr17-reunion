/**
 * OSKR17th Anniversary — Photo Wall (จอใหญ่วันงาน photo-wall.html + หน้าอัปโหลด photo-upload.html)
 *
 * แหล่งรูป 2 ทาง เก็บรวมกันในแท็บ "Photo Wall" ของชีทเดียวกับการลงทะเบียน:
 *   1) ผู้ร่วมงานอัปโหลดเองผ่าน photo-upload.html (doPost action: 'photoWallUpload')
 *   2) โพสต์ Instagram สาธารณะที่ติด #oskr17timemachine — ดึงอัตโนมัติด้วย
 *      syncPhotoWallInstagram() ผ่าน time-driven trigger (ตั้งด้วย setupPhotoWallTrigger)
 * จอดึงรายการรูปผ่าน doGet action=photoWallFeed
 *
 * ปิดรูปไม่เหมาะสม: พิมพ์อะไรก็ได้ (เช่น x) ในคอลัมน์ "Hide" ของแถวนั้น — รูปจะหายจากจอ
 * ในรอบดึงข้อมูลถัดไป (~20 วินาที)
 *
 * ทุกชื่อในไฟล์นี้ขึ้นต้นด้วย photoWall/PHOTO_WALL — global scope ร่วมกับทุกไฟล์
 * ในโปรเจกต์ (รวมไฟล์เก่า "OSKR17Webapp" ที่ไม่อยู่ใน git) ห้ามตั้งชื่อซ้ำเด็ดขาด
 *
 * Script Properties ที่ใช้ (Project Settings → Script Properties):
 *   PHOTO_WALL_IG_USER_ID      — Instagram Business Account ID (ตัวเลข)
 *   PHOTO_WALL_IG_ACCESS_TOKEN — long-lived access token (Facebook Login)
 *   PHOTO_WALL_FOLDER_ID       — สร้างให้อัตโนมัติครั้งแรก ไม่ต้องตั้งเอง
 *   PHOTO_WALL_IG_HASHTAG_ID   — แคชอัตโนมัติ ไม่ต้องตั้งเอง
 */

const PHOTO_WALL_SHEET_NAME = 'Photo Wall';
const PHOTO_WALL_HEADERS = ['Timestamp', 'Source', 'Source ID', 'Drive File ID', 'Name', 'Permalink', 'Hide'];
const PHOTO_WALL_HASHTAG = 'oskr17timemachine';
const PHOTO_WALL_GRAPH_URL = 'https://graph.facebook.com/v23.0/';
const PHOTO_WALL_MAX_BYTES = 8 * 1024 * 1024;
const PHOTO_WALL_FEED_LIMIT = 400;

function handlePhotoWallUpload(data) {
  if (data.consent !== true) {
    return jsonOutput({ result: 'error', message: 'กรุณายืนยันการยินยอมให้แสดงรูปบนจอ' });
  }
  const matches = (data.imageBase64 || '').match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!matches) {
    return jsonOutput({ result: 'error', message: 'ไฟล์ต้องเป็นรูปภาพ (JPG/PNG) เท่านั้น' });
  }
  const bytes = Utilities.base64Decode(matches[2]);
  if (bytes.length > PHOTO_WALL_MAX_BYTES) {
    return jsonOutput({ result: 'error', message: 'ไฟล์ใหญ่เกินไป' });
  }

  const name = (data.name || '').toString().trim().slice(0, 40);
  const stamp = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyyMMdd_HHmmss');
  const fileId = photoWallSaveBlob(Utilities.newBlob(bytes, matches[1], 'upload_' + stamp + '_' + (name || 'guest')));
  photoWallSheet().appendRow([new Date(), 'upload', '', fileId, name, '', '']);
  return jsonOutput({ result: 'success' });
}

function handlePhotoWallFeed() {
  const sheet = photoWallSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return jsonOutput({ result: 'success', photos: [] });

  const firstRow = Math.max(2, lastRow - PHOTO_WALL_FEED_LIMIT + 1);
  const rows = sheet.getRange(firstRow, 1, lastRow - firstRow + 1, PHOTO_WALL_HEADERS.length).getValues();
  const photos = rows
    .filter((r) => r[3] && !String(r[6]).trim())
    .map((r) => ({
      id: String(r[3]),
      src: 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(r[3]) + '&sz=w2400',
      source: String(r[1]),
      name: String(r[4] || ''),
    }));
  return jsonOutput({ result: 'success', photos: photos });
}

// เรียกจาก time-driven trigger — ดึงโพสต์ IG สาธารณะล่าสุด (24 ชม.) ที่ติดแฮชแท็ก
// แล้วคัดลอกรูปเก็บใน Drive (URL รูปจาก IG หมดอายุได้ จึงไม่ลิงก์ตรง)
function syncPhotoWallInstagram() {
  const props = PropertiesService.getScriptProperties();
  const igUserId = props.getProperty('PHOTO_WALL_IG_USER_ID');
  const token = props.getProperty('PHOTO_WALL_IG_ACCESS_TOKEN');
  if (!igUserId || !token) return 'ยังไม่ได้ตั้งค่า PHOTO_WALL_IG_USER_ID / PHOTO_WALL_IG_ACCESS_TOKEN';

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return 'มีรอบ sync อื่นกำลังทำงานอยู่';
  try {
    let hashtagId = props.getProperty('PHOTO_WALL_IG_HASHTAG_ID');
    if (!hashtagId) {
      const search = photoWallGraphGet('ig_hashtag_search', { user_id: igUserId, q: PHOTO_WALL_HASHTAG, access_token: token });
      hashtagId = search.data && search.data[0] && search.data[0].id;
      if (!hashtagId) throw new Error('ไม่พบแฮชแท็ก #' + PHOTO_WALL_HASHTAG + ' บน Instagram');
      props.setProperty('PHOTO_WALL_IG_HASHTAG_ID', hashtagId);
    }

    const media = photoWallGraphGet(hashtagId + '/recent_media', {
      user_id: igUserId,
      fields: 'id,media_type,media_url,permalink,children{id,media_type,media_url}',
      limit: '50',
      access_token: token,
    });

    const sheet = photoWallSheet();
    const lastRow = sheet.getLastRow();
    const existing = new Set(lastRow < 2 ? [] : sheet.getRange(2, 3, lastRow - 1, 1).getValues().map((r) => String(r[0])));

    let added = 0;
    (media.data || []).forEach((post) => {
      const images = post.media_type === 'CAROUSEL_ALBUM'
        ? ((post.children && post.children.data) || [])
        : [post];
      images
        .filter((m) => m.media_type === 'IMAGE' && m.media_url && !existing.has(String(m.id)))
        .forEach((m) => {
          const blob = UrlFetchApp.fetch(m.media_url).getBlob().setName('instagram_' + m.id + '.jpg');
          const fileId = photoWallSaveBlob(blob);
          sheet.appendRow([new Date(), 'instagram', String(m.id), fileId, '', post.permalink || '', '']);
          existing.add(String(m.id));
          added++;
        });
    });
    return 'เพิ่มรูปจาก Instagram ใหม่ ' + added + ' รูป';
  } finally {
    lock.releaseLock();
  }
}

// รันครั้งเดียวจาก Apps Script editor — ทดสอบการเชื่อม Instagram และดูผลใน Execution log
function testPhotoWallInstagram() {
  console.log(syncPhotoWallInstagram());
}

// รันครั้งเดียวจาก Apps Script editor — ตั้ง trigger ให้ sync Instagram ทุก 1 นาที
// ควรเปิดเฉพาะช่วงวันงาน แล้วปิดด้วย removePhotoWallTrigger — รันทุกนาทีทั้งวัน
// จะใช้โควต้าเวลารัน trigger ของบัญชี Google ฟรี (90 นาที/วัน) ไปเกือบหมด
function setupPhotoWallTrigger() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'syncPhotoWallInstagram')
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('syncPhotoWallInstagram').timeBased().everyMinutes(1).create();
  console.log('ตั้ง trigger syncPhotoWallInstagram ทุก 1 นาทีแล้ว');
}

// รันหลังจบงาน — หยุด sync Instagram
function removePhotoWallTrigger() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'syncPhotoWallInstagram')
    .forEach((t) => ScriptApp.deleteTrigger(t));
  console.log('ลบ trigger syncPhotoWallInstagram แล้ว');
}

function photoWallGraphGet(path, params) {
  const query = Object.keys(params).map((k) => k + '=' + encodeURIComponent(params[k])).join('&');
  const res = UrlFetchApp.fetch(PHOTO_WALL_GRAPH_URL + path + '?' + query, { muteHttpExceptions: true });
  const body = JSON.parse(res.getContentText());
  if (body.error) throw new Error('Instagram API: ' + body.error.message);
  return body;
}

function photoWallSheet() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName(PHOTO_WALL_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(PHOTO_WALL_SHEET_NAME);
    sheet.getRange(1, 1, 1, PHOTO_WALL_HEADERS.length).setValues([PHOTO_WALL_HEADERS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function photoWallSaveBlob(blob) {
  const props = PropertiesService.getScriptProperties();
  let folderId = props.getProperty('PHOTO_WALL_FOLDER_ID');
  let folder;
  try {
    folder = folderId && DriveApp.getFolderById(folderId);
  } catch (err) {
    folder = null;
  }
  if (!folder) {
    folder = DriveApp.createFolder('OSKR17 Photo Wall');
    props.setProperty('PHOTO_WALL_FOLDER_ID', folder.getId());
  }
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file.getId();
}
