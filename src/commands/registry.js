// Satu sumber kebenaran daftar command. Dipakai /menu, /help, dan tes.
export const RESTRICTED_COMMANDS = ['/grup', '/grupaktif']

const c = (cmd, usage, desc, extra = {}) => ({ cmd, usage, desc, ...extra })

export const COMMAND_GROUPS = [
  {
    title: '👤 *MENU UTAMA*',
    commands: [
      c('/menu', '/menu', 'Menampilkan semua perintah.'),
      c('/help', '/help', 'Bantuan penggunaan bot.'),
    ],
  },
  {
    title: '📢 *PENGUMUMAN*',
    commands: [
      c('/set', '/set', 'Membuat pengumuman.'),
      c('/set', '/set <teks>', 'Menyimpan teks langsung (mode cepat).'),
      c('/list', '/list', 'Melihat daftar pengumuman.'),
      c('/detail', '/detail A1', 'Melihat detail pengumuman.'),
      c('/edit', '/edit A1', 'Mengedit pengumuman.'),
      c('/update', '/update', 'Menyimpan perubahan.'),
      c('/batal', '/batal', 'Membatalkan proses.', { flow: true }),
      c('/send', '/send A1', 'Mengirim pengumuman (alias: /kirim A1).'),
      c('/preview', '/preview A1', 'Melihat preview.'),
      c('/hapus', '/hapus A1', 'Menghapus pengumuman.'),
      c('/search', '/search KATA', 'Mencari pengumuman.'),
    ],
  },
  {
    title: '📅 *PENJADWALAN*',
    commands: [
      c('/jadwal', '/jadwal', 'Melihat jadwal.'),
      c('/aturjadwal', '/aturjadwal A1', 'Mengatur jadwal.'),
      c('/aktifkan', '/aktifkan A1', 'Mengaktifkan pengumuman.'),
      c('/nonaktifkan', '/nonaktifkan A1', 'Menonaktifkan pengumuman.'),
    ],
  },
  {
    title: '👥 *MANAJEMEN GRUP*',
    commands: [
      c('/grup', '/grup', 'Melihat daftar grup.', { admin: true }),
      c('/grupaktif', '/grupaktif', 'Melihat grup terdaftar.', { admin: true }),
      c('/daftargrup', '/daftargrup N', 'Mendaftarkan grup nomor N.'),
      c('/nondaftargrup', '/nondaftargrup N', 'Mencabut pendaftaran grup N.'),
    ],
  },
  {
    title: '👑 *MANAJEMEN VIP*',
    commands: [
      c('/vip', '/vip', 'Informasi & aktivasi VIP lewat private chat.'),
      c('/no', '/no vip @user', 'Mencabut status VIP pengguna.', { admin: true }),
    ],
  },
  {
    title: '🤖 *AI ASSISTANT*',
    commands: [
      c('/ask', '/ask pertanyaan', 'Bertanya kepada AI.'),
      c('/models', '/models', 'Melihat model gratis (alias: /free).'),
      c('/free', '/free', 'Alias /models.'),
      c('/model', '/model', 'Melihat model aktif.'),
      c('/model', '/model NOMOR', 'Mengganti model AI.', { admin: true }),
    ],
  },
  {
    title: '📄 *DOKUMEN DAN GAMBAR*',
    commands: [
      c('.pdf', '.pdf', 'Membaca dan merangkum dokumen PDF.'),
      c('.img', '.img', 'Menganalisis gambar.'),
      c('.iqc', '.iqc <teks>', 'Mockup chat gaya iPhone.'),
      c('.tqc', '.tqc <nama>|<teks>', 'Mockup chat gaya TikTok.'),
      c('.wq', '.wq <teks>', 'Meme gaya Windows klasik.'),
    ],
  },
]

export const ALL_COMMANDS = [...new Set(COMMAND_GROUPS.flatMap(g => g.commands.map(x => x.cmd)))]

function visibleCommands(admin) {
  return COMMAND_GROUPS.map(group => ({
    title: group.title,
    commands: group.commands.filter(x => admin || !x.admin),
  })).filter(group => group.commands.length)
}

export function buildMenuText({ admin = false } = {}) {
  const lines = ['🤖 *MENU BOT WHATSAPP*', '']
  for (const group of visibleCommands(admin)) {
    lines.push(group.title)
    for (const item of group.commands) {
      const tag = item.admin ? ' (Admin)' : ''
      lines.push(`- \`${item.usage}\` — ${item.desc}${tag}`)
    }
    lines.push('')
  }
  if (!admin) lines.push('Catatan: perintah bertanda (Admin) khusus admin.')
  lines.push('Ketik perintah di grup. /vip di chat pribadi untuk aktivasi VIP.')
  return lines.join('\n').trimEnd()
}

// Kompatibilitas dengan pemanggil lama: menu sekarang SATU pesan.
export function buildMenuParts({ admin = false } = {}) { return [buildMenuText({ admin })] }
export const MENU_CHUNK_SIZE = 999
