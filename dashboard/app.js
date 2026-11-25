const DAYS = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu']
const WEEKS = ['Setiap minggu','Minggu ke-1','Minggu ke-2','Minggu ke-3','Minggu ke-4','Minggu ke-5']
const $ = (id) => document.getElementById(id)
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const state = { view:'dashboard', auth:null, app:null, weather:null, system:null, deployHistory:[], backups:[], status:null, announcements:[], groups:[], schedules:[], deliveries:[], activity:[], settings:null, aiStatus:null, aiModels:[], aiVisionModels:[], aiUsage:null, whatsapp:null, vips:[] }

function csrfToken() {
  const match = document.cookie.match(/(?:^|;\s*)wa_csrf=([^;]+)/)
  return match ? decodeURIComponent(match[1]) : ''
}

async function api(path, options = {}) {
  const method = options.method || 'GET'
  const headers = { 'Content-Type':'application/json', ...(options.headers||{}) }
  if (!['GET','HEAD'].includes(method)) headers['X-CSRF-Token'] = csrfToken()
  const res = await fetch(path, { headers, ...options })
  let data = {}
  try { data = await res.json() } catch { data = {} }
  if (!res.ok) throw new Error(data.error || `${res.status} ${res.statusText}`)
  return data
}

function toast(msg, bad = false) {
  const el = $('toast')
  el.textContent = msg
  el.style.borderColor = bad ? 'var(--bad)' : 'var(--accent)'
  el.hidden = false
  clearTimeout(toast.timer)
  toast.timer = setTimeout(() => { el.hidden = true }, 4200)
}

async function loadAll() {
  const paths = ['/api/auth','/api/status','/api/announcements','/api/groups','/api/schedules','/api/deliveries','/api/activity','/api/settings','/api/ai/status','/api/ai/models','/api/ai/usage','/api/whatsapp/status','/api/vip','/api/ai/vision/models','/api/app/info','/api/weather']
  const results = await Promise.all(paths.map(p => api(p).catch(e => ({ __error:e.message }))))
  const [auth, status, ann, groups, sched, deliv, act, settings, aiStatus, aiModels, aiUsage, whatsapp, vips, aiVision, appInfo, weather] = results
  if (auth.__error) return
  state.auth = auth; state.status = status
  state.app = appInfo?.__error ? null : appInfo
  state.weather = weather?.__error ? null : weather
  state.announcements = ann.announcements || []
  state.groups = groups.groups || []
  state.schedules = sched.schedules || []
  state.deliveries = deliv.deliveries || []
  state.activity = act.activity || []
  state.settings = settings
  state.aiStatus = aiStatus?.__error ? null : aiStatus
  state.aiModels = aiModels?.models || []
  state.aiVisionModels = aiVision?.models || []
  state.aiUsage = aiUsage?.__error ? null : aiUsage
  state.whatsapp = whatsapp?.__error ? null : whatsapp
  state.vips = vips?.vips || []
  await loadSystem()
  render()
}

function render() {
  renderTopbar(); renderDashboard(); renderAnnouncements(); renderSchedules()
  renderGroups(); renderHistory(); renderSettings(); renderAI(); renderBotAccount(); renderVips(); renderSystem()
}

async function loadSystem() {
  if (!state.auth?.configured) return
  const [sys, hist, backs] = await Promise.all([
    api('/api/system/status').catch(() => null),
    api('/api/system/history').catch(() => null),
    api('/api/system/backups').catch(() => null),
  ])
  state.system = sys
  state.deployHistory = hist?.history || []
  state.backups = backs?.backups || []
}

function renderSystem() {
  const s = state.system
  const pill = $('accessPill')
  pill.textContent = state.auth?.configured ? (state.auth.authenticated ? 'Login admin' : 'Perlu login') : 'Akses umum'
  $('btnLogin').hidden = !state.auth?.configured || Boolean(state.auth.authenticated)
  if (!s) {
    $('sysBot').textContent = state.auth?.configured ? 'Login dulu' : 'Tersedia setelah login'
    return
  }
  $('sysBot').textContent = s.bot?.running ? 'BERJALAN' : 'MATI'
  $('sysBotNote').textContent = `Dashboard ${s.dashboard?.url || '-'} · uptime ${s.uptimeSeconds}s`
  $('sysTunnel').textContent = s.tunnel?.running ? 'AKTIF' : 'MATI'
  $('sysTunnelUrl').innerHTML = s.tunnel?.url ? `<a href="${esc(s.tunnel.url)}" target="_blank" rel="noreferrer">${esc(s.tunnel.url)}</a>` : 'Belum ada URL quick tunnel'
  $('sysCommit').textContent = (s.git?.head || '-').slice(0, 10)
  $('sysBranch').textContent = `${s.git?.branch || '-'} · ${s.git?.subject || ''}`
  $('sysUpdate').textContent = s.git?.allowed ? 'Branch diizinkan' : `Branch ${s.git?.branch} tidak diizinkan`
  const last = s.git?.lastDeployment
  $('sysLastDeploy').textContent = last ? `${last.status} · ${last.created_at}` : 'Belum pernah deploy'
  $('sysInfo').innerHTML = `Node ${esc(s.node)} · ${esc(s.platform)}/${esc(s.arch)}<br>Commit: ${esc(s.git?.head || '-')}<br>Branch produksi: ${esc(s.git?.allowedBranch || '-')}`
  $('deployHistory').innerHTML = state.deployHistory.length
    ? state.deployHistory.map(d => `<div class="row-actions" style="justify-content:space-between;padding:4px 0"><span>${esc(d.created_at)} <span class="pill">${esc(d.status)}</span></span><span class="muted tiny">${esc((d.new_commit||'').slice(0,7))}${d.dependency_changed ? ' · dependency' : ''}</span></div>`).join('')
    : '<span class="muted">Belum ada riwayat deployment.</span>'
  const select = $('backupSelect')
  const previous = select.value
  select.innerHTML = state.backups.length
    ? state.backups.map(b => `<option value="${esc(b.name)}">${esc(b.name)} (${Math.round(b.bytes/1024)} KB)</option>`).join('')
    : '<option value="">Tidak ada backup</option>'
  if ([...select.options].some(o => o.value === previous)) select.value = previous
  $('backupList').textContent = state.backups.length ? `${state.backups.length} backup tersedia` : 'Belum ada backup.'
}

function renderTopbar() {
  const s = state.status
  const connected = s?.connected
  const now = new Date()
  const clock = new Intl.DateTimeFormat('id-ID', {
    timeZone:'Asia/Jakarta', hour:'2-digit', minute:'2-digit', second:'2-digit',
    day:'2-digit', month:'short', year:'numeric', weekday:'short', hour12:false,
  }).format(now)
  $('clock').textContent = `${clock} WIB`
  const w = state.weather
  $('weatherWidget').textContent = w?.available
    ? `${w.location} · ${w.temperature}°C · ${w.condition}`
    : 'Weather unavailable'
  $('appVersion').textContent = state.app?.version ? `v${state.app.version}` : ''
  $('sideConn').textContent = connected ? '● TERHUBUNG' : '○ TERPUTUS'
  $('sideConn').className = 'pill ' + (connected ? 'ok' : 'bad')
}

function renderDashboard() {
  const s = state.status
  if (!s) return
  $('statConn').textContent = s.connected ? 'Online' : 'Offline'
  $('statConnNote').textContent = `Zona ${s.timezone} · reconnect ${s.reconnectAttempts || 0}`
  $('statAnn').textContent = s.stats.announcements
  $('statAnnNote').textContent = `${s.stats.active} aktif · ${state.announcements.length} total`
  $('statGroups').textContent = s.stats.groups
  $('statSync').textContent = s.groupSyncError ? 'Error: ' + s.groupSyncError : 'Sinkronisasi grup OK'
  $('statDeliv').textContent = s.stats.deliveries
  $('statTick').textContent = s.scheduler.lastTick ? `Tick ${s.scheduler.lastTick.at} · diproses ${s.scheduler.lastTick.processed}` : 'Belum ada tick'
  api('/api/qr').then(d => { $('qrBox').innerHTML = `<img src="${d.qr}" alt="QR">` })
    .catch(() => { $('qrBox').innerHTML = '<span class="muted">Tidak ada QR aktif (bot terhubung / menunggu QR).</span>' })
  const up = state.schedules.length ? state.schedules.slice(0,6).map(x =>
    `<div><code>${esc(x.announcement_id)}</code> ${esc(x.title||'')}<br><span class="muted">${DAYS[x.weekday]} · ${WEEKS[x.week_of_month]} · ${x.time} · ${x.is_active?'aktif':'nonaktif'}</span></div>`).join('<div class="divider"></div>') : '<span class="muted">Belum ada jadwal.</span>'
  $('dashUpcoming').innerHTML = up
  $('dashAnn').innerHTML = state.announcements.length ? `<table><thead><tr><th>ID</th><th>Judul</th><th>Jadwal</th><th>Status</th></tr></thead><tbody>${state.announcements.slice(0,8).map(a => annRow(a, false)).join('')}</tbody></table>` : '<span class="muted">Belum ada pengumuman.</span>'
}

function annRow(a, actions = true) {
  const sch = `${DAYS[a.weekday]} · ${WEEKS[a.week_of_month]} · ${a.time}`
  return `<tr><td><code>${esc(a.id)}</code></td><td><strong>${esc(a.title)}</strong>${a.category?`<br><span class="muted tiny">${esc(a.category)}</span>`:''}</td>
    <td>${sch}</td><td><span class="pill ${a.is_active?'ok':'bad'}">${a.is_active?'AKTIF':'NONAKTIF'}</span></td>
    ${actions ? `<td><div class="row-actions"><button class="btn small" data-action="edit" data-id="${esc(a.id)}">Edit</button>
    <button class="btn small" data-action="send" data-id="${esc(a.id)}">Kirim</button>
    <button class="btn small" data-action="toggle" data-id="${esc(a.id)}" data-active="${a.is_active}">${a.is_active?'Nonaktifkan':'Aktifkan'}</button></div></td>` : ''}</tr>`
}

function renderAnnouncements() {
  const q = ($('annSearch').value || '').toLowerCase().trim()
  const rows = state.announcements.filter(a => !q || `${a.title} ${a.body} ${a.category||''}`.toLowerCase().includes(q))
  $('annTable').innerHTML = rows.length ? rows.map(a => annRow(a)).join('') : '<tr><td colspan="6" class="muted">Tidak ada pengumuman.</td></tr>'
}

function renderSchedules() {
  $('scheduleTable').innerHTML = state.schedules.length ? `<table><thead><tr><th>ID</th><th>Judul</th><th>Hari</th><th>Minggu</th><th>Jam</th><th>Status</th></tr></thead><tbody>
    ${state.schedules.map(s => `<tr><td><code>${esc(s.announcement_id)}</code></td><td>${esc(s.title||'')}</td><td>${DAYS[s.weekday]}</td><td>${WEEKS[s.week_of_month]}</td><td>${s.time}</td><td><span class="pill ${s.is_active?'ok':'bad'}">${s.is_active?'AKTIF':'NONAKTIF'}</span></td></tr>`).join('')}
    </tbody></table>` : '<span class="muted">Belum ada jadwal.</span>'
  $('schedUpcoming').innerHTML = state.schedules.length ? state.schedules.slice(0,10).map(s =>
    `<div>${esc(s.announcement_id)} — ${esc(s.title||'')} · ${DAYS[s.weekday]} ${WEEKS[s.week_of_month]} ${s.time}</div>`).join('') : '<span class="muted">Belum ada jadwal.</span>'
}

function renderGroups() {
  $('groupTable').innerHTML = state.groups.length ? `<table><thead><tr><th>Grup</th><th>JID</th><th>Peserta</th><th>Terdaftar</th><th>Aksi</th></tr></thead><tbody>
    ${state.groups.map(g => `<tr><td>${esc(g.name||'-')}</td><td><code>${esc(g.jid)}</code></td><td>${g.participants||0}</td>
    <td><span class="pill ${g.is_registered?'ok':'bad'}">${g.is_registered?'YA':'TIDAK'}</span></td>
    <td><button class="btn small" data-action="group" data-jid="${esc(g.jid)}" data-reg="${g.is_registered}">${g.is_registered?'Cabut':'Daftarkan'}</button></td></tr>`).join('')}
    </tbody></table>` : '<span class="muted">Belum ada grup. Bot perlu terhubung dan masuk ke grup.</span>'
}

function renderHistory() {
  $('historyTable').innerHTML = state.deliveries.length ? `<table><thead><tr><th>Waktu</th><th>ID</th><th>Grup</th><th>Status</th><th>Catatan</th></tr></thead><tbody>
    ${state.deliveries.slice(0,40).map(d => `<tr><td>${esc(d.sent_at)}</td><td><code>${esc(d.announcement_id)}</code></td><td>${esc(d.group_jid)}</td>
    <td><span class="pill ${d.status==='sent'?'ok':'bad'}">${esc(d.status)}</span></td><td>${esc(d.reason||'')}</td></tr>`).join('')}</tbody></table>` : '<span class="muted">Belum ada pengiriman.</span>'
  $('activityTable').innerHTML = state.activity.length ? `<table><thead><tr><th>Waktu</th><th>Aktor</th><th>Aksi</th><th>Detail</th></tr></thead><tbody>
    ${state.activity.slice(0,40).map(a => `<tr><td>${esc(a.created_at)}</td><td>${esc(a.admin_jid||'-')}</td><td>${esc(a.action)}</td><td>${esc(a.detail||'')}</td></tr>`).join('')}</tbody></table>` : '<span class="muted">Belum ada aktivitas.</span>'
}

function renderSettings() {
  const s = state.settings
  if (!s) return
  const admins = s.admins || []
  $('adminList').innerHTML = admins.length ? admins.map(a =>
    `<div class="row-actions" style="justify-content:space-between;padding:5px 0"><span>${esc(a.name||a.number)} <span class="muted tiny">${esc(a.number)}</span></span>
    <span>${a.is_active?'<span class="pill ok">aktif</span>':`<button class="btn small" data-action="admin-activate" data-number="${esc(a.number)}">Aktifkan</button>`}</span></div>`).join('') : '<span class="muted">Belum ada admin.</span>'
  const enabled = (s.settings||[]).find(x => x.key === 'scheduler_enabled')?.value === '1'
  $('schedulerToggle').checked = enabled
  $('settingsInfo').innerHTML = `Zona waktu: ${esc(s.timezone)}<br>Format didukung: ${(s.allowedUploads||[]).join(', ')}<br>Maks upload: ${s.maxUploadMb} MB<br>Akses web: umum (tanpa kata sandi)`
}

function switchView(view) {
  state.view = view
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === view))
  document.querySelectorAll('.view').forEach(v => { v.hidden = v.id !== `view-${view}` })
  const titles = { dashboard:['Ringkasan','Pantau koneksi dan pengiriman bot'], announcements:['Pengumuman','Buat, edit, dan kelola semua pengumuman'], import:['Import Dokumen','Ubah PDF/DOCX menjadi draf pesan teks'], schedules:['Jadwal','Atur hari, minggu, dan jam pengiriman'], groups:['Grup','Kelola grup tujuan pengumuman'], ai:['AI Assistant','Model gratis OpenRouter dan batas pemakaian'], history:['Riwayat','Log pengiriman dan aktivitas'], settings:['Pengaturan','Nomor bot, admin, scheduler, dan cadangan'], system:['System Management','Deploy, backup, proses, dan monitoring server'] }
  $('pageTitle').textContent = titles[view][0]
  $('pageSubtitle').textContent = titles[view][1]
}

function fillSelects() {
  $('fWeekday').innerHTML = DAYS.map((d,i) => `<option value="${i}">${d}</option>`).join('')
  $('fWeek').innerHTML = WEEKS.map((w,i) => `<option value="${i}">${w}</option>`).join('')
}

function renderTargetCheckboxes(selected = []) {
  const registered = state.groups.filter(g => g.is_registered)
  $('fTargets').innerHTML = registered.length ? registered.map(g =>
    `<label><input type="checkbox" value="${esc(g.jid)}" ${selected.includes(g.jid)?'checked':''}> ${esc(g.name||g.jid)} <span class="muted tiny">${esc(g.jid)}</span></label>`).join('')
    : '<span class="muted">Belum ada grup terdaftar. Daftarkan grup di menu Grup.</span>'
}

async function openEditor(id = null, preset = {}) {
  $('editorError').textContent = ''
  $('modalTitle').textContent = id ? `Edit ${id}` : 'Pengumuman baru'
  $('fId').value = id || ''
  $('fTitle').value = preset.title || ''
  $('fCategory').value = preset.category || ''
  $('fBody').value = preset.body || ''
  $('fWeekday').value = preset.weekday ?? 0
  $('fWeek').value = preset.week ?? 0
  $('fTime').value = preset.time || '08:00'
  $('fActive').checked = preset.is_active !== false
  $('btnDelete').hidden = !id
  $('btnSend').hidden = !id
  let targets = preset.targets || []
  if (id) {
    try {
      const d = await api(`/api/announcements/${encodeURIComponent(id)}`)
      $('fTitle').value = d.announcement.title
      $('fCategory').value = d.announcement.category || ''
      $('fBody').value = d.announcement.body
      $('fWeekday').value = d.schedule?.weekday ?? 0
      $('fWeek').value = d.schedule?.week_of_month ?? 0
      $('fTime').value = d.schedule?.time || '08:00'
      $('fActive').checked = Boolean(d.announcement.is_active)
      targets = d.targets.map(t => t.jid)
    } catch (e) { toast(e.message, true); return }
  }
  renderTargetCheckboxes(targets)
  $('modal').hidden = false
  $('fTitle').focus()
}

function closeEditor() { $('modal').hidden = true }

function editorPayload() {
  return {
    title: $('fTitle').value.trim(),
    category: $('fCategory').value.trim(),
    body: $('fBody').value.trim(),
    weekday: Number($('fWeekday').value),
    week: Number($('fWeek').value),
    time: $('fTime').value.trim(),
    targets: [...document.querySelectorAll('#fTargets input:checked')].map(x => x.value),
    is_active: $('fActive').checked,
  }
}

async function saveEditor() {
  const id = $('fId').value
  const payload = editorPayload()
  try {
    if (id) await api(`/api/announcements/${encodeURIComponent(id)}`, { method:'PUT', body:JSON.stringify(payload) })
    else await api('/api/announcements', { method:'POST', body:JSON.stringify(payload) })
    closeEditor()
    toast(id ? `${id} diperbarui` : 'Pengumuman dibuat')
    await loadAll()
  } catch (e) {
    $('editorError').textContent = e.message
    toast(e.message, true)
  }
}

async function doSend(id) {
  try {
    const r = await api(`/api/send/${encodeURIComponent(id)}`, { method:'POST' })
    toast(`${id}: ${r.sent||0}/${r.total||0} grup berhasil`)
    await loadAll()
  } catch (e) { toast(e.message, true) }
}

async function doImport(file) {
  $('importMeta').textContent = 'Mengekstrak teks…'
  const form = new FormData()
  form.append('file', file)
  try {
    const res = await fetch('/api/import', { method:'POST', body:form })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Gagal mengimpor')
    $('importText').value = data.text
    $('importCount').textContent = `${data.meta.chars} karakter · ${data.meta.filename}`
    $('btnImportToEditor').disabled = false
    $('importMeta').textContent = `Berasal dari ${data.meta.filename} (${data.meta.extension}). Periksa dan edit teks sebelum menyimpan.`
    toast('Teks berhasil diekstrak')
  } catch (e) {
    $('importMeta').textContent = ''
    toast(e.message, true)
  }
}

// --- Event bindings ---
$('nav').addEventListener('click', e => {
  const b = e.target.closest('.nav-item')
  if (b) switchView(b.dataset.view)
})

$('annTable').addEventListener('click', e => {
  const b = e.target.closest('button[data-action]')
  if (!b) return
  const id = b.dataset.id
  if (b.dataset.action === 'edit') openEditor(id)
  if (b.dataset.action === 'send') doSend(id)
  if (b.dataset.action === 'toggle') api(`/api/announcements/${encodeURIComponent(id)}/active`, {
    method:'POST', body:JSON.stringify({ active:b.dataset.active !== '1' })
  }).then(async () => { await loadAll(); toast('Status pengumuman diperbarui') })
    .catch(err => toast(err.message, true))
})
$('dashAnn').addEventListener('click', e => {
  const b = e.target.closest('button[data-action]')
  if (!b) return
  if (b.dataset.action === 'edit') openEditor(b.dataset.id)
  if (b.dataset.action === 'send') doSend(b.dataset.id)
})

$('btnNew').addEventListener('click', () => openEditor())
$('annSearch').addEventListener('input', renderAnnouncements)
$('modalClose').addEventListener('click', closeEditor)
$('modalCancel').addEventListener('click', closeEditor)
$('editorForm').addEventListener('submit', e => { e.preventDefault(); saveEditor() })
$('btnSend').addEventListener('click', () => { const id = $('fId').value; if (id) doSend(id) })
$('btnDelete').addEventListener('click', async () => {
  const id = $('fId').value
  if (!id || !confirm(`Hapus pengumuman ${id}? Jadwal dan target ikut terhapus.`)) return
  try { await api(`/api/announcements/${encodeURIComponent(id)}`, { method:'DELETE' }); closeEditor(); toast(`${id} dihapus`); await loadAll() }
  catch (e) { toast(e.message, true) }
})

$('fileInput').addEventListener('change', e => { if (e.target.files[0]) doImport(e.target.files[0]) })
const dz = $('dropzone')
dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag') })
dz.addEventListener('dragleave', () => dz.classList.remove('drag'))
dz.addEventListener('drop', e => {
  e.preventDefault(); dz.classList.remove('drag')
  if (e.dataTransfer.files[0]) doImport(e.dataTransfer.files[0])
})
$('importText').addEventListener('input', () => { $('importCount').textContent = `${$('importText').value.length} karakter` })
$('btnImportToEditor').addEventListener('click', () => {
  const text = $('importText').value.trim()
  if (!text) return toast('Teks masih kosong', true)
  const name = ($('importMeta').textContent.match(/dari\s+(.+?)\s*\(/) || [])[1] || 'Dokumen'
  openEditor(null, { title:name.replace(/\.(pdf|docx|txt|md)$/i,''), body:text })
})

$('groupTable').addEventListener('click', async e => {
  const b = e.target.closest('button[data-action="group"]')
  if (!b) return
  try {
    await api(`/api/groups/${encodeURIComponent(b.dataset.jid)}`, { method:'PUT', body:JSON.stringify({ registered:b.dataset.reg !== '1' }) })
    await loadAll(); toast('Status grup diperbarui')
  } catch (err) { toast(err.message, true) }
})

$('adminForm').addEventListener('submit', async e => {
  e.preventDefault()
  try {
    await api('/api/admins', { method:'POST', body:JSON.stringify({ number:$('adminNumber').value, name:$('adminName').value }) })
    $('adminNumber').value = ''; $('adminName').value = ''
    await loadAll(); toast('Admin ditambahkan')
  } catch (err) { toast(err.message, true) }
})
$('adminList').addEventListener('click', async e => {
  const b = e.target.closest('button[data-action="admin-activate"]')
  if (!b) return
  try { await api('/api/admins/' + encodeURIComponent(b.dataset.number), { method:'DELETE' }); await loadAll() }
  catch (err) { toast(err.message, true) }
})
$('schedulerToggle').addEventListener('change', async e => {
  try { await api('/api/settings/scheduler', { method:'POST', body:JSON.stringify({ enabled:e.target.checked }) }); toast('Scheduler diperbarui') }
  catch (err) { toast(err.message, true) }
})
$('btnBackup').addEventListener('click', async () => {
  try { const r = await api('/api/backup', { method:'POST' }); toast('Backup: ' + r.path) }
  catch (err) { toast(err.message, true) }
})

function renderAI() {
  const s = state.aiStatus
  if (!s) return
  $('aiConfig').textContent = s.configured ? 'AKTIF' : 'BELUM AKTIF'
  $('aiConfigNote').textContent = s.configured
    ? `Provider: ${s.provider || '-'} · kunci: ${s.keyVariable || '-'} · model gratis: ${state.aiModels.length}`
    : 'Isi OPENROUTER_API_KEY atau GEMINI_API_KEY di .env lalu restart bot.'
  const m = s.activeModel
  $('aiActive').textContent = m?.name || '-'
  $('aiActiveId').textContent = m?.id || 'Belum ada model aktif'
  $('aiTotal').textContent = s.usage?.total || 0
  $('aiUsageNote').textContent = `${s.usage?.success || 0} sukses · ${s.usage?.failed || 0} gagal · ${s.usage?.blocked || 0} dibatasi`
  const l = s.limits || {}
  $('aiLimits').innerHTML = [
    `Cooldown: ${l.cooldownSeconds ?? '-'} detik`,
    `Maks per pengguna: ${l.maxPerUser ?? '-'} / ${l.windowMinutes ?? '-'} menit`,
    `Panjang pertanyaan: ${l.maxQuestionChars ?? '-'} karakter`,
    `Konteks percakapan: ${l.contextMessages ?? 0} pesan`,
  ].join('<br>')
  const sel = $('aiModelSelect')
  const previous = sel.value
  sel.innerHTML = state.aiModels.length
    ? state.aiModels.map(x => `<option value="${esc(x.id)}">${esc(x.name)} — ${esc(x.id)}</option>`).join('')
    : '<option value="">Tidak ada model gratis</option>'
  const options = [...sel.options].map(o => o.value)
  if (options.includes(previous)) sel.value = previous
  else if (m?.id && options.includes(m.id)) sel.value = m.id
  const u = state.aiUsage
  const visionActive = s.activeModelIds?.vision || '-'
  $('aiVisionActive').textContent = `Model vision aktif: ${visionActive}`
  const vsel = $('aiVisionSelect')
  const previousVision = vsel.value
  vsel.innerHTML = state.aiVisionModels.length
    ? state.aiVisionModels.map(m => `<option value="${esc(m.id)}">${esc(m.name)} — ${esc(m.provider)} — ${esc(m.id)}</option>`).join('')
    : '<option value="">Tidak ada model vision gratis</option>'
  if ([...vsel.options].some(o => o.value === previousVision)) vsel.value = previousVision
  else if (visionActive !== '-' && [...vsel.options].some(o => o.value === visionActive)) vsel.value = visionActive

  const logs = u?.logs || []
  $('aiUsage').innerHTML = logs.length ? `<table><thead><tr><th>Waktu</th><th>Pengguna</th><th>Model</th><th>Status</th><th>Catatan</th></tr></thead><tbody>
    ${logs.slice(0, 30).map(x => `<tr><td>${esc(x.created_at)}</td><td>${esc(x.user_jid || '-')}</td><td>${esc(x.model_id || '-')}</td>
    <td><span class="pill ${x.status === 'success' ? 'ok' : 'bad'}">${esc(x.status)}</span></td><td>${esc(x.reason || '')}</td></tr>`).join('')}
    </tbody></table>` : '<span class="muted">Belum ada penggunaan AI.</span>'
}

function renderBotAccount() {
  const w = state.whatsapp || {}
  $('botNumber').textContent = w.botNumber || '-'
  $('botStatus').textContent = w.connected ? 'TERHUBUNG' : 'TERPUTUS'
  $('botStatus').className = 'note ' + (w.connected ? '' : 'muted')
  const st = w.relinkState || {}
  const labels = { idle: 'Siap', processing: 'Menyiapkan sesi baru…', waiting_qr: 'Menunggu QR dipindai…', connected: 'Nomor baru berhasil terhubung.', disconnected: 'Koneksi diputuskan.', failed: 'Gagal: ' + (st.error || 'tidak diketahui') }
  $('botRelinkStatus').textContent = `${labels[st.status] || st.status || ''}${st.message ? ' — ' + st.message : ''}`
  const box = $('botQr')
  if (st.status === 'waiting_qr') {
    api('/api/qr').then(d => { box.innerHTML = `<img src="${d.qr}" alt="QR bot baru">`; box.hidden = false })
      .catch(() => { box.innerHTML = '<span class="muted">QR belum tersedia.</span>'; box.hidden = false })
  } else box.hidden = true
}

$('aiVisionRefresh').addEventListener('click', async () => {
  try {
    const d = await api('/api/ai/vision/models')
    state.aiVisionModels = d.models || []
    renderAI()
    toast(`Model vision diperbarui (${state.aiVisionModels.length})`)
  } catch (e) { toast(e.message, true) }
})
$('aiVisionChange').addEventListener('click', async () => {
  const model = $('aiVisionSelect').value
  if (!model) return toast('Tidak ada model vision yang bisa dipilih.', true)
  try {
    await api('/api/ai/vision/model', { method:'POST', body: JSON.stringify({ model }) })
    await loadAll()
    toast('Model vision berhasil diganti')
  } catch (e) { toast(e.message, true) }
})
$('aiRefreshModels').addEventListener('click', async () => {
  try {
    const d = await api('/api/ai/models', { method: 'POST' })
    state.aiModels = d.models || []
    renderAI()
    toast(`Daftar model diperbarui (${state.aiModels.length})`)
  } catch (e) { toast(e.message, true) }
})
$('aiChangeModel').addEventListener('click', async () => {
  const model = $('aiModelSelect').value
  if (!model) return toast('Tidak ada model yang bisa dipilih.', true)
  try {
    await api('/api/ai/model', { method: 'POST', body: JSON.stringify({ model }) })
    await loadAll()
    toast('Model AI berhasil diganti')
  } catch (e) { toast(e.message, true) }
})
$('aiManualModelBtn').addEventListener('click', async () => {
  const model = $('aiManualModel').value.trim()
  if (!model) return toast('Ketik ID model dulu.', true)
  try {
    await api('/api/ai/model', { method: 'POST', body: JSON.stringify({ model }) })
    $('aiNotice').textContent = `Model ${model} berhasil dipakai.`
    await loadAll()
    toast('Model manual berhasil dipakai')
  } catch (e) {
    $('aiNotice').textContent = e.message
    toast(e.message, true)
  }
})
function renderVips() {
  const list = $('vipList')
  if (!list) return
  list.innerHTML = state.vips.length
    ? state.vips.map((v) => `<div class="row-actions" style="justify-content:space-between;padding:4px 0"><span>${esc(v.name || v.number)} <span class="muted tiny">${esc(v.number)}</span></span><span class="pill">VIP</span></div>`).join('')
    : '<span class="muted">Belum ada user VIP.</span>'
}

$('vipForm').addEventListener('submit', async (e) => {
  e.preventDefault()
  try {
    await api('/api/vip', { method:'POST', body: JSON.stringify({
      password: $('vipPassword').value,
      number: $('vipNumber').value,
      name: $('vipName').value,
    }) })
    $('vipPassword').value = ''
    $('vipNumber').value = ''
    $('vipName').value = ''
    await loadAll()
    toast('VIP berhasil didaftarkan')
  } catch (err) { toast(err.message, true) }
})

$('btnRelink').addEventListener('click', async () => {
  if (!confirm('Ganti nomor bot? Sesi lama akan diputuskan dan diarsipkan. Anda perlu memindai QR dengan nomor baru.')) return
  try {
    await api('/api/whatsapp/relink', { method: 'POST' })
    await loadAll()
    toast('Sesi lama diarsipkan. Pindai QR baru.')
  } catch (e) { toast(e.message, true) }
})
$('btnDisconnect').addEventListener('click', async () => {
  if (!confirm('Putuskan koneksi bot sekarang?')) return
  try {
    await api('/api/whatsapp/disconnect', { method: 'POST' })
    await loadAll()
    toast('Koneksi WhatsApp diputuskan')
  } catch (e) { toast(e.message, true) }
})

// --- System management bindings ---
$('btnLogin').addEventListener('click', () => { $('loginModal').hidden = false })
$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault()
  try {
    const res = await api('/api/login', { method:'POST', body: JSON.stringify({ password: $('loginPassword').value }) })
    $('loginPassword').value = ''
    $('loginModal').hidden = true
    toast(`Login berhasil. CSRF: ${res.csrf ? 'aktif' : '-'}`)
    await loadAll()
  } catch (err) { toast(err.message, true) }
})

async function systemAction(path, body = {}, successMsg = 'Berhasil') {
  try {
    const data = await api(path, { method:'POST', body: JSON.stringify(body) })
    $('sysNotice').textContent = JSON.stringify(data).slice(0, 500)
    toast(data.error || successMsg, Boolean(data.error))
    await loadAll()
    return data
  } catch (err) { toast(err.message, true); return null }
}

$('btnCheckUpdate').addEventListener('click', () => systemAction('/api/system/check-update', {}, 'Pemeriksaan selesai'))
$('btnDeploy').addEventListener('click', async () => {
  if (!confirm('Deploy update dari GitHub? Bot akan restart dan health check dijalankan.')) return
  await systemAction('/api/system/deploy', {}, 'Deploy dimulai')
})
$('btnRestartBot').addEventListener('click', async () => {
  if (!confirm('Restart bot sekarang?')) return
  await systemAction('/api/system/restart-bot', {}, 'Restart dijadwalkan')
})
$('btnRestartTunnel').addEventListener('click', () => systemAction('/api/system/restart-tunnel', {}, 'Tunnel direstart'))
$('btnRollback').addEventListener('click', async () => {
  const commit = $('rollbackCommit').value.trim()
  if (!confirm(`Rollback source code${commit ? ` ke ${commit}` : ' ke commit sebelumnya'}? Database tidak diubah.`)) return
  await systemAction('/api/system/rollback', { commit }, 'Rollback selesai')
})
$('btnBackupNow').addEventListener('click', async () => {
  try {
    const data = await api('/api/system/backup')
    toast(`Backup dibuat: ${data.dbPath || 'database'}`)
    await loadAll()
  } catch (err) { toast(err.message, true) }
})
$('btnRestore').addEventListener('click', async () => {
  const name = $('backupSelect').value
  if (!name) return toast('Pilih backup dulu.', true)
  if (!confirm(`Restore database dari ${name}? Bot akan restart. Session WhatsApp tidak diubah.`)) return
  await systemAction('/api/system/restore', { name, confirm:true }, 'Restore dijadwalkan')
})
$('btnLoadLog').addEventListener('click', async () => {
  try {
    const data = await api(`/api/system/logs?name=${encodeURIComponent($('logSelect').value)}&lines=200`)
    $('logView').textContent = (data.lines || []).join('\n') || '(kosong)'
  } catch (err) { toast(err.message, true) }
})

fillSelects()
loadAll().catch(e => toast(e.message, true))
setInterval(() => { if (!document.hidden) loadAll().catch(() => {}) }, 12000)
setInterval(() => { if (!document.hidden) renderTopbar() }, 1000)
