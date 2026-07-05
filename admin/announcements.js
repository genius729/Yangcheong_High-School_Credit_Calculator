import { getCollection, removeDocument, upsertDocument } from './firebase.js';
import { escapeHtml } from './security.js';

function fmtDate(value) {
  const date = value?.toDate ? value.toDate() : value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleString('ko-KR') : '-';
}

function values(root, email) {
  return {
    title: root.querySelector('#title').value.trim(),
    content: root.querySelector('#content').value.trim(),
    author: email,
    pinned: root.querySelector('#pinned').checked,
    scheduledAt: root.querySelector('#scheduledAt').value || '',
    createdAt: new Date(),
    createdAtText: new Date().toISOString(),
  };
}

export async function renderAnnouncements(root, session) {
  const rows = await getCollection('announcements');
  root.insertAdjacentHTML('beforeend', `
    <section class="section">
      <div class="section-head"><h2>공지사항 작성</h2><span class="badge">${rows.length}개</span></div>
      <div class="form-grid">
        <input type="hidden" id="announcementId">
        <label class="full">제목<input class="input" id="title"></label>
        <label class="full">내용<textarea class="textarea" id="content"></textarea></label>
        <label><span>상단 고정</span><input type="checkbox" id="pinned"></label>
        <label>예약 게시<input class="input" id="scheduledAt" type="datetime-local"></label>
        <div class="full"><button class="btn primary" id="save-announcement">저장</button><button class="btn" id="new-announcement">새 공지</button></div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>제목</th><th>작성자</th><th>작성 시간</th><th>수정 시간</th><th>고정</th><th>작업</th></tr></thead>
          <tbody>
            ${rows.map((row) => `
              <tr><td>${escapeHtml(row.title || '-')}</td><td>${escapeHtml(row.author || '-')}</td><td>${escapeHtml(fmtDate(row.createdAt) || row.createdAtText || '-')}</td><td>${escapeHtml(fmtDate(row.updatedAt))}</td><td>${row.pinned ? '예' : '아니오'}</td>
              <td><button class="btn" data-edit="${escapeHtml(row.id)}">수정</button><button class="btn danger" data-delete="${escapeHtml(row.id)}">삭제</button></td></tr>
            `).join('') || `<tr><td colspan="6"><div class="empty">공지사항이 없습니다.</div></td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
  `);

  root.querySelector('#new-announcement').addEventListener('click', () => {
    ['announcementId', 'title', 'content', 'scheduledAt'].forEach((id) => { root.querySelector(`#${id}`).value = ''; });
    root.querySelector('#pinned').checked = false;
  });
  root.querySelector('#save-announcement').addEventListener('click', async () => {
    const payload = values(root, session.user.email);
    if (!payload.title) return;
    const id = root.querySelector('#announcementId').value || crypto.randomUUID();
    await upsertDocument('announcements', id, payload, session.user.email, root.querySelector('#announcementId').value ? '공지사항 수정' : '공지사항 작성');
    root.innerHTML = '<div class="topbar"><div><h1>공지사항</h1><p>Firestore 데이터를 기준으로 표시합니다.</p></div></div>';
    renderAnnouncements(root, session);
  });
  root.querySelectorAll('[data-edit]').forEach((button) => {
    button.addEventListener('click', () => {
      const row = rows.find((item) => item.id === button.dataset.edit);
      root.querySelector('#announcementId').value = row.id;
      root.querySelector('#title').value = row.title || '';
      root.querySelector('#content').value = row.content || '';
      root.querySelector('#pinned').checked = Boolean(row.pinned);
      root.querySelector('#scheduledAt').value = row.scheduledAt || '';
    });
  });
  root.querySelectorAll('[data-delete]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!confirm('공지사항을 삭제할까요?')) return;
      await removeDocument('announcements', button.dataset.delete, session.user.email, '공지사항 삭제');
      root.innerHTML = '<div class="topbar"><div><h1>공지사항</h1><p>Firestore 데이터를 기준으로 표시합니다.</p></div></div>';
      renderAnnouncements(root, session);
    });
  });
}
