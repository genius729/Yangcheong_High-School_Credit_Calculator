// Google OAuth 인증과 양청고 Google Workspace 도메인 검증을 담당합니다.
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import { auth } from './firebase-config.js';

export const SCHOOL_EMAIL_DOMAIN = '@yc.hs.kr';
export const SCHOOL_DOMAIN_ERROR = '양청고등학교 계정으로만 로그인할 수 있습니다.';

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ hd: 'yc.hs.kr', prompt: 'select_account' });

// 클라이언트에서도 학교 이메일 도메인을 검사해 잘못된 계정 접근을 차단합니다.
export function isAllowedSchoolEmail(email = '') {
  return email.toLowerCase().endsWith(SCHOOL_EMAIL_DOMAIN);
}

// Google 계정으로 로그인하고, 학교 도메인이 아니면 즉시 로그아웃합니다.
export async function signInWithGoogle() {
  const result = await signInWithPopup(auth, provider);
  const email = result.user?.email || '';

  if (!isAllowedSchoolEmail(email)) {
    await signOut(auth);
    throw new Error(SCHOOL_DOMAIN_ERROR);
  }

  return result.user;
}

// Firebase 인증 상태 변화를 구독합니다.
export function watchAuthState(callback) {
  return onAuthStateChanged(auth, async (user) => {
    if (user && !isAllowedSchoolEmail(user.email || '')) {
      await signOut(auth);
      callback(null, SCHOOL_DOMAIN_ERROR);
      return;
    }

    callback(user, null);
  });
}

// Google/Firebase 인증 세션을 종료합니다.
export async function signOutGoogle() {
  await signOut(auth);
}
