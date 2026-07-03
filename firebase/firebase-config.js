// Firebase v11 Modular SDK 설정 파일입니다.
// 현재 프로젝트는 번들러 없이 브라우저에서 바로 실행되므로 CDN ES Module을 사용합니다.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import { getAnalytics, isSupported } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-analytics.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

// Firebase 콘솔에서 발급된 양청고 이수학점 계산기 웹 앱 설정입니다.
export const firebaseConfig = {
  apiKey: 'AIzaSyDbyRGGG2_12unb92Feb0YsRZ0VpODhvEo',
  authDomain: 'yc-credit-calculator.firebaseapp.com',
  projectId: 'yc-credit-calculator',
  storageBucket: 'yc-credit-calculator.firebasestorage.app',
  messagingSenderId: '600724577234',
  appId: '1:600724577234:web:f6926485465e929c94c60b',
  measurementId: 'G-20G35XSLWQ',
};

// 앱, 인증, Firestore 인스턴스를 한 곳에서 생성해 중복 초기화를 막습니다.
export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);

// Analytics는 지원되는 브라우저 환경에서만 초기화합니다.
export const analyticsPromise = isSupported()
  .then((supported) => (supported ? getAnalytics(firebaseApp) : null))
  .catch(() => null);
