// Google OAuth 인증과 로그인 허용 계정 확인을 담당합니다.
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {
  doc,
  getDoc,
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import { auth, db } from './firebase-config.js';

export const SCHOOL_EMAIL_DOMAIN = '@yc.hs.kr';
export const SCHOOL_DOMAIN_ERROR = '양청고 학교 계정(@yc.hs.kr) 또는 관리자가 등록한 계정만 로그인할 수 있습니다.';

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

// 양청고 Google Workspace 계정인지 확인합니다.
export function isAllowedSchoolEmail(email = '') {
  return email.trim().toLowerCase().endsWith(SCHOOL_EMAIL_DOMAIN);
}

// 학교 계정이 아닌 경우 관리자 계정 목록에 사전 등록되었는지 확인합니다.
export async function isAllowedLoginUser(user) {
  const email = user?.email?.trim().toLowerCase() || '';
  if (!email) return false;
  if (isAllowedSchoolEmail(email)) return true;

  const [allowedAccount, adminAccount] = await Promise.all([
    getDoc(doc(db, 'allowedAccounts', email)),
    getDoc(doc(db, 'admins', email)),
  ]);
  return allowedAccount.exists() || adminAccount.exists();
}

// Google 계정으로 로그인합니다.
export async function signInWithGoogle() {
  const result = await signInWithPopup(auth, provider);
  try {
    if (!await isAllowedLoginUser(result.user)) {
      throw new Error(SCHOOL_DOMAIN_ERROR);
    }
    return result.user;
  } catch (error) {
    await signOut(auth);
    throw error;
  }
}

// Firebase 인증 상태 변화를 구독합니다.
export function watchAuthState(callback) {
  return onAuthStateChanged(auth, async (user) => {
    if (!user) {
      callback(null, null);
      return;
    }

    try {
      if (await isAllowedLoginUser(user)) {
        callback(user, null);
        return;
      }

      await signOut(auth);
      callback(null, SCHOOL_DOMAIN_ERROR);
    } catch (error) {
      await signOut(auth);
      callback(null, error?.message || '로그인 허용 계정인지 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    }
  });
}

// Google/Firebase 인증 세션을 종료합니다.
export async function signOutGoogle() {
  await signOut(auth);
}
