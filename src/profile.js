// Google 사용자 정보와 학번/학년 정보를 화면 표시용 문구로 정리합니다.
export function formatGrade(grade) {
  return grade ? `${grade}학년` : '학년 확인 필요';
}

export function getProfileViewModel(profile) {
  return {
    name: profile?.name || '이름 없음',
    email: profile?.email || '',
    studentId: profile?.studentId || '-',
    gradeText: formatGrade(profile?.grade),
    photoURL: profile?.photoURL || '',
  };
}
