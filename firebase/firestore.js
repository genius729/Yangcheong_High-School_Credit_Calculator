// Firestore에 사용자별 계산기 상태를 저장하고 복원하는 함수 모음입니다.
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import { db } from './firebase-config.js';

function buildUserDocument(user, extra = {}) {
  return {
    ...extra,
    uid: user.uid,
    name: user.displayName || extra.name || '',
    email: user.email || '',
    studentId: extra.studentId || (user.email || '').split('@')[0],
    grade: extra.grade || null,
  };
}

export async function recordUserLogin(user, profile = {}) {
  if (!user) return;

  await setDoc(doc(db, 'users', user.uid), {
    ...buildUserDocument(user, profile),
    lastLoginAt: serverTimestamp(),
  }, { merge: true });
}

// uid 기준으로 개인 문서에 저장합니다. Firestore Rules에서 학교 도메인을 반드시 검증하세요.
export async function saveUserCalculatorState(user, payload) {
  if (!user) return;

  await setDoc(doc(db, 'studentCalculatorStates', user.uid), {
    ...payload,
    email: user.email || '',
    displayName: user.displayName || '',
    updatedAt: serverTimestamp(),
  }, { merge: true });

  await setDoc(doc(db, 'users', user.uid), {
    uid: user.uid,
    email: user.email,
    name: payload.loginInfo?.name || user.displayName || '',
    studentId: payload.loginInfo?.studentId || (user.email || '').split('@')[0],
    grade: payload.loginInfo?.grade || null,
    credits: payload.calculationResult?.grand || 0,
    graduationEligible: Number(payload.calculationResult?.grand || 0) >= 174,
    jointCourseParticipating: Boolean(payload.jointEnabled),
    onlineSchoolParticipating: Boolean(payload.onlineEnabled),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

// 사용자의 이전 저장 상태를 읽습니다. 문서가 없으면 null을 반환합니다.
export async function loadUserCalculatorState(user) {
  if (!user) return null;

  const snapshot = await getDoc(doc(db, 'studentCalculatorStates', user.uid));
  return snapshot.exists() ? snapshot.data() : null;
}

export async function loadSubjectCatalog() {
  const snapshot = await getDocs(collection(db, 'subjects'));
  return snapshot.docs.map((item) => ({ ...item.data(), id: item.id }));
}

export function watchSubjectCatalog(onChange, onError = console.warn) {
  return onSnapshot(
    collection(db, 'subjects'),
    (snapshot) => {
      onChange(snapshot.docs.map((item) => ({ ...item.data(), id: item.id })));
    },
    onError,
  );
}
