import { config } from '../config.js'

export const COMMAND_ALIASES = Object.freeze({
  '.kirim': '.send',
  '.free': '.models',
  '.s': '.sticker',
  '.stiker': '.sticker',
  '.ayatpilihan': '.ayat',
  '.alquran': '.ayat',
  '.quran': '.ayat',
  '.murrotal': '.murottal',
  '.murotal': '.murottal',
  '.audiosurah': '.murottal',
  '.dzikir': '.zikir',
  '.shalawat': '.sholawat',
  '.asmaulhusna': '.asmaul',
  '.qc5': '.iqc5',
  '.iqc-red': '.iqcmerah',
  '.rediqc': '.iqcmerah',
  '.iqcwindow': '.iqcwin',
  '.ttchat': '.tiktokchat',
})

export const RESTRICTED_COMMANDS = [
  '.grup', '.grupaktif', '.daftargrup', '.nondaftargrup', '.no',
  '.template', '.setngaji', '.editngaji', '.previewngaji',
  '.sendngaji', '.jadwalngaji', '.aturngaji', '.aktifngaji', '.nonaktifngaji',
]

const c = (cmd, usage, desc, extra = {}) => ({
  cmd, usage, desc, aliases: [], active: true, scope: 'group', ...extra,
})

export const COMMAND_GROUPS = [
  {
    title: '👤 *MENU UTAMA*',
    commands: [
      c('.menu', '.menu', 'Menampilkan menu perintah.', { scope: 'all' }),
      c('.help', '.help', 'Bantuan penggunaan bot.', { scope: 'all' }),
      c('.user', '.user', 'Informasi pengguna dan role.', { scope: 'all' }),
      c('.vip', '.vip', 'Informasi atau aktivasi VIP; rincian ada di kategori VIP.', { scope: 'all' }),
      c('.ping', '.ping', 'Status bot dan waktu respons.', { scope: 'all' }),
      c('.status', '.status', 'Status koneksi WhatsApp.', { scope: 'all' }),
      c('.info', '.info', 'Informasi bot dan versi.', { scope: 'all' }),
    ],
  },
  {
    title: '📢 *PENGUMUMAN*',
    commands: [
      c('.set', '.set', 'Membuat pengumuman melalui panduan.'),
      c('.set', '.set <teks>', 'Menyimpan teks pengumuman secara langsung.'),
      c('.list', '.list', 'Daftar pengumuman.'),
      c('.detail', '.detail A1', 'Detail pengumuman.'),
      c('.edit', '.edit A1', 'Mengedit pengumuman sebagai draf.'),
      c('.update', '.update', 'Meninjau dan menyimpan perubahan draf.'),
      c('.batal', '.batal', 'Membatalkan proses yang berjalan.', { flow: true }),
      c('.send', '.send A1', 'Mengirim pengumuman (alias: .kirim A1).', { aliases: ['.kirim'] }),
      c('.preview', '.preview A1', 'Melihat pratinjau pengumuman.'),
      c('.hapus', '.hapus A1', 'Menghapus pengumuman setelah konfirmasi.'),
      c('.search', '.search KATA', 'Mencari pengumuman.'),
    ],
  },
  {
    title: '📅 *PENJADWALAN*',
    commands: [
      c('.jadwal', '.jadwal', 'Melihat jadwal pengumuman.'),
      c('.aturjadwal', '.aturjadwal A1', 'Mengatur jadwal pengumuman.'),
      c('.aktifkan', '.aktifkan A1', 'Mengaktifkan pengumuman terjadwal.'),
      c('.nonaktifkan', '.nonaktifkan A1', 'Menonaktifkan pengumuman terjadwal.'),
    ],
  },
  {
    title: '👥 *MANAJEMEN GRUP*',
    commands: [
      c('.grup', '.grup', 'Daftar grup yang dapat diakses bot.', { admin: true }),
      c('.grupaktif', '.grupaktif', 'Daftar grup terdaftar.', { admin: true }),
      c('.daftargrup', '.daftargrup N', 'Mendaftarkan grup nomor N.', { admin: true }),
      c('.nondaftargrup', '.nondaftargrup N', 'Mencabut pendaftaran grup N.', { admin: true }),
    ],
  },
  {
    title: '👑 *VIP*',
    commands: [
      c('.vip', '.vip', 'Informasi layanan VIP; ditampilkan juga di menu utama.', { scope: 'all' }),
      c('.no', '.no vip @pengguna', 'Mencabut status VIP pengguna.', { admin: true }),
    ],
  },
  {
    title: '⬇️ *DOWNLOADER*',
    commands: [
      c('.tiktok', '.tiktok <tautan>', 'Mengunduh media TikTok publik.', { vip: true }),
      c('.instagram', '.instagram <tautan>', 'Mengunduh media Instagram publik.', { vip: true }),
    ],
  },
  {
    title: '🤖 *AI ASSISTANT*',
    commands: [
      c('.ask', '.ask <pertanyaan>', 'Bertanya kepada AI.', { requiresAi: true }),
      c('.models', '.models', 'Daftar model gratis (alias: .free).', { aliases: ['.free'], requiresAi: true }),
      c('.free', '.free', 'Alias .models untuk melihat model gratis.', { requiresAi: true }),
      c('.model', '.model [nomor]', 'Melihat model aktif atau memilih model (admin).', { requiresAi: true }),
    ],
  },
  {
    title: '🕌 *ISLAM*',
    commands: [
      c('.ayat', '.ayat', 'Pencarian ayat Al-Quran.', { aliases: ['.ayatpilihan', '.alquran', '.quran'] }),
      c('.surah', '.surah', 'Informasi surah Al-Quran.'),
      c('.murottal', '.murottal', 'Audio murottal surah.', { aliases: ['.murrotal', '.murotal', '.audiosurah'] }),
      c('.asmaul', '.asmaul', 'Asmaul Husna.', { aliases: ['.asmaulhusna'] }),
      c('.zikir', '.zikir', 'Bacaan zikir.', { aliases: ['.dzikir'] }),
      c('.istighfar', '.istighfar', 'Bacaan istighfar.'),
      c('.tahlil', '.tahlil', 'Panduan tahlil.'),
      c('.sholawat', '.sholawat', 'Bacaan sholawat.', { aliases: ['.shalawat'] }),
      c('.quotesislam', '.quotesislam', 'Kutipan Islami.'),
      c('.doa', '.doa', 'Doa harian.'),
    ],
  },
  {
    title: '📱 *INSTAGRAM iOS MOCKUP*',
    commands: [
      c('.igqc', '.igqc', 'Mockup komentar Instagram.'),
      c('.igpost', '.igpost', 'Mockup postingan Instagram.'),
      c('.igstory', '.igstory', 'Mockup Instagram Story.'),
      c('.igprofile', '.igprofile', 'Mockup profil Instagram.'),
      c('.igdm', '.igdm', 'Mockup pesan langsung Instagram.'),
      c('.ignote', '.ignote', 'Mockup Instagram Notes.'),
    ],
  },
  {
    title: '🧷 *STICKER*',
    commands: [
      c('.sticker', '.sticker', 'Membuat stiker dari media.', { aliases: ['.s', '.stiker'] }),
      c('.s', '.s', 'Alias .sticker.'),
      c('.ttp', '.ttp <teks>', 'Membuat stiker teks.'),
      c('.attp', '.attp <teks>', 'Membuat stiker teks animasi.'),
      c('.brat', '.brat <teks>', 'Membuat stiker gaya brat.'),
      c('.qc', '.qc <teks>', 'Membuat quote sticker.'),
      c('.toimg', '.toimg', 'Mengubah stiker menjadi gambar.'),
      c('.emojimix', '.emojimix 😂+🔥', 'Menggabungkan dua emoji.'),
      c('.pack', '.pack <nama>|<author>', 'Mengatur metadata paket stiker.'),
    ],
  },
  {
    title: '🎨 *MAKER*',
    commands: [
      c('.logo3d', '.logo3d <teks>', 'Membuat logo efek 3D lokal.'),
      c('.logogold', '.logogold <teks>', 'Membuat logo efek emas lokal.'),
    ],
  },
  {
    title: '🧠 *AI WRITING & CODING*',
    commands: [
      c('.aiwrite', '.aiwrite <teks>', 'Membantu menulis teks.', { requiresAi: true }),
      c('.rewrite', '.rewrite <teks>', 'Mengubah gaya tulisan.', { requiresAi: true }),
      c('.ringkas', '.ringkas <teks>', 'Meringkas teks.', { requiresAi: true }),
      c('.fixcode', '.fixcode <kode>', 'Membantu memperbaiki kode.', { requiresAi: true }),
      c('.explaincode', '.explaincode <kode>', 'Menjelaskan kode.', { requiresAi: true }),
      c('.debug', '.debug <error>', 'Menganalisis error.', { requiresAi: true }),
    ],
  },
  {
    title: '📄 *DOKUMEN DAN GAMBAR*',
    commands: [
      c('.pdf', '.pdf', 'Membaca dan merangkum dokumen PDF.', { requiresAi: true }),
      c('.img', '.img', 'Menganalisis gambar.', { requiresAi: true }),
      c('.iqc', '.iqc <teks>', 'Mockup chat gaya iPhone.'),
      c('.iqc2', '.iqc2 <teks>', 'Varian mockup iPhone lokal.'),
      c('.iqc5', '.iqc5 <teks>', 'Mockup quote iPhone lokal.', { aliases: ['.qc5'] }),
      c('.iqcdark', '.iqcdark <teks>', 'Varian mockup quote iPhone gelap.'),
      c('.iqcpink', '.iqcpink <teks>', 'Varian mockup quote iPhone pink.'),
      c('.iqcpinkv2', '.iqcpinkv2 <teks>', 'Varian mockup quote iPhone pink V2.'),
      c('.iqcmerah', '.iqcmerah <teks>', 'Varian mockup quote iPhone merah.', { aliases: ['.iqc-red', '.rediqc'] }),
      c('.tqc', '.tqc <nama>|<teks>', 'Mockup chat gaya TikTok.'),
      c('.tiktokchat', '.tiktokchat <nama>|<pesan>', 'Mockup chat TikTok lokal.', { aliases: ['.ttchat'] }),
      c('.ytcomment', '.ytcomment <nama>|<komentar>', 'Mockup komentar YouTube lokal.'),
      c('.wq', '.wq <teks>', 'Meme gaya Windows klasik.'),
      c('.iqcwin', '.iqcwin <teks>', 'Alias mockup Windows Classic lokal.'),
      c('.rvo', '.rvo', 'Meneruskan foto biasa yang diizinkan.'),
    ],
  },
  {
    title: '📚 *PENGAJIAN MUDA-MUDI*',
    commands: [
      c('.template', '.template ngaji', 'Melihat template pengajian.', { admin: true }),
      c('.setngaji', '.setngaji', 'Menyiapkan template pengajian.', { admin: true }),
      c('.editngaji', '.editngaji', 'Mengedit data template.', { admin: true }),
      c('.previewngaji', '.previewngaji', 'Melihat pratinjau pesan.', { admin: true }),
      c('.sendngaji', '.sendngaji', 'Mengirim pengumuman pengajian.', { admin: true }),
      c('.jadwalngaji', '.jadwalngaji', 'Melihat jadwal pengajian.', { admin: true }),
      c('.aturngaji', '.aturngaji', 'Mengatur jadwal pengajian.', { admin: true }),
      c('.aktifngaji', '.aktifngaji', 'Mengaktifkan pengiriman otomatis.', { admin: true }),
      c('.nonaktifngaji', '.nonaktifngaji', 'Menonaktifkan pengiriman otomatis.', { admin: true }),
    ],
  },
  {
    title: '⚙️ *UTILITAS*',
    commands: [
      c('.id', '.id', 'Menampilkan nomor pengguna dan ID grup.'),
    ],
  },
]

for (const group of COMMAND_GROUPS) {
  for (const item of group.commands) {
    item.category = group.title
    item.description = item.desc
    item.example = item.usage
    item.permission = item.admin ? 'admin' : item.vip ? 'vip' : 'all'
  }
}

const AI_CONFIGURED = Boolean(
  (config.aiProvider === 'openrouter' && config.openRouterApiKey) ||
  (config.aiProvider === 'gemini' && config.geminiApiKey),
)

export function normalizeCommand(value) {
  const raw = String(value || '').trim().toLowerCase()
  if (!/^[/.][a-z0-9]+(?:-[a-z0-9]+)*$/.test(raw)) return null
  const dotted = raw.replace(/^\//, '.')
  return COMMAND_ALIASES[dotted] || dotted
}

export function commandIsVisible(item, {
  admin = false, vip = false, privateChat = false, privateCommands = [],
} = {}) {
  if (!item.active || (item.admin && !admin) || (item.vip && !vip && !admin)) return false
  if (privateChat && item.scope !== 'all' && !privateCommands.includes(item.cmd)) return false
  if (item.requiresAi && !AI_CONFIGURED) return false
  if (['.tiktok', '.instagram'].includes(item.cmd) && !config.downloaderEnabled) return false
  return true
}

export const ALL_COMMANDS = [...new Set(COMMAND_GROUPS.flatMap((group) =>
  group.commands.filter((item) => item.active).map((item) => item.cmd),
))]

function visibleGroups(options = {}) {
  return COMMAND_GROUPS.map((group) => ({
    title: group.title,
    commands: group.commands.filter((item) => commandIsVisible(item, options)),
  })).filter((group) => group.commands.length)
}

export function buildMenuText(options = {}) {
  const lines = [
    '📚 *LUX BOT*',
    '━━━━━━━━━━━━━━━━━━',
  ]
  for (const group of visibleGroups(options)) {
    lines.push(group.title, '━━━━━━━━━━━━━━━━━━')
    for (const item of group.commands) {
      const access = item.admin ? ' (Admin)' : item.vip ? ' (VIP)' : ''
      lines.push(`◈ \`${item.usage}\` — ${item.desc}${access}`)
    }
    lines.push('')
  }
  lines.push('━━━━━━━━━━━━━━━━━━', 'Developer: Dev By Rifai', `Versi: ${config.appVersion || '1.0.0'}`)
  return lines.join('\n')
}

// Kompatibilitas dengan pemanggil lama: menu sekarang satu pesan.
export function buildMenuParts(options = {}) { return [buildMenuText(options)] }
export const MENU_CHUNK_SIZE = 999
