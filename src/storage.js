// 계산기 상태를 브라우저 LocalStorage에 저장하고 복원합니다.
const APP_STATE_KEY = 'yccu.calculatorState.v1';
const LOGIN_STATE_KEY = 'yccu.loginState.v1';

// JSON 파싱 실패가 사용자 화면 오류로 번지지 않도록 안전하게 읽습니다.
function readJson(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    console.warn('저장된 데이터를 읽을 수 없습니다.', error);
    return fallback;
  }
}

export function saveLoginInfo(profile) {
  localStorage.setItem(LOGIN_STATE_KEY, JSON.stringify(profile));
}

export function loadLoginInfo() {
  return readJson(LOGIN_STATE_KEY);
}

export function saveAppState(state) {
  localStorage.setItem(APP_STATE_KEY, JSON.stringify({
    ...state,
    savedAt: new Date().toISOString(),
  }));
}

export function loadAppState() {
  return readJson(APP_STATE_KEY);
}

export function clearAllStoredData() {
  localStorage.removeItem(APP_STATE_KEY);
  localStorage.removeItem(LOGIN_STATE_KEY);
}
