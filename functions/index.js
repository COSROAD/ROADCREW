/* ═══════════════════════════════════════════════════
   ROADCREW 알림 문자 (알리고 SMS)
   - 기사가 지원하면  → 업체에 문자
   - 업체가 제안하면  → 기사에 문자
   - 업체가 상태 변경 → 기사에 문자 (채용확정/미선정 등)
   알리고 키는 Firebase Secret에만 저장됩니다. 앱에는 없습니다.
   ═══════════════════════════════════════════════════ */
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { defineSecret } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const logger = require('firebase-functions/logger');

initializeApp();
const db = getFirestore();

const ALIGO_KEY     = defineSecret('ALIGO_KEY');      // 알리고 API Key
const ALIGO_USER_ID = defineSecret('ALIGO_USER_ID');  // 알리고 로그인 아이디
const ALIGO_SENDER  = defineSecret('ALIGO_SENDER');   // 발신번호 (사전등록 필수)

const REGION = 'asia-northeast3';
const OPTS = { region: REGION, secrets: [ALIGO_KEY, ALIGO_USER_ID, ALIGO_SENDER] };

/* ── 알리고 문자 발송 ── */
async function sendSMS(to, msg) {
  const phone = String(to || '').replace(/[^0-9]/g, '');
  if (!/^01[0-9]{8,9}$/.test(phone)) { logger.warn('번호 형식 오류, 발송 안 함:', to); return; }

  const body = new URLSearchParams({
    key:     ALIGO_KEY.value(),
    user_id: ALIGO_USER_ID.value(),
    sender:  ALIGO_SENDER.value(),
    receiver: phone,
    msg:      msg,
    msg_type: msg.length > 90 ? 'LMS' : 'SMS',
    title:    '로드크루'
  });

  const res  = await fetch('https://apis.aligo.in/send/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  const json = await res.json().catch(() => ({}));
  if (String(json.result_code) !== '1') {
    logger.error('알리고 발송 실패', { to: phone, result: json });
  } else {
    logger.info('알리고 발송 성공', { to: phone, msg_id: json.msg_id });
  }
}

/* ── 발송 기록 (중복 방지 + 관리자 확인용) ── */
async function log(kind, to, msg, ref) {
  try {
    await db.collection('sms_log').add({
      kind, to, msg, appId: ref || '', createdAt: new Date()
    });
  } catch (e) { logger.warn('로그 실패', e); }
}

/* ═════ 1) 지원 / 제안 생성 시 ═════ */
exports.onApplicationCreate = onDocumentCreated(
  { document: 'applications/{appId}', ...OPTS },
  async (event) => {
    const a = event.data && event.data.data();
    if (!a) return;

    /* 기사가 지원 → 업체에 알림 */
    if (a.direction === 'apply') {
      const snap = await db.collection('companies').doc(String(a.companyId || '')).get();
      const to = snap.exists ? snap.data().phone : '';
      if (!to) { logger.warn('업체 연락처 없음', a.companyId); return; }

      const msg =
        '[로드크루] 새 지원자\n\n'
        + '공고: ' + (a.jobTitle || '-') + '\n'
        + '기사: ' + (a.driverName || '-') + '\n'
        + '연락처: ' + fmt(a.driverPhone) + '\n\n'
        + '앱에서 지원자 프로필을 확인하세요.\nroadcrew.kr/company.html';

      await sendSMS(to, msg);
      await log('apply', to, msg, event.params.appId);
      return;
    }

    /* 업체가 제안 → 기사에 알림 */
    if (a.direction === 'offer') {
      const to = a.driverPhone;
      const msg =
        '[로드크루] 채용 제안이 도착했습니다\n\n'
        + '업체: ' + (a.company || '-') + '\n'
        + '공고: ' + (a.jobTitle || '-') + '\n\n'
        + '앱에서 내용을 확인하고 응답해 주세요.\nroadcrew.kr';

      await sendSMS(to, msg);
      await log('offer', to, msg, event.params.appId);
    }
  }
);

/* ═════ 2) 업체가 지원 상태를 바꿀 때 → 기사에 알림 ═════ */
const STATUS_MSG = {
  hired:    (a) => '[로드크루] 🎉 채용이 확정되었습니다\n\n업체: ' + (a.company || '-') + '\n공고: ' + (a.jobTitle || '-') + '\n\n업체에서 곧 연락드릴 예정입니다.\nroadcrew.kr',
  contact:  (a) => '[로드크루] 업체가 연락을 준비 중입니다\n\n업체: ' + (a.company || '-') + '\n공고: ' + (a.jobTitle || '-') + '\n\n전화를 받아 주세요.\nroadcrew.kr',
  rejected: (a) => '[로드크루] 지원 결과 안내\n\n공고: ' + (a.jobTitle || '-') + '\n\n아쉽게도 이번에는 함께하지 못하게 되었습니다.\n다른 좋은 공고가 많이 있습니다.\nroadcrew.kr'
};

exports.onApplicationUpdate = onDocumentUpdated(
  { document: 'applications/{appId}', ...OPTS },
  async (event) => {
    const before = event.data.before.data();
    const after  = event.data.after.data();
    if (!before || !after) return;
    if (before.status === after.status) return;          // 상태 안 바뀜
    const make = STATUS_MSG[after.status];
    if (!make) return;                                    // viewed 등은 문자 안 보냄

    const msg = make(after);
    await sendSMS(after.driverPhone, msg);
    await log('status:' + after.status, after.driverPhone, msg, event.params.appId);
  }
);

function fmt(p) {
  return String(p || '').replace(/(\d{3})(\d{3,4})(\d{4})/, '$1-$2-$3');
}
