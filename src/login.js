// 로그인 흐름을 초기화하고 React 앱에 인증 상태를 전달하는 얇은 컨트롤러입니다.
import { SCHOOL_DOMAIN_ERROR, signInWithGoogle, signOutGoogle, watchAuthState } from '../firebase/auth.js';
import { recordUserLogin } from '../firebase/firestore.js';
import { buildStudentProfile } from './gradeDetector.js';
import { clearAllStoredData, clearLoginInfo, saveLoginInfo } from './storage.js';

// 인증 상태 변경을 구독해 프로필과 오류 메시지를 콜백으로 전달합니다.
export function initLoginController(onChange) {
  return watchAuthState((user, errorMessage) => {
    if (errorMessage) {
      onChange({ status: 'signed-out', profile: null, error: errorMessage });
      return;
    }

    if (!user) {
      onChange({ status: 'signed-out', profile: null, error: null });
      return;
    }

    const profile = buildStudentProfile(user);
    saveLoginInfo(profile);
    recordUserLogin(user, profile).catch((error) => console.warn('로그인 기록 저장 실패', error));
    onChange({ status: 'signed-in', profile, user, error: null });
  });
}

// 로그인 버튼에서 호출하는 함수입니다.
export async function loginWithGoogle() {
  try {
    const user = await signInWithGoogle();
    const profile = buildStudentProfile(user);
    await recordUserLogin(user, profile);
    return profile;
  } catch (error) {
    throw new Error(error?.message || SCHOOL_DOMAIN_ERROR);
  }
}

// 로그아웃 시 저장 데이터 삭제 여부를 물은 뒤 인증 세션을 종료합니다.
export async function logout({ clearLocalData = false } = {}) {
  if (clearLocalData) clearAllStoredData();
  else clearLoginInfo();
  await signOutGoogle();
}
