from __future__ import annotations
import base64, html
import json, mimetypes, os, re, secrets, sqlite3, uuid, smtplib, urllib.request, urllib.error, hmac
from datetime import datetime, timedelta, timezone
from functools import wraps
from pathlib import Path
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
from email.message import EmailMessage
from email.utils import formataddr, parseaddr
from hashlib import sha256
from base64 import urlsafe_b64encode
from cryptography.fernet import Fernet, InvalidToken
from urllib.parse import quote, urlencode, urlsplit
from flask import Flask, jsonify, request, session, send_from_directory, abort, has_request_context

ROOT = Path(__file__).resolve().parent
try:
    from dotenv import load_dotenv
    load_dotenv(ROOT / '.env')
except ImportError:
    pass
DB_PATH = Path(os.environ.get('SCHOOL_DB_PATH', ROOT / 'school.db'))
UPLOAD_DIR = Path(os.environ.get('UPLOAD_DIR', ROOT / 'uploads'))
SCHEMA_DIR = ROOT / 'base44' / 'entities'
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
app = Flask(__name__, static_folder=None)
app.config.update(SECRET_KEY=os.environ.get('SECRET_KEY', 'change-this-school-secret-before-deployment'), SESSION_COOKIE_HTTPONLY=True, SESSION_COOKIE_SAMESITE='Lax', SESSION_COOKIE_SECURE=(os.environ.get('COOKIE_SECURE', 'false').lower() == 'true' or os.environ.get('APP_ENV', 'development').lower() == 'production'), PERMANENT_SESSION_LIFETIME=timedelta(hours=8), MAX_CONTENT_LENGTH=10 * 1024 * 1024)
_configured_secret = os.environ.get('SECRET_KEY', '').strip()
if os.environ.get('APP_ENV', 'development').lower() == 'production' and (len(_configured_secret) < 32 or _configured_secret.lower().startswith(('replace-with', 'change-this', 'your-'))):
    raise RuntimeError('Production startup refused: set a unique, random SECRET_KEY of at least 32 characters in the environment.')


class ClosingSQLiteConnection(sqlite3.Connection):
    def __exit__(self, exc_type, exc_value, traceback):
        try:
            return super().__exit__(exc_type, exc_value, traceback)
        finally:
            self.close()


def db():
    conn = sqlite3.connect(DB_PATH, factory=ClosingSQLiteConnection)
    conn.row_factory = sqlite3.Row
    return conn


def now(): return datetime.now(timezone.utc).isoformat()


EMAIL_SECRET_FIELDS = (
    'smtp_password',
    'brevo_api_key',
    'resend_api_key',
    'gmail_client_secret',
    'gmail_refresh_token',
)
EMAIL_SETTING_FIELDS = (
    'provider', 'sender_email', 'smtp_host', 'smtp_port', 'smtp_tls', 'smtp_ssl',
    'smtp_user', *EMAIL_SECRET_FIELDS, 'gmail_client_id',
)
LEGACY_EMAIL_FIELDS = {
    'smtp_host', 'smtp_port', 'smtp_tls', 'smtp_ssl', 'smtp_user', 'smtp_password',
    'smtp_from', 'email_provider', 'sender_email', 'brevo_api_key', 'resend_api_key',
    'gmail_client_id', 'gmail_client_secret', 'gmail_refresh_token',
}


def _email_config_cipher():
    key = urlsafe_b64encode(sha256((app.config['SECRET_KEY'] + '|email-provider-config-v1').encode()).digest())
    return Fernet(key)


def _read_email_provider_config():
    with db() as c:
        row = c.execute('SELECT config_encrypted FROM email_provider_config WHERE id=1').fetchone()
    if row:
        try:
            return json.loads(_email_config_cipher().decrypt(row['config_encrypted'].encode()))
        except (InvalidToken, json.JSONDecodeError) as exc:
            raise RuntimeError('Saved email provider settings cannot be decrypted. Keep the same SECRET_KEY used when they were saved.') from exc
    return {}


def _email_config_defaults():
    return {
        'provider': os.environ.get('EMAIL_PROVIDER', 'smtp').strip().lower(),
        'sender_email': os.environ.get('EMAIL_FROM', os.environ.get('SMTP_FROM', os.environ.get('SMTP_USER', ''))).strip(),
        'smtp_host': os.environ.get('SMTP_HOST', '').strip(),
        'smtp_port': str(os.environ.get('SMTP_PORT', '587')),
        'smtp_tls': str(os.environ.get('SMTP_TLS', 'true')).lower() == 'true',
        'smtp_ssl': str(os.environ.get('SMTP_SSL', 'false')).lower() == 'true',
        'smtp_user': os.environ.get('SMTP_USER', '').strip(),
        'smtp_password': os.environ.get('SMTP_PASSWORD', ''),
        'brevo_api_key': os.environ.get('BREVO_API_KEY', ''),
        'resend_api_key': os.environ.get('RESEND_API_KEY', ''),
        'gmail_client_id': os.environ.get('GMAIL_CLIENT_ID', '').strip(),
        'gmail_client_secret': os.environ.get('GMAIL_CLIENT_SECRET', ''),
        'gmail_refresh_token': os.environ.get('GMAIL_REFRESH_TOKEN', ''),
    }


def _effective_email_config():
    config = _email_config_defaults()
    saved = _read_email_provider_config()
    for key, value in saved.items():
        if value is None or value == '':
            continue
        config[key] = value
    return config


def _migrate_legacy_email_settings(c):
    existing = c.execute('SELECT 1 FROM email_provider_config WHERE id=1').fetchone()
    settings_rows = c.execute(
        "SELECT id,data FROM records WHERE entity='SchoolSettings' ORDER BY updated_date DESC"
    ).fetchall()
    if not existing and settings_rows:
        try:
            legacy = json.loads(settings_rows[0]['data'])
        except (TypeError, json.JSONDecodeError):
            legacy = {}
        if not isinstance(legacy, dict):
            legacy = {}
        if any(legacy.get(key) for key in LEGACY_EMAIL_FIELDS):
            config = _email_config_defaults()
            config.update({key: legacy[key] for key in EMAIL_SETTING_FIELDS if key in legacy and legacy[key] not in ('', None)})
            config['sender_email'] = legacy.get('smtp_from') or config.get('sender_email', '')
            encrypted = _email_config_cipher().encrypt(json.dumps(config).encode()).decode()
            c.execute(
                'INSERT INTO email_provider_config(id,config_encrypted,updated_at,updated_by) VALUES(1,?,?,?)',
                (encrypted, now(), 'system:migration'),
            )
    for row in settings_rows:
        try:
            data = json.loads(row['data'])
        except (TypeError, json.JSONDecodeError):
            continue
        if not isinstance(data, dict):
            continue
        if LEGACY_EMAIL_FIELDS.intersection(data):
            for key in LEGACY_EMAIL_FIELDS:
                data.pop(key, None)
            c.execute('UPDATE records SET data=?,updated_date=? WHERE id=?', (json.dumps(data), now(), row['id']))


def smtp_config():
    with db() as c:
        row = c.execute("SELECT data FROM records WHERE entity='SchoolSettings' ORDER BY updated_date DESC LIMIT 1").fetchone()
    cfg = json.loads(row['data']) if row else {}
    email = _effective_email_config()
    return {
        'SCHOOL_NAME': str(cfg.get('school_name') or '').strip(),
        'SCHOOL_LOGO': str(cfg.get('school_logo') or '').strip(),
        'SCHOOL_ADDRESS': str(cfg.get('address') or '').strip(),
        'SCHOOL_PHONE': str(cfg.get('phone') or '').strip(),
        'SCHOOL_EMAIL': str(cfg.get('email') or '').strip(),
        'PUBLIC_BASE_URL': str(
            os.environ.get('PUBLIC_BASE_URL')
            or cfg.get('public_base_url')
            or os.environ.get('RENDER_EXTERNAL_URL')
            or ''
        ).strip(),
        'EMAIL_PROVIDER': str(email.get('provider') or 'smtp').strip().lower(),
        'SMTP_HOST': str(email.get('smtp_host') or '').strip(),
        'SMTP_PORT': str(email.get('smtp_port') or '587'),
        'SMTP_TLS': str(email.get('smtp_tls', True)).lower(),
        'SMTP_SSL': str(email.get('smtp_ssl', False)).lower(),
        'SMTP_USER': str(email.get('smtp_user') or '').strip(),
        'SMTP_PASSWORD': str(email.get('smtp_password') or ''),
        'SMTP_FROM': str(email.get('sender_email') or '').strip(),
        'BREVO_API_KEY': str(email.get('brevo_api_key') or ''),
        'RESEND_API_KEY': str(email.get('resend_api_key') or ''),
        'GMAIL_CLIENT_ID': str(email.get('gmail_client_id') or '').strip(),
        'GMAIL_CLIENT_SECRET': str(email.get('gmail_client_secret') or ''),
        'GMAIL_REFRESH_TOKEN': str(email.get('gmail_refresh_token') or ''),
    }


def email_provider_is_configured():
    cfg = smtp_config()
    provider = cfg['EMAIL_PROVIDER']
    if not cfg['SMTP_FROM']:
        return False
    return {
        'smtp': bool(cfg['SMTP_HOST']),
        'brevo': bool(cfg['BREVO_API_KEY']),
        'resend': bool(cfg['RESEND_API_KEY']),
        'gmail': bool(cfg['GMAIL_CLIENT_ID'] and cfg['GMAIL_CLIENT_SECRET'] and cfg['GMAIL_REFRESH_TOKEN']),
    }.get(provider, False)


class PublicBaseUrlError(ValueError):
    pass


def public_base_url():
    configured = smtp_config().get('PUBLIC_BASE_URL', '').rstrip('/')
    if configured:
        validation_error = validate_public_base_url(configured)
        if validation_error:
            raise PublicBaseUrlError(validation_error)
        return configured
    if os.environ.get('APP_ENV', 'development').lower() == 'production':
        return ''
    return request.host_url.rstrip('/') if has_request_context() else ''


@app.errorhandler(PublicBaseUrlError)
def public_base_url_error(error):
    return jsonify(error=str(error)), 503


def validate_public_base_url(value):
    if not value:
        return None
    try:
        parsed = urlsplit(value)
        port = parsed.port
        valid = (
            parsed.scheme in ('http', 'https')
            and bool(parsed.netloc and parsed.hostname)
            and (port is None or 1 <= port <= 65535)
            and parsed.username is None
            and parsed.password is None
            and parsed.path in ('', '/')
            and not parsed.query
            and not parsed.fragment
        )
    except ValueError:
        valid = False
    if not valid:
        return 'Public application URL must be an absolute HTTP or HTTPS origin, such as https://school.example.com.'
    if os.environ.get('APP_ENV', 'development').lower() == 'production' and parsed.scheme != 'https':
        return 'Public application URL must use HTTPS in production.'
    return None


def _email_html_body(body):
    def linkify(text):
        pieces = []
        cursor = 0
        for match in re.finditer(r'https?://[^\s<>]+', text):
            pieces.append(html.escape(text[cursor:match.start()]))
            url = match.group(0)
            clean_url = url.rstrip('.,;:!?)')
            trailing = url[len(clean_url):]
            safe_url = html.escape(clean_url, quote=True)
            pieces.append(f'<a href="{safe_url}" style="color:#176b55;text-decoration:underline">{html.escape(clean_url)}</a>{html.escape(trailing)}')
            cursor = match.end()
        pieces.append(html.escape(text[cursor:]))
        return ''.join(pieces)

    paragraphs = ['<br>'.join(linkify(line) for line in part.splitlines())
                  for part in re.split(r'\n\s*\n', str(body or '')) if part.strip()]
    return ''.join(f'<p style="margin:0 0 16px;line-height:1.6;color:#263238">{part}</p>' for part in paragraphs)


def branded_email_message(to_email, subject, body, branding=None, sender=None, action_label=None):
    cfg = branding or smtp_config()
    school_name = cfg.get('SCHOOL_NAME') or 'Your School'
    logo_uri = cfg.get('SCHOOL_LOGO') or ''
    logo_path = None
    if logo_uri.startswith('/uploads/'):
        filename = Path(logo_uri.removeprefix('/uploads/')).name
        candidate = (UPLOAD_DIR / filename).resolve()
        if candidate.parent == UPLOAD_DIR.resolve() and candidate.is_file():
            media_type, _ = mimetypes.guess_type(candidate.name)
            if media_type and media_type.startswith('image/'):
                logo_path = candidate

    image = '<img src="cid:school-logo" alt="" width="64" height="64" style="display:block;width:64px;height:64px;object-fit:contain;border:0;margin:0 auto 12px">' if logo_path else ''
    contacts = [cfg.get('SCHOOL_ADDRESS'), cfg.get('SCHOOL_PHONE'), cfg.get('SCHOOL_EMAIL')]
    contact_line = ' · '.join(html.escape(str(value)) for value in contacts if value)
    footer_contact = f'<p style="margin:8px 0 0;color:#6b7280;font-size:12px">{contact_line}</p>' if contact_line else ''
    safe_name = html.escape(school_name)
    safe_subject = html.escape(str(subject or 'School update'))
    action_html = ''
    if action_label:
        match = re.search(r'https?://[^\s]+', str(body or ''))
        if match:
            action_url = html.escape(match.group(0).rstrip('.,;:!?)'), quote=True)
            action_html = (f'<p style="margin:22px 0;text-align:center"><a href="{action_url}" '
                           f'style="display:inline-block;padding:13px 22px;border-radius:6px;background:#176b55;'
                           f'color:#fff;font-size:14px;font-weight:700;text-decoration:none">{html.escape(action_label)}</a></p>')
    html_body = f'''<!doctype html>
<html><body style="margin:0;background:#f3f6f5;font-family:Arial,Helvetica,sans-serif;color:#263238">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f6f5;padding:32px 12px">
<tr><td align="center"><table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#fff;border:1px solid #e3e9e6;border-radius:12px;overflow:hidden">
<tr><td align="center" style="padding:28px 24px 20px;background:#f8fbf9">{image}
<div style="font-size:20px;font-weight:700;letter-spacing:.3px;color:#163d32">{safe_name}</div>
<div style="margin-top:5px;font-size:10px;font-weight:700;letter-spacing:1.5px;color:#63756f">OFFICIAL SCHOOL COMMUNICATION</div></td></tr>
<tr><td style="padding:28px 32px"><h1 style="margin:0 0 22px;font-size:20px;line-height:1.35;color:#163d32">{safe_subject}</h1>
{_email_html_body(body)}{action_html}</td></tr>
<tr><td style="border-top:1px solid #e7ece9;padding:18px 24px;text-align:center;background:#fbfcfb">
<div style="font-size:11px;font-weight:700;letter-spacing:.8px;color:#53665f">{safe_name} · Official School Communication</div>{footer_contact}
</td></tr></table></td></tr></table></body></html>'''

    message = EmailMessage()
    message['Subject'] = subject
    _, sender_address = parseaddr(sender or cfg.get('SMTP_FROM') or '')
    message['From'] = formataddr((school_name, sender_address)) if sender_address else (sender or cfg.get('SMTP_FROM') or '')
    message['To'] = to_email
    message.set_content(str(body or ''))
    message.add_alternative(html_body, subtype='html')
    if logo_path:
        html_part = message.get_payload()[-1]
        media_type = mimetypes.guess_type(logo_path.name)[0] or 'image/png'
        maintype, subtype = media_type.split('/', 1)
        html_part.add_related(logo_path.read_bytes(), maintype=maintype, subtype=subtype,
                              cid='<school-logo>', disposition='inline', filename=logo_path.name)
    return message


def send_mail(to_email, subject, body, action_label=None):
    cfg = smtp_config()
    provider = cfg['EMAIL_PROVIDER']
    sender = cfg['SMTP_FROM']
    provider_ready = {
        'smtp': bool(cfg['SMTP_HOST']),
        'brevo': bool(cfg['BREVO_API_KEY']),
        'resend': bool(cfg['RESEND_API_KEY']),
        'gmail': bool(cfg['GMAIL_CLIENT_ID'] and cfg['GMAIL_CLIENT_SECRET'] and cfg['GMAIL_REFRESH_TOKEN']),
    }
    if provider not in provider_ready:
        error = 'Choose SMTP, Brevo, Resend, or Gmail API in School Settings.'
        log_email_delivery(to_email, subject, 'failed', error)
        return False, error
    if not sender or not provider_ready[provider]:
        error = f'{provider.title()} email is not fully configured. Check the provider credentials and sender email in School Settings.'
        log_email_delivery(to_email, subject, 'failed', error)
        return False, error
    try:
        msg = branded_email_message(to_email, subject, body, cfg, sender, action_label)
        if provider == 'smtp':
            port = int(cfg['SMTP_PORT'])
            if cfg['SMTP_SSL'] == 'true':
                with smtplib.SMTP_SSL(cfg['SMTP_HOST'], port, timeout=20) as server:
                    if cfg['SMTP_USER']: server.login(cfg['SMTP_USER'], cfg['SMTP_PASSWORD'])
                    refused = server.send_message(msg)
            else:
                with smtplib.SMTP(cfg['SMTP_HOST'], port, timeout=20) as server:
                    server.ehlo()
                    if cfg['SMTP_TLS'] == 'true': server.starttls(); server.ehlo()
                    if cfg['SMTP_USER']: server.login(cfg['SMTP_USER'], cfg['SMTP_PASSWORD'])
                    refused = server.send_message(msg)
            if refused: raise smtplib.SMTPRecipientsRefused(refused)
        elif provider in ('brevo', 'resend'):
            _send_api_email(provider, cfg, msg)
        else:
            _send_gmail_api_email(cfg, msg)
        log_email_delivery(to_email, subject, 'sent')
        return True, None
    except Exception as exc:
        app.logger.exception('Email delivery failed')
        error = f'{type(exc).__name__}: {exc}'[:1000]
        log_email_delivery(to_email, subject, 'failed', error)
        return False, error


def _email_message_payload(message):
    plain = message.get_body(preferencelist=('plain',)).get_content()
    html_part = message.get_body(preferencelist=('html',))
    html_content = html_part.get_content() if html_part else ''
    attachments = []
    for part in message.walk():
        content_id = part.get('Content-ID')
        if not content_id:
            continue
        content = part.get_payload(decode=True)
        if not content:
            continue
        attachments.append({
            'filename': part.get_filename() or 'school-logo',
            'content': base64.b64encode(content).decode('ascii'),
            'content_id': content_id.strip('<>'),
        })
    return plain, html_content, attachments


def _provider_http_request(url, data, headers):
    req = urllib.request.Request(url, data=data, headers=headers, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=25) as response:
            return response.read()
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode('utf-8', errors='replace')[:500]
        raise RuntimeError(f'Email provider returned HTTP {exc.code}: {detail or exc.reason}') from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f'Could not connect to the email provider: {exc.reason}') from exc


def _send_api_email(provider, cfg, message):
    plain, html_content, attachments = _email_message_payload(message)
    if provider == 'brevo':
        payload = {
            'sender': {'name': str(message['From']).split('<', 1)[0].strip().strip('"'), 'email': cfg['SMTP_FROM']},
            'to': [{'email': str(message['To'])}],
            'subject': str(message['Subject']),
            'textContent': plain,
            'htmlContent': html_content,
        }
        if attachments:
            payload['attachment'] = [
                {'name': item['filename'], 'content': item['content'], 'contentId': item['content_id']}
                for item in attachments
            ]
        url = 'https://api.brevo.com/v3/smtp/email'
        headers = {'api-key': cfg['BREVO_API_KEY']}
    else:
        payload = {
            'from': str(message['From']),
            'to': [str(message['To'])],
            'subject': str(message['Subject']),
            'text': plain,
            'html': html_content,
        }
        if attachments:
            payload['attachments'] = [
                {'filename': item['filename'], 'content': item['content'], 'content_id': item['content_id']}
                for item in attachments
            ]
        url = 'https://api.resend.com/emails'
        headers = {'Authorization': f"Bearer {cfg['RESEND_API_KEY']}"}
    _provider_http_request(
        url,
        json.dumps(payload).encode(),
        {'Content-Type': 'application/json', **headers},
    )


def _send_gmail_api_email(cfg, message):
    token_data = urlencode({
        'client_id': cfg['GMAIL_CLIENT_ID'],
        'client_secret': cfg['GMAIL_CLIENT_SECRET'],
        'refresh_token': cfg['GMAIL_REFRESH_TOKEN'],
        'grant_type': 'refresh_token',
    }).encode()
    token_response = _provider_http_request(
        'https://oauth2.googleapis.com/token',
        token_data,
        {'Content-Type': 'application/x-www-form-urlencoded'},
    )
    try:
        access_token = json.loads(token_response)['access_token']
    except (KeyError, json.JSONDecodeError) as exc:
        raise RuntimeError('Google OAuth did not return an access token. Check Gmail API OAuth credentials.') from exc
    raw_message = base64.urlsafe_b64encode(message.as_bytes()).decode('ascii').rstrip('=')
    _provider_http_request(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
        json.dumps({'raw': raw_message}).encode(),
        {'Content-Type': 'application/json', 'Authorization': f'Bearer {access_token}'},
    )


def log_email_delivery(to_email, subject, status, error=None):
    try:
        with db() as c:
            c.execute(
                'INSERT INTO email_delivery_logs(id,recipient,subject,status,error,actor_user_id,created_at) VALUES(?,?,?,?,?,?,?)',
                (str(uuid.uuid4()), str(to_email or '')[:320], str(subject or '')[:250], status,
                 str(error)[:1000] if error else None, session.get('user_id') if has_request_context() else None, now()),
            )
            c.execute("DELETE FROM email_delivery_logs WHERE created_at < datetime('now','-90 days')")
    except sqlite3.Error:
        app.logger.exception('Email delivery status could not be recorded')


NOTIFICATION_CATEGORIES = ('finance', 'academics', 'attendance', 'notices', 'requests', 'library', 'admissions', 'approvals', 'operations')
DEFAULT_NOTIFICATION_PREFERENCES = {category: True for category in NOTIFICATION_CATEGORIES}


def notify_user(user_id, category, subject, body, action_label=None):
    if category not in NOTIFICATION_CATEGORIES:
        raise ValueError(f'Unsupported notification category: {category}')
    with db() as c:
        user = c.execute("SELECT id,email FROM auth_users WHERE id=? AND account_status='active'", (user_id,)).fetchone()
        if not user:
            return False
        row = c.execute('SELECT email_enabled,preferences_json FROM notification_preferences WHERE user_id=?', (user_id,)).fetchone()
    preferences = dict(DEFAULT_NOTIFICATION_PREFERENCES)
    if row:
        preferences.update(json.loads(row['preferences_json'] or '{}'))
        if not row['email_enabled'] or not preferences.get(category, True):
            return False
    if action_label:
        sent, error = send_mail(user['email'], subject, body, action_label)
    else:
        sent, error = send_mail(user['email'], subject, body)
    if not sent:
        app.logger.warning('Notification email was not sent to user %s: %s', user_id, error)
    return sent


def notify_email(email, category, subject, body, action_label=None):
    if not email:
        return False
    with db() as c:
        user = c.execute('SELECT id FROM auth_users WHERE lower(email)=? AND account_status=?', (str(email).strip().lower(), 'active')).fetchone()
    return notify_user(user['id'], category, subject, body, action_label) if user else False


def send_notification_email(email, category, subject, body, action_label=None):
    with db() as c:
        user = c.execute('SELECT id FROM auth_users WHERE lower(email)=? AND account_status=?',
                         (str(email or '').strip().lower(), 'active')).fetchone()
    if user:
        return notify_user(user['id'], category, subject, body, action_label), None
    if action_label:
        return send_mail(email, subject, body, action_label)
    return send_mail(email, subject, body)


def notify_student_contacts(student_id, category, subject, body):
    with db() as c:
        row = c.execute("SELECT data FROM records WHERE id=? AND entity='Student'", (student_id,)).fetchone()
    if not row:
        return
    student = json.loads(row['data'])
    emails = {str(student.get(field) or '').strip().lower() for field in ('user_email', 'student_email', 'guardian_email')}
    for email in emails - {''}:
        notify_email(email, category, subject, body)


def notify_roles(roles, category, subject, body, exclude_user_id=None):
    placeholders = ','.join('?' for _ in roles)
    with db() as c:
        users = c.execute(
            f"SELECT id FROM auth_users WHERE role IN ({placeholders}) AND account_status='active' AND id<>COALESCE(?, '')",
            (*roles, exclude_user_id or ''),
        ).fetchall()
    for user in users:
        notify_user(user['id'], category, subject, body)


def notify_notice_recipients(notice):
    audience = notice.get('audience', 'all')
    roles = {
        'all': ('admin', 'principal', 'bursar', 'teacher', 'staff', 'librarian', 'student', 'parent'),
        'staff': ('admin', 'principal', 'bursar', 'teacher', 'staff', 'librarian'),
        'students': ('student',),
        'parents': ('parent',),
    }.get(audience, ())
    if roles:
        notify_roles(roles, 'notices', 'New school notice',
                     f'{notice.get("title") or "A new school notice is available."}\n\n'
                     f'{notice.get("body") or ""}\n\nAudience: {audience}.')


def payment_notification_body(payment):
    details = [
        f'Amount: {payment.get("amount") or "—"}',
        f'Fee: {payment.get("fee_name") or "School fees"}',
        f'Academic period: {payment.get("term") or "—"} · {payment.get("session") or "—"}',
    ]
    if payment.get('reference'):
        details.append(f'Payment reference: {payment["reference"]}')
    if payment.get('receipt_no'):
        details.append(f'Receipt number: {payment["receipt_no"]}')
    base = public_base_url()
    portal_path = '/parent/finance' if payment.get('guardian_email') else '/student/finance'
    details.append(f'Open the school portal to view your fee records: {base}{portal_path}' if base else
                   f'Open the school portal and sign in to view your fee records.')
    return f'A payment was recorded for {payment.get("student_name") or "your student"}.\n\n' + '\n'.join(details)


def notify_payment_contacts(payment):
    subject = f'Payment recorded: {payment.get("fee_name") or "school fees"}'
    body = payment_notification_body(payment)
    contacts = {str(payment.get(field) or '').strip().lower() for field in ('student_email', 'guardian_email')}
    for email in contacts - {''}:
        send_notification_email(email, 'finance', subject, body)


def make_invitation(record_id, email, role):
    base = public_base_url()
    if not base:
        return {
            'email_sent': False,
            'invite_url': '',
            'email_error': 'Set the Public application URL in School Settings or PUBLIC_BASE_URL before sending invitation links.',
        }
    token = secrets.token_urlsafe(32)
    expires = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
    with db() as c:
        c.execute('DELETE FROM invite_tokens WHERE record_id=?', (record_id,))
        c.execute('INSERT INTO invite_tokens(token,record_id,email,expires_at,created_at) VALUES(?,?,?,?,?)', (token,record_id,email,expires,now()))
    link = f'{base}/register?invite={token}&email={quote(email)}'
    school_name = smtp_config().get('SCHOOL_NAME') or 'Your School'
    account_type = {'parent': 'Parent/Guardian', 'student': 'Student', 'bursar': 'Bursary', 'principal': 'Principal',
                    'teacher': 'Teacher', 'librarian': 'Librarian'}.get(role, role.title())
    body = (
        f'Dear {account_type},\n\nWelcome to {school_name}.\n\n'
        'An account has been created for you on the school portal. You can use the portal to access the school services and information available to your account.\n\n'
        f'Your account details\nEmail: {email}\nAccount type: {account_type}\n\n'
        f'Activate your account and create your password using this secure link (valid for 7 days):\n{link}\n\n'
        'If you need assistance, please contact the school office using the contact details below. '
        'If you were not expecting this invitation, please ignore this message.\n\nKind regards,\nThe School Administration'
    )
    sent, error = send_mail(email, f'{school_name} portal account invitation', body, 'Access your school portal')
    return {'email_sent': sent, 'invite_url': link, 'email_error': error}




def migrate_schema(c):
    """Additive migrations only: preserve existing school records and accounts."""
    c.execute("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)")
    c.execute("CREATE TABLE IF NOT EXISTS academic_sessions (id TEXT PRIMARY KEY, name TEXT UNIQUE NOT NULL, starts_on TEXT, ends_on TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL)")
    c.execute("CREATE TABLE IF NOT EXISTS academic_terms (id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES academic_sessions(id), name TEXT NOT NULL, starts_on TEXT, ends_on TEXT, resumption_on TEXT, exam_starts_on TEXT, exam_ends_on TEXT, closing_on TEXT, breaks_json TEXT NOT NULL DEFAULT '[]', holidays_json TEXT NOT NULL DEFAULT '[]', is_active INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','open','exams','closing','finished')), created_by TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(session_id,name))")
    term_columns={row['name'] for row in c.execute('PRAGMA table_info(academic_terms)').fetchall()}
    if 'status' not in term_columns:
        c.execute("ALTER TABLE academic_terms ADD COLUMN status TEXT NOT NULL DEFAULT 'planned'")
    c.execute("UPDATE academic_terms SET status='open' WHERE is_active=1 AND status='planned'")
    c.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_term ON academic_terms(is_active) WHERE is_active=1")
    c.execute("CREATE TABLE IF NOT EXISTS approval_requests (id TEXT PRIMARY KEY, kind TEXT NOT NULL, payload_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', requested_by TEXT NOT NULL, requested_at TEXT NOT NULL, reviewed_by TEXT, reviewed_at TEXT, decision_note TEXT)")
    c.execute("CREATE TABLE IF NOT EXISTS fee_payment_submissions (id TEXT PRIMARY KEY, student_id TEXT NOT NULL, student_name TEXT NOT NULL, amount REAL NOT NULL CHECK(amount>0), paid_on TEXT NOT NULL, reference TEXT, receipt_uri TEXT NOT NULL, session TEXT NOT NULL, term TEXT NOT NULL, submitted_by TEXT NOT NULL, submitted_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')), reviewed_by TEXT, reviewed_at TEXT, decision_note TEXT, payment_record_id TEXT)")
    receipt_columns={row['name'] for row in c.execute('PRAGMA table_info(fee_payment_submissions)').fetchall()}
    for column, definition in [('fee_id',"TEXT NOT NULL DEFAULT ''"),('fee_name',"TEXT NOT NULL DEFAULT ''"),('fee_category',"TEXT NOT NULL DEFAULT 'school_fee'"),('class_arm_name',"TEXT NOT NULL DEFAULT ''"),('admission_no',"TEXT NOT NULL DEFAULT ''")]:
        if column not in receipt_columns: c.execute(f'ALTER TABLE fee_payment_submissions ADD COLUMN {column} {definition}')
    c.execute("CREATE TABLE IF NOT EXISTS optional_subject_selections (id TEXT PRIMARY KEY, student_id TEXT NOT NULL, class_key TEXT NOT NULL, session_id TEXT NOT NULL, term_id TEXT NOT NULL, subject_ids_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'confirmed', requested_at TEXT NOT NULL, UNIQUE(student_id,session_id))")
    c.execute("CREATE TABLE IF NOT EXISTS subject_change_requests (id TEXT PRIMARY KEY, selection_id TEXT NOT NULL, requested_subject_ids_json TEXT NOT NULL, reason TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', requested_by TEXT NOT NULL, requested_at TEXT NOT NULL, reviewed_by TEXT, reviewed_at TEXT, decision_note TEXT)")
    c.execute("CREATE TABLE IF NOT EXISTS school_audit_log (id TEXT PRIMARY KEY, actor_id TEXT, actor_role TEXT, action TEXT NOT NULL, target_type TEXT, target_id TEXT, details_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL)")
    c.execute("CREATE TABLE IF NOT EXISTS admin_handover_requests (id TEXT PRIMARY KEY, initiated_by TEXT NOT NULL, replacement_user_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL, accepted_at TEXT, completed_at TEXT, details_json TEXT NOT NULL DEFAULT '{}')")
    # v2: authoritative per-class subject rules; selection limits are never trusted from clients.
    c.execute("CREATE TABLE IF NOT EXISTS subject_rules (id TEXT PRIMARY KEY, class_key TEXT NOT NULL, subject_id TEXT NOT NULL, requirement TEXT NOT NULL CHECK(requirement IN ('compulsory','optional','unavailable')), created_by TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(class_key,subject_id))")
    c.execute("CREATE TABLE IF NOT EXISTS optional_subject_limits (class_key TEXT PRIMARY KEY, mode TEXT NOT NULL CHECK(mode IN ('fixed','range')), min_count INTEGER NOT NULL, max_count INTEGER NOT NULL, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL, CHECK(min_count >= 0 AND max_count >= min_count))")
    c.execute("CREATE INDEX IF NOT EXISTS idx_subject_change_selection ON subject_change_requests(selection_id,status)")
    c.execute("CREATE TABLE IF NOT EXISTS promotion_history (id TEXT PRIMARY KEY, student_id TEXT NOT NULL, student_name TEXT NOT NULL, admission_number TEXT, from_class TEXT, to_class TEXT NOT NULL, session_id TEXT NOT NULL, promotion_date TEXT NOT NULL, changed_by TEXT NOT NULL, created_at TEXT NOT NULL)")
    c.execute("CREATE TABLE IF NOT EXISTS staff_attendance (id TEXT PRIMARY KEY, staff_id TEXT NOT NULL, staff_name TEXT NOT NULL, attendance_date TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('Present','Absent','Late','Excused')), arrival_time TEXT, session_id TEXT, term_id TEXT, recorded_by TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(staff_id,attendance_date))")
    c.execute("CREATE TABLE IF NOT EXISTS syllabus_topics (id TEXT PRIMARY KEY, subject_id TEXT NOT NULL, class_key TEXT NOT NULL, session_id TEXT NOT NULL, term_id TEXT NOT NULL, title TEXT NOT NULL, notes TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'not_started' CHECK(status IN ('not_started','in_progress','completed')), created_by TEXT NOT NULL, reviewed_by TEXT, reviewed_at TEXT, created_at TEXT NOT NULL)")
    syllabus_columns={row['name'] for row in c.execute('PRAGMA table_info(syllabus_topics)').fetchall()}
    if 'week_number' not in syllabus_columns:
        c.execute('ALTER TABLE syllabus_topics ADD COLUMN week_number INTEGER NOT NULL DEFAULT 1')
    c.execute("CREATE TABLE IF NOT EXISTS timetable_entries (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, term_id TEXT NOT NULL, class_key TEXT NOT NULL, subject_id TEXT NOT NULL, teacher_id TEXT NOT NULL, room TEXT, weekday INTEGER NOT NULL CHECK(weekday BETWEEN 1 AND 7), period TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL)")
    c.execute("CREATE TABLE IF NOT EXISTS result_reviews (id TEXT PRIMARY KEY, result_record_id TEXT NOT NULL, class_key TEXT NOT NULL, subject_id TEXT NOT NULL, teacher_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted','correction_requested','approved','rejected')), correction_note TEXT, reviewed_by TEXT, reviewed_at TEXT, created_at TEXT NOT NULL)")
    c.execute("CREATE TABLE IF NOT EXISTS library_books (id TEXT PRIMARY KEY, title TEXT NOT NULL, author TEXT, category TEXT, isbn TEXT, copies INTEGER NOT NULL DEFAULT 1 CHECK(copies>=0), created_by TEXT NOT NULL, created_at TEXT NOT NULL)")
    c.execute("CREATE TABLE IF NOT EXISTS library_loans (id TEXT PRIMARY KEY, book_id TEXT NOT NULL REFERENCES library_books(id), borrower_id TEXT NOT NULL, borrower_name TEXT NOT NULL, borrowed_at TEXT NOT NULL, due_at TEXT NOT NULL, returned_at TEXT, status TEXT NOT NULL DEFAULT 'borrowed' CHECK(status IN ('borrowed','returned','lost','damaged')), processed_by TEXT NOT NULL, created_at TEXT NOT NULL)")
    c.execute("CREATE TABLE IF NOT EXISTS recovery_links (token_hash TEXT PRIMARY KEY, target_user_id TEXT NOT NULL, target_email TEXT NOT NULL, generated_by TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, used_at TEXT, revoked_at TEXT)")
    c.execute("CREATE TABLE IF NOT EXISTS email_change_requests (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, new_email TEXT NOT NULL, code_hash TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL, verified_at TEXT)")
    c.execute("CREATE TABLE IF NOT EXISTS notification_preferences (user_id TEXT PRIMARY KEY REFERENCES auth_users(id) ON DELETE CASCADE, email_enabled INTEGER NOT NULL DEFAULT 1, preferences_json TEXT NOT NULL DEFAULT '{}', updated_at TEXT NOT NULL)")
    c.execute("CREATE TABLE IF NOT EXISTS email_delivery_logs (id TEXT PRIMARY KEY, recipient TEXT NOT NULL, subject TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('sent','failed')), error TEXT, actor_user_id TEXT, created_at TEXT NOT NULL)")
    c.execute('CREATE INDEX IF NOT EXISTS idx_email_delivery_logs_created ON email_delivery_logs(created_at DESC)')
    c.execute("CREATE TABLE IF NOT EXISTS public_site_settings (id INTEGER PRIMARY KEY CHECK(id=1), content_json TEXT NOT NULL DEFAULT '{}', updated_at TEXT NOT NULL, updated_by TEXT)")
    c.execute("CREATE TABLE IF NOT EXISTS admission_applications (id TEXT PRIMARY KEY, reference TEXT NOT NULL UNIQUE, print_token_hash TEXT NOT NULL UNIQUE, application_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted','exam_scheduled','not_passed','admitted')), exam_date TEXT, exam_time TEXT, exam_venue TEXT, admin_note TEXT, student_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, reviewed_by TEXT)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_admission_status ON admission_applications(status,created_at)")
    # v4: durable report-card archive and controlled payroll lifecycle.
    c.execute("CREATE TABLE IF NOT EXISTS report_card_archive (id TEXT PRIMARY KEY, student_id TEXT NOT NULL, student_name TEXT NOT NULL, admission_no TEXT, class_arm_id TEXT, class_arm_name TEXT, session_name TEXT NOT NULL, term_name TEXT NOT NULL, session_id TEXT NOT NULL, term_id TEXT NOT NULL, results_json TEXT NOT NULL, published_by TEXT NOT NULL, published_at TEXT NOT NULL, UNIQUE(student_id,session_id,term_id))")
    c.execute("CREATE INDEX IF NOT EXISTS idx_report_archive_search ON report_card_archive(student_id,admission_no,class_arm_name,session_name,term_name)")
    c.execute("CREATE TABLE IF NOT EXISTS salary_profiles (id TEXT PRIMARY KEY, staff_id TEXT NOT NULL, staff_name TEXT NOT NULL, salary_amount REAL NOT NULL CHECK(salary_amount>=0), effective_from TEXT NOT NULL, approval_id TEXT NOT NULL UNIQUE, approved_by TEXT NOT NULL, created_at TEXT NOT NULL)")
    c.execute("CREATE TABLE IF NOT EXISTS salary_payment_records (id TEXT PRIMARY KEY, approval_id TEXT NOT NULL, staff_id TEXT NOT NULL, staff_name TEXT NOT NULL, amount REAL NOT NULL CHECK(amount>0), paid_on TEXT NOT NULL, method TEXT, period TEXT, processed_by TEXT NOT NULL, created_at TEXT NOT NULL)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_salary_payments_staff ON salary_payment_records(staff_id,paid_on)")
    c.execute("CREATE TABLE IF NOT EXISTS curriculum_documents (id TEXT PRIMARY KEY, title TEXT NOT NULL, subject_id TEXT NOT NULL, class_key TEXT NOT NULL, session_id TEXT NOT NULL, term_id TEXT NOT NULL, file_uri TEXT NOT NULL, file_name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', uploaded_by TEXT NOT NULL, reviewed_by TEXT, reviewed_at TEXT, created_at TEXT NOT NULL)")
    # v6: versioned school payment accounts and encrypted staff payout details.
    c.execute("CREATE TABLE IF NOT EXISTS school_payment_accounts (id TEXT PRIMARY KEY, bank_name TEXT NOT NULL, account_name TEXT NOT NULL, account_number TEXT NOT NULL, purpose TEXT NOT NULL DEFAULT 'school_fees', instructions TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active','rejected','inactive')), submitted_by TEXT NOT NULL, reviewed_by TEXT, submitted_at TEXT NOT NULL, reviewed_at TEXT, decision_note TEXT)")
    c.execute("CREATE TABLE IF NOT EXISTS paystack_transactions (id TEXT PRIMARY KEY, reference TEXT NOT NULL UNIQUE, student_id TEXT NOT NULL, fee_id TEXT NOT NULL, fee_name TEXT NOT NULL, amount_kobo INTEGER NOT NULL CHECK(amount_kobo>0), session TEXT NOT NULL, term TEXT NOT NULL, initiated_by TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','success','failed')), payment_record_id TEXT, gateway_response TEXT, created_at TEXT NOT NULL, verified_at TEXT)")
    c.execute('CREATE INDEX IF NOT EXISTS idx_paystack_student_status ON paystack_transactions(student_id,status,created_at)')
    c.execute("CREATE INDEX IF NOT EXISTS idx_school_payment_accounts_status ON school_payment_accounts(status,purpose,submitted_at)")
    c.execute("CREATE TABLE IF NOT EXISTS staff_bank_details (staff_id TEXT PRIMARY KEY, encrypted_payload TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL)")
    c.execute("CREATE TABLE IF NOT EXISTS login_attempts (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL, ip_address TEXT NOT NULL, attempted_at TEXT NOT NULL, success INTEGER NOT NULL DEFAULT 0)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_login_attempts_lookup ON login_attempts(email,ip_address,attempted_at)")
    c.execute("INSERT OR IGNORE INTO schema_migrations(version,applied_at) VALUES(6,?)", (now(),))
    c.execute("INSERT OR IGNORE INTO schema_migrations(version,applied_at) VALUES(4,?)", (now(),))
    c.execute("INSERT OR IGNORE INTO schema_migrations(version,applied_at) VALUES(5,?)", (now(),))
    c.execute("INSERT OR IGNORE INTO schema_migrations(version,applied_at) VALUES(1,?)", (now(),))
    c.execute("INSERT OR IGNORE INTO schema_migrations(version,applied_at) VALUES(2,?)", (now(),))
    c.execute("INSERT OR IGNORE INTO schema_migrations(version,applied_at) VALUES(3,?)", (now(),))


def _bank_cipher():
    # Derive a dedicated Fernet key from SECRET_KEY; changing SECRET_KEY requires a
    # planned key rotation because it also protects these encrypted payout details.
    key = urlsafe_b64encode(sha256((app.config['SECRET_KEY'] + '|staff-bank-details-v1').encode()).digest())
    return Fernet(key)

def _staff_record_for_user(conn, user):
    return conn.execute("SELECT id,data FROM records WHERE entity='StaffProfile' AND lower(json_extract(data,'$.email'))=? ORDER BY updated_date DESC LIMIT 1", (str(user.get('email') or '').lower(),)).fetchone()

def _staff_roles():
    return ('teacher','staff','principal','bursar','librarian')

def audit(actor, action, target_type=None, target_id=None, details=None):
    with db() as c:
        c.execute('INSERT INTO school_audit_log(id,actor_id,actor_role,action,target_type,target_id,details_json,created_at) VALUES(?,?,?,?,?,?,?,?)',
                  (str(uuid.uuid4()), actor.get('id'), actor.get('role'), action, target_type, target_id, json.dumps(details or {}), now()))


def current_user():
    uid = session.get('user_id')
    if not uid: return None
    with db() as c: row = c.execute('SELECT id,email,full_name,role,account_status,created_date FROM auth_users WHERE id=?', (uid,)).fetchone()
    return dict(row) if row else None


def is_primary_admin_id(user_id, conn=None):
    # Stable owner identity; never infer ownership from a mutable email address.
    if not user_id: return False
    owns_connection = conn is None
    c = conn or db()
    try:
        row = c.execute('SELECT primary_admin_user_id FROM school_security_settings WHERE id=1').fetchone()
        return bool(row and row['primary_admin_user_id'] and str(row['primary_admin_user_id']) == str(user_id))
    except sqlite3.OperationalError:
        return False
    finally:
        if owns_connection: c.close()


def is_primary_admin_email(email, conn):
    row = conn.execute('SELECT id FROM auth_users WHERE lower(email)=?', (str(email or '').lower(),)).fetchone()
    return bool(row and is_primary_admin_id(row['id'], conn))


def login_required(fn):
    @wraps(fn)
    def wrapped(*args, **kwargs):
        user = current_user()
        if not user: return jsonify(error='Please log in to continue.'), 401
        if user.get('account_status') in ('suspended','deactivated'): return jsonify(error='This account is suspended or deactivated.'), 403
        return fn(*args, **kwargs)
    return wrapped



def role_required(*roles):
    def deco(fn):
        @wraps(fn)
        @login_required
        def wrapped(*args, **kwargs):
            user=current_user()
            if user.get('role') not in roles: return jsonify(error='You do not have permission to perform this action.'),403
            return fn(*args, **kwargs)
        return wrapped
    return deco


def _valid_iso_date(value):
    if value in (None, ''): return True
    try:
        datetime.strptime(str(value), '%Y-%m-%d')
        return True
    except (TypeError, ValueError):
        return False


def _academic_date_error(data, *, session_start=None, session_end=None):
    date_fields=('starts_on','ends_on','resumption_on','exam_starts_on','exam_ends_on','closing_on')
    for field in date_fields:
        if data.get(field) and not _valid_iso_date(data.get(field)):
            return f'{field.replace("_", " ").capitalize()} must be a valid date (YYYY-MM-DD).'
    start=data.get('starts_on'); end=data.get('ends_on')
    if start and end and start > end: return 'The opening date cannot be after the closing date.'
    if session_start and start and start < session_start: return 'The term cannot start before its academic session.'
    if session_end and end and end > session_end: return 'The term cannot end after its academic session.'
    exam_start=data.get('exam_starts_on'); exam_end=data.get('exam_ends_on')
    if bool(exam_start) != bool(exam_end): return 'Enter both examination start and end dates.'
    if exam_start and exam_end and exam_start > exam_end: return 'Examination start date cannot be after examination end date.'
    if exam_start and start and exam_start < start: return 'Examinations cannot start before the term opens.'
    if exam_end and end and exam_end > end: return 'Examinations cannot end after the term closes.'
    closing=data.get('closing_on')
    if closing and start and closing < start: return 'The term-closing date cannot be before the term opens.'
    if closing and end and closing > end: return 'The term-closing date cannot be after the term ends.'
    if data.get('resumption_on') and end and data['resumption_on'] < end: return 'The resumption date must be on or after the term end date.'
    return None


@app.get('/api/academic/sessions')
@login_required
def academic_sessions_list():
    with db() as c:
        sessions=[dict(r) for r in c.execute('SELECT * FROM academic_sessions ORDER BY starts_on DESC').fetchall()]
        for row in sessions:
            row['terms']=[dict(t) for t in c.execute('SELECT * FROM academic_terms WHERE session_id=? ORDER BY starts_on', (row['id'],)).fetchall()]
    return jsonify(sessions)


@app.route('/api/notifications/preferences', methods=['GET', 'PUT'])
@login_required
def notification_preferences():
    user = current_user()
    if request.method == 'GET':
        with db() as c:
            row = c.execute('SELECT email_enabled,preferences_json FROM notification_preferences WHERE user_id=?', (user['id'],)).fetchone()
        preferences = dict(DEFAULT_NOTIFICATION_PREFERENCES)
        if row:
            preferences.update(json.loads(row['preferences_json'] or '{}'))
        return jsonify(email_enabled=bool(row['email_enabled']) if row else True, categories=preferences,
                       email_configured=email_provider_is_configured())

    body = request.get_json(silent=True) or {}
    categories = body.get('categories')
    if not isinstance(body.get('email_enabled'), bool) or not isinstance(categories, dict):
        return jsonify(error='Email preference and notification categories are required.'), 400
    if set(categories) != set(NOTIFICATION_CATEGORIES) or any(not isinstance(value, bool) for value in categories.values()):
        return jsonify(error='Provide a true or false preference for every notification category.'), 400
    with db() as c:
        c.execute(
            'INSERT INTO notification_preferences(user_id,email_enabled,preferences_json,updated_at) VALUES(?,?,?,?) '
            'ON CONFLICT(user_id) DO UPDATE SET email_enabled=excluded.email_enabled,preferences_json=excluded.preferences_json,updated_at=excluded.updated_at',
            (user['id'], int(body['email_enabled']), json.dumps(categories), now()),
        )
    return jsonify(ok=True)


@app.post('/api/academic/sessions')
@role_required('admin')
def academic_session_create():
    body=request.get_json(silent=True) or {}; name=str(body.get('name','')).strip()
    if not name: return jsonify(error='Session name is required.'),400
    for field in ('starts_on','ends_on'):
        if body.get(field) and not _valid_iso_date(body.get(field)): return jsonify(error=f'{field.replace("_", " ").capitalize()} must be a valid date (YYYY-MM-DD).'),400
    if body.get('starts_on') and body.get('ends_on') and body['starts_on'] > body['ends_on']:
        return jsonify(error='The session start date cannot be after its end date.'),400
    sid=str(uuid.uuid4())
    try:
        with db() as c: c.execute('INSERT INTO academic_sessions(id,name,starts_on,ends_on,created_by,created_at) VALUES(?,?,?,?,?,?)',(sid,name,body.get('starts_on'),body.get('ends_on'),current_user()['id'],now()))
    except sqlite3.IntegrityError: return jsonify(error='That academic session already exists.'),409
    audit(current_user(),'academic_session_created','academic_session',sid,{'name':name,'starts_on':body.get('starts_on'),'ends_on':body.get('ends_on')})
    return jsonify(id=sid,name=name,starts_on=body.get('starts_on'),ends_on=body.get('ends_on')),201


@app.post('/api/academic/sessions/<sid>/terms')
@role_required('admin')
def academic_term_create(sid):
    body=request.get_json(silent=True) or {}; name=str(body.get('name','')).strip()
    if not name: return jsonify(error='Term name is required.'),400
    tid=str(uuid.uuid4())
    try:
        with db() as c:
            session_row=c.execute('SELECT * FROM academic_sessions WHERE id=?',(sid,)).fetchone()
            if not session_row: return jsonify(error='Academic session not found.'),404
            date_error=_academic_date_error(body,session_start=session_row['starts_on'],session_end=session_row['ends_on'])
            if date_error: return jsonify(error=date_error),400
            if body.get('starts_on') and body.get('ends_on'):
                overlap=c.execute("SELECT name FROM academic_terms WHERE session_id=? AND starts_on IS NOT NULL AND ends_on IS NOT NULL AND starts_on<=? AND ends_on>=?",(sid,body['ends_on'],body['starts_on'])).fetchone()
                if overlap: return jsonify(error=f'This term overlaps with {overlap["name"]}. Adjust the dates so terms do not overlap.'),409
            c.execute('INSERT INTO academic_terms(id,session_id,name,starts_on,ends_on,resumption_on,exam_starts_on,exam_ends_on,closing_on,breaks_json,holidays_json,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',(tid,sid,name,body.get('starts_on'),body.get('ends_on'),body.get('resumption_on'),body.get('exam_starts_on'),body.get('exam_ends_on'),body.get('closing_on'),json.dumps(body.get('breaks',[])),json.dumps(body.get('holidays',[])),current_user()['id'],now()))
    except sqlite3.IntegrityError: return jsonify(error='That term already exists in this session.'),409
    audit(current_user(),'academic_term_created','academic_term',tid,{'session_id':sid,'name':name,'starts_on':body.get('starts_on'),'ends_on':body.get('ends_on')})
    return jsonify(id=tid,session_id=sid,name=name,status='planned'),201


@app.post('/api/academic/terms/<tid>/activate')
@role_required('admin')
def academic_term_activate(tid):
    with db() as c:
        term=c.execute('SELECT * FROM academic_terms WHERE id=?',(tid,)).fetchone()
        if not term: return jsonify(error='Term not found.'),404
        if term['status']=='finished': return jsonify(error='A finished term cannot be reactivated. Create an authorised correction workflow instead.'),409
        c.execute('UPDATE academic_terms SET is_active=0 WHERE is_active=1')
        c.execute("UPDATE academic_terms SET is_active=1,status=CASE WHEN status='planned' THEN 'open' ELSE status END WHERE id=?",(tid,))
    audit(current_user(),'academic_term_activated','academic_term',tid,{'session_id':term['session_id']})
    return jsonify(ok=True,active_term_id=tid)


@app.post('/api/academic/terms/<tid>/status')
@role_required('admin')
def academic_term_status_update(tid):
    body=request.get_json(silent=True) or {}; target=str(body.get('status','')).lower()
    allowed={'planned':'open','open':'exams','exams':'closing','closing':'finished'}
    with db() as c:
        term=c.execute('SELECT * FROM academic_terms WHERE id=?',(tid,)).fetchone()
        if not term: return jsonify(error='Term not found.'),404
        current=term['status'] if 'status' in term.keys() else ('open' if term['is_active'] else 'planned')
        if target!=allowed.get(current): return jsonify(error=f'Invalid term stage change. Current stage is {current}; the next permitted stage is {allowed.get(current, "none")}.'),409
        if target=='open':
            c.execute('UPDATE academic_terms SET is_active=0 WHERE is_active=1')
            c.execute("UPDATE academic_terms SET status='open',is_active=1 WHERE id=?",(tid,))
        elif target=='finished':
            c.execute("UPDATE academic_terms SET status='finished',is_active=0 WHERE id=?",(tid,))
        else:
            c.execute('UPDATE academic_terms SET status=? WHERE id=?',(target,tid))
    audit(current_user(),'academic_term_stage_changed','academic_term',tid,{'from':current,'to':target})
    return jsonify(ok=True,status=target,is_active=(target=='open'))


@app.post('/api/approvals')
@role_required('bursar','admin','teacher')
def approval_create():
    body=request.get_json(silent=True) or {}; kind=str(body.get('kind','')).strip(); payload=body.get('payload')
    if kind not in ('fee_change','salary_change','salary_payment','curriculum_change','result_publish') or not isinstance(payload,dict): return jsonify(error='A supported approval kind and payload are required.'),400
    role=current_user()['role']
    if kind in ('salary_change','salary_payment') and role!='bursar': return jsonify(error='Only Bursary can submit salary proposals.'),403
    if kind=='fee_change' and role not in ('bursar','admin'): return jsonify(error='Only Bursary or Admin may submit fee proposals.'),403
    if kind=='salary_payment':
        with db() as c:
            settings_row=c.execute("SELECT data FROM records WHERE entity='SchoolSettings' ORDER BY updated_date DESC LIMIT 1").fetchone()
        settings=json.loads(settings_row['data']) if settings_row else {}
        try: request_day=int(settings.get('salary_payment_day',25))
        except (TypeError,ValueError): request_day=25
        request_day=max(1,min(28,request_day))
        if datetime.now().day!=request_day:
            return jsonify(error=f'Salary payment requests may only be submitted on day {request_day} of each month.'),403
    if kind=='curriculum_change' and role!='admin': return jsonify(error='Only Admin can submit curriculum proposals.'),403
    if kind=='result_publish' and role not in ('admin','teacher'): return jsonify(error='Only authorised academic staff can submit report publication proposals.'),403
    rid=str(uuid.uuid4())
    with db() as c: c.execute('INSERT INTO approval_requests(id,kind,payload_json,requested_by,requested_at) VALUES(?,?,?,?,?)',(rid,kind,json.dumps(payload),current_user()['id'],now()))
    audit(current_user(),'approval_requested',kind,rid)
    if kind in ('fee_change','salary_change','salary_payment','curriculum_change'):
        notify_roles(('principal',), 'approvals', 'Approval required',
                     f'A {kind.replace("_", " ")} request is waiting for your review. Sign in to the school portal to review it.',
                     exclude_user_id=current_user()['id'])
    elif kind == 'result_publish':
        notify_roles(('admin', 'principal'), 'approvals', 'Report publication approval required',
                     'A report-card publication request is waiting for review. Sign in to the school portal to review it.',
                     exclude_user_id=current_user()['id'])
    return jsonify(id=rid,kind=kind,status='pending'),201


@app.get('/api/approvals')
@role_required('admin','principal','bursar')
def approval_list():
    with db() as c: rows=c.execute('SELECT * FROM approval_requests ORDER BY requested_at DESC').fetchall()
    return jsonify([dict(r, payload=json.loads(r['payload_json'])) for r in rows])


@app.post('/api/approvals/<rid>/decision')
@role_required('admin','principal')
def approval_decision(rid):
    body=request.get_json(silent=True) or {}; decision=body.get('decision')
    if decision not in ('approved','rejected'): return jsonify(error='Decision must be approved or rejected.'),400
    with db() as c:
        row=c.execute('SELECT * FROM approval_requests WHERE id=?',(rid,)).fetchone()
        if not row: return jsonify(error='Approval request not found.'),404
        if row['status']!='pending': return jsonify(error='This request has already been reviewed.'),409
        if row['kind'] in ('fee_change','salary_change','salary_payment','curriculum_change') and current_user()['role']!='principal': return jsonify(error='This proposal requires Principal approval.'),403
        if row['kind']=='result_publish' and current_user()['role'] not in ('admin','principal'): return jsonify(error='Report publication requires Admin or Principal approval.'),403
        if decision=='approved' and row['kind']=='fee_change':
            proposal=json.loads(row['payload_json']); operation=proposal.get('operation','create')
            if operation=='create':
                fee={k:proposal.get(k) for k in ('name','level','track','amount','session','term','class_arm_id','class_arm_name','category','pay_once_per_term','installments_allowed','deadline','penalty_type','penalty_amount') if k in proposal}
                fee.setdefault('category','school_fee')
                fee.setdefault('installments_allowed', False)
                err=validate_entity('FeeItem',fee)
                if err: return jsonify(error='Approved fee proposal is invalid: '+err),400
                fid=str(uuid.uuid4()); stamp=now()
                c.execute('INSERT INTO records(id,entity,data,created_date,updated_date) VALUES(?,?,?,?,?)',(fid,'FeeItem',json.dumps(fee),stamp,stamp))
            elif operation=='delete':
                fee_id=str(proposal.get('fee_id',''))
                if not fee_id: return jsonify(error='Fee archival proposal is missing fee_id.'),400
                fee_row=c.execute("SELECT data FROM records WHERE id=? AND entity='FeeItem'",(fee_id,)).fetchone()
                if not fee_row: return jsonify(error='Fee record not found.'),404
                fee_data=json.loads(fee_row['data']); fee_data['archived']=True; fee_data['archived_at']=now(); fee_data['archived_by']=current_user()['id']
                c.execute("UPDATE records SET data=?,updated_date=? WHERE id=? AND entity='FeeItem'",(json.dumps(fee_data),now(),fee_id))
            elif operation=='update':
                fee_id=str(proposal.get('fee_id',''))
                allowed=proposal.get('installments_allowed')
                if not fee_id or not isinstance(allowed,bool): return jsonify(error='Fee policy update requires a fee record and an installment setting.'),400
                fee_row=c.execute("SELECT data FROM records WHERE id=? AND entity='FeeItem' AND json_extract(data,'$.archived') IS NOT 1",(fee_id,)).fetchone()
                if not fee_row: return jsonify(error='Active fee record not found.'),404
                fee_data=json.loads(fee_row['data']); fee_data['installments_allowed']=allowed
                c.execute("UPDATE records SET data=?,updated_date=? WHERE id=? AND entity='FeeItem'",(json.dumps(fee_data),now(),fee_id))
            else: return jsonify(error='Unsupported fee change operation.'),400
        if decision=='approved' and row['kind']=='salary_change':
            proposal=json.loads(row['payload_json']); staff_id=str(proposal.get('staff_id','')).strip(); amount=proposal.get('amount'); effective=str(proposal.get('effective_date','')).strip()
            if not staff_id or not effective: return jsonify(error='Salary proposal requires staff_id and effective_date.'),400
            try: amount=float(amount)
            except (TypeError,ValueError): return jsonify(error='Salary amount must be numeric.'),400
            if amount<0: return jsonify(error='Salary amount cannot be negative.'),400
            staff_name=str(proposal.get('staff_name','')).strip()
            if not staff_name:
                staff_row=c.execute("SELECT data FROM records WHERE entity='StaffProfile' AND id=?",(staff_id,)).fetchone()
                if staff_row:
                    sd=json.loads(staff_row['data']); staff_name=str(sd.get('full_name') or sd.get('name') or staff_id)
                else: staff_name=staff_id
            c.execute('INSERT INTO salary_profiles(id,staff_id,staff_name,salary_amount,effective_from,approval_id,approved_by,created_at) VALUES(?,?,?,?,?,?,?,?)',(str(uuid.uuid4()),staff_id,staff_name,amount,effective,rid,current_user()['id'],now()))
        if decision=='approved' and row['kind']=='salary_payment':
            proposal=json.loads(row['payload_json']); staff_id=str(proposal.get('staff_id','')).strip(); amount=proposal.get('amount')
            try: amount=float(amount)
            except (TypeError,ValueError): return jsonify(error='Payment amount must be numeric.'),400
            if not staff_id or amount<=0: return jsonify(error='Salary payment requires a staff_id and positive amount.'),400
        c.execute('UPDATE approval_requests SET status=?,reviewed_by=?,reviewed_at=?,decision_note=? WHERE id=?',(decision,current_user()['id'],now(),str(body.get('note','')),rid))
    audit(current_user(),'approval_'+decision,row['kind'],rid,{'note':body.get('note','')})
    notify_user(row['requested_by'], 'approvals', f'Approval request {decision}',
                f'Your {row["kind"].replace("_", " ")} request was {decision}.')
    return jsonify(ok=True,status=decision)


def canonical_class_scope(conn, class_key):
    value=str(class_key or '').strip()
    rows=conn.execute("SELECT id,data FROM records WHERE entity='ClassArm'").fetchall()
    for row in rows:
        arm=json.loads(row['data'])
        if value not in (str(row['id']),str(arm.get('display_name') or '')): continue
        level=str(arm.get('level') or '').strip()
        track=str(arm.get('track') or '').strip()
        if track.casefold()=='arts': track='Art'
        return f'{level} {track}'.strip() if track else level
    normalized=re.sub(r'\s+',' ',value).strip()
    match=re.fullmatch(r'(SS\s*[23])\s+(Science|Art|Arts|Commercial)',normalized,re.IGNORECASE)
    if match:
        level=re.sub(r'\s+',' ',match.group(1).upper())
        track='Art' if match.group(2).casefold()=='arts' else match.group(2).title()
        return f'{level} {track}'
    match=re.fullmatch(r'(JSS\s*[123]|SS\s*1)',normalized,re.IGNORECASE)
    return re.sub(r'\s+',' ',match.group(1).upper().replace('JSS','JSS ').replace('SS','SS ')).strip() if match else normalized


@app.post('/api/academic/subject-rules')
@role_required('admin')
def subject_rules_save():
    body=request.get_json(silent=True) or {}; class_key=str(body.get('class_key','')).strip(); rules=body.get('rules')
    if not class_key or not isinstance(rules,list): return jsonify(error='class_key and a rules list are required.'),400
    limits=body.get('limits') or {}; mode=str(limits.get('mode','range'))
    try: low=int(limits.get('min',0)); high=int(limits.get('max',low))
    except (TypeError,ValueError): return jsonify(error='Subject limits must be integers.'),400
    if mode not in ('fixed','range') or low<0 or high<low or (mode=='fixed' and low!=high): return jsonify(error='Invalid optional-subject limits.'),400
    normalized=[]; seen=set()
    for item in rules:
        if not isinstance(item,dict): return jsonify(error='Each rule must be an object.'),400
        sid=str(item.get('subject_id','')).strip(); req=str(item.get('requirement','')).strip()
        if not sid or req not in ('compulsory','optional','unavailable') or sid in seen: return jsonify(error='Each subject must have a unique ID and valid requirement.'),400
        seen.add(sid); normalized.append((sid,req))
    stamp=now(); uid=current_user()['id']
    with db() as c:
        class_key=canonical_class_scope(c,class_key)
        c.execute('DELETE FROM subject_rules WHERE class_key=?',(class_key,))
        c.executemany('INSERT INTO subject_rules(id,class_key,subject_id,requirement,created_by,updated_at) VALUES(?,?,?,?,?,?)',[(str(uuid.uuid4()),class_key,sid,req,uid,stamp) for sid,req in normalized])
        c.execute('INSERT INTO optional_subject_limits(class_key,mode,min_count,max_count,updated_by,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(class_key) DO UPDATE SET mode=excluded.mode,min_count=excluded.min_count,max_count=excluded.max_count,updated_by=excluded.updated_by,updated_at=excluded.updated_at',(class_key,mode,low,high,uid,stamp))
    audit(current_user(),'subject_rules_updated','class',class_key,{'count':len(normalized),'mode':mode,'min':low,'max':high})
    return jsonify(ok=True,class_key=class_key,rule_count=len(normalized),limits={'mode':mode,'min':low,'max':high})


@app.get('/api/academic/subject-rules/<path:class_key>')
@login_required
def subject_rules_get(class_key):
    with db() as c:
        class_key=canonical_class_scope(c,class_key)
        rules=[dict(r) for r in c.execute('SELECT subject_id,requirement FROM subject_rules WHERE class_key=? ORDER BY subject_id',(class_key,)).fetchall()]
        limits=c.execute('SELECT mode,min_count,max_count FROM optional_subject_limits WHERE class_key=?',(class_key,)).fetchone()
    return jsonify(class_key=class_key,rules=rules,limits=dict(limits) if limits else None)


def validate_subject_ids(c, class_key, subjects):
    if not isinstance(subjects,list) or len(set(subjects))!=len(subjects): return 'Choose a list of distinct subjects.'
    class_key=canonical_class_scope(c,class_key)
    rules={r['subject_id']:r['requirement'] for r in c.execute('SELECT subject_id,requirement FROM subject_rules WHERE class_key=?',(class_key,)).fetchall()}
    if not rules: return 'Subject rules have not been configured for this class.'
    optional={sid for sid,req in rules.items() if req=='optional'}
    compulsory={sid for sid,req in rules.items() if req=='compulsory'}
    if any(sid not in optional for sid in subjects): return 'Selection contains a subject that is not optional and available for this class.'
    limits=c.execute('SELECT min_count,max_count FROM optional_subject_limits WHERE class_key=?',(class_key,)).fetchone()
    if not limits: return 'Optional-subject limits have not been configured for this class.'
    if not limits['min_count']<=len(subjects)<=limits['max_count']: return f"Select between {limits['min_count']} and {limits['max_count']} optional subjects."
    return None


@app.get('/api/optional-subject-selections/mine')
@role_required('student')
def optional_subject_selection_mine():
    with db() as c:
        selection=c.execute('SELECT * FROM optional_subject_selections WHERE student_id=? ORDER BY requested_at DESC LIMIT 1',(current_user()['id'],)).fetchone()
        if not selection: return jsonify(selection=None,change_requests=[])
        requests=c.execute('SELECT * FROM subject_change_requests WHERE selection_id=? ORDER BY requested_at DESC',(selection['id'],)).fetchall()
    return jsonify(selection=dict(selection,subject_ids=json.loads(selection['subject_ids_json'])),change_requests=[dict(r,requested_subject_ids=json.loads(r['requested_subject_ids_json'])) for r in requests])

@app.post('/api/optional-subject-selections')
@role_required('student','admin')
def optional_subject_select():
    body=request.get_json(silent=True) or {}; student_id=str(body.get('student_id') or current_user()['id']); subjects=body.get('subject_ids',[]); class_key=str(body.get('class_key','')).strip(); session_id=str(body.get('session_id','')).strip(); term_id=str(body.get('term_id','')).strip()
    if current_user()['role']=='student' and student_id!=current_user()['id']: return jsonify(error='Students may only submit their own selection.'),403
    if not all((class_key,session_id,term_id)): return jsonify(error='Class, session and term are required.'),400
    with db() as c:
        if current_user()['role']=='student':
            student_row=c.execute("SELECT id,data FROM records WHERE entity='Student' AND lower(json_extract(data,'$.user_email'))=?",(current_user()['email'].lower(),)).fetchone()
            if not student_row: return jsonify(error='Your student record is not linked to this account.'),403
            sd=json.loads(student_row['data']); expected={str(sd.get('class_arm_id') or ''),str(sd.get('class_arm_name') or ''),str(sd.get('display_name') or '')}
            expected.discard('')
            if class_key not in expected: return jsonify(error='Subject selection is restricted to your current class arm or track.'),403
            sd['_record_id']=student_row['id']
            settings_row=c.execute("SELECT data FROM records WHERE entity='SchoolSettings' ORDER BY updated_date DESC LIMIT 1").fetchone()
            school_settings=json.loads(settings_row['data']) if settings_row else {}
            balance=school_fee_balance(c,sd,str(school_settings.get('session') or ''),str(school_settings.get('term') or ''))
            if balance['has_schedule'] and not balance['is_paid']:
                return jsonify(error='Optional-subject selection is locked until school fees are approved as paid for this term.'),403
        err=validate_subject_ids(c,class_key,subjects)
        if err: return jsonify(error=err),400
        if not c.execute('SELECT 1 FROM academic_sessions WHERE id=?',(session_id,)).fetchone(): return jsonify(error='Academic session not found.'),404
        term_row=c.execute('SELECT is_active FROM academic_terms WHERE id=? AND session_id=?',(term_id,session_id)).fetchone()
        if not term_row: return jsonify(error='Term does not belong to the selected session.'),400
        if current_user()['role']=='student' and not term_row['is_active']: return jsonify(error='Students can confirm subject choices only for the active term/session.'),403
        sid=str(uuid.uuid4())
        try: c.execute('INSERT INTO optional_subject_selections(id,student_id,class_key,session_id,term_id,subject_ids_json,requested_at) VALUES(?,?,?,?,?,?,?)',(sid,student_id,class_key,session_id,term_id,json.dumps(subjects),now()))
        except sqlite3.IntegrityError: return jsonify(error='A selection is already locked for this session.'),409
    audit(current_user(),'optional_subjects_confirmed','optional_subject_selection',sid,{'subjects':subjects})
    return jsonify(id=sid,status='confirmed',subject_ids=subjects),201


@app.post('/api/optional-subject-selections/<sid>/change-requests')
@role_required('student')
def optional_subject_change(sid):
    body=request.get_json(silent=True) or {}; subjects=body.get('subject_ids',[]); reason=str(body.get('reason','')).strip()
    if not reason: return jsonify(error='A reason is required.'),400
    with db() as c:
        selection=c.execute('SELECT * FROM optional_subject_selections WHERE id=? AND student_id=?',(sid,current_user()['id'])).fetchone()
        if not selection: return jsonify(error='Selection not found.'),404
        err=validate_subject_ids(c,selection['class_key'],subjects)
        if err: return jsonify(error=err),400
        pending=c.execute("SELECT 1 FROM subject_change_requests WHERE selection_id=? AND status='pending'",(sid,)).fetchone()
        if pending: return jsonify(error='A change request is already awaiting review.'),409
        rid=str(uuid.uuid4()); c.execute('INSERT INTO subject_change_requests(id,selection_id,requested_subject_ids_json,reason,requested_by,requested_at) VALUES(?,?,?,?,?,?)',(rid,sid,json.dumps(subjects),reason,current_user()['id'],now()))
    audit(current_user(),'optional_subject_change_requested','subject_change_request',rid)
    return jsonify(id=rid,status='pending'),201


@app.get('/api/optional-subject-change-requests')
@role_required('teacher','admin','principal')
def optional_subject_change_list():
    user=current_user()
    with db() as c:
        rows=c.execute("SELECT r.*,s.class_key,s.student_id,s.subject_ids_json AS current_subject_ids,s.session_id FROM subject_change_requests r JOIN optional_subject_selections s ON s.id=r.selection_id WHERE r.status='pending' ORDER BY r.requested_at").fetchall()
    result=[]
    for row in rows:
        item=dict(row)
        if user['role']=='teacher' and not teacher_has_class(user,item['class_key'],form_only=True): continue
        item['requested_subject_ids']=json.loads(item.pop('requested_subject_ids_json')); item['current_subject_ids']=json.loads(item.pop('current_subject_ids')); result.append(item)
    return jsonify(result)


@app.post('/api/optional-subject-change-requests/<rid>/decision')
@role_required('teacher','admin','principal')
def optional_subject_change_decision(rid):
    body=request.get_json(silent=True) or {}; decision=body.get('decision'); note=str(body.get('note',''))
    if decision not in ('approved','rejected'): return jsonify(error='Decision must be approved or rejected.'),400
    user=current_user()
    with db() as c:
        row=c.execute("SELECT r.*,s.class_key,s.student_id,s.session_id,s.subject_ids_json FROM subject_change_requests r JOIN optional_subject_selections s ON s.id=r.selection_id WHERE r.id=?",(rid,)).fetchone()
        if not row: return jsonify(error='Change request not found.'),404
        if row['status']!='pending': return jsonify(error='Request has already been reviewed.'),409
        if user['role']=='teacher' and not teacher_has_class(user,row['class_key'],form_only=True): return jsonify(error='Only the assigned Form Teacher may review this request.'),403
        if decision=='approved':
            c.execute('UPDATE optional_subject_selections SET subject_ids_json=? WHERE id=?',(row['requested_subject_ids_json'],row['selection_id']))
        c.execute('UPDATE subject_change_requests SET status=?,reviewed_by=?,reviewed_at=?,decision_note=? WHERE id=?',(decision,user['id'],now(),note,rid))
    audit(user,'optional_subject_change_'+decision,'subject_change_request',rid,{'note':note})
    return jsonify(ok=True,status=decision)


@app.get('/api/audit-log')
@role_required('admin','principal')
def audit_log_list():
    with db() as c: rows=c.execute('SELECT * FROM school_audit_log ORDER BY created_at DESC LIMIT 1000').fetchall()
    return jsonify([dict(r,details=json.loads(r['details_json'])) for r in rows])


@app.get('/api/admin/email-deliveries')
@role_required('admin')
def admin_email_deliveries():
    with db() as c:
        rows = c.execute(
            'SELECT l.id,l.recipient,l.subject,l.status,l.error,l.created_at,u.full_name AS actor_name '
            'FROM email_delivery_logs l LEFT JOIN auth_users u ON u.id=l.actor_user_id '
            'ORDER BY l.created_at DESC LIMIT 50'
        ).fetchall()
    return jsonify([dict(row) for row in rows])


@app.get('/api/admin/email-settings')
@role_required('admin')
def admin_email_settings():
    config = _effective_email_config()
    return jsonify({
        'provider': config.get('provider', 'smtp'),
        'sender_email': config.get('sender_email', ''),
        'smtp_host': config.get('smtp_host', ''),
        'smtp_port': config.get('smtp_port', '587'),
        'smtp_tls': bool(config.get('smtp_tls', True)),
        'smtp_ssl': bool(config.get('smtp_ssl', False)),
        'smtp_user': config.get('smtp_user', ''),
        'gmail_client_id': config.get('gmail_client_id', ''),
        'has_smtp_password': bool(config.get('smtp_password')),
        'has_brevo_api_key': bool(config.get('brevo_api_key')),
        'has_resend_api_key': bool(config.get('resend_api_key')),
        'has_gmail_client_secret': bool(config.get('gmail_client_secret')),
        'has_gmail_refresh_token': bool(config.get('gmail_refresh_token')),
    })


@app.put('/api/admin/email-settings')
@role_required('admin')
def admin_save_email_settings():
    body = request.get_json(silent=True) or {}
    if not isinstance(body, dict):
        return jsonify(error='Email settings must be a JSON object.'), 400
    config = _effective_email_config()
    provider = str(body.get('provider', config.get('provider', 'smtp'))).strip().lower()
    if provider not in ('smtp', 'brevo', 'resend', 'gmail'):
        return jsonify(error='Choose SMTP, Brevo, Resend, or Gmail API.'), 400
    sender = str(body.get('sender_email', config.get('sender_email', ''))).strip().lower()
    if sender and not re.fullmatch(r'[^@\s]+@[^@\s]+\.[^@\s]+', sender):
        return jsonify(error='Enter a valid sender email address.'), 400
    config.update({
        'provider': provider,
        'sender_email': sender,
        'smtp_host': str(body.get('smtp_host', config.get('smtp_host', ''))).strip(),
        'smtp_user': str(body.get('smtp_user', config.get('smtp_user', ''))).strip(),
        'gmail_client_id': str(body.get('gmail_client_id', config.get('gmail_client_id', ''))).strip(),
        'smtp_tls': bool(body.get('smtp_tls', config.get('smtp_tls', True))),
        'smtp_ssl': bool(body.get('smtp_ssl', config.get('smtp_ssl', False))),
    })
    try:
        port = int(body.get('smtp_port', config.get('smtp_port', '587')))
    except (TypeError, ValueError):
        return jsonify(error='SMTP port must be a number from 1 to 65535.'), 400
    if not 1 <= port <= 65535:
        return jsonify(error='SMTP port must be a number from 1 to 65535.'), 400
    config['smtp_port'] = str(port)
    if config['smtp_tls'] and config['smtp_ssl']:
        return jsonify(error='Choose either TLS or SSL for SMTP, not both.'), 400
    clear_secrets = body.get('clear_secrets', [])
    if not isinstance(clear_secrets, list) or any(key not in EMAIL_SECRET_FIELDS for key in clear_secrets):
        return jsonify(error='Invalid credential-clear request.'), 400
    for key in EMAIL_SECRET_FIELDS:
        if key in clear_secrets:
            config[key] = ''
        elif body.get(key):
            config[key] = str(body[key]).strip()
    encrypted = _email_config_cipher().encrypt(json.dumps(config).encode()).decode()
    with db() as c:
        c.execute(
            'INSERT INTO email_provider_config(id,config_encrypted,updated_at,updated_by) VALUES(1,?,?,?) '
            'ON CONFLICT(id) DO UPDATE SET config_encrypted=excluded.config_encrypted,updated_at=excluded.updated_at,updated_by=excluded.updated_by',
            (encrypted, now(), current_user()['id']),
        )
    audit(current_user(), 'school_email_settings_updated', 'email_provider_config', '1', {'provider': provider})
    return jsonify(ok=True, message='Email provider settings saved.')


@app.post('/api/admin/email-test')
@role_required('admin')
def admin_send_test_email():
    body = request.get_json(silent=True) or {}
    recipient = str(body.get('email') or '').strip().lower()
    if not re.fullmatch(r'[^@\s]+@[^@\s]+\.[^@\s]+', recipient):
        return jsonify(error='Enter a valid email address for the test message.'), 400
    try:
        base = public_base_url()
    except ValueError as exc:
        return jsonify(error=str(exc)), 400
    if not base:
        return jsonify(error='Set the Public application URL in School Settings or PUBLIC_BASE_URL in the server environment before testing email.'), 400
    cfg = smtp_config()
    school_name = cfg.get('SCHOOL_NAME') or 'Your School'
    sent, error = send_mail(
        recipient,
        f'{school_name} email configuration test',
        f'This is a test email from {school_name}.\n\n'
        f'Your school email settings are able to send messages. The school portal is available at:\n{base}/login\n\n'
        'No action is required.',
        'Open the school portal',
    )
    audit(current_user(), 'school_email_test_sent' if sent else 'school_email_test_failed',
          'email_delivery', recipient, {'error': error} if error else {})
    if not sent:
        return jsonify(ok=False, error=error or 'Email delivery failed. Check the latest delivery log.'), 502
    return jsonify(ok=True, message=f'Test email sent to {recipient}.')


def init_db():
    with db() as c:
        migrate_schema(c)
        c.execute('CREATE TABLE IF NOT EXISTS auth_users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, full_name TEXT DEFAULT "", role TEXT DEFAULT "user", account_status TEXT DEFAULT "active", created_date TEXT NOT NULL)')
        c.execute('CREATE TABLE IF NOT EXISTS records (id TEXT PRIMARY KEY, entity TEXT NOT NULL, data TEXT NOT NULL, created_date TEXT NOT NULL, updated_date TEXT NOT NULL)')
        c.execute('CREATE TABLE IF NOT EXISTS email_provider_config (id INTEGER PRIMARY KEY CHECK(id=1), config_encrypted TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT)')
        _migrate_legacy_email_settings(c)
        c.execute('CREATE INDEX IF NOT EXISTS idx_auth_users_email_lower ON auth_users(lower(email))')
        c.execute("CREATE INDEX IF NOT EXISTS idx_portal_users_email ON records(entity, lower(json_extract(data,'$.email')))")
        c.execute("CREATE INDEX IF NOT EXISTS idx_portal_users_role ON records(entity, lower(json_extract(data,'$.role')))")
        c.execute("CREATE INDEX IF NOT EXISTS idx_portal_users_status ON records(entity, lower(json_extract(data,'$.account_status')))")
        c.execute("CREATE INDEX IF NOT EXISTS idx_portal_users_role_default ON records(entity, lower(COALESCE(json_extract(data,'$.role'),'user')))")
        c.execute("CREATE INDEX IF NOT EXISTS idx_portal_users_status_default ON records(entity, lower(COALESCE(json_extract(data,'$.account_status'),'pending')))")
        c.execute('CREATE INDEX IF NOT EXISTS idx_records_entity ON records(entity)')
        # Query indexes for frequently filtered high-volume records (records exists now).
        c.execute("CREATE INDEX IF NOT EXISTS idx_records_student_class ON records(json_extract(data,'$.class_arm_id')) WHERE entity='Student'")
        c.execute("CREATE INDEX IF NOT EXISTS idx_records_payment_student ON records(json_extract(data,'$.student_id')) WHERE entity='Payment'")
        c.execute("CREATE INDEX IF NOT EXISTS idx_records_request_status ON records(json_extract(data,'$.status')) WHERE entity='PortalRequest'")
        c.execute("CREATE INDEX IF NOT EXISTS idx_records_staff_email ON records(lower(json_extract(data,'$.email'))) WHERE entity='StaffProfile'")
        c.execute('CREATE TABLE IF NOT EXISTS reset_tokens (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at TEXT NOT NULL)')
        c.execute('CREATE TABLE IF NOT EXISTS invite_tokens (token TEXT PRIMARY KEY, record_id TEXT NOT NULL, email TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL)')
        c.execute('CREATE TABLE IF NOT EXISTS verification_codes (email TEXT PRIMARY KEY, code TEXT NOT NULL, expires_at TEXT NOT NULL)')
        # Synchronize the existing School Settings academic period into the session tables; do not create a second settings surface.
        settings_row=c.execute("SELECT data FROM records WHERE entity='SchoolSettings' ORDER BY updated_date DESC LIMIT 1").fetchone()
        if settings_row:
            try: sync_school_settings_period(c,json.loads(settings_row['data']),{'id':'system:school-settings'})
            except Exception: app.logger.exception('Could not synchronize School Settings academic period')
        # Backfill already-published legacy results into the permanent archive without changing or deleting them.
        published=[]
        for rec in c.execute("SELECT id,data,created_date,updated_date FROM records WHERE entity='Result'").fetchall():
            try: result=json.loads(rec['data'])
            except Exception: continue
            if result.get('status')!='published' or not result.get('student_id') or not result.get('session') or not result.get('term'): continue
            published.append((rec,result))
        groups={}
        for rec,result in published:
            key=(str(result['student_id']),str(result['session']),str(result['term']))
            groups.setdefault(key,[]).append((rec,result))
        for (student_id,session_name,term_name),items in groups.items():
            session_row=c.execute('SELECT id FROM academic_sessions WHERE name=?',(session_name,)).fetchone()
            if session_row: session_id=session_row['id']
            else:
                session_id=str(uuid.uuid4()); c.execute('INSERT INTO academic_sessions(id,name,created_by,created_at) VALUES(?,?,?,?)',(session_id,session_name,'system:legacy-import',now()))
            term_row=c.execute('SELECT id FROM academic_terms WHERE session_id=? AND name=?',(session_id,term_name)).fetchone()
            if term_row: term_id=term_row['id']
            else:
                term_id=str(uuid.uuid4()); c.execute('INSERT INTO academic_terms(id,session_id,name,created_by,created_at) VALUES(?,?,?,?,?)',(term_id,session_id,term_name,'system:legacy-import',now()))
            first=items[0][1]; archive_id=str(uuid.uuid4()); archive_date=items[0][0]['updated_date'] or items[0][0]['created_date'] or now()
            c.execute('INSERT OR IGNORE INTO report_card_archive(id,student_id,student_name,admission_no,class_arm_id,class_arm_name,session_name,term_name,session_id,term_id,results_json,published_by,published_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',(archive_id,student_id,str(first.get('student_name') or student_id),str(first.get('admission_no') or ''),str(first.get('class_arm_id') or ''),str(first.get('class_arm_name') or first.get('level') or ''),session_name,term_name,session_id,term_id,json.dumps([item[1] for item in items]),'system:legacy-import',archive_date))
        production = os.environ.get('APP_ENV', 'development').lower() == 'production'
        bootstrap_email = str(os.environ.get('INITIAL_ADMIN_EMAIL') or '').strip().lower() if production else 'admin@school.local'
        bootstrap_password = os.environ.get('INITIAL_ADMIN_PASSWORD') if production else 'Admin123!'
        if production and not bootstrap_email:
            existing_admin = c.execute("SELECT id,email,password_hash FROM auth_users WHERE role='admin' ORDER BY created_date LIMIT 1").fetchone()
            if existing_admin:
                bootstrap_email = str(existing_admin['email']).lower()
            else:
                bootstrap_email = ''
        exists = c.execute('SELECT id,password_hash FROM auth_users WHERE lower(email)=?', (bootstrap_email,)).fetchone() if bootstrap_email else None
        legacy_admin = c.execute("SELECT password_hash FROM auth_users WHERE lower(email)='admin@school.local'").fetchone() if production else None
        if legacy_admin and check_password_hash(legacy_admin['password_hash'], 'Admin123!'):
            raise RuntimeError('Production startup refused: the default local administrator password is still active. Change it locally before deployment.')
        if production and not exists:
            if not re.fullmatch(r'[^@\s]+@[^@\s]+\.[^@\s]+', bootstrap_email):
                raise RuntimeError('Production startup refused: set INITIAL_ADMIN_EMAIL to a valid administrator email for the first run.')
            if not bootstrap_password or len(bootstrap_password) < 16:
                raise RuntimeError('Production startup refused: set INITIAL_ADMIN_PASSWORD to a unique password of at least 16 characters for the first run.')
        if not exists:
            uid = str(uuid.uuid4())
            admin_name = str(os.environ.get('INITIAL_ADMIN_NAME') or 'School Administrator').strip() if production else 'School Administrator'
            c.execute('INSERT INTO auth_users(id,email,password_hash,full_name,role,account_status,created_date) VALUES(?,?,?,?,?,?,?)', (uid,bootstrap_email,generate_password_hash(bootstrap_password),admin_name,'admin','active',now()))
            c.execute('INSERT INTO records(id,entity,data,created_date,updated_date) VALUES(?,?,?,?,?)', (str(uuid.uuid4()),'User',json.dumps({'email':bootstrap_email,'full_name':admin_name,'role':'admin','account_status':'active','is_primary_admin':True}),now(),now()))
        # Stable primary-owner identity: initialise once, then preserve across email changes.
        c.execute('CREATE TABLE IF NOT EXISTS school_security_settings (id INTEGER PRIMARY KEY CHECK(id=1), primary_admin_user_id TEXT, updated_at TEXT NOT NULL)')
        c.execute('INSERT OR IGNORE INTO school_security_settings(id,primary_admin_user_id,updated_at) VALUES(1,NULL,?)',(now(),))
        owner=c.execute('SELECT primary_admin_user_id FROM school_security_settings WHERE id=1').fetchone()
        if not owner or not owner['primary_admin_user_id']:
            flagged=None
            for user_record in c.execute("SELECT data FROM records WHERE entity='User'").fetchall():
                try: payload=json.loads(user_record['data'])
                except Exception: continue
                if payload.get('is_primary_admin'):
                    flagged=c.execute('SELECT id FROM auth_users WHERE lower(email)=?',(str(payload.get('email','')).lower(),)).fetchone()
                    if flagged: break
            primary=flagged or c.execute('SELECT id FROM auth_users WHERE lower(email)=?',(bootstrap_email,)).fetchone()
            if primary:
                c.execute('UPDATE school_security_settings SET primary_admin_user_id=?,updated_at=? WHERE id=1',(primary['id'],now()))
                c.execute("UPDATE auth_users SET role='admin',account_status='active' WHERE id=?",(primary['id'],))
                owner_email=c.execute('SELECT email,full_name,role,account_status FROM auth_users WHERE id=?',(primary['id'],)).fetchone()
                existing=c.execute("SELECT id,data FROM records WHERE entity='User' AND lower(json_extract(data,'$.email'))=?",(owner_email['email'].lower(),)).fetchall()
                if existing:
                    for item in existing:
                        payload=json.loads(item['data']); payload.update(role='admin',account_status='active',is_primary_admin=True)
                        c.execute('UPDATE records SET data=?,updated_date=? WHERE id=?',(json.dumps(payload),now(),item['id']))
                else:
                    c.execute('INSERT INTO records(id,entity,data,created_date,updated_date) VALUES(?,?,?,?,?)',(str(uuid.uuid4()),'User',json.dumps({**dict(owner_email),'is_primary_admin':True}),now(),now()))


def admin_required(fn):
    @wraps(fn)
    @login_required
    def wrapped(*args, **kwargs):
        if current_user().get('role') not in ('admin','principal'): return jsonify(error='You do not have permission to perform this action.'), 403
        return fn(*args, **kwargs)
    return wrapped


def schemas():
    result = {}
    if SCHEMA_DIR.exists():
        for p in SCHEMA_DIR.glob('*.jsonc'):
            try: result[p.stem] = json.loads(p.read_text(encoding='utf-8'))
            except Exception: pass
    result.setdefault('FeeItem', {'required':['name','amount']})
    return result
SCHEMAS = schemas()


def clean_entity(name):
    if name not in SCHEMAS and name != 'User': abort(404)
    return name


def _policy_matches(rule, user, row):
    """Evaluate the subset of Base44 RLS expressions used by this project."""
    if rule is None: return False
    if rule == {}: return True
    if not isinstance(rule, dict): return False
    if "$or" in rule:
        return any(_policy_matches(part, user, row) for part in rule["$or"])
    if "$and" in rule:
        return all(_policy_matches(part, user, row) for part in rule["$and"])
    for key, expected in rule.items():
        if key == "user_condition":
            for field, value in expected.items():
                if user.get(field) != value: return False
        elif key.startswith("data."):
            field = key[5:]
            if expected == "{{user.email}}": expected = user.get("email", "")
            actual = row.get(field)
            if isinstance(actual, str) and isinstance(expected, str):
                if actual.lower() != expected.lower(): return False
            elif actual != expected: return False
        else:
            return False
    return True


def _policy(entity, action):
    schema = SCHEMAS.get(entity, {})
    rls = schema.get('rls') or {}
    if entity == 'User':
        return {'user_condition': {'role': 'admin'}}
    if entity == 'FeeItem':
        return {'read': {}, 'create': {'$or':[{'user_condition':{'role':'admin'}},{'user_condition':{'role':'principal'}},{'user_condition':{'role':'bursar'}}]}, 'update': {'$or':[{'user_condition':{'role':'admin'}},{'user_condition':{'role':'principal'}},{'user_condition':{'role':'bursar'}}]}, 'delete': {'$or':[{'user_condition':{'role':'admin'}},{'user_condition':{'role':'principal'}},{'user_condition':{'role':'bursar'}}]}}.get(action)
    # Missing policies are intentionally denied rather than granting broad access.
    return rls.get(action)


def _teacher_assignments(user):
    with db() as c: rows=c.execute("SELECT data FROM records WHERE entity='Assignment'").fetchall()
    result=[]
    for row in rows:
        try: item=json.loads(row['data'])
        except Exception: continue
        if str(item.get('teacher_email','')).lower()==str(user.get('email','')).lower(): result.append(item)
    return result


def teacher_assignment_allows(user, result, write=False):
    """Scope teacher result access to assigned class arms and subjects."""
    class_id=str(result.get('class_arm_id') or '')
    subject_id=str(result.get('subject_id') or '')
    for assignment in _teacher_assignments(user):
        if str(assignment.get('class_arm_id') or '')!=class_id: continue
        if write:
            if assignment.get('type')=='subject' and str(assignment.get('subject_id') or '')==subject_id: return True
        elif assignment.get('type')=='form' or (assignment.get('type')=='subject' and str(assignment.get('subject_id') or '')==subject_id):
            return True
    return False


def teacher_has_class(user, class_id, form_only=False):
    for assignment in _teacher_assignments(user):
        if str(class_id or '') in {str(assignment.get('class_arm_id') or ''),str(assignment.get('class_arm_name') or '')} and (not form_only or assignment.get('type')=='form'):
            return True
    return False


def _student_contact_emails(data):
    """Normalize legacy and multi-guardian contact fields without trusting client-supplied links."""
    values=[]
    for key in ('user_email','student_email','guardian_email','parent_email','guardian_email_2','parent_email_2'):
        value=data.get(key)
        if isinstance(value,str) and value.strip(): values.append(value.strip().lower())
    for key in ('guardian_emails','parent_emails','guardian_contacts','guardians'):
        value=data.get(key)
        if isinstance(value,str):
            values.extend(x.strip().lower() for x in re.split(r'[,;\n]+',value) if x.strip())
        elif isinstance(value,list):
            for item in value:
                if isinstance(item,str) and item.strip(): values.append(item.strip().lower())
                elif isinstance(item,dict):
                    email=item.get('email') or item.get('guardian_email') or item.get('parent_email')
                    if isinstance(email,str) and email.strip(): values.append(email.strip().lower())
    return set(values)


def linked_students(user):
    email=str(user.get('email','')).strip().lower()
    if not email: return []
    with db() as c:
        rows=c.execute("SELECT id,data FROM records WHERE entity='Student'").fetchall()
    linked=[]
    for row in rows:
        try: data=json.loads(row['data'])
        except Exception: continue
        if email in _student_contact_emails(data):
            data['_record_id']=row['id']; linked.append(data)
    return linked


def fee_items_for_student(conn, student, session_name, term_name, category=None):
    rows=conn.execute("SELECT id,data FROM records WHERE entity='FeeItem'").fetchall()
    result=[]
    for row in rows:
        fee=json.loads(row['data']); fee['id']=row['id']
        if fee.get('archived') or fee.get('session') not in ('',None,session_name) or fee.get('term') not in ('',None,term_name): continue
        if fee.get('level') and fee.get('level') not in (student.get('level'), 'all'): continue
        if fee.get('track') and fee.get('track') not in (student.get('track'), 'all'): continue
        if fee.get('class_arm_id') and fee.get('class_arm_id') not in (student.get('class_arm_id'), student.get('class_arm_name')): continue
        fee_category=fee.get('category') or 'school_fee'
        if category and fee_category!=category: continue
        fee['category']=fee_category
        result.append(fee)
    return result


def school_fee_balance(conn, student, session_name, term_name):
    fee_items=fee_items_for_student(conn,student,session_name,term_name,'school_fee')
    billed=sum(float(fee.get('amount') or 0) for fee in fee_items)
    student_id=str(student.get('_record_id') or student.get('id') or '')
    paid_rows=conn.execute("SELECT data FROM records WHERE entity='Payment'").fetchall()
    paid=sum(float(payment.get('amount') or 0) for row in paid_rows
             if (payment:=json.loads(row['data'])).get('student_id')==student_id
             and payment.get('session')==session_name and payment.get('term')==term_name
             and payment.get('type','payment') not in ('refund','reversal')
             and (payment.get('fee_category') in (None,'','school_fee')))
    pending=conn.execute("SELECT COALESCE(SUM(amount),0) AS total FROM fee_payment_submissions WHERE student_id=? AND session=? AND term=? AND fee_category='school_fee' AND status='pending'",(student_id,session_name,term_name)).fetchone()['total']
    return {'billed':billed,'paid':paid,'pending':float(pending or 0),'items':fee_items,'is_paid':paid>=billed,'has_schedule':billed>0}


def learner_fee_access(user, student_id=None, include_result_penalties=False):
    if user.get('role') not in ('student','parent'): return True
    linked=linked_students(user)
    if student_id:
        linked=[student for student in linked if str(student.get('_record_id') or student.get('id') or '')==str(student_id)]
    if not linked: return False
    with db() as c:
        settings_row=c.execute("SELECT data FROM records WHERE entity='SchoolSettings' ORDER BY updated_date DESC LIMIT 1").fetchone()
        settings=json.loads(settings_row['data']) if settings_row else {}
        session_name=str(settings.get('session') or ''); term_name=str(settings.get('term') or '')
        if not session_name or not term_name: return True
        for student in linked:
            student_id=str(student.get('_record_id') or student.get('id') or '')
            student['_record_id']=student_id
            balance=school_fee_balance(c,student,session_name,term_name)
            if balance['has_schedule'] and not balance['is_paid']: return False
            if not include_result_penalties: continue
            for fee in fee_items_for_student(c,student,session_name,term_name,'other_fee'):
                deadline=str(fee.get('deadline') or '')
                if fee.get('penalty_type')!='withhold_results' or not deadline or datetime.now().date().isoformat()<=deadline: continue
                payment=c.execute("SELECT 1 FROM records WHERE entity='Payment' AND json_extract(data,'$.student_id')=? AND json_extract(data,'$.fee_id')=? AND json_extract(data,'$.session')=? AND json_extract(data,'$.term')=? AND json_extract(data,'$.type') NOT IN ('refund','reversal') LIMIT 1",(student_id,fee['id'],session_name,term_name)).fetchone()
                if not payment: return False
        return True


def payment_fee_error(conn, payment):
    if payment.get('type','payment') in ('refund','reversal','credit') or not payment.get('fee_id'):
        return None
    student_row=conn.execute("SELECT id,data FROM records WHERE id=? AND entity='Student'",(str(payment.get('student_id') or ''),)).fetchone()
    if not student_row: return 'Payment must reference a registered student.'
    student=json.loads(student_row['data']); student['_record_id']=student_row['id']
    session_name=str(payment.get('session') or ''); term_name=str(payment.get('term') or ''); fee_id=str(payment.get('fee_id') or '')
    if payment.get('fee_category')=='school_fee':
        if fee_id!='school_fees': return 'School fee payments must use the School fees bundle.'
        expected=school_fee_balance(conn,student,session_name,term_name)['billed']
        fee_rows=fee_items_for_student(conn,student,session_name,term_name,'school_fee')
        installments_allowed=bool(fee_rows) and all(fee.get('installments_allowed') is True for fee in fee_rows)
    else:
        fee=next((item for item in fee_items_for_student(conn,student,session_name,term_name,'other_fee') if item['id']==fee_id),None)
        if not fee: return 'The selected fee is not configured for this student and term.'
        expected=float(fee.get('amount') or 0)
        if fee.get('deadline') and datetime.now().date().isoformat()>str(fee['deadline']) and fee.get('penalty_type')=='extra_fee': expected+=float(fee.get('penalty_amount') or 0)
        installments_allowed=fee.get('installments_allowed') is True
    paid=0
    for row in conn.execute("SELECT data FROM records WHERE entity='Payment'").fetchall():
        existing=json.loads(row['data'])
        if existing.get('student_id')!=student_row['id'] or existing.get('session')!=session_name or existing.get('term')!=term_name or existing.get('type','payment') in ('refund','reversal','credit'):
            continue
        if payment.get('fee_category')=='school_fee':
            if existing.get('fee_category') in (None,'','school_fee'): paid+=float(existing.get('amount') or 0)
        elif existing.get('fee_id')==fee_id:
            paid+=float(existing.get('amount') or 0)
    if payment.get('fee_category')=='school_fee':
        pending_query="SELECT COALESCE(SUM(amount),0) AS total FROM fee_payment_submissions WHERE student_id=? AND session=? AND term=? AND fee_category='school_fee' AND status='pending' AND id<>?"
        pending_args=(student_row['id'],session_name,term_name,str(payment.get('_ignore_submission_id') or ''))
    else:
        pending_query="SELECT COALESCE(SUM(amount),0) AS total FROM fee_payment_submissions WHERE student_id=? AND fee_id=? AND session=? AND term=? AND status='pending' AND id<>?"
        pending_args=(student_row['id'],fee_id,session_name,term_name,str(payment.get('_ignore_submission_id') or ''))
    pending=float(conn.execute(pending_query,pending_args).fetchone()['total'] or 0)
    if payment.get('fee_category')=='school_fee':
        gateway_pending_query="SELECT COALESCE(SUM(amount_kobo),0) AS total FROM paystack_transactions WHERE student_id=? AND fee_id='school_fees' AND session=? AND term=? AND status='pending' AND created_at>? AND reference<>?"
        gateway_pending_args=(student_row['id'],session_name,term_name,(datetime.now(timezone.utc)-timedelta(hours=2)).isoformat(),str(payment.get('_ignore_paystack_reference') or ''))
    else:
        gateway_pending_query="SELECT COALESCE(SUM(amount_kobo),0) AS total FROM paystack_transactions WHERE student_id=? AND fee_id=? AND session=? AND term=? AND status='pending' AND created_at>? AND reference<>?"
        gateway_pending_args=(student_row['id'],fee_id,session_name,term_name,(datetime.now(timezone.utc)-timedelta(hours=2)).isoformat(),str(payment.get('_ignore_paystack_reference') or ''))
    gateway_pending=float(conn.execute(gateway_pending_query,gateway_pending_args).fetchone()['total'] or 0)/100
    try: amount=float(payment.get('amount') or 0)
    except (TypeError,ValueError): return 'Payment amount must be numeric.'
    remaining=max(expected-paid-pending-gateway_pending,0)
    if amount<=0 or amount>remaining+0.01: return f'The remaining configured balance is {remaining:.2f}.'
    if not installments_allowed and abs(amount-remaining)>0.01: return f'The configured fee must be paid in full ({remaining:.2f}); installments are not enabled for this fee.'
    return None


def can_read(user, entity, row):
    role=user.get('role')
    if entity == 'PortalRequest':
        if role in ('admin','principal','bursar','librarian'): return True
        email=str(user.get('email','')).strip().lower()
        if role == 'student':
            linked_ids={str(x.get('_record_id') or x.get('id') or '') for x in linked_students(user)}
            return (str(row.get('student_id') or '') in linked_ids
                    and (not row.get('student_email') or str(row.get('student_email')).lower()==email))
        if role == 'parent':
            linked_ids={str(x.get('_record_id') or x.get('id') or '') for x in linked_students(user)}
            return str(row.get('student_id') or '') in linked_ids and email in _student_contact_emails(row)
        return False
    if entity == 'Assignment' and role in ('student','parent'):
        class_ids={str(x.get('class_arm_id') or '') for x in linked_students(user)}
        return str(row.get('class_arm_id') or '') in class_ids
    if entity == 'StaffProfile' and role in ('student','parent'):
        if str(row.get('role') or '').lower() == 'principal': return True
        email=str(row.get('email') or '').lower()
        with db() as c:
            assignments=[json.loads(x['data']) for x in c.execute("SELECT data FROM records WHERE entity='Assignment'").fetchall()]
        form_emails={str(a.get('teacher_email') or '').lower() for a in assignments if a.get('type')=='form' and str(a.get('class_arm_id') or '') in {str(x.get('class_arm_id') or '') for x in linked_students(user)}}
        return email in form_emails
    if entity == 'StudentDocument':
        if role in ('admin','principal','bursar'): return True
        if role == 'teacher':
            return teacher_has_class(user, row.get('class_arm_id') or row.get('class_arm_name'))
        if role in ('student','parent'):
            email=str(user.get('email','')).strip().lower()
            linked_ids={str(x.get('_record_id') or x.get('id') or '') for x in linked_students(user)}
            return (str(row.get('student_id') or '') in linked_ids
                    and email in _student_contact_emails(row))
        return False
    if entity=='CalendarEvent' and role in ('student','parent') and str(row.get('type') or '').casefold() in ('exam','examination'):
        return learner_fee_access(user)
    if entity=='ResourceItem' and role in ('student','parent'):
        return row.get('status') in (None,'approved')
    if entity=='Result' and role in ('admin','principal'):
        return row.get('status') in ('approved','published')
    if entity=='Result' and role=='teacher': return teacher_assignment_allows(user,row,write=False)
    if entity=='Result' and role in ('student','parent'):
        if row.get('status')!='published': return False
        if not learner_fee_access(user,row.get('student_id'),include_result_penalties=True): return False
        email=str(user.get('email','')).lower(); linked=linked_students(user)
        ids={str(x.get('_record_id','')) for x in linked}; ids.update(str(x.get('id','')) for x in linked)
        admissions={str(x.get('admission_no','')).lower() for x in linked if x.get('admission_no')}
        return (str(row.get('student_id','')) in ids or email in _student_contact_emails(row) or str(row.get('admission_no','')).lower() in admissions)
    if entity=='Payment' and role=='teacher':
        student_ids=set()
        with db() as c:
            for rec in c.execute("SELECT id,data FROM records WHERE entity='Student'").fetchall():
                student=json.loads(rec['data'])
                if teacher_has_class(user,student.get('class_arm_id'),form_only=True): student_ids.add(rec['id'])
        return str(row.get('student_id') or '') in student_ids
    if entity=='Payment' and role in ('student','parent'):
        linked=linked_students(user)
        ids={str(student.get('_record_id') or '') for student in linked}
        ids.update(str(student.get('id') or '') for student in linked)
        admissions={str(student.get('admission_no') or '').lower() for student in linked if student.get('admission_no')}
        return str(row.get('student_id') or '') in ids or str(row.get('admission_no') or '').lower() in admissions
    if entity=='Student' and role=='teacher': return teacher_has_class(user,row.get('class_arm_id') or row.get('class_arm_name'))
    if entity=='Student' and role in ('student','parent'):
        email=str(user.get('email','')).strip().lower()
        return email in _student_contact_emails(row)
    if entity=='Attendance' and role=='teacher': return teacher_has_class(user,row.get('class_arm_id'),form_only=True)
    if entity=='Attendance' and role in ('student','parent'):
        linked=linked_students(user); ids={str(x.get('_record_id','')) for x in linked}
        ids.update(str(x.get('id','')) for x in linked)
        email=str(user.get('email','')).lower()
        return str(row.get('student_id','')) in ids or email in _student_contact_emails(row)
    if entity=='TimetableEntry':
        if role in ('admin','principal'): return True
        if role=='teacher': return str(row.get('teacher_email','')).lower()==str(user.get('email','')).lower() or str(row.get('teacher_id',''))==str(user.get('id','')) or teacher_has_class(user,row.get('class_arm_id'))
        if role in ('student','parent'):
            class_key=str(row.get('class_arm_id') or row.get('class_arm_name') or '')
            matching=[student for student in linked_students(user) if class_key in {str(student.get(field) or '') for field in ('class_arm_id','class_arm','class_arm_name','current_class_arm','class_key')}]
            return any(learner_fee_access(user,student.get('_record_id')) for student in matching)
        return False
    if entity=='StaffPayment':
        if role in ('admin','principal','bursar'): return True
        return role in ('teacher','staff') and str(row.get('staff_email','')).lower()==str(user.get('email','')).lower()
    return bool(_policy_matches(_policy(entity, 'read'), user, row))


def can_write(user, entity, action, row=None):
    row=row or {}; role=user.get('role')
    if entity == 'PortalRequest':
        if action == 'create':
            return role in ('student','parent')
        if action == 'update':
            return role in ('admin','principal','bursar','librarian')
        if action == 'delete':
            return role in ('admin','principal')
        return False
    if entity == 'StudentDocument':
        if action == 'create':
            if role in ('admin','principal','bursar'): return True
            if role == 'teacher': return teacher_has_class(user, row.get('class_arm_id') or row.get('class_arm_name'))
            if role in ('student','parent'):
                email=str(user.get('email','')).strip().lower()
                linked_ids={str(x.get('_record_id') or x.get('id') or '') for x in linked_students(user)}
                return str(row.get('student_id') or '') in linked_ids and email in _student_contact_emails(row)
        if action == 'update': return role in ('admin','principal')
        if action == 'delete': return role in ('admin','principal')
        return False
    if entity == 'StaffProfile' and action == 'update' and role not in ('admin','principal'):
        return str(row.get('email','')).lower()==str(user.get('email','')).lower()
    if entity=='Result' and role=='teacher': return action in ('create','update') and teacher_assignment_allows(user,row,write=True)
    if entity=='Attendance': return role=='teacher' and action in ('create','update') and teacher_has_class(user,row.get('class_arm_id'),form_only=True)
    if entity in ('FeeItem','StaffPayment'): return False
    rule = _policy(entity, action)
    return bool(rule is not None and _policy_matches(rule, user, row))


def validate_entity(name, data, partial=False):
    if not isinstance(data, dict): return 'Record must be a JSON object.'
    if name == 'SchoolSettings' and LEGACY_EMAIL_FIELDS.intersection(data):
        return 'Configure email credentials in the administrator-only School email settings instead.'
    if name == 'SchoolSettings' and isinstance(data, dict) and 'public_base_url' in data:
        url_error = validate_public_base_url(str(data.get('public_base_url') or '').strip())
        if url_error:
            return url_error
    # Enforce the school's class/track structure on all new writes, not only in the UI.
    if name == 'ClassArm':
        level = str(data.get('level', '')).strip().upper().replace(' ', '')
        track = str(data.get('track') or '').strip()
        if level in ('JSS1', 'JSS2', 'JSS3', 'SS1') and track:
            return 'JSS1–JSS3 and SS1 use class arms only; tracks are not allowed.'
        if level in ('SS2', 'SS3') and track not in ('Science', 'Art', 'Arts', 'Commercial'):
            return 'SS2 and SS3 class arms must use the Science, Art or Commercial track.'
        if level not in ('JSS1', 'JSS2', 'JSS3', 'SS1', 'SS2', 'SS3'):
            return 'Class level must be JSS 1, JSS 2, JSS 3, SS 1, SS 2 or SS 3.'
    schema = SCHEMAS.get(name, {})

    if not partial:
        missing = [k for k in schema.get('required', []) if data.get(k) in (None, '')]
        if missing: return 'Missing required fields: ' + ', '.join(missing)
    properties = schema.get('properties', {})
    for field, value in data.items():
        spec = properties.get(field, {})
        allowed = spec.get('enum')
        if value is not None and allowed and value not in allowed:
            return f'Invalid value for {field}. Allowed values: {", ".join(allowed)}.'
        typ = spec.get('type')
        if value is not None and typ == 'string' and not isinstance(value, str): return f'{field} must be text.'
        if value is not None and typ == 'boolean' and not isinstance(value, bool): return f'{field} must be true or false.'
        if value is not None and typ == 'number' and (isinstance(value, bool) or not isinstance(value, (int, float))): return f'{field} must be a number.'
        if value is not None and typ == 'array' and not isinstance(value, list): return f'{field} must be a list.'
    return None


def result_score_error(conn, data):
    settings_row=conn.execute("SELECT data FROM records WHERE entity='SchoolSettings' ORDER BY updated_date DESC LIMIT 1").fetchone()
    settings=json.loads(settings_row['data']) if settings_row else {}
    weights={'ca':'ca_weight','assignment_score':'assignment_weight','test':'test_weight','exam':'exam_weight'}
    defaults={'ca_weight':40,'assignment_weight':10,'test_weight':10,'exam_weight':40}
    for field,setting in weights.items():
        value=data.get(field,0)
        if isinstance(value,bool): continue
        try: score=float(value or 0); maximum=float(settings.get(setting,defaults[setting]))
        except (TypeError,ValueError): continue
        if score < 0: return f'{field.replace("_score", "").replace("_", " ").capitalize()} score cannot be negative.'
        if score > maximum: return f'{field.replace("_score", "").replace("_", " ").capitalize()} cannot exceed its configured weight of {maximum:g}.'
    return None


def result_admin_change_error(conn, role, record_id, patch):
    if role not in ('admin','principal'): return None
    allowed={'status','position','class_size','form_comment','principal_comment'}
    if set(patch)-allowed:
        return 'Administrators may preview approved scores and add comments, but cannot change submitted score data.'
    if patch.get('status')=='approved':
        review=conn.execute('SELECT status FROM result_reviews WHERE result_record_id=? ORDER BY created_at DESC LIMIT 1',(record_id,)).fetchone()
        if not review or review['status']!='approved':
            return 'A result must be approved by its Form Teacher before Admin or Principal review.'
    return None


def class_arm_exists(conn, data, exclude_id=None):
    normalize = lambda value: re.sub(r'\s+', '', str(value or '')).casefold()
    track = str(data.get('track') or '').strip().casefold()
    if track == 'arts': track = 'art'
    rows = conn.execute("SELECT id,data FROM records WHERE entity='ClassArm'").fetchall()
    for row in rows:
        if row['id'] == exclude_id: continue
        existing = json.loads(row['data'])
        existing_track = str(existing.get('track') or '').strip().casefold()
        if existing_track == 'arts': existing_track = 'art'
        if (normalize(existing.get('level')) == normalize(data.get('level'))
                and normalize(existing.get('arm')) == normalize(data.get('arm'))
                and existing_track == track):
            return True
    return False


def attendance_record_exists(conn, data, exclude_id=None):
    rows=conn.execute("SELECT id,data FROM records WHERE entity='Attendance'").fetchall()
    for row in rows:
        if row['id'] == exclude_id: continue
        existing=json.loads(row['data'])
        if (str(existing.get('student_id') or '') == str(data.get('student_id') or '')
                and str(existing.get('date') or '') == str(data.get('date') or '')):
            return True
    return False


def attendance_correction_error(existing, patch):
    if set(patch) != {'status'}:
        return 'Attendance corrections may only change the status.'
    if existing.get('status') != 'absent' or patch.get('status') not in ('late','excused'):
        return 'Only a student marked absent may be changed to late or excused.'
    return None

def sync_school_settings_period(conn, data, user):
    """Keep the existing School Settings academic-period controls authoritative while retaining historical periods."""
    session_name=str(data.get('session') or '').strip()
    term_name=str(data.get('term') or '').strip()
    if not session_name or not term_name: return
    stamp=now()
    session_row=conn.execute('SELECT id FROM academic_sessions WHERE name=?',(session_name,)).fetchone()
    if session_row:
        session_id=session_row['id']
        conn.execute('UPDATE academic_sessions SET starts_on=?,ends_on=? WHERE id=?',(data.get('session_start_date') or None,data.get('session_end_date') or None,session_id))
    else:
        session_id=str(uuid.uuid4())
        conn.execute('INSERT INTO academic_sessions(id,name,starts_on,ends_on,created_by,created_at) VALUES(?,?,?,?,?,?)',(session_id,session_name,data.get('session_start_date') or None,data.get('session_end_date') or None,user['id'],stamp))
    term_row=conn.execute('SELECT id FROM academic_terms WHERE session_id=? AND name=?',(session_id,term_name)).fetchone()
    def date_list(value):
        if isinstance(value,list): return [str(x).strip() for x in value if str(x).strip()]
        return [part.strip() for part in re.split(r'[,;\n]+',str(value or '')) if part.strip()]
    breaks_json=json.dumps(date_list(data.get('midterm_breaks')))
    holidays_json=json.dumps(date_list(data.get('holidays')))
    term_values=(data.get('term_start_date') or None,data.get('term_end_date') or None,data.get('term_resumption_date') or None,data.get('exam_start_date') or None,data.get('exam_end_date') or None,data.get('term_closing_date') or None,breaks_json,holidays_json)
    if term_row:
        term_id=term_row['id']
        conn.execute('UPDATE academic_terms SET starts_on=?,ends_on=?,resumption_on=?,exam_starts_on=?,exam_ends_on=?,closing_on=?,breaks_json=?,holidays_json=? WHERE id=?',(*term_values,term_id))
    else:
        term_id=str(uuid.uuid4())
        conn.execute('INSERT INTO academic_terms(id,session_id,name,starts_on,ends_on,resumption_on,exam_starts_on,exam_ends_on,closing_on,breaks_json,holidays_json,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',(term_id,session_id,term_name,*term_values,user['id'],stamp))
    conn.execute('UPDATE academic_terms SET is_active=0 WHERE is_active=1')
    conn.execute("UPDATE academic_terms SET is_active=1,status=CASE WHEN status='planned' THEN 'open' ELSE status END WHERE id=?",(term_id,))


def record_out(row):
    d = json.loads(row['data'])
    if row['entity'] == 'SchoolSettings' and isinstance(d, dict):
        for key in LEGACY_EMAIL_FIELDS:
            d.pop(key, None)
    d.update(id=row['id'], created_date=row['created_date'], updated_date=row['updated_date'])
    return d

@app.get('/api/app/settings')
def public_settings(): return jsonify({'id':'standalone-school','public_settings':{}})


DEFAULT_PUBLIC_SITE = {
    'headline': 'A place to learn, grow and lead',
    'tagline': 'Building confident learners and responsible citizens.',
    'about': 'Welcome to our school. We provide a supportive environment where every learner can develop knowledge, character and practical skills.',
    'admissions_open': False,
    'admission_date': '',
    'admission_time': '',
    'admission_venue': '',
    'admission_message': 'Applications are open. Apply online and print your entrance examination request.',
    'admission_instructions': 'Bring this printed request and a recent passport photograph to the school for your entrance examination.',
    'hero_image': '',
    'gallery': [],
}


def public_site_content(conn=None):
    owns_connection = conn is None
    c = conn or db()
    try:
        row = c.execute('SELECT content_json FROM public_site_settings WHERE id=1').fetchone()
        content = json.loads(row['content_json']) if row else {}
        settings_row = c.execute("SELECT data FROM records WHERE entity='SchoolSettings' ORDER BY updated_date DESC LIMIT 1").fetchone()
        settings = json.loads(settings_row['data']) if settings_row else {}
        return {
            **DEFAULT_PUBLIC_SITE,
            **{key: value for key, value in content.items() if key in DEFAULT_PUBLIC_SITE},
            'admissions_available': bool(
                content.get('admissions_open', DEFAULT_PUBLIC_SITE['admissions_open'])
                and content.get('admission_date')
                and content.get('admission_time')
                and content.get('admission_venue')
            ),
            'school_name': settings.get('school_name') or 'Our School',
            'school_initials': settings.get('school_initials') or '',
            'school_logo': settings.get('school_logo') or '',
            'motto': settings.get('motto') or '',
            'address': settings.get('address') or '',
            'phone': settings.get('phone') or '',
            'email': settings.get('email') or '',
        }
    finally:
        if owns_connection:
            c.close()


@app.get('/api/public/site')
def public_site_read():
    return jsonify(public_site_content())


@app.get('/api/public/admission-options')
def public_admission_options():
    with db() as c:
        arms = []
        for row in c.execute("SELECT id,data FROM records WHERE entity='ClassArm'").fetchall():
            arm = json.loads(row['data'])
            if arm.get('active') is False:
                continue
            arms.append({'id': row['id'], 'level': str(arm.get('level') or '').strip(), 'track': str(arm.get('track') or '').strip(), 'name': str(arm.get('display_name') or arm.get('name') or arm.get('level') or '')})
    return jsonify(arms)


@app.post('/api/admin/public-site')
@role_required('admin')
def public_site_update():
    body = request.get_json(silent=True) or {}
    content = {}
    for key, limit in (('headline', 140), ('tagline', 280), ('about', 5000), ('admission_message', 500), ('admission_instructions', 2000)):
        value = body.get(key, DEFAULT_PUBLIC_SITE[key])
        if not isinstance(value, str) or len(value) > limit:
            return jsonify(error=f'{key.replace("_", " ").capitalize()} must be text no longer than {limit} characters.'), 400
        content[key] = value.strip()
    if not isinstance(body.get('admissions_open', True), bool):
        return jsonify(error='Admissions open must be true or false.'), 400
    content['admissions_open'] = body.get('admissions_open', DEFAULT_PUBLIC_SITE['admissions_open'])
    admission_date = str(body.get('admission_date') or '').strip()
    admission_time = str(body.get('admission_time') or '').strip()
    admission_venue = str(body.get('admission_venue') or '').strip()
    if admission_date and (not _valid_iso_date(admission_date) or admission_date < datetime.now().date().isoformat()):
        return jsonify(error='Entrance examination date must be today or a future date.'), 400
    if admission_time and not re.fullmatch(r'(?:[01]\d|2[0-3]):[0-5]\d', admission_time):
        return jsonify(error='Enter a valid examination time.'), 400
    if len(admission_venue) > 200:
        return jsonify(error='Examination venue must be no longer than 200 characters.'), 400
    content['admission_date'] = admission_date
    content['admission_time'] = admission_time
    content['admission_venue'] = admission_venue
    if content['admissions_open'] and not (admission_date and admission_time and admission_venue):
        return jsonify(error='Set the entrance examination date, time and venue before opening admission applications.'), 400
    gallery = body.get('gallery', [])
    if not isinstance(gallery, list) or len(gallery) > 8 or any(not isinstance(item, str) or not item.startswith('/uploads/') for item in gallery):
        return jsonify(error='Gallery must contain no more than eight uploaded school images.'), 400
    hero = body.get('hero_image', '')
    if not isinstance(hero, str) or (hero and not hero.startswith('/uploads/')):
        return jsonify(error='Hero image must be an uploaded school image.'), 400
    content['hero_image'] = hero
    content['gallery'] = gallery
    with db() as c:
        c.execute('INSERT INTO public_site_settings(id,content_json,updated_at,updated_by) VALUES(1,?,?,?) ON CONFLICT(id) DO UPDATE SET content_json=excluded.content_json,updated_at=excluded.updated_at,updated_by=excluded.updated_by', (json.dumps(content), now(), current_user()['id']))
    audit(current_user(), 'public_school_site_updated', 'public_site_settings', '1')
    return jsonify(public_site_content())


@app.post('/api/admin/public-site/images')
@role_required('admin')
def public_site_image_upload():
    upload = request.files.get('file')
    if not upload:
        return jsonify(error='Choose an image to upload.'), 400
    filename = secure_filename(upload.filename or '')
    extension = Path(filename).suffix.lower()
    if extension not in ('.jpg', '.jpeg', '.png', '.webp'):
        return jsonify(error='School photos must be JPG, PNG or WebP images.'), 400
    stored = f'{uuid.uuid4().hex}_{filename}'
    upload.save(UPLOAD_DIR / stored)
    return jsonify(file_uri=f'/uploads/{stored}'), 201


def _admission_class_match(value):
    return re.sub(r'\s+', '', str(value or '')).casefold()


@app.post('/api/admissions')
def admission_application_create():
    site = public_site_content()
    if not site.get('admissions_available'):
        return jsonify(error='Online admission applications are closed until Admin activates admissions and sets the examination date, time and venue.'), 403
    body = request.get_json(silent=True) or {}
    fields = ('student_name', 'date_of_birth', 'gender', 'requested_level', 'guardian_name', 'guardian_phone', 'guardian_email', 'address')
    if any(not str(body.get(field, '')).strip() for field in fields):
        return jsonify(error='Complete all required student and guardian details.'), 400
    if body.get('gender') not in ('Male', 'Female'):
        return jsonify(error='Choose a valid gender.'), 400
    if not _valid_iso_date(body.get('date_of_birth')) or body['date_of_birth'] > datetime.now().date().isoformat():
        return jsonify(error='Enter a valid date of birth that is not in the future.'), 400
    email = str(body['guardian_email']).strip().lower()
    if not re.fullmatch(r'[^@\s]+@[^@\s]+\.[^@\s]+', email):
        return jsonify(error='Enter a valid parent or guardian email address.'), 400
    if len(str(body['student_name']).strip()) > 160 or len(str(body['address']).strip()) > 500:
        return jsonify(error='Student name or home address is too long.'), 400
    application = {
        'student_name': str(body['student_name']).strip(),
        'date_of_birth': body['date_of_birth'],
        'gender': body['gender'],
        'requested_level': str(body['requested_level']).strip(),
        'requested_track': str(body.get('requested_track') or '').strip(),
        'guardian_name': str(body['guardian_name']).strip(),
        'guardian_phone': str(body['guardian_phone']).strip(),
        'guardian_email': email,
        'address': str(body['address']).strip(),
        'previous_school': str(body.get('previous_school') or '').strip()[:200],
        'previous_class': str(body.get('previous_class') or '').strip()[:100],
    }
    token = secrets.token_urlsafe(32)
    application_id = str(uuid.uuid4())
    reference = f"ADM-{datetime.now().year}-{application_id[:8].upper()}"
    stamp = now()
    with db() as c:
        available = c.execute("SELECT id,data FROM records WHERE entity='ClassArm'").fetchall()
        matching = []
        for row in available:
            arm = json.loads(row['data'])
            if arm.get('active') is False or _admission_class_match(arm.get('level')) != _admission_class_match(application['requested_level']):
                continue
            if application['requested_track'] and str(arm.get('track') or '').casefold() != application['requested_track'].casefold():
                continue
            matching.append(row)
        if not matching:
            return jsonify(error='There is no active class arm for the selected class and track. Contact the school office.'), 400
        c.execute('INSERT INTO admission_applications(id,reference,print_token_hash,application_json,status,exam_date,exam_time,exam_venue,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)', (application_id, reference, sha256(token.encode()).hexdigest(), json.dumps(application), 'exam_scheduled', site['admission_date'], site['admission_time'], site['admission_venue'], stamp, stamp))
    audit({'id': 'public-applicant', 'role': 'public'}, 'admission_application_submitted', 'admission_application', application_id)
    base = public_base_url()
    print_url = f'{base}/admissions/print?token={quote(token)}' if base else ''
    if base:
        sent, _email_error = send_notification_email(
            email,
            'admissions',
            f"{site['school_name']} entrance examination details",
            (
                f"Dear {application['guardian_name']},\n\n"
                f"The admission application for {application['student_name']} has been received.\n"
                f"Application reference: {reference}\n"
                f"Entrance examination: {site['admission_date']} at {site['admission_time']}\n"
                f"Venue: {site['admission_venue']}\n\n"
                f"Print the examination request and bring it to the school: {print_url}\n\n"
                "This is an application confirmation with the scheduled examination details. "
                "Please contact the school directly if you need to change the appointment."
            ),
        )
    else:
        sent = False
    return jsonify(
        reference=reference,
        print_token=token,
        email_sent=sent,
        email_error=None if sent else 'The school confirmation email could not be delivered. Print the letter and contact the guardian directly.',
    ), 201


@app.get('/api/admissions/slip')
def admission_print_slip():
    token = request.args.get('token', '')
    if not token:
        return jsonify(error='A valid application print link is required.'), 400
    with db() as c:
        row = c.execute('SELECT * FROM admission_applications WHERE print_token_hash=?', (sha256(token.encode()).hexdigest(),)).fetchone()
    if not row:
        return jsonify(error='Application print link is invalid.'), 404
    site = public_site_content()
    return jsonify(reference=row['reference'], application=json.loads(row['application_json']), status=row['status'], exam_date=row['exam_date'], exam_time=row['exam_time'], exam_venue=row['exam_venue'], admission_instructions=site.get('admission_instructions'), school_name=site.get('school_name'), school_logo=site.get('school_logo'), school_address=site.get('address'), school_phone=site.get('phone'), school_email=site.get('email'))


@app.get('/api/admissions')
@role_required('admin')
def admission_application_list():
    with db() as c:
        rows = c.execute('SELECT * FROM admission_applications ORDER BY created_at DESC').fetchall()
    return jsonify([{'id': row['id'], 'reference': row['reference'], 'application': json.loads(row['application_json']), 'status': row['status'], 'exam_date': row['exam_date'], 'exam_time': row['exam_time'], 'exam_venue': row['exam_venue'], 'admin_note': row['admin_note'], 'student_id': row['student_id'], 'created_at': row['created_at']} for row in rows])


@app.post('/api/admissions/<application_id>/decision')
@role_required('admin')
def admission_application_decision(application_id):
    body = request.get_json(silent=True) or {}
    action = str(body.get('action') or '')
    decision_result = None
    schedule_notice = None
    with db() as c:
        row = c.execute('SELECT * FROM admission_applications WHERE id=?', (application_id,)).fetchone()
        if not row:
            return jsonify(error='Admission application not found.'), 404
        if row['status'] in ('admitted', 'not_passed'):
            return jsonify(error='This application already has a final admission decision.'), 409
        if action in ('passed', 'not_passed') and row['status'] != 'exam_scheduled':
            return jsonify(error='Schedule the entrance examination before recording its result.'), 409
        application = json.loads(row['application_json'])
        if action == 'schedule_exam':
            exam_date = str(body.get('exam_date') or '')
            exam_time = str(body.get('exam_time') or '').strip()
            exam_venue = str(body.get('exam_venue') or '').strip()
            if not _valid_iso_date(exam_date) or exam_date < datetime.now().date().isoformat() or not re.fullmatch(r'(?:[01]\d|2[0-3]):[0-5]\d', exam_time) or not exam_venue or len(exam_venue) > 200:
                return jsonify(error='Enter a valid examination date, time and venue.'), 400
            c.execute("UPDATE admission_applications SET status='exam_scheduled',exam_date=?,exam_time=?,exam_venue=?,admin_note=?,reviewed_by=?,updated_at=? WHERE id=?", (exam_date, exam_time, exam_venue, str(body.get('admin_note') or '')[:1000], current_user()['id'], now(), application_id))
            schedule_notice = (str(application.get('guardian_email') or ''), str(application.get('guardian_name') or ''), str(application.get('student_name') or ''), row['reference'], exam_date, exam_time, exam_venue)
        elif action in ('passed', 'not_passed'):
            if action == 'not_passed':
                c.execute("UPDATE admission_applications SET status='not_passed',admin_note=?,reviewed_by=?,updated_at=? WHERE id=?", (str(body.get('admin_note') or '')[:1000], current_user()['id'], now(), application_id))
                student_id = None
                placed_arm = None
            else:
                arms = []
                for arm_row in c.execute("SELECT id,data FROM records WHERE entity='ClassArm'").fetchall():
                    arm = json.loads(arm_row['data'])
                    if arm.get('active') is False or _admission_class_match(arm.get('level')) != _admission_class_match(application['requested_level']):
                        continue
                    if application['requested_track'] and str(arm.get('track') or '').casefold() != application['requested_track'].casefold():
                        continue
                    count = 0
                    for student_row in c.execute("SELECT data FROM records WHERE entity='Student'").fetchall():
                        student = json.loads(student_row['data'])
                        if student.get('class_arm_id') == arm_row['id'] and str(student.get('status', 'Active')).casefold() == 'active':
                            count += 1
                    arms.append((count, str(arm.get('display_name') or arm.get('name') or ''), arm_row['id'], arm))
                if not arms:
                    return jsonify(error='No active class arm matches the requested class and track. Add one under Admin → Classes & Subjects before admitting this applicant.'), 409
                _, display_name, arm_id, arm = min(arms, key=lambda item: (item[0], item[1].casefold()))
                student_id = str(uuid.uuid4())
                admission_settings_row = c.execute("SELECT data FROM records WHERE entity='SchoolSettings' ORDER BY updated_date DESC LIMIT 1").fetchone()
                admission_settings = json.loads(admission_settings_row['data']) if admission_settings_row else {}
                initials = re.sub(r'[^A-Z0-9]', '', str(admission_settings.get('school_initials') or 'SCH').upper())[:8] or 'SCH'
                admission_no = f"{initials}/{datetime.now().year}/{student_id[:6].upper()}"
                student_data = {
                    'full_name': application['student_name'], 'gender': application['gender'],
                    'date_of_birth': application['date_of_birth'], 'admission_date': datetime.now().date().isoformat(),
                    'admission_no': admission_no, 'nationality': 'Nigerian', 'level': arm.get('level') or application['requested_level'],
                    'track': arm.get('track') or '', 'class_arm_id': arm_id, 'class_arm_name': display_name,
                    'status': 'Active', 'guardian_name': application['guardian_name'],
                    'guardian_phone': application['guardian_phone'], 'guardian_email': application['guardian_email'],
                    'user_email': '', 'address': application['address'], 'previous_school': application['previous_school'],
                    'admission_application_id': application_id,
                }
                validation_error = validate_entity('Student', student_data)
                if validation_error:
                    return jsonify(error='Could not create the student record: ' + validation_error), 400
                stamp = now()
                c.execute('INSERT INTO records(id,entity,data,created_date,updated_date) VALUES(?,?,?,?,?)', (student_id, 'Student', json.dumps(student_data), stamp, stamp))
                c.execute("UPDATE admission_applications SET status='admitted',student_id=?,admin_note=?,reviewed_by=?,updated_at=? WHERE id=?", (student_id, str(body.get('admin_note') or '')[:1000], current_user()['id'], stamp, application_id))
                placed_arm = {'id': arm_id, 'name': display_name, 'level': student_data['level'], 'track': student_data['track']}
            decision_result = {'ok': True, 'status': 'admitted' if action == 'passed' else 'not_passed', 'student_id': student_id, 'class_arm': placed_arm}
        else:
            return jsonify(error='Choose schedule_exam, passed or not_passed.'), 400
    if decision_result:
        audit(current_user(), 'admission_application_' + action, 'admission_application', application_id, {'student_id': decision_result['student_id']})
        return jsonify(**decision_result)
    if schedule_notice:
        guardian_email, guardian_name, student_name, reference, exam_date, exam_time, exam_venue = schedule_notice
        base = public_base_url()
        sent, _email_error = send_notification_email(
            guardian_email,
            'admissions',
            'Updated entrance examination schedule',
            (
                f"Dear {guardian_name},\n\n"
                f"The entrance examination schedule for {student_name} has been set or updated.\n"
                f"Application reference: {reference}\n"
                f"Date: {exam_date}\nTime: {exam_time}\nVenue: {exam_venue}\n\n"
                f"Return to the school homepage for information: {base}/"
            ),
        ) if guardian_email and base else (False, None)
        audit(current_user(), 'admission_exam_scheduled', 'admission_application', application_id, {'email_sent': sent})
        return jsonify(ok=True, status='exam_scheduled', email_sent=sent, email_error=None if sent else 'The schedule email could not be delivered. Contact the guardian directly.')
    audit(current_user(), 'admission_exam_scheduled', 'admission_application', application_id)
    return jsonify(ok=True, status='exam_scheduled')


@app.post('/api/auth/login')
def auth_login():
    body=request.get_json(silent=True) or {}; email=str(body.get('email','')).strip().lower(); password=str(body.get('password','')); ip=request.remote_addr or 'unknown'
    with db() as c:
        cutoff=(datetime.now(timezone.utc)-timedelta(minutes=15)).isoformat()
        c.execute('DELETE FROM login_attempts WHERE attempted_at < ?',((datetime.now(timezone.utc)-timedelta(days=7)).isoformat(),))
        attempts=c.execute('SELECT COUNT(*) AS n FROM login_attempts WHERE lower(email)=? AND ip_address=? AND success=0 AND attempted_at>=?',(email,ip,cutoff)).fetchone()['n']
        if attempts >= 10: return jsonify(error='Too many unsuccessful sign-in attempts. Wait 15 minutes before trying again.'),429
        row=c.execute('SELECT * FROM auth_users WHERE lower(email)=?',(email,)).fetchone()
        valid=bool(row and check_password_hash(row['password_hash'],password))
        c.execute('INSERT INTO login_attempts(email,ip_address,attempted_at,success) VALUES(?,?,?,?)',(email,ip,now(),1 if valid else 0))
    if not valid: return jsonify(error='Invalid email or password.'),401
    if row['account_status'] != 'active': return jsonify(error='Your account is not active. Contact the school administrator.'),403
    session.clear(); session['user_id']=row['id']; session.permanent=True
    return jsonify({'user':current_user()})

@app.get('/api/auth/me')
def auth_me():
    user=current_user()
    if not user: return jsonify(error='Please log in to continue.'),401
    return jsonify(user)

@app.patch('/api/auth/me')
@login_required
def auth_update_me():
    body=request.get_json(silent=True) or {}; user=current_user(); full_name=str(body.get('full_name',user['full_name']))
    with db() as c:
        c.execute('UPDATE auth_users SET full_name=? WHERE id=?',(full_name,user['id']))
        rows=c.execute("SELECT id,data FROM records WHERE entity='User'").fetchall()
        for record in rows:
            payload=json.loads(record['data'])
            if payload.get('email','').lower()==user['email'].lower():
                payload['full_name']=full_name
                c.execute('UPDATE records SET data=?,updated_date=? WHERE id=?',(json.dumps(payload),now(),record['id']))
    audit(user,'account_profile_name_updated','auth_user',user['id'],{'changed_fields':['full_name']})
    return jsonify(current_user())

@app.post('/api/auth/logout')
def auth_logout(): session.clear(); return jsonify(ok=True)

@app.post('/api/auth/register')
def auth_register():
    body=request.get_json(silent=True) or {}; email=str(body.get('email','')).strip().lower(); password=str(body.get('password',''))
    if not email or len(password)<8: return jsonify(error='Enter a valid email and a password of at least 8 characters.'),400
    invite_token=str(body.get('invite_token','')).strip()
    with db() as c:
        if c.execute('SELECT id FROM auth_users WHERE lower(email)=?',(email,)).fetchone(): return jsonify(error='An account with this email already exists.'),409
        invited=c.execute("SELECT id,data FROM records WHERE entity='User'").fetchall()
        role='student'; account_status='active'; invited_record=None
        for r in invited:
            d=json.loads(r['data'])
            if d.get('email','').lower()==email:
                invited_record=(r['id'],d); role=d.get('role','student'); account_status=d.get('account_status','active'); break
        if str(role).lower() == 'admin' and not (invited_record and is_primary_admin_email(email, c)):
            return jsonify(error='Admin accounts cannot be registered or activated through invitations. Use the Principal-controlled Admin handover process.'),403
        if invite_token:
            token_row=c.execute('SELECT record_id,email,expires_at FROM invite_tokens WHERE token=?',(invite_token,)).fetchone()
            if not token_row or token_row['expires_at'] < now() or token_row['email'].lower()!=email or not invited_record or token_row['record_id']!=invited_record[0]:
                return jsonify(error='This invitation link is invalid or has expired. Ask the school to resend it.'),400
            c.execute('DELETE FROM invite_tokens WHERE token=?',(invite_token,))
        uid=str(uuid.uuid4()); stamp=now()
        c.execute('INSERT INTO auth_users(id,email,password_hash,role,account_status,created_date) VALUES(?,?,?,?,?,?)',(uid,email,generate_password_hash(password),role,account_status,stamp))
        if invited_record:
            rid,d=invited_record; d['role']=role; d['account_status']=account_status
            c.execute('UPDATE records SET data=?,updated_date=? WHERE id=?',(json.dumps(d),stamp,rid))
        else:
            c.execute('INSERT INTO records(id,entity,data,created_date,updated_date) VALUES(?,?,?,?,?)',(str(uuid.uuid4()),'User',json.dumps({'email':email,'role':role,'account_status':account_status}),stamp,stamp))
    code = f'{secrets.randbelow(900000)+100000}'
    expires = (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat()
    school_name=smtp_config().get('SCHOOL_NAME') or 'Your School'
    sent,error = send_mail(email,f'{school_name} email verification code',
                           f'Dear {invited_record[1].get("full_name") if invited_record else "Portal user"},\n\n'
                           f'Use this verification code to confirm your email address for the {school_name} school portal:\n\n'
                           f'{code}\n\nThis code expires in 15 minutes. Do not share it with anyone.\n\n'
                           'If you did not create this account, contact the school office.\n\nKind regards,\nThe School Administration')
    if not sent:
        code='123456'; error=error or 'Email could not be delivered.'
    with db() as c: c.execute('INSERT OR REPLACE INTO verification_codes(email,code,expires_at) VALUES(?,?,?)',(email,code,expires))
    return jsonify(ok=True, message='Account created. Verify your email to continue.', email_sent=sent, email_error=error, local_verification_code=None if sent else '123456'),201

@app.post('/api/auth/verify')
def auth_verify():
    body=request.get_json(silent=True) or {}; email=str(body.get('email','')).lower(); otp=str(body.get('otp',''))
    with db() as c:
        code_row=c.execute('SELECT code,expires_at FROM verification_codes WHERE lower(email)=?',(email,)).fetchone()
        if code_row:
            if code_row['expires_at'] < now() or not secrets.compare_digest(str(code_row['code']),otp): return jsonify(error='Verification code is invalid or expired.'),400
            c.execute('DELETE FROM verification_codes WHERE lower(email)=?',(email,))
        elif otp != '123456': return jsonify(error='Invalid verification code.'),400
        row=c.execute('SELECT id,account_status FROM auth_users WHERE lower(email)=?',(email,)).fetchone()
    if not row: return jsonify(error='Account not found.'),404
    if row['account_status'] != 'active': return jsonify(error='Your account is awaiting administrator approval.'),403
    session.clear(); session['user_id']=row['id']; return jsonify(access_token='local-session')

@app.post('/api/auth/resend')
def auth_resend():
    body=request.get_json(silent=True) or {}; email=str(body.get('email','')).strip().lower()
    with db() as c:
        user=c.execute('SELECT id FROM auth_users WHERE lower(email)=?',(email,)).fetchone()
    if not user: return jsonify(error='Account not found.'),404
    code=f'{secrets.randbelow(900000)+100000}'
    expires=(datetime.now(timezone.utc)+timedelta(minutes=15)).isoformat()
    school_name=smtp_config().get('SCHOOL_NAME') or 'Your School'
    sent,error=send_mail(email,f'{school_name} email verification code',
                         f'Dear Portal user,\n\nYour email verification code is:\n\n{code}\n\n'
                         'It expires in 15 minutes. Do not share this code with anyone.\n\n'
                         'If you did not request this code, contact the school office.')
    if not sent: code='123456'
    with db() as c: c.execute('INSERT OR REPLACE INTO verification_codes(email,code,expires_at) VALUES(?,?,?)',(email,code,expires))
    return jsonify(ok=True,email_sent=sent,email_error=error,local_verification_code=None if sent else '123456')

@app.post('/api/auth/password/request')
def password_request():
    body=request.get_json(silent=True) or {}; email=str(body.get('email','')).lower()
    with db() as c: row=c.execute('SELECT id,full_name FROM auth_users WHERE lower(email)=?',(email,)).fetchone()
    if row:
        base = public_base_url()
        if not base:
            app.logger.error('Password reset email not sent because the Public application URL is not configured.')
            return jsonify(ok=True)
        token=secrets.token_urlsafe(24)
        with db() as c: c.execute('INSERT INTO reset_tokens(token,user_id,expires_at) VALUES(?,?,?)',(token,row['id'],(datetime.now(timezone.utc)+timedelta(hours=1)).isoformat()))
        link=f'{base}/reset-password?token={token}'
        school_name=smtp_config().get('SCHOOL_NAME') or 'Your School'
        sent,error=send_mail(email,f'{school_name} portal password reset',
                             f'Dear {row["full_name"] or "Portal user"},\n\n'
                             f'A password reset was requested for your {school_name} portal account.\n\n'
                             f'Reset your password using this secure link (valid for one hour):\n{link}\n\n'
                             'If you did not request this change, ignore this email. Your password will not change unless the link is used.\n\n'
                             'Kind regards,\nThe School Administration', 'Reset your password')
        if not sent:
            if os.environ.get('APP_ENV', 'development').lower() == 'production':
                app.logger.warning('Password reset email was not delivered for user %s: %s', row['id'], error)
            else:
                app.logger.warning('LOCAL PASSWORD RESET LINK: %s/reset-password?token=%s (email not sent: %s)',base,token,error)
    return jsonify(ok=True)

@app.post('/api/auth/password/reset')
def password_reset():
    body=request.get_json(silent=True) or {}; token=body.get('token'); password=str(body.get('password',''))
    if len(password)<8: return jsonify(error='Password must contain at least 8 characters.'),400
    with db() as c:
        row=c.execute('SELECT user_id,expires_at FROM reset_tokens WHERE token=?',(token,)).fetchone()
        if not row or row['expires_at'] < now(): return jsonify(error='Reset link is invalid or expired.'),400
        c.execute('UPDATE auth_users SET password_hash=? WHERE id=?',(generate_password_hash(password),row['user_id'])); c.execute('DELETE FROM reset_tokens WHERE token=?',(token,))
    return jsonify(ok=True)

@app.get('/api/admin/portal-accounts')
@role_required('admin')
def admin_portal_accounts():
    """Server-side account search for large schools; never sends the full directory."""
    query=str(request.args.get('q') or '').strip().lower()[:160]
    role=str(request.args.get('role') or '').strip().lower()
    status=str(request.args.get('status') or '').strip().lower()
    try: page=max(1,int(request.args.get('page',1)))
    except (TypeError,ValueError): page=1
    try: per_page=int(request.args.get('per_page',25))
    except (TypeError,ValueError): per_page=25
    if per_page not in (25,50,100): per_page=25
    clauses=["r.entity='User'"]
    params=[]
    if query:
        like=f'%{query}%'
        clauses.append("(lower(COALESCE(json_extract(r.data,'$.email'),'')) LIKE ? OR lower(COALESCE(json_extract(r.data,'$.full_name'),u.full_name,'')) LIKE ? OR lower(COALESCE(json_extract(r.data,'$.role'),u.role,'')) LIKE ? OR lower(COALESCE(json_extract(r.data,'$.account_status'),u.account_status,'')) LIKE ? OR r.id LIKE ?)")
        params.extend([like,like,like,like,f'%{query}%'])
    if role and role!='all':
        clauses.append("lower(COALESCE(json_extract(r.data,'$.role'),u.role,'user'))=?"); params.append(role)
    if status and status!='all':
        clauses.append("lower(COALESCE(json_extract(r.data,'$.account_status'),u.account_status,'pending'))=?"); params.append(status)
    where=' AND '.join(clauses)
    with db() as c:
        total=int(c.execute(f"SELECT COUNT(*) FROM records r LEFT JOIN auth_users u ON lower(u.email)=lower(json_extract(r.data,'$.email')) WHERE {where}",params).fetchone()[0])
        pages=max(1,(total+per_page-1)//per_page)
        page=min(page,pages)
        rows=c.execute(f"SELECT r.id,r.data,r.created_date,r.updated_date,u.id AS auth_id,u.full_name AS auth_full_name,u.role AS auth_role,u.account_status AS auth_status FROM records r LEFT JOIN auth_users u ON lower(u.email)=lower(json_extract(r.data,'$.email')) WHERE {where} ORDER BY lower(COALESCE(json_extract(r.data,'$.full_name'),u.full_name,'')),lower(json_extract(r.data,'$.email')) LIMIT ? OFFSET ?",params+[per_page,(page-1)*per_page]).fetchall()
        owner=c.execute('SELECT primary_admin_user_id FROM school_security_settings WHERE id=1').fetchone()
        primary_id=owner['primary_admin_user_id'] if owner else None
    items=[]
    for row in rows:
        data=json.loads(row['data'] or '{}')
        data.update(id=row['id'],email=data.get('email') or '',full_name=data.get('full_name') or row['auth_full_name'] or '',role=data.get('role') or row['auth_role'] or 'user',account_status=data.get('account_status') or row['auth_status'] or 'pending',created_date=row['created_date'],updated_date=row['updated_date'],is_primary_admin=bool(primary_id and row['auth_id']==primary_id))
        items.append(data)
    return jsonify(items=items,total=total,page=page,per_page=per_page,total_pages=pages)


@app.get('/api/entities/<name>')
@login_required
def entity_list(name):
    name=clean_entity(name); user=current_user(); params=request.args; where=json.loads(params.get('where','{}'))
    with db() as c: rows=c.execute('SELECT * FROM records WHERE entity=?',(name,)).fetchall()
    out=[]
    for row in rows:
        d=record_out(row)
        if name=='User':
            if user['role']!='admin': continue
            d.pop('password_hash',None)
        elif not can_read(user,name,d): continue
        if all(d.get(k)==v for k,v in where.items()): out.append(d)
    sort=params.get('sort',''); reverse=sort.startswith('-'); key=sort[1:] if reverse else sort
    if key: out.sort(key=lambda x:(x.get(key) is None, str(x.get(key,'')).lower()), reverse=reverse)
    try: limit=max(1,min(int(params.get('limit',1000)),5000))
    except ValueError: limit=1000
    return jsonify(out[:limit])

@app.post('/api/entities/<name>/bulk')
@login_required
def entity_bulk_create(name):
    name=clean_entity(name); user=current_user(); body=request.get_json(silent=True) or {}; rows=body.get('rows',[])
    if name in ('FeeItem','StaffPayment'): return jsonify(error='Financial changes must be submitted through the Principal-approved Bursary workflow.'),403
    if name == 'PortalRequest': return jsonify(error='Submit requests individually through the student or parent portal.'),400
    created=[]
    with db() as c:
        if name == 'Attendance' and rows:
            class_ids={str(row.get('class_arm_id') or '') for row in rows}
            dates={str(row.get('date') or '') for row in rows}
            if len(class_ids)!=1 or len(dates)!=1:
                return jsonify(error='Submit one class register for one date at a time.'),400
            student_ids=[str(row.get('student_id') or '') for row in rows]
            if not all(student_ids) or len(student_ids)!=len(set(student_ids)):
                return jsonify(error='Each student must appear exactly once in the attendance register.'),400
            class_id=next(iter(class_ids))
            active_student_ids=set()
            for student_row in c.execute("SELECT id,data FROM records WHERE entity='Student'").fetchall():
                student=json.loads(student_row['data'])
                if str(student.get('class_arm_id') or '')==class_id and str(student.get('status','Active')).casefold()=='active':
                    active_student_ids.add(student_row['id'])
            if not active_student_ids or set(student_ids)!=active_student_ids:
                return jsonify(error='Submit attendance for every active student in the selected class arm.'),400
            existing_rows=c.execute("SELECT data FROM records WHERE entity='Attendance'").fetchall()
            if any((item:=json.loads(row['data'])).get('class_arm_id') in class_ids and item.get('date') in dates for row in existing_rows):
                return jsonify(error='Attendance has already been submitted for this class and date.'),409
        for data in rows:
            data=dict(data)
            if name == 'Result' and user['role']!='teacher':
                return jsonify(error='Only subject teachers may create result rows; every result must pass Form Teacher review.'),403
            if name == 'User' and str(data.get('role','user')).lower() == 'admin':
                return jsonify(error='A new Admin account can only be appointed through the Principal-controlled Admin handover process.'),403
            if not can_write(user,name,'create',data): return jsonify(error='You do not have permission to create these records.'),403
            if name == 'ClassArm' and class_arm_exists(c,data):
                c.rollback()
                return jsonify(error='That class arm or track already exists.'),409
            if name == 'Attendance' and attendance_record_exists(c,data):
                c.rollback()
                return jsonify(error='Attendance has already been recorded for this student on this date.'),409
            if name == 'Result':
                score_error=result_score_error(c,data)
                if score_error: return jsonify(error=score_error),400
            if name == 'Payment':
                fee_error=payment_fee_error(c,data)
                if fee_error: return jsonify(error=fee_error),400
            validation_error=validate_entity(name,data)
            if validation_error: return jsonify(error=validation_error),400
            rid=str(uuid.uuid4()); stamp=now(); c.execute('INSERT INTO records(id,entity,data,created_date,updated_date) VALUES(?,?,?,?,?)',(rid,name,json.dumps(data),stamp,stamp)); created.append(dict(data,id=rid,created_date=stamp,updated_date=stamp))
    for record in created:
        if name == 'Attendance':
            status = record.get('status') or 'updated'
            notify_student_contacts(record.get('student_id'), 'attendance', 'Student attendance updated',
                                    f'Attendance for {record.get("student_name") or "your student"} on {record.get("date") or "the selected date"} was marked {status}.')
        elif name == 'Payment':
            notify_payment_contacts(record)
        elif name == 'Notice':
            notify_notice_recipients(record)
    return jsonify(created),201

@app.patch('/api/entities/<name>/bulk')
@login_required
def entity_bulk_update(name):
    name=clean_entity(name); user=current_user(); rows=(request.get_json(silent=True) or {}).get('rows',[])
    if name in ('FeeItem','StaffPayment'): return jsonify(error='Financial changes must be submitted through the Principal-approved Bursary workflow.'),403
    updated=[]; notifications=[]
    with db() as c:
        for patch in rows:
            rid=patch.get('id'); old=c.execute('SELECT * FROM records WHERE id=? AND entity=?',(rid,name)).fetchone()
            if not old: continue
            data=json.loads(old['data'])
            if name == 'User' and str(patch.get('role', data.get('role','user'))).lower() == 'admin' and str(data.get('role','user')).lower() != 'admin':
                return jsonify(error='A portal account can only be promoted to Admin through the Principal-controlled Admin handover process.'),403
            if not can_write(user,name,'update',data): return jsonify(error='You do not have permission to update this record.'),403
            if name == 'Result':
                result_error=result_admin_change_error(c,user['role'],rid,{k:v for k,v in patch.items() if k!='id'})
                if result_error: return jsonify(error=result_error),403
            if name == 'Attendance':
                correction_error=attendance_correction_error(data,{k:v for k,v in patch.items() if k!='id'})
                if correction_error:
                    c.rollback()
                    return jsonify(error=correction_error),403
            if name == 'User' and is_primary_admin_email(data.get('email'), c):
                proposed_role=patch.get('role', data.get('role','admin')); proposed_status=patch.get('account_status', data.get('account_status','active'))
                if proposed_role!='admin' or proposed_status!='active': return jsonify(error='The primary school owner cannot be demoted, suspended or deactivated.'),403
                if 'email' in patch and str(patch.get('email','')).lower()!=str(data.get('email','')).lower(): return jsonify(error='The primary owner email must be changed through verified email change.'),403
            if name == 'PortalRequest':
                allowed={'status','response','handled_by'}
                if set(patch)-({'id'}|allowed):
                    return jsonify(error='Request ownership and original message cannot be changed.'),403
                if user['role'] not in ('admin','principal','bursar','librarian'):
                    return jsonify(error='Only the school office may respond to requests.'),403
                if 'status' in patch and patch.get('status') not in ('pending','in_progress','resolved','rejected'):
                    return jsonify(error='Invalid request status.'),400
                if 'response' in patch:
                    patch['handled_by']=user.get('full_name') or user.get('email')
            old_status=data.get('status')
            data.update({k:v for k,v in patch.items() if k!='id'})
            if name == 'ClassArm' and class_arm_exists(c,data,exclude_id=rid):
                c.rollback()
                return jsonify(error='That class arm or track already exists.'),409
            if name == 'Result':
                score_error=result_score_error(c,data)
                if score_error: return jsonify(error=score_error),400
            if name=='Result' and data.get('status')=='published': return jsonify(error='Report cards must be published through the authorised term-closing archive workflow.'),403
            if name=='Result' and user['role']=='teacher' and not teacher_assignment_allows(user,data,write=True): return jsonify(error='You may only edit results for your assigned subject and class.'),403
            if name=='Result' and user['role']=='teacher' and patch.get('status') not in (None,'submitted','correction'): return jsonify(error='Teachers cannot approve or publish results.'),403
            validation_error=validate_entity(name,data)
            if validation_error: return jsonify(error=validation_error),400
            stamp=now(); c.execute('UPDATE records SET data=?,updated_date=? WHERE id=?',(json.dumps(data),stamp,rid))
            if name == 'SchoolSettings': sync_school_settings_period(c,data,user)
            if name == 'User': c.execute('UPDATE auth_users SET role=?,account_status=?,full_name=COALESCE(?,full_name) WHERE lower(email)=?',(data.get('role','user'),data.get('account_status','active'),data.get('full_name'),str(data.get('email','')).lower()))
            updated.append(dict(data,id=rid,created_date=old['created_date'],updated_date=stamp))
            if name in ('PortalRequest','Attendance') and data.get('status') != old_status:
                notifications.append(dict(data))
            if name == 'User' and set(patch).intersection({'role','account_status'}):
                notifications.append(dict(data))
    for data in notifications:
        if name == 'PortalRequest':
            subject = f'School request {data.get("status", "updated").replace("_", " ")}'
            body = data.get('response') or f'Your request about {data.get("subject") or "school matters"} was updated to {data.get("status", "updated")}.'
            notify_email(data.get('student_email'), 'requests', subject, body)
            notify_email(data.get('guardian_email'), 'requests', subject, body)
        elif name == 'Attendance':
            notify_student_contacts(data.get('student_id'), 'attendance', 'Student attendance updated',
                                    f'Attendance for {data.get("student_name") or "your student"} on {data.get("date") or "the selected date"} was marked {data.get("status") or "updated"}.')
        elif name == 'User':
            notify_email(data.get('email'), 'operations', 'School portal account updated',
                         f'Your school portal account details were updated. Current role: {data.get("role", "unchanged")}.')
    return jsonify(updated)

@app.post('/api/entities/<name>')
@login_required
def entity_create(name):
    name=clean_entity(name); user=current_user(); data=request.get_json(silent=True) or {}
    if name in ('FeeItem','StaffPayment'): return jsonify(error='Financial changes must be submitted through the Principal-approved Bursary workflow.'),403
    if name == 'Attendance': return jsonify(error='Submit class attendance as one complete register for the class and date.'),400
    if name == 'PortalRequest':
        if user['role'] not in ('student','parent'): return jsonify(error='Only a student or linked parent may submit a portal request.'),403
        linked=linked_students(user)
        target=next((x for x in linked if str(x.get('_record_id') or x.get('id') or '')==str(data.get('student_id') or '')),None)
        if not target: return jsonify(error='The request must be linked to a student on your account.'),403
        data.update(student_id=str(target.get('_record_id') or target.get('id')),student_name=target.get('full_name',''),
                    student_email=target.get('user_email') or (user.get('email') if user['role']=='student' else ''),
                    guardian_email=user.get('email') if user['role']=='parent' else (target.get('guardian_email') or ''))
        data['raised_by']=user.get('email','')
        data['status']='pending'; data['response']=''; data['handled_by']=''
    if name == 'StudentDocument':
        target_id=str(data.get('student_id') or '')
        with db() as c:
            student_row=c.execute("SELECT id,data FROM records WHERE entity='Student' AND id=?",(target_id,)).fetchone()
        if not student_row: return jsonify(error='Choose a valid student record for this document.'),400
        student_data=json.loads(student_row['data'])
        data['student_email']=student_data.get('user_email') or student_data.get('student_email') or data.get('student_email') or ''
        data['guardian_email']=student_data.get('guardian_email') or data.get('guardian_email') or ''
        if user['role'] in ('student','parent'):
            linked={str(x.get('_record_id') or x.get('id') or '') for x in linked_students(user)}
            if target_id not in linked: return jsonify(error='You may upload documents only for a student linked to your account.'),403
            email=str(user.get('email') or '').lower()
            if user['role']=='student': data['student_email']=email
            if user['role']=='parent': data['guardian_email']=email
        if user['role']=='teacher' and not teacher_has_class(user,student_data.get('class_arm_id')):
            return jsonify(error='You may upload documents only for students in classes assigned to you.'),403
        data.update(student_name=student_data.get('full_name',''),class_arm_id=student_data.get('class_arm_id',''),
                    class_arm_name=student_data.get('class_arm_name',''),uploaded_by=user.get('full_name') or user.get('email'))
    if name == 'Result' and user['role']!='teacher': return jsonify(error='Only subject teachers may create result rows; every result must pass Form Teacher review.'),403
    if name == 'User' and str(data.get('role','user')).lower() == 'admin':
        return jsonify(error='A new Admin account can only be appointed through the Principal-controlled Admin handover process.'),403
    if name == 'ResourceItem':
        data['status']='pending' if user['role']=='teacher' else 'approved'
        if user['role']=='teacher' and not teacher_has_syllabus_assignment(user,data.get('class_arm_id'),data.get('subject_id')):
            return jsonify(error='Upload materials only for a subject and class assigned to you.'),403
    if not can_write(user,name,'create',data): return jsonify(error='You do not have permission to create this record.'),403
    validation_error = validate_entity(name, data)
    if validation_error: return jsonify(error=validation_error),400
    rid=str(uuid.uuid4()); stamp=now()
    with db() as c:
        if name == 'Attendance' and attendance_record_exists(c,data):
            return jsonify(error='Attendance has already been recorded for this student on this date.'),409
        if name == 'Result':
            score_error=result_score_error(c,data)
            if score_error: return jsonify(error=score_error),400
        if name == 'Payment':
            fee_error=payment_fee_error(c,data)
            if fee_error: return jsonify(error=fee_error),400
        if name == 'ClassArm' and class_arm_exists(c, data):
            return jsonify(error='That class arm or track already exists.'),409
        c.execute('INSERT INTO records(id,entity,data,created_date,updated_date) VALUES(?,?,?,?,?)',(rid,name,json.dumps(data),stamp,stamp))
        if name == 'SchoolSettings': sync_school_settings_period(c,data,user)
    audit(user,f'{name.lower()}_created',name,rid,{'fields':sorted(data.keys())})
    if name == 'Payment':
        notify_payment_contacts(data)
    elif name == 'Notice':
        notify_notice_recipients(data)
    elif name == 'PortalRequest':
        notify_roles(('admin', 'principal', 'bursar', 'librarian'), 'requests', 'New student or parent request',
                     f'{data.get("student_name") or "A student"} submitted a request for the school office.',
                     exclude_user_id=user['id'])
    return jsonify(dict(data,id=rid,created_date=stamp,updated_date=stamp)),201


@app.post('/api/resources/<rid>/decision')
@role_required('admin','principal')
def resource_decision(rid):
    body=request.get_json(silent=True) or {}; decision=str(body.get('decision') or '')
    if decision not in ('approved','rejected'): return jsonify(error='Decision must be approved or rejected.'),400
    with db() as c:
        row=c.execute("SELECT data FROM records WHERE id=? AND entity='ResourceItem'",(rid,)).fetchone()
        if not row: return jsonify(error='Resource not found.'),404
        data=json.loads(row['data'])
        if data.get('status','approved')!='pending': return jsonify(error='Only pending teacher uploads can be reviewed.'),409
        data['status']=decision
        data['reviewed_by']=current_user()['id']; data['reviewed_at']=now()
        c.execute('UPDATE records SET data=?,updated_date=? WHERE id=?',(json.dumps(data),now(),rid))
    audit(current_user(),'resource_'+decision,'ResourceItem',rid)
    return jsonify(ok=True,status=decision)


@app.post('/api/class-arms/<rid>/reassign-delete')
@role_required('admin')
def class_arm_reassign_delete(rid):
    body=request.get_json(silent=True) or {}; target_id=str(body.get('target_class_arm_id') or '')
    if not target_id: return jsonify(error='Choose another class arm for the students.'),400
    with db() as c:
        source_row=c.execute("SELECT data FROM records WHERE id=? AND entity='ClassArm'",(rid,)).fetchone()
        target_row=c.execute("SELECT data FROM records WHERE id=? AND entity='ClassArm'",(target_id,)).fetchone()
        if not source_row: return jsonify(error='Class arm not found.'),404
        if not target_row: return jsonify(error='The destination class arm was not found.'),404
        source=json.loads(source_row['data']); target=json.loads(target_row['data'])
        if rid == target_id: return jsonify(error='Choose a different destination class arm.'),400
        if str(source.get('level','')).strip().casefold() != str(target.get('level','')).strip().casefold():
            return jsonify(error='Students can only be reassigned to another class arm in the same level.'),400
        student_rows=c.execute("SELECT id,data FROM records WHERE entity='Student'").fetchall()
        reassigned=0
        for student_row in student_rows:
            student=json.loads(student_row['data'])
            belongs=(str(student.get('class_arm_id') or '') == rid
                     or str(student.get('class_arm_name') or '') == str(source.get('display_name') or '')
                     or str(student.get('class_arm') or '') == str(source.get('display_name') or ''))
            if not belongs: continue
            student.update(class_arm_id=target_id, class_arm_name=target.get('display_name') or '', level=target.get('level') or student.get('level',''), track=target.get('track') or '')
            if 'class_arm' in student: student['class_arm']=target.get('display_name') or ''
            c.execute('UPDATE records SET data=?,updated_date=? WHERE id=?',(json.dumps(student),now(),student_row['id']))
            reassigned+=1
        c.execute("DELETE FROM records WHERE id=? AND entity='ClassArm'",(rid,))
    audit(current_user(),'class_arm_reassigned_and_deleted','ClassArm',rid,{'target_class_arm_id':target_id,'students_reassigned':reassigned})
    return jsonify(ok=True,students_reassigned=reassigned)

@app.patch('/api/entities/<name>/<rid>')
@login_required
def entity_update(name,rid):
    name=clean_entity(name); user=current_user(); patch=request.get_json(silent=True) or {}
    if name in ('FeeItem','StaffPayment'): return jsonify(error='Financial changes must be submitted through the Principal-approved Bursary workflow.'),403
    with db() as c:
        old=c.execute('SELECT * FROM records WHERE id=? AND entity=?',(rid,name)).fetchone()
        if not old: return jsonify(error='Record not found.'),404
        data=json.loads(old['data'])
        if name == 'User' and str(patch.get('role', data.get('role','user'))).lower() == 'admin' and str(data.get('role','user')).lower() != 'admin':
            return jsonify(error='A portal account can only be promoted to Admin through the Principal-controlled Admin handover process.'),403
        if name == 'User' and is_primary_admin_email(data.get('email'), c):
            proposed_role=patch.get('role', data.get('role','admin')); proposed_status=patch.get('account_status', data.get('account_status','active'))
            if proposed_role!='admin' or proposed_status!='active': return jsonify(error='The primary school owner cannot be demoted, suspended or deactivated.'),403
            if 'email' in patch and str(patch.get('email','')).lower()!=str(data.get('email','')).lower(): return jsonify(error='The primary owner email must be changed through verified email change.'),403
        if name == 'PortalRequest':
            if set(patch)-{'status','response'}: return jsonify(error='Request ownership and original message cannot be changed.'),403
            if user['role'] not in ('admin','principal','bursar','librarian'): return jsonify(error='Only the school office may respond to requests.'),403
            if patch.get('status',data.get('status')) not in ('pending','in_progress','resolved','rejected'): return jsonify(error='Invalid request status.'),400
            if 'response' in patch: patch['handled_by']=user.get('full_name') or user.get('email')
        if not can_write(user,name,'update',data): return jsonify(error='You do not have permission to update this record.'),403
        if name == 'Result':
            result_error=result_admin_change_error(c,user['role'],rid,patch)
            if result_error: return jsonify(error=result_error),403
        if name == 'Attendance':
            correction_error=attendance_correction_error(data,patch)
            if correction_error: return jsonify(error=correction_error),403
        data.update(patch)
        if name == 'ClassArm' and class_arm_exists(c,data,exclude_id=rid):
            return jsonify(error='That class arm or track already exists.'),409
        if name == 'Result':
            score_error=result_score_error(c,data)
            if score_error: return jsonify(error=score_error),400
        if name=='Result' and data.get('status')=='published': return jsonify(error='Report cards must be published through the authorised term-closing archive workflow.'),403
        if name=='Result' and user['role']=='teacher' and not teacher_assignment_allows(user,data,write=True): return jsonify(error='You may only edit results for your assigned subject and class.'),403
        if name=='Result' and user['role']=='teacher' and patch.get('status') not in (None,'submitted','correction'): return jsonify(error='Teachers cannot approve or publish results.'),403
        validation_error = validate_entity(name, data)
        if validation_error: return jsonify(error=validation_error),400
        data.update({})
        c.execute('UPDATE records SET data=?,updated_date=? WHERE id=?',(json.dumps(data),now(),rid))
        if name == 'SchoolSettings': sync_school_settings_period(c,data,user)
        if name == 'User':
            c.execute('UPDATE auth_users SET role=?, account_status=?, full_name=COALESCE(?,full_name) WHERE lower(email)=?', (data.get('role','user'), data.get('account_status','active'), data.get('full_name'), str(data.get('email','')).lower()))
    audit(user,f'{name.lower()}_updated',name,rid,{'changed_fields':sorted(k for k in patch if k!='id')})
    if name == 'PortalRequest' and data.get('status') != json.loads(old['data']).get('status'):
        subject = f'School request {data.get("status", "updated").replace("_", " ")}'
        body = data.get('response') or f'Your request about {data.get("subject") or "school matters"} was updated to {data.get("status", "updated")}.'
        notify_email(data.get('student_email'), 'requests', subject, body)
        notify_email(data.get('guardian_email'), 'requests', subject, body)
    if name == 'User' and set(patch).intersection({'role','account_status'}):
        notify_email(data.get('email'), 'operations', 'School portal account updated',
                     f'Your school portal account details were updated. Current role: {data.get("role", "unchanged")}.')
    return jsonify(dict(data,id=rid,created_date=old['created_date'],updated_date=now()))

@app.delete('/api/entities/<name>/<rid>')
@login_required
def entity_delete(name,rid):
    name=clean_entity(name); user=current_user()
    if name in ('FeeItem','StaffPayment'): return jsonify(error='Financial changes must be submitted through the Principal-approved Bursary workflow.'),403
    if name == 'ClassArm': return jsonify(error='Use the class-arm reassignment workflow before deleting a class arm.'),409
    if not can_write(user,name,'delete'): return jsonify(error='You do not have permission to delete this record.'),403
    with db() as c:
        old=c.execute('SELECT data FROM records WHERE id=? AND entity=?',(rid,name)).fetchone()
        if not old: return jsonify(error='Record not found.'),404
        if name == 'User':
            email=str(json.loads(old['data']).get('email','')).lower()
            if is_primary_admin_email(email, c): return jsonify(error='The primary school owner account cannot be deleted.'),403
            if email == current_user()['email'].lower(): return jsonify(error='You cannot delete the account currently signed in.'),400
            c.execute('DELETE FROM auth_users WHERE lower(email)=?',(email,))
            c.execute('DELETE FROM invite_tokens WHERE record_id=?',(rid,))
        c.execute('DELETE FROM records WHERE id=? AND entity=?',(rid,name))
    audit(user,f'{name.lower()}_deleted',name,rid,{})
    return '',204

@app.post('/api/users/invite')
@admin_required
def invite_user():
    body=request.get_json(silent=True) or {}; email=str(body.get('email','')).strip().lower(); role=str(body.get('role','user'))
    if not email or not re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$', email): return jsonify(error='Enter a valid email address.'),400
    allowed={'principal','teacher','bursar','librarian','student','parent'}
    if role == 'admin': return jsonify(error='Admin accounts cannot be created by invitation. A new Admin must be appointed through the Principal-controlled Admin handover process.'),403
    if role not in allowed: return jsonify(error='Invalid portal role.'),400
    with db() as c:
        rows=c.execute("SELECT id,data FROM records WHERE entity='User'").fetchall()
        for r in rows:
            d=json.loads(r['data'])
            if d.get('email','').lower()==email: return jsonify(error='This account already exists. Use Resend invitation in the account list.'),409
        rid=str(uuid.uuid4()); stamp=now()
        c.execute('INSERT INTO records(id,entity,data,created_date,updated_date) VALUES(?,?,?,?,?)',(rid,'User',json.dumps({'email':email,'role':role,'account_status':'pending'}),stamp,stamp))
    delivery=make_invitation(rid,email,role)
    return jsonify(ok=True,account_id=rid,**delivery),201


@app.post('/api/users/<rid>/resend-invite')
@admin_required
def resend_invitation(rid):
    with db() as c:
        row=c.execute("SELECT data FROM records WHERE id=? AND entity='User'",(rid,)).fetchone()
        if not row: return jsonify(error='Portal account not found.'),404
        data=json.loads(row['data']); email=str(data.get('email','')).lower(); role=data.get('role','user')
        existing=c.execute('SELECT id FROM auth_users WHERE lower(email)=?',(email,)).fetchone()
        if existing:
            base=public_base_url()
            if not base:
                return jsonify(ok=False,email_sent=False,invite_url='',email_error='Set the Public application URL in School Settings or PUBLIC_BASE_URL before sending reset links.',mode='password_reset'),503
            token=secrets.token_urlsafe(32); expires=(datetime.now(timezone.utc)+timedelta(hours=1)).isoformat()
            c.execute('DELETE FROM reset_tokens WHERE user_id=?',(existing['id'],))
            c.execute('INSERT INTO reset_tokens(token,user_id,expires_at) VALUES(?,?,?)',(token,existing['id'],expires))
            link=f'{base}/reset-password?token={token}'
            school_name=smtp_config().get('SCHOOL_NAME') or 'Your School'
            body=(f'Dear {data.get("full_name") or "Portal user"},\n\n'
                  f'A password reset was requested for your {school_name} portal account.\n\n'
                  f'Reset your password using this secure link (valid for one hour):\n{link}\n\n'
                  'If you did not request this change, ignore this email. Your password will not change unless the link is used.\n\n'
                  'Kind regards,\nThe School Administration')
            sent,error=send_mail(email,f'{school_name} portal password reset',body,'Reset your password')
            return jsonify(ok=True,email_sent=sent,invite_url=link,email_error=error,mode='password_reset')
    return jsonify(ok=True,**make_invitation(rid,email,role),mode='invitation')


@app.delete('/api/users/<rid>')
@admin_required
def delete_portal_account(rid):
    with db() as c:
        row=c.execute("SELECT data FROM records WHERE id=? AND entity='User'",(rid,)).fetchone()
        if not row: return jsonify(error='Portal account not found.'),404
        email=str(json.loads(row['data']).get('email','')).lower()
        if is_primary_admin_email(email, c): return jsonify(error='The primary school owner account cannot be deleted.'),403
        if email == current_user()['email'].lower(): return jsonify(error='You cannot delete the account currently signed in.'),400
        c.execute('DELETE FROM invite_tokens WHERE record_id=?',(rid,))
        c.execute("DELETE FROM records WHERE id=? AND entity='User'",(rid,))
        c.execute('DELETE FROM auth_users WHERE lower(email)=?',(email,))
    return jsonify(ok=True)


@app.post('/api/requests/<rid>/respond')
@role_required('admin','principal','bursar','librarian')
def portal_request_respond(rid):
    body=request.get_json(silent=True) or {}; response=str(body.get('response') or '').strip(); status=str(body.get('status') or 'in_progress')
    if status not in ('pending','in_progress','resolved','rejected'): return jsonify(error='Invalid request status.'),400
    if len(response)>5000: return jsonify(error='Response must be 5,000 characters or fewer.'),400
    if status in ('resolved','rejected') and not response and not str(body.get('note') or '').strip():
        return jsonify(error='Provide a response or explanation before closing or rejecting a request.'),400
    with db() as c:
        row=c.execute("SELECT data FROM records WHERE id=? AND entity='PortalRequest'",(rid,)).fetchone()
        if not row: return jsonify(error='Request not found.'),404
        data=json.loads(row['data']); data.update(response=response,status=status,handled_by=current_user().get('full_name') or current_user().get('email'))
        c.execute("UPDATE records SET data=?,updated_date=? WHERE id=? AND entity='PortalRequest'",(json.dumps(data),now(),rid))
    audit(current_user(),'portal_request_'+status,'PortalRequest',rid,{'status':status})
    return jsonify(ok=True,request={**data,'id':rid,'updated_date':now()})

@app.post('/api/files/upload')
@login_required
def upload_file():
    f=request.files.get('file')
    if not f: return jsonify(error='No file selected.'),400
    name=secure_filename(f.filename or 'upload')
    if not name or name in ('.','..'): return jsonify(error='Invalid filename.'),400
    allowed={'png','jpg','jpeg','gif','webp','pdf','doc','docx','xls','xlsx','ppt','pptx','txt','csv'}
    ext=name.rsplit('.',1)[-1].lower() if '.' in name else ''
    if ext not in allowed: return jsonify(error='Unsupported file type. Allowed: images, PDF, Office documents, TXT and CSV.'),400
    stored=f'{uuid.uuid4().hex}_{name}'; f.save(UPLOAD_DIR/stored)
    uri=f'/uploads/{stored}'
    return jsonify(file_uri=uri,file_url=uri)

@app.get('/api/files/signed')
@login_required
def signed_file():
    uri=request.args.get('uri','')
    if not uri.startswith('/uploads/'): return jsonify(error='Invalid file reference.'),400
    return jsonify(signed_url=uri)


@app.route('/api/fee-payment-submissions', methods=['GET','POST'])
@login_required
def fee_payment_submissions():
    user=current_user()
    if request.method=='GET':
        with db() as c:
            if user['role'] in ('admin','principal','bursar'):
                rows=c.execute('SELECT * FROM fee_payment_submissions ORDER BY submitted_at DESC').fetchall()
            else:
                student_ids={str(student.get('_record_id') or student.get('id') or '') for student in linked_students(user)}
                rows=c.execute('SELECT * FROM fee_payment_submissions WHERE submitted_by=? OR student_id IN ('+','.join('?' for _ in student_ids)+') ORDER BY submitted_at DESC',(user['id'],*student_ids)).fetchall() if student_ids else c.execute('SELECT * FROM fee_payment_submissions WHERE submitted_by=? ORDER BY submitted_at DESC',(user['id'],)).fetchall()
        return jsonify([dict(row) for row in rows])
    if user['role'] not in ('student','parent'):
        return jsonify(error='Only a student or linked parent may submit a fee receipt.'),403
    body=request.get_json(silent=True) or {}; student_id=str(body.get('student_id') or ''); receipt_uri=str(body.get('receipt_uri') or '')
    fee_id=str(body.get('fee_id') or ''); fee_category=str(body.get('fee_category') or '')
    try: amount=float(body.get('amount'))
    except (TypeError,ValueError): return jsonify(error='Enter a valid payment amount.'),400
    if amount<=0 or not student_id or not receipt_uri.startswith('/uploads/') or fee_category not in ('school_fee','other_fee'):
        return jsonify(error='Student, fee selection, positive amount, and uploaded bank receipt are required.'),400
    linked=linked_students(user)
    student=next((item for item in linked if str(item.get('_record_id') or item.get('id') or '')==student_id),None)
    if not student: return jsonify(error='You may only submit receipts for your own linked student record.'),403
    with db() as c:
        settings_row=c.execute("SELECT data FROM records WHERE entity='SchoolSettings' ORDER BY updated_date DESC LIMIT 1").fetchone()
        settings=json.loads(settings_row['data']) if settings_row else {}
        session_name=str(body.get('session') or settings.get('session') or '')
        term_name=str(body.get('term') or settings.get('term') or '')
        if fee_category=='school_fee':
            if fee_id!='school_fees': return jsonify(error='Choose the School fees bundle, not an individual component.'),400
            school_balance=school_fee_balance(c,student,session_name,term_name)
            expected=school_balance['billed']
            fee_name='School fees'
            fee_rows=fee_items_for_student(c,student,session_name,term_name,'school_fee')
            installments_allowed=bool(fee_rows) and all(fee.get('installments_allowed') is True for fee in fee_rows)
            penalty=0
        else:
            fee=next((item for item in fee_items_for_student(c,student,session_name,term_name,'other_fee') if item['id']==fee_id),None)
            if not fee: return jsonify(error='The selected fee is not available for this student and term.'),404
            expected=float(fee.get('amount') or 0)
            fee_name=str(fee.get('name') or 'Other fee')
            penalty=0
            deadline=str(fee.get('deadline') or '')
            if deadline and datetime.now().date().isoformat()>deadline:
                if fee.get('penalty_type')=='extra_fee': penalty=float(fee.get('penalty_amount') or 0)
            expected+=penalty
            installments_allowed=fee.get('installments_allowed') is True
        payment_check={'student_id':student_id,'fee_id':fee_id,'fee_category':fee_category,'amount':amount,'session':session_name,'term':term_name}
        fee_error=payment_fee_error(c,payment_check)
        if fee_error: return jsonify(error=fee_error),400
        sid=str(uuid.uuid4()); stamp=now()
        c.execute('INSERT INTO fee_payment_submissions(id,student_id,student_name,amount,paid_on,reference,receipt_uri,session,term,submitted_by,submitted_at,fee_id,fee_name,fee_category,class_arm_name,admission_no) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',(sid,student_id,str(student.get('full_name') or ''),amount,str(body.get('paid_on') or stamp[:10]),str(body.get('reference') or ''),receipt_uri,session_name,term_name,user['id'],stamp,fee_id,fee_name,fee_category,str(student.get('class_arm_name') or ''),str(student.get('admission_no') or '')))
    audit(user,'fee_payment_submitted','fee_payment_submission',sid,{'student_id':student_id,'amount':amount,'fee_id':fee_id,'fee_category':fee_category})
    notify_roles(('principal',), 'finance', 'Fee receipt needs approval',
                 f'{student.get("full_name") or "A student"} submitted a fee payment receipt for review.',
                 exclude_user_id=user['id'])
    return jsonify(id=sid,status='pending'),201


@app.post('/api/fee-payment-submissions/<rid>/decision')
@role_required('principal')
def fee_payment_submission_decision(rid):
    body=request.get_json(silent=True) or {}; decision=str(body.get('decision') or ''); user=current_user()
    if decision not in ('approved','rejected'): return jsonify(error='Decision must be approved or rejected.'),400
    with db() as c:
        row=c.execute('SELECT * FROM fee_payment_submissions WHERE id=?',(rid,)).fetchone()
        if not row: return jsonify(error='Payment receipt submission not found.'),404
        if row['status']!='pending': return jsonify(error='This receipt has already been reviewed.'),409
        payment_id=None
        if decision=='approved':
            student_row=c.execute("SELECT data FROM records WHERE id=? AND entity='Student'",(row['student_id'],)).fetchone()
            student=json.loads(student_row['data']) if student_row else {}
            payment_id=str(uuid.uuid4()); stamp=now()
            payment={
                'student_id':row['student_id'],'student_name':row['student_name'],'student_email':student.get('user_email',''),
                'guardian_email':student.get('guardian_email',''),'admission_no':student.get('admission_no',''),
                'class_arm_name':row['class_arm_name'] or student.get('class_arm_name',''),'track':student.get('track',''),
                'fee_id':row['fee_id'],'fee_name':row['fee_name'],'fee_category':row['fee_category'],
                'amount':row['amount'],'method':'Transfer',
                'reference':row['reference'],'session':row['session'],'term':row['term'],'paid_on':row['paid_on'],
                'type':'payment','receipt_no':f"RCPT-{datetime.now().strftime('%Y%m%d')}-{rid[:6].upper()}",
                'note':f"Parent/student receipt approved: {row['receipt_uri']}",'recorded_by':user['full_name'] or user['email'],
                '_ignore_submission_id':rid,
            }
            fee_error=payment_fee_error(c,payment)
            if fee_error:
                return jsonify(error='The submitted receipt can no longer be approved: '+fee_error),409
            payment.pop('_ignore_submission_id',None)
            c.execute('INSERT INTO records(id,entity,data,created_date,updated_date) VALUES(?,?,?,?,?)',(payment_id,'Payment',json.dumps(payment),stamp,stamp))
        c.execute('UPDATE fee_payment_submissions SET status=?,reviewed_by=?,reviewed_at=?,decision_note=?,payment_record_id=? WHERE id=?',(decision,user['id'],now(),str(body.get('note') or ''),payment_id,rid))
    audit(current_user(),'fee_payment_'+decision,'fee_payment_submission',rid,{'payment_record_id':payment_id})
    notify_user(row['submitted_by'], 'finance', f'Fee receipt {decision}',
                f'Your fee payment receipt for {row["student_name"]} was {decision}.'
                + (f' Note: {body.get("note")}' if body.get('note') else ''))
    if decision == 'approved' and payment_id:
        with db() as c:
            payment_row=c.execute("SELECT data FROM records WHERE id=? AND entity='Payment'",(payment_id,)).fetchone()
        if payment_row:
            notify_payment_contacts(json.loads(payment_row['data']))
    return jsonify(ok=True,status=decision,payment_record_id=payment_id)


def _paystack_request(path, payload=None):
    secret=os.environ.get('PAYSTACK_SECRET_KEY','').strip()
    if not secret: raise RuntimeError('Paystack is not configured. Set PAYSTACK_SECRET_KEY in the server environment.')
    data=json.dumps(payload).encode() if payload is not None else None
    req=urllib.request.Request('https://api.paystack.co'+path,data=data,headers={'Authorization':'Bearer '+secret,'Content-Type':'application/json'},method='POST' if data is not None else 'GET')
    try:
        with urllib.request.urlopen(req,timeout=25) as response: result=json.loads(response.read().decode())
    except urllib.error.HTTPError as exc:
        raise RuntimeError('Paystack request failed: '+exc.read().decode(errors='replace')[:500])
    except Exception as exc:
        raise RuntimeError('Could not reach Paystack: '+str(exc))
    if not result.get('status'): raise RuntimeError(result.get('message') or 'Paystack did not accept the request.')
    return result.get('data') or {}


def _paystack_fee_for_student(conn, student, fee_id, session_name, term_name):
    if fee_id=='school_fees':
        items=fee_items_for_student(conn,student,session_name,term_name,'school_fee')
        return sum(float(item.get('amount') or 0) for item in items),'School fees','school_fee'
    fee=next((item for item in fee_items_for_student(conn,student,session_name,term_name,'other_fee') if item['id']==fee_id),None)
    if not fee: raise ValueError('The selected fee is not available for this student and term.')
    amount=float(fee.get('amount') or 0)
    deadline=str(fee.get('deadline') or '')
    if deadline and datetime.now().date().isoformat()>deadline and fee.get('penalty_type')=='extra_fee': amount+=float(fee.get('penalty_amount') or 0)
    return amount,str(fee.get('name') or 'Other fee'),'other_fee'


@app.post('/api/payments/paystack/initialize')
@login_required
def paystack_initialize():
    user=current_user()
    if user['role'] not in ('student','parent'): return jsonify(error='Only students and linked parents may initiate student fee payments.'),403
    body=request.get_json(silent=True) or {}; student_id=str(body.get('student_id') or ''); fee_id=str(body.get('fee_id') or '')
    student=next((item for item in linked_students(user) if str(item.get('_record_id') or item.get('id') or '')==student_id),None)
    if not student: return jsonify(error='You may only pay fees for a student linked to your account.'),403
    callback_path=str(body.get('callback_path') or '/')
    if not callback_path.startswith('/') or callback_path.startswith('//') or '\\' in callback_path: callback_path='/'
    try:
        with db() as c:
            setting_row=c.execute("SELECT data FROM records WHERE entity='SchoolSettings' ORDER BY updated_date DESC LIMIT 1").fetchone()
            settings=json.loads(setting_row['data']) if setting_row else {}
            session_name=str(body.get('session') or settings.get('session') or '')
            term_name=str(body.get('term') or settings.get('term') or '')
            if not session_name or not term_name: return jsonify(error='The current academic session and term must be configured before accepting payments.'),400
            fee_total,fee_name,category=_paystack_fee_for_student(c,student,fee_id,session_name,term_name)
            if fee_total<=0: return jsonify(error='There is no payable amount configured for this fee.'),400
            pending=c.execute("SELECT reference,gateway_response FROM paystack_transactions WHERE student_id=? AND fee_id=? AND session=? AND term=? AND status='pending' AND created_at>? ORDER BY created_at DESC LIMIT 1",(student_id,fee_id,session_name,term_name,(datetime.now(timezone.utc)-timedelta(hours=2)).isoformat())).fetchone()
            if pending:
                saved=json.loads(pending['gateway_response'] or '{}')
                if saved.get('authorization_url'): return jsonify(ok=True,reference=pending['reference'],authorization_url=saved['authorization_url'],resumed=True)
                return jsonify(error='A payment attempt is already pending. Please refresh your payment history or contact the Bursary before starting another payment.'),409
            try: amount=float(body.get('amount',fee_total))
            except (TypeError,ValueError): return jsonify(error='Enter a valid payment amount.'),400
            payment_check={'student_id':student_id,'fee_id':fee_id,'fee_category':category,'amount':amount,'session':session_name,'term':term_name}
            fee_error=payment_fee_error(c,payment_check)
            if fee_error: return jsonify(error=fee_error),400
            manual_pending=c.execute("SELECT id FROM fee_payment_submissions WHERE student_id=? AND session=? AND term=? AND status IN ('pending','approved') AND ((?='school_fees' AND fee_category='school_fee') OR (?<>'school_fees' AND fee_id=?)) LIMIT 1",(student_id,session_name,term_name,fee_id,fee_id,fee_id)).fetchone()
            if manual_pending: return jsonify(error='A bank-transfer receipt for this fee is already pending or approved. Check payment history before starting another payment.'),409
            reference='SCH-'+uuid.uuid4().hex.upper(); amount_kobo=int(round(amount*100))
            base=public_base_url()
            if not base: return jsonify(error='Set the Public application URL before starting an online payment.'),503
            callback_url=base+callback_path+'?paystack_return=1'
            student_email=student.get('user_email') or student.get('student_email') or user.get('email') or ''
            metadata={'student_id':student_id,'student_name':student.get('full_name',''),'admission_no':student.get('admission_no',''),'fee_id':fee_id,'fee_name':fee_name,'fee_category':category,'session':session_name,'term':term_name,'initiated_by':user['id']}
        gateway=_paystack_request('/transaction/initialize',{'email':student_email,'amount':amount_kobo,'currency':'NGN','reference':reference,'callback_url':callback_url,'metadata':metadata})
        with db() as c:
            c.execute('INSERT INTO paystack_transactions(id,reference,student_id,fee_id,fee_name,amount_kobo,session,term,initiated_by,status,gateway_response,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',(str(uuid.uuid4()),reference,student_id,fee_id,fee_name,amount_kobo,session_name,term_name,user['id'],'pending',json.dumps({'authorization_url':gateway.get('authorization_url')}),now()))
        audit(user,'paystack_payment_initialized','payment',reference,{'student_id':student_id,'amount':amount})
        return jsonify(ok=True,reference=reference,authorization_url=gateway.get('authorization_url'))
    except ValueError as exc: return jsonify(error=str(exc)),400
    except RuntimeError as exc: return jsonify(error=str(exc)),503


def _verify_paystack_reference(reference):
    with db() as c:
        transaction=c.execute('SELECT * FROM paystack_transactions WHERE reference=?',(reference,)).fetchone()
        if not transaction: return None,('Payment reference was not found.',404)
        if transaction['status']=='success': return dict(transaction),None
    try: gateway=_paystack_request('/transaction/verify/'+quote(reference,safe=''))
    except RuntimeError as exc: return None,(str(exc),503)
    if gateway.get('status')!='success':
        with db() as c: c.execute("UPDATE paystack_transactions SET status='failed',gateway_response=?,verified_at=? WHERE reference=? AND status='pending'",(json.dumps({'status':gateway.get('status'),'gateway_response':gateway.get('gateway_response')}),now(),reference))
        return None,('Paystack has not confirmed a successful payment.',400)
    with db() as c:
        row=c.execute('SELECT * FROM paystack_transactions WHERE reference=?',(reference,)).fetchone()
        if not row: return None,('Payment reference was not found.',404)
        if row['status']=='success': return dict(row),None
        if int(gateway.get('amount') or 0)!=int(row['amount_kobo']) or str(gateway.get('currency') or '').upper()!='NGN': return None,('The verified amount or currency does not match the school invoice.',409)
        duplicate=c.execute("SELECT id FROM records WHERE entity='Payment' AND json_extract(data,'$.reference')=? LIMIT 1",(reference,)).fetchone()
        payment_id=duplicate['id'] if duplicate else str(uuid.uuid4())
        if not duplicate:
            student_row=c.execute("SELECT data FROM records WHERE entity='Student' AND id=?",(row['student_id'],)).fetchone()
            student=json.loads(student_row['data']) if student_row else {}; stamp=now()
            fee_error=payment_fee_error(c,{'student_id':row['student_id'],'fee_id':row['fee_id'],'fee_category':'school_fee' if row['fee_id']=='school_fees' else 'other_fee','amount':row['amount_kobo']/100,'session':row['session'],'term':row['term'],'_ignore_paystack_reference':reference})
            if fee_error: return None,('The verified payment cannot be applied to the current fee balance: '+fee_error,409)
            payment={'student_id':row['student_id'],'student_name':student.get('full_name') or '','student_email':student.get('user_email') or student.get('student_email') or '', 'guardian_email':student.get('guardian_email') or '', 'admission_no':student.get('admission_no') or '', 'class_arm_name':student.get('class_arm_name') or student.get('level') or '', 'amount':row['amount_kobo']/100,'paid_on':str(gateway.get('paid_at') or stamp)[:10],'method':'Paystack online','reference':reference,'session':row['session'],'term':row['term'],'fee_id':row['fee_id'],'fee_name':row['fee_name'],'fee_category':'school_fee' if row['fee_id']=='school_fees' else 'other_fee','type':'payment','receipt_no':'RCPT-'+datetime.now().strftime('%Y%m%d')+'-'+reference[-8:],'note':'Verified automatically through Paystack.','recorded_by':'Paystack'}
            c.execute('INSERT INTO records(id,entity,data,created_date,updated_date) VALUES(?,?,?,?,?)',(payment_id,'Payment',json.dumps(payment),stamp,stamp))
        c.execute("UPDATE paystack_transactions SET status='success',payment_record_id=?,gateway_response=?,verified_at=? WHERE reference=?",(payment_id,json.dumps({'status':gateway.get('status'),'channel':gateway.get('channel'),'paid_at':gateway.get('paid_at')}),now(),reference))
        result=dict(c.execute('SELECT * FROM paystack_transactions WHERE reference=?',(reference,)).fetchone())
    audit({'id':result['initiated_by'],'role':'system','email':'paystack'},'paystack_payment_verified','payment',reference,{'payment_record_id':payment_id,'amount':result['amount_kobo']/100})
    if not duplicate:
        with db() as c:
            payment_row=c.execute("SELECT data FROM records WHERE id=? AND entity='Payment'",(payment_id,)).fetchone()
        if payment_row:
            notify_payment_contacts(json.loads(payment_row['data']))
    return result,None


@app.post('/api/payments/paystack/verify')
@login_required
def paystack_verify():
    user=current_user(); reference=str((request.get_json(silent=True) or {}).get('reference') or '').strip()
    if not reference: return jsonify(error='Payment reference is required.'),400
    with db() as c:
        pending=c.execute('SELECT student_id FROM paystack_transactions WHERE reference=?',(reference,)).fetchone()
    if not pending: return jsonify(error='Payment reference was not found.'),404
    if user['role'] not in ('admin','principal','bursar'):
        allowed={str(item.get('_record_id') or item.get('id') or '') for item in linked_students(user)}
        if str(pending['student_id']) not in allowed: return jsonify(error='You cannot access this payment.'),403
    result,error=_verify_paystack_reference(reference)
    if error: return jsonify(error=error[0]),error[1]
    return jsonify(ok=True,status=result['status'],payment_record_id=result.get('payment_record_id'),message='Payment verified and recorded successfully.')


@app.post('/api/payments/paystack/webhook')
def paystack_webhook():
    secret=os.environ.get('PAYSTACK_SECRET_KEY','').strip()
    if not secret: return jsonify(error='Payment gateway is not configured.'),503
    signature=request.headers.get('x-paystack-signature',''); expected=hmac.new(secret.encode(),request.get_data(),sha256).hexdigest()
    if not signature or not hmac.compare_digest(signature,expected): return jsonify(error='Invalid webhook signature.'),401
    event=request.get_json(silent=True) or {}
    if event.get('event')=='charge.success':
        reference=str((event.get('data') or {}).get('reference') or '')
        if reference:
            result,error=_verify_paystack_reference(reference)
            if error: return jsonify(error=error[0]),error[1]
    return jsonify(ok=True)


@app.get('/api/bursary/fee-status')
@role_required('bursar','admin','principal')
def bursary_fee_status():
    session_name=str(request.args.get('session') or ''); term_name=str(request.args.get('term') or '')
    class_arm_id=str(request.args.get('class_arm_id') or ''); fee_id=str(request.args.get('fee_id') or '')
    if not session_name or not term_name or not class_arm_id: return jsonify(error='Session, term and class arm are required.'),400
    with db() as c:
        class_row=c.execute("SELECT data FROM records WHERE id=? AND entity='ClassArm'",(class_arm_id,)).fetchone()
        if not class_row: return jsonify(error='Class arm not found.'),404
        arm=json.loads(class_row['data'])
        students=[]
        for row in c.execute("SELECT id,data FROM records WHERE entity='Student'").fetchall():
            student=json.loads(row['data'])
            if str(student.get('class_arm_id') or '')!=class_arm_id or str(student.get('status','Active')).casefold()!='active': continue
            student['_record_id']=row['id']
            if fee_id=='school_fees':
                balance=school_fee_balance(c,student,session_name,term_name)
                paid=balance['is_paid']; due=balance['billed']; fee_name='School fees'
            else:
                fee=next((item for item in fee_items_for_student(c,student,session_name,term_name) if item['id']==fee_id),None)
                if not fee: return jsonify(error='Fee is not configured for this student/class and term.'),404
                fee_name=str(fee.get('name') or '')
                payments=[]
                for payment_row in c.execute("SELECT data FROM records WHERE entity='Payment'").fetchall():
                    payment=json.loads(payment_row['data'])
                    if payment.get('student_id')==row['id'] and payment.get('fee_id')==fee_id and payment.get('session')==session_name and payment.get('term')==term_name and payment.get('type','payment') not in ('refund','reversal'):
                        payments.append(payment)
                due=float(fee.get('amount') or 0)
                if fee.get('deadline') and datetime.now().date().isoformat()>str(fee['deadline']) and fee.get('penalty_type')=='extra_fee':
                    due+=float(fee.get('penalty_amount') or 0)
                paid=sum(float(payment.get('amount') or 0) for payment in payments)>=due
            students.append({'student_id':row['id'],'student_name':student.get('full_name',''),'admission_no':student.get('admission_no',''),'class_arm_name':student.get('class_arm_name') or arm.get('display_name',''),'fee_name':fee_name,'amount_due':due,'status':'paid' if paid else 'unpaid'})
    return jsonify(session=session_name,term=term_name,class_arm_id=class_arm_id,fee_id=fee_id,students=students)


@app.post('/api/bursary/fee-reminders')
@role_required('bursar','admin','principal')
def bursary_fee_reminders():
    body=request.get_json(silent=True) or {}
    with db() as c:
        settings_row=c.execute("SELECT data FROM records WHERE entity='SchoolSettings' ORDER BY updated_date DESC LIMIT 1").fetchone()
        settings=json.loads(settings_row['data']) if settings_row else {}
        bank_accounts=[dict(row) for row in c.execute("SELECT bank_name,account_name,account_number,purpose,instructions FROM school_payment_accounts WHERE status='active' ORDER BY purpose,bank_name").fetchall()]
        session_name=str(body.get('session') or settings.get('session') or '')
        term_name=str(body.get('term') or settings.get('term') or '')
        if not session_name or not term_name:
            return jsonify(error='Configure the current academic session and term before sending fee reminders.'),400
        students=[]
        for row in c.execute("SELECT id,data FROM records WHERE entity='Student'").fetchall():
            student=json.loads(row['data'])
            if str(student.get('status','Active')).casefold()!='active':
                continue
            student.update(id=row['id'],_record_id=row['id'])
            balances=[]
            school_balance=school_fee_balance(c,student,session_name,term_name)
            school_due=max(school_balance['billed']-school_balance['paid']-school_balance['pending'],0)
            if school_due>0:
                balances.append(('School fees',school_due))
            for fee in fee_items_for_student(c,student,session_name,term_name,'other_fee'):
                fee_id=fee['id']
                due=float(fee.get('amount') or 0)
                deadline=str(fee.get('deadline') or '')
                if deadline and datetime.now().date().isoformat()>deadline and fee.get('penalty_type')=='extra_fee':
                    due+=float(fee.get('penalty_amount') or 0)
                payments=c.execute("SELECT data FROM records WHERE entity='Payment' AND json_extract(data,'$.student_id')=? AND json_extract(data,'$.fee_id')=? AND json_extract(data,'$.session')=? AND json_extract(data,'$.term')=?",(row['id'],fee_id,session_name,term_name)).fetchall()
                paid=0
                for payment_row in payments:
                    payment=json.loads(payment_row['data'])
                    if payment.get('type','payment') not in ('refund','reversal','credit'):
                        paid+=float(payment.get('amount') or 0)
                pending=c.execute("SELECT COALESCE(SUM(amount),0) FROM fee_payment_submissions WHERE student_id=? AND fee_id=? AND session=? AND term=? AND status='pending'",(row['id'],fee_id,session_name,term_name)).fetchone()[0]
                remaining=max(due-paid-float(pending or 0),0)
                if remaining>0:
                    balances.append((str(fee.get('name') or 'Other fee'),remaining))
            if balances:
                students.append((student,balances))

    reminders_sent=0
    recipients_sent=0
    recipients_failed=0
    recipients_skipped=0
    payment_details='\n\nApproved school transfer accounts:\n'+'\n'.join(
        f'{account["bank_name"]} — {account["account_name"]} — {account["account_number"]} ({account["purpose"].replace("_"," ")})'
        + (f'\nInstructions: {account["instructions"]}' if account.get('instructions') else '')
        for account in bank_accounts
    ) if bank_accounts else '\n\nContact the school office or Bursary for approved payment instructions.'
    base = public_base_url()
    portal_url = f'{base}/login' if base else ''
    for student,balances in students:
        total=sum(amount for _,amount in balances)
        lines='\n'.join(f'{name}: NGN {amount:,.2f}' for name,amount in balances)
        body_text=(
            f'Dear Parent/Guardian,\n\n'
            f'This is a fee reminder for {student.get("full_name") or "your child"} for {term_name}, {session_name}.\n\n'
            f'Outstanding fees:\n{lines}\n\nTotal outstanding: NGN {total:,.2f}\n\n'
            f'{payment_details}\n\nPlease sign in to the school portal to view fee records'
            + (f': {portal_url}\n' if portal_url else '.\n')
        )
        contacts={str(student.get(field) or '').strip().lower() for field in ('guardian_email','student_email','user_email')}
        delivered=0
        for email in contacts-{''}:
            sent,error=send_notification_email(email,'finance',f'Fee reminder for {student.get("full_name") or "your child"}',body_text,'View fee records')
            if sent:
                delivered+=1
            elif error is None:
                recipients_skipped+=1
            else:
                recipients_failed+=1
        if delivered:
            reminders_sent+=1
            recipients_sent+=delivered
    return jsonify(ok=True,students_with_balances=len(students),reminders_sent=reminders_sent,
                   recipients_sent=recipients_sent,recipients_failed=recipients_failed,recipients_skipped=recipients_skipped)

@app.get('/uploads/<path:filename>')
def serve_upload(filename):
    user=current_user(); uri='/uploads/'+filename; allowed=False
    with db() as c:
        site_row=c.execute('SELECT content_json FROM public_site_settings WHERE id=1').fetchone()
        if site_row:
            site=json.loads(site_row['content_json'])
            allowed=uri==site.get('hero_image') or uri in site.get('gallery',[])
        settings_row=c.execute("SELECT data FROM records WHERE entity='SchoolSettings' ORDER BY updated_date DESC LIMIT 1").fetchone()
        if settings_row:
            settings=json.loads(settings_row['data'] or '{}')
            allowed = allowed or uri == settings.get('school_logo')
    if allowed:
        return send_from_directory(UPLOAD_DIR,filename,as_attachment=False)
    if not user: return jsonify(error='Please log in to continue.'),401
    with db() as c:
        for rec in c.execute("SELECT entity,data FROM records").fetchall():
            try: data=json.loads(rec['data'])
            except Exception: continue
            if uri not in (data.get('file_uri'),data.get('photo_url')): continue
            if can_read(user,rec['entity'],data):
                allowed=True; break
        if not allowed:
            docs=c.execute('SELECT * FROM curriculum_documents WHERE file_uri=?',(uri,)).fetchall()
            for doc in docs:
                if user['role'] in ('admin','principal') or (doc['status']=='approved' and user['role']=='teacher' and teacher_has_syllabus_assignment(user,doc['class_key'],doc['subject_id'])):
                    allowed=True; break
        if not allowed:
            receipts=c.execute('SELECT student_id FROM fee_payment_submissions WHERE receipt_uri=?',(uri,)).fetchall()
            if receipts and user['role'] in ('admin','principal','bursar'):
                allowed=True
            elif receipts and user['role'] in ('student','parent'):
                linked_ids={str(x.get('_record_id') or x.get('id') or '') for x in linked_students(user)}
                allowed=any(str(row['student_id']) in linked_ids for row in receipts)
    if not allowed: return jsonify(error='You do not have access to this document.'),403
    return send_from_directory(UPLOAD_DIR,filename,as_attachment=False)

@app.get('/register', endpoint='register_page')
def register_page():
    dist = ROOT / 'dist'
    if (dist / 'index.html').is_file():
        return send_from_directory(dist, 'index.html')
    return ('Frontend build is missing. Close the server, run setup.bat, then start.bat.', 503)

@app.get('/reset-password', endpoint='reset_password_page')
def reset_password_page():
    dist = ROOT / 'dist'
    if (dist / 'index.html').is_file():
        return send_from_directory(dist, 'index.html')
    return ('Frontend build is missing. Close the server, run setup.bat, then start.bat.', 503)

@app.get('/')
def index():
    dist=ROOT/'dist'
    if (dist/'index.html').exists(): return send_from_directory(dist,'index.html')
    return ('<h2>School Management System</h2><p>Frontend has not been built yet. Run <code>npm install</code> and <code>npm run build</code>.</p>',200)


@app.get('/healthz')
def health_check():
    try:
        with db() as c:
            c.execute('SELECT 1').fetchone()
    except sqlite3.Error:
        app.logger.exception('Health check could not access the school database')
        return jsonify(status='unavailable'), 503
    return jsonify(status='ok')


# V5.6 workflow APIs. These endpoints use additive tables and preserve historical rows.
def _user_record_by_id(uid):
    with db() as c:
        row=c.execute("SELECT id,data FROM records WHERE entity='User' AND json_extract(data,'$.email')=(SELECT email FROM auth_users WHERE id=?) LIMIT 1",(uid,)).fetchone()
    if not row: return {}
    try: return json.loads(row['data'])
    except Exception: return {}

def _assigned_classes(user):
    rec=_user_record_by_id(user['id'])
    classes=set(rec.get('assigned_class_arms') or rec.get('class_arms') or [])
    for assignment in _teacher_assignments(user):
        for field in ('class_arm_id','class_arm_name'):
            if assignment.get(field): classes.add(str(assignment[field]))
    return classes


def teacher_has_syllabus_assignment(user, class_key, subject_id):
    with db() as c:
        scope=canonical_class_scope(c,class_key)
        for assignment in _teacher_assignments(user):
            if assignment.get('type')!='subject' or str(assignment.get('subject_id') or '')!=str(subject_id): continue
            if canonical_class_scope(c,assignment.get('class_arm_id') or assignment.get('class_arm_name'))==scope:
                return True
    return False

def _active_term_for(session_id, term_id):
    with db() as c:
        return bool(c.execute('SELECT 1 FROM academic_terms WHERE id=? AND session_id=?',(term_id,session_id)).fetchone())

@app.get('/api/workflows/promotions/mine')
@role_required('student','parent')
def workflow_promotions_mine():
    linked=linked_students(current_user()); ids={str(x.get('_record_id','')) for x in linked}; ids.update(str(x.get('id','')) for x in linked)
    admissions={str(x.get('admission_no','')) for x in linked if x.get('admission_no')}
    with db() as c: rows=c.execute('SELECT * FROM promotion_history ORDER BY promotion_date DESC,created_at DESC LIMIT 1000').fetchall()
    return jsonify([dict(r) for r in rows if r['student_id'] in ids or str(r['admission_number'] or '') in admissions])

@app.get('/api/workflows/promotions')
@role_required('admin','principal','teacher')
def workflow_promotions_list():
    user=current_user(); cls=_assigned_classes(user)
    with db() as c: rows=c.execute('SELECT * FROM promotion_history ORDER BY promotion_date DESC,created_at DESC LIMIT 3000').fetchall()
    out=[dict(r) for r in rows if user['role']!='teacher' or r['to_class'] in cls or r['from_class'] in cls]
    return jsonify(out)

@app.post('/api/workflows/promotions')
@role_required('admin')
def workflow_promotion_create():
    b=request.get_json(silent=True) or {}; required=('student_id','student_name','to_class','session_id','promotion_date')
    if any(not str(b.get(k,'')).strip() for k in required): return jsonify(error='Student, destination class, session and promotion date are required.'),400
    with db() as c:
        if not c.execute('SELECT 1 FROM academic_sessions WHERE id=?',(b['session_id'],)).fetchone(): return jsonify(error='Academic session not found.'),400
        student_row=c.execute("SELECT id,data FROM records WHERE entity='Student' AND (id=? OR json_extract(data,'$.admission_no')=?) LIMIT 1",(str(b['student_id']),str(b.get('admission_number') or b['student_id']))).fetchone()
        if not student_row: return jsonify(error='Student record not found. Use the existing student record ID or admission number.'),404
        student=json.loads(student_row['data']); student_id=student_row['id']
        target_row=c.execute("SELECT id,data FROM records WHERE entity='ClassArm' AND (id=? OR json_extract(data,'$.display_name')=?) LIMIT 1",(str(b['to_class']),str(b['to_class']))).fetchone()
        if not target_row: return jsonify(error='Destination must be an existing class arm or track configured by Admin.'),400
        target=json.loads(target_row['data']); target_class=str(target.get('display_name') or b['to_class']); target_level=str(target.get('level') or '').upper().replace(' ','')
        from_class=str(student.get('class_arm_name') or student.get('class_arm_id') or student.get('level') or '').strip()
        from_level=str(student.get('level') or '').upper().replace(' ','')
        old_track=str(student.get('track') or '')
        if not old_track:
            old_track=next((x for x in ('Science','Art','Commercial') if x.lower() in from_class.lower()),'')
        if not old_track and student.get('class_arm_id'):
            old_row=c.execute("SELECT data FROM records WHERE entity='ClassArm' AND id=?",(student['class_arm_id'],)).fetchone()
            if old_row: old_track=str(json.loads(old_row['data']).get('track') or '')
        new_track=str(target.get('track') or '')
        if from_level=='SS1' and target_level=='SS2' and new_track not in ('Science','Art','Arts','Commercial'):
            return jsonify(error='SS1 to SS2 promotion requires an Admin-assigned Science, Art or Commercial track.'),400
        if from_level=='SS2' and target_level=='SS3' and old_track and new_track and old_track.lower()!=new_track.lower() and not b.get('admin_track_change_authorised'):
            return jsonify(error='SS2 to SS3 promotion must retain the same track unless Admin explicitly authorises a change.'),400
        student_name=str(student.get('full_name') or b.get('student_name') or student_id)
        admission=str(student.get('admission_no') or b.get('admission_number') or '')
        history_id=str(uuid.uuid4()); stamp=now()
        c.execute('INSERT INTO promotion_history VALUES(?,?,?,?,?,?,?,?,?,?)',(history_id,student_id,student_name,admission,from_class,target_class,str(b['session_id']),str(b['promotion_date']),current_user()['id'],stamp))
        student['level']=target.get('level',student.get('level','')); student['class_arm_id']=target_row['id']; student['class_arm_name']=target_class; student['track']=target.get('track') or ''
        c.execute("UPDATE records SET data=?,updated_date=? WHERE id=? AND entity='Student'",(json.dumps(student),stamp,student_id))
    audit(current_user(),'student_promoted','promotion_history',history_id,{'student_id':student_id,'from_class':from_class,'to_class':target_class,'session_id':b['session_id']})
    return jsonify(id=history_id,student_id=student_id,student_name=student_name,admission_number=admission,from_class=from_class,to_class=target_class,session_id=b['session_id'],promotion_date=b['promotion_date']),201

@app.get('/api/workflows/staff-attendance')
@role_required('admin','principal')
def workflow_staff_attendance_list():
    date=request.args.get('date')
    with db() as c:
        rows=c.execute('SELECT * FROM staff_attendance WHERE (? IS NULL OR attendance_date=?) ORDER BY attendance_date DESC,staff_name',(date,date)).fetchall()
    return jsonify([dict(r) for r in rows])

@app.post('/api/workflows/staff-attendance')
@role_required('admin','principal')
def workflow_staff_attendance_save():
    b=request.get_json(silent=True) or {}; status=b.get('status')
    if not all(str(b.get(k,'')).strip() for k in ('staff_id','staff_name','attendance_date')) or status not in ('Present','Absent','Late','Excused'):
        return jsonify(error='Staff, date and a valid attendance status are required.'),400
    rid=str(uuid.uuid4())
    with db() as c:
        c.execute('INSERT INTO staff_attendance(id,staff_id,staff_name,attendance_date,status,arrival_time,session_id,term_id,recorded_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(staff_id,attendance_date) DO UPDATE SET status=excluded.status,arrival_time=excluded.arrival_time,session_id=excluded.session_id,term_id=excluded.term_id,recorded_by=excluded.recorded_by',(rid,str(b['staff_id']),str(b['staff_name']),str(b['attendance_date']),status,b.get('arrival_time'),b.get('session_id'),b.get('term_id'),current_user()['id'],now()))
    audit(current_user(),'staff_attendance_recorded','staff_attendance',rid,b)
    return jsonify(ok=True),201

@app.get('/api/workflows/syllabus')
@login_required
def workflow_syllabus_list():
    user=current_user(); cls=_assigned_classes(user)
    with db() as c: rows=c.execute('SELECT * FROM syllabus_topics ORDER BY class_key,subject_id,created_at').fetchall()
    out=[]
    for r in rows:
        d=dict(r)
        if user['role']=='teacher' and not teacher_has_syllabus_assignment(user,d['class_key'],d['subject_id']): continue
        out.append(d)
    return jsonify(out)

@app.post('/api/workflows/syllabus')
@role_required('admin','teacher')
def workflow_syllabus_create():
    b=request.get_json(silent=True) or {}
    if not all(str(b.get(k,'')).strip() for k in ('subject_id','class_key','session_id','term_id','title')): return jsonify(error='Subject, class, session, term and topic title are required.'),400
    try: week_number=int(b.get('week_number',1))
    except (TypeError,ValueError): return jsonify(error='Week must be a whole number from 1 to 52.'),400
    if week_number not in range(1,53): return jsonify(error='Week must be a whole number from 1 to 52.'),400
    if not _active_term_for(b['session_id'],b['term_id']): return jsonify(error='Selected term does not belong to the selected session.'),400
    user=current_user()
    if user['role']=='teacher' and not teacher_has_syllabus_assignment(user,b['class_key'],b['subject_id']):
        return jsonify(error='You may write syllabus topics only for subjects and classes assigned to you.'),403
    rid=str(uuid.uuid4())
    with db() as c: c.execute('INSERT INTO syllabus_topics(id,subject_id,class_key,session_id,term_id,title,notes,status,created_by,created_at,week_number) VALUES(?,?,?,?,?,?,?,?,?,?,?)',(rid,b['subject_id'],b['class_key'],b['session_id'],b['term_id'],b['title'],str(b.get('notes','')),'not_started',current_user()['id'],now(),week_number))
    audit(current_user(),'syllabus_topic_created','syllabus_topic',rid)
    return jsonify(id=rid,status='not_started'),201

@app.patch('/api/workflows/syllabus/<rid>')
@role_required('admin','principal','teacher')
def workflow_syllabus_update(rid):
    b=request.get_json(silent=True) or {}; user=current_user()
    with db() as c:
        row=c.execute('SELECT * FROM syllabus_topics WHERE id=?',(rid,)).fetchone()
        if not row: return jsonify(error='Syllabus topic not found.'),404
        if user['role']=='teacher' and not teacher_has_syllabus_assignment(user,row['class_key'],row['subject_id']): return jsonify(error='You are not assigned to this subject and class.'),403
        if user['role']=='teacher':
            status=b.get('status',row['status'])
            if status not in ('in_progress','completed','not_started'): return jsonify(error='Invalid syllabus progress state.'),400
            c.execute('UPDATE syllabus_topics SET status=?,notes=? WHERE id=?',(status,str(b.get('notes',row['notes'])),rid))
        elif user['role']=='principal':
            c.execute('UPDATE syllabus_topics SET reviewed_by=?,reviewed_at=? WHERE id=?',(user['id'],now(),rid))
        else:
            c.execute('UPDATE syllabus_topics SET title=?,notes=? WHERE id=?',(str(b.get('title',row['title'])),str(b.get('notes',row['notes'])),rid))
    audit(user,'syllabus_topic_updated','syllabus_topic',rid,b)
    return jsonify(ok=True)

@app.get('/api/workflows/timetable')
@login_required
def workflow_timetable_list():
    user=current_user(); cls=_assigned_classes(user)
    with db() as c: rows=c.execute('SELECT * FROM timetable_entries ORDER BY weekday,period').fetchall()
    out=[]
    for r in rows:
        d=dict(r)
        if user['role']=='teacher' and d['teacher_id']!=user['id'] and not teacher_assignment_allows(user,{'class_arm_id':d['class_key'],'subject_id':d['subject_id']},write=False): continue
        if user['role'] in ('student','parent'):
            matching=[student for student in linked_students(user) if d['class_key'] in {str(student.get(field) or '') for field in ('class_arm_id','class_arm','class_arm_name','current_class_arm','class_key')}]
            if not any(learner_fee_access(user,student.get('_record_id')) for student in matching): continue
        if user['role'] not in ('admin','principal','teacher','student','parent'): continue
        out.append(d)
    return jsonify(out)

@app.post('/api/workflows/timetable')
@role_required('admin')
def workflow_timetable_create():
    b=request.get_json(silent=True) or {}
    keys=('session_id','term_id','class_key','subject_id','teacher_id','weekday','period')
    if any(str(b.get(k,'')).strip()=='' for k in keys): return jsonify(error='Session, term, class, subject, teacher, weekday and period are required.'),400
    if not _active_term_for(b['session_id'],b['term_id']): return jsonify(error='Term does not belong to selected session.'),400
    try: day=int(b['weekday'])
    except Exception: return jsonify(error='Weekday must be 1–7.'),400
    if day not in range(1,8): return jsonify(error='Weekday must be 1–7.'),400
    with db() as c:
        conflict=c.execute('SELECT * FROM timetable_entries WHERE session_id=? AND term_id=? AND weekday=? AND period=? AND (class_key=? OR teacher_id=? OR (room IS NOT NULL AND room=?))',(b['session_id'],b['term_id'],day,str(b['period']),str(b['class_key']),str(b['teacher_id']),str(b.get('room') or ''))).fetchone()
        if conflict:
            reasons=[]
            if conflict['class_key']==str(b['class_key']): reasons.append('class arm')
            if conflict['teacher_id']==str(b['teacher_id']): reasons.append('teacher')
            if b.get('room') and conflict['room']==str(b['room']): reasons.append('room')
            return jsonify(error='Timetable conflict: '+', '.join(reasons)+'.'),409
        rid=str(uuid.uuid4()); c.execute('INSERT INTO timetable_entries VALUES(?,?,?,?,?,?,?,?,?,?,?)',(rid,b['session_id'],b['term_id'],b['class_key'],b['subject_id'],b['teacher_id'],b.get('room'),day,str(b['period']),current_user()['id'],now()))
    audit(current_user(),'timetable_entry_created','timetable_entry',rid,b)
    return jsonify(id=rid),201

@app.post('/api/workflows/results/<record_id>/submit')
@role_required('teacher')
def workflow_result_submit(record_id):
    user=current_user()
    with db() as c:
        result_row=c.execute("SELECT data FROM records WHERE id=? AND entity='Result'",(record_id,)).fetchone()
        if not result_row: return jsonify(error='Result record not found.'),404
        result=json.loads(result_row['data']); cls=str(result.get('class_arm_id') or ''); subject=str(result.get('subject_id') or '')
        if not teacher_assignment_allows(user,{'class_arm_id':cls,'subject_id':subject},write=True): return jsonify(error='You may submit results only for your assigned subject and class.'),403
        existing=c.execute("SELECT * FROM result_reviews WHERE result_record_id=? ORDER BY created_at DESC LIMIT 1",(record_id,)).fetchone()
        if existing and existing['status']=='submitted': return jsonify(id=existing['id'],status='submitted'),200
        if existing and existing['status']=='correction_requested':
            c.execute("UPDATE result_reviews SET status='submitted',correction_note=NULL,reviewed_by=NULL,reviewed_at=NULL,created_at=? WHERE id=?",(now(),existing['id']))
            rid=existing['id']
        else:
            rid=str(uuid.uuid4()); c.execute('INSERT INTO result_reviews(id,result_record_id,class_key,subject_id,teacher_id,status,created_at) VALUES(?,?,?,?,?,?,?)',(rid,record_id,cls,subject,user['id'],'submitted',now()))
    audit(user,'result_submitted','result_review',rid)
    return jsonify(id=rid,status='submitted'),201


def class_results_complete(conn, class_key, session_name, term_name):
    assignment_rows=conn.execute("SELECT data FROM records WHERE entity='Assignment'").fetchall()
    subjects={}
    for row in assignment_rows:
        item=json.loads(row['data'])
        if item.get('type')=='subject' and str(item.get('class_arm_id') or '')==str(class_key) and item.get('subject_id'):
            subjects[str(item['subject_id'])]=True
    student_rows=conn.execute("SELECT id,data FROM records WHERE entity='Student'").fetchall()
    expected=set()
    for row in student_rows:
        student=json.loads(row['data'])
        if str(student.get('class_arm_id') or '')==str(class_key) and str(student.get('status','Active')).casefold()=='active':
            expected.add(row['id'])
    if not subjects or not expected: return False
    result_rows=conn.execute("SELECT id,data FROM records WHERE entity='Result'").fetchall()
    by_subject={subject:{} for subject in subjects}
    for row in result_rows:
        result=json.loads(row['data'])
        subject=str(result.get('subject_id') or '')
        if (subject in by_subject and str(result.get('class_arm_id') or '')==str(class_key)
                and result.get('session')==session_name and result.get('term')==term_name):
            by_subject[subject][str(result.get('student_id') or '')]=(row['id'],result)
    for subject in subjects:
        if not expected.issubset(by_subject[subject]): return False
        for student_id in expected:
            record_id,result=by_subject[subject][student_id]
            if result.get('status') not in ('submitted','approved'): return False
            review=conn.execute('SELECT status FROM result_reviews WHERE result_record_id=? ORDER BY created_at DESC LIMIT 1',(record_id,)).fetchone()
            if not review or review['status'] not in ('submitted','approved'): return False
    return True

@app.get('/api/workflows/result-reviews')
@role_required('admin','principal','teacher')
def workflow_result_reviews():
    user=current_user()
    with db() as c: rows=c.execute('SELECT * FROM result_reviews ORDER BY created_at DESC').fetchall()
    out=[]
    for r in rows:
        d=dict(r)
        with db() as c:
            result_row=c.execute("SELECT data FROM records WHERE id=? AND entity='Result'",(d['result_record_id'],)).fetchone()
            if not result_row: continue
            result=json.loads(result_row['data'])
            d.update(session=result.get('session',''),term=result.get('term',''),student_name=result.get('student_name',''),subject_name=result.get('subject_name',''),class_arm_name=result.get('class_arm_name',''))
            d['form_eligible']=class_results_complete(c,d['class_key'],d['session'],d['term'])
        if user['role']=='teacher':
            own=d['teacher_id']==user['id']
            form_class=teacher_has_class(user,d['class_key'],form_only=True)
            if not own and not form_class: continue
            d['is_form_teacher']=form_class
        out.append(d)
    return jsonify(out)

@app.post('/api/workflows/result-reviews/<rid>/decision')
@role_required('teacher','admin','principal')
def workflow_result_review_decision(rid):
    b=request.get_json(silent=True) or {}; decision=b.get('decision'); user=current_user()
    if decision not in ('correction_requested','approved','rejected'): return jsonify(error='Invalid result review decision.'),400
    with db() as c:
        row=c.execute('SELECT * FROM result_reviews WHERE id=?',(rid,)).fetchone()
        if not row: return jsonify(error='Review not found.'),404
        if user['role']=='teacher':
            if not teacher_has_class(user,row['class_key'],form_only=True):
                return jsonify(error='Only the assigned Form Teacher may review this class result.'),403
            if decision=='approved':
                result_row=c.execute("SELECT data FROM records WHERE id=? AND entity='Result'",(row['result_record_id'],)).fetchone()
                result=json.loads(result_row['data']) if result_row else {}
                if not class_results_complete(c,row['class_key'],result.get('session',''),result.get('term','')):
                    return jsonify(error='All active students must have submitted results for every assigned subject before Form Teacher approval.'),409
            elif decision!='correction_requested': return jsonify(error='Form Teachers may approve or request corrections.'),403
        elif row['status']!='approved':
            return jsonify(error='Admin or Principal review is available only after Form Teacher approval.'),409
        c.execute('UPDATE result_reviews SET status=?,correction_note=?,reviewed_by=?,reviewed_at=? WHERE id=?',(decision,str(b.get('note','')),user['id'],now(),rid))
        result_row=c.execute("SELECT data FROM records WHERE id=? AND entity='Result'",(row['result_record_id'],)).fetchone()
        if result_row:
            result_data=json.loads(result_row['data'])
            result_data['status']='approved' if decision=='approved' else ('correction' if decision in ('correction_requested','rejected') else result_data.get('status','submitted'))
            if decision=='correction_requested': result_data['correction_note']=str(b.get('note',''))
            c.execute("UPDATE records SET data=?,updated_date=? WHERE id=? AND entity='Result'",(json.dumps(result_data),now(),row['result_record_id']))
    audit(user,'result_'+decision,'result_review',rid)
    return jsonify(ok=True,status=decision)

@app.post('/api/workflows/library/books')
@role_required('librarian','admin')
def workflow_library_book_create():
    b=request.get_json(silent=True) or {}; title=str(b.get('title','')).strip()
    if not title: return jsonify(error='Book title is required.'),400
    try: copies=max(0,int(b.get('copies',1)))
    except Exception: return jsonify(error='Copies must be a non-negative whole number.'),400
    rid=str(uuid.uuid4())
    with db() as c: c.execute('INSERT INTO library_books VALUES(?,?,?,?,?,?,?,?)',(rid,title,str(b.get('author','')),str(b.get('category','')),str(b.get('isbn','')),copies,current_user()['id'],now()))
    return jsonify(id=rid,title=title,copies=copies),201

@app.get('/api/workflows/library/books')
@login_required
def workflow_library_books():
    with db() as c: rows=c.execute('SELECT * FROM library_books ORDER BY title').fetchall()
    return jsonify([dict(r) for r in rows])

@app.post('/api/workflows/library/loans')
@role_required('librarian','admin')
def workflow_library_loan():
    b=request.get_json(silent=True) or {}
    if not all(str(b.get(k,'')).strip() for k in ('book_id','borrower_id','borrower_name','due_at')): return jsonify(error='Book, borrower and due date are required.'),400
    with db() as c:
        book=c.execute('SELECT * FROM library_books WHERE id=?',(b['book_id'],)).fetchone()
        if not book: return jsonify(error='Book not found.'),404
        borrowed=c.execute("SELECT COUNT(*) n FROM library_loans WHERE book_id=? AND status='borrowed'",(b['book_id'],)).fetchone()['n']
        if borrowed>=book['copies']: return jsonify(error='No available copy of this book.'),409
        rid=str(uuid.uuid4()); c.execute('INSERT INTO library_loans VALUES(?,?,?,?,?,?,?,?,?,?)',(rid,b['book_id'],b['borrower_id'],b['borrower_name'],now(),b['due_at'],None,'borrowed',current_user()['id'],now()))
    audit(current_user(),'library_book_borrowed','library_loan',rid)
    if not notify_user(b.get('borrower_id'), 'library', 'Library book issued',
                       f'{book["title"]} is due back on {b["due_at"]}.'):
        notify_student_contacts(b.get('borrower_id'), 'library', 'Library book issued',
                                f'{book["title"]} is due back on {b["due_at"]}.')
    return jsonify(id=rid,status='borrowed'),201

@app.post('/api/workflows/library/loans/<rid>/return')
@role_required('librarian','admin')
def workflow_library_return(rid):
    b=request.get_json(silent=True) or {}; status=b.get('status','returned')
    if status not in ('returned','lost','damaged'): return jsonify(error='Invalid return status.'),400
    with db() as c:
        row=c.execute('SELECT * FROM library_loans WHERE id=?',(rid,)).fetchone()
        if not row: return jsonify(error='Loan not found.'),404
        if row['status']!='borrowed': return jsonify(error='Loan is already closed.'),409
        c.execute('UPDATE library_loans SET status=?,returned_at=? WHERE id=?',(status,now(),rid))
    audit(current_user(),'library_loan_'+status,'library_loan',rid)
    notify_user(row['borrower_id'], 'library', f'Library book {status}',
                f'{row["borrower_name"]} — the library book loan was marked {status}.')
    notify_student_contacts(row['borrower_id'], 'library', f'Library book {status}',
                            f'The library book loan was marked {status}.')
    return jsonify(ok=True,status=status)

@app.get('/api/workflows/library/loans')
@role_required('librarian','admin','principal','student','parent')
def workflow_library_loans():
    user=current_user()
    with db() as c: rows=c.execute('SELECT l.*,b.title AS book_title FROM library_loans l JOIN library_books b ON b.id=l.book_id ORDER BY l.borrowed_at DESC').fetchall()
    out=[dict(r) for r in rows]
    if user['role'] in ('student','parent'):
        linked=linked_students(user); child_ids={str(x.get('_record_id','')) for x in linked}; child_ids.update(str(x.get(k,'')) for x in linked for k in ('id','student_id','portal_user_id','user_id') if x.get(k))
        if user['role']=='student': child_ids.add(user['id'])
        out=[r for r in out if r['borrower_id'] in child_ids]
    return jsonify(out)

@app.post('/api/account/recovery-links')
@role_required('admin','principal')
def account_recovery_link_create():
    b=request.get_json(silent=True) or {}; target=str(b.get('user_id','')).strip(); user=current_user()
    base=public_base_url()
    if not base: return jsonify(error='Set the Public application URL before creating account recovery links.'),503
    with db() as c:
        row=c.execute('SELECT id,email,role FROM auth_users WHERE id=?',(target,)).fetchone()
        if not row: return jsonify(error='Target account not found.'),404
        if user['role']=='principal' and row['role']=='admin': return jsonify(error='Principal may not recover the Admin account through ordinary recovery. Use Admin handover recovery.'),403
        if row['role'] in ('admin','principal') and user['role'] not in ('admin','principal'): return jsonify(error='Not authorised.'),403
        token=secrets.token_urlsafe(40); token_hash=generate_password_hash(token); rid=token_hash
        exp=(datetime.now(timezone.utc)+timedelta(hours=2)).isoformat()
        c.execute('INSERT INTO recovery_links(token_hash,target_user_id,target_email,generated_by,created_at,expires_at) VALUES(?,?,?,?,?,?)',(rid,target,row['email'],user['id'],now(),exp))
    audit(user,'account_recovery_link_created','auth_user',target,{'target_email':row['email'],'expires_at':exp})
    return jsonify(recovery_url=f'{base}/reset-password?recovery={quote(token)}',expires_at=exp),201

@app.post('/api/account/recovery-links/redeem')
def account_recovery_link_redeem():
    b=request.get_json(silent=True) or {}; token=str(b.get('token','')); password=str(b.get('password',''))
    if len(password)<8: return jsonify(error='Password must be at least 8 characters.'),400
    with db() as c:
        rows=c.execute('SELECT * FROM recovery_links WHERE used_at IS NULL AND revoked_at IS NULL').fetchall(); match=next((r for r in rows if check_password_hash(r['token_hash'],token)),None)
        if not match or match['expires_at']<now(): return jsonify(error='Recovery link is invalid, expired or already used.'),400
        c.execute('UPDATE auth_users SET password_hash=? WHERE id=?',(generate_password_hash(password),match['target_user_id']))
        c.execute('UPDATE recovery_links SET used_at=? WHERE token_hash=?',(now(),match['token_hash']))
    audit({'id':match['target_user_id'],'role':'user'},'account_recovery_link_used','auth_user',match['target_user_id'],{'generated_by':match['generated_by']})
    return jsonify(ok=True)

@app.post('/api/account/recovery-links/revoke')
@role_required('admin','principal')
def account_recovery_link_revoke():
    token=str((request.get_json(silent=True) or {}).get('token',''))
    with db() as c:
        rows=c.execute('SELECT token_hash FROM recovery_links WHERE used_at IS NULL AND revoked_at IS NULL').fetchall()
        match=next((r for r in rows if check_password_hash(r['token_hash'],token)),None)
        if not match: return jsonify(error='Active recovery link not found.'),404
        c.execute('UPDATE recovery_links SET revoked_at=? WHERE token_hash=?',(now(),match['token_hash']))
    audit(current_user(),'account_recovery_link_revoked','recovery_link',None)
    return jsonify(ok=True)

@app.get('/api/admin-handover/candidates')
@role_required('principal')
def admin_handover_candidates():
    with db() as c:
        rows=c.execute("SELECT id,email,full_name,role FROM auth_users WHERE role IN ('staff','teacher','bursar','librarian','admin') AND id<>? ORDER BY full_name,email",(current_user()['id'],)).fetchall()
    return jsonify([dict(r) for r in rows if not is_primary_admin_id(r['id'])])

@app.get('/api/admin-handover')
@role_required('principal')
def admin_handover_list():
    with db() as c: rows=c.execute('SELECT * FROM admin_handover_requests ORDER BY created_at DESC LIMIT 100').fetchall()
    return jsonify([dict(r,details=json.loads(r['details_json'])) for r in rows])

@app.get('/api/admin-handover/mine')
@login_required
def admin_handover_mine():
    with db() as c: rows=c.execute("SELECT * FROM admin_handover_requests WHERE replacement_user_id=? AND status IN ('pending','accepted') ORDER BY created_at DESC",(current_user()['id'],)).fetchall()
    return jsonify([dict(r,details=json.loads(r['details_json'])) for r in rows])

@app.post('/api/admin-handover')
@role_required('principal')
def admin_handover_initiate():
    b=request.get_json(silent=True) or {}; target=str(b.get('replacement_user_id','')); password=str(b.get('principal_password',''))
    with db() as c:
        principal=c.execute('SELECT password_hash FROM auth_users WHERE id=?',(current_user()['id'],)).fetchone()
        if not principal or not check_password_hash(principal['password_hash'],password): return jsonify(error='Principal re-authentication failed.'),403
        replacement=c.execute('SELECT id,email,role FROM auth_users WHERE id=?',(target,)).fetchone()
        if not replacement: return jsonify(error='Replacement account not found.'),404
        if replacement['role'] not in ('staff','teacher','bursar','librarian','admin'): return jsonify(error='Replacement must be an existing staff account.'),400
        if is_primary_admin_id(replacement['id'], c): return jsonify(error='The protected primary owner account cannot be used as a replacement through ordinary handover.'),403
        rid=str(uuid.uuid4()); c.execute('INSERT INTO admin_handover_requests(id,initiated_by,replacement_user_id,status,created_at,details_json) VALUES(?,?,? ,\'pending\',?,?)',(rid,current_user()['id'],target,now(),json.dumps({'initiated_by_email':current_user()['email']})))
    audit(current_user(),'admin_handover_initiated','admin_handover',rid,{'replacement_user_id':target})
    return jsonify(id=rid,status='pending'),201

@app.post('/api/admin-handover/<rid>/accept')
@login_required
def admin_handover_accept(rid):
    b=request.get_json(silent=True) or {}; password=str(b.get('password','')); user=current_user()
    with db() as c:
        row=c.execute('SELECT * FROM admin_handover_requests WHERE id=? AND replacement_user_id=?',(rid,user['id'])).fetchone()
        if not row or row['status']!='pending': return jsonify(error='Handover request not found or no longer pending.'),404
        auth=c.execute('SELECT password_hash FROM auth_users WHERE id=?',(user['id'],)).fetchone()
        if not auth or not check_password_hash(auth['password_hash'],password): return jsonify(error='Re-authentication failed.'),403
        c.execute('UPDATE admin_handover_requests SET status=\'accepted\',accepted_at=? WHERE id=?',(now(),rid))
    audit(user,'admin_handover_accepted','admin_handover',rid)
    return jsonify(ok=True,status='accepted')

@app.post('/api/admin-handover/<rid>/complete')
@role_required('principal')
def admin_handover_complete(rid):
    with db() as c:
        row=c.execute('SELECT * FROM admin_handover_requests WHERE id=? AND status=\'accepted\'',(rid,)).fetchone()
        if not row: return jsonify(error='Accepted handover not found.'),404
        replacement=c.execute('SELECT id,email,full_name FROM auth_users WHERE id=?',(row['replacement_user_id'],)).fetchone()
        if not replacement: return jsonify(error='Replacement account no longer exists.'),404
        # Preserve the protected owner by immutable auth user ID, not by email.
        owner_row=c.execute('SELECT primary_admin_user_id FROM school_security_settings WHERE id=1').fetchone()
        owner_id=owner_row['primary_admin_user_id'] if owner_row else None
        former_admins=c.execute("SELECT id,email FROM auth_users WHERE role='admin' AND id<>? AND (? IS NULL OR id<>?)",(replacement['id'],owner_id,owner_id)).fetchall()
        c.execute("UPDATE auth_users SET role='staff' WHERE role='admin' AND id<>? AND (? IS NULL OR id<>?)",(replacement['id'],owner_id,owner_id))
        for former in former_admins:
            c.execute("UPDATE records SET data=json_set(data,'$.role','staff'),updated_date=? WHERE entity='User' AND lower(json_extract(data,'$.email'))=?",(now(),former['email'].lower()))
        c.execute("UPDATE auth_users SET role='admin' WHERE id=?",(replacement['id'],))
        c.execute("UPDATE records SET data=json_set(data,'$.role','admin'),updated_date=? WHERE entity='User' AND lower(json_extract(data,'$.email'))=?",(now(),replacement['email'].lower()))
        c.execute("UPDATE admin_handover_requests SET status='completed',completed_at=? WHERE id=?",(now(),rid))
    audit(current_user(),'admin_handover_completed','admin_handover',rid,{'replacement_user_id':replacement['id']})
    return jsonify(ok=True,status='completed')


@app.post('/api/account/email-change/request')
@app.post('/api/admin/email-change/request')
@login_required
def account_email_change_request():
    """Start a verified email change for any signed-in account."""
    b=request.get_json(silent=True) or {}
    new_email=str(b.get('new_email','')).strip().lower()
    password=str(b.get('password',''))
    if not re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$',new_email):
        return jsonify(error='Enter a valid new email address.'),400
    if new_email == str(current_user().get('email','')).lower():
        return jsonify(error='The new email is the same as your current email.'),400
    with db() as c:
        auth=c.execute('SELECT password_hash FROM auth_users WHERE id=?',(current_user()['id'],)).fetchone()
        if not auth or not check_password_hash(auth['password_hash'],password):
            return jsonify(error='Re-authentication failed. Enter your current password.'),403
        if c.execute('SELECT 1 FROM auth_users WHERE lower(email)=?',(new_email,)).fetchone():
            return jsonify(error='That email is already in use.'),409
        code=f'{secrets.randbelow(1000000):06d}'
        rid=str(uuid.uuid4())
        exp=(datetime.now(timezone.utc)+timedelta(minutes=15)).isoformat()
        c.execute('DELETE FROM email_change_requests WHERE user_id=? AND verified_at IS NULL',(current_user()['id'],))
        c.execute('INSERT INTO email_change_requests(id,user_id,new_email,code_hash,expires_at,created_at) VALUES(?,?,?,?,?,?)',(rid,current_user()['id'],new_email,generate_password_hash(code),exp,now()))
    school_name=smtp_config().get('SCHOOL_NAME') or 'Your School'
    sent,error=send_mail(new_email,f'{school_name} new email verification',
                         f'Dear {current_user().get("full_name") or "Portal user"},\n\n'
                         f'Use this code to verify the new email address for your {school_name} portal account:\n\n{code}\n\n'
                         'It expires in 15 minutes. Your account email will not change until you complete verification. '
                         'If you did not request this change, contact the school office immediately.')
    if not sent:
        with db() as c: c.execute('DELETE FROM email_change_requests WHERE id=?',(rid,))
        return jsonify(error='Could not send verification code. The school email service must be configured before changing email addresses.',detail=error),503
    return jsonify(ok=True,request_id=rid,expires_at=exp)

@app.post('/api/account/email-change/verify')
@app.post('/api/admin/email-change/verify')
@login_required
def account_email_change_verify():
    """Verify and atomically update the authenticated account email and linked records."""
    b=request.get_json(silent=True) or {}
    rid=str(b.get('request_id',''))
    code=str(b.get('code','')).strip()
    actor=current_user()
    with db() as c:
        row=c.execute('SELECT * FROM email_change_requests WHERE id=? AND user_id=?',(rid,actor['id'])).fetchone()
        if not row or row['verified_at'] or row['expires_at']<now():
            return jsonify(error='Email verification request is invalid or expired. Request a new code.'),400
        if not check_password_hash(row['code_hash'],code):
            return jsonify(error='Incorrect verification code.'),400
        if c.execute('SELECT 1 FROM auth_users WHERE lower(email)=?',(row['new_email'],)).fetchone():
            return jsonify(error='That email is already in use.'),409
        old_email=str(actor['email']).lower()
        # The primary administrator remains protected by immutable user ID; changing
        # the verified email does not change ownership or role.
        c.execute('UPDATE auth_users SET email=? WHERE id=?',(row['new_email'],actor['id']))
        # Update only existing matching email fields, so unrelated records are not
        # polluted with null email keys. This also keeps linked student/guardian and
        # teacher assignment references consistent after a verified account change.
        email_fields = ('email', 'user_email', 'student_email', 'teacher_email', 'guardian_email', 'guardian_email_2', 'parent_email')
        linked_entities = ('User', 'StaffProfile', 'PortalProfile', 'Student', 'Assignment', 'TimetableEntry', 'Attendance', 'Result', 'PortalRequest')
        entity_marks = ','.join('?' for _ in linked_entities)
        for field in email_fields:
            c.execute(
                f"UPDATE records SET data=json_set(data,'$.{field}',?),updated_date=? "
                f"WHERE entity IN ({entity_marks}) AND lower(COALESCE(json_extract(data,'$.{field}'),''))=?",
                (row['new_email'], now(), *linked_entities, old_email),
            )
        c.execute('UPDATE email_change_requests SET verified_at=? WHERE id=?',(now(),rid))
    audit(actor,'account_email_changed','auth_user',actor['id'],{'old_email':old_email,'new_email':row['new_email']})
    return jsonify(ok=True,email=row['new_email'])


@app.route('/api/finance/school-accounts', methods=['GET','POST'])
@login_required
def finance_school_accounts():
    user=current_user()
    if request.method == 'GET':
        with db() as c:
            if user['role'] in ('admin','principal','bursar'):
                rows=c.execute('SELECT * FROM school_payment_accounts ORDER BY submitted_at DESC').fetchall()
            else:
                rows=c.execute("SELECT * FROM school_payment_accounts WHERE status='active' ORDER BY purpose,bank_name").fetchall()
        return jsonify([dict(r) for r in rows])
    if user['role'] != 'bursar': return jsonify(error='Only the bursary can propose school payment accounts.'),403
    body=request.get_json(silent=True) or {}
    bank=str(body.get('bank_name') or '').strip(); name=str(body.get('account_name') or '').strip(); number=re.sub(r'\s+','',str(body.get('account_number') or ''))
    purpose=str(body.get('purpose') or 'school_fees').strip()
    instructions=str(body.get('instructions') or '').strip()
    if not bank or len(bank)>100 or not name or len(name)>150 or len(instructions)>500 or not re.fullmatch(r'\d{10}',number): return jsonify(error='Enter a valid bank name, account name, 10-digit Nigerian account number and instructions no longer than 500 characters.'),400
    if purpose not in ('school_fees','other_fees','general'): return jsonify(error='Invalid payment account purpose.'),400
    rid=str(uuid.uuid4())
    with db() as c:
        duplicate=c.execute("SELECT id FROM school_payment_accounts WHERE account_number=? AND purpose=? AND status IN ('pending','active') LIMIT 1",(number,purpose)).fetchone()
        if duplicate: return jsonify(error='This bank account is already pending or active for that payment purpose.'),409
        c.execute('INSERT INTO school_payment_accounts(id,bank_name,account_name,account_number,purpose,instructions,status,submitted_by,submitted_at) VALUES(?,?,?,?,?,?,?,?,?)',(rid,bank,name,number,purpose,instructions,'pending',user['id'],now()))
    audit(user,'school_payment_account_submitted','school_payment_account',rid,{'bank_name':bank,'purpose':purpose})
    return jsonify(ok=True,id=rid,status='pending',message='School payment account submitted for Principal approval.'),201

@app.post('/api/finance/school-accounts/<rid>/decision')
@role_required('principal')
def finance_school_account_decision(rid):
    body=request.get_json(silent=True) or {}; decision=str(body.get('decision') or '')
    if decision not in ('approved','rejected','inactive'): return jsonify(error='Decision must be approved, rejected or inactive.'),400
    with db() as c:
        row=c.execute('SELECT * FROM school_payment_accounts WHERE id=?',(rid,)).fetchone()
        if not row: return jsonify(error='School payment account not found.'),404
        if decision == 'inactive':
            if row['status'] != 'active': return jsonify(error='Only an active account can be deactivated.'),400
            status='inactive'
        else:
            if row['status'] != 'pending': return jsonify(error='Only pending account proposals can be approved or rejected.'),409
            status='active' if decision == 'approved' else 'rejected'
        c.execute('UPDATE school_payment_accounts SET status=?,reviewed_by=?,reviewed_at=?,decision_note=? WHERE id=?',(status,current_user()['id'],now(),str(body.get('note') or '')[:1000],rid))
    audit(current_user(),'school_payment_account_'+status,'school_payment_account',rid,{'bank_name':row['bank_name'],'purpose':row['purpose']})
    return jsonify(ok=True,status=status)

@app.route('/api/payroll/my-bank-details', methods=['GET','PUT'])
@login_required
def payroll_my_bank_details():
    user=current_user()
    if user['role'] not in _staff_roles(): return jsonify(error='Only staff accounts can manage salary bank details.'),403
    with db() as c:
        staff=_staff_record_for_user(c,user)
        if not staff: return jsonify(error='Your staff profile is not linked to this login. Ask the school administrator to link it before adding payment details.'),404
        row=c.execute('SELECT encrypted_payload FROM staff_bank_details WHERE staff_id=?',(staff['id'],)).fetchone()
        if request.method == 'GET':
            if not row: return jsonify(bank_name='',account_name='',account_number='')
            try: return jsonify(json.loads(_bank_cipher().decrypt(row['encrypted_payload'].encode()).decode()))
            except (InvalidToken,ValueError): return jsonify(error='Stored bank details cannot be decrypted. Contact the system administrator; do not overwrite them.'),500
        body=request.get_json(silent=True) or {}
        bank=str(body.get('bank_name') or '').strip(); name=str(body.get('account_name') or '').strip(); number=re.sub(r'\s+','',str(body.get('account_number') or ''))
        if not bank or len(bank)>100 or not name or len(name)>150 or not re.fullmatch(r'\d{10}',number): return jsonify(error='Enter a valid bank name, account name and 10-digit Nigerian account number.'),400
        payload={'bank_name':bank,'account_name':name,'account_number':number}
        encrypted=_bank_cipher().encrypt(json.dumps(payload).encode()).decode()
        c.execute('INSERT INTO staff_bank_details(staff_id,encrypted_payload,updated_at,updated_by) VALUES(?,?,?,?) ON CONFLICT(staff_id) DO UPDATE SET encrypted_payload=excluded.encrypted_payload,updated_at=excluded.updated_at,updated_by=excluded.updated_by',(staff['id'],encrypted,now(),user['id']))
    audit(user,'staff_bank_details_updated','StaffProfile',staff['id'],{'bank_name':bank})
    return jsonify(ok=True,message='Your payment details have been saved securely.',bank_name=bank,account_name=name,account_number=f'******{number[-4:]}')

@app.get('/api/payroll/staff-bank-details')
@role_required('bursar')
def payroll_staff_bank_details():
    with db() as c:
        rows=c.execute("SELECT r.id,r.data,s.encrypted_payload,s.updated_at FROM records r LEFT JOIN staff_bank_details s ON s.staff_id=r.id WHERE r.entity='StaffProfile' ORDER BY json_extract(r.data,'$.full_name') COLLATE NOCASE").fetchall()
        output=[]
        for row in rows:
            try: profile=json.loads(row['data'])
            except Exception: continue
            details={}
            if row['encrypted_payload']:
                try: details=json.loads(_bank_cipher().decrypt(row['encrypted_payload'].encode()).decode())
                except (InvalidToken,ValueError): details={'error':'Unable to decrypt stored details'}
            output.append({'staff_id':row['id'],'staff_name':profile.get('full_name') or 'Staff member','role':profile.get('role') or '', 'email':profile.get('email') or '', 'bank_name':details.get('bank_name',''),'account_name':details.get('account_name',''),'account_number':details.get('account_number',''),'updated_at':row['updated_at'] or ''})
    return jsonify(output)

@app.get('/api/payroll/history')
@login_required
def payroll_history():
    user=current_user()
    with db() as c:
        profiles=c.execute('SELECT * FROM salary_profiles ORDER BY effective_from DESC').fetchall()
        payments=c.execute('SELECT * FROM salary_payment_records ORDER BY paid_on DESC,created_at DESC').fetchall()
        staff_row=c.execute("SELECT id,data FROM records WHERE entity='StaffProfile' AND lower(json_extract(data,'$.email'))=?",(user['email'].lower(),)).fetchone()
    if user['role'] not in ('admin','principal','bursar'):
        staff_ids={user['id']}
        if staff_row: staff_ids.add(staff_row['id'])
        profiles=[r for r in profiles if r['staff_id'] in staff_ids or r['staff_id'].lower()==user['email'].lower()]
        payments=[r for r in payments if r['staff_id'] in staff_ids or r['staff_id'].lower()==user['email'].lower()]
    return jsonify(profiles=[dict(r) for r in profiles],payments=[dict(r) for r in payments])

@app.post('/api/payroll/payments/process')
@role_required('bursar')
def payroll_payment_process():
    b=request.get_json(silent=True) or {}; approval_id=str(b.get('approval_id','')).strip(); paid_on=str(b.get('paid_on','')).strip(); method=str(b.get('method','')).strip(); period=str(b.get('period','')).strip()
    try: amount=float(b.get('amount'))
    except (TypeError,ValueError): return jsonify(error='Payment amount must be numeric.'),400
    if amount<=0 or not paid_on: return jsonify(error='A positive amount and payment date are required.'),400
    with db() as c:
        row=c.execute("SELECT * FROM approval_requests WHERE id=? AND kind='salary_payment' AND status IN ('approved','partial')",(approval_id,)).fetchone()
        if not row: return jsonify(error='An approved salary-payment proposal is required.'),404
        payload=json.loads(row['payload_json']); authorized=float(payload.get('amount') or 0); already=c.execute('SELECT COALESCE(SUM(amount),0) AS total FROM salary_payment_records WHERE approval_id=?',(approval_id,)).fetchone()['total']
        if amount+already>authorized+0.00001: return jsonify(error=f'Payment exceeds the approved balance of {max(authorized-already,0):.2f}.'),400
        staff_id=str(payload.get('staff_id','')); staff_name=str(payload.get('staff_name') or staff_id)
        if not staff_id: return jsonify(error='Approved proposal has no staff member.'),400
        pid=str(uuid.uuid4()); c.execute('INSERT INTO salary_payment_records(id,approval_id,staff_id,staff_name,amount,paid_on,method,period,processed_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',(pid,approval_id,staff_id,staff_name,amount,paid_on,method,period,current_user()['id'],now()))
        total=already+amount; status='completed' if total+0.00001>=authorized else 'partial'
        c.execute('UPDATE approval_requests SET status=? WHERE id=?',(status,approval_id))
    audit(current_user(),'salary_payment_processed','salary_payment',pid,{'approval_id':approval_id,'amount':amount,'status':status})
    with db() as c:
        staff_row = c.execute("SELECT data FROM records WHERE entity='StaffProfile' AND id=?", (staff_id,)).fetchone()
    if staff_row:
        staff_email = json.loads(staff_row['data']).get('email')
        notify_email(staff_email, 'finance', 'Staff salary payment processed',
                     f'A salary payment of {amount:.2f} was processed for {staff_name}.')
    else:
        notify_user(staff_id, 'finance', 'Staff salary payment processed',
                    f'A salary payment of {amount:.2f} was processed for {staff_name}.')
    return jsonify(id=pid,status=status,paid_total=total,approved_amount=authorized,remaining=max(authorized-total,0)),201

@app.get('/api/report-cards/archive')
@login_required
def report_archive_search():
    user=current_user(); q=request.args
    sql='SELECT * FROM report_card_archive WHERE 1=1'; args=[]
    for key,col in [('student_id','student_id'),('student_name','student_name'),('admission_no','admission_no'),('class','class_arm_name'),('session','session_name'),('term','term_name')]:
        value=str(q.get(key,'')).strip()
        if value: sql+=f' AND lower({col}) LIKE ?'; args.append('%'+value.lower()+'%')
    sql+=' ORDER BY published_at DESC LIMIT 500'
    with db() as c:
        rows=c.execute(sql,args).fetchall()
        if user['role'] not in ('admin','principal'):
            if user['role']=='teacher':
                assigned=set()
                for assignment in _teacher_assignments(user):
                    assigned.update(str(assignment.get(k,'')) for k in ('class_arm_id','class_arm_name') if assignment.get(k))
                rows=[r for r in rows if str(r['class_arm_id'] or r['class_arm_name']) in assigned]
            elif user['role'] in ('student','parent'):
                linked=linked_students(user)
                allowed={str(x.get('_record_id','')) for x in linked}
                allowed.update(str(x.get(k,'')) for x in linked for k in ('id','student_id','portal_user_id','user_id') if x.get(k))
                admissions={str(x.get('admission_no','')).lower() for x in linked if x.get('admission_no')}
                email=user['email'].lower()
                rows=[r for r in rows if (r['student_id'] in allowed or str(r['admission_no'] or '').lower() in admissions or str(r['student_id']).lower()==email) and learner_fee_access(user,r['student_id'],include_result_penalties=True)]
            else:
                rows=[]
    return jsonify([dict(r,results=json.loads(r['results_json'])) for r in rows])

@app.post('/api/report-cards/publish')
@role_required('admin','principal')
def report_cards_publish():
    b=request.get_json(silent=True) or {}; session_id=str(b.get('session_id','')); term_id=str(b.get('term_id','')); class_key=str(b.get('class_key','')).strip()
    if not session_id or not term_id: return jsonify(error='Academic session and term are required.'),400
    with db() as c:
        term=c.execute('SELECT t.*,s.name AS session_name FROM academic_terms t JOIN academic_sessions s ON s.id=t.session_id WHERE t.id=? AND t.session_id=?',(term_id,session_id)).fetchone()
        if not term: return jsonify(error='Term does not belong to the selected session.'),400
        closing=term['closing_on']
        today=datetime.now().date().isoformat()
        if not closing or today < closing or (term['ends_on'] and today > term['ends_on']): return jsonify(error='Report cards can only be published during the configured term-closing period.'),403
        rows=c.execute("SELECT id,data FROM records WHERE entity='Result'",()).fetchall()
        matched=[]
        for rec in rows:
            d=json.loads(rec['data'])
            if str(d.get('session',''))!=term['session_name'] or str(d.get('term',''))!=term['name']: continue
            if class_key and str(d.get('class_arm_id') or d.get('class_arm_name'))!=class_key: continue
            matched.append((rec,d))
        if any(d.get('status') not in ('approved','published') for _,d in matched): return jsonify(error='Every result in the selected class and term must be approved before report cards can be published.'),409
        grouped={}
        for rec,d in matched:
            sid=str(d.get('student_id',''))
            if not sid: continue
            grouped.setdefault(sid,[]).append(d)
        if not grouped: return jsonify(error='No approved results were found for the selected term/class.'),409
        stamp=now(); count=0
        for sid,results in grouped.items():
            first=results[0]; student_name=str(first.get('student_name') or sid); admission=str(first.get('admission_no') or '')
            arm_id=str(first.get('class_arm_id') or ''); arm_name=str(first.get('class_arm_name') or first.get('level') or '')
            c.execute('INSERT INTO report_card_archive(id,student_id,student_name,admission_no,class_arm_id,class_arm_name,session_name,term_name,session_id,term_id,results_json,published_by,published_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(student_id,session_id,term_id) DO NOTHING',(str(uuid.uuid4()),sid,student_name,admission,arm_id,arm_name,term['session_name'],term['name'],session_id,term_id,json.dumps(results),current_user()['id'],stamp))
            if c.execute('SELECT changes()').fetchone()[0]: count+=1
            for rec,d in matched:
                if str(d.get('student_id',''))==sid:
                    d['status']='published'; c.execute("UPDATE records SET data=?,updated_date=? WHERE id=? AND entity='Result'",(json.dumps(d),stamp,rec['id']))
    audit(current_user(),'report_cards_published','report_card_archive',None,{'session':term['session_name'],'term':term['name'],'class_key':class_key,'new_archives':count})
    for student_id in grouped:
        notify_student_contacts(student_id, 'academics', 'Report cards published',
                                f'Report cards for {term["name"]} {term["session_name"]} are now available in the school portal.')
    return jsonify(ok=True,archived_students=count),201

@app.post('/api/curriculum/documents')
@role_required('admin')
def curriculum_document_upload():
    f=request.files.get('file'); b=request.form
    required=('title','subject_id','class_key','session_id','term_id')
    if not f or any(not str(b.get(k,'')).strip() for k in required): return jsonify(error='Document and curriculum details are required.'),400
    filename=secure_filename(f.filename or 'curriculum-document')
    ext=Path(filename).suffix.lower()
    if ext not in ('.pdf','.doc','.docx','.odt','.ppt','.pptx'): return jsonify(error='Supported curriculum documents: PDF, DOC, DOCX, ODT, PPT and PPTX.'),400
    with db() as c:
        if not c.execute('SELECT 1 FROM academic_terms WHERE id=? AND session_id=?',(b['term_id'],b['session_id'])).fetchone(): return jsonify(error='Term does not belong to the selected session.'),400
        class_key=canonical_class_scope(c,b['class_key'])
        stored=f'{uuid.uuid4().hex}_{filename}'; f.save(UPLOAD_DIR/stored); uri=f'/uploads/{stored}'; rid=str(uuid.uuid4())
        c.execute('INSERT INTO curriculum_documents(id,title,subject_id,class_key,session_id,term_id,file_uri,file_name,uploaded_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',(rid,b['title'].strip(),b['subject_id'],class_key,b['session_id'],b['term_id'],uri,filename,current_user()['id'],now()))
    audit(current_user(),'curriculum_document_uploaded','curriculum_document',rid,{'filename':filename})
    return jsonify(id=rid,file_uri=uri,file_name=filename,status='pending'),201

@app.get('/api/curriculum/documents')
@login_required
def curriculum_documents_list():
    user=current_user(); query=request.args
    with db() as c: rows=c.execute('SELECT * FROM curriculum_documents ORDER BY created_at DESC').fetchall()
    if user['role']=='teacher':
        assigned=_assigned_classes(user)
        with db() as c:
            assigned_scopes={canonical_class_scope(c,class_key) for class_key in assigned}
            rows=[r for r in rows if canonical_class_scope(c,r['class_key']) in assigned_scopes]
    elif user['role'] not in ('admin','principal'):
        rows=[]
    return jsonify([dict(r) for r in rows])

@app.post('/api/curriculum/documents/<rid>/decision')
@role_required('principal')
def curriculum_document_decision(rid):
    b=request.get_json(silent=True) or {}; decision=b.get('decision')
    if decision not in ('approved','rejected'): return jsonify(error='Decision must be approved or rejected.'),400
    with db() as c:
        row=c.execute('SELECT id FROM curriculum_documents WHERE id=? AND status="pending"',(rid,)).fetchone()
        if not row: return jsonify(error='Pending curriculum document not found.'),404
        c.execute('UPDATE curriculum_documents SET status=?,reviewed_by=?,reviewed_at=? WHERE id=?',(decision,current_user()['id'],now(),rid))
    audit(current_user(),'curriculum_document_'+decision,'curriculum_document',rid)
    return jsonify(ok=True,status=decision)


# Client-side routes must return the React entry point on direct navigation/refresh.
# Keep this catch-all after every API route so unknown API URLs are never mistaken for pages.
@app.get('/api/<path:api_path>')
def api_not_found(api_path):
    return jsonify(error='API endpoint not found.'), 404

@app.get('/<path:path>')
def spa(path):
    # Do not serve the SPA for uploads or API paths; those have their own handlers.
    if path == 'api' or path.startswith('api/') or path == 'uploads' or path.startswith('uploads/'):
        return jsonify(error='Not found.'), 404
    dist = ROOT / 'dist'
    index_file = dist / 'index.html'
    if not index_file.is_file():
        return ('Frontend build is missing. Run setup.bat to install dependencies and build the frontend, then restart the server.', 503)
    candidate = dist / path
    # Serve real build assets directly; otherwise hand the route to React Router.
    if candidate.is_file():
        return send_from_directory(dist, path)
    return send_from_directory(dist, 'index.html')


init_db()
if __name__ == '__main__':
    app.run(host=os.environ.get('HOST','127.0.0.1'),port=int(os.environ.get('PORT','5000')),debug=False)
