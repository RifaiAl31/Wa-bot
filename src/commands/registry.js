// Satu sumber kebenaran daftar command. Dipakai /menu, /help, dan tes.
export const RESTRICTED_COMMANDS = [
  '/grup', '/grupaktif', '/template', '/setngaji', '/editngaji', '/previewngaji',
  '/sendngaji', '/jadwalngaji', '/aturngaji', '/aktifngaji', '/nonaktifngaji',
]

const c = (cmd, usage, desc, extra = {}) => ({ cmd, usage, desc, ...extra })

export const COMMAND_GROUPS = [
  {
    title: '👤 *MENU UTAMA*',
    commands: [
      c('.menu', '.menu', 'Menu personal dengan identitas, waktu, dan cuaca.'),
      c('.help', '.help', 'Bantuan penggunaan bot.'),
      c('.user', '.user', 'Melihat JID, role, dan status akun.'),
      c('.vip', '.vip', 'Informasi/aktivasi VIP lewat private chat.'),
      c('.ping', '.ping', 'Status bot, server, WhatsApp, dan response time.'),
      c('.status', '.status', 'Status koneksi bot.'),
      c('.info', '.info', 'Informasi aplikasi dan fitur aktif.'),
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
    title: '🕌 *ISLAM*',
    commands: [
      c('.ayat', '.ayat kursi', 'Ayat pilihan / ayat berdasarkan surah:ayat.'),
      c('.surah', '.surah 36', 'Daftar dan detail surah Al-Quran.'),
      c('.murottal', '.murottal 36', 'Audio murottal per surah.'),
      c('.asmaul', '.asmaul 1', 'Asmaul Husna.'),
      c('.zikir', '.zikir pagi', 'Zikir pagi, petang, dan setelah sholat.'),
      c('.istighfar', '.istighfar', 'Sayyidul Istighfar.'),
      c('.tahlil', '.tahlil', 'Panduan tahlil.'),
      c('.sholawat', '.sholawat nariyah', 'Sholawat pilihan.'),
      c('.quotesislam', '.quotesislam', 'Quotes Islami.'),
      c('.doa', '.doa', 'Daftar doa dan dzikir yang tersedia.'),
    ],
  },
  {
    title: '📱 *INSTAGRAM iOS (MOCKUP)*',
    commands: [
      c('.igqc', '.igqc teks | nama | ID | like | unlike', 'Comment card iOS (mockup).'),
      c('.igpost', '.igpost username|like|komentar|repost', 'Postingan Instagram iOS (mockup).'),
      c('.igstory', '.igstory username|caption|like|komentar|waktu', 'Story Instagram iOS (mockup).'),
      c('.igprofile', '.igprofile username|bio|pengikut|mengikuti|postingan', 'Profil Instagram iOS (mockup).'),
      c('.igdm', '.igdm username|pesan|balasan|waktu', 'DM Instagram iOS (mockup lokal).'),
      c('.ignote', '.ignote nama|catatan|waktu', 'Instagram Notes iOS (mockup).'),
    ],
  },
  {
    title: '🧷 *STICKER*',
    commands: [
      c('.sticker', '.sticker (reply/kirim foto)', 'Foto/video/GIF jadi stiker.'),
      c('.s', '.s (reply foto)', 'Alias .sticker.'),
      c('.ttp', '.ttp Halo dunia', 'Teks jadi stiker.'),
      c('.attp', '.attp Halo', 'Teks animasi jadi stiker.'),
      c('.brat', '.brat Halo', 'Stiker brat.'),
      c('.qc', '.qc Selamat pagi', 'Quote sticker.'),
      c('.toimg', '.toimg (reply stiker)', 'Stiker jadi gambar.'),
      c('.emojimix', '.emojimix 😂+🔥', 'Campur dua emoji.'),
      c('.pack', '.pack Nama|Author', 'Atur metadata pack stiker.'),
    ],
  },
  {
    title: '🎨 *MAKER*',
    commands: [
      c('.logo3d', '.logo3d Rifai Tech', 'Logo efek 3D lokal.'),
      c('.logogold', '.logogold Rifai Tech', 'Logo efek emas lokal.'),
      c('.sologo', '.sologo <prompt>', 'Logo AI (butuh API image-generation).'),
    ],
  },
  {
    title: '🖼️ *AI IMAGE*',
    commands: [
      c('.aiedit', '.aiedit <prompt>', 'Edit gambar (belum tersedia tanpa image API).'),
      c('.aifilter', '.aifilter anime', 'Filter AI (belum tersedia tanpa image API).'),
      c('.toanime', '.toanime', 'Filter anime (belum tersedia tanpa image API).'),
      c('.tocartoon', '.tocartoon', 'Filter kartun (belum tersedia tanpa image API).'),
      c('.toreal', '.toreal', 'Filter realistik (belum tersedia tanpa image API).'),
    ],
  },
  {
    title: '🧠 *AI ASSISTANT*',
    commands: [
      c('.aiwrite', '.aiwrite pengumuman kegiatan', 'Menulis teks/artikel/pengumuman.'),
      c('.rewrite', '.rewrite formal | teks', 'Mengubah gaya penulisan.'),
      c('.ringkas', '.ringkas <teks>', 'Meringkas teks.'),
      c('.fixcode', '.fixcode <kode>', 'Memperbaiki kode.'),
      c('.explaincode', '.explaincode <kode>', 'Menjelaskan kode.'),
      c('.debug', '.debug <error>', 'Menganalisis stack trace/error.'),
    ],
  },
  {
    title: '📚 *PENGAJIAN MUDA-MUDI*',
    commands: [
      c('/template', '/template ngaji', 'Melihat template pengajian.', { admin: true }),
      c('/setngaji', '/setngaji', 'Menyiapkan template pengajian.', { admin: true }),
      c('/editngaji', '/editngaji', 'Mengedit data template.', { admin: true }),
      c('/previewngaji', '/previewngaji', 'Melihat preview pesan.', { admin: true }),
      c('/sendngaji', '/sendngaji', 'Mengirim pengumuman sekarang.', { admin: true }),
      c('/jadwalngaji', '/jadwalngaji', 'Melihat jadwal berikutnya.', { admin: true }),
      c('/aturngaji', '/aturngaji', 'Mengatur jadwal pengajian.', { admin: true }),
      c('/aktifngaji', '/aktifngaji', 'Mengaktifkan pengiriman otomatis.', { admin: true }),
      c('/nonaktifngaji', '/nonaktifngaji', 'Menonaktifkan pengiriman otomatis.', { admin: true }),
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
      c('.rvo', '.rvo', 'Meneruskan foto biasa yang diizinkan (bukan view-once).'),
      c('.tiktok', '.tiktok <link>', 'Mengunduh media TikTok publik.', { vip: true }),
      c('.instagram', '.instagram <link>', 'Mengunduh media Instagram publik.', { vip: true }),
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
