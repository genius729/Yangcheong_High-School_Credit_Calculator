import {
  getCollection,
  removeDocument,
  upsertDocument,
} from './firebase.js';
import { escapeHtml, isValidEmail } from './security.js';

function resetRoot(root) {
  root.innerHTML = `
    <div class="topbar">
      <div>
        <h1>로그인 계정 관리</h1>
        <p>Firestore 데이터를 기준으로 표시합니다.</p>
      </div>
    </div>
  `;
}

export async function renderAccess(root, session) {
  const accounts = await getCollection('allowedAccounts');
  accounts.sort((a, b) => String(a.email || a.id).localeCompare(String(b.email || b.id)));

  root.insertAdjacentHTML('beforeend', `
    <section class="section">
      <div class="section-head">
        <div>
          <h2>외부 계정 로그인 승인</h2>
          <p style="margin:6px 0 0;color:var(--muted);font-size:13px;">
            @yc.hs.kr 학교 계정은 자동 허용됩니다. 그 외 Google 계정만 여기에 등록하세요.
          </p>
        </div>
        <span class="badge">${accounts.length}개</span>
      </div>
      <div class="toolbar" style="padding:14px 16px 0;">
        <input class="input" id="allowedEmail" type="email" placeholder="example@gmail.com">
        <button class="btn primary" id="add-allowed-account">로그인 계정 추가</button>
      </div>
      <div class="notice error" id="access-error" style="display:none;"></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>이메일</th><th>작업</th></tr></thead>
          <tbody>
            ${accounts.map((account) => {
              const email = escapeHtml(account.email || account.id);
              const id = escapeHtml(account.id);
              return `<tr><td>${email}</td><td><button class="btn danger" data-delete-account="${id}">삭제</button></td></tr>`;
            }).join('') || '<tr><td colspan="2"><div class="empty">등록된 외부 계정이 없습니다.</div></td></tr>'}
          </tbody>
        </table>
      </div>
    </section>
  `);

  const errorBox = root.querySelector('#access-error');
  const showError = (message) => {
    errorBox.textContent = message;
    errorBox.style.display = 'block';
  };

  root.querySelector('#add-allowed-account').addEventListener('click', async () => {
    const email = root.querySelector('#allowedEmail').value.trim().toLowerCase();
    if (!isValidEmail(email)) {
      showError('올바른 이메일 주소를 입력해 주세요.');
      return;
    }
    if (email.endsWith('@yc.hs.kr')) {
      showError('학교 계정은 등록하지 않아도 자동으로 로그인할 수 있습니다.');
      return;
    }

    await upsertDocument(
      'allowedAccounts',
      email,
      { email, addedBy: session.user.email },
      session.user.email,
      '외부 로그인 계정 추가',
    );
    resetRoot(root);
    await renderAccess(root, session);
  });

  root.querySelectorAll('[data-delete-account]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!confirm(`${button.dataset.deleteAccount} 계정의 로그인을 차단할까요?`)) return;
      await removeDocument(
        'allowedAccounts',
        button.dataset.deleteAccount,
        session.user.email,
        '외부 로그인 계정 삭제',
      );
      resetRoot(root);
      await renderAccess(root, session);
    });
  });
}
