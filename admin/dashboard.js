import { getCollection, getTodaysLoginCount } from './firebase.js';

function graduationOk(user) {
  return Boolean(user.graduationEligible || user.graduationStatus === 'eligible' || Number(user.credits || 0) >= 174);
}

export async function renderDashboard(root) {
  const [users, subjects, states] = await Promise.all([
    getCollection('users'),
    getCollection('subjects'),
    getCollection('studentCalculatorStates'),
  ]);
  const todayLogins = await getTodaysLoginCount().catch(() => 0);
  const eligible = users.filter(graduationOk).length;
  const atRisk = users.length - eligible;
  const joint = states.filter((row) => row.jointEnabled || Object.keys(row.selections || {}).some((key) => key.startsWith('j'))).length;
  const online = states.filter((row) => row.onlineEnabled || Object.keys(row.selections || {}).some((key) => key.startsWith('o'))).length;

  const cards = [
    ['전체 사용자 수', users.length],
    ['오늘 로그인한 사용자 수', todayLogins],
    ['전체 저장된 과목 수', subjects.length],
    ['졸업 가능 학생 수', eligible],
    ['졸업 위험 학생 수', atRisk],
    ['공동교육과정 신청 수', joint],
    ['온라인학교 신청 수', online],
  ];

  root.insertAdjacentHTML('beforeend', `
    <section class="grid cards">
      ${cards.map(([label, value]) => `
        <article class="card">
          <div class="metric-label">${label}</div>
          <div class="metric-value">${value}</div>
        </article>
      `).join('')}
    </section>
  `);
}
