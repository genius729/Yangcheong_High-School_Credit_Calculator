import {
  browserLocalPersistence,
  GoogleAuthProvider,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signOut,
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import { auth, db } from '../firebase/firebase-config.js';

export const ROLES = {
  USER: 'user',
  ADMIN: 'admin',
  SUPER_ADMIN: 'super-admin',
};

const ROLE_ALIASES = {
  admin: ROLES.ADMIN,
  관리자: ROLES.ADMIN,
  teacher: ROLES.ADMIN,
  'super-admin': ROLES.SUPER_ADMIN,
  super_admin: ROLES.SUPER_ADMIN,
  superadmin: ROLES.SUPER_ADMIN,
  'super admin': ROLES.SUPER_ADMIN,
  '최고 관리자': ROLES.SUPER_ADMIN,
};

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

const ADMIN_SESSION_KEY = 'yccu.adminSession.v1';
let persistenceReady = null;

function ensurePersistence() {
  if (!persistenceReady) {
    persistenceReady = setPersistence(auth, browserLocalPersistence);
  }
  return persistenceReady;
}

export function watchUser(callback) {
  ensurePersistence().catch((error) => console.warn('관리자 로그인 유지 설정 실패', error));
  return onAuthStateChanged(auth, callback);
}

export async function login() {
  await ensurePersistence();
  const result = await signInWithPopup(auth, provider);
  return result.user;
}

export async function logout() {
  clearRememberedAdmin();
  await signOut(auth);
}

export function getCurrentUser() {
  return auth.currentUser;
}

export function safeEmailId(email = '') {
  return email.trim().toLowerCase();
}

export function normalizeRole(role = '') {
  const key = String(role).trim().toLowerCase();
  return ROLE_ALIASES[key] || key;
}

export async function getAdminRecord(email) {
  if (!email) return null;
  const emailId = safeEmailId(email);
  let snap;

  try {
    snap = await getDoc(doc(db, 'admins', emailId));
  } catch (error) {
    if (error?.code === 'permission-denied') {
      throw new Error(`관리자 문서(${emailId})를 읽을 권한이 없습니다. Firestore Rules 배포 여부와 admins 문서 ID를 확인하세요.`);
    }
    throw error;
  }

  if (!snap.exists()) return null;
  const data = snap.data();
  const normalizedRole = normalizeRole(data.role);
  return {
    ...data,
    id: snap.id,
    email: data.email || emailId,
    role: normalizedRole === ROLES.SUPER_ADMIN ? ROLES.SUPER_ADMIN : ROLES.ADMIN,
  };
}

export function isAdminRole(role) {
  const normalizedRole = normalizeRole(role);
  return normalizedRole === ROLES.ADMIN || normalizedRole === ROLES.SUPER_ADMIN;
}

export function isSuperAdmin(role) {
  return normalizeRole(role) === ROLES.SUPER_ADMIN;
}

export function getRememberedAdmin(user) {
  if (!user?.email) return null;

  try {
    const saved = JSON.parse(sessionStorage.getItem(ADMIN_SESSION_KEY) || 'null');
    if (safeEmailId(saved?.email) !== safeEmailId(user.email)) return null;
    if (saved?.uid && saved.uid !== user.uid) return null;
    if (!isAdminRole(saved?.role)) return null;
    return saved;
  } catch {
    return null;
  }
}

export function clearRememberedAdmin() {
  try {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
  } catch {
    // 세션 저장소를 사용할 수 없는 환경에서도 로그아웃은 계속 진행합니다.
  }
}

function rememberAdmin(user, record) {
  try {
    sessionStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify({
      ...record,
      uid: user.uid,
      email: safeEmailId(user.email),
    }));
  } catch {
    // 저장에 실패해도 현재 요청의 관리자 권한 확인 결과는 그대로 사용합니다.
  }
}

export async function requireAdmin(user) {
  if (!user?.email) return null;
  const record = await getAdminRecord(user.email);
  if (!record || !isAdminRole(record.role)) {
    clearRememberedAdmin();
    return null;
  }
  rememberAdmin(user, record);
  return record;
}

export async function addLog(adminEmail, action, target) {
  await addDoc(collection(db, 'logs'), {
    adminEmail: safeEmailId(adminEmail),
    action,
    target: String(target || ''),
    ipAddress: '',
    createdAt: serverTimestamp(),
  });
}

export async function getCollection(name, constraints = []) {
  const q = constraints.length ? query(collection(db, name), ...constraints) : collection(db, name);
  const snap = await getDocs(q);
  return snap.docs.map((item) => ({ ...item.data(), id: item.id }));
}

export async function getRecentCollection(name, field = 'createdAt', count = 100) {
  return getCollection(name, [orderBy(field, 'desc'), limit(count)]);
}

export async function upsertDocument(collectionName, id, payload, adminEmail, action) {
  await setDoc(doc(db, collectionName, id), {
    ...payload,
    updatedAt: serverTimestamp(),
  }, { merge: true });
  if (adminEmail && action) {
    try {
      await addLog(adminEmail, action, id);
    } catch (error) {
      console.warn('데이터는 저장했지만 활동 로그 기록에 실패했습니다.', error);
    }
  }
}

export async function updateDocument(collectionName, id, payload, adminEmail, action) {
  await updateDoc(doc(db, collectionName, id), {
    ...payload,
    updatedAt: serverTimestamp(),
  });
  if (adminEmail && action) {
    try {
      await addLog(adminEmail, action, id);
    } catch (error) {
      console.warn('데이터는 수정했지만 활동 로그 기록에 실패했습니다.', error);
    }
  }
}

export async function removeDocument(collectionName, id, adminEmail, action) {
  await deleteDoc(doc(db, collectionName, id));
  if (adminEmail && action) {
    try {
      await addLog(adminEmail, action, id);
    } catch (error) {
      console.warn('데이터는 삭제했지만 활동 로그 기록에 실패했습니다.', error);
    }
  }
}

export async function getUserDetail(uid) {
  const userSnap = await getDoc(doc(db, 'users', uid));
  const stateSnap = await getDoc(doc(db, 'studentCalculatorStates', uid));
  return {
    user: userSnap.exists() ? { ...userSnap.data(), id: userSnap.id } : null,
    calculatorState: stateSnap.exists() ? stateSnap.data() : null,
  };
}

export async function getTodaysLoginCount() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const rows = await getCollection('users', [where('lastLoginAt', '>=', start)]);
  return rows.length;
}

export async function createBackup() {
  const names = ['users', 'subjects', 'announcements', 'statistics', 'logs', 'admins', 'allowedAccounts', 'systemSettings'];
  const backup = { createdAt: new Date().toISOString(), collections: {} };
  for (const name of names) {
    backup.collections[name] = await getCollection(name);
  }
  return backup;
}

export async function restoreBackup(backup, adminEmail) {
  if (!backup?.collections) throw new Error('백업 JSON 형식이 올바르지 않습니다.');
  for (const [name, rows] of Object.entries(backup.collections)) {
    const batch = writeBatch(db);
    rows.forEach((row) => {
      const { id, ...data } = row;
      if (id) batch.set(doc(db, name, id), data, { merge: true });
    });
    await batch.commit();
  }
  await addLog(adminEmail, '백업 복원', 'all');
}
