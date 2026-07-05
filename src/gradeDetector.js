// 양청고 학번 규칙을 기반으로 학번과 현재 학년을 계산합니다.
export function extractStudentId(email = '') {
  return email.split('@')[0] || '';
}

// 앞 두 자리 접두값은 제외하고, 세 번째 자리를 현재 학년으로 사용합니다.
export function detectGradeFromStudentId(studentId) {
  const grade = Number(String(studentId).charAt(2));

  if (grade < 1 || grade > 3) return null;
  return grade;
}

// 이메일에서 프로필 카드에 필요한 학생 정보를 한 번에 만듭니다.
export function buildStudentProfile(user) {
  const email = user?.email || '';
  const studentId = extractStudentId(email);
  const grade = detectGradeFromStudentId(studentId);

  return {
    uid: user?.uid || '',
    name: user?.displayName || '이름 없음',
    email,
    photoURL: user?.photoURL || '',
    studentId,
    grade,
  };
}
