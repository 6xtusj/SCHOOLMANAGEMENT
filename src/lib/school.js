export const LEVELS = ['JSS 1', 'JSS 2', 'JSS 3', 'SS 1', 'SS 2', 'SS 3'];
export const SENIOR_LEVELS = ['SS 2', 'SS 3'];
export const TRACKS = ['Science', 'Art', 'Commercial'];
export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
export const TERMS = ['First Term', 'Second Term', 'Third Term'];

export const naira = (n) =>
  '₦' + Math.round(Number(n) || 0).toLocaleString('en-NG');

export const GRADE_SCALE = [
  { min: 75, grade: 'A1', remark: 'Excellent' },
  { min: 70, grade: 'B2', remark: 'Very Good' },
  { min: 65, grade: 'B3', remark: 'Good' },
  { min: 60, grade: 'C4', remark: 'Credit' },
  { min: 55, grade: 'C5', remark: 'Credit' },
  { min: 50, grade: 'C6', remark: 'Credit' },
  { min: 45, grade: 'D7', remark: 'Pass' },
  { min: 40, grade: 'E8', remark: 'Pass' },
  { min: 0, grade: 'F9', remark: 'Fail' },
];

export const gradeOf = (total) => GRADE_SCALE.find((g) => Number(total) >= g.min) || GRADE_SCALE[GRADE_SCALE.length - 1];

export const sumScore = (r, weights) =>
  Math.round(
    (Number(r.ca) || 0) + (Number(r.assignment_score) || 0) + (Number(r.test) || 0) + (Number(r.exam) || 0),
    weights ? 0 : 0
  );

export const today = () => new Date().toISOString().slice(0, 10);

export const items = (res) => (Array.isArray(res) ? res : res?.items || []);

export const sortArms = (arms) =>
  [...arms].sort(
    (a, b) =>
      (LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level)) ||
      (a.track || '').localeCompare(b.track || '') ||
      (a.arm || '').localeCompare(b.arm || '')
  );

// A subject is available in a class arm when its level list covers the arm's
// level, and (for senior classes with a track) the subject serves that track.
export const subjectAvailableForArm = (subject, arm) => {
  if (!subject || !arm) return false;
  const levels = subject.levels || [];
  if (levels.length && !levels.includes(arm.level)) return false;
  if (arm.track) {
    const tracks = subject.tracks || [];
    if (tracks.length && !tracks.includes(arm.track)) return false;
  }
  return true;
};

export const billingFor = (student, fees, session, term) =>
  (fees || [])
    .filter((f) => (!f.session || f.session === session) && (!f.term || f.term === term))
    .filter((f) => !f.level || f.level === student.level)
    .filter((f) => !f.track || f.track === student.track)
    .reduce((sum, f) => sum + (Number(f.amount) || 0), 0);

export const paidFor = (payments) =>
  (payments || []).reduce((sum, p) => {
    const amount = Number(p.amount) || 0;
    return p.type === 'refund' || p.type === 'reversal' ? sum - amount : sum + amount;
  }, 0);