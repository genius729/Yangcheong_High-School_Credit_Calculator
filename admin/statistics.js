import { getCollection } from './firebase.js';

let charts = [];

function destroyCharts() {
  charts.forEach((chart) => chart.destroy());
  charts = [];
}

function graduationOk(user) {
  return Boolean(user.graduationEligible || user.graduationStatus === 'eligible' || Number(user.credits || 0) >= 174);
}

function byGradeAverage(users) {
  return [1, 2, 3].map((grade) => {
    const rows = users.filter((user) => Number(user.grade) === grade);
    const total = rows.reduce((sum, user) => sum + Number(user.credits || 0), 0);
    return rows.length ? Math.round(total / rows.length) : 0;
  });
}

function subjectSelectionCounts(states) {
  const counts = {};
  states.forEach((row) => {
    Object.values(row.selections || {}).flat().forEach((id) => {
      counts[id] = (counts[id] || 0) + 1;
    });
  });
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
}

function recentLoginCounts(users) {
  const labels = [];
  const values = [];
  for (let i = 29; i >= 0; i -= 1) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const key = date.toISOString().slice(0, 10);
    labels.push(key.slice(5));
    values.push(users.filter((user) => {
      const raw = user.lastLoginAt?.toDate ? user.lastLoginAt.toDate() : user.lastLoginAt || user.lastLogin;
      if (!raw) return false;
      return new Date(raw).toISOString().slice(0, 10) === key;
    }).length);
  }
  return { labels, values };
}

function makeChart(id, config) {
  const ctx = document.getElementById(id);
  if (!ctx || !window.Chart) return;
  charts.push(new Chart(ctx, config));
}

export async function renderStatistics(root) {
  destroyCharts();
  const [users, states] = await Promise.all([
    getCollection('users'),
    getCollection('studentCalculatorStates'),
  ]);
  const eligible = users.filter(graduationOk).length;
  const risky = Math.max(0, users.length - eligible);
  const subjectCounts = subjectSelectionCounts(states);
  const joint = states.filter((row) => row.jointEnabled).length;
  const online = states.filter((row) => row.onlineEnabled).length;
  const loginSeries = recentLoginCounts(users);

  root.insertAdjacentHTML('beforeend', `
    <section class="grid charts">
      <article class="card chart-box"><h2>학년별 평균 취득 학점</h2><canvas id="gradeAverage"></canvas></article>
      <article class="card chart-box"><h2>졸업 가능 비율</h2><canvas id="graduationRatio"></canvas></article>
      <article class="card chart-box"><h2>과목별 선택 인원</h2><canvas id="subjectCounts"></canvas></article>
      <article class="card chart-box"><h2>공동교육/온라인학교 신청 현황</h2><canvas id="externalCounts"></canvas></article>
      <article class="card chart-box full"><h2>최근 30일 로그인 수</h2><canvas id="loginCounts"></canvas></article>
    </section>
  `);

  makeChart('gradeAverage', {
    type: 'bar',
    data: { labels: ['1학년', '2학년', '3학년'], datasets: [{ label: '평균 학점', data: byGradeAverage(users), backgroundColor: '#246bfe' }] },
  });
  makeChart('graduationRatio', {
    type: 'pie',
    data: { labels: ['졸업 가능', '졸업 위험'], datasets: [{ data: [eligible, risky], backgroundColor: ['#16a34a', '#f59e0b'] }] },
  });
  makeChart('subjectCounts', {
    type: 'bar',
    data: { labels: subjectCounts.map(([id]) => id), datasets: [{ label: '선택 인원', data: subjectCounts.map(([, count]) => count), backgroundColor: '#7c3aed' }] },
  });
  makeChart('externalCounts', {
    type: 'pie',
    data: { labels: ['공동교육과정', '온라인학교'], datasets: [{ data: [joint, online], backgroundColor: ['#0891b2', '#db2777'] }] },
  });
  makeChart('loginCounts', {
    type: 'line',
    data: { labels: loginSeries.labels, datasets: [{ label: '로그인 수', data: loginSeries.values, borderColor: '#246bfe', backgroundColor: 'rgba(36,107,254,.12)', tension: .25 }] },
  });
}
