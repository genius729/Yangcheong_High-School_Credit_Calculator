import { addLog, getCollection, removeDocument, upsertDocument, updateDocument } from './firebase.js';

const CATEGORIES = ['공통과목', '일반선택', '진로선택', '융합선택', '공동교육과정', '온라인학교'];

const blank = {
  subjectName: '',
  credits: 3,
  required: false,
  elective: true,
  grade: 1,
  semester: '1',
  category: '일반선택',
  subjectGroup: '',
  active: true,
};

let filters = { search: '', category: '', grade: '', status: '' };

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function resetRoot(root) {
  root.innerHTML = '<div class="topbar"><div><h1>과목 관리</h1><p>Firestore 데이터를 기준으로 표시합니다.</p></div></div>';
}

function semesterInfo(semKey = '') {
  const match = String(semKey).match(/^y([1-3])s([1-2])$/);
  return match ? { grade: Number(match[1]), semester: match[2] } : { grade: 1, semester: '1' };
}

function categoryFromSub(sub = '', fallback = '일반선택') {
  if (sub === '공통') return '공통과목';
  if (sub === '일반') return '일반선택';
  if (sub === '진로') return '진로선택';
  if (sub === '융합') return '융합선택';
  return fallback;
}

function findArraySource(source, constName) {
  const startToken = `const ${constName} =`;
  const start = source.indexOf(startToken);
  if (start < 0) return null;
  const bracketStart = source.indexOf('[', start);
  if (bracketStart < 0) return null;

  let depth = 0;
  let inString = false;
  let quote = '';
  let escaped = false;

  for (let index = bracketStart; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) inString = false;
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      inString = true;
      quote = char;
      continue;
    }
    if (char === '[') depth += 1;
    if (char === ']') depth -= 1;
    if (depth === 0) return source.slice(bracketStart, index + 1);
  }

  return null;
}

async function loadCalculatorSubjects() {
  const response = await fetch('../index.html', { cache: 'no-store' });
  const html = await response.text();
  const names = ['REQUIRED_SUBJECTS', 'SLOTS', 'JOINT_SLOTS', 'ONLINE_SLOTS'];
  const arrays = Object.fromEntries(names.map((name) => [name, findArraySource(html, name)]));

  if (Object.values(arrays).some((value) => !value)) {
    throw new Error('계산기 과목 목록을 읽지 못했습니다.');
  }

  const data = Function(`
    "use strict";
    return {
      REQUIRED_SUBJECTS: ${arrays.REQUIRED_SUBJECTS},
      SLOTS: ${arrays.SLOTS},
      JOINT_SLOTS: ${arrays.JOINT_SLOTS},
      ONLINE_SLOTS: ${arrays.ONLINE_SLOTS}
    };
  `)();

  const required = data.REQUIRED_SUBJECTS.map((subject) => {
    const info = semesterInfo(subject.sem);
    return {
      id: subject.id,
      subjectName: subject.name,
      credits: subject.cr,
      required: true,
      elective: false,
      grade: info.grade,
      semester: info.semester,
      category: categoryFromSub(subject.sub, '공통과목'),
      subjectGroup: subject.cat || '',
      active: true,
      source: 'calculator-required',
      sourceId: subject.id,
      originalSemester: subject.sem || '',
      crossSemester: subject.crossSem || '',
    };
  });

  const slotSubjects = [];
  [
    { rows: data.SLOTS, source: 'calculator-elective', category: null },
    { rows: data.JOINT_SLOTS, source: 'calculator-joint', category: '공동교육과정' },
    { rows: data.ONLINE_SLOTS, source: 'calculator-online', category: '온라인학교' },
  ].forEach(({ rows, source, category }) => {
    rows.forEach((slot) => {
      const info = semesterInfo(slot.semKey);
      (slot.subjects || []).forEach((subject) => {
        slotSubjects.push({
          id: subject.id,
          subjectName: subject.name,
          credits: subject.cr,
          required: false,
          elective: true,
          grade: info.grade,
          semester: info.semester,
          category: category || categoryFromSub(subject.sub),
          subjectGroup: slot.cat || '',
          active: true,
          source,
          sourceId: subject.id,
          slotId: slot.id,
          slotLabel: slot.label || '',
          originalSemester: slot.semKey || '',
        });
      });
    });
  });

  return [...required, ...slotSubjects];
}

function formValues(root) {
  return {
    subjectName: root.querySelector('#subjectName').value.trim(),
    credits: Number(root.querySelector('#credits').value || 0),
    required: root.querySelector('#required').checked,
    elective: root.querySelector('#elective').checked,
    grade: Number(root.querySelector('#grade').value || 0),
    semester: root.querySelector('#semester').value,
    category: root.querySelector('#category').value,
    subjectGroup: root.querySelector('#subjectGroup').value.trim(),
    slotId: root.querySelector('#slotId').value,
    active: root.querySelector('#active').checked,
  };
}

function setForm(root, subject = blank) {
  root.querySelector('#subjectId').value = subject.id || '';
  root.querySelector('#subjectName').value = subject.subjectName || subject.name || '';
  root.querySelector('#credits').value = subject.credits ?? subject.cr ?? 3;
  root.querySelector('#required').checked = Boolean(subject.required);
  root.querySelector('#elective').checked = subject.elective !== false;
  root.querySelector('#grade').value = subject.grade || 1;
  root.querySelector('#semester').value = subject.semester || '1';
  root.querySelector('#category').value = subject.category || '일반선택';
  root.querySelector('#subjectGroup').value = subject.subjectGroup || subject.cat || '';
  root.querySelector('#slotId').value = subject.slotId || '';
  root.querySelector('#active').checked = subject.active !== false;
}

function createSubjectId(subjectName, subjects) {
  const baseId = subjectName
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[/.#$[\]]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || `subject-${Date.now()}`;
  const existingIds = new Set(subjects.map((subject) => subject.id));

  if (!existingIds.has(baseId)) return baseId;

  let suffix = 2;
  while (existingIds.has(`${baseId}-${suffix}`)) suffix += 1;
  return `${baseId}-${suffix}`;
}

function subjectErrorMessage(error) {
  if (error?.code === 'permission-denied') {
    return '저장 권한이 없습니다. 관리자 계정과 배포된 Firestore 규칙을 확인해 주세요.';
  }
  if (error?.code === 'unavailable') {
    return '현재 Firestore에 연결할 수 없습니다. 네트워크 연결을 확인한 뒤 다시 시도해 주세요.';
  }
  return error?.message || '과목을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.';
}

function showSubjectStatus(root, message, type = 'success') {
  const status = root.querySelector('#subject-form-status');
  if (!status) return;
  status.textContent = message;
  status.className = `subject-form-status is-${type}`;
}

function slotOptions(subjects, currentSlotId = '') {
  const slots = new Map();
  subjects.forEach((subject) => {
    if (!subject.slotId || slots.has(subject.slotId)) return;
    slots.set(subject.slotId, {
      id: subject.slotId,
      label: subject.slotLabel || subject.slotId,
      grade: Number(subject.grade || 1),
      semester: String(subject.semester || '1'),
    });
  });

  if (currentSlotId && !slots.has(currentSlotId)) {
    slots.set(currentSlotId, { id: currentSlotId, label: currentSlotId, grade: 1, semester: '1' });
  }

  return [...slots.values()].sort((a, b) =>
    `${a.grade}-${a.semester}-${a.label}`.localeCompare(`${b.grade}-${b.semester}-${b.label}`, 'ko')
  );
}

function renderSlotOptions(subjects, currentSlotId = '') {
  return [
    '<option value="">자동 배치 / 편성 없음</option>',
    ...slotOptions(subjects, currentSlotId).map((slot) =>
      `<option value="${escapeHtml(slot.id)}"${slot.id === currentSlotId ? ' selected' : ''}>${escapeHtml(`${slot.grade}학년 ${slot.semester}학기 · ${slot.label}`)}</option>`
    ),
  ].join('');
}

function normalizeSubjectPlacement(payload, subjects) {
  const normalized = {
    ...payload,
    originalSemester: `y${payload.grade}s${String(payload.semester).split(',')[0]}`,
  };

  if (payload.required) {
    return {
      ...normalized,
      source: 'catalog-required',
      slotId: '',
      slotLabel: '',
    };
  }

  const isOnline = payload.category === '온라인학교';
  const isJoint = payload.category === '공동교육과정';
  if (isOnline || isJoint) {
    const source = isOnline ? 'catalog-online' : 'catalog-joint';
    const kind = isOnline ? '온라인학교' : '공동교육과정';
    const matching = subjects.find((subject) =>
      subject.slotId
      && subject.category === payload.category
      && Number(subject.grade) === Number(payload.grade)
      && String(subject.semester) === String(payload.semester)
    );
    return {
      ...normalized,
      source,
      slotId: matching?.slotId || `${isOnline ? 'Online' : 'Joint'}-y${payload.grade}s${String(payload.semester).split(',')[0]}`,
      slotLabel: matching?.slotLabel || `${kind} 선택 (${payload.grade}-${payload.semester})`,
    };
  }

  if (!payload.slotId) {
    throw new Error('일반 선택 과목은 실제로 표시될 편성 슬롯을 선택해 주세요.');
  }

  const selectedSlot = slotOptions(subjects, payload.slotId).find((slot) => slot.id === payload.slotId);
  return {
    ...normalized,
    grade: selectedSlot?.grade || payload.grade,
    semester: selectedSlot?.semester || payload.semester,
    originalSemester: `y${selectedSlot?.grade || payload.grade}s${String(selectedSlot?.semester || payload.semester).split(',')[0]}`,
    source: 'catalog-elective',
    slotLabel: selectedSlot?.label || payload.slotId,
  };
}

function filteredSubjects(subjects) {
  const keyword = filters.search.trim().toLowerCase();
  return subjects.filter((subject) => {
    const haystack = `${subject.subjectName || subject.name || ''} ${subject.id || ''} ${subject.subjectGroup || ''} ${subject.slotLabel || ''}`.toLowerCase();
    if (keyword && !haystack.includes(keyword)) return false;
    if (filters.category && subject.category !== filters.category) return false;
    if (filters.grade && String(subject.grade || '') !== filters.grade) return false;
    if (filters.status === 'active' && subject.active === false) return false;
    if (filters.status === 'inactive' && subject.active !== false) return false;
    return true;
  });
}

function sectionMeta(subject) {
  if (subject.source === 'calculator-required' || subject.required) {
    return {
      order: `0-${subject.grade || 0}-${subject.semester || 0}-${subject.subjectGroup || ''}`,
      title: `${subject.grade || '-'}학년 ${subject.semester || '-'}학기 학교지정 필수`,
      subtitle: subject.subjectGroup || '필수 과목',
    };
  }

  if (subject.slotId) {
    const sourceOrder = subject.category === '공동교육과정' ? 2 : subject.category === '온라인학교' ? 3 : 1;
    return {
      order: `${sourceOrder}-${subject.grade || 0}-${subject.semester || 0}-${subject.slotId}`,
      title: subject.slotLabel || `${subject.grade || '-'}학년 ${subject.semester || '-'}학기 선택 섹션`,
      subtitle: `${subject.slotId} · ${subject.subjectGroup || subject.category || '선택 과목'}`,
    };
  }

  return {
    order: `9-${subject.grade || 0}-${subject.semester || 0}-${subject.category || ''}`,
    title: `${subject.grade || '-'}학년 ${subject.semester || '-'}학기 직접 추가 과목`,
    subtitle: subject.category || '직접 추가',
  };
}

function groupSubjects(subjects) {
  const map = new Map();
  subjects.forEach((subject) => {
    const meta = sectionMeta(subject);
    const key = `${meta.title}|${meta.subtitle}`;
    if (!map.has(key)) map.set(key, { ...meta, subjects: [] });
    map.get(key).subjects.push(subject);
  });

  return [...map.values()]
    .sort((a, b) => a.order.localeCompare(b.order, 'ko'))
    .map((section) => ({
      ...section,
      subjects: section.subjects.sort((a, b) => String(a.id).localeCompare(String(b.id), 'ko')),
    }));
}

function renderSubjectRow(subject) {
  const name = escapeHtml(subject.subjectName || subject.name || '-');
  return `
    <tr data-subject-row="${escapeHtml(subject.id)}">
      <td>${escapeHtml(subject.id)}</td>
      <td>${name}</td>
      <td>${escapeHtml(subject.credits ?? subject.cr ?? '-')}</td>
      <td>${escapeHtml(subject.category || '-')}</td>
      <td>${escapeHtml(subject.subjectGroup || '-')}</td>
      <td>${escapeHtml(subject.grade || '-')}</td>
      <td>${escapeHtml(subject.semester || '-')}</td>
      <td><span class="badge ${subject.active === false ? 'warn' : 'ok'}">${subject.active === false ? '비활성' : '활성'}</span></td>
      <td>
        <button class="btn" data-edit="${escapeHtml(subject.id)}">수정</button>
        <button class="btn" data-toggle="${escapeHtml(subject.id)}">${subject.active === false ? '활성화' : '비활성화'}</button>
        <button class="btn danger" data-delete="${escapeHtml(subject.id)}">삭제</button>
      </td>
    </tr>
  `;
}

function renderInlineEditRow(subject, subjects) {
  const selected = (value, current) => String(value) === String(current) ? ' selected' : '';
  return `
    <tr class="subject-inline-edit-row" data-edit-row="${escapeHtml(subject.id)}">
      <td colspan="9">
        <div class="subject-inline-edit">
          <div class="subject-inline-edit-head">
            <strong>${escapeHtml(subject.id)} 과목 수정</strong>
            <span>변경할 내용을 입력한 뒤 저장하세요.</span>
          </div>
          <div class="subject-inline-fields">
            <label>과목명
              <input class="input" data-field="subjectName" value="${escapeHtml(subject.subjectName || subject.name || '')}" required>
            </label>
            <label>학점 수
              <input class="input" data-field="credits" type="number" min="0" value="${escapeHtml(subject.credits ?? subject.cr ?? 0)}">
            </label>
            <label>개설 학년
              <select class="select" data-field="grade">
                <option value="1"${selected(1, subject.grade || 1)}>1학년</option>
                <option value="2"${selected(2, subject.grade || 1)}>2학년</option>
                <option value="3"${selected(3, subject.grade || 1)}>3학년</option>
              </select>
            </label>
            <label>개설 학기
              <select class="select" data-field="semester">
                <option value="1"${selected('1', subject.semester || '1')}>1학기</option>
                <option value="2"${selected('2', subject.semester || '1')}>2학기</option>
                <option value="1,2"${selected('1,2', subject.semester || '1')}>1,2학기</option>
              </select>
            </label>
            <label>과목 분류
              <select class="select" data-field="category">
                ${CATEGORIES.map((category) => `<option${selected(category, subject.category)}>${escapeHtml(category)}</option>`).join('')}
              </select>
            </label>
            <label>교과군/영역
              <input class="input" data-field="subjectGroup" value="${escapeHtml(subject.subjectGroup || subject.cat || '')}">
            </label>
            <label>편성 슬롯
              <select class="select" data-field="slotId">
                ${renderSlotOptions(subjects, subject.slotId || '')}
              </select>
            </label>
            <label class="subject-inline-check"><span>필수 여부</span>
              <input data-field="required" type="checkbox"${subject.required ? ' checked' : ''}>
            </label>
            <label class="subject-inline-check"><span>선택 여부</span>
              <input data-field="elective" type="checkbox"${subject.elective !== false ? ' checked' : ''}>
            </label>
            <label class="subject-inline-check"><span>활성화</span>
              <input data-field="active" type="checkbox"${subject.active !== false ? ' checked' : ''}>
            </label>
          </div>
          <div class="subject-inline-actions">
            <button class="btn primary" data-save-edit="${escapeHtml(subject.id)}">저장</button>
            <button class="btn" data-cancel-edit="${escapeHtml(subject.id)}">취소</button>
          </div>
        </div>
      </td>
    </tr>
  `;
}

function inlineFormValues(editRow) {
  const field = (name) => editRow.querySelector(`[data-field="${name}"]`);
  return {
    subjectName: field('subjectName').value.trim(),
    credits: Number(field('credits').value || 0),
    required: field('required').checked,
    elective: field('elective').checked,
    grade: Number(field('grade').value || 0),
    semester: field('semester').value,
    category: field('category').value,
    subjectGroup: field('subjectGroup').value.trim(),
    slotId: field('slotId').value,
    active: field('active').checked,
  };
}

function renderGroupedSubjects(rows) {
  const sections = groupSubjects(rows);
  if (!sections.length) {
    return '<div class="empty">표시할 과목이 없습니다. 기존 계산기 과목 가져오기를 눌러 초기 데이터를 만들 수 있습니다.</div>';
  }

  return sections.map((section) => `
    <article class="subject-section">
      <div class="subject-section-head">
        <div>
          <h3>${escapeHtml(section.title)}</h3>
          <p>${escapeHtml(section.subtitle)}</p>
        </div>
        <span class="badge">${section.subjects.length}개</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>ID</th><th>과목명</th><th>학점</th><th>분류</th><th>교과군</th><th>학년</th><th>학기</th><th>상태</th><th>작업</th></tr></thead>
          <tbody>${section.subjects.map(renderSubjectRow).join('')}</tbody>
        </table>
      </div>
    </article>
  `).join('');
}

export async function renderSubjects(root, session) {
  const subjects = await getCollection('subjects');
  const rows = filteredSubjects(subjects);

  root.insertAdjacentHTML('beforeend', `
    <section class="section">
      <div class="section-head">
        <h2>과목 데이터 관리</h2>
        <span class="badge">${rows.length} / ${subjects.length}개</span>
      </div>
      <div class="toolbar" style="padding:14px 16px 0;">
        <button class="btn primary" id="import-calculator-subjects">기존 계산기 과목 가져오기</button>
        <input class="input" id="subject-search" placeholder="과목명, ID, 교과군, 섹션 검색" value="${escapeHtml(filters.search)}">
        <select class="select" id="filter-category">
          <option value="">전체 분류</option>
          ${CATEGORIES.map((category) => `<option>${category}</option>`).join('')}
        </select>
        <select class="select" id="filter-grade">
          <option value="">전체 학년</option><option value="1">1학년</option><option value="2">2학년</option><option value="3">3학년</option>
        </select>
        <select class="select" id="filter-status">
          <option value="">전체 상태</option><option value="active">활성</option><option value="inactive">비활성</option>
        </select>
      </div>
      <div class="subject-create">
        <div class="subject-create-head">
          <div>
            <h3>새 과목 추가</h3>
            <p>과목 정보를 입력한 뒤 아래의 파란색 버튼을 눌러 주세요.</p>
          </div>
        </div>
        <form class="form-grid subject-create-form" id="subject-form">
          <input type="hidden" id="subjectId">
          <label>과목명 <span class="required-mark">필수</span><input class="input" id="subjectName" required autocomplete="off" placeholder="예: 인공지능 기초"></label>
          <label>학점 수<input class="input" id="credits" type="number" min="0"></label>
          <label>개설 학년<select class="select" id="grade"><option value="1">1학년</option><option value="2">2학년</option><option value="3">3학년</option></select></label>
          <label>개설 학기<select class="select" id="semester"><option value="1">1학기</option><option value="2">2학기</option><option value="1,2">1,2학기</option></select></label>
          <label>과목 분류<select class="select" id="category">${CATEGORIES.map((category) => `<option>${category}</option>`).join('')}</select></label>
          <label>교과군/영역<input class="input" id="subjectGroup" placeholder="국어, 수학, 사회·과학 등"></label>
          <label>편성 슬롯<select class="select" id="slotId">${renderSlotOptions(subjects)}</select></label>
          <label class="subject-create-check"><span>필수 과목</span><input id="required" type="checkbox"></label>
          <label class="subject-create-check"><span>선택 과목</span><input id="elective" type="checkbox"></label>
          <label class="subject-create-check"><span>바로 활성화</span><input id="active" type="checkbox"></label>
          <div class="full subject-create-actions">
            <button class="btn subject-add-button" id="save-subject" type="submit">
              <span aria-hidden="true">＋</span> 과목 추가
            </button>
            <button class="btn" id="new-subject" type="button">입력 초기화</button>
            <p class="subject-form-status" id="subject-form-status" role="status" aria-live="polite"></p>
          </div>
        </form>
      </div>
      <div class="subject-sections">
        ${renderGroupedSubjects(rows)}
      </div>
    </section>
  `);

  setForm(root);
  root.querySelector('#filter-category').value = filters.category;
  root.querySelector('#filter-grade').value = filters.grade;
  root.querySelector('#filter-status').value = filters.status;

  root.querySelector('#import-calculator-subjects').addEventListener('click', async () => {
    const importButton = root.querySelector('#import-calculator-subjects');
    try {
      const calculatorSubjects = await loadCalculatorSubjects();
      if (!confirm(`기존 계산기 과목 ${calculatorSubjects.length}개를 Firestore subjects 컬렉션에 저장/갱신할까요?`)) return;
      importButton.disabled = true;
      importButton.textContent = '가져오는 중...';
      for (const subject of calculatorSubjects) {
        const { id, ...payload } = subject;
        await upsertDocument('subjects', id, payload);
      }
      try {
        await addLog(session.user.email, '기존 계산기 과목 가져오기', `${calculatorSubjects.length}개`);
      } catch (error) {
        console.warn('과목은 가져왔지만 활동 로그 기록에 실패했습니다.', error);
      }
      resetRoot(root);
      await renderSubjects(root, session);
    } catch (error) {
      console.error('기존 계산기 과목 가져오기 실패', error);
      importButton.disabled = false;
      importButton.textContent = '기존 계산기 과목 가져오기';
      alert(subjectErrorMessage(error));
    }
  });

  root.querySelector('#subject-search').addEventListener('input', (event) => {
    filters.search = event.target.value;
    resetRoot(root);
    renderSubjects(root, session);
  });

  ['category', 'grade', 'status'].forEach((name) => {
    root.querySelector(`#filter-${name}`).addEventListener('change', (event) => {
      filters[name] = event.target.value;
      resetRoot(root);
      renderSubjects(root, session);
    });
  });

  root.querySelector('#new-subject').addEventListener('click', () => {
    setForm(root);
    showSubjectStatus(root, '');
    root.querySelector('#subjectName').focus();
  });
  root.querySelector('#subject-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const rawPayload = formValues(root);
    const nameInput = root.querySelector('#subjectName');
    if (!rawPayload.subjectName) {
      nameInput.reportValidity();
      nameInput.focus();
      return;
    }

    const saveButton = root.querySelector('#save-subject');
    const id = root.querySelector('#subjectId').value || createSubjectId(rawPayload.subjectName, subjects);
    saveButton.disabled = true;
    saveButton.innerHTML = '<span class="button-spinner" aria-hidden="true"></span> 추가 중...';
    showSubjectStatus(root, 'Firestore에 과목을 저장하고 있습니다.', 'loading');

    try {
      const payload = normalizeSubjectPlacement(rawPayload, subjects);
      await upsertDocument('subjects', id, payload, session.user.email, '과목 추가');
      resetRoot(root);
      await renderSubjects(root, session);
      showSubjectStatus(root, `‘${payload.subjectName}’ 과목을 추가했습니다.`);
    } catch (error) {
      console.error('과목 추가 실패', error);
      saveButton.disabled = false;
      saveButton.innerHTML = '<span aria-hidden="true">＋</span> 과목 추가';
      showSubjectStatus(root, subjectErrorMessage(error), 'error');
    }
  });

  root.querySelectorAll('[data-edit]').forEach((button) => {
    button.addEventListener('click', () => {
      const subject = subjects.find((item) => item.id === button.dataset.edit);
      const subjectRow = button.closest('tr');
      if (!subject || !subjectRow) return;

      root.querySelector('.subject-inline-edit-row')?.remove();
      root.querySelector('.subject-row-editing')?.classList.remove('subject-row-editing');
      subjectRow.classList.add('subject-row-editing');
      subjectRow.insertAdjacentHTML('afterend', renderInlineEditRow(subject, subjects));

      const editRow = subjectRow.nextElementSibling;
      const nameInput = editRow.querySelector('[data-field="subjectName"]');
      nameInput.focus();
      nameInput.select();

      editRow.querySelector('[data-cancel-edit]').addEventListener('click', () => {
        editRow.remove();
        subjectRow.classList.remove('subject-row-editing');
        button.focus();
      });

      editRow.querySelector('[data-save-edit]').addEventListener('click', async (event) => {
        const rawPayload = inlineFormValues(editRow);
        if (!rawPayload.subjectName) {
          nameInput.reportValidity();
          nameInput.focus();
          return;
        }

        const saveButton = event.currentTarget;
        saveButton.disabled = true;
        editRow.querySelector('[data-cancel-edit]').disabled = true;
        try {
          const payload = normalizeSubjectPlacement(rawPayload, subjects);
          await upsertDocument('subjects', subject.id, payload, session.user.email, '과목 데이터 수정');
          resetRoot(root);
          await renderSubjects(root, session);
        } catch (error) {
          console.error('과목 수정 실패', error);
          saveButton.disabled = false;
          editRow.querySelector('[data-cancel-edit]').disabled = false;
          alert(subjectErrorMessage(error));
        }
      });
    });
  });

  root.querySelectorAll('[data-toggle]').forEach((button) => {
    button.addEventListener('click', async () => {
      const subject = subjects.find((item) => item.id === button.dataset.toggle);
      if (!subject) return;
      button.disabled = true;
      try {
        await updateDocument('subjects', subject.id, { active: subject.active === false }, session.user.email, '과목 비활성화/활성화');
        resetRoot(root);
        await renderSubjects(root, session);
      } catch (error) {
        console.error('과목 활성 상태 변경 실패', error);
        button.disabled = false;
        alert(subjectErrorMessage(error));
      }
    });
  });

  root.querySelectorAll('[data-delete]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!confirm('과목을 삭제할까요?')) return;
      button.disabled = true;
      try {
        await removeDocument('subjects', button.dataset.delete, session.user.email, '과목 삭제');
        resetRoot(root);
        await renderSubjects(root, session);
      } catch (error) {
        console.error('과목 삭제 실패', error);
        button.disabled = false;
        alert(subjectErrorMessage(error));
      }
    });
  });
}
