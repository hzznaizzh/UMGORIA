// ═══════════════════════════════════════════════════════════════
//  GLOBAL STATE
// ═══════════════════════════════════════════════════════════════
const AppState = {
  sidebarOpen:  true,
  currentUser:  null,
  chartsInit:   {},
  umkmData:     [],
  filteredData: [],
  currentPage:  1,
  pageSize:     6,
  activeFilter: 'semua',
  dataLoadFailed: false,

  get totalUmkm() {
    return this.umkmData.length;
  },
  addUmkm() {
    return this.totalUmkm + 1;
  },
};

// ═══════════════════════════════════════════════════════════════
//  SIDEBAR  — hanya 1 hamburger di topbar, tidak ada di welcome-bar
// ═══════════════════════════════════════════════════════════════
function toggleSidebar() {
  AppState.sidebarOpen = !AppState.sidebarOpen;
  const sb = document.getElementById('sidebar');
  const tb = document.getElementById('topbar');
  const mn = document.getElementById('main');
  const ov = document.getElementById('sidebarOverlay');
  if (AppState.sidebarOpen) {
    sb.classList.remove('collapsed');
    tb.classList.remove('sidebar-closed');
    mn.classList.remove('sidebar-closed');
    if (window.innerWidth < 900) ov.classList.add('show');
    else ov.classList.remove('show');
  } else {
    sb.classList.add('collapsed');
    tb.classList.add('sidebar-closed');
    mn.classList.add('sidebar-closed');
    ov.classList.remove('show');
  }
}

function closeSidebar() {
  AppState.sidebarOpen = false;
  document.getElementById('sidebar')?.classList.add('collapsed');
  document.getElementById('topbar')?.classList.add('sidebar-closed');
  document.getElementById('main')?.classList.add('sidebar-closed');
  document.getElementById('sidebarOverlay')?.classList.remove('show');
}

window.addEventListener('resize', () => {
  if (window.innerWidth < 900 && AppState.sidebarOpen) closeSidebar();
});

// ═══════════════════════════════════════════════════════════════
//  NAVIGATE
// ═══════════════════════════════════════════════════════════════
function navigate(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + page)?.classList.add('active');
  document.querySelector(`[data-page="${page}"]`)?.classList.add('active');
  window.scrollTo(0, 0);

  if (page === 'home')         { if (!AppState.chartsInit.home)         initHomeCharts(); }
  if (page === 'factor')       { if (!AppState.chartsInit.factor)       initSpiderChart(); }
  if (page === 'distribution') { if (!AppState.chartsInit.distribution) initDistCharts(); }
  if (page === 'comparison')   { if (!AppState.chartsInit.comparison)   initCompCharts(); }
  if (page === 'formdata')     { if (typeof resetAndBuildForm === 'function') resetAndBuildForm(); }
  if (page === 'umkmrec')      { renderUmkmTable(); }
  if (page === 'profile')      { renderProfilePage(); }
  if (page === 'notifications') { renderNotifications(); }

  applyDynamicData();

  if (page === 'home' || page === 'factor' || page === 'distribution' || page === 'comparison') loadDashboardData();
}

function renderNotifications() {
  const records = AppState.umkmData || [];
  const user = AppState.currentUser || { displayName: 'Pengguna' };
  safeSet('notif-halo', 'Halo, ' + user.displayName + '!');
  const notificationCount = records.length ? 1 : 0;
  safeSet('notif-badge-count-text', notificationCount);
  safeSet('notif-badge-num', String(notificationCount).padStart(2, '0'));

  const list = document.getElementById('notif-list-container');
  if (!list) return;
  if (!records.length) {
    list.innerHTML = '<div class="notif-item primary"><div class="notif-item-content"><div class="notif-item-title">Belum ada hasil asesmen</div><div class="notif-item-desc">Hasil penilaian akan muncul setelah kuesioner dikirim dan tersimpan.</div></div></div>';
    return;
  }

  const latest = [...records].sort((a, b) => new Date(b.tanggal || 0) - new Date(a.tanggal || 0))[0];
  const latestDate = latest.tanggal ? new Date(String(latest.tanggal).replace(' ', 'T')).toLocaleDateString('id-ID') : 'Tanggal tidak tersedia';
  list.innerHTML = `<div class="notif-item success"><div class="notif-item-content"><div class="notif-item-type">ASESMEN TERSIMPAN</div><div class="notif-item-title">${records.length} hasil asesmen tersedia</div><div class="notif-item-desc">Asesmen terbaru tercatat pada ${latestDate}. Rincian skor dapat dilihat pada dashboard.</div></div><div class="notif-item-time">${latestDate}</div></div>`;
}
function updateUserDisplay() {
  const user = AppState.currentUser;
  if (!user) return;

  // Pastikan nama tidak pernah "undefined" atau kosong
  const displayName = (user.umkm_name && user.umkm_name !== 'undefined')
    ? user.umkm_name
    : (user.name && user.name !== 'undefined')
      ? user.name
      : user.email
        ? user.email.split('@')[0]
        : 'Pengguna';

  // Simpan nama yang sudah dibersihkan
  AppState.currentUser.displayName = displayName;

  const av = document.getElementById('topbarAvatar');
  if (av) av.textContent = displayName[0].toUpperCase();
  const notifAv = document.getElementById('notifAvatar');
  if (notifAv) notifAv.textContent = displayName[0].toUpperCase();
  const helpAv = document.getElementById('helpAvatar');
  if (helpAv) helpAv.textContent = displayName[0].toUpperCase();

  const tn = document.getElementById('topbarName');
  if (tn) tn.textContent = displayName;

  // Ganti semua .welcome-name di seluruh halaman
  document.querySelectorAll('.welcome-name').forEach(el => {
    el.textContent = displayName;
  });

  // Role badge
  const rb = document.getElementById('topbarRole');
  if (rb) rb.textContent = user.role === 'employee' ? '👤 Pegawai' : '👔 Owner';
}

// ═══════════════════════════════════════════════════════════════
//  MASTER UMKM DATA  (Data dari CSV & Database)
// ═══════════════════════════════════════════════════════════════

let isFetchingUmkm = false;

async function loadUmkmData() {
  if (AppState.umkmData && AppState.umkmData.length > 0) return;
  if (isFetchingUmkm) {
    while (isFetchingUmkm) await new Promise(r => setTimeout(r, 50));
    return;
  }

  isFetchingUmkm = true;
  AppState.dataLoadFailed = false;
  try {
    const rows = [];
    let totalRows = 0;
    do {
      const res = await DashboardAPI.getUmkmList({ limit: 100, offset: rows.length });
      if (!res || !res.ok || !res.data || !Array.isArray(res.data.rows)) {
        throw new Error(res?.message || 'Respons daftar asesmen tidak valid.');
      }
      rows.push(...res.data.rows);
      totalRows = Number(res.data.total) || rows.length;
    } while (rows.length < totalRows && rows.length > 0);

    AppState.umkmData = rows.map(row => {
        const scoreOn5 = row.score_on_5 == null ? null : Number(row.score_on_5);
        const scoreFactor = key => row[`score_${key}`] == null ? null : Number(row[`score_${key}`]) * 5;
        const omzet = Number(row.omzet);

        return {
          id: String(row.submission_id),
          nama: row.umkm_name || '—',
          lokasi: row.lokasi || '—',
          sektor: row.sektor || '—',
          omzet: Number.isFinite(omzet) && omzet > 0 ? 'Rp ' + omzet.toLocaleString('id-ID') : '—',
          skor: Number.isFinite(scoreOn5) ? Math.round((scoreOn5 / 5) * 100) : null,
          scoreOn5,
          faktor: '—',
          rek: row.health_category || '—',
          tanggal: row.submitted_at || null,
          scores: {
            ov: scoreFactor('ov'),
            ldi: scoreFactor('ldi'),
            ins: scoreFactor('ins'),
            ops: scoreFactor('ops'),
            weq: scoreFactor('weq'),
            ect: scoreFactor('ect')
          }
        };
      });
  } catch (error) {
    console.error('Failed to load UMKM data from database:', error);
    AppState.dataLoadFailed = true;
    showToast('Data asesmen belum dapat dimuat dari server.', 'error');
  } finally {
    isFetchingUmkm = false;
  }

  AppState.filteredData = [...AppState.umkmData];
  AppState.currentPage  = 1;
}

// ═══════════════════════════════════════════════════════════════
//  SEARCH  — benar-benar menyaring data
// ═══════════════════════════════════════════════════════════════
function handleSearch(val) {
  const q = val.trim().toLowerCase();
  if (!q) {
    AppState.filteredData = applyFilter(AppState.umkmData, AppState.activeFilter);
    AppState.currentPage  = 1;
    renderUmkmTable();
    return;
  }
  const base = applyFilter(AppState.umkmData, AppState.activeFilter);
  AppState.filteredData = base.filter(u =>
    u.nama.toLowerCase().includes(q)    ||
    u.lokasi.toLowerCase().includes(q)  ||
    u.sektor.toLowerCase().includes(q)  ||
    u.id.toLowerCase().includes(q)      ||
    u.rek.toLowerCase().includes(q)
  );
  AppState.currentPage = 1;
  renderUmkmTable();
  // Navigasi ke tabel UMKM jika belum di sana
  if (!document.getElementById('page-umkmrec')?.classList.contains('active')) {
    navigate('umkmrec');
  }
}

// ═══════════════════════════════════════════════════════════════
//  FILTER  — berdasarkan sektor / kategori
// ═══════════════════════════════════════════════════════════════
function applyFilter(data, filter) {
  if (!filter || filter === 'semua') return data;
  const f = filter.toLowerCase();

  if (f === 'agribisnis') {
    return data.filter(u => {
      const sek = u.sektor.toLowerCase();
      return sek.includes('pertanian') || sek.includes('perkebunan') || sek.includes('agribisnis');
    });
  }

  return data.filter(u => u.sektor.toLowerCase().includes(f));
}

function filterByKategori(kategori) {
  AppState.activeFilter = kategori;
  const search = document.getElementById('searchInput')?.value?.trim()?.toLowerCase() || '';
  let base = applyFilter(AppState.umkmData, kategori);
  if (search) {
    base = base.filter(u =>
      u.nama.toLowerCase().includes(search) ||
      u.lokasi.toLowerCase().includes(search) ||
      u.sektor.toLowerCase().includes(search)
    );
  }
  AppState.filteredData = base;
  AppState.currentPage  = 1;
  renderUmkmTable();
  // Navigasi ke tabel
  if (!document.getElementById('page-umkmrec')?.classList.contains('active')) {
    navigate('umkmrec');
  }
  // Close dropdown
  document.querySelectorAll('.dropdown-menu').forEach(d => d.classList.remove('show'));
  showToast(`Filter aktif: ${kategori === 'semua' ? 'Semua UMKM' : kategori}`);
}

function filterUmkmTable(sektor) {
  filterByKategori(sektor);
}

// ═══════════════════════════════════════════════════════════════
//  RENDER UMKM TABLE  — dengan pagination
// ═══════════════════════════════════════════════════════════════
function renderUmkmTable() {
  if (!AppState.umkmData.length) {
    if (AppState.dataLoadFailed) {
      const tbody = document.getElementById('umkmTableBody');
      if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--gray-500)">Data belum dapat dimuat. Periksa koneksi, lalu coba lagi.</td></tr>';
      return;
    }
    loadUmkmData().then(() => renderUmkmTable());
    return;
  }

  const data      = AppState.filteredData;
  const total     = data.length;
  const pageSize  = AppState.pageSize;
  const page      = AppState.currentPage;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start     = (page - 1) * pageSize;
  const slice     = data.slice(start, start + pageSize);

  const tbody = document.getElementById('umkmTableBody');
  if (!tbody) return;

  if (!slice.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--gray-400)">Tidak ada data ditemukan</td></tr>`;
  } else {
    tbody.innerHTML = slice.map(u => {
      const scoreClass = u.skor === null ? '' : u.skor >= 80 ? 'score-great' : u.skor >= 60 ? 'score-good' : u.skor >= 40 ? 'score-mid' : 'score-bad';
      const sektorClass = u.sektor.toLowerCase().includes('kuliner') ? 'sector-kuliner'
                        : u.sektor.toLowerCase().includes('kerajinan') ? 'sector-kerajinan'
                        : u.sektor.toLowerCase().includes('ritel') ? 'sector-ritel'
                        : u.sektor.toLowerCase().includes('kesehatan') ? 'sector-kesehatan'
                        : 'sector-ritel';
      const faktorClass = u.faktor.includes('Kekuatan') ? 'kekuatan' : 'kelemahan';
      return `<tr>
        <td class="umkm-id" onclick="showUmkmDetail('${u.id}')">${u.id}</td>
        <td class="umkm-name">${u.nama}</td>
        <td>${u.lokasi}</td>
        <td><span class="sector-badge ${sektorClass}">${u.sektor.toUpperCase()}</span></td>
        <td>${u.omzet}</td>
        <td><div class="health-score ${scoreClass}">${u.skor === null ? '—' : u.skor}</div></td>
        <td class="${faktorClass}">${u.faktor}</td>
        <td>${u.rek}</td>
      </tr>`;
    }).join('');
  }

  // Update pagination info
  const pInfo = document.getElementById('paginationInfo');
  if (pInfo) pInfo.textContent = `Halaman ${page} dari ${totalPages} (${total} data)`;

  // Render pagination buttons
  renderPaginationBtns(page, totalPages);

  // Update stats
  const scored = data.filter(record => Number.isFinite(record.scoreOn5));
  const avgSkor = scored.length ? (scored.reduce((sum, record) => sum + record.scoreOn5, 0) / scored.length).toFixed(2) : '—';
  safeSet('stat-total-rec', total);
  safeSet('stat-avg-rec', avgSkor + (avgSkor === '—' ? '' : '/5'));
}

function renderPaginationBtns(current, total) {
  const wrap = document.getElementById('paginationBtns');
  if (!wrap) return;

  let btns = `<button class="page-btn" onclick="goToPage(${current - 1})" ${current<=1?'disabled':''}>‹</button>`;

  // Build page numbers with ellipsis
  const pages = [];
  if (total <= 7) {
    for (let i=1; i<=total; i++) pages.push(i);
  } else {
    pages.push(1);
    if (current > 3)       pages.push('...');
    for (let i=Math.max(2,current-1); i<=Math.min(total-1,current+1); i++) pages.push(i);
    if (current < total-2) pages.push('...');
    pages.push(total);
  }

  pages.forEach(p => {
    if (p === '...') {
      btns += `<button class="page-btn" disabled>...</button>`;
    } else {
      btns += `<button class="page-btn ${p===current?'active':''}" onclick="goToPage(${p})">${p}</button>`;
    }
  });

  btns += `<button class="page-btn" onclick="goToPage(${current + 1})" ${current>=total?'disabled':''}>›</button>`;
  wrap.innerHTML = btns;
}

function goToPage(p) {
  const total = Math.ceil(AppState.filteredData.length / AppState.pageSize);
  if (p < 1 || p > total) return;
  AppState.currentPage = p;
  renderUmkmTable();
  document.getElementById('page-umkmrec')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function showUmkmDetail(id) {
  const u = AppState.umkmData.find(x => x.id === id);
  if (!u) return;
  showToast(`Detail: ${u.nama} — Skor ${u.skor} — ${u.rek}`);
}

// ═══════════════════════════════════════════════════════════════
//  EXPORT DATA (CSV)
// ═══════════════════════════════════════════════════════════════
function exportData() {
  const data = AppState.filteredData;
  const headers = ['ID','Nama UMKM','Lokasi','Sektor','Omzet','Skor Kesehatan','Faktor Utama','Rekomendasi'];
  const rows = data.map(u => [u.id, u.nama, u.lokasi, u.sektor, u.omzet, u.skor, u.faktor, u.rek]
    .map(v => `"${String(v).replace(/"/g,'""')}"`).join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `UMGORIA_Data_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Data berhasil diekspor sebagai CSV', 'success');
}

// ═══════════════════════════════════════════════════════════════
//  LIHAT PROTOKOL POPUP
// ═══════════════════════════════════════════════════════════════
function showProtokol(jenis) {
  const protokols = {
    ins: {
      title: 'Tinjau Kelembagaan (INS)',
      priority: 'PANDUAN UMUM',
      color: '#54758a',
      steps: [
        'Periksa kelengkapan administrasi usaha yang relevan.',
        'Tinjau pembagian peran dan tanggung jawab dalam organisasi.',
        'Catat kebutuhan dukungan atau sumber daya yang belum terpenuhi.',
        'Pilih satu tindak lanjut yang realistis dan tentukan penanggung jawab.',
      ],
      eta: 'Sesuaikan kebutuhan usaha',
    },
    ect: {
      title: 'Tinjau Faktor Eksternal (ECT)',
      priority: 'PANDUAN UMUM',
      color: '#b88a42',
      steps: [
        'Tinjau perubahan kebutuhan pelanggan dan kondisi pasar.',
        'Petakan hubungan usaha dengan pemasok, mitra, dan komunitas.',
        'Periksa kewajiban perizinan atau kepatuhan yang berlaku.',
        'Pilih peluang atau risiko eksternal yang perlu ditindaklanjuti.',
      ],
      eta: 'Sesuaikan kebutuhan usaha',
    },
    bio: {
      title: 'Susun Rencana Pengembangan',
      priority: 'LANGKAH TINDAK LANJUT',
      color: '#54758a',
      steps: [
        'Pilih faktor yang ingin ditinjau berdasarkan hasil asesmen.',
        'Tentukan tujuan kecil dan langkah yang dapat dilakukan.',
        'Tetapkan penanggung jawab serta waktu evaluasi.',
        'Catat perkembangan untuk dibandingkan pada asesmen berikutnya.',
      ],
      eta: 'Ditentukan oleh pemilik usaha',
    },
  };

  const p = protokols[jenis] || protokols.bio;
  const popup = document.createElement('div');
  popup.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:600;display:flex;align-items:center;justify-content:center;padding:20px;animation:fadeIn 0.2s ease';
  popup.innerHTML = `
    <div style="background:#fff;border-radius:16px;padding:28px;max-width:440px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.2);animation:slideUp 0.3s cubic-bezier(0.34,1.56,0.64,1)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
        <div>
          <span style="font-size:10px;font-weight:700;background:${p.color}20;color:${p.color};padding:3px 10px;border-radius:20px">${p.priority}</span>
          <h2 style="font-size:17px;font-weight:800;color:var(--gray-900);margin-top:8px">${p.title}</h2>
        </div>
        <button onclick="this.closest('[style]').remove()" style="width:32px;height:32px;border:none;background:var(--gray-100);border-radius:8px;cursor:pointer;font-size:16px;flex-shrink:0">✕</button>
      </div>
      <div style="margin-bottom:20px">
        ${p.steps.map((s,i) => `
          <div style="display:flex;align-items:flex-start;gap:12px;padding:10px 0;border-bottom:1px solid var(--gray-100)">
            <div style="width:24px;height:24px;border-radius:50%;background:var(--primary);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">${i+1}</div>
            <span style="font-size:13px;color:var(--gray-700)">${s}</span>
          </div>`).join('')}
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;background:var(--gray-50);border-radius:10px;padding:12px 16px">
        <span style="font-size:12px;color:var(--gray-500)">Waktu tindak lanjut</span>
        <span style="font-size:13px;font-weight:700;color:${p.color}">${p.eta}</span>
      </div>
      <button onclick="this.closest('[style]').remove()" style="width:100%;margin-top:16px;padding:12px;background:var(--primary);border:none;border-radius:10px;color:#fff;font-weight:700;font-size:14px;cursor:pointer;font-family:inherit">Tutup panduan</button>
    </div>
    <style>@keyframes fadeIn{from{opacity:0}to{opacity:1}}@keyframes slideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}</style>`;
  document.body.appendChild(popup);
  popup.addEventListener('click', e => { if (e.target === popup) popup.remove(); });
}

// ═══════════════════════════════════════════════════════════════
//  DASHBOARD DATA FROM DB  — update charts & stats
// ═══════════════════════════════════════════════════════════════
async function loadDashboardData() {
  try {
    const response = await DashboardAPI.getStats();
    if (!response || !response.ok || !response.data) {
      throw new Error(response?.message || 'Ringkasan asesmen tidak dapat dimuat.');
    }

    AppState.dashboardStats = response.data.stats || {};
    AppState.factorAverages = response.data.factor_averages || {};
    await loadUmkmData();
    applyDynamicData();
  } catch (error) {
    console.error('Failed to load dashboard data:', error);
    showToast('Ringkasan asesmen belum dapat dimuat dari server.', 'error');
  }
}

function getFactorAverage(key) {
  const value = AppState.factorAverages?.[`avg_${key}_5`];
  if (value === null || value === undefined || value === '') return null;
  const score = Number(value);
  return Number.isFinite(score) ? score : null;
}

function getHealthCategory(record) {
  const category = String(record.rek || '').toUpperCase();
  if (['PERLU PERHATIAN', 'CUKUP', 'BAIK', 'SANGAT BAIK'].includes(category)) return category;
  if (!Number.isFinite(record.scoreOn5)) return null;
  if (record.scoreOn5 < 2) return 'PERLU PERHATIAN';
  if (record.scoreOn5 < 3) return 'CUKUP';
  if (record.scoreOn5 < 4) return 'BAIK';
  return 'SANGAT BAIK';
}

function getHealthCategoryCounts() {
  const counts = { 'PERLU PERHATIAN': 0, CUKUP: 0, BAIK: 0, 'SANGAT BAIK': 0 };
  AppState.umkmData.forEach(record => {
    const category = getHealthCategory(record);
    if (category) counts[category] += 1;
  });
  return counts;
}

function applyDynamicData() {
  const stats = AppState.dashboardStats || {};
  const total = Number(stats.total_umkm) || AppState.umkmData.length;
  const valid = Number(stats.total_valid) || 0;
  const categoryCounts = getHealthCategoryCounts();
  const factorScores = {
    ins: getFactorAverage('ins'),
    ov: getFactorAverage('ov'),
    ldi: getFactorAverage('ldi'),
    weq: getFactorAverage('weq'),
    ops: getFactorAverage('ops'),
    ect: getFactorAverage('ect')
  };

  updateTotalDisplay(total);
  updateDonutLegend(categoryCounts);
  safeSet('stat-sehat-pct', valid ? Math.round((Number(stats.sehat_count) || 0) / valid * 100) + '%' : '—');
  safeSet('stat-best-score', stats.best_score == null ? '—' : Number(stats.best_score).toFixed(2));
  safeSet('stat-worst-score', stats.worst_score == null ? '—' : Number(stats.worst_score).toFixed(2));

  if (window.donutChartInst) {
    window.donutChartInst.data.datasets[0].data = [
      categoryCounts['PERLU PERHATIAN'], categoryCounts.CUKUP,
      categoryCounts.BAIK, categoryCounts['SANGAT BAIK']
    ];
    window.donutChartInst.update('none');
  }

  const barValues = [factorScores.ov, factorScores.ops, factorScores.weq, factorScores.ins, factorScores.ldi, factorScores.ect];
  if (window.barChartInst) {
    window.barChartInst.data.datasets[0].data = barValues;
    window.barChartInst.update('none');
  }
  if (window.spiderChartInst) {
    window.spiderChartInst.data.datasets[0].data = [
      factorScores.ins, factorScores.ldi, factorScores.weq,
      factorScores.ov, factorScores.ops, factorScores.ect
    ];
    window.spiderChartInst.update('none');
  }

  const factorCards = [
    ['ins', 'INS'], ['ldi', 'LDI'], ['weq', 'WEQ'],
    ['ov', 'OV'], ['ops', 'OPS'], ['ect', 'ECT']
  ];
  document.querySelectorAll('.factor-card').forEach((card, index) => {
    const [key, code] = factorCards[index] || [];
    if (!key) return;
    const score = factorScores[key];
    const scoreElement = card.querySelector('.factor-score');
    const badgeElement = card.querySelector('.factor-badge');
    if (scoreElement) scoreElement.innerHTML = `${score === null ? '—' : score.toFixed(2)}<span> / 5.0</span>`;
    if (badgeElement) {
      badgeElement.textContent = score === null ? 'BELUM ADA DATA' : score < 2 ? 'PERLU PERHATIAN' : score < 3 ? 'CUKUP' : score < 4 ? 'BAIK' : 'SANGAT BAIK';
      badgeElement.className = 'factor-badge ' + (score === null ? '' : score < 2 ? 'badge-low' : score < 3 ? 'badge-average' : score < 4 ? 'badge-good' : 'badge-optimal');
    }
    const nameElement = card.querySelector('.factor-name');
    if (nameElement && !nameElement.textContent.includes(`(${code})`)) nameElement.textContent += ` (${code})`;
  });

  const factorRows = document.querySelectorAll('.factor-row');
  const rowKeys = ['ins', 'ldi', 'weq', 'ov', 'ops', 'ect'];
  factorRows.forEach((row, index) => {
    const score = factorScores[rowKeys[index]];
    const scoreElement = row.querySelector('.factor-row-score');
    const realization = row.querySelector('.realization-label');
    const bar = row.querySelector('.bar-fill');
    if (scoreElement) scoreElement.textContent = score === null ? '—' : score.toFixed(2);
    if (realization) realization.textContent = score === null ? 'Belum ada data' : `Skor hasil asesmen / 5.0`;
    if (bar) bar.style.width = score === null ? '0%' : `${Math.max(0, Math.min(100, score / 5 * 100))}%`;
  });

  const records = AppState.umkmData.filter(record => Number.isFinite(record.scoreOn5));
  const orderedScores = [...records].sort((a, b) => b.scoreOn5 - a.scoreOn5);
  const best = orderedScores[0];
  const worst = orderedScores[orderedScores.length - 1];
  safeSet('comp-top-id', best ? `${best.nama} · Asesmen ${best.id}` : 'Belum ada data');
  safeSet('comp-top-score', best ? `${best.scoreOn5.toFixed(2)} / 5.00` : '— / 5.00');
  safeSet('comp-top-status', best ? `Kategori: ${getHealthCategory(best) || '—'}` : 'Belum ada data');
  safeSet('comp-crit-id', worst ? `${worst.nama} · Asesmen ${worst.id}` : 'Belum ada data');
  safeSet('comp-crit-score', worst ? `${worst.scoreOn5.toFixed(2)} / 5.00` : '— / 5.00');
  safeSet('comp-crit-status', worst ? `Kategori: ${getHealthCategory(worst) || '—'}` : 'Belum ada data');

  const average = stats.avg_score_pct == null ? null : Number(stats.avg_score_pct) / 20;
  safeSet('comp-gap-avg', average === null ? '—' : average.toFixed(2));
  const gapBar = document.getElementById('comp-gap-bar');
  if (gapBar) gapBar.style.width = average === null ? '0%' : `${Math.max(0, Math.min(100, average / 5 * 100))}%`;
  safeSet('comp-gap-text', best && worst ? `Rentang skor asesmen: ${(best.scoreOn5 - worst.scoreOn5).toFixed(2)} poin.` : 'Perbandingan tersedia setelah hasil asesmen tersimpan.');

  const sectorCounts = {};
  AppState.umkmData.forEach(record => {
    if (record.sektor && record.sektor !== '—') sectorCounts[record.sektor] = (sectorCounts[record.sektor] || 0) + 1;
  });
  safeSet('sektor-total-unit', AppState.umkmData.length);
  const sectorLegend = document.getElementById('sektor-legend');
  if (sectorLegend) {
    sectorLegend.textContent = '';
    Object.entries(sectorCounts).sort((a, b) => b[1] - a[1]).forEach(([sector, count]) => {
      const item = document.createElement('span');
      item.textContent = `${sector}: ${Math.round(count / AppState.umkmData.length * 100)}%`;
      sectorLegend.appendChild(item);
    });
  }

  const availableFactors = Object.entries(factorScores).filter(([, score]) => score !== null).sort((a, b) => b[1] - a[1]);
  const priority = document.querySelector('.priority-text');
  const strength = document.querySelector('.strength-text');
  const summary = document.querySelector('.exec-text');
  if (summary) summary.textContent = availableFactors.length ? 'Ringkasan berikut disusun dari rata-rata skor faktor pada asesmen tersimpan.' : 'Ringkasan faktor akan tersedia setelah hasil asesmen tersimpan.';
  if (priority) priority.textContent = availableFactors.length ? `${availableFactors[availableFactors.length - 1][0].toUpperCase()} memiliki skor rata-rata terendah.` : 'Akan ditentukan dari skor faktor yang tersedia.';
  if (strength) strength.textContent = availableFactors.length ? `${availableFactors[0][0].toUpperCase()} memiliki skor rata-rata tertinggi.` : 'Akan ditampilkan setelah hasil asesmen tersedia.';

  const averageScore = average === null ? null : average.toFixed(2) + ' / 5';
  safeSet('intv-protokol', total);
  safeSet('intv-skor', total ? 'Data tersedia' : '—');
  safeSet('intv-skor-sub', total ? 'Dari asesmen tersimpan' : 'Menunggu data');
  safeSet('intv-efisiensi', averageScore || '—');
  safeSet('intv-ins-val', factorScores.ins === null ? '—' : factorScores.ins.toFixed(2) + ' / 5');
  safeSet('intv-ect-val', factorScores.ect === null ? '—' : factorScores.ect.toFixed(2) + ' / 5');
  safeSet('rec-resp-time', averageScore || '—');
  safeSet('rec-compliance', total);
  safeSet('rec-critical', records.filter(record => record.scoreOn5 < 2).length);
  safeSet('rec-next-scan', availableFactors.length ? availableFactors[availableFactors.length - 1][0].toUpperCase() : '—');

  if (window.histChartInst) {
    const distribution = updateDistributionUI();
    window.histChartInst.data.datasets[0].data = distribution;
    window.histChartInst.update('none');
  } else {
    updateDistributionUI();
  }

  [['trendMini', 5], ['trendChart', 4]].forEach(([id, count]) => {
    const chart = Chart.getChart(document.getElementById(id));
    if (!chart) return;
    const trend = getSubmissionTrend(count);
    chart.data.labels = trend.labels;
    chart.data.datasets[0].data = trend.values;
    chart.update('none');
  });
}

function updateTotalDisplay(total) {
  safeSet('donut-total', total);
  safeSet('stat-total-umkm', total);
  safeSet('rec-total-count', total);
  safeSet('stat-total-rec', total);
  safeSet('intv-protokol', total);
}

function updateDonutLegend(counts = getHealthCategoryCounts()) {
  const labels = [
    `Perlu Perhatian (${counts['PERLU PERHATIAN']})`,
    `Cukup (${counts.CUKUP})`,
    `Baik (${counts.BAIK})`,
    `Sangat Baik (${counts['SANGAT BAIK']})`
  ];
  document.querySelectorAll('.legend-item').forEach((item, index) => {
    const dot = item.querySelector('.legend-dot');
    item.textContent = labels[index] || '';
    if (dot) item.prepend(dot);
  });
}
function updateDistributionUI() {
  const records = AppState.umkmData.filter(record => Number.isFinite(record.scoreOn5));
  const bins = Array(11).fill(0);
  const scores = records.map(record => record.scoreOn5).sort((a, b) => a - b);
  safeSet('dist-populasi', `Asesmen: ${scores.length}`);

  if (!scores.length) {
    ['bw-median-score', 'bw-q1', 'bw-q2', 'bw-q3', 'bw-iqr'].forEach(id => safeSet(id, '—'));
    safeSet('dist-mu', 'μ: —');
    safeSet('outlier-count-title', 'Data Outlier (0)');
    const tbody = document.getElementById('outlier-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="2" style="text-align:center;color:#71818d;padding:10px;">Belum ada data asesmen.</td></tr>';
    return bins;
  }

  scores.forEach(score => bins[Math.min(10, Math.floor(score * 2))]++);
  const percentile = p => {
    if (scores.length === 1) return scores[0];
    const index = p * (scores.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    return scores[lower] + (scores[upper] - scores[lower]) * (index - lower);
  };
  const q1 = percentile(0.25);
  const median = percentile(0.5);
  const q3 = percentile(0.75);
  const iqr = q3 - q1;
  safeSet('bw-median-score', median.toFixed(2));
  safeSet('bw-q1', q1.toFixed(2));
  safeSet('bw-q2', median.toFixed(2));
  safeSet('bw-q3', q3.toFixed(2));
  safeSet('bw-iqr', iqr.toFixed(2));
  safeSet('dist-mu', 'μ: ' + median.toFixed(2));

  const lowerBound = q1 - 1.5 * iqr;
  const upperBound = q3 + 1.5 * iqr;
  const outliers = records
    .filter(record => record.scoreOn5 < lowerBound || record.scoreOn5 > upperBound)
    .map(record => ({ id: record.id, z: record.scoreOn5 - median, raw: record.scoreOn5 }))
    .sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
  AppState.outliers = outliers;

  const box = document.getElementById('bw-box');
  const medianLine = document.getElementById('bw-median-line');
  const wrap = document.getElementById('bw-wrap');
  if (wrap && box && medianLine) {
    const toPercent = value => Math.max(0, Math.min(100, value / 5 * 100));
    box.style.left = toPercent(q1) + '%';
    box.style.width = (toPercent(q3) - toPercent(q1)) + '%';
    medianLine.style.left = toPercent(median) + '%';
    wrap.querySelectorAll('.bw-dynamic-dot').forEach(dot => dot.remove());
    outliers.forEach(outlier => {
      const dot = document.createElement('div');
      dot.className = 'boxplot-dot bw-dynamic-dot';
      dot.style.left = toPercent(outlier.raw) + '%';
      dot.style.background = outlier.z < 0 ? 'var(--warning)' : 'var(--danger)';
      wrap.appendChild(dot);
    });
  }

  safeSet('outlier-count-title', `Data Outlier (${outliers.length})`);
  const tbody = document.getElementById('outlier-tbody');
  if (tbody) {
    tbody.innerHTML = '';
    if (!outliers.length) {
      tbody.innerHTML = '<tr><td colspan="2" style="text-align:center;color:#71818d;padding:10px;">Tidak ada outlier berdasarkan rentang IQR.</td></tr>';
    } else {
      outliers.forEach(outlier => {
        const row = document.createElement('tr');
        const color = outlier.z < 0 ? 'var(--warning)' : 'var(--danger)';
        row.innerHTML = `<td>#${outlier.id}</td><td class="z-score" style="color:${color};font-weight:700">${outlier.raw.toFixed(2)}</td>`;
        tbody.appendChild(row);
      });
    }
  }
  return bins;
}

async function refreshAllCharts() {
  AppState.umkmData = [];
  AppState.filteredData = [];
  AppState.dataLoadFailed = false;
  await loadUmkmData();
  await loadDashboardData();
  renderUmkmTable();
}

function safeSet(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}
function renderProfilePage() {
  const user = AppState.currentUser;
  if (!user) return;
  const container = document.getElementById('profile-content');
  if (!container) return;

  const displayName = user.displayName || user.umkm_name || user.email?.split('@')[0] || 'Pengguna';
  const roleLabel   = user.role === 'employee' ? 'Pegawai' : 'Owner';
  const roleColor   = user.role === 'employee' ? '#7c3aed' : '#1a56db';
  const roleBg      = user.role === 'employee' ? '#ede9fe' : '#dbeafe';
  const initial     = displayName[0].toUpperCase();

  container.innerHTML = `
    <!-- Hero card -->
    <div style="background:linear-gradient(135deg,#1e3a8a,#1a56db);border-radius:20px;padding:32px;color:#fff;display:flex;align-items:center;gap:24px;flex-wrap:wrap;margin-bottom:20px">
      <div style="width:88px;height:88px;border-radius:50%;background:rgba(255,255,255,0.2);border:3px solid rgba(255,255,255,0.5);display:flex;align-items:center;justify-content:center;font-size:36px;font-weight:800;flex-shrink:0">${initial}</div>
      <div>
        <div style="font-size:24px;font-weight:800;margin-bottom:4px">${displayName}</div>
        <div style="font-size:14px;opacity:0.8;margin-bottom:10px">${user.email || ''}</div>
        <span style="background:rgba(255,255,255,0.2);border-radius:20px;padding:4px 14px;font-size:12px;font-weight:700">${roleLabel}</span>
      </div>
    </div>

    <!-- Info card -->
    <div class="card" style="margin-bottom:20px">
      <div style="font-size:11px;font-weight:700;color:var(--gray-400);margin-bottom:16px;letter-spacing:1px">INFORMASI AKUN</div>
      ${infoRow('👤','Nama UMKM', displayName)}
      ${infoRow('📧','Email', user.email || '-')}
      ${infoRow('🎭','Peran', roleLabel, roleColor, roleBg)}
      ${infoRow('📍','Lokasi', user.lokasi || '-')}
      ${infoRow('🏭','Sektor', user.sektor || '-')}
      ${infoRow('💰','Omzet/Bulan', user.omzet ? 'IDR ' + Number(user.omzet).toLocaleString('id-ID') : '-')}
    </div>

    <!-- Quick actions -->
    <div class="card">
      <div style="font-size:11px;font-weight:700;color:var(--gray-400);margin-bottom:16px;letter-spacing:1px">AKSI CEPAT</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
        ${quickAction('📋','Isi Kuesioner','Tambah data kesehatan UMKM baru',"navigate('formdata')",'var(--primary-light)','var(--primary)')}
        ${quickAction('📊','Lihat Dashboard','Pantau perkembangan skor',"navigate('home')",'#d1fae5','var(--success)')}
        ${quickAction('🚪','Logout','Keluar dari sistem',"showModal('logoutModal')",'#fee2e2','var(--danger)')}
      </div>
    </div>
  `;
}

function infoRow(icon, label, value, valColor='var(--gray-800)', valBg='') {
  const valStyle = valColor !== 'var(--gray-800)'
    ? `background:${valBg};color:${valColor};padding:2px 10px;border-radius:20px;font-weight:700;font-size:12px`
    : 'color:var(--gray-800);font-weight:600;font-size:13px';
  return `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--gray-100)">
      <span style="font-size:13px;color:var(--gray-500);display:flex;align-items:center;gap:8px">${icon} ${label}</span>
      <span style="${valStyle}">${value}</span>
    </div>`;
}

function quickAction(icon, title, desc, onclick, bg, color) {
  return `
    <div onclick="${onclick}" style="background:${bg};border-radius:12px;padding:16px;cursor:pointer;transition:all 0.15s;border:1.5px solid transparent"
         onmouseover="this.style.borderColor='${color}';this.style.transform='translateY(-2px)'"
         onmouseout="this.style.borderColor='transparent';this.style.transform=''">
      <div style="font-size:28px;margin-bottom:8px">${icon}</div>
      <div style="font-size:13px;font-weight:700;color:${color};margin-bottom:4px">${title}</div>
      <div style="font-size:11px;color:var(--gray-500)">${desc}</div>
    </div>`;
}


// ═══════════════════════════════════════════════════════════════
//  DROPDOWN
// ═══════════════════════════════════════════════════════════════
function toggleDropdown(id) {
  document.querySelectorAll('.dropdown-menu').forEach(d => { if (d.id !== id) d.classList.remove('show'); });
  document.getElementById(id)?.classList.toggle('show');
}
document.addEventListener('click', e => {
  if (!e.target.closest('[onclick*="toggleDropdown"]') && !e.target.closest('.dropdown-menu'))
    document.querySelectorAll('.dropdown-menu').forEach(d => d.classList.remove('show'));
});

// ═══════════════════════════════════════════════════════════════
//  MODAL
// ═══════════════════════════════════════════════════════════════
function showModal(id) { document.getElementById(id)?.classList.add('show'); }
function hideModal(id) { document.getElementById(id)?.classList.remove('show'); }
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-backdrop')) e.target.classList.remove('show');
});

// ═══════════════════════════════════════════════════════════════
//  TOAST
// ═══════════════════════════════════════════════════════════════
let _toastTimer;
function showToast(msg, type='') {
  const t = document.getElementById('toast');
  if (!t) return;
  document.getElementById('toastMsg').textContent = msg;
  t.className = 'show ' + type;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { t.className=''; }, 3500);
}

// ═══════════════════════════════════════════════════════════════
//  CHART HELPERS
// ═══════════════════════════════════════════════════════════════
function destroyChart(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const c = Chart.getChart(el);
  if (c) c.destroy();
}

// ═══════════════════════════════════════════════════════════════
//  HOME CHARTS
// ═══════════════════════════════════════════════════════════════
function getSubmissionTrend(count) {
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des'];
  const now = new Date();
  const labels = [];
  const keys = [];
  const values = Array(count).fill(0);
  for (let offset = count - 1; offset >= 0; offset--) {
    const month = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    labels.push(monthNames[month.getMonth()]);
    keys.push(`${month.getFullYear()}-${month.getMonth()}`);
  }
  AppState.umkmData.forEach(record => {
    if (!record.tanggal) return;
    const date = new Date(String(record.tanggal).replace(' ', 'T'));
    if (Number.isNaN(date.getTime())) return;
    const index = keys.indexOf(`${date.getFullYear()}-${date.getMonth()}`);
    if (index >= 0) values[index]++;
  });
  return { labels, values };
}

function initHomeCharts() {
  AppState.chartsInit.home = true;
  const counts = getHealthCategoryCounts();
  destroyChart('donutChart');
  window.donutChartInst = new Chart(document.getElementById('donutChart'), {
    type: 'doughnut',
    data: {
      labels: ['Perlu Perhatian', 'Cukup', 'Baik', 'Sangat Baik'],
      datasets: [{ data: [counts['PERLU PERHATIAN'], counts.CUKUP, counts.BAIK, counts['SANGAT BAIK']], backgroundColor: ['#b88a42', '#9aa8ad', '#54758a', '#263d50'], borderWidth: 3, borderColor: '#fff', hoverOffset: 8 }]
    },
    options: { cutout: '72%', plugins: { legend: { display: false } } }
  });

  destroyChart('barChart');
  window.barChartInst = new Chart(document.getElementById('barChart'), {
    type: 'bar',
    data: {
      labels: ['Budaya', 'Operasional', 'Lingkungan Kerja', 'Kelembagaan', 'Kepemimpinan', 'Eksternal'],
      datasets: [{ data: [getFactorAverage('ov'), getFactorAverage('ops'), getFactorAverage('weq'), getFactorAverage('ins'), getFactorAverage('ldi'), getFactorAverage('ect')], backgroundColor: '#54758a', borderRadius: 8, borderSkipped: false }]
    },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, max: 5, grid: { color: '#e5e6e3' }, ticks: { stepSize: 1 } }, x: { grid: { display: false } } } }
  });

  const trend = getSubmissionTrend(5);
  destroyChart('trendMini');
  new Chart(document.getElementById('trendMini'), {
    type: 'line',
    data: { labels: trend.labels, datasets: [{ data: trend.values, borderColor: 'rgba(255,255,255,0.9)', borderWidth: 2, pointRadius: 2, pointBackgroundColor: '#fff', fill: true, backgroundColor: 'rgba(255,255,255,0.1)', tension: 0.35 }] },
    options: { plugins: { legend: { display: false } }, scales: { y: { display: false }, x: { display: false } } }
  });
}

function switchChart() {
  showToast('Grafik menampilkan ringkasan seluruh asesmen yang tersimpan.');
}

function initSpiderChart() {
  AppState.chartsInit.factor = true;
  const canvas = document.getElementById('spiderChart');
  if (!canvas) return;

  destroyChart('spiderChart');
  window.spiderChartInst = new Chart(canvas, {
    type: 'radar',
    data: {
      labels: ['INS', 'LDI', 'WEQ', 'OV', 'OPS', 'ECT'],
      datasets: [{
        data: [
          getFactorAverage('ins'), getFactorAverage('ldi'), getFactorAverage('weq'),
          getFactorAverage('ov'), getFactorAverage('ops'), getFactorAverage('ect')
        ],
        backgroundColor: 'rgba(84, 117, 138, 0.18)',
        borderColor: '#54758a',
        pointBackgroundColor: '#b88a42',
        pointBorderColor: '#fff',
        pointHoverBackgroundColor: '#fff',
        pointHoverBorderColor: '#54758a'
      }]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { r: { beginAtZero: true, min: 0, max: 5, ticks: { stepSize: 1 } } }
    }
  });
}

function initDistCharts() {
  AppState.chartsInit.distribution = true;
  destroyChart('histChart');

  const raw = updateDistributionUI() || [0,0,0,0,0,0,0];

  const sorted = [...raw].sort((a, b) => b - a);
  const top1 = sorted[0], top2 = sorted[1];

  const peakPlugin = {
    id: 'peaks',
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      const dataArr = chart.getDatasetMeta(0).data;
      const vals = chart.data.datasets[0].data;
      const s = [...vals].sort((a,b)=>b-a);
      const t1 = s[0], t2 = s[1];
      dataArr.forEach((bar, i) => {
        if (vals[i] === t1 || vals[i] === t2) {
          ctx.save();
          ctx.fillStyle = '#1e3a8a';
          ctx.font = 'bold 11px Plus Jakarta Sans, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('Peak', bar.x, bar.y - 8);
          ctx.restore();
        }
      });
    }
  };

  window.histChartInst = new Chart(document.getElementById('histChart'), {
    type: 'bar',
    data: {
      labels: ['0.0','0.5','1.0','1.5','2.0','2.5','3.0','3.5','4.0','4.5','5.0'],
      datasets: [{
        data: raw,
        backgroundColor: raw.map(v => v===top1?'#1a56db': v===top2?'#3b82f6':'#93c5fd'),
        borderRadius: 6, borderSkipped: false
      }]
    },
    plugins: [peakPlugin],
    options: {
      plugins: { legend:{display:false} },
      scales: { y:{ beginAtZero:true, grid:{color:'#f3f4f6'} }, x:{ grid:{display:false}, title:{display:true,text:'Skor (0.0 – 5.0)'} } },
      animation: { duration:1000, easing:'easeOutBounce', delay:(ctx)=>ctx.dataIndex*60 }
    }
  });
}

function initCompCharts() {
  AppState.chartsInit.comparison = true;
  destroyChart('trendChart');
  const trend = getSubmissionTrend(4);
  new Chart(document.getElementById('trendChart'), {
    type: 'bar',
    data: { labels: trend.labels, datasets: [{ data: trend.values, backgroundColor: '#54758a', borderRadius: 6, borderSkipped: false }] },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { display: false } }, x: { grid: { display: false } } } }
  });
}
function filterPipa(btn, type) {
  document.querySelectorAll('.pipa-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.pipa-card').forEach(card => {
    card.style.display = type === 'all' || card.dataset.priority === type ? 'block' : 'none';
  });
}

// ═══════════════════════════════════════════════════════════════
//  EXPORT OUTLIERS
// ═══════════════════════════════════════════════════════════════
function exportOutlierData() {
  if (!AppState.outliers || AppState.outliers.length === 0) {
    showToast('Tidak ada data outlier untuk diekspor.', 'warning');
    return;
  }

  showToast('Menyiapkan file CSV data anomali...', 'success');

  // CSV Header
  let csvContent = "data:text/csv;charset=utf-8,";
  csvContent += "ID UMKM,Z-Score Deviation,Tipe Anomali\n";

  // Add rows
  AppState.outliers.forEach(o => {
    const tipe = o.z < 0 ? "Anomali Bawah (Negatif)" : "Anomali Atas (Positif)";
    const id = "SH-" + o.id;
    csvContent += `${id},${o.z.toFixed(3)},${tipe}\n`;
  });

  // Trigger download
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  const dateStr = new Date().toISOString().split('T')[0];
  link.setAttribute("download", `outlier_anomalies_${dateStr}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ═══════════════════════════════════════════════════════════════
//  INIT DASHBOARD
// ═══════════════════════════════════════════════════════════════
async function initDashboard() {
  AppState.chartsInit = {};
  if (window.innerWidth < 900) closeSidebar();
  await loadUmkmData();
  updateUserDisplay();
  navigate('home');
}
