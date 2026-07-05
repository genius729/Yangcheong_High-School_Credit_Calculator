import { addLog, getCollection, getUserDetail, updateDocument } from './firebase.js';
import { escapeHtml } from './security.js';

const state = { page: 1, pageSize: 10, search: '', grade: '', graduation: '', joint: '', sort: 'name' };

function resetRoot(root) {
  root.innerHTML = '<div class="topbar"><div><h1>학생 관리</h1><p>Firestore 데이터를 기준으로 표시합니다.</p></div></div>';
}

function graduationOk(user) {
  return Boolean(user.graduationEligible || user.graduationStatus === 'eligible' || Number(user.credits || 0) >= 174);
}

function fmtDate(value) {
  const date = value?.toDate ? value.toDate() : value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleString('ko-KR') : '-';
}

function applyFilters(users) {
  const keyword = state.search.trim().toLowerCase();
  return users
    .filter((user) => {
      const haystack = `${user.name || ''} ${user.studentId || ''} ${user.email || ''}`.toLowerCase();
      if (keyword && !haystack.includes(keyword)) return false;
      if (state.grade && String(user.grade || '') !== state.grade) return false;
      if (state.graduation === 'yes' && !graduationOk(user)) return false;
      if (state.graduation === 'no' && graduationOk(user)) return false;
      if (state.joint === 'yes' && !user.jointCourseParticipating) return false;
      if (state.joint === 'no' && user.jointCourseParticipating) return false;
      return true;
    })
    .sort((a, b) => String(a[state.sort] || '').localeCompare(String(b[state.sort] || ''), 'ko'));
}

async function openDetail(user, session) {
  const detail = await getUserDetail(user.id);
  const stateData = detail.calculatorState || {};
  const selected = Object.entries(stateData.selections || {});
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.innerHTML = `
    <section class="modal">
      <div class="section-head">
        <h2>${escapeHtml(user.name || user.email)} 상세 정보</h2>
        <button class="btn ghost" data-close>닫기</button>
      </div>
      <div class="form-grid">
        <div><strong>기본 정보</strong><br>${escapeHtml(user.email || '-')} · ${escapeHtml(user.studentId || '-')} · ${escapeHtml(user.grade || '-')}학년</div>
        <div><strong>졸업 가능 여부</strong><br>${graduationOk(user) ? '가능' : '위험/확인 필요'}</div>
        <div><strong>총 취득 학점</strong><br><input class="input" id="detail-credits" type="number" value="${Number(user.credits || 0)}"></div>
        <label class="full">관리자 메모<textarea class="textarea" id="detail-note">${escapeHtml(user.adminMemo || '')}</textarea></label>
        <div class="full"><strong>선택 과목 목록</strong><br>${selected.length ? selected.map(([key, ids]) => `${escapeHtml(key)}: ${escapeHtml(Array.isArray(ids) ? ids.join(', ') : '')}`).join('<br>') : '저장된 선택 과목이 없습니다.'}</div>
        <div><strong>공동교육과정</strong><br>${stateData.jointEnabled ? '참여' : '미참여/미확인'}</div>
        <div><strong>온라인학교</strong><br>${stateData.onlineEnabled ? '참여' : '미참여/미확인'}</div>
        <div><strong>최근 로그인 기록</strong><br>${fmtDate(user.lastLoginAt || user.lastLogin)}</div>
        <div><strong>학기별 취득 학점</strong><br>${escapeHtml(JSON.stringify(user.semesterCredits || {}, null, 2))}</div>
        <div class="full">
          <button class="btn primary" id="save-detail">학점/메모 저장</button>
          <button class="btn" id="add-subject">과목 추가 기록</button>
          <button class="btn danger" id="delete-subject">과목 삭제 기록</button>
        </div>
      </div>
    </section>
  `;
  document.body.appendChild(modal);
  modal.querySelector('[data-close]').addEventListener('click', () => modal.remove());
  modal.querySelector('#save-detail').addEventListener('click', async () => {
    await updateDocument('users', user.id, {
      credits: Number(modal.querySelector('#detail-credits').value || 0),
      adminMemo: modal.querySelector('#detail-note').value,
    }, session.user.email, '학생 데이터 수정');
    modal.remove();
  });
  modal.querySelector('#add-subject').addEventListener('click', () => addLog(session.user.email, '학생 과목 추가', user.studentId || user.email));
  modal.querySelector('#delete-subject').addEventListener('click', () => addLog(session.user.email, '학생 과목 삭제', user.studentId || user.email));
}

export async function renderUsers(root, session) {
  const users = await getCollection('users');
  const filtered = applyFilters(users);
  const pages = Math.max(1, Math.ceil(filtered.length / state.pageSize));
  state.page = Math.min(state.page, pages);
  const start = (state.page - 1) * state.pageSize;
  const rows = filtered.slice(start, start + state.pageSize);

  root.insertAdjacentHTML('beforeend', `
    <section class="section">
      <div class="section-head">
        <h2>전체 학생 정보</h2>
        <span class="badge">${filtered.length}명</span>
      </div>
      <div class="toolbar" style="padding:14px 16px 0;">
        <input class="input" id="search" placeholder="이름, 학번, 이메일 검색" value="${escapeHtml(state.search)}">
        <select class="select" id="grade"><option value="">전체 학년</option><option value="1">1학년</option><option value="2">2학년</option><option value="3">3학년</option></select>
        <select class="select" id="graduation"><option value="">졸업 전체</option><option value="yes">졸업 가능</option><option value="no">졸업 위험</option></select>
        <select class="select" id="joint"><option value="">공동교육 전체</option><option value="yes">참여</option><option value="no">미참여</option></select>
        <select class="select" id="sort"><option value="name">이름순</option><option value="studentId">학번순</option><option value="credits">학점순</option><option value="lastLoginAt">최근 접속순</option></select>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>이름</th><th>이메일</th><th>학번</th><th>학년</th><th>총 취득 학점</th><th>졸업 가능 여부</th><th>최근 접속 시간</th></tr></thead>
          <tbody>
            ${rows.map((user) => `
              <tr data-id="${escapeHtml(user.id)}">
                <td>${escapeHtml(user.name || '-')}</td><td>${escapeHtml(user.email || '-')}</td><td>${escapeHtml(user.studentId || '-')}</td><td>${escapeHtml(user.grade || '-')}</td>
                <td>${Number(user.credits || 0)}</td><td><span class="badge ${graduationOk(user) ? 'ok' : 'warn'}">${graduationOk(user) ? '가능' : '위험'}</span></td><td>${fmtDate(user.lastLoginAt || user.lastLogin)}</td>
              </tr>
            `).join('') || `<tr><td colspan="7"><div class="empty">학생 데이터가 없습니다.</div></td></tr>`}
          </tbody>
        </table>
      </div>
      <div class="pagination">
        <button class="btn" id="prev">이전</button><span>${state.page} / ${pages}</span><button class="btn" id="next">다음</button>
      </div>
    </section>
  `);

  ['grade', 'graduation', 'joint', 'sort'].forEach((id) => { root.querySelector(`#${id}`).value = state[id]; });
  root.querySelector('#search').addEventListener('input', (event) => {
    state.search = event.target.value;
    state.page = 1;
    resetRoot(root);
    renderUsers(root, session);
  });
  ['grade', 'graduation', 'joint', 'sort'].forEach((id) => {
    root.querySelector(`#${id}`).addEventListener('change', (event) => {
      state[id] = event.target.value;
      state.page = 1;
      resetRoot(root);
      renderUsers(root, session);
    });
  });
  root.querySelector('#prev').addEventListener('click', () => {
    state.page = Math.max(1, state.page - 1);
    resetRoot(root);
    renderUsers(root, session);
  });
  root.querySelector('#next').addEventListener('click', () => {
    state.page = Math.min(pages, state.page + 1);
    resetRoot(root);
    renderUsers(root, session);
  });
  root.querySelectorAll('tbody tr[data-id]').forEach((row) => {
    row.addEventListener('click', () => openDetail(users.find((user) => user.id === row.dataset.id), session));
  });
}
