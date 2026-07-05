// 계산기 상태를 브라우저 LocalStorage에 저장하고 복원합니다.
const LEGACY_APP_STATE_KEY = 'yccu.calculatorState.v1';
const APP_STATE_KEY_PREFIX = 'yccu.calculatorState.v2';
const LOGIN_STATE_KEY = 'yccu.loginState.v1';

function getAppStateKey(ownerId) {
  const normalizedOwnerId = String(ownerId || '').trim();
  return normalizedOwnerId
    ? `${APP_STATE_KEY_PREFIX}.${encodeURIComponent(normalizedOwnerId)}`
    : LEGACY_APP_STATE_KEY;
}

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

export function clearLoginInfo() {
  localStorage.removeItem(LOGIN_STATE_KEY);
}

export function saveAppState(state, ownerId) {
  localStorage.setItem(getAppStateKey(ownerId), JSON.stringify({
    ...state,
    savedAt: new Date().toISOString(),
  }));
}

export function loadAppState(ownerId) {
  const ownerKey = getAppStateKey(ownerId);
  const saved = readJson(ownerKey);
  if (saved || !ownerId) return saved;

  // 기존 단일 사용자 저장값은 최초 로그인한 사용자 전용 키로 안전하게 이전합니다.
  const legacySaved = readJson(LEGACY_APP_STATE_KEY);
  if (!legacySaved) return null;

  try {
    localStorage.setItem(ownerKey, JSON.stringify(legacySaved));
    localStorage.removeItem(LEGACY_APP_STATE_KEY);
  } catch (error) {
    console.warn('기존 저장 데이터를 사용자 저장소로 이전하지 못했습니다.', error);
  }
  return legacySaved;
}

export function clearCalculatorData(ownerId) {
  localStorage.removeItem(getAppStateKey(ownerId));
  if (ownerId) localStorage.removeItem(LEGACY_APP_STATE_KEY);
}

export function clearAllStoredData() {
  localStorage.removeItem(LEGACY_APP_STATE_KEY);
  localStorage.removeItem(LOGIN_STATE_KEY);
  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index);
    if (key?.startsWith(`${APP_STATE_KEY_PREFIX}.`)) {
      localStorage.removeItem(key);
    }
  }
}
