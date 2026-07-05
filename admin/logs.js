import { getRecentCollection } from './firebase.js';
import { escapeHtml } from './security.js';

function fmtDate(value) {
  const date = value?.toDate ? value.toDate() : value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleString('ko-KR') : '-';
}

export async function renderLogs(root) {
  const rows = await getRecentCollection('logs', 'createdAt', 200).catch(() => []);
  root.insertAdjacentHTML('beforeend', `
    <section class="section">
      <div class="section-head"><h2>관리자 활동 로그</h2><span class="badge">${rows.length}건</span></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>관리자 이메일</th><th>작업 종류</th><th>작업 대상</th><th>작업 시간</th><th>IP 주소</th></tr></thead>
          <tbody>
            ${rows.map((row) => `<tr><td>${escapeHtml(row.adminEmail || '-')}</td><td>${escapeHtml(row.action || '-')}</td><td>${escapeHtml(row.target || '-')}</td><td>${escapeHtml(fmtDate(row.createdAt))}</td><td>${escapeHtml(row.ipAddress || '-')}</td></tr>`).join('') || `<tr><td colspan="5"><div class="empty">활동 로그가 없습니다.</div></td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
  `);
}
