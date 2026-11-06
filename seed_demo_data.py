from __future__ import annotations

import json
import os
import re
import uuid
from datetime import date, datetime, timedelta
from hashlib import sha256
from pathlib import Path

from werkzeug.security import generate_password_hash

os.environ.setdefault('SCHOOL_DB_PATH', str(Path(__file__).with_name('school_demo.db')))
import app as school_app

DB_PATH = school_app.DB_PATH
DEMO_PASSWORD = 'DemoSchool2026!'
NAMESPACE = uuid.UUID('4a5e04b0-4530-41fb-8d61-e2c8a07bd779')
TODAY = date.today().isoformat()
NOW = school_app.now()
CREATED: dict[str, int] = {}


def stable_id(kind: str, key: str) -> str:
    return str(uuid.uuid5(NAMESPACE, f'{kind}:{key}'))


def add_count(kind: str) -> None:
    CREATED[kind] = CREATED.get(kind, 0) + 1


def ensure_record(conn, entity: str, key: str, data: dict) -> str:
    rid = stable_id(entity, key)
    row = conn.execute('SELECT id FROM records WHERE id=? AND entity=?', (rid, entity)).fetchone()
    if row:
        return rid
    stamp = school_app.now()
    conn.execute('INSERT INTO records(id,entity,data,created_date,updated_date) VALUES(?,?,?,?,?)', (rid, entity, json.dumps(data), stamp, stamp))
    add_count(entity)
    return rid


def ensure_account(conn, email: str, name: str, role: str) -> str:
    row = conn.execute('SELECT id FROM auth_users WHERE lower(email)=?', (email.lower(),)).fetchone()
    uid = row['id'] if row else stable_id('auth', email)
    hashed = generate_password_hash(DEMO_PASSWORD)
    if row:
        conn.execute('UPDATE auth_users SET password_hash=?,full_name=?,role=?,account_status=? WHERE id=?', (hashed, name, role, 'active', uid))
    else:
        conn.execute('INSERT INTO auth_users(id,email,password_hash,full_name,role,account_status,created_date) VALUES(?,?,?,?,?,?,?)', (uid, email, hashed, name, role, 'active', school_app.now()))
        add_count('auth_users')
    ensure_record(conn, 'User', email, {'email': email, 'full_name': name, 'role': role, 'account_status': 'active', 'demo_account': True})
    return uid


def ensure_workflow_row(conn, table: str, key: str, columns: tuple[str, ...], values: tuple) -> str:
    rid = stable_id(table, key)
    existing = conn.execute(f'SELECT id FROM {table} WHERE id=?', (rid,)).fetchone()
    if existing:
        return rid
    placeholders = ','.join('?' for _ in columns)
    conn.execute(f"INSERT INTO {table}(id,{','.join(columns)}) VALUES(?,{placeholders})", (rid, *values))
    add_count(table)
    return rid


def main() -> None:
    school_app.init_db()

    roles = {
        'principal': ('demo.principal@school.test', 'Demo Principal', 'principal'),
        'teacher1': ('demo.teacher1@school.test', 'Demo Teacher One', 'teacher'),
        'teacher2': ('demo.teacher2@school.test', 'Demo Teacher Two', 'teacher'),
        'teacher3': ('demo.teacher3@school.test', 'Demo Teacher Three', 'teacher'),
        'bursar': ('demo.bursar@school.test', 'Demo Bursar', 'bursar'),
        'librarian': ('demo.librarian@school.test', 'Demo Librarian', 'librarian'),
        'parent1': ('demo.parent1@school.test', 'Demo Parent One', 'parent'),
        'parent2': ('demo.parent2@school.test', 'Demo Parent Two', 'parent'),
        'parent3': ('demo.parent3@school.test', 'Demo Parent Three', 'parent'),
    }
    for index in range(1, 7):
        roles[f'student{index}'] = (f'demo.student{index}@school.test', f'Demo Student {index}', 'student')

    with school_app.db() as conn:
        account_ids = {key: ensure_account(conn, *details) for key, details in roles.items()}

        settings_row = conn.execute("SELECT data FROM records WHERE entity='SchoolSettings' ORDER BY updated_date DESC LIMIT 1").fetchone()
        settings = json.loads(settings_row['data']) if settings_row else {}
        session_name = str(settings.get('session') or '2026/2027')
        term_name = str(settings.get('term') or 'First Term')
        session_row = conn.execute('SELECT id FROM academic_sessions WHERE name=?', (session_name,)).fetchone()
        if not session_row:
            session_id = stable_id('academic-session', session_name)
            conn.execute('INSERT INTO academic_sessions(id,name,starts_on,ends_on,created_by,created_at) VALUES(?,?,?,?,?,?)', (session_id, session_name, None, None, account_ids['principal'], NOW))
            add_count('academic_sessions')
        else:
            session_id = session_row['id']
        term_row = conn.execute('SELECT id FROM academic_terms WHERE session_id=? AND name=?', (session_id, term_name)).fetchone()
        if not term_row:
            term_id = stable_id('academic-term', f'{session_name}:{term_name}')
            conn.execute('INSERT INTO academic_terms(id,session_id,name,is_active,status,created_by,created_at) VALUES(?,?,?,?,?,?,?)', (term_id, session_id, term_name, 1, 'open', account_ids['principal'], NOW))
            conn.execute('UPDATE academic_terms SET is_active=0 WHERE id<>?', (term_id,))
            add_count('academic_terms')
        else:
            term_id = term_row['id']
        for extra_term in ('Second Term', 'Third Term'):
            exists = conn.execute('SELECT id FROM academic_terms WHERE session_id=? AND name=?', (session_id, extra_term)).fetchone()
            if not exists:
                tid = stable_id('academic-term', f'{session_name}:{extra_term}')
                conn.execute('INSERT INTO academic_terms(id,session_id,name,is_active,status,created_by,created_at) VALUES(?,?,?,?,?,?,?)', (tid, session_id, extra_term, 0, 'planned', account_ids['principal'], NOW))
                add_count('academic_terms')

        year_match = re.match(r'\s*(\d{4})', session_name)
        current_start_year = int(year_match.group(1)) if year_match else date.today().year
        history_periods = []
        for offset in (2, 1):
            start_year = current_start_year - offset
            historical_session = f'{start_year}/{start_year + 1}'
            historical_session_id = stable_id('academic-session', historical_session)
            conn.execute('INSERT OR IGNORE INTO academic_sessions(id,name,starts_on,ends_on,created_by,created_at) VALUES(?,?,?,?,?,?)', (historical_session_id, historical_session, None, None, account_ids['principal'], NOW))
            for historical_term in ('First Term', 'Second Term', 'Third Term'):
                historical_term_id = stable_id('academic-term', f'{historical_session}:{historical_term}')
                conn.execute('INSERT OR IGNORE INTO academic_terms(id,session_id,name,is_active,status,created_by,created_at) VALUES(?,?,?,?,?,?,?)', (historical_term_id, historical_session_id, historical_term, 0, 'finished', account_ids['principal'], NOW))
                history_periods.append((historical_session, historical_term, historical_session_id, historical_term_id))

        arm_specs = [
            ('jss1', 'JSS 1', 'DEMO-A', '', 'DEMO JSS 1A'),
            ('jss2', 'JSS 2', 'DEMO-B', '', 'DEMO JSS 2B'),
            ('ss2_art', 'SS 2', 'DEMO-C', 'Art', 'DEMO SS 2 Art C'),
        ]
        arms = {}
        for key, level, arm_name, track, display in arm_specs:
            matching = conn.execute("SELECT id FROM records WHERE entity='ClassArm' AND json_extract(data,'$.display_name')=?", (display,)).fetchone()
            arm_id = matching['id'] if matching else stable_id('ClassArm', key)
            arms[key] = {'id': arm_id, 'level': level, 'arm': arm_name, 'track': track, 'display_name': display}
            if not matching:
                ensure_record(conn, 'ClassArm', key, {**arms[key], 'order': 900 + len(arms), 'active': True, 'demo': True})

        subject_rows = conn.execute("SELECT id,data FROM records WHERE entity='Subject'").fetchall()
        subjects = {json.loads(row['data']).get('name'): row['id'] for row in subject_rows}
        required_subjects = {
            'Mathematics': {'levels': ['JSS 1', 'JSS 2', 'SS 2'], 'tracks': []},
            'English Studies': {'levels': ['JSS 1', 'JSS 2', 'SS 2'], 'tracks': []},
            'Basic Science': {'levels': ['JSS 1'], 'tracks': []},
            'French': {'levels': ['JSS 2'], 'tracks': []},
            'Literature-in-English': {'levels': ['SS 2'], 'tracks': ['Art']},
            'Government': {'levels': ['SS 2'], 'tracks': ['Art']},
        }
        for name, metadata in required_subjects.items():
            if name in subjects:
                continue
            sid = ensure_record(conn, 'Subject', f'DEMO {name}', {'name': name, 'code': f'DEMO-{name[:3].upper()}', 'levels': metadata['levels'], 'tracks': metadata['tracks'], 'compulsory': True, 'active': True, 'demo': True})
            subjects[name] = sid

        staff_specs = [
            ('principal', 'principal', 'Demo Principal'),
            ('teacher1', 'teacher', 'Demo Teacher One'),
            ('teacher2', 'teacher', 'Demo Teacher Two'),
            ('teacher3', 'teacher', 'Demo Teacher Three'),
            ('bursar', 'bursar', 'Demo Bursar'),
            ('librarian', 'librarian', 'Demo Librarian'),
        ]
        staff_ids = {}
        for key, role, name in staff_specs:
            email = roles[key][0]
            staff_ids[key] = ensure_record(conn, 'StaffProfile', email, {'full_name': name, 'email': email, 'phone': f'08000000{len(staff_ids)+1:03d}', 'gender': 'Female' if key in ('teacher2', 'librarian') else 'Male', 'role': role, 'active': True, 'demo': True})

        parent_keys = ['parent1', 'parent2', 'parent3']
        student_specs = []
        for class_index, class_key in enumerate(('jss1', 'jss2', 'ss2_art')):
            for within in (0, 1):
                index = class_index * 2 + within + 1
                student_specs.append((index, class_key, parent_keys[class_index]))
        students = {}
        for index, class_key, parent_key in student_specs:
            email, name, _ = roles[f'student{index}']
            parent_email = roles[parent_key][0]
            arm = arms[class_key]
            admission_no = f"{settings.get('school_initials') or 'DEMO'}/2026/DEMO{index:03d}"
            data = {'full_name': name, 'gender': 'Female' if index % 2 == 0 else 'Male', 'date_of_birth': f'{2011 + index % 5}-0{index % 8 + 1}-15', 'admission_date': TODAY, 'admission_no': admission_no, 'level': arm['level'], 'track': arm['track'], 'class_arm_id': arm['id'], 'class_arm_name': arm['display_name'], 'status': 'Active', 'guardian_name': roles[parent_key][1], 'guardian_phone': f'08000001{index:03d}', 'guardian_email': parent_email, 'user_email': email, 'address': 'Demo Street, Enugu', 'demo': True}
            student_id = ensure_record(conn, 'Student', email, data)
            students[index] = {'id': student_id, 'email': email, 'name': name, 'admission_no': admission_no, 'class_key': class_key, 'arm': arm, 'parent_key': parent_key}
            ensure_record(conn, 'PortalProfile', email, {'email': email, 'full_name': name, 'role': 'student', 'demo': True})

        teacher_class = {'teacher1': 'jss1', 'teacher2': 'jss2', 'teacher3': 'ss2_art'}
        for teacher_key, class_key in teacher_class.items():
            email, name, _ = roles[teacher_key]
            arm = arms[class_key]
            ensure_record(conn, 'Assignment', f'form:{email}:{arm["id"]}', {'type': 'form', 'teacher_email': email, 'teacher_name': name, 'class_arm_id': arm['id'], 'class_arm_name': arm['display_name'], 'demo': True})

        subject_plan = {
            'jss1': [('Mathematics', 'teacher1'), ('English Studies', 'teacher2'), ('Basic Science', 'teacher3')],
            'jss2': [('Mathematics', 'teacher2'), ('English Studies', 'teacher3'), ('French', 'teacher1')],
            'ss2_art': [('Mathematics', 'teacher3'), ('Literature-in-English', 'teacher1'), ('Government', 'teacher2')],
        }
        class_subjects = {}
        for class_key, assignments in subject_plan.items():
            arm = arms[class_key]
            class_subjects[class_key] = []
            for subject_name, teacher_key in assignments:
                teacher_email, teacher_name, _ = roles[teacher_key]
                subject_id = subjects[subject_name]
                class_subjects[class_key].append(subject_name)
                ensure_record(conn, 'Assignment', f'subject:{arm["id"]}:{subject_id}', {'type': 'subject', 'teacher_email': teacher_email, 'teacher_name': teacher_name, 'class_arm_id': arm['id'], 'class_arm_name': arm['display_name'], 'subject_id': subject_id, 'subject_name': subject_name, 'demo': True})

        for class_key, names in class_subjects.items():
            arm = arms[class_key]
            scope = school_app.canonical_class_scope(conn, arm['id'])
            current_rules = conn.execute('SELECT COUNT(*) AS n FROM subject_rules WHERE class_key=?', (scope,)).fetchone()['n']
            if not current_rules:
                for position, name in enumerate(names):
                    requirement = 'optional' if position == len(names) - 1 else 'compulsory'
                    conn.execute('INSERT INTO subject_rules(id,class_key,subject_id,requirement,created_by,updated_at) VALUES(?,?,?,?,?,?)', (stable_id('rule', f'{scope}:{name}'), scope, subjects[name], requirement, account_ids['principal'], school_app.now()))
                    add_count('subject_rules')
            limit_row = conn.execute('SELECT class_key FROM optional_subject_limits WHERE class_key=?', (scope,)).fetchone()
            if not limit_row:
                conn.execute('INSERT INTO optional_subject_limits(class_key,mode,min_count,max_count,updated_by,updated_at) VALUES(?,?,?,?,?,?)', (scope, 'fixed', 1, 1, account_ids['principal'], school_app.now()))
                add_count('optional_subject_limits')

        for class_key, names in class_subjects.items():
            arm = arms[class_key]
            scope = school_app.canonical_class_scope(conn, arm['id'])
            for week in (1, 2):
                for name in names:
                    topic_key = f'{class_key}:{name}:week{week}'
                    rid = stable_id('syllabus', topic_key)
                    conn.execute('INSERT OR IGNORE INTO syllabus_topics(id,subject_id,class_key,session_id,term_id,title,notes,status,created_by,created_at,week_number) VALUES(?,?,?,?,?,?,?,?,?,?,?)', (rid, subjects[name], scope, session_id, term_id, f'DEMO Week {week}: {name} foundations', 'Seed content for teacher progress testing.', 'not_started', account_ids['principal'], school_app.now(), week))
                    if conn.execute('SELECT changes()').fetchone()[0]: add_count('syllabus_topics')

        class_fee_sums = {}
        fee_ids = {}
        for class_key, subjects_for_class in class_subjects.items():
            arm = arms[class_key]
            level, track = arm['level'], arm['track']
            class_fee_sums[class_key] = 0
            component_fees = [('DEMO Tuition', 45000), ('DEMO ICT Levy', 3500), ('DEMO Sports Fee', 2500)]
            for fee_name, amount in component_fees:
                key = f'{class_key}:{fee_name}'
                data = {'name': fee_name, 'amount': amount, 'level': level, 'track': track, 'class_arm_id': arm['id'], 'class_arm_name': arm['display_name'], 'session': session_name, 'term': term_name, 'category': 'school_fee', 'pay_once_per_term': True, 'demo': True}
                fee_ids[key] = ensure_record(conn, 'FeeItem', key, data)
                class_fee_sums[class_key] += amount
            other_name = 'DEMO Practical Lab Fee'
            other_data = {'name': other_name, 'amount': 1800, 'level': level, 'track': track, 'class_arm_id': arm['id'], 'class_arm_name': arm['display_name'], 'session': session_name, 'term': term_name, 'category': 'other_fee', 'pay_once_per_term': False, 'deadline': '2026-11-20', 'penalty_type': 'extra_fee', 'penalty_amount': 250, 'demo': True}
            fee_ids[f'{class_key}:{other_name}'] = ensure_record(conn, 'FeeItem', f'{class_key}:{other_name}', other_data)

        for class_key in class_fee_sums:
            representative = next(student for student in students.values() if student['class_key'] == class_key)
            student_row = conn.execute('SELECT id,data FROM records WHERE id=? AND entity=\'Student\'', (representative['id'],)).fetchone()
            student_data = json.loads(student_row['data']); student_data['_record_id'] = student_row['id']
            class_fee_sums[class_key] = sum(float(fee.get('amount') or 0) for fee in school_app.fee_items_for_student(conn, student_data, session_name, term_name, 'school_fee'))

        for historical_session, historical_term, historical_session_id, historical_term_id in history_periods:
            for class_key, class_students in {
                key: [(index, student) for index, student in students.items() if student['class_key'] == key]
                for key in arms
            }.items():
                arm = arms[class_key]
                ensure_record(conn, 'FeeItem', f'{historical_session}:{historical_term}:{class_key}:DEMO Archive Tuition', {
                    'name': 'DEMO Archive Tuition', 'amount': 42000, 'level': arm['level'], 'track': arm['track'],
                    'class_arm_id': arm['id'], 'class_arm_name': arm['display_name'], 'session': historical_session,
                    'term': historical_term, 'category': 'school_fee', 'pay_once_per_term': True,
                    'installments_allowed': True, 'demo': True,
                })
                for index, student in class_students:
                    historic_payment = {
                        'student_id': student['id'], 'student_name': student['name'], 'admission_no': student['admission_no'],
                        'class_arm_name': arm['display_name'], 'amount': 42000 if index % 2 else 16000,
                        'fee_id': 'school_fees', 'fee_name': 'School fees', 'fee_category': 'school_fee',
                        'method': 'Transfer', 'reference': f'DEMO-ARCHIVE-{historical_session.replace("/", "")}-{index:03d}-{historical_term.split()[0].upper()}',
                        'session': historical_session, 'term': historical_term, 'paid_on': f'{historical_session[:4]}-11-15',
                        'type': 'payment', 'receipt_no': f'DEMO-OLD-{historical_session[:4]}-{index:03d}-{historical_term[:1]}',
                        'recorded_by': 'Demo Bursary', 'demo': True,
                    }
                    ensure_record(conn, 'Payment', f'archive-payment:{student["id"]}:{historical_session}:{historical_term}', historic_payment)
                    ensure_record(conn, 'Attendance', f'archive-attendance:{student["id"]}:{historical_session}:{historical_term}', {
                        'student_id': student['id'], 'student_name': student['name'], 'class_arm_id': arm['id'],
                        'class_arm_name': arm['display_name'], 'date': f'{historical_session[:4]}-10-12',
                        'status': 'present', 'session': historical_session, 'term': historical_term,
                        'recorded_by': 'Demo Teacher', 'demo': True,
                    })
                    for subject_name in class_subjects[class_key]:
                        ensure_record(conn, 'Result', f'archive-result:{student["id"]}:{subjects[subject_name]}:{historical_session}:{historical_term}', {
                            'student_id': student['id'], 'student_name': student['name'], 'admission_no': student['admission_no'],
                            'class_arm_id': arm['id'], 'class_arm_name': arm['display_name'], 'level': arm['level'],
                            'subject_id': subjects[subject_name], 'subject_name': subject_name, 'session': historical_session,
                            'term': historical_term, 'ca': 18, 'assignment_score': 9, 'test': 8, 'exam': 55,
                            'total': 90, 'grade': 'A1', 'status': 'published', 'demo': True,
                        })

        for index, student in students.items():
            arm = student['arm']; class_key = student['class_key']; parent_email = roles[student['parent_key']][0]
            if index % 2 == 1:
                payment_data = {'student_id': student['id'], 'student_name': student['name'], 'student_email': student['email'], 'guardian_email': parent_email, 'admission_no': student['admission_no'], 'class_arm_name': arm['display_name'], 'track': arm['track'], 'amount': class_fee_sums[class_key], 'fee_id': 'school_fees', 'fee_name': 'School fees', 'fee_category': 'school_fee', 'method': 'Transfer', 'reference': f'DEMO-PAID-{index:03d}', 'session': session_name, 'term': term_name, 'paid_on': TODAY, 'type': 'payment', 'receipt_no': f'DEMO-RCPT-{index:03d}', 'recorded_by': 'Demo Bursary', 'demo': True}
                payment_id = ensure_record(conn, 'Payment', f'schoolfee-paid:{student["id"]}:{session_name}:{term_name}', payment_data)
                saved_payment = conn.execute('SELECT data FROM records WHERE id=? AND entity=\'Payment\'', (payment_id,)).fetchone()
                saved_data = json.loads(saved_payment['data'])
                if saved_data.get('demo') and float(saved_data.get('amount') or 0) != float(class_fee_sums[class_key]):
                    saved_data['amount'] = class_fee_sums[class_key]
                    conn.execute('UPDATE records SET data=?,updated_date=? WHERE id=?', (json.dumps(saved_data), school_app.now(), payment_id))
            else:
                receipt_key = f'schoolfee-pending:{student["id"]}:{session_name}:{term_name}'
                rid = stable_id('fee-payment-submission', receipt_key)
                conn.execute('INSERT OR IGNORE INTO fee_payment_submissions(id,student_id,student_name,amount,paid_on,reference,receipt_uri,session,term,submitted_by,submitted_at,fee_id,fee_name,fee_category,class_arm_name,admission_no) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', (rid, student['id'], student['name'], class_fee_sums[class_key], TODAY, f'DEMO-PENDING-{index:03d}', '/uploads/DEMO_Science_Reading.txt', session_name, term_name, account_ids[student['parent_key']], school_app.now(), 'school_fees', 'School fees', 'school_fee', arm['display_name'], student['admission_no']))
                if conn.execute('SELECT changes()').fetchone()[0]: add_count('fee_payment_submissions')
                else:
                    conn.execute("UPDATE fee_payment_submissions SET amount=? WHERE id=? AND status='pending' AND fee_category='school_fee'", (class_fee_sums[class_key], rid))

            sports_id = fee_ids[f'{class_key}:DEMO Practical Lab Fee']
            if index == 2:
                rid = stable_id('fee-payment-submission', f'other-pending:{student["id"]}:{sports_id}')
                conn.execute('INSERT OR IGNORE INTO fee_payment_submissions(id,student_id,student_name,amount,paid_on,reference,receipt_uri,session,term,submitted_by,submitted_at,fee_id,fee_name,fee_category,class_arm_name,admission_no) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', (rid, student['id'], student['name'], 1800, TODAY, 'DEMO-LAB-PENDING', '/uploads/DEMO_Science_Reading.txt', session_name, term_name, account_ids[student['parent_key']], school_app.now(), sports_id, 'DEMO Practical Lab Fee', 'other_fee', arm['display_name'], student['admission_no']))
                if conn.execute('SELECT changes()').fetchone()[0]: add_count('fee_payment_submissions')

            ensure_record(conn, 'Attendance', f'attendance:{student["id"]}:{TODAY}', {'student_id': student['id'], 'student_name': student['name'], 'student_email': student['email'], 'guardian_email': parent_email, 'class_arm_id': arm['id'], 'class_arm_name': arm['display_name'], 'date': TODAY, 'status': 'absent' if index % 3 == 0 else ('late' if index % 3 == 1 else 'present'), 'session': session_name, 'term': term_name, 'recorded_by': roles[{'jss1':'teacher1','jss2':'teacher2','ss2_art':'teacher3'}[class_key]][1], 'demo': True})

            for position, subject_name in enumerate(class_subjects[class_key]):
                assignment = next(a for a in subject_plan[class_key] if a[0] == subject_name)
                teacher_email, teacher_name, _ = roles[assignment[1]]
                ca, assignment_score, test, exam = 16, 8, 8, 50 + (index % 9)
                total = ca + assignment_score + test + exam
                result_key = f'{student["id"]}:{subjects[subject_name]}:{session_name}:{term_name}'
                result_data = {'student_id': student['id'], 'student_name': student['name'], 'student_email': student['email'], 'guardian_email': parent_email, 'admission_no': student['admission_no'], 'class_arm_id': arm['id'], 'class_arm_name': arm['display_name'], 'level': arm['level'], 'subject_id': subjects[subject_name], 'subject_name': subject_name, 'session': session_name, 'term': term_name, 'ca': ca, 'assignment_score': assignment_score, 'test': test, 'exam': exam, 'total': total, 'grade': 'A1' if total >= 75 else 'B2', 'teacher_email': teacher_email, 'status': 'submitted', 'demo': True}
                result_id = ensure_record(conn, 'Result', result_key, result_data)
                review_id = stable_id('result-review', result_id)
                conn.execute('INSERT OR IGNORE INTO result_reviews(id,result_record_id,class_key,subject_id,teacher_id,status,created_at) VALUES(?,?,?,?,?,?,?)', (review_id, result_id, arm['id'], subjects[subject_name], account_ids[assignment[1]], 'submitted', school_app.now()))
                if conn.execute('SELECT changes()').fetchone()[0]: add_count('result_reviews')

        for class_key, assignments in subject_plan.items():
            arm = arms[class_key]
            for weekday, day in enumerate(('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday')):
                for slot, (subject_name, teacher_key) in enumerate(assignments):
                    start_hour = 8 + slot
                    start_time = f'{start_hour:02d}:00'
                    end_time = f'{start_hour:02d}:45'
                    teacher_email, teacher_name, _ = roles[teacher_key]
                    key = f'{class_key}:{day}:{subject_name}'
                    ensure_record(conn, 'TimetableEntry', key, {'class_arm_id': arm['id'], 'class_arm_name': arm['display_name'], 'subject_id': subjects[subject_name], 'subject_name': subject_name, 'teacher_email': teacher_email, 'teacher_name': teacher_name, 'day': day, 'start_time': start_time, 'end_time': end_time, 'room': f'DEMO-{class_key.upper()}', 'demo': True})

        book_specs = [
            ('DEMO Mathematics Workbook', 'Demo Department', 'Mathematics', 'JSS 1', 'Shelf DEMO-1', 4),
            ('DEMO English Reading Book', 'Demo Department', 'English Studies', 'JSS 2', 'Shelf DEMO-2', 3),
            ('DEMO Introductory Biology', 'Demo Science Department', 'Biology', 'SS 2', 'Shelf DEMO-3', 2),
            ('DEMO Art and Design', 'Demo Arts Department', 'Visual Arts/Music', 'SS 2', 'Shelf DEMO-4', 3),
        ]
        books = {}
        for title, author, subject_name, level, shelf, copies in book_specs:
            book_id = ensure_record(conn, 'LibraryBook', title, {'title': title, 'author': author, 'isbn': f'DEMO-{len(books)+1:04d}', 'category': 'Textbook', 'level': level, 'subject_name': subject_name, 'shelf': shelf, 'copies_total': copies, 'copies_available': copies, 'active': True, 'notes': 'Fictional demo catalogue item.'})
            books[title] = book_id

        first_student = students[1]
        book_title = 'DEMO Mathematics Workbook'
        book_id = books[book_title]
        loan_key = f'{first_student["id"]}:{book_id}'
        loan_id = stable_id('LibraryLoan', loan_key)
        conn.execute('INSERT OR IGNORE INTO records(id,entity,data,created_date,updated_date) VALUES(?,?,?,?,?)', (loan_id, 'LibraryLoan', json.dumps({'book_id': book_id, 'book_title': book_title, 'member_email': first_student['email'], 'member_name': first_student['name'], 'guardian_email': roles[first_student['parent_key']][0], 'member_type': 'student', 'class_arm_name': first_student['arm']['display_name'], 'issued_on': TODAY, 'due_on': (date.today()+timedelta(days=14)).isoformat(), 'status': 'issued', 'recorded_by': 'Demo Librarian', 'note': 'DEMO loan for testing.'}), NOW, NOW))
        if conn.execute('SELECT changes()').fetchone()[0]:
            add_count('LibraryLoan')
            book_record = conn.execute('SELECT data FROM records WHERE id=? AND entity=?', (book_id, 'LibraryBook')).fetchone()
            book_data = json.loads(book_record['data']); book_data['copies_available'] = max(0, int(book_data.get('copies_available', 1))-1)
            conn.execute('UPDATE records SET data=?,updated_date=? WHERE id=?', (json.dumps(book_data), school_app.now(), book_id))

        resource_titles = []
        for class_key, names in class_subjects.items():
            arm = arms[class_key]
            subject_name = names[0]
            title = f'DEMO {arm["level"]} {subject_name} Revision Pack'
            resource_titles.append(title)
            ensure_record(conn, 'ResourceItem', title, {'title': title, 'author': 'Demo Subject Department', 'category': 'book', 'subject_name': subject_name, 'subject_id': subjects[subject_name], 'level': arm['level'], 'class_arm_id': arm['id'], 'file_uri': '/uploads/DEMO_Science_Reading.txt', 'file_name': 'DEMO_Science_Reading.txt', 'uploaded_by': 'Demo Administration', 'status': 'approved', 'demo': True})
        pending_resource = {'title': 'DEMO Pending Teacher Science Notes', 'author': roles['teacher3'][1], 'category': 'syllabus', 'subject_name': 'Basic Science', 'subject_id': subjects['Basic Science'], 'level': arms['jss1']['level'], 'class_arm_id': arms['jss1']['id'], 'file_uri': '/uploads/DEMO_Science_Reading.txt', 'file_name': 'DEMO_Science_Reading.txt', 'uploaded_by': roles['teacher3'][1], 'status': 'pending', 'demo': True}
        ensure_record(conn, 'ResourceItem', 'DEMO Pending Teacher Science Notes', pending_resource)

        ensure_record(conn, 'Notice', 'DEMO Welcome Notice', {'title': 'DEMO: Welcome to the school portal', 'body': 'This notice is sample content for testing student, parent and staff dashboards.', 'audience': 'all', 'author': 'Demo Administration', 'published_on': TODAY, 'demo': True})
        ensure_record(conn, 'CalendarEvent', 'DEMO Midterm Assessment', {'title': 'DEMO Midterm Assessment', 'date': (date.today()+timedelta(days=5)).isoformat(), 'type': 'exam', 'level': '', 'description': 'Sample exam timetable event for portal testing.', 'demo': True})

        principal_id = account_ids['principal']
        sample_class = arms['jss1']
        sample_subject_id = subjects['Basic Science']
        curriculum_id = stable_id('curriculum-document', 'DEMO JSS1 Basic Science Outline')
        conn.execute('INSERT OR IGNORE INTO curriculum_documents(id,title,subject_id,class_key,session_id,term_id,file_uri,file_name,uploaded_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)', (curriculum_id, 'DEMO JSS 1 Basic Science Outline', sample_subject_id, school_app.canonical_class_scope(conn, sample_class['id']), session_id, term_id, '/uploads/DEMO_Science_Reading.txt', 'DEMO_Science_Reading.txt', principal_id, school_app.now()))
        if conn.execute('SELECT changes()').fetchone()[0]: add_count('curriculum_documents')

        fee_proposal_id = stable_id('approval', 'DEMO Proposed Excursion Fee')
        fee_payload = {'operation': 'create', 'name': 'DEMO Proposed Excursion Fee', 'amount': 750, 'level': 'JSS 1', 'track': '', 'class_arm_id': arms['jss1']['id'], 'class_arm_name': arms['jss1']['display_name'], 'category': 'other_fee', 'session': session_name, 'term': term_name, 'deadline': (date.today()+timedelta(days=10)).isoformat(), 'penalty_type': 'none'}
        conn.execute('INSERT OR IGNORE INTO approval_requests(id,kind,payload_json,status,requested_by,requested_at) VALUES(?,?,?,?,?,?)', (fee_proposal_id, 'fee_change', json.dumps(fee_payload), 'pending', account_ids['bursar'], school_app.now()))
        if conn.execute('SELECT changes()').fetchone()[0]: add_count('approval_requests')
        salary_proposal_id = stable_id('approval', 'DEMO Salary Payment Request')
        salary_payload = {'staff_id': staff_ids['teacher1'], 'staff_name': roles['teacher1'][1], 'amount': 250000, 'paid_on': TODAY, 'method': 'Transfer', 'period': date.today().strftime('%B %Y')}
        conn.execute('INSERT OR IGNORE INTO approval_requests(id,kind,payload_json,status,requested_by,requested_at) VALUES(?,?,?,?,?,?)', (salary_proposal_id, 'salary_payment', json.dumps(salary_payload), 'pending', account_ids['bursar'], school_app.now()))
        if conn.execute('SELECT changes()').fetchone()[0]: add_count('approval_requests')

        profile_approval_id = stable_id('approval', 'DEMO Approved Salary Profile')
        conn.execute('INSERT OR IGNORE INTO approval_requests(id,kind,payload_json,status,requested_by,requested_at,reviewed_by,reviewed_at) VALUES(?,?,?,?,?,?,?,?)', (profile_approval_id, 'salary_change', json.dumps({'staff_id': staff_ids['teacher1'], 'staff_name': roles['teacher1'][1], 'amount': 250000, 'effective_date': TODAY}), 'approved', account_ids['bursar'], school_app.now(), principal_id, school_app.now()))
        conn.execute('INSERT OR IGNORE INTO salary_profiles(id,staff_id,staff_name,salary_amount,effective_from,approval_id,approved_by,created_at) VALUES(?,?,?,?,?,?,?,?)', (stable_id('salary-profile', 'DEMO Teacher One'), staff_ids['teacher1'], roles['teacher1'][1], 250000, TODAY, profile_approval_id, principal_id, school_app.now()))
        payment_approval_id = stable_id('approval', 'DEMO Processed Salary Payment')
        conn.execute('INSERT OR IGNORE INTO approval_requests(id,kind,payload_json,status,requested_by,requested_at,reviewed_by,reviewed_at) VALUES(?,?,?,?,?,?,?,?)', (payment_approval_id, 'salary_payment', json.dumps({'staff_id': staff_ids['teacher1'], 'staff_name': roles['teacher1'][1], 'amount': 250000, 'paid_on': TODAY, 'method': 'Transfer', 'period': date.today().strftime('%B %Y')}), 'completed', account_ids['bursar'], school_app.now(), principal_id, school_app.now()))
        conn.execute('INSERT OR IGNORE INTO salary_payment_records(id,approval_id,staff_id,staff_name,amount,paid_on,method,period,processed_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)', (stable_id('salary-payment', 'DEMO Teacher One November 2026'), payment_approval_id, staff_ids['teacher1'], roles['teacher1'][1], 250000, TODAY, 'Transfer', date.today().strftime('%B %Y'), account_ids['bursar'], school_app.now()))
        for month_offset in range(1, 7):
            paid_date = date.today().replace(day=1) - timedelta(days=month_offset * 30)
            period = paid_date.strftime('%B %Y')
            old_payment_approval_id = stable_id('approval', f'DEMO Historical Salary Payment:{period}')
            conn.execute('INSERT OR IGNORE INTO approval_requests(id,kind,payload_json,status,requested_by,requested_at,reviewed_by,reviewed_at) VALUES(?,?,?,?,?,?,?,?)', (old_payment_approval_id, 'salary_payment', json.dumps({'staff_id': staff_ids['teacher1'], 'staff_name': roles['teacher1'][1], 'amount': 250000, 'paid_on': paid_date.isoformat(), 'method': 'Transfer', 'period': period}), 'completed', account_ids['bursar'], school_app.now(), principal_id, school_app.now()))
            conn.execute('INSERT OR IGNORE INTO salary_payment_records(id,approval_id,staff_id,staff_name,amount,paid_on,method,period,processed_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)', (stable_id('salary-payment', f'DEMO Teacher One:{period}'), old_payment_approval_id, staff_ids['teacher1'], roles['teacher1'][1], 250000, paid_date.isoformat(), 'Transfer', period, account_ids['bursar'], school_app.now()))

        application_id = stable_id('admission-application', 'DEMO Entrance Exam Applicant')
        print_token = 'DEMO-LOCAL-ADMISSION-PRINT-TOKEN'
        application_data = {
            'student_name': 'Demo Admission Applicant', 'date_of_birth': '2012-04-15', 'gender': 'Female',
            'requested_level': arms['jss1']['level'], 'requested_track': '', 'guardian_name': 'Demo Guardian',
            'guardian_phone': '08000000000', 'guardian_email': 'demo.guardian@school.test',
            'address': 'Demo address for local workflow testing', 'previous_school': 'Demo Primary School',
            'previous_class': 'Primary 6',
        }
        conn.execute('INSERT OR IGNORE INTO admission_applications(id,reference,print_token_hash,application_json,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)', (
            application_id, 'DEMO-ADMISSION-001', sha256(print_token.encode()).hexdigest(),
            json.dumps(application_data), 'submitted', NOW, NOW,
        ))
        if conn.execute('SELECT changes()').fetchone()[0]: add_count('admission_applications')

        for index, student in students.items():
            staff_role = {'teacher1': 'teacher1', 'teacher2': 'teacher2', 'teacher3': 'teacher3'}
            teacher_key = {'jss1': 'teacher1', 'jss2': 'teacher2', 'ss2_art': 'teacher3'}[student['class_key']]
            attendance_id = stable_id('staff-attendance', f'{teacher_key}:{TODAY}')
            conn.execute('INSERT OR IGNORE INTO staff_attendance(id,staff_id,staff_name,attendance_date,status,arrival_time,session_id,term_id,recorded_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)', (attendance_id, staff_ids[teacher_key], roles[teacher_key][1], TODAY, 'Present', '07:45', session_id, term_id, account_ids['principal'], school_app.now()))

        conn.commit()

    print(f'Demo dataset ready in {DB_PATH}')
    print('The script is idempotent: existing DEMO rows and workflow progress are preserved; no non-demo rows are deleted.')
    print('Session / active term:', session_name, '/', term_name)
    print('Demo class arms:')
    for arm in arms.values(): print(' -', arm['display_name'], arm['id'])
    print('Demo login credentials (all accounts share the same password):')
    for key, (email, name, role) in roles.items(): print(f' - {role:9} {name:20} {email}')
    print('Password:', DEMO_PASSWORD)
    print('Created or updated fixture counts:', json.dumps(CREATED, sort_keys=True))


if __name__ == '__main__':
    main()
