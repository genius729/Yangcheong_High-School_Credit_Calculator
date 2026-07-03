// 양청고 학번 규칙을 기반으로 학번과 현재 학년을 계산합니다.
export function extractStudentId(email = '') {
  return email.split('@')[0] || '';
}

// 첫 두 자리를 입학 연도 마지막 두 자리로 보고 현재 연도 기준 학년을 계산합니다.
export function detectGradeFromStudentId(studentId, currentYear = new Date().getFullYear()) {
  const entranceSuffix = Number(String(studentId).slice(0, 2));
  if (!Number.isInteger(entranceSuffix)) return null;

  const entranceYear = 2000 + entranceSuffix;
  const grade = currentYear - entranceYear + 1;

  if (grade < 1 || grade > 3) return null;
  return grade;
}

// 이메일에서 프로필 카드에 필요한 학생 정보를 한 번에 만듭니다.
export function buildStudentProfile(user, currentYear = new Date().getFullYear()) {
  const email = user?.email || '';
  const studentId = extractStudentId(email);
  const grade = detectGradeFromStudentId(studentId, currentYear);

  return {
    uid: user?.uid || '',
    name: user?.displayName || '이름 없음',
    email,
    photoURL: user?.photoURL || '',
    studentId,
    grade,
  };
}
