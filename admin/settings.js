import {
  addLog,
  createBackup,
  getCollection,
  isSuperAdmin,
  removeDocument,
  restoreBackup,
  upsertDocument,
} from './firebase.js';
import { escapeHtml, isValidEmail } from './security.js';

function downloadJson(data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `yccu-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export async function renderSettings(root, session) {
  if (!isSuperAdmin(session.admin.role)) {
    root.insertAdjacentHTML('beforeend', '<div class="notice error">최고 관리자만 접근할 수 있습니다.</div>');
    return;
  }

  const [settings, admins] = await Promise.all([
    getCollection('systemSettings'),
    getCollection('admins'),
  ]);
  const current = settings.find((row) => row.id === 'graduation') || {};

  root.insertAdjacentHTML('beforeend', `
    <section class="section">
      <div class="section-head"><h2>시스템 설정</h2><span class="badge">최고 관리자</span></div>
      <div class="form-grid">
        <label>학년도<input class="input" id="schoolYear" type="number" value="${escapeHtml(current.schoolYear || new Date().getFullYear())}"></label>
        <label>졸업 기준 학점<input class="input" id="graduationCredits" type="number" value="${escapeHtml(current.graduationCredits || 174)}"></label>
        <label class="full">필수 과목 변경<textarea class="textarea" id="requiredSubjects" placeholder="쉼표로 구분">${escapeHtml((current.requiredSubjects || []).join(', '))}</textarea></label>
        <div class="full"><button class="btn primary" id="save-settings">설정 저장</button></div>
      </div>
    </section>
    <section class="section">
      <div class="section-head"><h2>관리자 계정 추가 및 삭제</h2></div>
      <div class="toolbar" style="padding:14px 16px 0;">
        <input class="input" id="adminEmail" placeholder="teacher1@yc.hs.kr">
        <select class="select" id="adminRole"><option value="admin">관리자</option><option value="super-admin">최고 관리자</option></select>
        <button class="btn primary" id="add-admin">관리자 추가</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>이메일</th><th>권한</th><th>작업</th></tr></thead>
          <tbody>
            ${admins.map((admin) => `<tr><td>${escapeHtml(admin.email || admin.id)}</td><td>${escapeHtml(admin.role)}</td><td><button class="btn danger" data-delete-admin="${escapeHtml(admin.id)}">삭제</button></td></tr>`).join('') || `<tr><td colspan="3"><div class="empty">등록된 관리자가 없습니다.</div></td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
    <section class="section">
      <div class="section-head"><h2>데이터 백업 및 복구</h2></div>
      <div class="toolbar" style="padding:16px;">
        <button class="btn primary" id="backup">백업 생성</button>
        <input class="input" id="restoreFile" type="file" accept="application/json">
        <button class="btn" id="restore">백업 복원</button>
        <button class="btn danger" id="delete-all">전체 데이터 삭제</button>
      </div>
      <div class="notice">전체 데이터 삭제는 안전을 위해 현재 화면에서 로그만 기록합니다. 실제 삭제가 필요하면 별도 승인 절차를 두고 구현하세요.</div>
    </section>
  `);

  root.querySelector('#save-settings').addEventListener('click', async () => {
    await upsertDocument('systemSettings', 'graduation', {
      schoolYear: Number(root.querySelector('#schoolYear').value),
      graduationCredits: Number(root.querySelector('#graduationCredits').value),
      requiredSubjects: root.querySelector('#requiredSubjects').value.split(',').map((item) => item.trim()).filter(Boolean),
    }, session.user.email, '시스템 설정 변경');
  });
  root.querySelector('#add-admin').addEventListener('click', async () => {
    const email = root.querySelector('#adminEmail').value.trim().toLowerCase();
    if (!isValidEmail(email)) {
      alert('올바른 이메일 주소를 입력해 주세요.');
      return;
    }
    await upsertDocument('admins', email, { email, role: root.querySelector('#adminRole').value }, session.user.email, '관리자 계정 추가');
    root.innerHTML = '<div class="topbar"><div><h1>시스템 설정</h1><p>Firestore 데이터를 기준으로 표시합니다.</p></div></div>';
    renderSettings(root, session);
  });
  root.querySelectorAll('[data-delete-admin]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (button.dataset.deleteAdmin === session.user.email.trim().toLowerCase()) {
        alert('현재 로그인한 최고 관리자 계정은 삭제할 수 없습니다.');
        return;
      }
      if (!confirm('관리자를 삭제할까요?')) return;
      await removeDocument('admins', button.dataset.deleteAdmin, session.user.email, '관리자 계정 삭제');
      root.innerHTML = '<div class="topbar"><div><h1>시스템 설정</h1><p>Firestore 데이터를 기준으로 표시합니다.</p></div></div>';
      renderSettings(root, session);
    });
  });
  root.querySelector('#backup').addEventListener('click', async () => {
    downloadJson(await createBackup());
  });
  root.querySelector('#restore').addEventListener('click', async () => {
    const file = root.querySelector('#restoreFile').files[0];
    if (!file) return;
    await restoreBackup(JSON.parse(await file.text()), session.user.email);
  });
  root.querySelector('#delete-all').addEventListener('click', async () => {
    await addLog(session.user.email, '전체 데이터 삭제 요청', 'all');
    alert('전체 데이터 삭제 요청이 로그에 기록되었습니다.');
  });
}
