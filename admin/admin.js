import { renderDashboard } from './dashboard.js';
import { renderAccess } from './access.js';
import { renderUsers } from './users.js';
import { renderSubjects } from './subjects.js';
import { renderAnnouncements } from './announcements.js';
import { renderStatistics } from './statistics.js';
import { renderLogs } from './logs.js';
import { renderSettings } from './settings.js';
import {
  getCurrentUser,
  isSuperAdmin,
  logout,
  requireAdmin,
  watchUser,
} from './firebase.js';
import { escapeHtml } from './security.js';

const app = document.querySelector('#app');

const pages = {
  dashboard: { label: '대시보드', render: renderDashboard },
  access: { label: '로그인 계정 관리', render: renderAccess },
  users: { label: '학생 관리', render: renderUsers },
  subjects: { label: '과목 관리', render: renderSubjects },
  announcements: { label: '공지사항', render: renderAnnouncements },
  statistics: { label: '통계', render: renderStatistics },
  logs: { label: '활동 로그', render: renderLogs },
  settings: { label: '시스템 설정', render: renderSettings, superOnly: true },
};

const routeAliases = {
  '': 'dashboard',
  dashboard: 'dashboard',
  access: 'access',
  users: 'users',
  'manage-users': 'users',
  subjects: 'subjects',
  'manage-subjects': 'subjects',
  announcements: 'announcements',
  statistics: 'statistics',
  logs: 'logs',
  settings: 'settings',
};

let session = { user: null, admin: null };
let pendingSignedOutTimer = null;

function pageKeyFromHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  return routeAliases[raw] || 'dashboard';
}

function setHash(key) {
  location.hash = key;
}

function showLogin(error = '') {
  app.innerHTML = `
    <main class="auth-screen">
      <section class="auth-panel">
        <h1>관리자 시스템</h1>
        <p>메인 페이지에서 Google 계정으로 로그인한 뒤 관리자 페이지로 이동해 주세요.</p>
        ${error ? `<div class="notice error">${escapeHtml(error)}</div>` : ''}
        <a class="btn primary" href="../index.html" style="display:inline-flex;text-decoration:none;">메인 페이지로 이동</a>
      </section>
    </main>
  `;
}

function showDenied() {
  app.innerHTML = `
    <main class="auth-screen">
      <section class="auth-panel">
        <h1>관리자 권한이 필요합니다.</h1>
        <p>관리자 계정 목록에 등록된 학교 계정만 접근할 수 있습니다. 잠시 후 메인 페이지로 이동합니다.</p>
      </section>
    </main>
  `;
  setTimeout(() => {
    window.location.href = '../index.html';
  }, 1600);
}

function shell() {
  const roleLabel = session.admin?.role === 'super-admin' ? '최고 관리자' : '관리자';
  app.innerHTML = `
    <div class="app">
      <aside class="sidebar">
        <div class="brand">
          <strong>YC Admin</strong>
          <span>${escapeHtml(session.user.email)} · ${roleLabel}</span>
        </div>
        <nav>
          ${Object.entries(pages).map(([key, page]) => {
            if (page.superOnly && !isSuperAdmin(session.admin.role)) return '';
            return `<button class="nav-button" data-page="${key}">${page.label}</button>`;
          }).join('')}
        </nav>
        <button class="nav-button" id="go-main">메인 페이지</button>
        <button class="nav-button" id="logout">로그아웃</button>
      </aside>
      <main class="main">
        <div id="page"></div>
      </main>
    </div>
  `;
  document.querySelectorAll('[data-page]').forEach((button) => {
    button.addEventListener('click', () => setHash(button.dataset.page));
  });
  document.querySelector('#go-main').addEventListener('click', () => {
    window.location.href = '../index.html';
  });
  document.querySelector('#logout').addEventListener('click', logout);
}

async function renderCurrentPage() {
  const key = pageKeyFromHash();
  const page = pages[key] || pages.dashboard;
  if (page.superOnly && !isSuperAdmin(session.admin.role)) {
    setHash('dashboard');
    return;
  }

  document.querySelectorAll('[data-page]').forEach((button) => {
    button.classList.toggle('active', button.dataset.page === key);
  });

  const root = document.querySelector('#page');
  root.innerHTML = `
    <div class="topbar">
      <div>
        <h1>${page.label}</h1>
        <p>Firestore 데이터를 기준으로 표시합니다.</p>
      </div>
    </div>
  `;

  try {
    await page.render(root, session);
  } catch (error) {
    root.insertAdjacentHTML('beforeend', `<div class="notice error">${escapeHtml(error?.message || '화면을 불러오지 못했습니다.')}</div>`);
    console.error(error);
  }
}

watchUser(async (user) => {
  if (pendingSignedOutTimer) {
    clearTimeout(pendingSignedOutTimer);
    pendingSignedOutTimer = null;
  }

  if (!user) {
    pendingSignedOutTimer = setTimeout(() => {
      if (getCurrentUser()) return;
      session = { user: null, admin: null };
      showLogin();
    }, 900);
    return;
  }

  let admin = null;
  try {
    admin = await requireAdmin(user);
  } catch (error) {
    console.error('관리자 권한 확인 실패', error);
    showLogin(error?.message || '관리자 권한 확인 중 오류가 발생했습니다.');
    return;
  }

  if (!admin) {
    console.warn(`관리자 문서를 찾지 못했거나 role 값이 올바르지 않습니다. expected path: admins/${user.email.toLowerCase()}`);
    showDenied();
    return;
  }

  session = { user, admin };
  shell();
  await renderCurrentPage();
});

window.addEventListener('hashchange', renderCurrentPage);
