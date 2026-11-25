// Panel web sengaja dibuat akses umum: tanpa kata sandi/token.
// Endpoint dapat dipakai langsung dari browser maupun lewat perintah WhatsApp.
export function requireWrite(_req, _res, next) { return next() }
export function requireWeb(_req, _res, next) { return next() }
export function loginHandler(_req, res) { return res.json({ ok: true, message: 'Panel akses umum, tidak perlu login.' }) }
export function logoutHandler(_req, res) { return res.json({ ok: true }) }
export function authInfo() { return { configured: false, authenticated: true, canWrite: true, public: true } }
