// Local compatibility adapter: keeps the original React pages and their
// Base44-style entity calls intact while routing all data through Flask.
const API = '/api';
async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    credentials: 'same-origin',
    ...options,
    headers: { ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...(options.headers || {}) },
  });
  const data = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/auth/')) {
      window.dispatchEvent(new Event('school:session-expired'));
    }
    const error = new Error(data?.error || `Request failed (${response.status})`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}
const qs = (obj = {}) => {
  const p = new URLSearchParams();
  Object.entries(obj).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') p.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v)); });
  return p.toString();
};
const entity = (name) => ({
  list: (options = {}) => request(`/entities/${name}?${qs(options)}`),
  filter: (query = {}, options = {}) => request(`/entities/${name}?${qs({ ...options, where: JSON.stringify(query) })}`),
  create: (data) => request(`/entities/${name}`, { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/entities/${name}/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id) => request(`/entities/${name}/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  bulkCreate: (rows = []) => request(`/entities/${name}/bulk`, { method: 'POST', body: JSON.stringify({ rows }) }),
  bulkUpdate: (rows = []) => request(`/entities/${name}/bulk`, { method: 'PATCH', body: JSON.stringify({ rows }) }),
});
const entityNames = ['Assignment','Attendance','CalendarEvent','ClassArm','FeeItem','LibraryBook','LibraryLoan','Notice','Payment','PortalProfile','PortalRequest','ResourceItem','Result','SchoolSettings','StaffPayment','StaffProfile','Student','StudentDocument','Subject','TimetableEntry','User'];
const entities = Object.fromEntries(entityNames.map((name) => [name, entity(name)]));
const auth = {
  me: () => request('/auth/me'),
  isAuthenticated: async () => { try { await request('/auth/me'); return true; } catch { return false; } },
  loginViaEmailPassword: (email, password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  register: (payload) => request('/auth/register', { method: 'POST', body: JSON.stringify(payload) }),
  verifyOtp: ({ email, otpCode }) => request('/auth/verify', { method: 'POST', body: JSON.stringify({ email, otp: otpCode }) }),
  resendOtp: (email) => request('/auth/resend', { method: 'POST', body: JSON.stringify({ email }) }),
  setToken: () => {},
  logout: async (redirect = '/login') => { try { await request('/auth/logout', { method: 'POST' }); } finally { if (redirect) window.location.href = typeof redirect === 'string' && redirect.startsWith('/') ? redirect : '/login'; } },
  redirectToLogin: () => { window.location.href = '/login'; },
  loginWithProvider: () => { throw new Error('Google sign-in is not configured in this standalone installation. Use email and password.'); },
  updateMe: (payload) => request('/auth/me', { method: 'PATCH', body: JSON.stringify(payload) }),
  resetPasswordRequest: (email) => request('/auth/password/request', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword: ({ resetToken, newPassword }) => request('/auth/password/reset', { method: 'POST', body: JSON.stringify({ token: resetToken, password: newPassword }) }),
};
const base44 = {
  auth,
  entities,
  classArms: {
    reassignAndDelete: (id, targetClassArmId) => request(`/class-arms/${encodeURIComponent(id)}/reassign-delete`, { method: 'POST', body: JSON.stringify({ target_class_arm_id: targetClassArmId }) }),
  },
  app: { getPublicSettings: () => request('/app/settings') },
  users: { inviteUser: (email, role = 'user') => request('/users/invite', { method: 'POST', body: JSON.stringify({ email, role }) }), resendInvite: (id) => request(`/users/${encodeURIComponent(id)}/resend-invite`, { method: 'POST' }), deleteAccount: (id) => request(`/users/${encodeURIComponent(id)}`, { method: 'DELETE' }) },
  integrations: { Core: {
    UploadPrivateFile: ({ file }) => upload(file, 'private'),
    UploadPublicFile: ({ file }) => upload(file, 'public'),
    CreateFileSignedUrl: ({ file_uri }) => request(`/files/signed?uri=${encodeURIComponent(file_uri)}`),
  } },
};
async function upload(file, visibility) {
  const form = new FormData(); form.append('file', file); form.append('visibility', visibility);
  return request('/files/upload', { method: 'POST', body: form });
}
export { base44 };
