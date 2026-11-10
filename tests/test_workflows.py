import json
import os
import tempfile
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch

_test_database = tempfile.TemporaryDirectory(prefix='school-workflow-tests-')
os.environ['SCHOOL_DB_PATH'] = str(Path(_test_database.name) / 'tests.db')

import app
from werkzeug.security import generate_password_hash


class WorkflowTests(unittest.TestCase):
    password = 'LocalTest123!'

    def setUp(self):
        with app.db() as conn:
            tables = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").fetchall()
            for row in tables:
                if row['name'] not in ('auth_users', 'school_security_settings', 'schema_migrations'):
                    conn.execute(f'DELETE FROM "{row["name"]}"')
            conn.execute("DELETE FROM auth_users WHERE lower(email) <> 'admin@school.local'")
        app.init_db()
        self.client = app.app.test_client()
        self.add_account('principal@school.test', 'principal')

    def add_account(self, email, role):
        user_id = str(uuid.uuid4())
        with app.db() as conn:
            conn.execute(
                'INSERT INTO auth_users(id,email,password_hash,full_name,role,account_status,created_date) VALUES(?,?,?,?,?,?,?)',
                (user_id, email, generate_password_hash(self.password), role.title(), role, 'active', app.now()),
            )
        return user_id

    def login(self, email='admin@school.local', password='Admin123!'):
        response = self.client.post('/api/auth/login', json={'email': email, 'password': password})
        self.assertEqual(response.status_code, 200, response.get_json())
        return response

    def configure_smtp(self):
        response = self.client.put('/api/admin/email-settings', json={
            'provider': 'smtp',
            'sender_email': 'office@school.test',
            'smtp_host': 'smtp.school.test',
            'smtp_port': 587,
            'smtp_tls': True,
            'smtp_user': '',
        })
        self.assertEqual(response.status_code, 200, response.get_json())

    @staticmethod
    def add_record(conn, entity, data, record_id=None):
        record_id = record_id or str(uuid.uuid4())
        stamp = app.now()
        conn.execute(
            'INSERT INTO records(id,entity,data,created_date,updated_date) VALUES(?,?,?,?,?)',
            (record_id, entity, json.dumps(data), stamp, stamp),
        )
        return record_id

    def test_financial_approvals_are_principal_only(self):
        requests = [
            ('fee_change', {'operation': 'create', 'name': 'Test fee', 'amount': 100, 'category': 'other_fee'}),
            ('salary_payment', {'staff_id': 'staff-1', 'amount': 1000}),
        ]
        request_ids = []
        with app.db() as conn:
            for kind, payload in requests:
                request_id = str(uuid.uuid4())
                request_ids.append(request_id)
                conn.execute(
                    'INSERT INTO approval_requests(id,kind,payload_json,requested_by,requested_at) VALUES(?,?,?,?,?)',
                    (request_id, kind, json.dumps(payload), 'bursary-user', app.now()),
                )

        self.login()
        for request_id in request_ids:
            response = self.client.post(f'/api/approvals/{request_id}/decision', json={'decision': 'approved'})
            self.assertEqual(response.status_code, 403)

        self.client.post('/api/auth/logout')
        self.login('principal@school.test', self.password)
        for request_id in request_ids:
            response = self.client.post(f'/api/approvals/{request_id}/decision', json={'decision': 'approved'})
            self.assertEqual(response.status_code, 200, response.get_json())

    def test_receipt_and_school_account_decisions_are_principal_only(self):
        receipt_id = str(uuid.uuid4())
        account_id = str(uuid.uuid4())
        stamp = app.now()
        with app.db() as conn:
            conn.execute(
                'INSERT INTO fee_payment_submissions(id,student_id,student_name,amount,paid_on,receipt_uri,session,term,submitted_by,submitted_at,fee_id,fee_name,fee_category) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
                (receipt_id, 'student-1', 'Test Student', 100, '2026-01-01', '/uploads/receipt.pdf', '2026/2027', 'First Term', 'parent-1', stamp, 'school_fees', 'School fees', 'school_fee'),
            )
            conn.execute(
                'INSERT INTO school_payment_accounts(id,bank_name,account_name,account_number,purpose,instructions,status,submitted_by,submitted_at) VALUES(?,?,?,?,?,?,?,?,?)',
                (account_id, 'Test Bank', 'Test School', '1234567890', 'school_fees', '', 'pending', 'bursary-1', stamp),
            )

        self.login()
        receipt_decision = self.client.post(f'/api/fee-payment-submissions/{receipt_id}/decision', json={'decision': 'rejected'})
        account_decision = self.client.post(f'/api/finance/school-accounts/{account_id}/decision', json={'decision': 'approved'})
        self.assertEqual(receipt_decision.status_code, 403)
        self.assertEqual(account_decision.status_code, 403)

        self.client.post('/api/auth/logout')
        self.login('principal@school.test', self.password)
        receipt_decision = self.client.post(f'/api/fee-payment-submissions/{receipt_id}/decision', json={'decision': 'rejected'})
        account_decision = self.client.post(f'/api/finance/school-accounts/{account_id}/decision', json={'decision': 'approved'})
        self.assertEqual(receipt_decision.status_code, 200, receipt_decision.get_json())
        self.assertEqual(account_decision.status_code, 200, account_decision.get_json())

    def test_user_role_cannot_be_invited(self):
        self.login()
        response = self.client.post('/api/users/invite', json={'email': 'new.user@school.test', 'role': 'user'})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json()['error'], 'Invalid portal role.')

    def test_portal_directory_backfills_accounts_with_login_only(self):
        auth_id = self.add_account('directory-only@school.test', 'teacher')
        self.login()
        response = self.client.get('/api/admin/portal-accounts?q=directory-only%40school.test')
        self.assertEqual(response.status_code, 200, response.get_json())
        payload = response.get_json()
        self.assertEqual(payload['total'], 1)
        account = payload['items'][0]
        self.assertEqual(account['email'], 'directory-only@school.test')
        self.assertEqual(account['role'], 'teacher')
        self.assertEqual(account['account_status'], 'active')
        self.assertNotEqual(account['id'], auth_id)
        with app.db() as conn:
            record = conn.execute(
                "SELECT data FROM records WHERE entity='User' AND lower(json_extract(data,'$.email'))=?",
                ('directory-only@school.test',),
            ).fetchone()
            self.assertIsNotNone(record)
            self.assertEqual(json.loads(record['data'])['role'], 'teacher')
        updated = self.client.patch(
            f"/api/entities/User/{account['id']}",
            json={'account_status': 'deactivated'},
        )
        self.assertEqual(updated.status_code, 200, updated.get_json())
        with app.db() as conn:
            auth = conn.execute('SELECT account_status FROM auth_users WHERE id=?', (auth_id,)).fetchone()
            self.assertEqual(auth['account_status'], 'deactivated')

    def test_bursary_data_endpoints_load_for_bursar(self):
        self.add_account('bursar@school.test', 'bursar')
        self.login('bursar@school.test', self.password)
        paths = (
            '/api/entities/FeeItem?limit=300',
            '/api/entities/Payment?limit=300',
            '/api/entities/StaffPayment?limit=300',
            '/api/entities/Student?limit=500',
            '/api/entities/StaffProfile?limit=300',
            '/api/academic/sessions',
            '/api/entities/ClassArm?limit=500',
        )
        for path in paths:
            with self.subTest(path=path):
                response = self.client.get(path)
                self.assertEqual(response.status_code, 200, response.get_json())

    def test_notification_preferences_control_email_dispatch(self):
        user_id = self.add_account('parent@school.test', 'parent')
        self.login('parent@school.test', self.password)
        response = self.client.get('/api/notifications/preferences')
        self.assertEqual(response.status_code, 200)
        defaults = response.get_json()
        self.assertTrue(defaults['email_enabled'])
        self.assertTrue(defaults['categories']['finance'])

        categories = defaults['categories']
        categories['finance'] = False
        response = self.client.put('/api/notifications/preferences', json={
            'email_enabled': True,
            'categories': categories,
        })
        self.assertEqual(response.status_code, 200, response.get_json())

        with patch.object(app, 'send_mail', return_value=(True, None)) as send_mail:
            self.assertFalse(app.notify_user(user_id, 'finance', 'Test', 'Test message'))
            send_mail.assert_not_called()
            self.assertTrue(app.notify_user(user_id, 'notices', 'Test', 'Test message'))
            send_mail.assert_called_once_with('parent@school.test', 'Test', 'Test message')

    def test_approval_request_notifies_principal_with_configured_email(self):
        self.add_account('bursar@school.test', 'bursar')
        self.login('bursar@school.test', self.password)
        with patch.object(app, 'send_mail', return_value=(True, None)) as send_mail:
            response = self.client.post('/api/approvals', json={
                'kind': 'fee_change',
                'payload': {'operation': 'create', 'name': 'Test fee', 'amount': 100},
            })
        self.assertEqual(response.status_code, 201, response.get_json())
        self.assertEqual(send_mail.call_count, 1)
        self.assertEqual(send_mail.call_args.args[0], 'principal@school.test')

    def test_school_logo_upload_is_publicly_readable(self):
        filename = f'test-logo-{uuid.uuid4().hex}.png'
        path = app.UPLOAD_DIR / filename
        app.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b'local-logo-test')
        try:
            with app.db() as conn:
                self.add_record(conn, 'SchoolSettings', {'school_logo': f'/uploads/{filename}'})
            response = self.client.get(f'/uploads/{filename}')
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.data, b'local-logo-test')
            response.close()
        finally:
            path.unlink(missing_ok=True)

    def test_branded_email_includes_school_details_and_inline_logo(self):
        logo_name = f'test-email-logo-{uuid.uuid4().hex}.png'
        logo_path = app.UPLOAD_DIR / logo_name
        logo_path.write_bytes(b'local-logo-test')
        try:
            message = app.branded_email_message(
                'family@school.test',
                'Portal invitation',
                'Welcome to Example School.\n\n<script>alert(1)</script>\n\nActivate your account: https://school.test/register?token=abc',
                {
                    'SCHOOL_NAME': 'Example School',
                    'SCHOOL_LOGO': f'/uploads/{logo_name}',
                    'SCHOOL_ADDRESS': '1 School Road',
                    'SCHOOL_PHONE': '08000000000',
                    'SCHOOL_EMAIL': 'office@school.test',
                    'SMTP_FROM': 'office@school.test',
                },
                action_label='Access your school portal',
            )
            rendered = message.as_string()
            html_content = next(part.get_content() for part in message.walk() if part.get_content_type() == 'text/html')
            self.assertIn('Example School · Official School Communication', html_content)
            self.assertIn('1 School Road · 08000000000 · office@school.test', html_content)
            self.assertIn('Content-ID: <school-logo>', rendered)
            self.assertIn('Access your school portal', html_content)
            self.assertIn('https://school.test/register?token=abc', html_content)
            self.assertNotIn('<script>', html_content)
            self.assertIn('&lt;script&gt;', html_content)
            text_content = next(part.get_content() for part in message.walk() if part.get_content_type() == 'text/plain')
            self.assertIn('Welcome to Example School.', text_content)
            self.assertEqual(message['From'], 'Example School <office@school.test>')
        finally:
            logo_path.unlink(missing_ok=True)

    def test_admin_test_email_uses_saved_branding_and_records_delivery(self):
        with app.db() as conn:
            self.add_record(conn, 'SchoolSettings', {
                'school_name': 'Example School',
                'public_base_url': 'https://school.test',
            })
        self.login()
        self.configure_smtp()
        with patch.dict(os.environ, {'PUBLIC_BASE_URL': ''}), patch.object(app.smtplib, 'SMTP') as smtp:
            server = smtp.return_value.__enter__.return_value
            server.send_message.return_value = {}
            response = self.client.post('/api/admin/email-test', json={'email': 'office@school.test'})
        self.assertEqual(response.status_code, 200, response.get_json())
        sent_message = server.send_message.call_args.args[0]
        self.assertEqual(sent_message['From'], 'Example School <office@school.test>')
        self.assertIn('https://school.test/login', sent_message.get_body(preferencelist=('plain',)).get_content())
        with app.db() as conn:
            log = conn.execute('SELECT recipient,subject,status,error FROM email_delivery_logs ORDER BY created_at DESC LIMIT 1').fetchone()
        self.assertEqual(log['recipient'], 'office@school.test')
        self.assertEqual(log['status'], 'sent')
        self.assertIsNone(log['error'])
        self.assertEqual(self.client.get('/api/admin/email-deliveries').status_code, 200)

        self.client.post('/api/auth/logout')
        self.login('principal@school.test', self.password)
        self.assertEqual(self.client.get('/api/admin/email-deliveries').status_code, 403)

    def test_admin_test_email_exposes_smtp_failure_in_delivery_history(self):
        with app.db() as conn:
            self.add_record(conn, 'SchoolSettings', {
                'school_name': 'Example School',
                'public_base_url': 'https://school.test',
            })
        self.login()
        self.configure_smtp()
        with patch.dict(os.environ, {'PUBLIC_BASE_URL': ''}), patch.object(app.smtplib, 'SMTP') as smtp:
            smtp.return_value.__enter__.return_value.send_message.side_effect = RuntimeError('relay rejected')
            response = self.client.post('/api/admin/email-test', json={'email': 'office@school.test'})
        self.assertEqual(response.status_code, 502)
        self.assertIn('relay rejected', response.get_json()['error'])
        delivery = self.client.get('/api/admin/email-deliveries').get_json()[0]
        self.assertEqual(delivery['status'], 'failed')
        self.assertIn('relay rejected', delivery['error'])

    def test_smtp_recipient_rejection_is_logged_as_failure(self):
        with app.db() as conn:
            self.add_record(conn, 'SchoolSettings', {
                'school_name': 'Example School',
                'public_base_url': 'https://school.test',
            })
        self.login()
        self.configure_smtp()
        with patch.dict(os.environ, {'PUBLIC_BASE_URL': ''}), patch.object(app.smtplib, 'SMTP') as smtp:
            smtp.return_value.__enter__.return_value.send_message.return_value = {
                'office@school.test': (550, b'recipient rejected'),
            }
            response = self.client.post('/api/admin/email-test', json={'email': 'office@school.test'})
        self.assertEqual(response.status_code, 502)
        delivery = self.client.get('/api/admin/email-deliveries').get_json()[0]
        self.assertEqual(delivery['status'], 'failed')
        self.assertIn('recipient rejected', delivery['error'])

    def test_email_provider_credentials_are_encrypted_and_admin_only(self):
        self.login()
        response = self.client.put('/api/admin/email-settings', json={
            'provider': 'brevo',
            'sender_email': 'office@school.test',
            'brevo_api_key': 'test-brevo-secret',
        })
        self.assertEqual(response.status_code, 200, response.get_json())
        settings = self.client.get('/api/admin/email-settings')
        self.assertEqual(settings.status_code, 200)
        self.assertTrue(settings.get_json()['has_brevo_api_key'])
        self.assertNotIn('test-brevo-secret', settings.get_data(as_text=True))
        with app.db() as conn:
            encrypted = conn.execute('SELECT config_encrypted FROM email_provider_config WHERE id=1').fetchone()[0]
            self.assertNotIn('test-brevo-secret', encrypted)
            settings_id = self.add_record(conn, 'SchoolSettings', {
                'school_name': 'Example School',
                'smtp_password': 'legacy-secret',
            })
        self.assertNotIn('legacy-secret', self.client.get('/api/entities/SchoolSettings').get_data(as_text=True))
        rejected_legacy_write = self.client.patch(
            f'/api/entities/SchoolSettings/{settings_id}',
            json={'smtp_password': 'new-legacy-secret'},
        )
        self.assertEqual(rejected_legacy_write.status_code, 400)
        self.client.post('/api/auth/logout')
        self.login('principal@school.test', self.password)
        self.assertEqual(self.client.get('/api/admin/email-settings').status_code, 403)

    def test_existing_smtp_settings_are_migrated_out_of_school_settings(self):
        with app.db() as conn:
            self.add_record(conn, 'SchoolSettings', {
                'school_name': 'Example School',
                'smtp_host': 'smtp.school.test',
                'smtp_user': 'office@school.test',
                'smtp_password': 'legacy-smtp-secret',
                'smtp_from': 'office@school.test',
            })
        app.init_db()
        with app.db() as conn:
            settings = json.loads(conn.execute("SELECT data FROM records WHERE entity='SchoolSettings'").fetchone()[0])
            encrypted = conn.execute('SELECT config_encrypted FROM email_provider_config WHERE id=1').fetchone()[0]
        self.assertNotIn('smtp_password', settings)
        self.assertNotIn('legacy-smtp-secret', encrypted)
        migrated = app._email_config_cipher().decrypt(encrypted.encode()).decode()
        self.assertIn('legacy-smtp-secret', migrated)
        self.assertEqual(app.smtp_config()['SMTP_FROM'], 'office@school.test')

    def test_brevo_and_resend_api_delivery(self):
        self.login()
        for provider, key, credential in (
            ('brevo', 'brevo_api_key', 'test-brevo-secret'),
            ('resend', 'resend_api_key', 'test-resend-secret'),
        ):
            with self.subTest(provider=provider):
                response = self.client.put('/api/admin/email-settings', json={
                    'provider': provider,
                    'sender_email': 'office@school.test',
                    key: credential,
                })
                self.assertEqual(response.status_code, 200, response.get_json())
                with patch.object(app, '_provider_http_request', return_value=b'{}') as http_request:
                    sent, error = app.send_mail('family@school.test', 'Test subject', 'Test body')
                self.assertTrue(sent, error)
                self.assertEqual(http_request.call_args.args[0], (
                    'https://api.brevo.com/v3/smtp/email' if provider == 'brevo' else 'https://api.resend.com/emails'
                ))
                self.assertIn(credential, repr(http_request.call_args.args[2]))
                self.assertIn('Test body', http_request.call_args.args[1].decode())

    def test_gmail_api_refreshes_oauth_token_and_sends_message(self):
        self.login()
        response = self.client.put('/api/admin/email-settings', json={
            'provider': 'gmail',
            'sender_email': 'office@school.test',
            'gmail_client_id': 'test-client-id',
            'gmail_client_secret': 'test-client-secret',
            'gmail_refresh_token': 'test-refresh-token',
        })
        self.assertEqual(response.status_code, 200, response.get_json())
        with patch.object(app, '_provider_http_request', side_effect=(b'{"access_token":"short-lived-token"}', b'{}')) as http_request:
            sent, error = app.send_mail('family@school.test', 'Test subject', 'Test body')
        self.assertTrue(sent, error)
        self.assertEqual(http_request.call_args_list[0].args[0], 'https://oauth2.googleapis.com/token')
        self.assertEqual(http_request.call_args_list[1].args[0], 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send')
        self.assertIn('short-lived-token', http_request.call_args_list[1].args[2]['Authorization'])

    def test_public_url_validation_requires_https_in_production(self):
        with patch.dict(os.environ, {'APP_ENV': 'production'}):
            self.assertIsNone(app.validate_public_base_url('https://school.test'))
            self.assertIn('HTTPS', app.validate_public_base_url('http://school.test'))
            self.assertIsNotNone(app.validate_public_base_url('https://school.test/portal'))

    def test_school_settings_saves_and_validates_public_application_url(self):
        with app.db() as conn:
            settings_id = self.add_record(conn, 'SchoolSettings', {'school_name': 'Example School'})
        self.login()
        response = self.client.patch(
            f'/api/entities/SchoolSettings/{settings_id}',
            json={'public_base_url': 'https://school.test'},
        )
        self.assertEqual(response.status_code, 200, response.get_json())
        self.assertEqual(response.get_json()['public_base_url'], 'https://school.test')
        with patch.dict(os.environ, {'APP_ENV': 'production'}):
            response = self.client.patch(
                f'/api/entities/SchoolSettings/{settings_id}',
                json={'public_base_url': 'http://school.test'},
            )
        self.assertEqual(response.status_code, 400)
        self.assertIn('HTTPS', response.get_json()['error'])

    def test_render_external_url_is_used_when_no_public_url_is_saved(self):
        with patch.dict(os.environ, {
            'APP_ENV': 'production',
            'RENDER_EXTERNAL_URL': 'https://school-example.onrender.com',
            'PUBLIC_BASE_URL': '',
        }):
            with app.app.test_request_context('/'), patch.object(app, 'send_mail', return_value=(True, None)):
                invitation = app.make_invitation('render-user', 'family@school.test', 'parent')
                self.assertEqual(app.public_base_url(), 'https://school-example.onrender.com')
                self.assertTrue(invitation['invite_url'].startswith('https://school-example.onrender.com/register?invite='))

    def test_saved_public_url_precedes_render_external_url(self):
        with app.db() as conn:
            self.add_record(conn, 'SchoolSettings', {'public_base_url': 'https://school.example.org'})
        with patch.dict(os.environ, {
            'APP_ENV': 'production',
            'RENDER_EXTERNAL_URL': 'https://school-example.onrender.com',
            'PUBLIC_BASE_URL': '',
        }):
            with app.app.test_request_context('/'):
                self.assertEqual(app.public_base_url(), 'https://school.example.org')

    def test_production_database_requires_and_uses_unique_admin_bootstrap(self):
        with tempfile.TemporaryDirectory(prefix='school-production-bootstrap-') as temp_dir:
            with patch.object(app, 'DB_PATH', Path(temp_dir) / 'production.db'), patch.dict(
                os.environ,
                {
                    'APP_ENV': 'production',
                    'INITIAL_ADMIN_EMAIL': 'owner@school.test',
                    'INITIAL_ADMIN_PASSWORD': 'UniqueProductionPass123!',
                    'INITIAL_ADMIN_NAME': 'School Owner',
                },
            ):
                app.init_db()
                with app.db() as conn:
                    admin = conn.execute(
                        'SELECT email,password_hash,full_name FROM auth_users WHERE lower(email)=?',
                        ('owner@school.test',),
                    ).fetchone()
                    self.assertIsNotNone(admin)
                    self.assertEqual(admin['full_name'], 'School Owner')
                    self.assertTrue(app.check_password_hash(admin['password_hash'], 'UniqueProductionPass123!'))
                    self.assertFalse(app.check_password_hash(admin['password_hash'], 'Admin123!'))

    def test_health_endpoint_checks_database(self):
        response = self.client.get('/healthz')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {'status': 'ok'})

    def test_bursary_can_send_detailed_fee_reminders(self):
        self.add_account('bursar@school.test', 'bursar')
        self.add_account('family@school.test', 'parent')
        student_id = str(uuid.uuid4())
        with app.db() as conn:
            self.add_record(conn, 'SchoolSettings', {'session': '2026/2027', 'term': 'First Term'})
            self.add_record(conn, 'Student', {
                'full_name': 'Test Student', 'level': 'JSS 1', 'status': 'Active',
                'guardian_email': 'family@school.test',
            }, student_id)
            self.add_record(conn, 'FeeItem', {
                'name': 'Tuition', 'amount': 25000, 'level': 'JSS 1',
                'session': '2026/2027', 'term': 'First Term', 'category': 'school_fee',
            })
        self.login('bursar@school.test', self.password)
        with patch.object(app, 'send_mail', return_value=(True, None)) as send_mail:
            response = self.client.post('/api/bursary/fee-reminders', json={})
        self.assertEqual(response.status_code, 200, response.get_json())
        self.assertEqual(response.get_json()['reminders_sent'], 1)
        send_mail.assert_called_once()
        self.assertIn('2026/2027', send_mail.call_args.args[2])
        self.assertIn('First Term', send_mail.call_args.args[2])
        self.assertIn('NGN 25,000.00', send_mail.call_args.args[2])

    def test_installments_require_fee_policy_and_cannot_exceed_balance(self):
        student_id = str(uuid.uuid4())
        fee_id = str(uuid.uuid4())
        with app.db() as conn:
            self.add_record(conn, 'Student', {
                'full_name': 'Test Student', 'level': 'JSS 1', 'class_arm_id': 'arm-1',
                'status': 'Active',
            }, student_id)
            self.add_record(conn, 'FeeItem', {
                'name': 'Test lab fee', 'amount': 1000, 'level': 'JSS 1',
                'session': '2026/2027', 'term': 'First Term', 'category': 'other_fee',
                'installments_allowed': False,
            }, fee_id)
            self.add_record(conn, 'Payment', {
                'student_id': student_id, 'fee_id': fee_id, 'fee_category': 'other_fee',
                'amount': 300, 'session': '2026/2027', 'term': 'First Term', 'type': 'payment',
            })
            partial_payment = {
                'student_id': student_id, 'fee_id': fee_id, 'fee_category': 'other_fee',
                'amount': 200, 'session': '2026/2027', 'term': 'First Term',
            }
            self.assertIn('must be paid in full', app.payment_fee_error(conn, partial_payment))
            fee = json.loads(conn.execute('SELECT data FROM records WHERE id=?', (fee_id,)).fetchone()['data'])
            fee['installments_allowed'] = True
            conn.execute('UPDATE records SET data=? WHERE id=?', (json.dumps(fee), fee_id))
            self.assertIsNone(app.payment_fee_error(conn, partial_payment))
            excessive_payment = {**partial_payment, 'amount': 701}
            self.assertIn('remaining configured balance', app.payment_fee_error(conn, excessive_payment))

    def test_admission_print_and_pass_decision_create_student_in_least_populated_arm(self):
        with app.db() as conn:
            arm_ids = []
            for name in ('JSS 1 A', 'JSS 1 B'):
                arm_ids.append(self.add_record(conn, 'ClassArm', {
                    'level': 'JSS 1', 'track': '', 'display_name': name, 'active': True,
                }))
            self.add_record(conn, 'Student', {
                'full_name': 'Already Enrolled', 'level': 'JSS 1',
                'class_arm_id': arm_ids[0], 'status': 'Active',
            })

        application = {
            'student_name': 'New Applicant', 'date_of_birth': '2013-04-15',
            'gender': 'Female', 'requested_level': 'JSS 1', 'requested_track': '',
            'guardian_name': 'Applicant Guardian', 'guardian_phone': '08000000000',
            'guardian_email': 'guardian@school.test', 'address': 'Test address',
        }
        self.login()
        configured = self.client.post('/api/admin/public-site', json={
            'admissions_open': True, 'admission_date': '2027-01-15',
            'admission_time': '09:00', 'admission_venue': 'School examination hall',
        })
        self.assertEqual(configured.status_code, 200, configured.get_json())
        with patch.object(app, 'send_mail', return_value=(False, 'Email is not configured.')):
            created = self.client.post('/api/admissions', json=application)
        self.assertEqual(created.status_code, 201, created.get_json())
        token = created.get_json()['print_token']
        self.assertEqual(self.client.get(f'/api/admissions/slip?token={token}').status_code, 200)

        application_id = None
        with app.db() as conn:
            application_id = conn.execute(
                'SELECT id FROM admission_applications WHERE reference=?',
                (created.get_json()['reference'],),
            ).fetchone()['id']
        with patch.object(app, 'send_mail', return_value=(False, 'Email is not configured.')):
            scheduled = self.client.post(f'/api/admissions/{application_id}/decision', json={
                'action': 'schedule_exam', 'exam_date': '2027-01-16', 'exam_time': '10:00', 'exam_venue': 'School Hall',
            })
        self.assertEqual(scheduled.status_code, 200, scheduled.get_json())
        self.assertFalse(scheduled.get_json()['email_sent'])
        admitted = self.client.post(f'/api/admissions/{application_id}/decision', json={'action': 'passed'})
        self.assertEqual(admitted.status_code, 200, admitted.get_json())
        with app.db() as conn:
            student = json.loads(conn.execute('SELECT data FROM records WHERE id=? AND entity=?', (admitted.get_json()['student_id'], 'Student')).fetchone()['data'])
        self.assertEqual(student['class_arm_id'], arm_ids[1])
        self.assertEqual(student['full_name'], application['student_name'])

    def test_admin_can_update_public_homepage_content(self):
        self.login()
        response = self.client.post('/api/admin/public-site', json={
            'headline': 'Welcome to our test school', 'tagline': 'Test tagline', 'about': 'Test school description',
        })
        self.assertEqual(response.status_code, 200, response.get_json())
        public = self.client.get('/api/public/site')
        self.assertEqual(public.get_json()['headline'], 'Welcome to our test school')

    def test_admissions_require_active_flag_and_complete_schedule(self):
        self.login()
        incomplete = self.client.post('/api/admin/public-site', json={
            'admissions_open': True, 'admission_date': '', 'admission_time': '', 'admission_venue': '',
        })
        self.assertEqual(incomplete.status_code, 400)
        saved = self.client.post('/api/admin/public-site', json={
            'admissions_open': True, 'admission_date': '2027-01-15',
            'admission_time': '09:00', 'admission_venue': 'School examination hall',
        })
        self.assertEqual(saved.status_code, 200, saved.get_json())
        self.assertTrue(self.client.get('/api/public/site').get_json()['admissions_available'])

    def test_application_uses_admin_schedule_and_reports_email_status(self):
        application = {
            'student_name': 'New Applicant', 'date_of_birth': '2013-04-15',
            'gender': 'Female', 'requested_level': 'JSS 1', 'requested_track': '',
            'guardian_name': 'Applicant Guardian', 'guardian_phone': '08000000000',
            'guardian_email': 'guardian@school.test', 'address': 'Test address',
        }
        with app.db() as conn:
            arm_id = self.add_record(conn, 'ClassArm', {
                'level': 'JSS 1', 'track': '', 'display_name': 'JSS 1 A', 'active': True,
            })
        self.assertIsNotNone(arm_id)
        closed = self.client.post('/api/admissions', json=application)
        self.assertEqual(closed.status_code, 403)

        self.login()
        configured = self.client.post('/api/admin/public-site', json={
            'admissions_open': True, 'admission_date': '2027-01-15',
            'admission_time': '09:00', 'admission_venue': 'School examination hall',
        })
        self.assertEqual(configured.status_code, 200, configured.get_json())
        with patch.object(app, 'send_mail', return_value=(False, 'Email is not configured.')) as send_mail:
            created = self.client.post('/api/admissions', json=application)
        self.assertEqual(created.status_code, 201, created.get_json())
        self.assertFalse(created.get_json()['email_sent'])
        send_mail.assert_called_once()
        with app.db() as conn:
            row = conn.execute('SELECT status,exam_date,exam_time,exam_venue FROM admission_applications WHERE reference=?', (created.get_json()['reference'],)).fetchone()
        self.assertEqual((row['status'], row['exam_date'], row['exam_time'], row['exam_venue']), ('exam_scheduled', '2027-01-15', '09:00', 'School examination hall'))


if __name__ == '__main__':
    unittest.main()
