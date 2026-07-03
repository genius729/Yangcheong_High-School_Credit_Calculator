// Firestore에 사용자별 계산기 상태를 저장하고 복원하는 함수 모음입니다.
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import { db } from './firebase-config.js';

// uid 기준으로 개인 문서에 저장합니다. Firestore Rules에서 학교 도메인을 반드시 검증하세요.
export async function saveUserCalculatorState(user, payload) {
  if (!user) return;

  await setDoc(doc(db, 'studentCalculatorStates', user.uid), {
    email: user.email,
    displayName: user.displayName || '',
    ...payload,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

// 사용자의 이전 저장 상태를 읽습니다. 문서가 없으면 null을 반환합니다.
export async function loadUserCalculatorState(user) {
  if (!user) return null;

  const snapshot = await getDoc(doc(db, 'studentCalculatorStates', user.uid));
  return snapshot.exists() ? snapshot.data() : null;
}
