/**
 * OSKR17th Anniversary — Live Quiz (แบบ Kahoot)
 *   quiz-host.html  จอใหญ่ (โฮสต์คุมเกม — ต้องมี ?key=QUIZ_HOST_KEY)
 *   quiz-play.html  มือถือผู้เล่น (ใส่ชื่อเล่น แล้วกดตอบ)
 *
 * ออกแบบให้รับผู้เล่นพร้อมกัน ~120 คนบน Apps Script ได้:
 *   - มือถือ poll สถานะเกมผ่าน doGet action=quizState ซึ่งอ่านแค่ CacheService (เร็ว ไม่แตะชีท)
 *   - คำตอบเก็บใน CacheService ทีละคน (ไม่เขียนชีทพร้อมกัน 120 คน) แล้วโฮสต์รวบเขียนลงชีท
 *     "Quiz Answers" ครั้งเดียวตอนกดเฉลย
 *   - คะแนน: ตอบถูก 500 + โบนัสความเร็วสูงสุด 500 (วัดจากเวลาที่คำถามขึ้นบนมือถือคนนั้น)
 *
 * แท็บในชีท (สร้างด้วย setupQuiz): Quiz Questions / Quiz Players / Quiz Answers / Quiz Results
 * แก้คำถามในแท็บ "Quiz Questions" ได้เลย — ระบบโหลดคำถามใหม่ทุกครั้งที่กด "เริ่มเกม"
 *
 * Script Properties: QUIZ_HOST_KEY (สร้างให้โดย setupQuiz), QUIZ_STATE, QUIZ_QUESTIONS (ระบบจัดการเอง)
 * ทุกชื่อในไฟล์นี้ขึ้นต้นด้วย quiz/QUIZ — ห้ามซ้ำกับไฟล์อื่น (global scope เดียวกัน)
 */

const QUIZ_SHEETS = {
  questions: { name: 'Quiz Questions', headers: ['Question', 'Option 1', 'Option 2', 'Option 3', 'Option 4', 'Correct Answer (1-4)', 'Time (seconds)', 'Image Link'] },
  players: { name: 'Quiz Players', headers: ['Timestamp', 'Game ID', 'Player ID', 'Nickname'] },
  answers: { name: 'Quiz Answers', headers: ['Timestamp', 'Game ID', 'Question No', 'Player ID', 'Nickname', 'Choice', 'Correct', 'Points', 'Response ms'] },
  results: { name: 'Quiz Results', headers: ['Rank', 'Nickname', 'Score', 'Correct Answers', 'Player ID'] },
};
const QUIZ_CACHE_TTL = 21600;
const QUIZ_ANSWER_GRACE_MS = 3000;
const QUIZ_PUBLIC_KEY = 'quiz_public';

const QUIZ_SEED = [
  ['สีงามอร่ามหรูชมพู-ฟ้า งาม______ชวนประชาให้เห็นเด่น', 'ยั่วยวน', 'ยั่วยวล', 'เย้ายวน', 'หยอกเหย้า', 1, 30, ''],
  ['โรงเรียนสวนกุหลาบวิทยาลัย รังสิต ได้รับการสถาปนาขึ้นตรงกับวัน เดือน และปี พ.ศ. ใด', '3 มีนาคม พ.ศ. 2536', '4 มีนาคม พ.ศ. 2535', '8 มีนาคม พ.ศ. 2425', '30 มีนาคม พ.ศ. 2521', 1, 30, ''],
  ['ชื่อใดต่อไปนี้ ไม่ใช่ชื่อรุ่นของโรงเรียนสวนกุหลาบวิทยาลัย รังสิต', 'มังกรทอง', 'New Normal Roses', 'กุหลาบออนไลน์', 'เชื่อมประสานอาคารเฉลิมพระเกียรติ', 4, 30, ''],
  ['อาจารย์ในรูปต่อไปนี้ มีชื่อว่าอะไร', 'ทัศนีย์', 'ดาราวรรณ', 'เสาวภา', 'พรพิมล', 3, 30, 'https://drive.google.com/file/d/1Wx3sudv2VR9SLp_P44YpU2DZf5B7tLHs/view?usp=share_link'],
  ['เคเบิ้ล ติณณภพ เป็น DJ อยู่ช่องวิทยุใด', 'Cool Fahrenheit', 'Green Wave', 'EFM', 'Goodtime Radio', 3, 30, ''],
  ['ต้น ธรรมสาร ที่ได้ร้องเพลงเปิดของงานวันนี้ มีชื่อในวงการเพลงว่าอะไร', 'มะขามเปียก', 'มะขามป้อม', 'มะขามหวาน', 'มะขามเทศ', 2, 30, ''],
  ['พี่แหลม สมพล เป็นศิษย์เก่าของโรงเรียนรุ่นที่เท่าไหร่', 'รุ่นที่ 4 ขึ้นบ้านใหม่', 'รุ่นที่ 5 เสาธงทอง', 'รุ่นที่ 6 อะเมซิ่ง สวนฯ รังสิต', 'รุ่นที่ 7 พระบารมีปกเกล้า', 3, 30, ''],
  ['ใครเป็นผู้อำนวยการโรงเรียน ในตอนที่รุ่น 17 ของพวกเราเข้ามาตอน ม.1', 'สุรศักดิ์ สว่างแสง', 'พีระ ชัยศิริ', 'สุภาวดี วงษ์สกุล', 'สมชาย ฟักทอง', 4, 30, ''],
  ['งานจากเหย้าของรุ่น 17 คือวันที่เท่าไหร่', '17 มกราคม 2015', '17 กุมภาพันธ์ 2015', '17 มีนาคม 2015', '17 เมษายน 2015', 2, 30, ''],
  ['ปัจจุบัน โรงเรียนสวนกุหลาบวิทยาลัย รังสิต มีทั้งหมดกี่รุ่น', '32', '33', '34', '35', 3, 30, ''],
  ['อาจารย์อ๊อฟ ภาสกร ปัจจุบัน ดำรงตำแหน่งผู้ช่วยผู้อำนวยการโรงเรียนฝ่ายใด', 'บริหารงานวิชาการ', 'บริหารงานงบประมาณและงานบุคคล', 'บริหารงานทั่วไป', 'บริหารงานกิจการนักเรียน', 4, 30, ''],
  ['อาจารย์ท่านใดต่อไปนี้ ไม่ได้เกษียณอายุราชการ ในปีล่าสุด', 'วิลาวัณย์', 'จารีรัตน์', 'เพ็ญจันทร์', 'ชูจิตร', 4, 30, ''],
  ['อาจารย์ท่านใดต่อไปนี้ ไม่ได้มีลูกสาว หรือ ลูกชาย อยู่ในรุ่น 17', 'สมบุญ', 'ชัญญา', 'ดุษณี', 'บุณย์เรือง', 4, 30, ''],
  ['ต้นไม้ประจำโรงเรียนสวนกุหลาบวิทยาลัย รังสิต คือต้นไม้ชนิดใด', 'ต้นกัลปพฤกษ์', 'ต้นนนทรี', 'ต้นสุพรรณิการ์', 'ต้นชมพูพันธุ์ทิพย์', 3, 30, ''],
  ['ในลำดับการสถาปนาโรงเรียนเครือข่ายสวนกุหลาบวิทยาลัย ทั้งหมด 11 แห่ง โรงเรียนสวนกุหลาบวิทยาลัย รังสิต ถือเป็นโรงเรียนลำดับที่เท่าใด', '2', '3', '4', '5', 4, 30, ''],
];

/* ---------------- Setup (รันครั้งเดียวจาก Apps Script editor) ---------------- */

function setupQuiz() {
  Object.keys(QUIZ_SHEETS).forEach((k) => quizSheet(k));
  const qSheet = quizSheet('questions');
  if (qSheet.getLastRow() < 2) {
    qSheet.getRange(2, 1, QUIZ_SEED.length, QUIZ_SEED[0].length).setValues(QUIZ_SEED);
  }
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('QUIZ_HOST_KEY')) {
    props.setProperty('QUIZ_HOST_KEY', Utilities.getUuid().replace(/-/g, '').slice(0, 12));
  }
  if (!props.getProperty('QUIZ_STATE')) {
    const state = quizReset();
    quizSaveState(state);
    quizPublish(state);
  }
  quizValidateQuestions(quizReadQuestionsFromSheet()).forEach((w) => console.warn(w));
  console.log('Host URL: https://oskr17-timemachine.info/quiz-host.html?key=' + props.getProperty('QUIZ_HOST_KEY'));
}

function quizValidateQuestions(questions) {
  const warnings = [];
  questions.forEach((q, i) => {
    if (q.options.length < 2) warnings.push('⚠ ข้อ ' + (i + 1) + ': ตัวเลือกน้อยกว่า 2 ข้อ');
    if (!(q.correct >= 1 && q.correct <= q.options.length)) {
      warnings.push('⚠ ข้อ ' + (i + 1) + ': Correct Answer = ' + q.correct + ' แต่มีตัวเลือก ' + q.options.length + ' ข้อ — จะไม่มีใครตอบถูก');
    }
  });
  return warnings;
}

/* ---------------- Player endpoints ---------------- */

function handleQuizState() {
  let pub = CacheService.getScriptCache().get(QUIZ_PUBLIC_KEY);
  if (!pub) pub = quizPublish(quizLoadState());
  return ContentService
    .createTextOutput('{"now":' + Date.now() + ',"state":' + pub + '}')
    .setMimeType(ContentService.MimeType.JSON);
}

function handleQuizJoin(data) {
  const nickname = String(data.nickname || '').trim().slice(0, 20);
  const playerId = String(data.playerId || '').trim();
  if (!nickname) return jsonOutput({ result: 'error', message: 'กรุณาใส่ชื่อเล่น' });
  if (!/^[\w-]{8,40}$/.test(playerId)) return jsonOutput({ result: 'error', message: 'ข้อมูลผู้เล่นไม่ถูกต้อง' });

  const state = quizLoadState();
  quizSheet('players').appendRow([new Date(), state.gameId, playerId, nickname]);
  return jsonOutput({ result: 'success', gameId: state.gameId });
}

function handleQuizAnswer(data) {
  const state = quizLoadState();
  if (state.phase !== 'question' || data.gameId !== state.gameId || Number(data.q) !== state.q) {
    return jsonOutput({ result: 'error', code: 'closed', message: 'ข้อนี้ปิดรับคำตอบแล้ว' });
  }
  if (Date.now() > state.endsAt + QUIZ_ANSWER_GRACE_MS) {
    return jsonOutput({ result: 'error', code: 'closed', message: 'หมดเวลาตอบข้อนี้แล้ว' });
  }
  const playerId = String(data.playerId || '');
  const choice = Number(data.choice);
  if (!/^[\w-]{8,40}$/.test(playerId) || !(choice >= 1 && choice <= 4)) {
    return jsonOutput({ result: 'error', message: 'ข้อมูลคำตอบไม่ถูกต้อง' });
  }

  const cache = CacheService.getScriptCache();
  const key = quizAnswerKey(state.gameId, state.q, playerId);
  if (cache.get(key)) return jsonOutput({ result: 'success' });

  const maxMs = state.duration * 1000;
  const reported = Number(data.elapsedMs);
  const elapsedMs = Math.min(Math.max(isFinite(reported) ? reported : maxMs, 0), maxMs);
  cache.put(key, JSON.stringify({ c: choice, ms: Math.round(elapsedMs) }), QUIZ_CACHE_TTL);
  return jsonOutput({ result: 'success' });
}

/* ---------------- Host endpoint ---------------- */

function handleQuizHost(data) {
  const props = PropertiesService.getScriptProperties();
  const hostKey = props.getProperty('QUIZ_HOST_KEY');
  if (!hostKey || data.key !== hostKey) {
    return jsonOutput({ result: 'error', message: 'Host key ไม่ถูกต้อง' });
  }
  if (data.cmd === 'status') return jsonOutput(quizHostView(quizLoadState()));

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    let state = quizLoadState();
    if (data.cmd === 'start' && state.phase === 'lobby') {
      const questions = quizReadQuestionsFromSheet();
      if (questions.length === 0) throw new Error('ไม่มีคำถามในแท็บ Quiz Questions');
      props.setProperty('QUIZ_QUESTIONS', JSON.stringify(questions));
      state = quizStartQuestion(state, 0);
    } else if (data.cmd === 'reveal' && state.phase === 'question') {
      state = quizReveal(state);
    } else if (data.cmd === 'next' && state.phase === 'reveal') {
      const total = quizLoadQuestions().length;
      state = state.q + 1 < total ? quizStartQuestion(state, state.q + 1) : quizFinish(state);
    } else if (data.cmd === 'end' && state.phase === 'reveal') {
      state = quizFinish(state);
    } else if (data.cmd === 'reset') {
      state = quizReset();
    } else {
      return jsonOutput(quizHostView(state));
    }
    quizSaveState(state);
    quizPublish(state);
    return jsonOutput(quizHostView(state));
  } finally {
    lock.releaseLock();
  }
}

function quizStartQuestion(state, index) {
  const question = quizLoadQuestions()[index];
  const now = Date.now();
  return {
    gameId: state.gameId,
    phase: 'question',
    q: index,
    duration: question.time,
    startedAt: now,
    endsAt: now + question.time * 1000,
  };
}

// ปิดรับคำตอบ — รวบคำตอบจาก cache เขียนลงชีทครั้งเดียว แล้วคำนวณคะแนน
function quizReveal(state) {
  const question = quizLoadQuestions()[state.q];
  const players = quizPlayers(state.gameId);
  const live = quizLiveAnswers(state, players);
  const counts = [0, 0, 0, 0];
  const now = new Date();
  const rows = live.map(({ player, answer }) => {
    counts[answer.c - 1]++;
    const correct = answer.c === question.correct;
    const points = correct ? Math.round(500 + 500 * Math.max(0, 1 - answer.ms / (state.duration * 1000))) : 0;
    return [now, state.gameId, state.q + 1, player.playerId, player.nickname, answer.c, correct, points, answer.ms];
  });
  if (rows.length) {
    const sheet = quizSheet('answers');
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  }
  return Object.assign({}, state, { phase: 'reveal', counts: counts, answered: rows.length });
}

function quizFinish(state) {
  const board = quizScoreboard(state.gameId, -1);
  const sheet = quizSheet('results');
  quizClearRows(sheet);
  if (board.length) {
    sheet.getRange(2, 1, board.length, 5).setValues(board.map((p) => [p.rank, p.nickname, p.score, p.correctCount, p.playerId]));
  }
  return Object.assign({}, state, { phase: 'end' });
}

function quizReset() {
  ['players', 'answers', 'results'].forEach((k) => quizClearRows(quizSheet(k)));
  return { gameId: Utilities.getUuid().slice(0, 8), phase: 'lobby', q: -1 };
}

function quizHostView(state) {
  const questions = quizLoadQuestions();
  const players = quizPlayers(state.gameId);
  const view = {
    result: 'success',
    now: Date.now(),
    phase: state.phase,
    q: state.q,
    total: questions.length,
    endsAt: state.endsAt || 0,
    playerCount: players.length,
    recentPlayers: players.slice(-40).map((p) => p.nickname),
  };
  if (state.q >= 0 && state.q < questions.length) view.question = questions[state.q];
  if (state.phase === 'question') {
    const counts = [0, 0, 0, 0];
    const live = quizLiveAnswers(state, players);
    live.forEach(({ answer }) => counts[answer.c - 1]++);
    view.counts = counts;
    view.answered = live.length;
  }
  if (state.phase === 'reveal') {
    view.counts = state.counts;
    view.answered = state.answered;
  }
  if (state.phase === 'reveal' || state.phase === 'end') {
    const cached = CacheService.getScriptCache().get(QUIZ_PUBLIC_KEY);
    view.top = JSON.parse(cached || quizPublish(state)).top;
  }
  return view;
}

/* ---------------- Public state (สิ่งที่มือถือเห็น — ไม่มีเฉลยระหว่างคำถาม) ---------------- */

function quizPublish(state) {
  const questions = quizLoadQuestions();
  const pub = { gameId: state.gameId, phase: state.phase, q: state.q, total: questions.length };
  if ((state.phase === 'question' || state.phase === 'reveal') && questions[state.q]) {
    const question = questions[state.q];
    pub.question = { text: question.text, options: question.options, image: question.image };
    pub.endsAt = state.endsAt;
    pub.duration = state.duration;
  }
  if (state.phase === 'reveal' || state.phase === 'end') {
    if (state.phase === 'reveal') pub.correct = questions[state.q].correct;
    const board = quizScoreboard(state.gameId, state.phase === 'reveal' ? state.q + 1 : -1);
    pub.top = board.slice(0, 10).map((p) => ({ nickname: p.nickname, score: p.score }));
    pub.playerCount = board.length;
    // playerId → [คะแนนรวม, อันดับ, คะแนนข้อล่าสุด]
    pub.players = {};
    board.forEach((p) => { pub.players[p.playerId] = [p.score, p.rank, p.lastPoints]; });
  }
  const str = JSON.stringify(pub);
  CacheService.getScriptCache().put(QUIZ_PUBLIC_KEY, str, QUIZ_CACHE_TTL);
  return str;
}

function quizScoreboard(gameId, lastQuestionNo) {
  const totals = {};
  quizPlayers(gameId).forEach((p) => {
    totals[p.playerId] = { playerId: p.playerId, nickname: p.nickname, score: 0, correctCount: 0, lastPoints: 0 };
  });
  const sheet = quizSheet('answers');
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 9).getValues().forEach((r) => {
      const entry = totals[r[3]];
      if (String(r[1]) !== gameId || !entry) return;
      entry.score += Number(r[7]) || 0;
      if (r[6] === true) entry.correctCount++;
      if (Number(r[2]) === lastQuestionNo) entry.lastPoints = Number(r[7]) || 0;
    });
  }
  const ranked = Object.keys(totals).map((k) => totals[k]).sort((a, b) => b.score - a.score);
  ranked.forEach((p, i) => { p.rank = i > 0 && p.score === ranked[i - 1].score ? ranked[i - 1].rank : i + 1; });
  return ranked;
}

/* ---------------- Helpers ---------------- */

function quizLoadState() {
  const raw = PropertiesService.getScriptProperties().getProperty('QUIZ_STATE');
  if (raw) return JSON.parse(raw);
  const state = { gameId: Utilities.getUuid().slice(0, 8), phase: 'lobby', q: -1 };
  quizSaveState(state);
  return state;
}

function quizSaveState(state) {
  PropertiesService.getScriptProperties().setProperty('QUIZ_STATE', JSON.stringify(state));
}

function quizLoadQuestions() {
  const raw = PropertiesService.getScriptProperties().getProperty('QUIZ_QUESTIONS');
  return raw ? JSON.parse(raw) : quizReadQuestionsFromSheet();
}

function quizReadQuestionsFromSheet() {
  const sheet = quizSheet('questions');
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 8).getValues()
    .filter((r) => String(r[0]).trim())
    .map((r) => ({
      text: String(r[0]).trim(),
      options: r.slice(1, 5).map((o) => String(o).trim()).filter((o) => o),
      correct: Number(r[5]) || 0,
      time: Number(r[6]) || 30,
      image: quizImageUrl(r[7]),
    }));
}

// ลิงก์แชร์ของ Google Drive → ลิงก์รูปที่ใส่ใน <img> ได้ (ไฟล์ต้องแชร์ "ทุกคนที่มีลิงก์")
function quizImageUrl(link) {
  const s = String(link || '').trim();
  if (!s) return '';
  const m = s.match(/\/d\/([\w-]{20,})/) || s.match(/[?&]id=([\w-]{20,})/);
  return m ? 'https://drive.google.com/thumbnail?id=' + m[1] + '&sz=w1600' : s;
}

// ผู้เล่นของเกมนี้ (ลงทะเบียนซ้ำ/เปลี่ยนชื่อ = ใช้ชื่อล่าสุด)
function quizPlayers(gameId) {
  const sheet = quizSheet('players');
  if (sheet.getLastRow() < 2) return [];
  const byId = {};
  sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues().forEach((r) => {
    if (String(r[1]) === gameId && r[2]) byId[r[2]] = { playerId: String(r[2]), nickname: String(r[3]) };
  });
  return Object.keys(byId).map((k) => byId[k]);
}

function quizLiveAnswers(state, players) {
  if (players.length === 0) return [];
  const keys = players.map((p) => quizAnswerKey(state.gameId, state.q, p.playerId));
  const got = CacheService.getScriptCache().getAll(keys);
  return players
    .map((player, i) => ({ player: player, answer: got[keys[i]] ? JSON.parse(got[keys[i]]) : null }))
    .filter((x) => x.answer);
}

function quizAnswerKey(gameId, q, playerId) {
  return 'qa_' + gameId + '_' + q + '_' + playerId;
}

function quizSheet(kind) {
  const def = QUIZ_SHEETS[kind];
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName(def.name);
  if (!sheet) {
    sheet = ss.insertSheet(def.name);
    sheet.getRange(1, 1, 1, def.headers.length).setValues([def.headers]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function quizClearRows(sheet) {
  if (sheet.getLastRow() > 1) sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
}
