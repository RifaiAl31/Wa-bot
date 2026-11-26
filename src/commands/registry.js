import { config } from '../config.js'

export const COMMAND_ALIASES = Object.freeze({
  '.kirim': '.send',
  '.free': '.models',
  '.s': '.sticker',
  '.stiker': '.sticker',
  '.sgif': '.sticker',
  '.attp2': '.attp',
  '.attp3': '.attp',
  '.quotechat': '.qc',
  '.mixemoji': '.emojimix',
  '.emix': '.emojimix',
  '.toimage': '.toimg',
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
  '.kuis': '.quiz',
  '.jawabquiz': '.qa',
  '.jwbquiz': '.qa',
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
    menuCategory: 'umum',
    commands: [
      c('.menu', '.menu [kategori]', 'Menampilkan kategori atau daftar perintah kategori.', { scope: 'all' }),
      c('.help', '.help [kategori]', 'Bantuan bot; sama dengan .menu.', { scope: 'all' }),
      c('.user', '.user', 'Informasi pengguna dan role.', { scope: 'all' }),
      c('.vip', '.vip', 'Informasi atau aktivasi VIP; rincian ada di kategori VIP.', { scope: 'all' }),
      c('.ping', '.ping', 'Status bot dan waktu respons.', { scope: 'all' }),
      c('.status', '.status', 'Status koneksi WhatsApp.', { scope: 'all' }),
      c('.info', '.info', 'Informasi bot dan versi.', { scope: 'all' }),
      c('.id', '.id', 'Menampilkan nomor pengguna dan ID grup.', { scope: 'all' }),
    ],
  },
  {
    title: '📢 *PENGUMUMAN*',
    menuCategory: 'pengumuman',
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
    menuCategory: 'jadwal',
    commands: [
      c('.jadwal', '.jadwal', 'Melihat jadwal pengumuman.'),
      c('.aturjadwal', '.aturjadwal A1', 'Mengatur jadwal pengumuman.'),
      c('.aktifkan', '.aktifkan A1', 'Mengaktifkan pengumuman terjadwal.'),
      c('.nonaktifkan', '.nonaktifkan A1', 'Menonaktifkan pengumuman terjadwal.'),
    ],
  },
  {
    title: '👥 *MANAJEMEN GRUP*',
    menuCategory: 'grup',
    commands: [
      c('.grup', '.grup', 'Daftar grup yang dapat diakses bot.', { admin: true }),
      c('.grupaktif', '.grupaktif', 'Daftar grup terdaftar.', { admin: true }),
      c('.daftargrup', '.daftargrup N', 'Mendaftarkan grup nomor N.', { admin: true }),
      c('.nondaftargrup', '.nondaftargrup N', 'Mencabut pendaftaran grup N.', { admin: true }),
    ],
  },
  {
    title: '👑 *VIP*',
    menuCategory: 'vip',
    commands: [
      c('.vip', '.vip', 'Informasi layanan VIP; ditampilkan juga di menu utama.', { scope: 'all' }),
      c('.no', '.no vip @pengguna', 'Mencabut status VIP pengguna.', { admin: true }),
    ],
  },
  {
    title: '⬇️ *DOWNLOADER*',
    menuCategory: 'utilitas',
    source: 'src/downloaders/index.js',
    commands: [
      c('.tiktok', '.tiktok <tautan>', 'Mengunduh media TikTok publik.', { vip: true }),
      c('.instagram', '.instagram <tautan>', 'Mengunduh media Instagram publik.', { vip: true }),
    ],
  },
  {
    title: '🤖 *AI ASSISTANT*',
    menuCategory: 'ai',
    commands: [
      c('.ask', '.ask <pertanyaan>', 'Bertanya kepada AI.', { requiresAi: true }),
      c('.models', '.models', 'Daftar model gratis (alias: .free).', { aliases: ['.free'], requiresAi: true }),
      c('.model', '.model [nomor]', 'Melihat model aktif atau memilih model (admin).', { permission: 'admin untuk mengubah', requiresAi: true }),
    ],
  },
  {
    title: '🕌 *ISLAM*',
    menuCategory: 'islam',
    source: 'src/features/islam/index.js',
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
    menuCategory: 'instagram',
    source: 'src/features/ig/index.js',
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
    menuCategory: 'sticker',
    source: 'src/features/sticker/index.js',
    commands: [
      c('.sticker', '.sticker (reply foto) atau caption foto: .sticker', 'Membuat stiker dari foto, GIF, video, atau stiker.', { scope: 'all', aliases: ['.s', '.stiker', '.sgif'] }),
      c('.ttp', '.ttp <teks>', 'Membuat stiker teks.', { scope: 'all' }),
      c('.attp', '.attp <teks>', 'Membuat stiker teks (animasi memerlukan FFmpeg).', { scope: 'all', aliases: ['.attp2', '.attp3'] }),
      c('.brat', '.brat <teks>', 'Membuat stiker gaya brat.', { scope: 'all', aliases: ['.bratblack', '.bratgreen', '.brat2', '.bratimg', '.brattext'] }),
      c('.qc', '.qc <teks>', 'Membuat quote sticker.', { scope: 'all', aliases: ['.quotechat'] }),
      c('.toimg', '.toimg (reply stiker)', 'Mengubah stiker menjadi gambar.', { scope: 'all', aliases: ['.toimage'] }),
      c('.emojimix', '.emojimix 😂🔥', 'Menggabungkan dua emoji.', { scope: 'all', aliases: ['.mixemoji', '.emix'] }),
      c('.pack', '.pack <nama>|<author>', 'Mengatur metadata paket stiker; penulis default Dev By Rifai.'),
    ],
  },
  {
    title: '🎨 *MAKER*',
    menuCategory: 'maker',
    source: 'src/features/maker/index.js',
    commands: [
      c('.logo3d', '.logo3d <teks>', 'Membuat logo efek 3D lokal.'),
      c('.logogold', '.logogold <teks>', 'Membuat logo efek emas lokal.'),
    ],
  },
  {
    title: '🎮 *GAME*',
    menuCategory: 'game',
    source: 'src/features/games/index.js',
    commands: [
      c('.quiz', '.quiz [kategori]', 'Memulai kuis; sesi terpisah per chat dan pemain.', { scope: 'all', aliases: ['.kuis'] }),
      c('.qa', '.qa <A-D>', 'Menjawab kuis aktif (satu kesempatan).', { scope: 'all', aliases: ['.jawabquiz', '.jwbquiz'] }),
    ],
  },
  {
    title: '🧠 *AI WRITING & CODING*',
    menuCategory: 'ai',
    source: 'src/features/ai/writing.js',
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
    menuCategory: 'gambar',
    source: 'src/images/generator.js',
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
      c('.wq', '.wq <teks>', 'Meme gaya Windows klasik.', { aliases: ['.iqcwin', '.iqcwindow'] }),
      c('.rvo', '.rvo', 'Meneruskan foto biasa yang diizinkan.'),
    ],
  },
  {
    title: '📚 *PENGAJIAN MUDA-MUDI*',
    menuCategory: 'jadwal',
    source: 'src/commands/ngaji.js',
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
]

for (const group of COMMAND_GROUPS) {
  for (const item of group.commands) {
    item.category = group.title
    item.description = item.desc
    item.example = item.usage
    item.permission = item.permission || (item.admin ? 'admin' : item.vip ? 'vip' : 'all')
    item.source = item.source || group.source || 'src/commands/router.js'
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

export const MENU_CATEGORIES = [
  { slug: 'umum', title: '👤 MENU UMUM' },
  { slug: 'pengumuman', title: '📢 PENGUMUMAN' },
  { slug: 'jadwal', title: '📅 JADWAL' },
  { slug: 'grup', title: '👥 GRUP' },
  { slug: 'vip', title: '👑 VIP' },
  { slug: 'ai', title: '🤖 AI' },
  { slug: 'islam', title: '🕌 ISLAM' },
  { slug: 'instagram', title: '📱 INSTAGRAM' },
  { slug: 'sticker', title: '🧷 STICKER' },
  { slug: 'maker', title: '🎨 MAKER' },
  { slug: 'game', title: '🎮 GAME' },
  { slug: 'gambar', title: '🖼️ GAMBAR & DOKUMEN' },
  { slug: 'utilitas', title: '⚙️ UTILITAS' },
]

function visibleGroups(options = {}) {
  return COMMAND_GROUPS.map((group) => ({
    title: group.title,
    commands: group.commands.filter((item) => commandIsVisible(item, options)),
  })).filter((group) => group.commands.length)
}

export function normalizeMenuCategory(value) {
  const slug = String(value || '').trim().toLowerCase()
  return MENU_CATEGORIES.some((category) => category.slug === slug) ? slug : null
}

export function buildMenuText(options = {}) {
  const category = normalizeMenuCategory(options.category)
  const visible = visibleGroups(options)
  const availableCategories = MENU_CATEGORIES.filter((item) =>
    COMMAND_GROUPS.some((group) => group.menuCategory === item.slug &&
      group.commands.some((command) => commandIsVisible(command, options))),
  )
  const lines = ['📚 *LUX BOT*', '━━━━━━━━━━━━━━━━━━']

  if (!options.category) {
    lines.push('PILIH KATEGORI MENU', '')
    for (const item of availableCategories) lines.push(`◈ \`.menu ${item.slug}\``)
    lines.push('', 'Ketik `.menu <kategori>` untuk melihat daftar perintah.')
    if (options.groupChat) lines.push('', 'Shortcut grup: 1 = .list  |  2 = .ask  |  3 = .user')
    lines.push('', '━━━━━━━━━━━━━━━━━━', 'Developer: Dev By Rifai', `Versi: ${config.appVersion || '1.0.0'}`)
    return lines.join('\n')
  }

  if (!category) {
    lines.push('Kategori tidak dikenal.', '', `Kategori valid: ${availableCategories.map((item) => `\`${item.slug}\``).join(', ') || 'belum tersedia'}.`)
    lines.push('', 'Ketik `.menu` untuk kembali.', '', '━━━━━━━━━━━━━━━━━━', 'Developer: Dev By Rifai', `Versi: ${config.appVersion || '1.0.0'}`)
    return lines.join('\n')
  }

  const categoryMeta = MENU_CATEGORIES.find((item) => item.slug === category)
  lines.push(`*${categoryMeta.title}*`, '━━━━━━━━━━━━━━━━━━')
  const categoryGroups = visible.filter((group) =>
    COMMAND_GROUPS.find((source) => source.title === group.title)?.menuCategory === category,
  )
  if (!categoryGroups.length) {
    lines.push('Belum ada perintah aktif untuk kategori ini.')
  }
  for (const group of categoryGroups) {
    lines.push(group.title, '━━━━━━━━━━━━━━━━━━')
    for (const item of group.commands) {
      const access = item.permission === 'admin'
        ? ' (Admin)'
        : item.permission === 'vip'
          ? ' (VIP)'
          : item.permission === 'all' ? '' : ` (${item.permission})`
      const aliases = item.aliases?.length ? ` (alias: ${item.aliases.join(', ')})` : ''
      lines.push(`◈ \`${item.usage}\`${aliases} — ${item.desc}${access}`)
    }
    lines.push('')
  }
  lines.push('Ketik `.menu` untuk kembali.', '', '━━━━━━━━━━━━━━━━━━', 'Developer: Dev By Rifai', `Versi: ${config.appVersion || '1.0.0'}`)
  return lines.join('\n')
}

// Kompatibilitas dengan pemanggil lama: menu sekarang satu pesan.
export function buildMenuParts(options = {}) { return [buildMenuText(options)] }
export const MENU_CHUNK_SIZE = 999
