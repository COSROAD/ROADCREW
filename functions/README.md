# ROADCREW 알림 문자 배포 방법

## 1. 알리고 발신번호 사전등록 (안 했으면 필수)
https://smartsms.aligo.in → 발신번호 등록 → 승인까지 보통 1일

## 2. Firebase CLI 설치 (처음 한 번만)
```
npm install -g firebase-tools
firebase login
```

## 3. 알리고 키를 Firebase 금고(Secret)에 저장
```
cd ROADCREW
firebase use roadcrew-1e9cd

firebase functions:secrets:set ALIGO_KEY
   → 알리고 API Key 붙여넣고 Enter

firebase functions:secrets:set ALIGO_USER_ID
   → 알리고 로그인 아이디 입력

firebase functions:secrets:set ALIGO_SENDER
   → 발신번호 (예: 03212345678, '-' 없이)
```

## 4. 배포
```
cd functions && npm install && cd ..
firebase deploy --only functions
```

## 5. 확인
Firebase 콘솔 → Functions 에 아래 2개가 보이면 성공
- onApplicationCreate
- onApplicationUpdate

문자 발송 기록은 Firestore `sms_log` 컬렉션에 쌓입니다.
