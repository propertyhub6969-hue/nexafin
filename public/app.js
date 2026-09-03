'use strict';
/* ============ Nexafin - Aplikasi Frontend ============ */

const State = {
  user: null,
  company: null,
  view: 'dashboard',
  accounts: [],
  viewCompanyId: null,     // admin melihat data perusahaan lain (baca-saja) — legacy
  viewCompanyName: null,
  books: [],               // daftar buku akuntansi (firma + tiap klien)
  bookId: null,            // buku yang sedang dibuka (companyId firma atau clientId)
  periode: { bulan: ymNow(), asOf: todayStr() }
};

/* ---------- util tanggal ---------- */
function todayStr(){ const d=new Date(); return d.toISOString().slice(0,10); }
function ymNow(){ return new Date().toISOString().slice(0,7); }
function monthRange(ym){ // 'YYYY-MM' -> {from,to}
  const [y,m]=ym.split('-').map(Number);
  const from=`${ym}-01`;
  const last=new Date(y,m,0).getDate();
  const to=`${ym}-${String(last).padStart(2,'0')}`;
  return {from,to};
}
function prevMonth(ym){ const [y,m]=ym.split('-').map(Number); const d=new Date(y,m-2,1); return d.toISOString().slice(0,7); }
function namaBulan(ym){ const [y,m]=ym.split('-').map(Number); const B=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']; return `${B[m-1]} ${y}`; }
function waktuLalu(iso){ if(!iso)return''; const s=Math.floor((Date.now()-Date.parse(iso))/1000);
  if(s<60)return'baru saja'; const m=Math.floor(s/60); if(m<60)return m+' menit lalu';
  const h=Math.floor(m/60); if(h<24)return h+' jam lalu'; const d=Math.floor(h/24); if(d<7)return d+' hari lalu'; return iso.slice(0,10); }

/* ---------- format angka ---------- */
function fmtNum(n){
  n=Number(n)||0; const neg=n<0; n=Math.abs(Math.round(n));
  let s=n.toLocaleString('id-ID');
  return neg?`(${s})`:s;
}
function fmtRp(n){ return 'Rp '+fmtNum(n); }
function clsNum(n){ return (Number(n)<0)?'neg':''; }

/* ---------- API ---------- */
async function api(method, path, body){
  const opt={ method, headers:{}, credentials:'same-origin' };
  if(body){ opt.headers['Content-Type']='application/json'; opt.body=JSON.stringify(body); }
  const r=await fetch(path,opt);
  let data={}; try{ data=await r.json(); }catch(e){}
  if(!r.ok) throw new Error(data.error||('Kesalahan '+r.status));
  return data;
}
function cid(){ return State.viewCompanyId || (State.user&&State.user.companyId); }
function viewingOther(){ return !!State.viewCompanyId; }
function firmaId(){ return State.user && State.user.companyId; }
function curBook(){ return State.bookId || firmaId(); }
function curBookInfo(){ return (State.books||[]).find(b=>b.id===curBook()) || null; }
function isFirmaBook(){ return curBook()===firmaId(); }
// Buku read-only untuk user ini: sedang "lihat data orang lain", ATAU buku klien yang
// tak boleh ditulis (mis. staf perpajakan yang hanya punya tugas SPT — bukan pembukuan).
function bookCanWrite(){ const b=curBookInfo(); return !b || b.canWrite!==false; }
function bookRO(){ return viewingOther() || !bookCanWrite(); }
// path buku: /api/books/<bookId><sub>?query
function burl(sub, params){
  const p=Object.assign({},params||{});
  const s=Object.entries(p).filter(([k,v])=>v!==undefined&&v!==null&&v!=='').map(([k,v])=>`${k}=${encodeURIComponent(v)}`).join('&');
  return '/api/books/'+encodeURIComponent(curBook())+sub+(s?('?'+s):'');
}
function q(params){ // querystring untuk endpoint non-buku (impor/aturan); sisipkan bookId bila bukan buku firma
  const p=Object.assign({},params);
  if(State.viewCompanyId) p.companyId=State.viewCompanyId;
  if(curBook() && curBook()!==firmaId()) p.bookId=curBook();
  const s=Object.entries(p).filter(([k,v])=>v!==undefined&&v!==null&&v!=='').map(([k,v])=>`${k}=${encodeURIComponent(v)}`).join('&');
  return s?('?'+s):'';
}
// sisipkan bookId ke body POST endpoint non-buku (impor/klasifikasi/aturan)
function withBook(body){ const b=Object.assign({},body||{}); if(curBook()&&curBook()!==firmaId()) b.bookId=curBook(); return b; }
async function loadBooks(){
  try{ const r=await api('GET','/api/books'); State.books=r.books||[]; State.firmaId=r.firmaId;
    // pastikan bookId valid utk peran ini; kalau tidak, pilih buku pertama yang tersedia
    if(!State.books.some(b=>b.id===curBook())) State.bookId=State.books.length?State.books[0].id:firmaId();
  }catch(e){ State.books=[]; State.bookId=firmaId(); }
}

/* ---------- render root ---------- */
const root=()=>document.getElementById('root');
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

/* ============ AUTH ============ */
function renderAuth(mode){
  mode=mode||'login';
  root().innerHTML=`
  <div class="auth-wrap">
    <div class="auth-card">
      <div class="brand-logo"><svg width="30" height="30" viewBox="0 0 48 48" fill="none" style="display:block"><g stroke="#ffffff" stroke-width="2.6" stroke-linecap="round"><line x1="24" y1="24" x2="24" y2="10"/><line x1="24" y1="24" x2="36" y2="17"/><line x1="24" y1="24" x2="36" y2="31"/><line x1="24" y1="24" x2="24" y2="38"/><line x1="24" y1="24" x2="12" y2="31"/><line x1="24" y1="24" x2="12" y2="17"/></g><circle cx="24" cy="10" r="2.8" fill="#fff"/><circle cx="36" cy="17" r="2.8" fill="#34d99f"/><circle cx="36" cy="31" r="2.8" fill="#fff"/><circle cx="24" cy="38" r="2.8" fill="#34d99f"/><circle cx="12" cy="31" r="2.8" fill="#fff"/><circle cx="12" cy="17" r="2.8" fill="#fff"/><circle cx="24" cy="24" r="6.5" fill="#34d99f"/></svg></div>
      <h1>Nexa<span style="color:var(--aksen)">fin</span></h1>
      <p class="sub">Akuntansi · Pajak · Konsultan — SAK/PSAK, Rupiah</p>
      <div class="auth-tabs">
        <button data-m="login" class="${mode==='login'?'aktif':''}">Masuk</button>
        <button data-m="register" class="${mode==='register'?'aktif':''}">Daftar Baru</button>
      </div>
      <div id="authMsg"></div>
      <form id="authForm">
        ${mode==='register'?`
        <div class="field"><label>Nama Lengkap</label><input name="name" required placeholder="Nama Anda"></div>
        <div class="field"><label>Nama Perusahaan / Usaha</label><input name="companyName" placeholder="mis. Toko Maju Jaya"></div>`:''}
        <div class="field"><label>Email</label><input name="email" type="email" required placeholder="email@contoh.com"></div>
        <div class="field"><label>Kata Sandi</label><input name="password" type="password" required placeholder="${mode==='register'?'Minimal 6 karakter':'Kata sandi'}"></div>
        <button class="btn blok ${mode==='register'?'hijau':''}" type="submit">${mode==='register'?'Buat Akun':'Masuk'}</button>
      </form>
      ${mode==='register'?'<p class="muted mt" style="text-align:center">Akun pertama yang mendaftar otomatis menjadi <b>Admin/Pemilik</b>.</p>':''}
    </div>
  </div>`;
  root().querySelectorAll('.auth-tabs button').forEach(b=>b.onclick=()=>renderAuth(b.dataset.m));
  document.getElementById('authForm').onsubmit=async(e)=>{
    e.preventDefault();
    const fd=Object.fromEntries(new FormData(e.target).entries());
    const btn=e.target.querySelector('button[type=submit]'); btn.disabled=true;
    try{
      const path=mode==='register'?'/api/register':'/api/login';
      const res=await api('POST',path,fd);
      State.user=res.user;
      await afterLogin();
    }catch(err){
      document.getElementById('authMsg').innerHTML=`<div class="pesan err">${esc(err.message)}</div>`;
      btn.disabled=false;
    }
  };
}

async function afterLogin(){
  const me=await api('GET','/api/me');
  State.user=me.user; State.company=me.company;
  State.viewCompanyId=null; State.viewCompanyName=null;
  State.view='dashboard';
  State.bookId=null;
  await loadBooks();
  await loadAccounts();
  await loadPerms();
  renderApp();
  cekPengingatLogin(true); // popup tenggat SPT setiap kali login
}
async function loadPerms(){ try{ State.meta=await api('GET','/api/consult/meta'); State.user.perms=State.meta.perms||{}; }catch(e){ State.user.perms=State.user.perms||{}; } }

/* ---- Popup pengingat tenggat SPT saat login ----
 * force=true (login) selalu tampil; force=false (buka ulang app dgn sesi lama)
 * dibatasi 1x per 6 jam via localStorage agar tidak mengganggu. */
async function cekPengingatLogin(force){
  try{
    if(!State.user || State.user.role==='klien-staff') return;
    if(!force){
      try{ const t=+localStorage.getItem('nx-remind-at')||0; if(Date.now()-t < 6*3600*1000) return; }catch(e){}
    }
    const r=await api('GET','/api/consult/reminders?days=7');
    const rows=[...(r.overdue||[]),...(r.soon||[])];
    if(!rows.length) return;
    try{ localStorage.setItem('nx-remind-at',String(Date.now())); }catch(e){}
    const label=(d)=> d<0?`<span style="color:var(--merah);font-weight:700">terlambat ${-d} hari</span>`
      : d===0?'<span style="color:var(--merah);font-weight:700">HARI INI</span>'
      : `<span style="color:#b9791a;font-weight:700">${d} hari lagi</span>`;
    const item=(t)=>`<div style="display:flex;gap:10px;align-items:center;padding:9px 2px;border-bottom:1px dashed var(--garis)">
        <span style="font-size:17px">${t.daysLeft<0?'🔴':'🟠'}</span>
        <div style="flex:1;min-width:0"><b>${esc(t.jenis)}</b> · ${esc(t.periode||'')}<div class="muted" style="font-size:12px">${esc(t.clientName)}${t.assigneeName?' · '+esc(t.assigneeName):''}</div></div>
        <div style="text-align:right;font-size:12.5px">${esc(t.deadlineEfektif||t.deadline)}<br>${label(t.daysLeft)}</div>
      </div>`;
    const wrap=document.createElement('div'); wrap.className='modal-bg';
    wrap.innerHTML=`<div class="modal" style="max-width:520px"><div class="hd"><h3>🔔 Pengingat Tenggat SPT</h3><button class="x">&times;</button></div>
      <div class="bd">
        <p class="muted" style="margin-top:0">${r.counts.overdue?`<b style="color:var(--merah)">${r.counts.overdue} terlambat</b> · `:''}${r.counts.soon||0} jatuh tempo ≤ 7 hari</p>
        <div style="max-height:46vh;overflow:auto">${rows.slice(0,12).map(item).join('')}${rows.length>12?`<p class="muted" style="text-align:center">+ ${rows.length-12} lainnya…</p>`:''}</div>
        <div class="flex mt"><div class="spacer"></div><button class="btn abu" id="ngTutup">Tutup</button><button class="btn hijau" id="ngBuka">Buka Pengingat SPT</button></div>
      </div></div>`;
    document.body.appendChild(wrap);
    const close=()=>wrap.remove();
    wrap.querySelector('.x').onclick=close; wrap.querySelector('#ngTutup').onclick=close;
    wrap.onclick=(e)=>{if(e.target===wrap)close();};
    wrap.querySelector('#ngBuka').onclick=()=>{ close(); State.view='pengingat'; renderApp(); };
  }catch(e){ /* diam: pengingat tidak boleh mengganggu login */ }
}
async function loadAccounts(){
  try{ const r=await api('GET',burl('/accounts')); State.accounts=r.accounts||[]; }
  catch(e){ State.accounts=[]; }
}

/* ============ SHELL ============ */
const MENU=[
  {grp:'Utama'},
  {v:'dashboard',t:'Dashboard',e:'📊'},
  {v:'jurnal',t:'Jurnal Umum',e:'📝'},
  {v:'bukubesar',t:'Buku Besar',e:'📚'},
  {v:'neracasaldo',t:'Neraca Saldo',e:'⚖️'},
  {v:'aset',t:'Aset Tetap',e:'🏗️'},
  {grp:'Laporan Keuangan'},
  {v:'labarugi',t:'Laba Rugi',e:'📈'},
  {v:'neraca',t:'Neraca',e:'🏦'},
  {v:'ekuitas',t:'Perubahan Ekuitas',e:'📶'},
  {v:'aruskas',t:'Arus Kas',e:'💵'},
  {v:'calk',t:'CALK (Catatan)',e:'📒'},
  {grp:'AI & Otomasi'},
  {v:'impor',t:'Impor & AI',e:'📥'},
  {v:'insight',t:'Insight AI',e:'💡'},
  {v:'suratdjp',t:'Draf Surat DJP',e:'✉️'},
  {grp:'Analisis'},
  {v:'anggaran',t:'Anggaran',e:'🎯'},
  {v:'varians',t:'Analisis Varians',e:'🔍'},
  {v:'rekonsiliasi',t:'Rekonsiliasi Bank',e:'🔗'},
  {grp:'Pengaturan'},
  {v:'akun',t:'Bagan Akun',e:'🗂️'},
];
// View akuntansi yang terikat pada satu buku (klien/firma)
const BOOK_VIEWS=new Set(['dashboard','jurnal','bukubesar','neracasaldo','labarugi','neraca','ekuitas','aruskas','calk','impor','insight','suratdjp','anggaran','varians','rekonsiliasi','aset','akun']);
function bookSwitcherHTML(){
  if(!BOOK_VIEWS.has(State.view)) return '';
  if(!State.books||State.books.length<2) return '';   // sembunyikan bila hanya satu buku (mis. staf klien)
  const opts=State.books.map(b=>`<option value="${b.id}" ${b.id===curBook()?'selected':''}>${b.type==='firma'?'🏛️ ':'🏢 '}${esc(b.name)}${b.status==='nonaktif'?' (nonaktif)':''}</option>`).join('');
  return `<div class="book-switch" title="Pilih buku klien"><span class="bs-ic">📒</span><select id="bookSel">${opts}</select></div>`;
}
function bookBanner(){
  const b=curBookInfo(); if(!b) return '';
  const label=b.type==='firma'?`🏛️ Buku firma — <b>${esc(b.name)}</b>`:`🏢 Buku klien — <b>${esc(b.name)}</b>`;
  return `<div class="book-banner">${label}<span class="muted"> · laporan &amp; jurnal di bawah ini khusus buku ini</span></div>`;
}
function renderApp(){
  const u=State.user;
  const isAdmin=u.role==='admin';
  const klienStaff=u.role==='klien-staff';
  let menu;
  if(klienStaff){
    // Staf perusahaan klien: hanya buku kliennya (akuntansi), tanpa modul konsultan/firma.
    menu=[
      {grp:'Pembukuan'},
      {v:'dashboard',t:'Dashboard',e:'📊'},
      {v:'jurnal',t:'Jurnal Umum',e:'📝'},
      {v:'bukubesar',t:'Buku Besar',e:'📚'},
      {v:'neracasaldo',t:'Neraca Saldo',e:'⚖️'},
      {grp:'Laporan'},
      {v:'labarugi',t:'Laba Rugi',e:'📈'},
      {v:'neraca',t:'Neraca',e:'🏦'},
      {v:'ekuitas',t:'Perubahan Ekuitas',e:'📶'},
      {v:'aruskas',t:'Arus Kas',e:'💵'},
      {grp:'Input'},
      {v:'impor',t:'Impor & AI',e:'📥'},
      {grp:'Pengaturan'},
      {v:'pengaturan',t:'Profil',e:'⚙️'}
    ];
  } else {
    menu=MENU.slice();
    menu.push({grp:'Konsultan Pajak'});
    menu.push({v:'konsultan',t:'Dashboard Konsultan',e:'🧭'});
    menu.push({v:'kotakmasuk',t:'Kotak Masuk Jurnal',e:'📨'});
    menu.push({v:'pengingat',t:'Pengingat SPT',e:'🔔'});
    menu.push({v:'klien',t:'Klien',e:'🏢'});
    if(u.role==='admin'||u.role==='user'||(State.meta&&State.meta.isPJ)) menu.push({v:'penugasan',t:'Penugasan',e:'🧩'});
    menu.push({v:'pekerjaan',t:'Pekerjaan / SPT',e:'✅'});
    menu.push({v:'arsip',t:'Arsip Dokumen',e:'🗄️'});
    const isAdminRole=u.role==='admin'||u.role==='user';
    const canInv=isAdminRole||(u.perms&&u.perms.invoice);
    if(canInv) menu.push({v:'invoice',t:'Invoice Klien',e:'🧾'});
    if(isAdminRole||(State.meta&&State.meta.isPJ)) menu.push({v:'tim',t:'Tim / Staff',e:'👥'});
    if(isAdmin){ menu.push({grp:'Pengaturan Lanjut'}); menu.push({v:'admin',t:'Kelola Pengguna',e:'👤'}); menu.push({v:'libur',t:'Kelola Libur',e:'📅'}); menu.push({v:'setelanai',t:'Setelan AI',e:'🤖'}); }
    menu.push({v:'pengaturan',t:'Profil & Perusahaan',e:'⚙️'});
  }
  // jaga: bila view aktif tak ada di menu (mis. peran berganti), kembali ke dashboard
  if(!menu.some(m=>m.v===State.view)) State.view='dashboard';

  // Susun menu jadi seksi (accordion): tiap grup punya daftar item yang bisa dibuka/tutup
  const seksi=[]; let cur=null;
  menu.forEach(m=>{ if(m.grp){ cur={grp:m.grp, items:[]}; seksi.push(cur); } else if(cur){ cur.items.push(m); } });
  const grpAktif=(seksi.find(s=>s.items.some(it=>it.v===State.view))||{}).grp;
  State.navOpen=State.navOpen||{};
  if(grpAktif) State.navOpen[grpAktif]=true;   // grup berisi menu aktif selalu terbuka
  const nav=seksi.map(s=>{
    const open=State.navOpen[s.grp]!==false && (State.navOpen[s.grp]||s.grp===grpAktif);
    const items=s.items.map(m=>`<a data-v="${m.v}" class="${State.view===m.v?'aktif':''}"><span class="em">${m.e}</span><span class="t">${m.t}</span></a>`).join('');
    return `<div class="nav-sec">
      <button class="grp grp-btn ${open?'buka':''}" data-grp="${esc(s.grp)}"><span>${esc(s.grp)}</span><span class="grp-caret">▾</span></button>
      <div class="nav-body" ${open?'':'hidden'}>${items}</div></div>`;
  }).join('');

  const title=(menu.find(m=>m.v===State.view)||{}).t||'Dashboard';
  const roBook=!viewingOther()&&BOOK_VIEWS.has(State.view)&&curBookInfo()&&curBookInfo().canWrite===false;
  const banner=viewingOther()?`<div class="pesan ok" style="margin:0 26px;margin-top:14px">👁️ Melihat data: <b>${esc(State.viewCompanyName)}</b> (mode baca-saja). <a href="#" id="kembaliData">Kembali ke data saya</a></div>`
    :(roBook?`<div class="pesan ok" style="margin:0 26px;margin-top:14px">👁️ Buku <b>${esc(curBookInfo().name)}</b> — <b>mode lihat</b>. Anda ditugaskan bagian perpajakan (SPT) untuk klien ini, bukan pembukuan; perubahan buku hanya oleh pelaksana pembukuan / penanggung jawab (PJ).</div>`:'');

  root().innerHTML=`
  <div class="app">
    <aside class="sidebar">
      <div class="logo"><div class="ic"><svg width="22" height="22" viewBox="0 0 48 48" fill="none" style="display:block"><g stroke="#0f2a47" stroke-width="2.8" stroke-linecap="round"><line x1="24" y1="24" x2="24" y2="10"/><line x1="24" y1="24" x2="36" y2="17"/><line x1="24" y1="24" x2="36" y2="31"/><line x1="24" y1="24" x2="24" y2="38"/><line x1="24" y1="24" x2="12" y2="31"/><line x1="24" y1="24" x2="12" y2="17"/></g><circle cx="24" cy="10" r="2.8" fill="#0f2a47"/><circle cx="36" cy="17" r="2.8" fill="#0a8a61"/><circle cx="36" cy="31" r="2.8" fill="#0f2a47"/><circle cx="24" cy="38" r="2.8" fill="#0a8a61"/><circle cx="12" cy="31" r="2.8" fill="#0f2a47"/><circle cx="12" cy="17" r="2.8" fill="#0f2a47"/><circle cx="24" cy="24" r="6.5" fill="#0fb37f"/></svg></div><b>Nexa<span style="color:#34d99f">fin</span></b></div>
      <nav class="nav">${nav}</nav>
      <div class="foot">${esc(u.name)}<br>${esc(State.company?State.company.name:'')}</div>
    </aside>
    <div class="main">
      <div class="topbar">
        <h2>${title}</h2>
        <div class="kanan">
          ${bookSwitcherHTML()}
          <a href="#" id="bellBtn" title="Pengingat tenggat SPT" style="position:relative;text-decoration:none;font-size:19px;line-height:1">🔔<span id="bellCount" style="position:absolute;top:-7px;right:-9px;background:var(--merah);color:#fff;border-radius:10px;font-size:10px;font-weight:700;padding:1px 5px;display:none"></span></a>
          <span class="badge ${isAdmin?'admin':''}">${u.role==='staff'?'Anggota':u.role==='klien-staff'?'Staf Klien':(isAdmin?'Admin/Pemilik':'Pengguna')}</span>
          <div class="avatar">${esc((u.name||'?').slice(0,1).toUpperCase())}</div>
          <button class="btn abu kecil" id="btnLogout">Keluar</button>
        </div>
      </div>
      ${banner}
      <div class="content" id="content"><div class="loader">Memuat…</div></div>
    </div>
  </div>`;

  root().querySelectorAll('.nav a').forEach(a=>a.onclick=(e)=>{e.preventDefault();State.view=a.dataset.v;renderApp();});
  root().querySelectorAll('.grp-btn').forEach(b=>b.onclick=()=>{
    const g=b.dataset.grp; const sec=b.parentElement; const body=sec.querySelector('.nav-body');
    const buka=body.hidden; body.hidden=!buka; b.classList.toggle('buka',buka); State.navOpen[g]=buka;
  });
  const bookSel=document.getElementById('bookSel');
  if(bookSel) bookSel.onchange=async(e)=>{ State.bookId=e.target.value; await loadAccounts(); renderApp(); };
  document.getElementById('btnLogout').onclick=async()=>{ await api('POST','/api/logout'); State.user=null; renderAuth('login'); };
  const bell=document.getElementById('bellBtn');
  if(bell){
    bell.onclick=(e)=>{e.preventDefault();State.view='pengingat';renderApp();};
    api('GET','/api/consult/reminders?days=14').then(r=>{
      const n=(r.counts.overdue||0)+(r.counts.soon||0); const el=document.getElementById('bellCount');
      if(el&&n>0){ el.textContent=n; el.style.display='inline-block'; el.title=`${r.counts.overdue} terlambat, ${r.counts.soon} ≤7 hari`; }
    }).catch(()=>{});
  }
  const kb=document.getElementById('kembaliData'); if(kb) kb.onclick=(e)=>{e.preventDefault();State.viewCompanyId=null;State.viewCompanyName=null;loadAccounts().then(renderApp);};

  routeView();
}

function content(){ return document.getElementById('content'); }
async function routeView(){
  try{
    const map={dashboard:viewDashboard,jurnal:viewJurnal,bukubesar:viewBukuBesar,neracasaldo:viewNeracaSaldo,
      labarugi:viewLabaRugi,neraca:viewNeraca,ekuitas:viewPerubahanEkuitas,aruskas:viewArusKas,calk:viewCALK,anggaran:viewAnggaran,varians:viewVarians,
      rekonsiliasi:viewRekonsiliasi,aset:viewAsetTetap,akun:viewAkun,admin:viewAdmin,pengaturan:viewPengaturan,
      impor:viewImpor,insight:viewInsight,suratdjp:viewSuratDJP,setelanai:viewSetelanAI,libur:viewLibur,
      konsultan:viewKonsultan,klien:viewKlien,penugasan:viewPenugasan,pekerjaan:viewPekerjaan,invoice:viewInvoiceKlien,arsip:viewArsip,tim:viewTim,pengingat:viewPengingat,kotakmasuk:viewKotakMasuk};
    const fn=map[State.view]||viewDashboard;
    await fn();
  }catch(err){
    content().innerHTML=`<div class="pesan err">${esc(err.message)}</div>`;
  }
}

/* ============ DASHBOARD ============ */
async function viewDashboard(){
  const {from,to}=monthRange(State.periode.bulan);
  const [is,bs,cf]=await Promise.all([
    api('GET',burl('/reports/income-statement',{from,to})),
    api('GET',burl('/reports/balance-sheet',{asOf:to})),
    api('GET',burl('/reports/cash-flow',{from,to}))
  ]);
  const cur=is.current;
  content().innerHTML=`
    ${bookBanner()}
    <div class="toolbar">
      <div class="field"><label>Periode Bulan</label><input type="month" id="dashBulan" value="${State.periode.bulan}"></div>
    </div>
    <div class="grid k4">
      <div class="stat"><div class="lbl">Pendapatan Usaha</div><div class="val hijau">${fmtRp(cur.pendapatanUsaha)}</div><div class="sub">${namaBulan(State.periode.bulan)}</div></div>
      <div class="stat"><div class="lbl">Laba Bruto</div><div class="val">${fmtRp(cur.labaBruto)}</div><div class="sub">Margin ${cur.pendapatanUsaha?((cur.labaBruto/cur.pendapatanUsaha)*100).toFixed(1):'0'}%</div></div>
      <div class="stat"><div class="lbl">Laba Bersih</div><div class="val ${cur.labaBersih>=0?'hijau':'merah'}">${fmtRp(cur.labaBersih)}</div><div class="sub">Margin ${cur.pendapatanUsaha?((cur.labaBersih/cur.pendapatanUsaha)*100).toFixed(1):'0'}%</div></div>
      <div class="stat"><div class="lbl">Kas Akhir</div><div class="val">${fmtRp(cf.kasAkhir)}</div><div class="sub">Perubahan ${fmtRp(cf.kenaikanBersih)}</div></div>
    </div>
    <div class="grid k3 mt">
      <div class="stat"><div class="lbl">Total Aset</div><div class="val">${fmtRp(bs.current.totalAset)}</div></div>
      <div class="stat"><div class="lbl">Total Liabilitas</div><div class="val">${fmtRp(bs.current.totalLiabilitas)}</div></div>
      <div class="stat"><div class="lbl">Total Ekuitas</div><div class="val">${fmtRp(bs.current.totalEkuitas)}</div></div>
    </div>
    <div class="card mt"><div class="hd"><h3>Ringkasan Laba Rugi — ${namaBulan(State.periode.bulan)}</h3></div>
      <div class="bd nopad"><div class="tbl-wrap"><table class="tbl">
        <tbody>
        <tr><td>Pendapatan Usaha</td><td class="num">${fmtNum(cur.pendapatanUsaha)}</td></tr>
        <tr><td>Beban Pokok Penjualan</td><td class="num">${fmtNum(cur.bpp)}</td></tr>
        <tr class="total"><td>Laba Bruto</td><td class="num">${fmtNum(cur.labaBruto)}</td></tr>
        <tr><td>Beban Operasional</td><td class="num">${fmtNum(cur.bebanOperasional)}</td></tr>
        <tr class="total"><td>Laba Usaha</td><td class="num">${fmtNum(cur.labaUsaha)}</td></tr>
        <tr><td>Pendapatan/Beban Lain-lain (neto)</td><td class="num">${fmtNum(cur.pendapatanLain-cur.bebanLain)}</td></tr>
        <tr><td>Beban Pajak</td><td class="num">${fmtNum(cur.bebanPajak)}</td></tr>
        <tr class="total"><td>Laba Bersih</td><td class="num">${fmtNum(cur.labaBersih)}</td></tr>
        </tbody>
      </table></div></div>
    </div>`;
  document.getElementById('dashBulan').onchange=(e)=>{State.periode.bulan=e.target.value;viewDashboard();};
}

/* ============ BAGAN AKUN ============ */
async function viewAkun(){
  await loadAccounts();
  const rows=State.accounts.map(a=>`
    <tr>
      <td class="kode">${esc(a.code)}</td>
      <td>${esc(a.name)}</td>
      <td>${esc(a.category)}</td>
      <td>${esc(a.subcategory||'')}</td>
      <td>${a.normal==='D'?'Debit':'Kredit'}</td>
      <td>${a.isCash?'<span class="chip aset">Kas</span>':''}</td>
      <td class="right">${bookRO()?'':`<button class="btn abu kecil" data-edit="${a.id}">Ubah</button> <button class="btn abu kecil" data-del="${a.id}">Hapus</button>`}</td>
    </tr>`).join('');
  content().innerHTML=`
    ${bookBanner()}
    ${migrasiCard()}
    <div class="card"><div class="hd"><h3>Bagan Akun (Chart of Accounts)</h3>
      ${bookRO()?'':'<button class="btn hijau kecil" id="tambahAkun">+ Tambah Akun</button>'}</div>
      <div class="bd nopad"><div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Kode</th><th>Nama Akun</th><th>Kategori</th><th>Kelompok</th><th>Saldo Normal</th><th>Kas</th><th></th></tr></thead>
        <tbody>${rows}</tbody></table></div></div></div>`;
  if(!bookRO()){
    document.getElementById('tambahAkun').onclick=()=>modalAkun(null);
    content().querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>modalAkun(State.accounts.find(a=>a.id===b.dataset.edit)));
    content().querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{
      if(!confirm('Hapus akun ini?'))return;
      try{ await api('DELETE',burl('/accounts/'+b.dataset.del)); viewAkun(); }catch(e){ alert(e.message); }
    });
  }
  wireMigrasi();
}
// Kartu pemindahan buku firma (data lama) ke sebuah klien — hanya admin, buku firma, ada akun.
function migrasiCard(){
  const isAdmin=State.user.role==='admin'||State.user.role==='user';
  if(!isAdmin||!isFirmaBook()||!State.accounts.length) return '';
  const klienBooks=(State.books||[]).filter(b=>b.type==='klien');
  const opts=klienBooks.map(b=>`<option value="${b.id}">${esc(b.name)}</option>`).join('');
  const pilih=klienBooks.length?`<div class="flex" style="align-items:flex-end;gap:10px">
      <div class="field" style="flex:1;margin:0"><label>Pindahkan seluruh isi buku firma ini ke klien:</label>
        <select id="migKlien"><option value="">— pilih klien —</option>${opts}</select></div>
      <button class="btn hijau" id="migJalan">Pindahkan</button></div>`
    :`<p class="muted">Belum ada klien. Tambahkan klien dulu di menu Klien, lalu pindahkan buku ini ke klien tersebut.</p>`;
  return `<div class="card" style="border-left:4px solid var(--aksen)"><div class="hd"><h3>📦 Jadikan buku ini milik salah satu klien</h3></div>
    <div class="bd"><div id="migMsg"></div>
      <p class="muted" style="margin-top:0">Buku firma ini berisi <b>${State.accounts.length}</b> akun beserta jurnal/laporannya. Anda dapat memindahkan semuanya menjadi buku salah satu klien (sekali jalan; buku klien tujuan harus masih kosong).</p>
      ${pilih}</div></div>`;
}
function wireMigrasi(){
  const btn=document.getElementById('migJalan'); if(!btn) return;
  btn.onclick=async()=>{
    const tgt=document.getElementById('migKlien').value;
    const msg=document.getElementById('migMsg');
    if(!tgt){ msg.innerHTML='<div class="pesan err">Pilih klien tujuan.</div>'; return; }
    const nama=(State.books.find(b=>b.id===tgt)||{}).name||'klien';
    if(!confirm(`Pindahkan seluruh akun, jurnal, anggaran & rekonsiliasi buku firma menjadi milik klien "${nama}"? Tindakan ini menandai data lama sebagai buku klien tersebut.`)) return;
    btn.disabled=true; btn.textContent='Memindahkan…';
    try{
      const r=await api('POST','/api/books/migrate',{targetClientId:tgt});
      await loadBooks(); State.bookId=tgt; await loadAccounts();
      msg.innerHTML=`<div class="pesan ok">Berhasil dipindahkan ke <b>${esc(nama)}</b>: ${r.moved.accounts} akun, ${r.moved.journals} jurnal, ${r.moved.budgets} anggaran, ${r.moved.bankRecs} rekonsiliasi. Sekarang menampilkan buku klien tersebut.</div>`;
      setTimeout(()=>{ viewAkun(); }, 1200);
    }catch(e){ msg.innerHTML=`<div class="pesan err">${esc(e.message)}</div>`; btn.disabled=false; btn.textContent='Pindahkan'; }
  };
}
function modalAkun(a){
  const isEdit=!!a;
  const cats=['ASET','LIABILITAS','EKUITAS','PENDAPATAN','BEBAN'];
  const subs={ASET:['Aset Lancar','Aset Tetap','Aset Tidak Lancar Lainnya'],LIABILITAS:['Liabilitas Jangka Pendek','Liabilitas Jangka Panjang'],EKUITAS:['Ekuitas'],PENDAPATAN:['Pendapatan Usaha','Pendapatan Lain-lain'],BEBAN:['Beban Pokok Penjualan','Beban Operasional','Beban Lain-lain','Beban Pajak']};
  const wrap=document.createElement('div'); wrap.className='modal-bg';
  const cat=a?a.category:'ASET';
  wrap.innerHTML=`<div class="modal"><div class="hd"><h3>${isEdit?'Ubah Akun':'Tambah Akun'}</h3><button class="x">&times;</button></div>
   <div class="bd">
    <div id="mAkunMsg"></div>
    <div class="field"><label>Kode Akun</label><input id="mCode" value="${a?esc(a.code):''}" ${isEdit?'disabled':''} placeholder="mis. 6-1900"></div>
    <div class="field"><label>Nama Akun</label><input id="mName" value="${a?esc(a.name):''}"></div>
    <div class="field"><label>Kategori</label><select id="mCat">${cats.map(c=>`<option ${cat===c?'selected':''}>${c}</option>`).join('')}</select></div>
    <div class="field"><label>Kelompok</label><select id="mSub"></select></div>
    <div class="field"><label>Saldo Normal</label><select id="mNormal"><option value="D" ${a&&a.normal==='D'?'selected':''}>Debit</option><option value="K" ${a&&a.normal==='K'?'selected':''}>Kredit</option></select></div>
    <div class="field"><label>Klasifikasi Arus Kas (untuk lawan kas)</label><select id="mCf"><option value="operasi" ${a&&a.cashFlow==='operasi'?'selected':''}>Operasi</option><option value="investasi" ${a&&a.cashFlow==='investasi'?'selected':''}>Investasi</option><option value="pendanaan" ${a&&a.cashFlow==='pendanaan'?'selected':''}>Pendanaan</option></select></div>
    <div class="field"><label><input type="checkbox" id="mCash" ${a&&a.isCash?'checked':''}> Akun ini adalah Kas/Bank</label></div>
    <div class="flex"><div class="spacer"></div><button class="btn abu" id="mBatal">Batal</button><button class="btn hijau" id="mSimpan">Simpan</button></div>
   </div></div>`;
  document.body.appendChild(wrap);
  const fillSub=()=>{ const c=wrap.querySelector('#mCat').value; wrap.querySelector('#mSub').innerHTML=subs[c].map(s=>`<option ${a&&a.subcategory===s?'selected':''}>${s}</option>`).join(''); };
  fillSub(); wrap.querySelector('#mCat').onchange=fillSub;
  const close=()=>wrap.remove();
  wrap.querySelector('.x').onclick=close; wrap.querySelector('#mBatal').onclick=close;
  wrap.onclick=(e)=>{ if(e.target===wrap) close(); };
  wrap.querySelector('#mSimpan').onclick=async()=>{
    const body={code:wrap.querySelector('#mCode').value.trim(),name:wrap.querySelector('#mName').value.trim(),
      category:wrap.querySelector('#mCat').value,subcategory:wrap.querySelector('#mSub').value,
      normal:wrap.querySelector('#mNormal').value,cashFlow:wrap.querySelector('#mCf').value,isCash:wrap.querySelector('#mCash').checked};
    try{
      if(isEdit) await api('PUT',burl('/accounts/'+a.id),body); else await api('POST',burl('/accounts'),body);
      close(); viewAkun();
    }catch(e){ wrap.querySelector('#mAkunMsg').innerHTML=`<div class="pesan err">${esc(e.message)}</div>`; }
  };
}

/* ============ JURNAL UMUM ============ */
const PAGE_JURNAL=50;
function isKlienStaff(){ return State.user && State.user.role==='klien-staff'; }
function isFirmSide(){ return !isKlienStaff(); }
async function viewJurnal(){
  const r=await api('GET',burl('/journals'));
  window._jurnalAll=r.journals;
  window._jurnalLocks=new Set(r.locks||[]);
  if(State.jurnalSumber===undefined)State.jurnalSumber='semua';
  if(State.jurnalBulan===undefined)State.jurnalBulan=''; // '' = semua bulan
  if(window._jurnalPage===undefined)window._jurnalPage=0;
  drawJurnal();
}
function drawJurnal(){
  const all=window._jurnalAll||[];
  const locks=window._jurnalLocks||new Set();
  const ro=bookRO();
  const firm=isFirmSide();
  const bukuKlien=!isFirmaBook();
  const nDraf=all.filter(j=>j.status==='draf').length;
  const sumber=State.jurnalSumber, bulan=State.jurnalBulan, tanpaLamp=!!State.jurnalTanpaLampiran, hanyaDraf=!!State.jurnalHanyaDraf;
  let list=all.filter(j=>{
    if(sumber==='manual'&&j.dariImpor)return false;
    if(sumber==='impor'&&!j.dariImpor)return false;
    if(bulan && (j.date||'').slice(0,7)!==bulan)return false;
    if(tanpaLamp && (j.attachmentCount||0)>0)return false;
    if(hanyaDraf && j.status!=='draf')return false;
    return true;
  });
  const total=list.length;
  const pages=Math.max(1,Math.ceil(total/PAGE_JURNAL));
  let pg=window._jurnalPage||0; if(pg>=pages)pg=pages-1; if(pg<0)pg=0; window._jurnalPage=pg;
  const start=pg*PAGE_JURNAL, end=Math.min(start+PAGE_JURNAL,total);
  const rows=list.slice(start,end).map(j=>{
    const tot=(j.lines||[]).reduce((s,l)=>s+(l.debit||0),0);
    const detail=(j.lines||[]).map(l=>{
      const a=State.accounts.find(x=>x.code===l.accountCode);
      return `<tr><td class="kode">${esc(l.accountCode)}</td><td class="${l.debit?'':'indent'}">${esc(a?a.name:l.accountCode)}${l.memo?` <span class="muted">— ${esc(l.memo)}</span>`:''}</td><td class="num">${l.debit?fmtNum(l.debit):''}</td><td class="num">${l.credit?fmtNum(l.credit):''}</td></tr>`;
    }).join('');
    const draf=j.status==='draf';
    const statusBadge=draf?'<span class="chip" style="background:#fef3c7;color:#92600a">📝 Draf</span>':'<span class="chip baik">✓ Disetujui</span>';
    const srcBadge=j.dariImpor?'<span class="chip aset">Dari Impor</span>':'';
    const editBadge=j.editCount?`<span class="chip buruk" title="Terakhir diedit ${esc((j.editedAt||'').slice(0,10))}">✎ ${j.editCount}×</span>`:'';
    const lampBadge=(j.attachmentCount||0)>0?`<button class="chip aset" data-att="${j.id}" title="Lihat lampiran">📎 ${j.attachmentCount}</button>`:'';
    const komBadge=(j.commentCount||0)>0?`<button class="chip" style="background:var(--garis2);color:var(--teks2)" data-kom="${j.id}">💬 ${j.commentCount}</button>`:`<button class="chip" style="background:var(--garis2);color:var(--teks2)" data-kom="${j.id}">💬</button>`;
    const locked=locks.has((j.date||'').slice(0,7));
    const bisaUbah=firm ? true : (draf && j.createdBy===State.user.id);
    let aksi='';
    if(!ro && bisaUbah){
      if(locked){ aksi=firm?`<button class="btn abu kecil" data-koreksi="1" title="Periode terkunci">🔒 Buat Koreksi</button>`:'<span class="chip" title="Periode terkunci">🔒 Terkunci</span>'; }
      else aksi=`<button class="btn abu kecil" data-edit="${j.id}">Edit</button><button class="btn abu kecil" data-del="${j.id}">Hapus</button>`;
    }
    let approve='';
    if(!ro && firm && draf) approve=`<button class="btn hijau kecil" data-approve="${j.id}">✓ Setujui</button><button class="btn kecil" style="background:var(--merah)" data-reject="${j.id}">✕ Tolak</button>`;
    return `<div class="card"><div class="hd">
        <h3>${esc(j.number)} • ${esc(j.date)}</h3>
        <div class="flex" style="gap:6px;flex-wrap:wrap">${statusBadge}${srcBadge}${editBadge}${bukuKlien?lampBadge:''}${komBadge}<span class="muted">${esc(j.description||'')}</span>
        ${approve}${aksi}</div></div>
      <div class="bd nopad"><table class="tbl mini"><thead><tr><th>Kode</th><th>Akun</th><th class="num">Debit</th><th class="num">Kredit</th></tr></thead>
      <tbody>${detail}</tbody><tfoot><tr><td colspan="2" class="right">Total</td><td class="num">${fmtNum(tot)}</td><td class="num">${fmtNum(tot)}</td></tr></tfoot></table>
      <div class="jkom" id="kom-${j.id}" hidden></div></div></div>`;
  }).join('') || '<p class="muted" style="padding:20px;text-align:center">Belum ada jurnal untuk filter ini.</p>';
  const tab=(v,label,n)=>`<button class="btn ${sumber===v?'':'abu'} kecil" data-tab="${v}">${label}${n!=null?` (${n})`:''}</button>`;
  const pager=pages>1?`<div class="flex" style="justify-content:center;gap:12px;margin-top:8px">
      <button class="btn abu kecil" id="jPrev" ${pg===0?'disabled':''}>‹ Sebelumnya</button>
      <span class="muted">Halaman ${pg+1}/${pages} • ${total} jurnal</span>
      <button class="btn abu kecil" id="jNext" ${pg>=pages-1?'disabled':''}>Berikutnya ›</button></div>`:'';
  content().innerHTML=`
    ${bookBanner()}
    <div class="toolbar" style="align-items:center;flex-wrap:wrap">
      <div class="flex" style="gap:6px">${tab('semua','Semua',all.length)}${tab('manual','Manual')}${tab('impor','Dari Impor')}</div>
      <label style="font-size:12.5px;align-self:end;padding-bottom:8px"><input type="checkbox" id="jDrafOnly" ${hanyaDraf?'checked':''}> Draf saja${nDraf?` (${nDraf})`:''}</label>
      ${bukuKlien?`<label style="font-size:12.5px;align-self:end;padding-bottom:8px"><input type="checkbox" id="jNoLamp" ${tanpaLamp?'checked':''}> Tanpa lampiran</label>`:''}
      <div class="field"><label>Bulan</label><input type="month" id="jBulan" value="${esc(bulan)}"></div>
      <label style="font-size:12.5px;align-self:end;padding-bottom:8px"><input type="checkbox" id="jAllMonth" ${bulan===''?'checked':''}> Semua bulan</label>
      <div class="spacer"></div>
      ${(!ro&&firm&&!isFirmaBook())?'<button class="btn abu" id="btnKunci">🔒 Kunci Periode</button>':''}
      ${ro?'':'<button class="btn hijau" id="btnJurnalBaru">+ Jurnal Baru</button>'}
    </div>
    <div id="jList">${rows}</div>
    ${pager}`;
  content().querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{State.jurnalSumber=b.dataset.tab;window._jurnalPage=0;drawJurnal();});
  const bulanInp=document.getElementById('jBulan'); const allChk=document.getElementById('jAllMonth');
  bulanInp.onchange=(e)=>{State.jurnalBulan=e.target.value;window._jurnalPage=0;drawJurnal();};
  allChk.onchange=(e)=>{State.jurnalBulan=e.target.checked?'':(bulanInp.value||ymNow());window._jurnalPage=0;drawJurnal();};
  const drafChk=document.getElementById('jDrafOnly'); if(drafChk)drafChk.onchange=(e)=>{State.jurnalHanyaDraf=e.target.checked;window._jurnalPage=0;drawJurnal();};
  const noLamp=document.getElementById('jNoLamp'); if(noLamp)noLamp.onchange=(e)=>{State.jurnalTanpaLampiran=e.target.checked;window._jurnalPage=0;drawJurnal();};
  const prev=document.getElementById('jPrev'),next=document.getElementById('jNext');
  if(prev)prev.onclick=()=>{window._jurnalPage=pg-1;drawJurnal();};
  if(next)next.onclick=()=>{window._jurnalPage=pg+1;drawJurnal();};
  const kunci=document.getElementById('btnKunci'); if(kunci)kunci.onclick=()=>modalKunciPeriode();
  const jbaru=document.getElementById('btnJurnalBaru'); if(jbaru)jbaru.onclick=()=>modalJurnal(null);
  content().querySelectorAll('[data-koreksi]').forEach(b=>b.onclick=()=>modalJurnal(null));
  content().querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>modalJurnal((window._jurnalAll||[]).find(j=>j.id===b.dataset.edit)));
  content().querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{
    if(!confirm('Hapus jurnal ini? Penghapusan dicatat di log audit.'))return;
    try{ const r=await api('DELETE',burl('/journals/'+b.dataset.del)); if(r.deletedFiles&&r.deletedFiles.length) alert('Jurnal dihapus. Lampiran ikut terhapus: '+r.deletedFiles.join(', ')); viewJurnal(); }catch(e){ alert(e.message); }
  });
  content().querySelectorAll('[data-approve]').forEach(b=>b.onclick=async()=>{ try{ await api('POST',burl('/journals/'+b.dataset.approve+'/approve'),{}); viewJurnal(); }catch(e){ alert(e.message); } });
  content().querySelectorAll('[data-reject]').forEach(b=>b.onclick=()=>modalTeks('Tolak Jurnal','Catatan alasan penolakan (staf klien akan melihat & memperbaiki):',async(note)=>{ await api('POST',burl('/journals/'+b.dataset.reject+'/reject'),{note}); viewJurnal(); }));
  content().querySelectorAll('[data-att]').forEach(b=>b.onclick=()=>modalLampiranJurnal(b.dataset.att));
  content().querySelectorAll('[data-kom]').forEach(b=>b.onclick=()=>toggleKomentar(b.dataset.kom));
}
// Panel komentar per jurnal (dua arah)
async function toggleKomentar(jid){
  const box=document.getElementById('kom-'+jid); if(!box)return;
  if(!box.hidden){ box.hidden=true; return; }
  const j=(window._jurnalAll||[]).find(x=>x.id===jid);
  box.hidden=false; box.innerHTML='<div class="loader">Memuat…</div>';
  // ambil komentar terbaru dari daftar (jsonJournal menyertakan comments)
  const komentar=(j&&j.comments)||[];
  const list=komentar.map(c=>`<div class="kom-item ${c.kind==='tolak'?'tolak':''}"><b>${esc(c.userName)}</b> <span class="muted">${esc((c.at||'').slice(0,16).replace('T',' '))}</span>${c.kind==='tolak'?' <span class="chip buruk">Penolakan</span>':''}<div>${esc(c.text)}</div></div>`).join('')||'<p class="muted" style="font-size:12px">Belum ada komentar.</p>';
  box.innerHTML=`<div class="kom-list">${list}</div>
    <div class="flex" style="gap:6px;margin-top:6px"><input class="kom-in" placeholder="Tulis komentar / pertanyaan…" style="flex:1"><button class="btn hijau kecil kom-send">Kirim</button></div>`;
  box.querySelector('.kom-send').onclick=async()=>{
    const t=box.querySelector('.kom-in').value.trim(); if(!t)return;
    try{ await api('POST',burl('/journals/'+jid+'/comment'),{text:t}); await viewJurnal(); /* re-render */ setTimeout(()=>toggleKomentar(jid),50); }catch(e){ alert(e.message); }
  };
}
async function modalLampiranJurnal(jid){
  let atts=[];
  try{ atts=(await api('GET',burl('/journals/'+jid+'/attachments'))).attachments||[]; }catch(e){}
  const wrap=document.createElement('div'); wrap.className='modal-bg';
  const rows=atts.map(a=>`<div class="flex" style="justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--garis)">
    <span>📄 ${esc(a.nama)} ${a.sumber==='jurnal'?'<span class="chip aset">lampiran</span>':'<span class="chip">arsip</span>'}</span>
    <span>${a.punyaFile?`<button class="btn abu kecil" data-open="${a.id}">Lihat</button>`:''}${a.link?` <a class="btn abu kecil" href="${esc(a.link)}" target="_blank">Tautan</a>`:''}</span></div>`).join('')||'<p class="muted">Tidak ada lampiran.</p>';
  wrap.innerHTML=`<div class="modal"><div class="hd"><h3>Lampiran Jurnal</h3><button class="x">&times;</button></div><div class="bd">${rows}</div></div>`;
  document.body.appendChild(wrap);
  const close=()=>wrap.remove(); wrap.querySelector('.x').onclick=close; wrap.onclick=(e)=>{if(e.target===wrap)close();};
  wrap.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>modalPratinjau('/api/documents/'+b.dataset.open+'/file?inline=1', b.previousSibling?'':''));
}
// Drill-down: klik akun di laporan → jurnal pembentuknya → lampiran
async function modalDrill(code, name, from, to){
  const wrap=document.createElement('div'); wrap.className='modal-bg';
  wrap.innerHTML=`<div class="modal" style="max-width:760px;width:92%"><div class="hd"><h3>🔎 ${esc(code)} — ${esc(name||'')}</h3><button class="x">&times;</button></div><div class="bd"><div class="loader">Memuat…</div></div></div>`;
  document.body.appendChild(wrap);
  const close=()=>wrap.remove(); wrap.querySelector('.x').onclick=close; wrap.onclick=(e)=>{if(e.target===wrap)close();};
  const bd=wrap.querySelector('.bd');
  try{
    const [led,jr]=await Promise.all([ api('GET',burl('/reports/ledger',{code,from,to})), api('GET',burl('/journals')) ]);
    const byNum={}; (jr.journals||[]).forEach(j=>byNum[j.number]=j);
    const rows=led.entries.map(e=>{
      const j=byNum[e.number]||{};
      const lamp=(j.attachmentCount||0)>0?`<button class="btn abu kecil" data-att="${j.id}">📎 ${j.attachmentCount}</button>`:'';
      return `<tr><td>${esc(e.date)}</td><td class="kode">${esc(e.number)}</td><td>${esc(e.description||'')}</td><td class="num">${e.debit?fmtNum(e.debit):''}</td><td class="num">${e.kredit?fmtNum(e.kredit):''}</td><td class="num">${fmtNum(e.saldo)}</td><td>${lamp}</td></tr>`;
    }).join('')||'<tr><td colspan="7" class="muted" style="text-align:center;padding:14px">Tidak ada mutasi pada periode ini.</td></tr>';
    bd.innerHTML=`<p class="muted" style="margin-top:0">Jurnal disetujui yang membentuk saldo akun ini. Klik 📎 untuk melihat bukti lampiran.</p>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Tanggal</th><th>No.</th><th>Keterangan</th><th class="num">Debit</th><th class="num">Kredit</th><th class="num">Saldo</th><th></th></tr></thead>
      <tbody><tr class="subhead"><td colspan="5">Saldo Awal</td><td class="num">${fmtNum(led.saldoAwal)}</td><td></td></tr>${rows}</tbody>
      <tfoot><tr><td colspan="5" class="right">Saldo Akhir</td><td class="num">${fmtNum(led.saldoAkhir)}</td><td></td></tr></tfoot></table></div>`;
    bd.querySelectorAll('[data-att]').forEach(b=>b.onclick=()=>modalLampiranJurnal(b.dataset.att));
  }catch(e){ bd.innerHTML=`<div class="pesan err">${esc(e.message)}</div>`; }
}
// Modal teks umum (penolakan / catatan)
function modalTeks(judul,label,cb){
  const wrap=document.createElement('div'); wrap.className='modal-bg';
  wrap.innerHTML=`<div class="modal"><div class="hd"><h3>${esc(judul)}</h3><button class="x">&times;</button></div>
    <div class="bd"><div id="mtMsg"></div><div class="field"><label>${esc(label)}</label><textarea id="mtText" rows="3"></textarea></div>
    <div class="flex"><div class="spacer"></div><button class="btn abu" id="mtBatal">Batal</button><button class="btn hijau" id="mtOk">Kirim</button></div></div></div>`;
  document.body.appendChild(wrap);
  const close=()=>wrap.remove(); wrap.querySelector('.x').onclick=close; wrap.querySelector('#mtBatal').onclick=close; wrap.onclick=(e)=>{if(e.target===wrap)close();};
  wrap.querySelector('#mtOk').onclick=async()=>{ const t=wrap.querySelector('#mtText').value.trim(); if(!t){wrap.querySelector('#mtMsg').innerHTML='<div class="pesan err">Wajib diisi.</div>';return;} try{ await cb(t); close(); }catch(e){ wrap.querySelector('#mtMsg').innerHTML=`<div class="pesan err">${esc(e.message)}</div>`; } };
}
// Modal kunci/buka periode
async function modalKunciPeriode(){
  const r=await api('GET',burl('/locks'));
  const locks=(r.locks||[]);
  const wrap=document.createElement('div'); wrap.className='modal-bg';
  const rows=locks.map(l=>`<tr><td>${esc(l.periode)}</td><td>${l.locked?'<span class="chip buruk">Terkunci</span>':'<span class="chip baik">Terbuka</span>'}</td>
    <td class="muted" style="font-size:12px">${l.locked?`oleh ${esc(l.lockedByName||'')} ${esc((l.lockedAt||'').slice(0,10))}`:(l.unlockNote?`dibuka: ${esc(l.unlockNote)}`:'')}</td>
    <td class="right">${l.locked?`<button class="btn abu kecil" data-unlock="${l.periode}">Buka</button>`:`<button class="btn abu kecil" data-lock="${l.periode}">Kunci</button>`}</td></tr>`).join('')||'<tr><td colspan="4" class="muted" style="text-align:center;padding:12px">Belum ada periode dikunci.</td></tr>';
  wrap.innerHTML=`<div class="modal" style="max-width:560px"><div class="hd"><h3>🔒 Kunci Periode — ${esc((curBookInfo()||{}).name||'')}</h3><button class="x">&times;</button></div>
    <div class="bd"><div id="lkMsg"></div>
      <p class="muted" style="margin-top:0">Periode terkunci: jurnal di bulan itu tidak bisa ditambah/diubah/dihapus. Hanya admin/konsultan yang dapat mengunci & membuka. Membuka wajib beri alasan.</p>
      <div class="flex" style="align-items:flex-end;gap:8px"><div class="field" style="margin:0"><label>Kunci periode baru</label><input type="month" id="lkBulan" value="${ymNow()}"></div><button class="btn hijau" id="lkAdd">Kunci</button></div>
      <div class="tbl-wrap mt"><table class="tbl"><thead><tr><th>Periode</th><th>Status</th><th>Keterangan</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
    </div></div>`;
  document.body.appendChild(wrap);
  const close=()=>wrap.remove(); wrap.querySelector('.x').onclick=close; wrap.onclick=(e)=>{if(e.target===wrap)close();};
  const doLock=async(per)=>{ try{ await api('POST',burl('/locks'),{periode:per}); close(); modalKunciPeriode(); viewJurnal(); }catch(e){ wrap.querySelector('#lkMsg').innerHTML=`<div class="pesan err">${esc(e.message)}</div>`; } };
  wrap.querySelector('#lkAdd').onclick=()=>doLock(wrap.querySelector('#lkBulan').value);
  wrap.querySelectorAll('[data-lock]').forEach(b=>b.onclick=()=>doLock(b.dataset.lock));
  wrap.querySelectorAll('[data-unlock]').forEach(b=>b.onclick=()=>modalTeks('Buka Kunci '+b.dataset.unlock,'Alasan membuka (angka yang sudah dilaporkan bisa berubah):',async(note)=>{ await api('POST',burl('/locks/unlock'),{periode:b.dataset.unlock,note}); close(); modalKunciPeriode(); viewJurnal(); }));
}
function modalJurnal(existing){
  const isEdit=!!existing;
  const opts=State.accounts.map(a=>`<option value="${a.code}">${a.code} — ${esc(a.name)}</option>`).join('');
  const wrap=document.createElement('div'); wrap.className='modal-bg';
  wrap.innerHTML=`<div class="modal" style="max-width:720px"><div class="hd"><h3>${isEdit?'Ubah Jurnal '+esc(existing.number):'Jurnal Baru'}</h3><button class="x">&times;</button></div>
    <div class="bd">
      <div id="jMsg"></div>
      ${isEdit&&existing.editCount?`<div class="pesan ok" style="background:#fef3c7;color:#78500a">Jurnal ini sudah pernah diedit ${existing.editCount}×.</div>`:''}
      <div class="flex">
        <div class="field" style="flex:1"><label>Tanggal</label><input type="date" id="jDate" value="${isEdit?esc(existing.date):todayStr()}"></div>
        <div class="field" style="flex:2"><label>Keterangan</label><input id="jDesc" placeholder="mis. Penjualan tunai" value="${isEdit?esc(existing.description||''):''}"></div>
      </div>
      <label style="font-size:12.5px;font-weight:600;color:var(--teks2)">Baris Jurnal</label>
      <div id="jLines"></div>
      <button class="btn abu kecil mt" id="jAddLine">+ Tambah Baris</button>
      ${isFirmaBook()?'':`
      <div class="mt" style="border-top:1px solid var(--garis);padding-top:12px">
        <label style="font-size:12.5px;font-weight:600;color:var(--teks2)">📎 Lampiran (opsional — faktur, bukti transfer, dll.)</label>
        <div id="jAtt" style="margin:6px 0"></div>
        <input type="file" id="jFiles" multiple accept="image/*,.pdf">
        <div class="muted" style="font-size:12px;margin-top:4px">Gambar dikompres otomatis. Maks 8 MB/berkas.</div>
      </div>`}
      <div class="flex mt"><span id="jBal" class="muted"></span><div class="spacer"></div>
        <button class="btn abu" id="jBatal">Batal</button><button class="btn hijau" id="jSimpan">${isEdit?'Simpan Perubahan':'Simpan Jurnal'}</button></div>
    </div></div>`;
  document.body.appendChild(wrap);
  const linesBox=wrap.querySelector('#jLines');
  function addLine(code,debit,credit,memo){
    const row=document.createElement('div'); row.className='jline';
    const sel=code?opts.replace(`value="${code}"`,`value="${code}" selected`):opts;
    row.innerHTML=`<select class="ln-acc"><option value="">— pilih akun —</option>${sel}</select>
      <input class="ln-deb" type="number" min="0" step="any" placeholder="Debit" value="${debit?debit:''}">
      <input class="ln-cred" type="number" min="0" step="any" placeholder="Kredit" value="${credit?credit:''}">
      <input class="ln-memo" placeholder="Memo (opsional)" value="${memo?esc(memo):''}">
      <button class="del" title="Hapus baris">&times;</button>`;
    row.querySelector('.del').onclick=()=>{row.remove();hitung();};
    row.querySelectorAll('input').forEach(i=>i.oninput=hitung);
    linesBox.appendChild(row);
  }
  function hitung(){
    let d=0,k=0;
    linesBox.querySelectorAll('.jline').forEach(r=>{ d+=Number(r.querySelector('.ln-deb').value)||0; k+=Number(r.querySelector('.ln-cred').value)||0; });
    const bal=Math.abs(d-k)<0.005;
    wrap.querySelector('#jBal').innerHTML=`Total Debit: <b>${fmtNum(d)}</b> — Total Kredit: <b>${fmtNum(k)}</b> ${bal?'<span class="chip baik">Seimbang</span>':'<span class="chip buruk">Selisih '+fmtNum(d-k)+'</span>'}`;
  }
  if(isEdit&&existing.lines&&existing.lines.length) existing.lines.forEach(l=>addLine(l.accountCode,l.debit,l.credit,l.memo)); else { addLine();addLine(); }
  hitung();
  wrap.querySelector('#jAddLine').onclick=()=>addLine();

  // ---- Lampiran ----
  const pendingFiles=[];              // {filename,mime,base64}
  const detach=[];                    // docId lampiran lama yang dilepas
  let existingAtts=[];                // lampiran tersimpan (saat edit)
  const attBox=wrap.querySelector('#jAtt');
  function drawAtt(){
    if(!attBox) return;
    const exist=existingAtts.filter(a=>!detach.includes(a.id)).map(a=>`<span class="att-chip">📄 ${esc(a.nama)} <a href="#" data-open="${a.id}">lihat</a> <button data-detach="${a.id}" title="Lepas">&times;</button></span>`).join('');
    const news=pendingFiles.map((f,i)=>`<span class="att-chip baru">🆕 ${esc(f.filename)} <button data-rm="${i}" title="Batal">&times;</button></span>`).join('');
    attBox.innerHTML=(exist+news)||'<span class="muted" style="font-size:12px">Belum ada lampiran.</span>';
    attBox.querySelectorAll('[data-detach]').forEach(b=>b.onclick=()=>{ detach.push(b.dataset.detach); drawAtt(); });
    attBox.querySelectorAll('[data-rm]').forEach(b=>b.onclick=()=>{ pendingFiles.splice(Number(b.dataset.rm),1); drawAtt(); });
    attBox.querySelectorAll('[data-open]').forEach(b=>b.onclick=(e)=>{ e.preventDefault(); modalPratinjau('/api/documents/'+b.dataset.open+'/file?inline=1', b.textContent); });
  }
  if(attBox){
    if(isEdit && (existing.attachmentCount||0)>0){ api('GET',burl('/journals/'+existing.id+'/attachments')).then(r=>{ existingAtts=r.attachments||[]; drawAtt(); }); }
    else drawAtt();
    wrap.querySelector('#jFiles').onchange=async(e)=>{
      const files=[...e.target.files]; e.target.value='';
      for(const f of files){ try{ pendingFiles.push(await fileToAttachment(f)); }catch(err){} }
      drawAtt();
    };
  }

  const close=()=>wrap.remove();
  wrap.querySelector('.x').onclick=close; wrap.querySelector('#jBatal').onclick=close;
  wrap.onclick=(e)=>{ if(e.target===wrap) close(); };
  wrap.querySelector('#jSimpan').onclick=async()=>{
    const lines=[...linesBox.querySelectorAll('.jline')].map(r=>({accountCode:r.querySelector('.ln-acc').value,debit:Number(r.querySelector('.ln-deb').value)||0,credit:Number(r.querySelector('.ln-cred').value)||0,memo:r.querySelector('.ln-memo').value}));
    const body={date:wrap.querySelector('#jDate').value,description:wrap.querySelector('#jDesc').value,lines};
    if(!isFirmaBook()){ if(pendingFiles.length) body.files=pendingFiles; if(detach.length) body.detachDocIds=detach; }
    const btn=wrap.querySelector('#jSimpan'); btn.disabled=true; btn.textContent='Menyimpan…';
    try{
      if(isEdit) await api('PUT',burl('/journals/'+existing.id),body); else await api('POST',burl('/journals'),body);
      close(); viewJurnal();
    }catch(e){ wrap.querySelector('#jMsg').innerHTML=`<div class="pesan err">${esc(e.message)}</div>`; btn.disabled=false; btn.textContent=isEdit?'Simpan Perubahan':'Simpan Jurnal'; }
  };
}
// Modal pratinjau file (gambar/PDF) di dalam aplikasi
function modalPratinjau(url, judul){
  const wrap=document.createElement('div'); wrap.className='modal-bg';
  wrap.innerHTML=`<div class="modal" style="max-width:900px;width:92%"><div class="hd"><h3>${esc(judul||'Pratinjau')}</h3><button class="x">&times;</button></div>
    <div class="bd" style="text-align:center"><iframe src="${url}" style="width:100%;height:70vh;border:1px solid var(--garis);border-radius:8px"></iframe>
    <div class="mt"><a class="btn abu kecil" href="${url.replace('?inline=1','')}" target="_blank">⬇ Unduh</a></div></div></div>`;
  document.body.appendChild(wrap);
  const close=()=>wrap.remove();
  wrap.querySelector('.x').onclick=close; wrap.onclick=(e)=>{ if(e.target===wrap) close(); };
}

/* ============ KOTAK MASUK JURNAL (draf menunggu persetujuan) ============ */
async function viewKotakMasuk(){
  const r=await api('GET','/api/books/inbox');
  const groups=r.groups||[];
  const total=r.total||0;
  const acctName={}; // per-buku belum tentu sama; tampilkan kode saja bila tak ada
  const blok=groups.map(g=>{
    const items=g.jurnal.map(j=>{
      const tot=(j.lines||[]).reduce((s,l)=>s+(l.debit||0),0);
      const baris=(j.lines||[]).map(l=>`<tr><td class="kode">${esc(l.accountCode)}</td><td class="num">${l.debit?fmtNum(l.debit):''}</td><td class="num">${l.credit?fmtNum(l.credit):''}</td></tr>`).join('');
      const tolakBadge=(j.comments||[]).some(c=>c.kind==='tolak')?'<span class="chip buruk">pernah ditolak</span>':'';
      return `<div class="card" style="margin-bottom:10px"><div class="hd">
          <h3>${esc(j.number)} • ${esc(j.date)}</h3>
          <div class="flex" style="gap:6px;flex-wrap:wrap"><span class="muted">${esc(j.description||'')}</span>${tolakBadge}
            ${(j.attachmentCount||0)>0?`<button class="chip aset" data-att="${g.bookId}|${j.id}">📎 ${j.attachmentCount}</button>`:''}
            <button class="btn hijau kecil" data-ap="${g.bookId}|${j.id}">✓ Setujui</button>
            <button class="btn kecil" style="background:var(--merah)" data-rj="${g.bookId}|${j.id}">✕ Tolak</button>
            <button class="btn abu kecil" data-open="${g.bookId}">Buka buku</button></div></div>
        <div class="bd nopad"><table class="tbl mini"><thead><tr><th>Kode</th><th class="num">Debit</th><th class="num">Kredit</th></tr></thead>
        <tbody>${baris}</tbody><tfoot><tr><td class="right">Total</td><td class="num">${fmtNum(tot)}</td><td class="num">${fmtNum(tot)}</td></tr></tfoot></table></div></div>`;
    }).join('');
    return `<div class="card" style="background:transparent;box-shadow:none;padding:0"><div class="hd" style="padding:6px 2px"><h3>🏢 ${esc(g.klien)} <span class="muted">(${g.jurnal.length} draf)</span></h3></div>${items}</div>`;
  }).join('')||'<div class="card"><div class="bd"><p class="muted" style="text-align:center;margin:0">Tidak ada jurnal draf menunggu. 🎉</p></div></div>';
  content().innerHTML=`<div class="toolbar"><h3 style="margin:0">📨 ${total} jurnal draf menunggu persetujuan</h3><div class="spacer"></div><button class="btn abu kecil" id="ktRefresh">Muat ulang</button></div>${blok}`;
  document.getElementById('ktRefresh').onclick=viewKotakMasuk;
  const parse=(s)=>{const [b,j]=s.split('|');return {b,j};};
  content().querySelectorAll('[data-ap]').forEach(btn=>btn.onclick=async()=>{ const {b,j}=parse(btn.dataset.ap); try{ await api('POST','/api/books/'+encodeURIComponent(b)+'/journals/'+j+'/approve',{}); viewKotakMasuk(); }catch(e){ alert(e.message); } });
  content().querySelectorAll('[data-rj]').forEach(btn=>btn.onclick=()=>{ const {b,j}=parse(btn.dataset.rj); modalTeks('Tolak Jurnal','Catatan alasan penolakan:',async(note)=>{ await api('POST','/api/books/'+encodeURIComponent(b)+'/journals/'+j+'/reject',{note}); viewKotakMasuk(); }); });
  content().querySelectorAll('[data-att]').forEach(btn=>btn.onclick=async()=>{ const {b,j}=parse(btn.dataset.att); try{ const atts=(await api('GET','/api/books/'+encodeURIComponent(b)+'/journals/'+j+'/attachments')).attachments||[]; modalLampiranList(atts); }catch(e){ alert(e.message); } });
  content().querySelectorAll('[data-open]').forEach(btn=>btn.onclick=async()=>{ State.bookId=btn.dataset.open; await loadAccounts(); State.view='jurnal'; State.jurnalHanyaDraf=true; renderApp(); });
}
function modalLampiranList(atts){
  const wrap=document.createElement('div'); wrap.className='modal-bg';
  const rows=atts.map(a=>`<div class="flex" style="justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--garis)"><span>📄 ${esc(a.nama)}</span><span>${a.punyaFile?`<button class="btn abu kecil" data-open="${a.id}">Lihat</button>`:''}${a.link?` <a class="btn abu kecil" href="${esc(a.link)}" target="_blank">Tautan</a>`:''}</span></div>`).join('')||'<p class="muted">Tidak ada lampiran.</p>';
  wrap.innerHTML=`<div class="modal"><div class="hd"><h3>Lampiran Jurnal</h3><button class="x">&times;</button></div><div class="bd">${rows}</div></div>`;
  document.body.appendChild(wrap);
  const close=()=>wrap.remove(); wrap.querySelector('.x').onclick=close; wrap.onclick=(e)=>{if(e.target===wrap)close();};
  wrap.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>modalPratinjau('/api/documents/'+b.dataset.open+'/file?inline=1',''));
}

/* ============ BUKU BESAR ============ */
async function viewBukuBesar(){
  const {from,to}=monthRange(State.periode.bulan);
  const codeSel=State.accounts.map(a=>`<option value="${a.code}">${a.code} — ${esc(a.name)}</option>`).join('');
  content().innerHTML=`
    <div class="toolbar">
      <div class="field"><label>Akun</label><select id="bbAcc"><option value="">— pilih akun —</option>${codeSel}</select></div>
      <div class="field"><label>Periode</label><input type="month" id="bbBulan" value="${State.periode.bulan}"></div>
    </div>
    <div id="bbHasil"><p class="muted">Pilih akun untuk menampilkan buku besar.</p></div>`;
  const run=async()=>{
    const code=document.getElementById('bbAcc').value; if(!code)return;
    const r=await api('GET',burl('/reports/ledger',{code,from,to}));
    const rows=r.entries.map(e=>`<tr><td>${esc(e.date)}</td><td class="kode">${esc(e.number)}</td><td>${esc(e.description||'')}</td><td class="num">${e.debit?fmtNum(e.debit):''}</td><td class="num">${e.kredit?fmtNum(e.kredit):''}</td><td class="num">${fmtNum(e.saldo)}</td></tr>`).join('');
    document.getElementById('bbHasil').innerHTML=`<div class="card"><div class="hd"><h3>${esc(r.account?r.account.name:code)} (${esc(code)})</h3></div>
      <div class="bd nopad"><div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Tanggal</th><th>No.</th><th>Keterangan</th><th class="num">Debit</th><th class="num">Kredit</th><th class="num">Saldo</th></tr></thead>
        <tbody><tr class="subhead"><td colspan="5">Saldo Awal</td><td class="num">${fmtNum(r.saldoAwal)}</td></tr>${rows}</tbody>
        <tfoot><tr><td colspan="5" class="right">Saldo Akhir</td><td class="num">${fmtNum(r.saldoAkhir)}</td></tr></tfoot>
      </table></div></div></div>`;
  };
  document.getElementById('bbAcc').onchange=run;
  document.getElementById('bbBulan').onchange=(e)=>{State.periode.bulan=e.target.value;viewBukuBesar();};
}

/* ============ NERACA SALDO ============ */
async function viewNeracaSaldo(){
  const {from,to}=monthRange(State.periode.bulan);
  const r=await api('GET',burl('/reports/trial-balance',{to}));
  const rows=r.rows.map(x=>`<tr class="drill" data-code="${esc(x.code)}" data-name="${esc(x.name)}" title="Klik untuk telusuri jurnal pembentuk"><td class="kode">${esc(x.code)}</td><td>${esc(x.name)}</td><td class="num">${x.debit?fmtNum(x.debit):''}</td><td class="num">${x.kredit?fmtNum(x.kredit):''}</td></tr>`).join('');
  content().innerHTML=`
    <div class="toolbar"><div class="field"><label>Sampai dengan (akhir bulan)</label><input type="month" id="nsBulan" value="${State.periode.bulan}"></div></div>
    <div class="card"><div class="hd"><h3>Neraca Saldo per ${esc(to)}</h3>${r.seimbang?'<span class="chip baik">Seimbang</span>':'<span class="chip buruk">Tidak Seimbang</span>'}</div>
    <div class="bd nopad"><div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Kode</th><th>Nama Akun</th><th class="num">Debit</th><th class="num">Kredit</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td colspan="2" class="right">TOTAL</td><td class="num">${fmtNum(r.totalDebit)}</td><td class="num">${fmtNum(r.totalKredit)}</td></tr></tfoot>
    </table></div></div></div>`;
  document.getElementById('nsBulan').onchange=(e)=>{State.periode.bulan=e.target.value;viewNeracaSaldo();};
  // Neraca Saldo bersifat kumulatif (sejak awal s/d 'to') → drill juga kumulatif agar cocok dgn totalnya
  content().querySelectorAll('tr.drill').forEach(tr=>tr.onclick=()=>modalDrill(tr.dataset.code,tr.dataset.name,'',to));
}

/* ============ LAPORAN LABA RUGI ============ */
async function viewLabaRugi(){
  const {from,to}=monthRange(State.periode.bulan);
  const pm=prevMonth(State.periode.bulan); const pr=monthRange(pm);
  const r=await api('GET',burl('/reports/income-statement',{from,to,cmpFrom:pr.from,cmpTo:pr.to}));
  const cur=r.current, cmp=r.compare;
  const line=(label,val,valP,bold,indent)=>{
    const sel=(bold?'total':'');
    return `<tr class="${sel}"><td class="${indent?'indent':''}">${label}</td><td class="num">${fmtNum(val)}</td>${cmp?`<td class="num">${fmtNum(valP)}</td><td class="num ${clsNum(val-valP)}">${fmtNum(val-valP)}</td>`:''}</tr>`;
  };
  const grp=(name)=> (cur.groups[name]||[]).map(it=>{
    const p=cmp?((cmp.groups[name]||[]).find(x=>x.code===it.code)||{amount:0}).amount:0;
    return line(esc(it.name),it.amount,p,false,true);
  }).join('');
  content().innerHTML=`
    <div class="toolbar"><div class="field"><label>Periode</label><input type="month" id="lrBulan" value="${State.periode.bulan}"></div>
      <button class="btn abu kecil" id="lrCetak">🖨️ Cetak</button></div>
    <div class="card laporan" id="cetakArea"><div class="bd">
      <div class="judul"><h3>${esc(State.viewCompanyName||(State.company&&State.company.name)||'')}</h3>
        <div class="p">LAPORAN LABA RUGI</div><div class="p">${namaBulan(State.periode.bulan)}</div></div>
      <table class="tbl mt"><thead><tr><th>Keterangan</th><th class="num">${namaBulan(State.periode.bulan)}</th>${cmp?`<th class="num">${namaBulan(pm)}</th><th class="num">Selisih</th>`:''}</tr></thead>
      <tbody>
        <tr class="subhead"><td colspan="${cmp?4:2}">PENDAPATAN USAHA</td></tr>
        ${grp('Pendapatan Usaha')}
        ${line('<b>Total Pendapatan Usaha</b>',cur.pendapatanUsaha,cmp?cmp.pendapatanUsaha:0,true)}
        <tr class="subhead"><td colspan="${cmp?4:2}">BEBAN POKOK PENJUALAN</td></tr>
        ${grp('Beban Pokok Penjualan')}
        ${line('<b>LABA BRUTO</b>',cur.labaBruto,cmp?cmp.labaBruto:0,true)}
        <tr class="subhead"><td colspan="${cmp?4:2}">BEBAN OPERASIONAL</td></tr>
        ${grp('Beban Operasional')}
        ${line('<b>Total Beban Operasional</b>',cur.bebanOperasional,cmp?cmp.bebanOperasional:0,true)}
        ${line('<b>LABA USAHA</b>',cur.labaUsaha,cmp?cmp.labaUsaha:0,true)}
        <tr class="subhead"><td colspan="${cmp?4:2}">PENDAPATAN & BEBAN LAIN-LAIN</td></tr>
        ${grp('Pendapatan Lain-lain')}
        ${grp('Beban Lain-lain')}
        ${line('<b>LABA SEBELUM PAJAK</b>',cur.labaSebelumPajak,cmp?cmp.labaSebelumPajak:0,true)}
        ${grp('Beban Pajak')}
        ${line('<b>LABA BERSIH</b>',cur.labaBersih,cmp?cmp.labaBersih:0,true)}
      </tbody></table>
    </div></div>`;
  document.getElementById('lrBulan').onchange=(e)=>{State.periode.bulan=e.target.value;viewLabaRugi();};
  document.getElementById('lrCetak').onclick=()=>cetak('cetakArea');
}

/* ============ LAPORAN PERUBAHAN EKUITAS ============ */
async function viewPerubahanEkuitas(){
  const {from,to}=monthRange(State.periode.bulan);
  const r=await api('GET',burl('/reports/equity',{from,to}));
  const nm=State.viewCompanyName||(curBookInfo()&&curBookInfo().name)||(State.company&&State.company.name)||'';
  const baris=(label,val,bold,plusminus)=>`<tr class="${bold?'total':''}"><td>${label}</td><td class="num ${val<0?'merah':''}">${plusminus&&val>0?'+ ':''}${plusminus&&val<0?'− ':''}${fmtNum(Math.abs(val))}</td></tr>`;
  const detailAkun=(r.akun||[]).map(a=>`<tr><td class="indent kode">${esc(a.code)} — ${esc(a.name)}</td><td class="num">${fmtNum(a.awal)}</td><td class="num ${a.perubahan<0?'merah':''}">${fmtNum(a.perubahan)}</td><td class="num">${fmtNum(a.akhir)}</td></tr>`).join('');
  content().innerHTML=`
    ${bookBanner()}
    <div class="toolbar"><div class="field"><label>Periode</label><input type="month" id="ekBulan" value="${State.periode.bulan}"></div>
      <button class="btn abu kecil" id="ekCetak">🖨️ Cetak</button></div>
    <div class="card laporan" id="cetakArea"><div class="bd">
      <div class="judul"><h3>${esc(nm)}</h3>
        <div class="p">LAPORAN PERUBAHAN EKUITAS</div><div class="p">${namaBulan(State.periode.bulan)}</div></div>
      <table class="tbl mt"><tbody>
        ${baris('<b>Ekuitas awal periode</b>',r.ekuitasAwal,true)}
        ${baris('Laba (rugi) bersih periode berjalan',r.labaBersih,false,true)}
        ${r.setoran?baris('Setoran / penambahan modal',r.setoran,false,true):''}
        ${r.prive?baris('Prive / penarikan pemilik',-r.prive,false,true):''}
        ${baris('<b>Ekuitas akhir periode</b>',r.ekuitasAkhir,true)}
      </tbody></table>
      ${r.seimbang?'':'<div class="pesan err" style="margin-top:8px">Catatan: komponen tidak seimbang — periksa jurnal ekuitas.</div>'}
      <h4 style="margin:18px 0 6px">Rincian per komponen ekuitas</h4>
      <table class="tbl"><thead><tr><th>Komponen</th><th class="num">Awal</th><th class="num">Perubahan</th><th class="num">Akhir</th></tr></thead>
      <tbody>
        ${detailAkun||''}
        <tr><td class="indent">Saldo Laba (Laba Ditahan)</td><td class="num">${fmtNum(r.labaDitahan.awal)}</td><td class="num ${r.labaDitahan.tambah<0?'merah':''}">${fmtNum(r.labaDitahan.tambah)}</td><td class="num">${fmtNum(r.labaDitahan.akhir)}</td></tr>
        <tr class="total"><td>Total Ekuitas</td><td class="num">${fmtNum(r.ekuitasAwal)}</td><td class="num">${fmtNum(r.ekuitasAkhir-r.ekuitasAwal)}</td><td class="num">${fmtNum(r.ekuitasAkhir)}</td></tr>
      </tbody></table>
      <p class="muted" style="font-size:12px;margin-top:10px">Saldo Laba dihitung dari akumulasi laba bersih (pendapatan − beban) sampai akhir periode; laba periode berjalan menambah saldo laba. Prive mengurangi ekuitas.</p>
    </div></div>`;
  document.getElementById('ekBulan').onchange=(e)=>{State.periode.bulan=e.target.value;viewPerubahanEkuitas();};
  document.getElementById('ekCetak').onclick=()=>cetak('cetakArea');
}

/* ============ CALK — CATATAN ATAS LAPORAN KEUANGAN ============ */
function calkFill(t,vars){ return String(t||'').replace(/\{nama\}/g,vars.nama).replace(/\{tahun\}/g,vars.tahun).replace(/\{koreksiFiskal\}/g,fmtNum(vars.koreksiFiskal||0)); }
async function viewCALK(){
  const tahun=State.calkTahun||String(new Date().getFullYear()).slice(0,4);
  const r=await api('GET',burl('/calk',{tahun}));
  window._calk={data:r, ck:JSON.parse(JSON.stringify(r.calk))};
  const firm=isFirmSide() && !bookRO();   // editor CALK hanya untuk yang boleh menulis buku
  const a=r.auto, vars={nama:r.nama,tahun:a.tahun,koreksiFiskal:a.koreksiFiskal.koreksi};
  // ---- editor narasi (sisi firma) ----
  const editor=firm?`
    <div class="card"><div class="hd"><h3>✍️ Isi Catatan (template, dipakai ulang tiap tahun)</h3>
      <div class="flex" style="gap:6px"><span id="ckMsg"></span><button class="btn abu kecil" id="ckReset" title="Kembalikan ke template bawaan jenis usaha">Template bawaan</button><button class="btn hijau kecil" id="ckSave">Simpan</button></div></div>
      <div class="bd">
        <div class="field"><label>1. Informasi Umum</label><textarea id="ck_infoUmum" rows="3">${esc(r.calk.infoUmum||'')}</textarea></div>
        <div class="field"><label>2. Dasar Penyusunan</label><textarea id="ck_penyusunan" rows="2">${esc(r.calk.penyusunan||'')}</textarea></div>
        <label style="font-size:12.5px;font-weight:600;color:var(--teks2)">3. Kebijakan Akuntansi</label>
        <div id="ckKebijakan"></div>
        <button class="btn abu kecil mt" id="ckAddKeb">+ Tambah Kebijakan</button>
        <div class="field mt"><label>Pihak Berelasi</label><textarea id="ck_pihakBerelasi" rows="2">${esc(r.calk.pihakBerelasi||'')}</textarea></div>
        <div class="field"><label>Perpajakan <span class="muted">(pakai {koreksiFiskal} untuk angka koreksi penyusutan otomatis)</span></label><textarea id="ck_perpajakan" rows="2">${esc(r.calk.perpajakan||'')}</textarea></div>
        <div class="field"><label>Peristiwa Setelah Periode Pelaporan</label><textarea id="ck_peristiwaSetelah" rows="2">${esc(r.calk.peristiwaSetelah||'')}</textarea></div>
        <p class="muted" style="font-size:12px">Variabel otomatis: <b>{nama}</b>, <b>{tahun}</b>, <b>{koreksiFiskal}</b>.</p>
      </div></div>`:'<div class="card"><div class="bd muted">Catatan disusun oleh konsultan/staf firma.</div></div>';
  // ---- rincian pos otomatis (dari neraca) ----
  const catLabel={ASET:'ASET',LIABILITAS:'LIABILITAS',EKUITAS:'EKUITAS'};
  const rincianHtml=Object.keys(catLabel).map(cat=>{
    const grp=a.rincian[cat]||{};
    const subs=Object.keys(grp); if(!subs.length)return '';
    const body=subs.map(sc=>{
      const rows=grp[sc].map(x=>`<tr><td class="kode">${esc(x.code)}</td><td>${esc(x.name)}</td><td class="num">${fmtNum(x.amount)}</td></tr>`).join('');
      const tot=grp[sc].reduce((s,x)=>s+x.amount,0);
      return `<tr class="subhead"><td colspan="3">${esc(sc)}</td></tr>${rows}<tr class="total"><td colspan="2" class="right">Subtotal ${esc(sc)}</td><td class="num">${fmtNum(tot)}</td></tr>`;
    }).join('');
    return `<tr class="subhead" style="background:#e8eef5"><td colspan="3"><b>${catLabel[cat]}</b></td></tr>${body}`;
  }).join('');
  // ---- aset tetap ----
  const asetRows=a.aset.rows.map(x=>`<tr><td>${esc(x.nama)}</td><td>${esc(x.tanggalPerolehan)}</td><td class="num">${fmtNum(x.harga)}</td><td class="num">${fmtNum(x.akum)}</td><td class="num">${fmtNum(x.nilaiBuku)}</td></tr>`).join('')||'<tr><td colspan="5" class="muted" style="text-align:center;padding:10px">Tidak ada aset tetap.</td></tr>';
  content().innerHTML=`
    ${bookBanner()}
    <div class="toolbar"><div class="field"><label>Tahun Buku</label><input type="number" id="ckTahun" value="${esc(tahun)}" style="width:120px"></div>
      <div class="spacer"></div><button class="btn abu" id="ckCetak">🖨️ Cetak CALK</button></div>
    ${editor}
    <div class="card"><div class="hd"><h3>📊 Rincian & angka otomatis — ${esc(vars.tahun)}</h3><span class="muted">dari buku besar & aset (real-time)</span></div><div class="bd">
      <div class="grid k3">
        <div class="stat"><div class="lbl">Total Aset</div><div class="val">${fmtRp(a.ringkasan.totalAset)}</div></div>
        <div class="stat"><div class="lbl">Total Ekuitas</div><div class="val">${fmtRp(a.ringkasan.totalEkuitas)}</div></div>
        <div class="stat"><div class="lbl">Laba Bersih</div><div class="val ${a.ringkasan.labaBersih>=0?'hijau':'merah'}">${fmtRp(a.ringkasan.labaBersih)}</div></div>
      </div>
      <h4 style="margin:16px 0 6px">Rincian Pos Neraca per 31 Des ${esc(vars.tahun)}</h4>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Kode</th><th>Akun</th><th class="num">Saldo</th></tr></thead><tbody>${rincianHtml||'<tr><td colspan="3" class="muted" style="text-align:center;padding:10px">Belum ada saldo.</td></tr>'}</tbody></table></div>
      <h4 style="margin:16px 0 6px">Rincian Aset Tetap</h4>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Aset</th><th>Perolehan</th><th class="num">Harga</th><th class="num">Akum. Penyusutan</th><th class="num">Nilai Buku</th></tr></thead>
        <tbody>${asetRows}</tbody><tfoot><tr class="total"><td colspan="2">Total</td><td class="num">${fmtNum(a.aset.total.harga)}</td><td class="num">${fmtNum(a.aset.total.akum)}</td><td class="num">${fmtNum(a.aset.total.nilaiBuku)}</td></tr></tfoot></table></div>
      <h4 style="margin:16px 0 6px">Koreksi Fiskal Penyusutan ${esc(vars.tahun)}</h4>
      <table class="tbl" style="max-width:520px"><tbody>
        <tr><td>Penyusutan komersial</td><td class="num">${fmtNum(a.koreksiFiskal.komersial)}</td></tr>
        <tr><td>Penyusutan fiskal</td><td class="num">${fmtNum(a.koreksiFiskal.fiskal)}</td></tr>
        <tr class="total"><td>Koreksi fiskal</td><td class="num ${a.koreksiFiskal.koreksi<0?'merah':''}">${fmtNum(a.koreksiFiskal.koreksi)}</td></tr>
      </tbody></table>
    </div></div>`;
  document.getElementById('ckTahun').onchange=(e)=>{State.calkTahun=e.target.value;viewCALK();};
  document.getElementById('ckCetak').onclick=()=>cetakCALK(window._calk.data, firm?bacaEditor():r.calk);
  if(firm){
    drawKebijakan();
    document.getElementById('ckAddKeb').onclick=()=>{ window._calk.ck.kebijakan=window._calk.ck.kebijakan||[]; window._calk.ck.kebijakan.push({judul:'',isi:''}); drawKebijakan(); };
    document.getElementById('ckSave').onclick=async()=>{
      try{ await api('POST',burl('/calk'),bacaEditor()); document.getElementById('ckMsg').innerHTML='<span class="chip baik">Tersimpan</span>'; }
      catch(e){ document.getElementById('ckMsg').innerHTML=`<span class="chip buruk">${esc(e.message)}</span>`; }
    };
    document.getElementById('ckReset').onclick=async()=>{
      if(!confirm('Ganti isi dengan template bawaan sesuai jenis usaha? Perubahan yang belum disimpan hilang (belum tersimpan sampai Anda klik Simpan).'))return;
      const def=(await api('GET',burl('/calk',{tahun,bawaan:1}))).calk;
      window._calk.ck.kebijakan=def.kebijakan||[];
      ['infoUmum','penyusunan','pihakBerelasi','perpajakan','peristiwaSetelah'].forEach(k=>{ const el=document.getElementById('ck_'+k); if(el)el.value=def[k]||''; });
      drawKebijakan();
      document.getElementById('ckMsg').innerHTML='<span class="chip">template dimuat — klik Simpan</span>';
    };
  }
}
function drawKebijakan(){
  const box=document.getElementById('ckKebijakan'); if(!box)return;
  const list=(window._calk.ck&&window._calk.ck.kebijakan)||[];
  box.innerHTML=list.map((k,i)=>`<div class="card" style="box-shadow:none;border:1px solid var(--garis);margin-bottom:6px"><div class="bd" style="padding:8px">
      <div class="flex" style="gap:6px"><input class="keb-judul" data-i="${i}" value="${esc(k.judul||'')}" placeholder="Judul kebijakan" style="flex:1;font-weight:600"><button class="btn abu kecil keb-del" data-i="${i}">Hapus</button></div>
      <textarea class="keb-isi" data-i="${i}" rows="2" style="margin-top:6px">${esc(k.isi||'')}</textarea></div></div>`).join('')||'<p class="muted" style="font-size:12px">Belum ada kebijakan.</p>';
  box.querySelectorAll('.keb-del').forEach(b=>b.onclick=()=>{ window._calk.ck.kebijakan.splice(Number(b.dataset.i),1); drawKebijakan(); });
}
function bacaEditor(){
  const g=(id)=>{const el=document.getElementById(id);return el?el.value:'';};
  const kebijakan=[...document.querySelectorAll('.keb-judul')].map(inp=>{
    const i=inp.dataset.i; const isi=document.querySelector(`.keb-isi[data-i="${i}"]`);
    return {judul:inp.value,isi:isi?isi.value:''};
  }).filter(k=>k.judul||k.isi);
  return {infoUmum:g('ck_infoUmum'),penyusunan:g('ck_penyusunan'),kebijakan,pihakBerelasi:g('ck_pihakBerelasi'),perpajakan:g('ck_perpajakan'),peristiwaSetelah:g('ck_peristiwaSetelah')};
}
function cetakCALK(data,ck){
  const a=data.auto, vars={nama:data.nama,tahun:a.tahun,koreksiFiskal:a.koreksiFiskal.koreksi};
  const P=(t)=>`<p style="margin:4px 0;text-align:justify">${esc(calkFill(t,vars)).replace(/\n/g,'<br>')}</p>`;
  const keb=(ck.kebijakan||[]).map((k,i)=>`<p style="margin:4px 0"><b>3.${i+1} ${esc(k.judul)}</b><br>${esc(calkFill(k.isi,vars)).replace(/\n/g,'<br>')}</p>`).join('');
  const catLabel={ASET:'ASET',LIABILITAS:'LIABILITAS',EKUITAS:'EKUITAS'};
  const rincian=Object.keys(catLabel).map(cat=>{
    const grp=a.rincian[cat]||{}; const subs=Object.keys(grp); if(!subs.length)return '';
    const body=subs.map(sc=>{
      const rows=grp[sc].map(x=>`<tr><td>${esc(x.name)}</td><td class="num">${fmtNum(x.amount)}</td></tr>`).join('');
      const tot=grp[sc].reduce((s,x)=>s+x.amount,0);
      return `<tr class="sub"><td colspan="2"><b>${esc(sc)}</b></td></tr>${rows}<tr><td class="r">Subtotal</td><td class="num">${fmtNum(tot)}</td></tr>`;
    }).join('');
    return `<tr><td colspan="2" style="background:#eee"><b>${catLabel[cat]}</b></td></tr>${body}`;
  }).join('');
  const aset=a.aset.rows.map(x=>`<tr><td>${esc(x.nama)}</td><td class="num">${fmtNum(x.harga)}</td><td class="num">${fmtNum(x.akum)}</td><td class="num">${fmtNum(x.nilaiBuku)}</td></tr>`).join('');
  const w=window.open('','_blank');
  w.document.write(`<html><head><title>CALK ${esc(vars.nama)} ${vars.tahun}</title>
  <style>body{font-family:Arial,sans-serif;font-size:12px;padding:28px;color:#1a202c;line-height:1.5}
  h2,h3,h4{margin:10px 0 4px}.judul{text-align:center;margin-bottom:14px}
  table{width:100%;border-collapse:collapse;margin:6px 0}td,th{padding:4px 8px;border-bottom:1px solid #e2e8f0}
  .num{text-align:right}.r{text-align:right}.sub td{background:#f4f6f9}</style></head><body>
  <div class="judul"><h2>${esc(vars.nama)}</h2><h3>CATATAN ATAS LAPORAN KEUANGAN</h3>
    <div>Untuk tahun yang berakhir 31 Desember ${vars.tahun}</div></div>
  <h4>1. INFORMASI UMUM</h4>${P(ck.infoUmum)}
  <h4>2. DASAR PENYUSUNAN LAPORAN KEUANGAN</h4>${P(ck.penyusunan)}
  <h4>3. IKHTISAR KEBIJAKAN AKUNTANSI</h4>${keb}
  <h4>4. RINCIAN POS-POS NERACA (per 31 Desember ${vars.tahun})</h4>
  <table><tbody>${rincian}</tbody></table>
  <h4>5. ASET TETAP</h4>
  <table><thead><tr><th>Aset</th><th class="num">Harga Perolehan</th><th class="num">Akum. Penyusutan</th><th class="num">Nilai Buku</th></tr></thead>
  <tbody>${aset||'<tr><td colspan="4">Tidak ada.</td></tr>'}</tbody>
  <tfoot><tr><td><b>Total</b></td><td class="num"><b>${fmtNum(a.aset.total.harga)}</b></td><td class="num"><b>${fmtNum(a.aset.total.akum)}</b></td><td class="num"><b>${fmtNum(a.aset.total.nilaiBuku)}</b></td></tr></tfoot></table>
  <h4>6. PIHAK BERELASI</h4>${P(ck.pihakBerelasi)}
  <h4>7. PERPAJAKAN</h4>${P(ck.perpajakan)}
  <h4>8. PERISTIWA SETELAH PERIODE PELAPORAN</h4>${P(ck.peristiwaSetelah)}
  </body></html>`);
  w.document.close(); setTimeout(()=>w.print(),400);
}

/* ============ ASET TETAP & PENYUSUTAN ============ */
async function viewAsetTetap(){
  const sampai=(State.periode.bulan)||ymNow();
  const [meta,r]=await Promise.all([api('GET',burl('/assets/meta')),api('GET',burl('/assets',{sampai}))]);
  window._asetMeta=meta;
  const ro=bookRO();
  const fisLabel=(k)=>(meta.fiskal[k]&&meta.fiskal[k].label)||k;
  const rows=(r.assets||[]).map(a=>{
    const lps=a.dilepas;
    const badge=lps?` <span class="chip aset">dilepas</span>`:(a.aktif===false?' <span class="chip buruk">nonaktif</span>':'');
    const lrTxt=lps&&lps.labaRugi!=null?(lps.labaRugi>=0?` · laba ${fmtNum(lps.labaRugi)}`:` · rugi ${fmtNum(-lps.labaRugi)}`):'';
    const aksi=lps
      ? `<button class="btn abu kecil" data-jadwal="${a.id}">Jadwal</button>`
      : `<button class="btn abu kecil" data-jadwal="${a.id}">Jadwal</button>${ro?'':` <button class="btn abu kecil" data-edit="${a.id}">Ubah</button> <button class="btn abu kecil" data-lepas="${a.id}" title="Jual / buang aset">📤 Lepas</button> <button class="btn abu kecil" data-del="${a.id}">Hapus</button>`}`;
    return `<tr>
      <td><b>${esc(a.nama)}</b>${badge}<div class="muted" style="font-size:12px">${esc(a.tanggalPerolehan)} · ${esc((meta.metode[a.metode]||a.metode))} · ${a.masaManfaat} th${lps?` · dilepas ${esc(lps.tanggal)}${lrTxt}`:''}</div></td>
      <td class="num">${fmtNum(a.harga)}</td>
      <td class="num">${fmtNum(a.akumKomersial)}</td>
      <td class="num"><b>${lps?'—':fmtNum(a.nilaiBukuKomersial)}</b></td>
      <td>${esc(fisLabel(a.kelompokFiskal))}</td>
      <td class="right">${aksi}</td>
    </tr>`;
  }).join('')||'<tr><td colspan="6" class="muted" style="text-align:center;padding:16px">Belum ada aset tetap.</td></tr>';
  content().innerHTML=`
    ${bookBanner()}
    <div class="toolbar" style="flex-wrap:wrap;gap:8px">
      <div class="field"><label>Posisi s/d bulan</label><input type="month" id="asBulan" value="${sampai}"></div>
      <div class="spacer"></div>
      <button class="btn abu" id="asPdf">🖨️ PDF</button>
      <button class="btn abu" id="asCsv">⬇️ Ekspor CSV</button>
      <button class="btn abu" id="asKoreksi">📑 Koreksi Fiskal</button>
      ${ro?'':`<button class="btn abu" id="asImpor">📥 Impor Excel/CSV</button>
      <button class="btn abu" id="asRun">▶️ Jalankan Penyusutan</button>
      <button class="btn hijau" id="asAdd">+ Tambah Aset</button>`}
    </div>
    <div class="card"><div class="hd"><h3>Daftar Aset Tetap</h3><span class="muted">${(r.assets||[]).length} aset · nilai buku komersial per ${esc(sampai)}</span></div>
      <div class="bd nopad"><div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Aset</th><th class="num">Harga Perolehan</th><th class="num">Akum. Penyusutan</th><th class="num">Nilai Buku</th><th>Kelompok Fiskal</th><th></th></tr></thead>
        <tbody>${rows}</tbody></table></div></div></div>
    <p class="muted">Penyusutan <b>komersial</b> diposting otomatis ke jurnal (Beban Penyusutan / Akumulasi Penyusutan) saat Anda klik "Jalankan Penyusutan". Penyusutan <b>fiskal</b> (Pasal 11 UU PPh) dihitung berdampingan untuk <b>Koreksi Fiskal</b> — tidak diposting.</p>`;
  document.getElementById('asBulan').onchange=(e)=>{State.periode.bulan=e.target.value;viewAsetTetap();};
  document.getElementById('asKoreksi').onclick=()=>modalKoreksiFiskal(sampai.slice(0,4));
  document.getElementById('asPdf').onclick=()=>cetakAsetTabel(r.assets||[],sampai);
  document.getElementById('asCsv').onclick=()=>exportAsetCSV(r.assets||[]);
  content().querySelectorAll('[data-jadwal]').forEach(b=>b.onclick=()=>modalJadwalAset(b.dataset.jadwal));
  if(!ro){
    document.getElementById('asAdd').onclick=()=>modalAset(null,meta);
    document.getElementById('asImpor').onclick=()=>modalImporAset();
    document.getElementById('asRun').onclick=()=>jalankanPenyusutan(sampai);
    content().querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{ const a=(r.assets||[]).find(x=>x.id===b.dataset.edit); modalAset(a,meta); });
    content().querySelectorAll('[data-lepas]').forEach(b=>b.onclick=()=>{ const a=(r.assets||[]).find(x=>x.id===b.dataset.lepas); modalLepasAset(a); });
    content().querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{ if(!confirm('Hapus aset ini? Jurnal penyusutan yang sudah diposting tetap tersimpan.'))return; try{ const x=await api('DELETE',burl('/assets/'+b.dataset.del)); if(x.catatan)alert(x.catatan); viewAsetTetap(); }catch(e){alert(e.message);} });
  }
}
async function jalankanPenyusutan(sampai){
  if(!confirm(`Jalankan & posting penyusutan komersial semua aset aktif s/d ${sampai}? Bulan yang sudah diposting tidak akan dobel.`))return;
  try{
    const r=await api('POST',burl('/assets/depreciate'),{sampai});
    let msg=`${r.dibuat} jurnal penyusutan dibuat.`;
    if(r.terkunci)msg+=` ${r.terkunci} bulan dilewati karena periode terkunci.`;
    if(r.dilewati)msg+=` ${r.dilewati} aset dilewati (akun beban/akumulasi belum diatur).`;
    alert(msg); viewAsetTetap();
  }catch(e){ alert(e.message); }
}
function modalLepasAset(a){
  const accs=(State.accounts||[]);
  const opt=(list)=>list.map(x=>`<option value="${x.code}">${esc(x.code)} — ${esc(x.name)}</option>`).join('');
  const kasList=accs.filter(x=>x.isCash); const kasOpts=(kasList.length?kasList:accs);
  const wrap=document.createElement('div'); wrap.className='modal-bg';
  wrap.innerHTML=`<div class="modal" style="max-width:540px"><div class="hd"><h3>📤 Lepas / Jual Aset — ${esc(a.nama)}</h3><button class="x">&times;</button></div>
    <div class="bd"><div id="lpMsg"></div>
      <p class="muted" style="margin-top:0">Nilai buku komersial terkini: <b>${fmtNum(a.nilaiBukuKomersial)}</b> (harga ${fmtNum(a.harga)} − akum ${fmtNum(a.akumKomersial)}). <b>Laba/rugi</b> = harga jual − nilai buku, dihitung tepat saat simpan (termasuk penyusutan s/d tanggal pelepasan). Jurnal pelepasan diposting otomatis & penyusutan dihentikan.</p>
      <div class="flex">
        <div class="field" style="flex:1"><label>Tanggal Pelepasan</label><input type="date" id="lpTgl" value="${todayStr()}"></div>
        <div class="field" style="flex:1"><label>Harga Jual (Rp) <span class="muted">— 0 jika dibuang</span></label><input type="number" id="lpHarga" value="0" min="0"></div>
      </div>
      <div class="field"><label>Akun Kas/Bank penerima <span class="muted">(wajib bila dijual)</span></label><select id="lpKas"><option value="">— pilih —</option>${opt(kasOpts)}</select></div>
      <div class="field"><label>Akun Laba/Rugi Pelepasan Aset <span class="muted">(pendapatan/beban lain)</span></label><select id="lpLR"><option value="">— pilih —</option>${opt(accs)}</select></div>
      <div class="flex mt"><div class="spacer"></div><button class="btn abu" id="lpBatal">Batal</button><button class="btn hijau" id="lpSimpan">Proses Pelepasan</button></div>
    </div></div>`;
  document.body.appendChild(wrap);
  const close=()=>wrap.remove();
  wrap.querySelector('.x').onclick=close; wrap.querySelector('#lpBatal').onclick=close; wrap.onclick=(e)=>{if(e.target===wrap)close();};
  wrap.querySelector('#lpSimpan').onclick=async()=>{
    const g=id=>wrap.querySelector('#'+id).value;
    const body={tanggal:g('lpTgl'),hargaJual:Number(g('lpHarga'))||0,akunKas:g('lpKas')||undefined,akunLabaRugi:g('lpLR')||undefined};
    if(!body.tanggal){ wrap.querySelector('#lpMsg').innerHTML='<div class="pesan err">Isi tanggal pelepasan.</div>'; return; }
    try{
      const res=await api('POST',burl('/assets/'+a.id+'/dispose'),body);
      const lr=res.labaRugi>=0?`Laba pelepasan Rp${fmtNum(res.labaRugi)}`:`Rugi pelepasan Rp${fmtNum(-res.labaRugi)}`;
      alert(`Pelepasan selesai ✓\nNilai buku: Rp${fmtNum(res.nilaiBuku)}\n${lr}\nJurnal: ${res.jurnalNumber}${res.penyusutanDiposting?`\n(+${res.penyusutanDiposting} bulan penyusutan diposting lebih dulu)`:''}`);
      close(); viewAsetTetap();
    }catch(e){ wrap.querySelector('#lpMsg').innerHTML=`<div class="pesan err">${esc(e.message)}</div>`; }
  };
}
function downloadFile(name,content,mime){
  const blob=new Blob(['﻿'+content],{type:(mime||'text/csv')+';charset=utf-8'});
  const url=URL.createObjectURL(blob); const a=document.createElement('a');
  a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function csvCell(v){ v=String(v==null?'':v); return /[",;\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v; }
function exportAsetCSV(list){
  const head=['Nama','Tanggal Perolehan','Harga','Nilai Residu','Masa Manfaat (tahun)','Metode','Kelompok Fiskal','Akun Aset','Akun Akumulasi','Akun Beban','Akum Penyusutan','Nilai Buku','Status'];
  const lines=[head.map(csvCell).join(',')];
  (list||[]).forEach(a=>lines.push([a.nama,a.tanggalPerolehan,a.harga,a.nilaiResidu||0,a.masaManfaat||0,a.metode||'',a.kelompokFiskal||'',a.akunAset||'',a.akunAkumulasi||'',a.akunBeban||'',a.akumKomersial||0,a.dilepas?'':a.nilaiBukuKomersial,a.dilepas?('dilepas '+a.dilepas.tanggal):(a.aktif===false?'nonaktif':'aktif')].map(csvCell).join(',')));
  downloadFile('aset-tetap.csv',lines.join('\n'));
}
function unduhTemplateAset(){
  const head='Nama,Tanggal Perolehan,Harga,Nilai Residu,Masa Manfaat (tahun),Metode,Kelompok Fiskal,Akun Aset,Akun Akumulasi,Akun Beban';
  const contoh='Laptop Kantor,2024-01-15,15000000,0,4,garis-lurus,I,1-2100,1-2200,6-3100';
  downloadFile('template-aset.csv',head+'\n'+contoh);
}
function cetakAsetTabel(list,sampai){
  const rows=(list||[]).map(a=>`<tr><td>${esc(a.nama)}${a.dilepas?' <i>(dilepas)</i>':''}</td><td>${esc(a.tanggalPerolehan)}</td><td class="num">${fmtNum(a.harga)}</td><td class="num">${fmtNum(a.akumKomersial)}</td><td class="num">${a.dilepas?'-':fmtNum(a.nilaiBukuKomersial)}</td><td>${esc(a.kelompokFiskal||'')}</td></tr>`).join('');
  const w=window.open('','_blank'); if(!w){alert('Popup diblokir browser — izinkan popup untuk mencetak.');return;}
  w.document.write(`<html><head><title>Daftar Aset Tetap</title><style>body{font-family:Arial,sans-serif;font-size:12px;padding:24px;color:#1a202c}table{width:100%;border-collapse:collapse}th,td{padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:left}.num{text-align:right}h2{text-align:center;margin:0 0 4px}p.sub{text-align:center;color:#666;margin:0 0 14px}</style></head><body><h2>Daftar Aset Tetap</h2><p class="sub">Posisi s/d ${esc(sampai||'')}</p><table><thead><tr><th>Aset</th><th>Tgl Perolehan</th><th class="num">Harga Perolehan</th><th class="num">Akum. Penyusutan</th><th class="num">Nilai Buku</th><th>Kelompok Fiskal</th></tr></thead><tbody>${rows}</tbody></table></body></html>`);
  w.document.close(); setTimeout(()=>w.print(),300);
}
function modalImporAset(){
  const wrap=document.createElement('div'); wrap.className='modal-bg';
  wrap.innerHTML=`<div class="modal" style="max-width:540px"><div class="hd"><h3>📥 Impor Aset dari Excel / CSV</h3><button class="x">&times;</button></div>
    <div class="bd"><div id="imMsg"></div>
      <p class="muted" style="margin-top:0">Unggah <b>.xlsx</b> atau <b>.csv</b>. Baris pertama = header. Kolom <b>wajib</b>: Nama, Tanggal Perolehan (YYYY-MM-DD), Harga. <b>Opsional</b>: Nilai Residu, Masa Manfaat (tahun), Metode (garis-lurus/saldo-menurun), Kelompok Fiskal (I/II/III/IV/bangunan-permanen/…), Akun Aset, Akun Akumulasi, Akun Beban (kode akun). Akun yang tak dikenal dikosongkan (bisa dilengkapi belakangan).</p>
      <p><a href="#" id="imTemplate">⬇️ Unduh template CSV</a></p>
      <div class="field"><label>Berkas (.xlsx / .csv)</label><input type="file" id="imFile" accept=".xlsx,.csv,text/csv"></div>
      <div class="flex mt"><div class="spacer"></div><button class="btn abu" id="imBatal">Batal</button><button class="btn hijau" id="imProses">Impor</button></div>
    </div></div>`;
  document.body.appendChild(wrap);
  const close=()=>wrap.remove();
  wrap.querySelector('.x').onclick=close; wrap.querySelector('#imBatal').onclick=close; wrap.onclick=(e)=>{if(e.target===wrap)close();};
  wrap.querySelector('#imTemplate').onclick=(e)=>{ e.preventDefault(); unduhTemplateAset(); };
  wrap.querySelector('#imProses').onclick=async()=>{
    const f=wrap.querySelector('#imFile').files[0];
    if(!f){ wrap.querySelector('#imMsg').innerHTML='<div class="pesan err">Pilih berkas dulu.</div>'; return; }
    const btn=wrap.querySelector('#imProses'); btn.disabled=true; btn.textContent='Mengimpor…';
    try{
      const isX=/\.xlsx$/i.test(f.name);
      const body=isX?{kind:'xlsx',base64:await readFile(f,true)}:{kind:'csv',text:await readFile(f,false)};
      const res=await api('POST',burl('/assets/import'),body);
      let m=`✓ ${res.dibuat} aset diimpor.`; if(res.gagal) m+=` ${res.gagal} baris dilewati.`;
      if(res.errors&&res.errors.length) m+='\n\n'+res.errors.slice(0,20).join('\n');
      alert(m); close(); viewAsetTetap();
    }catch(e){ wrap.querySelector('#imMsg').innerHTML=`<div class="pesan err">${esc(e.message)}</div>`; btn.disabled=false; btn.textContent='Impor'; }
  };
}
function modalAset(a,meta){
  const isEdit=!!a; meta=meta||window._asetMeta||{fiskal:{},metode:{},akunAset:[],akunAkumulasi:[],akunBeban:[]};
  const optAkun=(list,sel)=>'<option value="">— pilih —</option>'+list.map(x=>`<option value="${x.code}" ${x.code===sel?'selected':''}>${esc(x.code)} — ${esc(x.name)}</option>`).join('');
  const optFis=Object.entries(meta.fiskal).map(([k,v])=>`<option value="${k}" ${a&&a.kelompokFiskal===k?'selected':''}>${esc(v.label)}</option>`).join('');
  const optMet=Object.entries(meta.metode).map(([k,v])=>`<option value="${k}" ${a&&a.metode===k?'selected':''}>${esc(v)}</option>`).join('');
  const wrap=document.createElement('div'); wrap.className='modal-bg';
  wrap.innerHTML=`<div class="modal" style="max-width:640px"><div class="hd"><h3>${isEdit?'Ubah Aset':'Tambah Aset Tetap'}</h3><button class="x">&times;</button></div>
    <div class="bd"><div id="asMsg"></div>
      <div class="field"><label>Nama Aset</label><input id="aNama" value="${a?esc(a.nama):''}" placeholder="mis. Mobil Operasional Avanza"></div>
      <div class="flex"><div class="field" style="flex:1"><label>Tanggal Perolehan</label><input type="date" id="aTgl" value="${a?esc(a.tanggalPerolehan):todayStr()}"></div>
        <div class="field" style="flex:1"><label>Harga Perolehan (Rp)</label><input type="number" id="aHarga" value="${a?a.harga:''}"></div>
        <div class="field" style="flex:1"><label>Nilai Residu (Rp)</label><input type="number" id="aResidu" value="${a?a.nilaiResidu:0}"></div></div>
      <div style="border-top:1px solid var(--garis);margin:8px 0;padding-top:8px"><b style="font-size:13px">Komersial (untuk laporan keuangan)</b></div>
      <div class="flex"><div class="field" style="flex:1"><label>Metode</label><select id="aMetode">${optMet}</select></div>
        <div class="field" style="flex:1"><label>Masa Manfaat (tahun)</label><input type="number" id="aMasa" value="${a?a.masaManfaat:''}"></div></div>
      <div style="border-top:1px solid var(--garis);margin:8px 0;padding-top:8px"><b style="font-size:13px">Fiskal (Pasal 11 UU PPh — untuk koreksi fiskal)</b></div>
      <div class="flex"><div class="field" style="flex:1"><label>Kelompok Fiskal</label><select id="aFis">${optFis}</select></div>
        <div class="field" style="flex:1"><label>Metode Fiskal</label><select id="aMetFis"><option value="garis-lurus" ${a&&a.metodeFiskal==='garis-lurus'?'selected':''}>Garis Lurus</option><option value="saldo-menurun" ${a&&a.metodeFiskal==='saldo-menurun'?'selected':''}>Saldo Menurun</option></select></div></div>
      <div style="border-top:1px solid var(--garis);margin:8px 0;padding-top:8px"><b style="font-size:13px">Akun terkait (untuk posting penyusutan komersial)</b></div>
      <div class="field"><label>Akun Aset</label><select id="aAkunAset">${optAkun(meta.akunAset,a?a.akunAset:'')}</select></div>
      <div class="flex"><div class="field" style="flex:1"><label>Akun Akumulasi Penyusutan</label><select id="aAkunAkum">${optAkun(meta.akunAkumulasi,a?a.akunAkumulasi:'')}</select></div>
        <div class="field" style="flex:1"><label>Akun Beban Penyusutan</label><select id="aAkunBeban">${optAkun(meta.akunBeban,a?a.akunBeban:(meta.defaultBeban||''))}</select></div></div>
      <div class="field"><label>Catatan</label><input id="aCatatan" value="${a?esc(a.catatan||''):''}"></div>
      <div class="flex mt"><div class="spacer"></div><button class="btn abu" id="aBatal">Batal</button><button class="btn hijau" id="aSimpan">Simpan</button></div>
    </div></div>`;
  document.body.appendChild(wrap);
  const close=()=>wrap.remove(); wrap.querySelector('.x').onclick=close; wrap.querySelector('#aBatal').onclick=close; wrap.onclick=(e)=>{if(e.target===wrap)close();};
  wrap.querySelector('#aSimpan').onclick=async()=>{
    const body={nama:wrap.querySelector('#aNama').value,tanggalPerolehan:wrap.querySelector('#aTgl').value,
      harga:wrap.querySelector('#aHarga').value,nilaiResidu:wrap.querySelector('#aResidu').value,
      metode:wrap.querySelector('#aMetode').value,masaManfaat:wrap.querySelector('#aMasa').value,
      kelompokFiskal:wrap.querySelector('#aFis').value,metodeFiskal:wrap.querySelector('#aMetFis').value,
      akunAset:wrap.querySelector('#aAkunAset').value,akunAkumulasi:wrap.querySelector('#aAkunAkum').value,akunBeban:wrap.querySelector('#aAkunBeban').value,
      catatan:wrap.querySelector('#aCatatan').value};
    try{ if(isEdit) await api('PUT',burl('/assets/'+a.id),body); else await api('POST',burl('/assets'),body); close(); viewAsetTetap(); }
    catch(e){ wrap.querySelector('#asMsg').innerHTML=`<div class="pesan err">${esc(e.message)}</div>`; }
  };
}
async function modalJadwalAset(id){
  const r=await api('GET',burl('/assets/'+id+'/schedule'));
  const rows=(r.tahunan||[]).map(t=>`<tr><td>${esc(t.tahun)}</td><td class="num">${fmtNum(t.komersial)}</td><td class="num">${fmtNum(t.fiskal)}</td><td class="num ${t.koreksi<0?'merah':''}">${fmtNum(t.koreksi)}</td></tr>`).join('')||'<tr><td colspan="4" class="muted" style="text-align:center;padding:12px">Tidak ada penyusutan (mis. tidak disusutkan).</td></tr>';
  const wrap=document.createElement('div'); wrap.className='modal-bg';
  wrap.innerHTML=`<div class="modal" style="max-width:560px"><div class="hd"><h3>Jadwal Penyusutan — ${esc(r.asset.nama)}</h3><button class="x">&times;</button></div>
    <div class="bd"><p class="muted" style="margin-top:0">Sudah diposting: ${r.postedMonths}/${r.totalBulan} bulan (komersial). Kolom koreksi = komersial − fiskal.</p>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Tahun</th><th class="num">Komersial</th><th class="num">Fiskal</th><th class="num">Koreksi Fiskal</th></tr></thead><tbody>${rows}</tbody></table></div></div></div>`;
  document.body.appendChild(wrap);
  const close=()=>wrap.remove(); wrap.querySelector('.x').onclick=close; wrap.onclick=(e)=>{if(e.target===wrap)close();};
}
async function modalKoreksiFiskal(tahun){
  const wrap=document.createElement('div'); wrap.className='modal-bg';
  wrap.innerHTML=`<div class="modal" style="max-width:640px"><div class="hd"><h3>📑 Koreksi Fiskal Penyusutan</h3><button class="x">&times;</button></div><div class="bd" id="kfBody"><div class="loader">Memuat…</div></div></div>`;
  document.body.appendChild(wrap);
  const close=()=>wrap.remove(); wrap.querySelector('.x').onclick=close; wrap.onclick=(e)=>{if(e.target===wrap)close();};
  const load=async(th)=>{
    const r=await api('GET',burl('/assets/koreksi-fiskal',{tahun:th}));
    const rows=(r.rows||[]).map(x=>`<tr><td>${esc(x.nama)}</td><td class="num">${fmtNum(x.komersial)}</td><td class="num">${fmtNum(x.fiskal)}</td><td class="num ${x.koreksi<0?'merah':''}">${fmtNum(x.koreksi)}</td></tr>`).join('')||'<tr><td colspan="4" class="muted" style="text-align:center;padding:12px">Tidak ada penyusutan pada tahun ini.</td></tr>';
    wrap.querySelector('#kfBody').innerHTML=`<div class="cetakArea" id="cetakKF">
      <div class="flex" style="align-items:flex-end;gap:8px;margin-bottom:8px"><div class="field" style="margin:0"><label>Tahun</label><input type="number" id="kfTahun" value="${esc(th)}" style="width:110px"></div><button class="btn abu kecil" id="kfGo">Tampilkan</button><div class="spacer"></div><button class="btn abu kecil" id="kfCetak">🖨️ Cetak</button></div>
      <table class="tbl"><thead><tr><th>Aset</th><th class="num">Penyusutan Komersial</th><th class="num">Penyusutan Fiskal</th><th class="num">Koreksi Fiskal</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr class="total"><td>Total</td><td class="num">${fmtNum(r.total.komersial)}</td><td class="num">${fmtNum(r.total.fiskal)}</td><td class="num ${r.total.koreksi<0?'merah':''}">${fmtNum(r.total.koreksi)}</td></tr></tfoot></table>
      <p class="muted" style="font-size:12px">Koreksi positif = beban komersial lebih besar dari fiskal (koreksi fiskal positif, menambah penghasilan kena pajak). Angka ini yang selama ini dihitung manual di Excel.</p></div>`;
    wrap.querySelector('#kfGo').onclick=()=>load(wrap.querySelector('#kfTahun').value);
    wrap.querySelector('#kfCetak').onclick=()=>{ const w=window.open('','_blank'); w.document.write(`<html><head><title>Koreksi Fiskal ${esc(th)}</title><style>body{font-family:Arial;font-size:12px;padding:24px}table{width:100%;border-collapse:collapse}th,td{padding:6px 10px;border-bottom:1px solid #ddd}.num{text-align:right}.total td{font-weight:bold;border-top:2px solid #999}</style></head><body><h3>Koreksi Fiskal Penyusutan — ${esc(th)}</h3>${wrap.querySelector('#cetakKF table').outerHTML}</body></html>`); w.document.close(); setTimeout(()=>w.print(),300); };
  };
  load(tahun);
}

/* ============ NERACA ============ */
async function viewNeraca(){
  const to=monthRange(State.periode.bulan).to;
  const r=await api('GET',burl('/reports/balance-sheet',{asOf:to}));
  const bs=r.current;
  const groupRows=(cat,subs)=>subs.map(sc=>{
    const items=(bs.groups[cat]&&bs.groups[cat][sc])||[];
    if(!items.length)return '';
    const rows=items.map(it=>`<tr><td class="indent">${esc(it.name)}</td><td class="num">${fmtNum(it.amount)}</td></tr>`).join('');
    const sub=items.reduce((s,x)=>s+x.amount,0);
    return `<tr class="subhead"><td colspan="2">${sc}</td></tr>${rows}<tr class="total"><td class="right">Jumlah ${sc}</td><td class="num">${fmtNum(sub)}</td></tr>`;
  }).join('');
  content().innerHTML=`
    <div class="toolbar"><div class="field"><label>Per Tanggal (akhir bulan)</label><input type="month" id="nrBulan" value="${State.periode.bulan}"></div>
      <button class="btn abu kecil" id="nrCetak">🖨️ Cetak</button></div>
    <div class="card laporan" id="cetakArea"><div class="bd">
      <div class="judul"><h3>${esc(State.viewCompanyName||(State.company&&State.company.name)||'')}</h3>
        <div class="p">LAPORAN POSISI KEUANGAN (NERACA)</div><div class="p">Per ${esc(to)}</div>
        ${bs.seimbang?'<span class="chip baik">Neraca Seimbang</span>':'<span class="chip buruk">Tidak Seimbang</span>'}</div>
      <table class="tbl mt"><tbody>
        <tr class="subhead"><td colspan="2" style="background:#dbeafe">ASET</td></tr>
        ${groupRows('ASET',['Aset Lancar','Aset Tetap','Aset Tidak Lancar Lainnya'])}
        <tr class="total"><td class="right">TOTAL ASET</td><td class="num">${fmtNum(bs.totalAset)}</td></tr>
        <tr class="subhead"><td colspan="2" style="background:#fee2e2">LIABILITAS</td></tr>
        ${groupRows('LIABILITAS',['Liabilitas Jangka Pendek','Liabilitas Jangka Panjang'])}
        <tr class="total"><td class="right">TOTAL LIABILITAS</td><td class="num">${fmtNum(bs.totalLiabilitas)}</td></tr>
        <tr class="subhead"><td colspan="2" style="background:#dcfce7">EKUITAS</td></tr>
        ${groupRows('EKUITAS',['Ekuitas'])}
        <tr><td class="indent">Laba (Rugi) Berjalan / Saldo Laba</td><td class="num">${fmtNum(bs.labaBerjalan)}</td></tr>
        <tr class="total"><td class="right">TOTAL EKUITAS</td><td class="num">${fmtNum(bs.totalEkuitas)}</td></tr>
        <tr class="total"><td class="right">TOTAL LIABILITAS & EKUITAS</td><td class="num">${fmtNum(bs.totalPasiva)}</td></tr>
      </tbody></table>
    </div></div>`;
  document.getElementById('nrBulan').onchange=(e)=>{State.periode.bulan=e.target.value;viewNeraca();};
  document.getElementById('nrCetak').onclick=()=>cetak('cetakArea');
}

/* ============ ARUS KAS ============ */
async function viewArusKas(){
  const {from,to}=monthRange(State.periode.bulan);
  const r=await api('GET',burl('/reports/cash-flow',{from,to}));
  const sec=(judul,rows,total)=>`<tr class="subhead"><td colspan="2">${judul}</td></tr>
    ${rows.map(x=>`<tr><td class="indent">${esc(x.name)}</td><td class="num">${fmtNum(x.amount)}</td></tr>`).join('')||'<tr><td class="indent muted">— tidak ada —</td><td></td></tr>'}
    <tr class="total"><td class="right">${judul.replace('ARUS KAS DARI ','Kas Neto ')}</td><td class="num">${fmtNum(total)}</td></tr>`;
  content().innerHTML=`
    <div class="toolbar"><div class="field"><label>Periode</label><input type="month" id="akBulan" value="${State.periode.bulan}"></div>
      <button class="btn abu kecil" id="akCetak">🖨️ Cetak</button></div>
    <div class="card laporan" id="cetakArea"><div class="bd">
      <div class="judul"><h3>${esc(State.viewCompanyName||(State.company&&State.company.name)||'')}</h3>
        <div class="p">LAPORAN ARUS KAS (Metode Langsung)</div><div class="p">${namaBulan(State.periode.bulan)}</div>
        ${r.cocok?'':'<span class="chip buruk">Perlu dicek</span>'}</div>
      <table class="tbl mt"><tbody>
        ${sec('ARUS KAS DARI AKTIVITAS OPERASI',r.operasi,r.totOperasi)}
        ${sec('ARUS KAS DARI AKTIVITAS INVESTASI',r.investasi,r.totInvestasi)}
        ${sec('ARUS KAS DARI AKTIVITAS PENDANAAN',r.pendanaan,r.totPendanaan)}
        <tr class="total"><td class="right">KENAIKAN (PENURUNAN) KAS BERSIH</td><td class="num">${fmtNum(r.kenaikanBersih)}</td></tr>
        <tr><td class="right">Kas & Setara Kas Awal Periode</td><td class="num">${fmtNum(r.kasAwal)}</td></tr>
        <tr class="total"><td class="right">KAS & SETARA KAS AKHIR PERIODE</td><td class="num">${fmtNum(r.kasAkhir)}</td></tr>
      </tbody></table>
    </div></div>`;
  document.getElementById('akBulan').onchange=(e)=>{State.periode.bulan=e.target.value;viewArusKas();};
  document.getElementById('akCetak').onclick=()=>cetak('cetakArea');
}

/* ============ ANGGARAN ============ */
async function viewAnggaran(){
  const year=State.periode.bulan.slice(0,4);
  const [bud]=await Promise.all([api('GET',burl('/budgets',{year}))]);
  const budMap={}; bud.budgets.forEach(b=>budMap[b.accountCode]=b);
  const nominal=State.accounts.filter(a=>a.category==='PENDAPATAN'||a.category==='BEBAN');
  const rows=nominal.map(a=>{
    const b=budMap[a.code]; const tot=b?(b.amounts||[]).reduce((s,x)=>s+(Number(x)||0),0):0;
    return `<tr><td class="kode">${esc(a.code)}</td><td>${esc(a.name)}</td><td class="num"><input type="number" data-code="${a.code}" value="${tot}" style="width:130px;text-align:right;padding:5px" ${bookRO()?'disabled':''}></td></tr>`;
  }).join('');
  content().innerHTML=`
    <div class="toolbar"><div class="field"><label>Tahun Anggaran</label><input type="number" id="anTahun" value="${year}" style="width:110px"></div>
      <div class="spacer"></div>${bookRO()?'':'<button class="btn hijau" id="anSimpan">💾 Simpan Anggaran</button>'}</div>
    <p class="muted">Masukkan anggaran <b>setahun</b> per akun. Nilai akan dibagi rata otomatis ke 12 bulan untuk perbandingan bulanan.</p>
    <div class="card"><div class="hd"><h3>Anggaran ${year}</h3></div><div class="bd nopad"><div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Kode</th><th>Akun</th><th class="num">Anggaran Setahun (Rp)</th></tr></thead><tbody>${rows}</tbody></table></div></div></div>`;
  document.getElementById('anTahun').onchange=(e)=>{ State.periode.bulan=e.target.value+'-'+State.periode.bulan.slice(5); viewAnggaran(); };
  if(!bookRO()){
    document.getElementById('anSimpan').onclick=async()=>{
      const inputs=content().querySelectorAll('input[data-code]');
      for(const inp of inputs){
        const per=(Number(inp.value)||0)/12;
        const amounts=new Array(12).fill(Math.round(per));
        await api('POST',burl('/budgets'),{year,accountCode:inp.dataset.code,amounts});
      }
      alert('Anggaran tersimpan.');
    };
  }
}

/* ============ ANALISIS VARIANS ============ */
async function viewVarians(){
  const {from,to}=monthRange(State.periode.bulan);
  const mode=State._varMode||'anggaran';
  const pm=prevMonth(State.periode.bulan); const pr=monthRange(pm);
  const r=await api('GET',burl('/reports/variance',{from,to,mode,cmpFrom:pr.from,cmpTo:pr.to}));
  const material=(x)=> Math.abs(x.selisih)>=100000 && Math.abs(x.persen)>=10;
  const rows=r.rows.map(x=>`<tr>
      <td class="kode">${esc(x.code)}</td><td>${esc(x.name)}</td>
      <td><span class="chip ${x.category==='PENDAPATAN'?'aset':'beban'}">${x.category}</span></td>
      <td class="num">${fmtNum(x.aktual)}</td><td class="num">${fmtNum(x.pembanding)}</td>
      <td class="num ${clsNum(x.selisih)}">${fmtNum(x.selisih)}</td>
      <td class="num">${x.persen.toFixed(1)}%</td>
      <td><span class="chip ${x.arah==='Menguntungkan'?'baik':'buruk'}">${x.arah}</span></td>
      <td>${material(x)?'<span class="chip buruk">Material</span>':''}</td>
    </tr>`).join('');
  content().innerHTML=`
    <div class="toolbar">
      <div class="field"><label>Periode</label><input type="month" id="vaBulan" value="${State.periode.bulan}"></div>
      <div class="field"><label>Bandingkan dengan</label><select id="vaMode">
        <option value="anggaran" ${mode==='anggaran'?'selected':''}>Anggaran</option>
        <option value="periode" ${mode==='periode'?'selected':''}>Periode Sebelumnya (${namaBulan(pm)})</option>
      </select></div>
    </div>
    <p class="muted">Ambang materialitas: selisih ≥ Rp 100.000 <b>dan</b> ≥ 10%.</p>
    <div class="card"><div class="hd"><h3>Analisis Varians — Aktual vs ${esc(r.baseLabel)}</h3></div>
    <div class="bd nopad"><div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Kode</th><th>Akun</th><th>Jenis</th><th class="num">Aktual</th><th class="num">Pembanding</th><th class="num">Selisih</th><th class="num">%</th><th>Arah</th><th>Flag</th></tr></thead>
      <tbody>${rows||'<tr><td colspan="9" class="muted" style="text-align:center;padding:20px">Belum ada data.</td></tr>'}</tbody>
    </table></div></div></div>`;
  document.getElementById('vaBulan').onchange=(e)=>{State.periode.bulan=e.target.value;viewVarians();};
  document.getElementById('vaMode').onchange=(e)=>{State._varMode=e.target.value;viewVarians();};
}

/* ============ REKONSILIASI BANK ============ */
async function viewRekonsiliasi(){
  const bankAccs=State.accounts.filter(a=>a.isCash);
  const list=await api('GET',burl('/bank-recs'));
  const opts=bankAccs.map(a=>`<option value="${a.code}">${a.code} — ${esc(a.name)}</option>`).join('');
  const histori=list.recs.map(r=>{
    const a=State.accounts.find(x=>x.code===r.accountCode);
    const selisih=(r.glBalance!==undefined? r.glBalance:0);
    return `<tr><td>${esc(r.statementDate||'')}</td><td>${esc(a?a.name:r.accountCode)}</td><td class="num">${fmtNum(r.statementBalance)}</td><td>${esc(r.note||'')}</td><td class="right">${bookRO()?'':`<button class="btn abu kecil" data-del="${r.id}">Hapus</button>`}</td></tr>`;
  }).join('')||'<tr><td colspan="5" class="muted" style="text-align:center;padding:16px">Belum ada rekonsiliasi.</td></tr>';
  content().innerHTML=`
    ${bookRO()?'':`<div class="card"><div class="hd"><h3>Rekonsiliasi Bank Baru</h3></div><div class="bd">
      <div id="rkMsg"></div>
      <div class="flex">
        <div class="field" style="flex:1"><label>Akun Bank/Kas</label><select id="rkAcc">${opts}</select></div>
        <div class="field" style="flex:1"><label>Tanggal Rekening Koran</label><input type="date" id="rkDate" value="${todayStr()}"></div>
        <div class="field" style="flex:1"><label>Saldo Menurut Bank (Rp)</label><input type="number" id="rkBal" placeholder="0"></div>
      </div>
      <div id="rkHitung" class="mt"></div>
      <div class="field"><label>Catatan</label><input id="rkNote" placeholder="mis. selisih biaya admin bank"></div>
      <button class="btn hijau" id="rkCek">Hitung Selisih</button>
      <button class="btn" id="rkSimpan">Simpan</button>
    </div></div>`}
    <div class="card"><div class="hd"><h3>Riwayat Rekonsiliasi</h3></div><div class="bd nopad"><div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Tanggal</th><th>Akun</th><th class="num">Saldo Bank</th><th>Catatan</th><th></th></tr></thead><tbody>${histori}</tbody></table></div></div></div>`;
  content().querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{ if(!confirm('Hapus?'))return; await api('DELETE',burl('/bank-recs/'+b.dataset.del)); viewRekonsiliasi(); });
  if(bookRO())return;
  const hitung=async()=>{
    const code=document.getElementById('rkAcc').value; const to=document.getElementById('rkDate').value;
    const bal=Number(document.getElementById('rkBal').value)||0;
    const led=await api('GET',burl('/reports/ledger',{code,to}));
    const gl=led.saldoAkhir; const selisih=bal-gl;
    document.getElementById('rkHitung').innerHTML=`<div class="pesan ${Math.abs(selisih)<1?'ok':'err'}">
      Saldo Buku Besar (GL): <b>${fmtRp(gl)}</b> — Saldo Bank: <b>${fmtRp(bal)}</b><br>
      Selisih: <b>${fmtRp(selisih)}</b> ${Math.abs(selisih)<1?'✅ Cocok':'⚠️ Perlu ditelusuri (mis. biaya admin, transaksi belum tercatat, cek dalam perjalanan)'}</div>`;
    return {gl,selisih};
  };
  document.getElementById('rkCek').onclick=hitung;
  document.getElementById('rkSimpan').onclick=async()=>{
    const code=document.getElementById('rkAcc').value;
    try{
      await api('POST',burl('/bank-recs'),{accountCode:code,statementDate:document.getElementById('rkDate').value,statementBalance:Number(document.getElementById('rkBal').value)||0,note:document.getElementById('rkNote').value});
      viewRekonsiliasi();
    }catch(e){ document.getElementById('rkMsg').innerHTML=`<div class="pesan err">${esc(e.message)}</div>`; }
  };
}

/* ============ ADMIN ============ */
async function viewAdmin(){
  const r=await api('GET','/api/admin/users');
  const rows=r.users.map(u=>`<tr>
      <td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${esc(u.companyName)}</td>
      <td><span class="badge ${u.role==='admin'?'admin':''}">${u.role==='admin'?'Admin':'Pengguna'}</span></td>
      <td class="num">${u.jumlahJurnal}</td>
      <td class="right">
        <button class="btn abu kecil" data-view="${u.companyId}" data-name="${esc(u.companyName)}">👁️ Lihat Data</button>
        ${u.id===State.user.id?'':`<button class="btn abu kecil" data-role="${u.id}" data-cur="${u.role}">Ubah Peran</button>
        <button class="btn abu kecil" data-del="${u.id}">Hapus</button>`}
      </td></tr>`).join('');
  content().innerHTML=`
    <div class="card"><div class="hd"><h3>Kelola Pengguna</h3><span class="muted">${r.users.length} pengguna</span></div>
    <div class="bd nopad"><div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Nama</th><th>Email</th><th>Perusahaan</th><th>Peran</th><th class="num">Jurnal</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table></div></div></div>
    <p class="muted">Klik <b>Lihat Data</b> untuk memeriksa laporan keuangan & jurnal pengguna (mode baca-saja).</p>`;
  content().querySelectorAll('[data-view]').forEach(b=>b.onclick=async()=>{
    State.viewCompanyId=b.dataset.view; State.viewCompanyName=b.dataset.name;
    await loadAccounts(); State.view='dashboard'; renderApp();
  });
  content().querySelectorAll('[data-role]').forEach(b=>b.onclick=async()=>{
    const nr=b.dataset.cur==='admin'?'user':'admin';
    if(!confirm(`Ubah peran menjadi ${nr}?`))return;
    await api('POST','/api/admin/set-role',{userId:b.dataset.role,role:nr}); viewAdmin();
  });
  content().querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{
    if(!confirm('Hapus pengguna ini beserta seluruh datanya? Tindakan tidak dapat dibatalkan.'))return;
    try{ await api('DELETE','/api/admin/users/'+b.dataset.del); viewAdmin(); }catch(e){ alert(e.message); }
  });
}

/* ============ KELOLA LIBUR (owner-only, global) ============ */
function parseLiburText(text){
  const out=[];
  (text||'').split(/\r?\n/).forEach(line=>{
    line=(line||'').trim(); if(!line) return;
    const m=line.match(/^(\d{4}-\d{2}-\d{2})[\s,;\t]+(.+)$/);
    if(m) out.push({date:m[1], nama:m[2].trim()});
  });
  return out;
}
async function viewLibur(){
  const r=await api('GET','/api/consult/holidays');
  const holidays=(r.holidays||[]).slice().sort((a,b)=>a.date.localeCompare(b.date));
  const holMap={}; holidays.forEach(h=>holMap[h.date]=h);
  const rows=holidays.map(h=>`<tr>
      <td>${esc(h.date)}</td><td>${esc(h.nama)}</td>
      <td>${h.custom?'<span class="chip aset">Ditambahkan</span>':'<span class="chip">Tetap</span>'}</td>
      <td class="right">${h.custom?`<button class="btn abu kecil" data-holdel="${h.date}">Hapus</button>`:''}</td></tr>`).join('')||'<tr><td colspan="4" class="muted" style="text-align:center;padding:12px">Belum ada.</td></tr>';
  const CALCSS=`<style>
    .lb-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:3px}
    .lb-head{text-align:center;font-size:11px;font-weight:600;color:var(--teks2);padding:3px 0}
    .lb-head.sun{color:#c0392b}
    .lb-cell{position:relative;text-align:center;padding:8px 0;font-size:12.5px;border-radius:6px;cursor:pointer;border:1px solid transparent}
    .lb-cell.empty{cursor:default}
    .lb-cell:not(.empty):hover{background:var(--garis2)}
    .lb-cell.sun{color:#c0392b}
    .lb-cell.hol{background:#fde8e8;color:#c0392b;font-weight:700}
    .lb-cell.today{border-color:var(--aksen)}
    .lb-dot{position:absolute;bottom:3px;left:50%;transform:translateX(-50%);width:5px;height:5px;border-radius:50%;background:#c0392b}
  </style>`;
  content().innerHTML=`${CALCSS}
    <div class="card"><div class="hd"><h3>📅 Kelola Kalender Libur (Global)</h3><span class="muted">${holidays.length} tanggal</span></div>
    <div class="bd">
      <p class="muted" style="margin-top:0">Kalender ini <b>berlaku untuk SEMUA pengguna</b> — cukup Anda (pemilik) yang kelola. Tenggat <b>SPT Masa</b> yang jatuh di Sabtu/Minggu/libur otomatis mundur ke hari kerja berikutnya. Libur tanggal-tetap (1 Jan, 1 Mei, 1 Jun, 17 Agu, 25 Des) sudah termasuk otomatis.</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
        <div class="card"><div class="hd"><h3>⚡ Impor Cepat</h3></div><div class="bd">
          <p class="muted" style="margin-top:0;font-size:12.5px">Data bawaan <b>SKB 3 Menteri 2026</b> (sumber: Setneg, diambil 2026-09-02). ⚠️ <b>Verifikasi ulang</b> ke SKB resmi — cuti bersama bisa direvisi pemerintah.</p>
          <button class="btn hijau" id="loadBawaan">📥 Muat Libur 2026 (SKB 3 Menteri)</button>
        </div></div>
        <div class="card"><div class="hd"><h3>✍️ Tempel Manual</h3></div><div class="bd">
          <p class="muted" style="margin-top:0;font-size:12.5px">Tempel daftar (satu per baris): <code>2026-01-01 Tahun Baru</code> — pemisah spasi/koma/tab.</p>
          <textarea id="pasteLibur" rows="5" style="width:100%;font-family:monospace;font-size:12px" placeholder="2026-01-01 Tahun Baru Masehi&#10;2026-03-19 Hari Suci Nyepi"></textarea>
          <button class="btn hijau" id="importPaste" style="margin-top:6px">Impor dari Tempelan</button>
          <div id="pasteMsg" style="margin-top:6px;font-size:12.5px"></div>
        </div></div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:14px;margin-top:14px">
        <div class="card" style="flex:0 0 320px"><div class="hd"><h3>🗓️ Kalender</h3></div><div class="bd">
          <div id="calBox"></div>
          <p class="muted" style="font-size:11px;margin:8px 0 0">🔴 libur/cuti bersama. Klik tanggal kosong untuk <b>menambah</b>; klik tanggal merah "ditambahkan" untuk <b>menghapus</b>.</p>
        </div></div>
        <div class="card" style="flex:1;min-width:280px"><div class="hd"><h3>Daftar Libur</h3><span class="muted">${holidays.length} tanggal</span></div>
          <div class="bd nopad"><div class="tbl-wrap"><table class="tbl">
            <thead><tr><th>Tanggal</th><th>Nama</th><th>Jenis</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></div></div>
      </div>
    </div></div>`;
  document.getElementById('loadBawaan').onclick=async()=>{
    try{
      const bw=await api('GET','/api/consult/holidays/bawaan?tahun=2026');
      const res=await api('POST','/api/consult/holidays/import',{items:bw.items});
      alert(`Impor libur 2026 selesai: ${res.ditambah} ditambah, ${res.dilewati} dilewati (sudah tercakup).`);
      viewLibur();
    }catch(e){ alert(e.message); }
  };
  document.getElementById('importPaste').onclick=async()=>{
    const items=parseLiburText(document.getElementById('pasteLibur').value);
    if(!items.length){ document.getElementById('pasteMsg').innerHTML='<span class="neg">Tidak ada baris valid (format: YYYY-MM-DD Nama).</span>'; return; }
    try{ const res=await api('POST','/api/consult/holidays/import',{items}); alert(`Impor selesai: ${res.ditambah} ditambah, ${res.dilewati} dilewati.`); viewLibur(); }
    catch(e){ alert(e.message); }
  };
  content().querySelectorAll('[data-holdel]').forEach(b=>b.onclick=async()=>{ if(!confirm('Hapus libur ini?'))return; try{ await api('DELETE','/api/consult/holidays/'+b.dataset.holdel); viewLibur(); }catch(e){alert(e.message);} });
  // ---- Kalender ----
  const BULAN=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  const DOW=['Min','Sen','Sel','Rab','Kam','Jum','Sab'];
  let calY=(State.liburCal&&State.liburCal.y)||new Date().getFullYear();
  let calM=(State.liburCal&&State.liburCal.m!=null)?State.liburCal.m:new Date().getMonth();
  const pad2=n=>String(n).padStart(2,'0');
  const calHTML=(y,m)=>{
    const startDow=new Date(Date.UTC(y,m,1)).getUTCDay();
    const dim=new Date(Date.UTC(y,m+1,0)).getUTCDate();
    const todayStr=new Date().toISOString().slice(0,10);
    let cells='';
    for(let i=0;i<startDow;i++) cells+='<div class="lb-cell empty"></div>';
    for(let d=1;d<=dim;d++){
      const ds=y+'-'+pad2(m+1)+'-'+pad2(d);
      const dow=new Date(Date.UTC(y,m,d)).getUTCDay();
      const hol=holMap[ds];
      const cls=['lb-cell']; if(hol)cls.push('hol'); else if(dow===0)cls.push('sun'); if(ds===todayStr)cls.push('today');
      cells+=`<div class="${cls.join(' ')}" data-day="${ds}" title="${esc(hol?hol.nama:'')}">${d}${hol?'<span class="lb-dot"></span>':''}</div>`;
    }
    const head=DOW.map((n,i)=>`<div class="lb-head ${i===0?'sun':''}">${n}</div>`).join('');
    return `<div class="flex" style="align-items:center;gap:6px;margin-bottom:8px">
        <button class="btn abu kecil" id="calPrev">‹</button>
        <b style="flex:1;text-align:center">${BULAN[m]} ${y}</b>
        <button class="btn abu kecil" id="calNext">›</button></div>
      <div class="lb-grid">${head}${cells}</div>`;
  };
  const onDay=async(ds)=>{
    const hol=holMap[ds];
    if(hol){
      if(hol.custom){ if(confirm(`Hapus libur "${hol.nama}" (${ds})?`)){ try{ await api('DELETE','/api/consult/holidays/'+ds); viewLibur(); }catch(e){alert(e.message);} } }
      else alert(`${ds}: ${hol.nama}\n(libur tetap — tidak bisa dihapus).`);
      return;
    }
    const nama=prompt('Tambah libur untuk '+ds+'\nNama libur:');
    if(nama&&nama.trim()){ try{ await api('POST','/api/consult/holidays',{date:ds,nama:nama.trim()}); viewLibur(); }catch(e){alert(e.message);} }
  };
  const drawCal=()=>{
    State.liburCal={y:calY,m:calM};
    const box=document.getElementById('calBox'); if(!box)return;
    box.innerHTML=calHTML(calY,calM);
    box.querySelector('#calPrev').onclick=()=>{ calM--; if(calM<0){calM=11;calY--;} drawCal(); };
    box.querySelector('#calNext').onclick=()=>{ calM++; if(calM>11){calM=0;calY++;} drawCal(); };
    box.querySelectorAll('.lb-cell[data-day]').forEach(c=>c.onclick=()=>onDay(c.dataset.day));
  };
  drawCal();
}

/* ============ PENGATURAN ============ */
async function viewPengaturan(){
  content().innerHTML=`
    <div class="card" style="max-width:520px"><div class="hd"><h3>Profil & Perusahaan</h3></div><div class="bd">
      <div id="stMsg"></div>
      <div class="field"><label>Nama Anda</label><input value="${esc(State.user.name)}" disabled></div>
      <div class="field"><label>Email</label><input value="${esc(State.user.email)}" disabled></div>
      <div class="field"><label>Nama Perusahaan / Usaha</label><input id="stComp" value="${esc(State.company?State.company.name:'')}"></div>
      <button class="btn hijau" id="stSimpan">Simpan Perubahan</button>
    </div></div>`;
  document.getElementById('stSimpan').onclick=async()=>{
    try{ const r=await api('PUT','/api/company',{name:document.getElementById('stComp').value}); State.company=r.company;
      document.getElementById('stMsg').innerHTML='<div class="pesan ok">Tersimpan.</div>'; renderApp(); }
    catch(e){ document.getElementById('stMsg').innerHTML=`<div class="pesan err">${esc(e.message)}</div>`; }
  };
}

/* ============ IMPOR & AI ============ */
function readFile(file, asBase64){
  return new Promise((resolve,reject)=>{
    const r=new FileReader();
    r.onload=()=>{ if(asBase64){ const s=String(r.result); resolve(s.slice(s.indexOf(',')+1)); } else resolve(String(r.result)); };
    r.onerror=()=>reject(new Error('Gagal membaca file.'));
    if(asBase64) r.readAsDataURL(file); else r.readAsText(file);
  });
}
// Kompres foto (nota dari HP bisa beberapa MB) sebelum unggah. Non-gambar dikembalikan apa adanya.
// Mengembalikan {filename, mime, base64}.
function fileToAttachment(file){
  return new Promise(async (resolve,reject)=>{
    try{
      if(!/^image\//.test(file.type) || file.type==='image/gif'){
        return resolve({ filename:file.name, mime:file.type||'application/octet-stream', base64:await readFile(file,true) });
      }
      const dataUrl=await new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(String(r.result)); r.onerror=()=>rej(new Error('baca gagal')); r.readAsDataURL(file); });
      const img=new Image();
      img.onload=()=>{
        const MAX=1600; let {width:w,height:h}=img;
        if(w>MAX||h>MAX){ const s=Math.min(MAX/w,MAX/h); w=Math.round(w*s); h=Math.round(h*s); }
        const cv=document.createElement('canvas'); cv.width=w; cv.height=h;
        cv.getContext('2d').drawImage(img,0,0,w,h);
        const out=cv.toDataURL('image/jpeg',0.72);
        resolve({ filename:file.name.replace(/\.(png|webp|bmp|heic|heif)$/i,'.jpg'), mime:'image/jpeg', base64:out.slice(out.indexOf(',')+1) });
      };
      img.onerror=()=>{ readFile(file,true).then(b=>resolve({filename:file.name,mime:file.type||'application/octet-stream',base64:b})).catch(reject); };
      img.src=dataUrl;
    }catch(e){ reject(e); }
  });
}
function fmtBytes(n){ n=Number(n)||0; if(n<1024)return n+' B'; if(n<1048576)return (n/1024).toFixed(0)+' KB'; return (n/1048576).toFixed(1)+' MB'; }
function confBadge(row){
  const p=Math.round((row.confidence||0)*100);
  if(row.source==='belajar') return `<span class="chip baik" title="Dipelajari dari kebiasaan Anda">AI ${p}%</span>`;
  if(row.source==='aturan') return `<span class="chip aset" title="Aturan kata kunci">Aturan ${p}%</span>`;
  return `<span class="chip" style="background:var(--garis2);color:var(--teks2)">Default</span>`;
}
async function viewImpor(){
  const bankAccs=State.accounts.filter(a=>a.isCash);
  const acctOpts=(sel)=>State.accounts.map(a=>`<option value="${a.code}" ${a.code===sel?'selected':''}>${a.code} — ${esc(a.name)}</option>`).join('');
  const bankOpts=bankAccs.map(a=>`<option value="${a.code}">${a.code} — ${esc(a.name)}</option>`).join('');
  const [list,rulesR]=await Promise.all([api('GET','/api/import'+q({})),api('GET','/api/rules'+q({}))]);
  const hist=list.imports.map(b=>`<tr><td>${esc(b.createdAt.slice(0,10))}</td><td>${({csv:'CSV',xlsx:'Excel',ocr:'Nota/PDF (AI)'})[b.source]||b.source}</td><td>${esc(b.filename||'')}</td><td class="num">${b.terposting}/${b.jumlah}</td><td class="right"><button class="btn abu kecil" data-open="${b.id}">Buka</button> ${bookRO()?'':`<button class="btn abu kecil" data-del="${b.id}">Hapus</button>`}</td></tr>`).join('')||'<tr><td colspan="5" class="muted" style="text-align:center;padding:16px">Belum ada impor.</td></tr>';
  const rulesRows=(rulesR.rules||[]).map(r=>{const a=State.accounts.find(x=>x.code===r.counterCode);return `<tr><td>keterangan berisi "<b>${esc(r.contains)}</b>"${r.arah?` (${r.arah})`:''}</td><td>→ ${esc(a?a.name:r.counterCode)}</td><td class="right">${bookRO()?'':`<button class="btn abu kecil" data-drule="${r.id}">Hapus</button>`}</td></tr>`;}).join('')||'<tr><td colspan="3" class="muted" style="text-align:center;padding:14px">Belum ada aturan tetap. Buat lewat "Terapkan massal" saat review impor.</td></tr>';

  content().innerHTML=`
    ${bookBanner()}
    ${bookRO()?'':`
    <div class="grid k3">
      <div class="card"><div class="hd"><h3>📄 Impor Rekening Koran (CSV / Excel)</h3></div><div class="bd">
        <div class="field"><label>Akun Kas/Bank tujuan</label><select id="impBank">${bankOpts}</select></div>
        <div class="field"><label>Pilih file (.csv atau .xlsx)</label><input type="file" id="impFile" accept=".csv,.xlsx"></div>
        <button class="btn hijau" id="impProses">Proses & Klasifikasi Otomatis</button>
        <p class="muted mt">Sistem akan membaca transaksi, menebak akun (belajar dari kebiasaan Anda), mencocokkan dengan jurnal yang sudah ada, dan menandai anomali.</p>
      </div></div>
      <div class="card"><div class="hd"><h3>🧾 Impor Nota / Invoice (Foto / PDF) — AI</h3></div><div class="bd">
        <div class="field"><label>Akun Kas/Bank pembayaran</label><select id="ocrBank">${bankOpts}</select></div>
        <div class="field"><label>Pilih gambar/PDF (JPG, PNG, PDF)</label><input type="file" id="ocrFile" accept="image/*,.pdf"></div>
        <button class="btn hijau" id="ocrProses">Baca dengan AI (OCR)</button>
        <p class="muted mt">Membutuhkan kunci API AI aktif (Setelan AI). AI membaca nota lalu membuat transaksi otomatis.</p>
        <div id="ocrMsg"></div>
      </div></div>
    </div>`}
    <div id="batchArea"></div>
    <div class="card"><div class="hd"><h3>🔖 Aturan Otomatis (keterangan → akun)</h3><span class="muted">${(rulesR.rules||[]).length} aturan</span></div><div class="bd nopad"><div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Jika keterangan…</th><th>Akun</th><th></th></tr></thead>
      <tbody>${rulesRows}</tbody></table></div></div></div>
    <div class="card"><div class="hd"><h3>Riwayat Impor</h3></div><div class="bd nopad"><div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Tanggal</th><th>Sumber</th><th>File</th><th class="num">Terposting</th><th></th></tr></thead>
      <tbody>${hist}</tbody></table></div></div></div>`;

  content().querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>bukaBatch(b.dataset.open));
  content().querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{ if(!confirm('Hapus batch impor ini?'))return; await api('DELETE','/api/import/'+b.dataset.del); viewImpor(); });
  content().querySelectorAll('[data-drule]').forEach(b=>b.onclick=async()=>{ if(!confirm('Hapus aturan ini?'))return; await api('DELETE','/api/rules/'+b.dataset.drule); viewImpor(); });
  if(bookRO())return;

  document.getElementById('impProses').onclick=async()=>{
    const f=document.getElementById('impFile').files[0]; if(!f){alert('Pilih file dulu.');return;}
    const bank=document.getElementById('impBank').value;
    const btn=document.getElementById('impProses'); btn.disabled=true; btn.textContent='Memproses…';
    try{
      const isX=/\.xlsx$/i.test(f.name);
      const payload={kind:isX?'xlsx':'csv',filename:f.name,bankAccountCode:bank};
      if(isX) payload.base64=await readFile(f,true); else payload.text=await readFile(f,false);
      const r=await api('POST','/api/import/parse',withBook(payload));
      renderBatch(r.batch);
    }catch(e){ alert(e.message); } finally{ btn.disabled=false; btn.textContent='Proses & Klasifikasi Otomatis'; }
  };
  document.getElementById('ocrProses').onclick=async()=>{
    const f=document.getElementById('ocrFile').files[0]; if(!f){alert('Pilih file dulu.');return;}
    const bank=document.getElementById('ocrBank').value;
    const btn=document.getElementById('ocrProses'); btn.disabled=true; btn.textContent='AI membaca…';
    try{
      const base64=await readFile(f,true);
      const r=await api('POST','/api/ai/ocr',withBook({base64,mediaType:f.type||'image/jpeg',filename:f.name,bankAccountCode:bank}));
      document.getElementById('ocrMsg').innerHTML=`<div class="pesan ok">Terbaca: <b>${esc(r.extracted.vendor||'')}</b> — Total ${fmtRp(r.extracted.total||0)}</div>`;
      renderBatch(r.batch);
    }catch(e){ document.getElementById('ocrMsg').innerHTML=`<div class="pesan err">${esc(e.message)}</div>`; } finally{ btn.disabled=false; btn.textContent='Baca dengan AI (OCR)'; }
  };
}
async function bukaBatch(id){ const r=await api('GET','/api/import/'+id+q({})); renderBatch(r.batch); window.scrollTo(0,0); }
const PAGE_IMPOR=100;
function jenisFE(code,splits){
  if(splits&&splits.length) return 'Pecahan ('+splits.length+' akun)';
  const a=State.accounts.find(x=>x.code===code); if(!a) return 'Lainnya';
  if(a.isCash) return 'Pemindahan Kas';
  if(a.code==='1-1300') return 'Pelunasan Piutang';
  if(a.category==='LIABILITAS') return 'Pelunasan Utang';
  if(a.code==='3-1200') return 'Prive';
  if(a.code==='3-1100') return 'Setor Modal';
  if(a.category==='EKUITAS') return 'Ekuitas';
  if(a.category==='PENDAPATAN') return 'Pendapatan';
  if(a.category==='BEBAN') return 'Beban';
  if(a.category==='ASET') return 'Aset / Uang Muka';
  return 'Lainnya';
}
function jenisChipCls(label){
  if(label.startsWith('Pemindahan')) return 'aset';
  if(label.startsWith('Pelunasan')||label==='Prive'||label==='Setor Modal'||label==='Ekuitas') return 'baik';
  if(label.startsWith('Pecahan')) return 'beban';
  return '';
}
function renderBatch(batch){ window._curBatch=batch; window._batchPage=0; drawBatch(); }
function drawBatch(){
  const batch=window._curBatch; if(!batch)return;
  const ro=bookRO();
  const total=batch.rows.length;
  const pages=Math.max(1,Math.ceil(total/PAGE_IMPOR));
  let pg=window._batchPage||0; if(pg>=pages)pg=pages-1; if(pg<0)pg=0; window._batchPage=pg;
  const start=pg*PAGE_IMPOR, end=Math.min(start+PAGE_IMPOR,total);
  const optBase=State.accounts.map(a=>`<option value="${a.code}">${a.code} — ${esc(a.name)}</option>`).join('');
  const pageRows=batch.rows.slice(start,end).map(row=>{
    const matched=!!row.matchedJournalId;
    const split=row.splits&&row.splits.length;
    const sel=optBase.replace(`value="${row.suggestedCode}"`,`value="${row.suggestedCode}" selected`);
    const jlabel=jenisFE(row.suggestedCode,row.splits);
    const akunCell=split
      ? `<span class="chip aset">Dipecah (${row.splits.length} akun)</span>`
      : `<select class="rw-acc" ${ro||row.posted?'disabled':''} style="min-width:190px">${sel}</select>`;
    return `<tr data-row="${row.id}" style="${row.posted?'opacity:.55':''}">
      <td>${esc(row.tanggal)}</td>
      <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(row.keterangan)}">${esc(row.keterangan)}</td>
      <td>${row.arah==='masuk'?'<span class="chip baik">Masuk</span>':'<span class="chip buruk">Keluar</span>'}</td>
      <td class="num">${fmtNum(row.nominal)}</td>
      <td>${akunCell}<div style="margin-top:4px"><span class="chip ${jenisChipCls(jlabel)}">${jlabel}</span>${ro||row.posted?'':` <a href="#" class="rw-split" style="font-size:12px;margin-left:4px">pecah/pajak</a>`}</div></td>
      <td>${confBadge(row)}</td>
      <td>${(row.anomali||[]).map(a=>`<span class="chip buruk">${esc(a)}</span>`).join(' ')}${matched?'<span class="chip aset" title="Sudah ada jurnal serupa">cocok</span>':''}</td>
      <td style="text-align:center">${row.posted?'✅':`<input type="checkbox" class="rw-skip" ${row.skip||matched?'checked':''} ${ro?'disabled':''}>`}</td>
    </tr>`;
  }).join('');
  const belumPosting=batch.rows.filter(r=>!r.posted&&!r.skip&&!r.matchedJournalId).length;
  const anomCount=batch.rows.filter(r=>(r.anomali||[]).length).length;
  const matchCount=batch.rows.filter(r=>r.matchedJournalId).length;
  const bankAcc=State.accounts.find(a=>a.code===batch.bankAccountCode);
  const pager=pages>1?`<div class="flex" style="justify-content:center;padding:12px;gap:12px">
      <button class="btn abu kecil" id="pgPrev" ${pg===0?'disabled':''}>‹ Sebelumnya</button>
      <span class="muted">Halaman ${pg+1} / ${pages} (baris ${start+1}–${end} dari ${total})</span>
      <button class="btn abu kecil" id="pgNext" ${pg>=pages-1?'disabled':''}>Berikutnya ›</button></div>`:'';
  const bulkBar=ro?'':`<div class="bd" style="border-top:1px solid var(--garis2)">
      <div class="flex" style="gap:10px;align-items:end">
        <div class="field" style="margin:0"><label>Terapkan massal — keterangan berisi</label><input id="bulkFilter" placeholder="mis. qris, andi, dana"></div>
        <div class="field" style="margin:0;min-width:220px"><label>Set semua yang cocok ke akun</label><select id="bulkAcc">${optBase}</select></div>
        <label style="font-size:12.5px"><input type="checkbox" id="bulkRule"> simpan sebagai aturan tetap</label>
        <button class="btn abu" id="bulkApply">Terapkan</button>
      </div>
      <div id="bulkMsg" class="muted" style="margin-top:6px">Ubah banyak baris sekaligus. Centang "aturan tetap" agar impor berikutnya otomatis mengikuti. 💡</div>
    </div>`;
  const el=document.getElementById('batchArea');
  el.innerHTML=`<div class="card"><div class="hd">
      <h3>Review Impor — ${total} transaksi ${bankAcc?'• '+esc(bankAcc.name):''}</h3>
      ${ro?'':`<button class="btn hijau" id="postBatch" ${belumPosting?'':'disabled'}>Posting ${belumPosting} Transaksi ke Jurnal</button>`}</div>
    <div class="bd" style="padding-bottom:0">
      <div class="flex" style="gap:8px">
        <span class="chip aset">${matchCount} cocok (dilewati)</span>
        <span class="chip buruk">${anomCount} anomali</span>
        <span class="muted">Kolom <b>Akun</b> bisa diubah; label di bawahnya menunjukkan jenis transaksi (Beban, Pemindahan Kas, Pelunasan Piutang…). Koreksi melatih AI. 💡</span>
      </div>
    </div>
    ${bulkBar}
    ${batch.warnings&&batch.warnings.length?`<div class="bd"><div class="pesan err">${batch.warnings.map(esc).join('<br>')}</div></div>`:''}
    <div class="bd nopad"><div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Tanggal</th><th>Keterangan</th><th>Arah</th><th class="num">Nominal</th><th>Akun / Jenis</th><th>Keyakinan</th><th>Catatan</th><th>Lewati</th></tr></thead>
      <tbody>${pageRows}</tbody></table></div></div>
    ${pager}
    </div>`;
  if(!ro){
    el.querySelectorAll('tr[data-row]').forEach(tr=>{
      const rid=tr.dataset.row;
      const accSel=tr.querySelector('.rw-acc'); const skip=tr.querySelector('.rw-skip'); const splitLink=tr.querySelector('.rw-split');
      if(accSel) accSel.onchange=()=>{ const r=batch.rows.find(x=>x.id===rid); if(r){r.suggestedCode=accSel.value;r.splits=null;} api('POST','/api/import/'+batch.id+'/row',{rowId:rid,suggestedCode:accSel.value}).then(drawBatch); };
      if(skip) skip.onchange=()=>{ const r=batch.rows.find(x=>x.id===rid); if(r)r.skip=skip.checked; api('POST','/api/import/'+batch.id+'/row',{rowId:rid,skip:skip.checked}); };
      if(splitLink) splitLink.onclick=(e)=>{ e.preventDefault(); splitModal(batch, batch.rows.find(x=>x.id===rid)); };
    });
    const bulkApply=document.getElementById('bulkApply');
    if(bulkApply) bulkApply.onclick=async()=>{
      const filter=document.getElementById('bulkFilter').value.trim();
      const counterCode=document.getElementById('bulkAcc').value;
      const alsoRule=document.getElementById('bulkRule').checked;
      if(!filter){ document.getElementById('bulkMsg').innerHTML='<span class="neg">Isi kata kunci dulu.</span>'; return; }
      bulkApply.disabled=true;
      try{
        const r=await api('POST','/api/import/'+batch.id+'/bulk',{filter,counterCode,alsoRule});
        window._curBatch=r.batch; drawBatch();
        const msg=document.getElementById('bulkMsg'); if(msg) msg.innerHTML=`<span class="pos">${r.terpengaruh} baris diperbarui${alsoRule?' & aturan tetap disimpan':''}.</span>`;
      }catch(e){ alert(e.message); } finally{ bulkApply.disabled=false; }
    };
    const pb=document.getElementById('postBatch');
    if(pb) pb.onclick=async()=>{
      if(!confirm(`Buat ${belumPosting} jurnal dari transaksi ini?`))return;
      pb.disabled=true; pb.textContent='Memposting…';
      try{ const r=await api('POST','/api/import/'+batch.id+'/post',{}); alert(`${r.dibuat} jurnal berhasil dibuat.`); bukaBatch(batch.id); }
      catch(e){ alert(e.message); pb.disabled=false; }
    };
  }
  const prev=document.getElementById('pgPrev'), next=document.getElementById('pgNext');
  if(prev) prev.onclick=()=>{ window._batchPage=pg-1; drawBatch(); };
  if(next) next.onclick=()=>{ window._batchPage=pg+1; drawBatch(); };
}

/* ---- Modal pecah transaksi + PPN ---- */
function splitModal(batch,row){
  const optBase=State.accounts.map(a=>`<option value="${a.code}">${a.code} — ${esc(a.name)}</option>`).join('');
  const ppnAkun=row.arah==='masuk'?'2-1210':'1-1600'; // keluaran / masukan
  const wrap=document.createElement('div'); wrap.className='modal-bg';
  wrap.innerHTML=`<div class="modal" style="max-width:640px"><div class="hd"><h3>Pecah Transaksi / Pisah Pajak</h3><button class="x">&times;</button></div>
    <div class="bd">
      <p class="muted">Transaksi <b>${esc(row.keterangan)}</b> — total <b>${fmtRp(row.nominal)}</b> (${row.arah}). Pecah ke beberapa akun; total pecahan harus sama dengan nominal.</p>
      <div id="spMsg"></div>
      <div id="spLines"></div>
      <button class="btn abu kecil mt" id="spAdd">+ Tambah Baris</button>
      <button class="btn abu kecil mt" id="spPPN">Isi otomatis PPN 11%</button>
      <div class="flex mt"><span id="spTot" class="muted"></span><div class="spacer"></div>
        <button class="btn abu" id="spBatal">Batal</button><button class="btn hijau" id="spSimpan">Simpan Pecahan</button></div>
    </div></div>`;
  document.body.appendChild(wrap);
  const box=wrap.querySelector('#spLines');
  function addLine(code,amount){
    const r=document.createElement('div'); r.className='jline'; r.style.gridTemplateColumns='2.4fr 1.2fr auto';
    const sel=code?optBase.replace(`value="${code}"`,`value="${code}" selected`):optBase;
    r.innerHTML=`<select class="sp-acc">${sel}</select><input class="sp-amt" type="number" min="0" step="any" placeholder="Jumlah" value="${amount!=null?amount:''}"><button class="del">&times;</button>`;
    r.querySelector('.del').onclick=()=>{r.remove();hitung();};
    r.querySelector('.sp-amt').oninput=hitung;
    box.appendChild(r);
  }
  function hitung(){
    let t=0; box.querySelectorAll('.jline').forEach(r=>t+=Number(r.querySelector('.sp-amt').value)||0);
    const ok=Math.abs(t-row.nominal)<0.5;
    wrap.querySelector('#spTot').innerHTML=`Total pecahan: <b>${fmtNum(t)}</b> / ${fmtNum(row.nominal)} ${ok?'<span class="chip baik">Pas</span>':'<span class="chip buruk">Selisih '+fmtNum(row.nominal-t)+'</span>'}`;
  }
  if(row.splits&&row.splits.length) row.splits.forEach(s=>addLine(s.accountCode,s.amount)); else { addLine(row.suggestedCode,null); addLine(ppnAkun,null); }
  hitung();
  wrap.querySelector('#spAdd').onclick=()=>{addLine();hitung();};
  wrap.querySelector('#spPPN').onclick=()=>{
    // dasar = total/1,11 ; PPN = sisanya
    const dasar=Math.round(row.nominal/1.11); const ppn=row.nominal-dasar;
    box.innerHTML=''; addLine(row.suggestedCode,dasar); addLine(ppnAkun,ppn); hitung();
  };
  const close=()=>wrap.remove();
  wrap.querySelector('.x').onclick=close; wrap.querySelector('#spBatal').onclick=close;
  wrap.onclick=(e)=>{ if(e.target===wrap) close(); };
  wrap.querySelector('#spSimpan').onclick=async()=>{
    const splits=[...box.querySelectorAll('.jline')].map(r=>({accountCode:r.querySelector('.sp-acc').value,amount:Number(r.querySelector('.sp-amt').value)||0})).filter(s=>s.amount>0);
    try{
      const res=await api('POST','/api/import/'+batch.id+'/row',{rowId:row.id,splits});
      const r=batch.rows.find(x=>x.id===row.id); if(r)r.splits=res.row.splits;
      close(); drawBatch();
    }catch(e){ wrap.querySelector('#spMsg').innerHTML=`<div class="pesan err">${esc(e.message)}</div>`; }
  };
}

/* ============ INSIGHT AI ============ */
function mdToHtml(t){
  const lines=esc(t).split(/\r?\n/); let out=''; let inUl=false;
  const inline=(s)=>s.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');
  for(let ln of lines){
    if(/^\s*[-*]\s+/.test(ln)){ if(!inUl){out+='<ul>';inUl=true;} out+='<li>'+inline(ln.replace(/^\s*[-*]\s+/,''))+'</li>'; }
    else { if(inUl){out+='</ul>';inUl=false;} if(ln.trim()==='') out+='<br>'; else out+='<p style="margin:6px 0">'+inline(ln)+'</p>'; }
  }
  if(inUl)out+='</ul>';
  return out;
}
async function viewInsight(){
  content().innerHTML=`
    <div class="toolbar">
      <div class="field"><label>Periode</label><input type="month" id="insBulan" value="${State.periode.bulan}"></div>
      <button class="btn hijau" id="insBuat">💡 Buat Insight AI</button>
    </div>
    <p class="muted">AI membaca ringkasan laporan keuangan Anda dan menuliskan analisis + saran (bukan sekadar angka). Membutuhkan kunci API aktif (Setelan AI).</p>
    <div id="insHasil"></div>`;
  document.getElementById('insBulan').onchange=(e)=>{State.periode.bulan=e.target.value;};
  document.getElementById('insBuat').onclick=async()=>{
    const {from,to}=monthRange(State.periode.bulan);
    const btn=document.getElementById('insBuat'); btn.disabled=true; btn.textContent='AI menganalisis…';
    document.getElementById('insHasil').innerHTML='<div class="loader">AI sedang menganalisis laporan Anda…</div>';
    try{
      const body=withBook({from,to});
      const r=await api('POST','/api/ai/insight',body);
      document.getElementById('insHasil').innerHTML=`<div class="card"><div class="hd"><h3>Analisis AI — ${namaBulan(State.periode.bulan)}</h3></div><div class="bd">${mdToHtml(r.text)}</div></div>`;
    }catch(e){ document.getElementById('insHasil').innerHTML=`<div class="pesan err">${esc(e.message)}</div>`; }
    finally{ btn.disabled=false; btn.textContent='💡 Buat Insight AI'; }
  };
}

/* ============ DRAF SURAT DJP (AI, grounded) ============ */
async function viewSuratDJP(){
  content().innerHTML=`
    ${bookBanner()}
    <div class="card"><div class="hd"><h3>✉️ Draf Surat DJP (AI)</h3></div><div class="bd">
      <p class="muted" style="margin-top:0">AI menyusun draf surat pajak untuk <b>klien buku ini</b>, membumi ke datanya. ⚠️ Ini <b>DRAF</b> — wajib <b>diperiksa & disesuaikan konsultan</b> sebelum dikirim. Butuh kunci API aktif (Setelan AI).</p>
      <div class="flex">
        <div class="field" style="flex:1"><label>Jenis Surat</label><select id="sdJenis">
          <option value="sp2dk">Tanggapan SP2DK</option>
          <option value="keberatan">Surat Keberatan</option>
          <option value="pengurangan-sanksi">Permohonan Pengurangan/Penghapusan Sanksi</option>
          <option value="klarifikasi">Klarifikasi</option></select></div>
        <div class="field" style="flex:1"><label>Periode data pendukung</label><input type="month" id="sdBulan" value="${State.periode.bulan}"></div>
      </div>
      <div class="field"><label>Konteks / isi surat DJP / poin yang ditanggapi</label>
        <textarea id="sdKonteks" rows="5" placeholder="Tempel isi SP2DK atau tulis poin-poin yang perlu ditanggapi…"></textarea></div>
      <button class="btn hijau" id="sdBuat">✉️ Buat Draf</button>
      <div id="sdHasil" style="margin-top:14px"></div>
    </div></div>`;
  document.getElementById('sdBulan').onchange=(e)=>{State.periode.bulan=e.target.value;};
  document.getElementById('sdBuat').onclick=async()=>{
    const {from,to}=monthRange(State.periode.bulan);
    const body=withBook({jenis:document.getElementById('sdJenis').value,konteks:document.getElementById('sdKonteks').value,from,to});
    const btn=document.getElementById('sdBuat'); btn.disabled=true; btn.textContent='AI menyusun…';
    document.getElementById('sdHasil').innerHTML='<div class="loader">AI sedang menyusun draf surat…</div>';
    try{
      const r=await api('POST','/api/ai/surat-djp',body);
      document.getElementById('sdHasil').innerHTML=`<div class="card"><div class="hd"><h3>Draf Surat</h3><button class="btn abu kecil" id="sdCopy">📋 Salin</button></div><div class="bd">${mdToHtml(r.text)}</div></div>`;
      document.getElementById('sdCopy').onclick=()=>{ (navigator.clipboard?navigator.clipboard.writeText(r.text):Promise.reject()).then(()=>alert('Draf disalin. Tempel di pengolah kata untuk disunting & dicek.')).catch(()=>alert('Salin manual dari layar.')); };
    }catch(e){ document.getElementById('sdHasil').innerHTML=`<div class="pesan err">${esc(e.message)}</div>`; }
    finally{ btn.disabled=false; btn.textContent='✉️ Buat Draf'; }
  };
}

/* ============ SETELAN AI (admin) ============ */
async function viewSetelanAI(){
  const s=await api('GET','/api/settings/ai');
  content().innerHTML=`
    <div class="card" style="max-width:600px"><div class="hd"><h3>🤖 Setelan AI (Anthropic Claude)</h3></div><div class="bd">
      <div id="aiMsg"></div>
      <p class="muted">Kunci API dipakai untuk OCR nota/PDF dan insight. Dapatkan kunci di <b>console.anthropic.com</b> → API Keys. Setiap pemakaian AI dikenai biaya oleh Anthropic sesuai tarif mereka.</p>
      <div class="field"><label>Status Kunci API</label>
        <div>${s.hasKey?'<span class="chip baik">Terpasang</span>':'<span class="chip buruk">Belum diisi</span>'}</div></div>
      <div class="field"><label>Kunci API ${s.hasKey?'(isi untuk mengganti)':''}</label><input type="password" id="aiKey" placeholder="sk-ant-..."></div>
      <div class="field"><label>Model</label><input id="aiModel" value="${esc(s.model)}" placeholder="claude-3-5-sonnet-latest"></div>
      <div class="field"><label><input type="checkbox" id="aiEnabled" ${s.enabled?'checked':''}> Aktifkan fitur AI</label></div>
      <div class="flex">
        <button class="btn hijau" id="aiSimpan">Simpan</button>
        ${s.hasKey?'<button class="btn abu" id="aiHapus">Hapus Kunci</button>':''}
      </div>
    </div></div>`;
  document.getElementById('aiSimpan').onclick=async()=>{
    const body={model:document.getElementById('aiModel').value,enabled:document.getElementById('aiEnabled').checked};
    const k=document.getElementById('aiKey').value.trim(); if(k) body.key=k;
    try{ await api('POST','/api/settings/ai',body); document.getElementById('aiMsg').innerHTML='<div class="pesan ok">Setelan tersimpan.</div>'; viewSetelanAI(); }
    catch(e){ document.getElementById('aiMsg').innerHTML=`<div class="pesan err">${esc(e.message)}</div>`; }
  };
  const h=document.getElementById('aiHapus'); if(h) h.onclick=async()=>{ if(!confirm('Hapus kunci API?'))return; await api('POST','/api/settings/ai',{clearKey:true}); viewSetelanAI(); };
}

/* ============================================================
   ============ MODUL KONSULTAN PAJAK ============
   ============================================================ */
async function ensureMeta(){ if(!State.meta) State.meta=await api('GET','/api/consult/meta'); return State.meta; }
async function loadKlienStaff(){
  const [c,s]=await Promise.all([api('GET','/api/clients'),api('GET','/api/staff').catch(()=>({staff:[]}))]);
  return {clients:c.clients,staff:s.staff};
}
function klienOpts(clients,sel){ return clients.map(c=>`<option value="${c.id}" ${c.id===sel?'selected':''}>${esc(c.nama)}</option>`).join(''); }
function staffOpts(staff,sel){ return staff.map(s=>`<option value="${s.id}" ${s.id===sel?'selected':''}>${esc(s.name)}</option>`).join(''); }
function jenisUsahaOpts(sel){
  const list=(State.meta&&State.meta.jenisUsaha)||['Perdagangan (Dagang)','Jasa','Manufaktur / Industri','Lainnya'];
  let opts='<option value="">— pilih —</option>';
  let ada=false;
  opts+=list.map(j=>{ const s=(j===sel); if(s)ada=true; return `<option value="${esc(j)}" ${s?'selected':''}>${esc(j)}</option>`; }).join('');
  if(sel && !ada) opts+=`<option value="${esc(sel)}" selected>${esc(sel)} (lama)</option>`; // pertahankan nilai teks lama
  return opts;
}
const T_STATUS={belum:['Belum','buruk'],proses:['Proses','aset'],review:['Review','beban'],selesai:['Selesai','baik']};
const I_STATUS={lunas:['Lunas','baik'],belum:['Belum Lunas','buruk'],tertunda:['Tertunda','beban']};
function statChip(map,v){ const m=map[v]||[v,'']; return `<span class="chip ${m[1]}">${m[0]}</span>`; }

/* ---- Chart bulat (donut) status invoice ---- */
function donut(segs){
  const total=segs.reduce((s,x)=>s+x.value,0);
  const r=58,cx=80,cy=80,circ=2*Math.PI*r;
  let off=0, arcs='';
  if(total>0) segs.forEach(s=>{
    if(s.value<=0)return;
    const len=s.value/total*circ; const gap=total>1?2:0;
    arcs+=`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s.color}" stroke-width="24" stroke-linecap="butt" stroke-dasharray="${Math.max(len-gap,0)} ${circ-Math.max(len-gap,0)}" stroke-dashoffset="${-off}" transform="rotate(-90 ${cx} ${cy})"/>`;
    off+=len;
  });
  return `<svg viewBox="0 0 160 160" width="150" height="150" role="img" aria-label="Komposisi status invoice">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--garis2)" stroke-width="24"/>${arcs}
    <text x="${cx}" y="${cy-4}" text-anchor="middle" font-size="12" fill="var(--teks3)">Total Invoice</text>
    <text x="${cx}" y="${cy+18}" text-anchor="middle" font-size="22" font-weight="700" fill="var(--biru)">${total}</text></svg>`;
}

/* ============ DASHBOARD KONSULTAN ============ */
async function viewKonsultan(){
  const d=await api('GET','/api/consult/dashboard');
  const staff=(State.user.role==='staff');
  let finBlok='';
  if(!staff && d.invoice){
    const segs=[
      {label:'Lunas',value:d.invoice.lunas.n,rp:d.invoice.lunas.rp,color:'#2f855a'},
      {label:'Belum Lunas',value:d.invoice.belum.n,rp:d.invoice.belum.rp,color:'#c53030'},
      {label:'Tertunda',value:d.invoice.tertunda.n,rp:d.invoice.tertunda.rp,color:'#d69e2e'}
    ];
    const legend=segs.map(s=>`<div class="flex" style="gap:8px;align-items:center;margin-bottom:6px">
        <span style="width:12px;height:12px;border-radius:3px;background:${s.color};display:inline-block;flex:none"></span>
        <span style="flex:1">${s.label}</span><b>${s.value}</b><span class="muted">${fmtRp(s.rp)}</span></div>`).join('');
    finBlok=`
    <div class="grid k4">
      <div class="stat"><div class="lbl">Total Pendapatan</div><div class="val hijau">${fmtRp(d.totalPendapatan)}</div><div class="sub">dari invoice Lunas</div></div>
      <div class="stat"><div class="lbl">Piutang (Belum Dibayar)</div><div class="val merah">${fmtRp(d.piutangUsaha)}</div><div class="sub">Belum + Tertunda</div></div>
      <div class="stat"><div class="lbl">Klien Aktif</div><div class="val">${d.klien.aktif} / ${d.klien.total}</div><div class="sub">aktif / total klien</div></div>
      <div class="stat"><div class="lbl">Total Tagihan</div><div class="val">${fmtRp(d.totalTagihan)}</div><div class="sub">seluruh invoice</div></div>
    </div>
    <div class="card mt"><div class="hd"><h3>Status Invoice</h3></div><div class="bd">
      <div class="flex" style="gap:28px;align-items:center;flex-wrap:wrap">
        <div>${donut(segs)}</div>
        <div style="flex:1;min-width:220px">${legend}</div>
      </div></div></div>`;
  } else {
    finBlok=`<div class="grid k3">
      <div class="stat"><div class="lbl">Klien</div><div class="val">${d.klien.aktif} / ${d.klien.total}</div><div class="sub">aktif / total</div></div>
      <div class="stat"><div class="lbl">Tugas Saya Selesai</div><div class="val hijau">${d.tugas.selesai} / ${d.tugas.total}</div></div>
      <div class="stat"><div class="lbl">Terlambat</div><div class="val merah">${d.tugas.terlambat}</div><div class="sub">lewat tenggat</div></div>
    </div>`;
  }
  // progres per jenis SPT
  const pj=Object.entries(d.tugas.perJenis||{});
  const jenisBlok=pj.length?`<div class="card mt"><div class="hd"><h3>Progres Pekerjaan per Jenis</h3></div><div class="bd nopad"><div class="tbl-wrap"><table class="tbl">
    <thead><tr><th>Jenis Pekerjaan</th><th class="num">Selesai</th><th class="num">Total</th><th>Progres</th></tr></thead>
    <tbody>${pj.map(([j,v])=>{const pct=v.total?Math.round(v.selesai/v.total*100):0;return `<tr><td>${esc(j)}</td><td class="num">${v.selesai}</td><td class="num">${v.total}</td><td><div style="background:var(--garis2);border-radius:6px;height:10px;width:160px;overflow:hidden"><div style="width:${pct}%;height:100%;background:var(--aksen)"></div></div><span class="muted">${pct}%</span></td></tr>`;}).join('')}</tbody>
    </table></div></div></div>`:'';
  // status tugas ringkas
  const ps=d.tugas.perStatus||{};
  const statusBlok=`<div class="grid k4 mt">
      ${['belum','proses','review','selesai'].map(s=>`<div class="stat"><div class="lbl">${T_STATUS[s][0]}</div><div class="val">${ps[s]||0}</div></div>`).join('')}</div>`;
  // per staff (admin)
  const perStaff=(d.tugas.perStaff||[]);
  const staffBlok=(!staff&&perStaff.length)?`<div class="card mt"><div class="hd"><h3>Progres per Staff</h3></div><div class="bd nopad"><div class="tbl-wrap"><table class="tbl">
    <thead><tr><th>Staff</th><th class="num">Selesai</th><th class="num">Total</th><th>Progres</th></tr></thead>
    <tbody>${perStaff.map(s=>{const pct=s.total?Math.round(s.selesai/s.total*100):0;return `<tr><td>${esc(s.nama)}</td><td class="num">${s.selesai}</td><td class="num">${s.total}</td><td><div style="background:var(--garis2);border-radius:6px;height:10px;width:160px;overflow:hidden;display:inline-block"><div style="width:${pct}%;height:100%;background:var(--aksen2)"></div></div> <span class="muted">${pct}%</span></td></tr>`;}).join('')}</tbody>
    </table></div></div></div>`:'';
  // Aktivitas tim terbaru
  const iconOf={task:'✅',invoice:'🧾',client:'🏢',document:'🗄️'};
  const feed=(d.aktivitas||[]).map(a=>`<div class="flex" style="gap:10px;align-items:flex-start;padding:9px 0;border-bottom:1px solid var(--garis2)">
      <span style="font-size:15px;flex:none">${iconOf[a.kind]||'•'}</span>
      <div style="flex:1"><div><b>${esc(a.userName)}</b> ${esc(a.text)}</div>
        <div class="muted" style="font-size:11.5px">${waktuLalu(a.at)}</div></div></div>`).join('')||'<p class="muted" style="margin:0">Belum ada aktivitas tim. Aktivitas muncul otomatis saat tim menyelesaikan/mengubah pekerjaan, membuat invoice, menambah klien, atau mengunggah dokumen.</p>';
  const aktivitasBlok=`<div class="card mt"><div class="hd"><h3>🕒 Aktivitas Tim Terbaru</h3></div><div class="bd">${feed}</div></div>`;
  content().innerHTML=`<p class="muted">Ringkasan praktik konsultan${staff?' — tugas yang ditugaskan kepada Anda':''}.</p>${finBlok}${statusBlok}${jenisBlok}${staffBlok}${aktivitasBlok}`;
}

/* ============ PENGINGAT TENGGAT SPT ============ */
function sisaBadge(dl){
  if(dl<0) return `<span class="chip buruk">Terlambat ${Math.abs(dl)} hari</span>`;
  if(dl===0) return `<span class="chip buruk">Jatuh tempo hari ini</span>`;
  if(dl<=7) return `<span class="chip beban">${dl} hari lagi</span>`;
  return `<span class="chip">${dl} hari lagi</span>`;
}
function deadlineInfoFE(j){ j=String(j).toLowerCase(); if(j.includes('tahunan')&&j.includes('badan'))return '30 April tahun berikutnya'; if(j.includes('tahunan'))return '31 Maret tahun berikutnya'; if(j.includes('ppn'))return 'Akhir bulan berikutnya'; return 'Tanggal 20 bulan berikutnya'; }
async function viewPengingat(){
  const meta=await ensureMeta();
  const {clients,staff}=await loadKlienStaff();
  const r=await api('GET','/api/consult/reminders?days=60');
  const canManage=State.user.role!=='staff';
  // notifikasi browser otomatis (bila diizinkan)
  try{ if(window.Notification && Notification.permission==='granted' && (r.counts.overdue+r.counts.soon)>0 && !window._notifShown){ window._notifShown=true; new Notification('Pengingat Tenggat SPT — Nexafin',{body:`${r.counts.overdue} terlambat, ${r.counts.soon} jatuh tempo ≤ 7 hari.`}); } }catch(e){}
  const tabel=(judul,arr,kelas)=>arr.length?`<div class="card"><div class="hd"><h3>${judul}</h3><span class="chip ${kelas}">${arr.length}</span></div>
    <div class="bd nopad"><div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Klien</th><th>Jenis SPT</th><th>Periode</th><th>Tenggat</th><th>Sisa</th><th>Staff</th><th></th></tr></thead>
      <tbody>${arr.map(x=>`<tr>
        <td><b>${esc(x.clientName)}</b></td><td>${esc(x.jenis)}</td><td>${esc(x.periode||'-')}</td>
        <td>${esc(x.deadline)}${x.catatanTenggat?`<div class="muted" style="font-size:11.5px;margin-top:3px;white-space:normal;max-width:230px">⚠ ${esc(x.catatanTenggat)}</div>`:''}</td>
        <td>${sisaBadge(x.daysLeft)}</td><td>${esc(x.assigneeName)}</td>
        <td class="right"><button class="btn hijau kecil" data-done="${x.id}">✓ Selesai</button></td></tr>`).join('')}</tbody>
    </table></div></div></div>`:'';
  const notifBtn=(window.Notification && Notification.permission!=='granted')?`<button class="btn abu kecil" id="notifOn">🔔 Aktifkan notifikasi browser</button>`:(window.Notification&&Notification.permission==='granted'?'<span class="chip baik">Notifikasi aktif</span>':'');
  content().innerHTML=`
    <div class="flex" style="gap:8px;margin-bottom:14px;align-items:center">
      <span class="chip buruk">${r.counts.overdue} Terlambat</span>
      <span class="chip beban">${r.counts.soon} ≤ 7 hari</span>
      <span class="chip">${r.counts.upcoming} Mendatang</span>
      <div class="spacer"></div>${notifBtn}
    </div>
    <p class="muted" style="margin:-4px 0 14px;font-size:12.5px">Klik <b>✓ Selesai</b> untuk menutup pengingat — <b>wajib melampirkan Bukti Penerimaan Elektronik (BPE)</b> dari Coretax sebagai bukti SPT telah dilapor. 📎</p>
    ${(r.overdue.length+r.soon.length+r.upcoming.length)===0?'<div class="card"><div class="bd"><p class="muted">Tidak ada tenggat SPT yang mendekat. 🎉 Semua aman.</p></div></div>':''}
    ${tabel('⛔ Terlambat',r.overdue,'buruk')}
    ${tabel('⚠️ Jatuh Tempo ≤ 7 Hari',r.soon,'beban')}
    ${tabel('🗓️ Mendatang (≤ 60 hari)',r.upcoming,'')}
    <div class="card"><div class="hd"><h3>➕ Buat Tugas SPT Otomatis</h3></div><div class="bd">
      <p class="muted">Pilih klien & periode, centang jenis SPT — sistem membuat pekerjaan sekaligus menghitung <b>tenggat resmi</b> otomatis.</p>
      <div id="genMsg"></div>
      <div class="flex">
        <div class="field" style="flex:1"><label>Klien</label><select id="genKlien"><option value="">— pilih —</option>${klienOpts(clients,'')}</select></div>
        <div class="field" style="flex:1"><label>Periode (bulan pajak)</label><input type="month" id="genPeriode" value="${ymNow()}"></div>
        <div class="field" style="flex:1"><label>Ditugaskan ke</label><select id="genStaff"><option value="">— saya —</option>${staffOpts(staff,'')}</select></div>
      </div>
      <label style="font-size:12.5px;font-weight:600;color:var(--teks2)">Jenis SPT</label>
      <div class="flex" style="flex-wrap:wrap;gap:12px;margin:6px 0 14px">
        ${meta.jenisSPT.map((j,i)=>`<label style="font-size:13px"><input type="checkbox" class="genJ" value="${esc(j)}" ${i<2?'checked':''}> ${esc(j)} <span class="muted">(${deadlineInfoFE(j)})</span></label>`).join('')}
      </div>
      <button class="btn hijau" id="genBuat">Buat Tugas + Tenggat</button>
    </div></div>
    <div class="card"><div class="hd"><h3>📌 Referensi Tenggat SPT (default)</h3></div><div class="bd nopad"><div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Jenis SPT</th><th>Batas Lapor</th></tr></thead>
      <tbody>${meta.jenisSPT.map(j=>`<tr><td>${esc(j)}</td><td>${deadlineInfoFE(j)}</td></tr>`).join('')}</tbody>
    </table></div></div><div class="bd"><p class="muted" style="font-size:12.5px">Catatan: tenggat mengikuti ketentuan umum & hari libur nasional; penyesuaian akhir pekan/libur dihitung otomatis. Kalender libur dikelola terpusat oleh pemilik. Selalu verifikasi dengan aturan terbaru DJP.</p></div></div>`;
  content().querySelectorAll('[data-done]').forEach(b=>b.onclick=()=>modalSelesai(b.dataset.done,viewPengingat));
  const notifOn=document.getElementById('notifOn');
  if(notifOn) notifOn.onclick=async()=>{ try{ const p=await Notification.requestPermission(); if(p==='granted'){ new Notification('Notifikasi Nexafin aktif',{body:'Anda akan diingatkan tenggat SPT saat aplikasi dibuka.'}); } viewPengingat(); }catch(e){} };
  document.getElementById('genBuat').onclick=async()=>{
    const clientId=document.getElementById('genKlien').value; if(!clientId){alert('Pilih klien.');return;}
    const jenisList=[...content().querySelectorAll('.genJ:checked')].map(c=>c.value);
    if(!jenisList.length){alert('Centang minimal satu jenis SPT.');return;}
    const body={clientId,periode:document.getElementById('genPeriode').value,jenisList,assignedTo:document.getElementById('genStaff').value||undefined};
    try{ const res=await api('POST','/api/consult/generate-spt',body); document.getElementById('genMsg').innerHTML=`<div class="pesan ok">${res.dibuat} tugas dibuat${res.dilewati?`, ${res.dilewati} dilewati (sudah ada)`:''}.</div>`; setTimeout(viewPengingat,900); }
    catch(e){ document.getElementById('genMsg').innerHTML=`<div class="pesan err">${esc(e.message)}</div>`; }
  };
}

/* ============ KLIEN ============ */
async function viewKlien(){
  const {clients,staff}=await loadKlienStaff();
  const isAdminRole=State.user.role==='admin'||State.user.role==='user';
  const isStaffRole=State.user.role==='staff';
  const rows=clients.map(c=>{
    const s=staff.find(x=>x.id===c.assignedTo);
    const pemb=(Array.isArray(c.pembukuanBy)?c.pembukuanBy:[]).map(id=>(staff.find(x=>x.id===id)||{}).name).filter(Boolean);
    const pjCell=`${s?`👤 ${esc(s.name)} <span class="muted" style="font-size:11px">(PJ)</span>`:esc(c.pic||'-')}${pemb.length?`<div class="muted" style="font-size:11px">📒 pembukuan: ${esc(pemb.join(', '))}</div>`:''}`;
    return `<tr>
      <td><b>${esc(c.nama)}</b></td><td class="kode">${esc(c.npwp||'-')}</td>
      <td>${esc(c.jenisUsaha||'-')}</td><td>${pjCell}</td>
      <td>${c.status==='nonaktif'?'<span class="chip buruk">Nonaktif</span>':'<span class="chip baik">Aktif</span>'}</td>
      <td class="right"><button class="btn abu kecil" data-doc="${c.id}">Dokumen</button> <button class="btn abu kecil" data-sptrekap="${c.id}" title="Cetak/PDF rekap SPT">🖨️ Rekap SPT</button>${!isStaffRole?` <button class="btn abu kecil" data-edit="${c.id}">Ubah</button>`:''}${isAdminRole?` <button class="btn abu kecil" data-del="${c.id}">Hapus</button>`:''}</td>
    </tr>`;
  }).join('')||'<tr><td colspan="6" class="muted" style="text-align:center;padding:16px">Belum ada klien.</td></tr>';
  content().innerHTML=`
    <div class="toolbar"><div class="spacer"></div>${!isStaffRole?`<button class="btn hijau" id="addKlien">+ Tambah Klien</button>`:''}</div>
    <div class="card"><div class="hd"><h3>Daftar Klien</h3><span class="muted">${clients.length} klien</span></div>
    <div class="bd nopad"><div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Nama</th><th>NPWP</th><th>Jenis Usaha</th><th>Penanggung Jawab</th><th>Status</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table></div></div></div>`;
  const addBtn=document.getElementById('addKlien'); if(addBtn) addBtn.onclick=()=>modalKlien(null,staff);
  content().querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>modalKlien(clients.find(c=>c.id===b.dataset.edit),staff));
  content().querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{ if(!confirm('Hapus klien ini beserta dokumen, tugas & invoice-nya?'))return; await api('DELETE','/api/clients/'+b.dataset.del); viewKlien(); });
  content().querySelectorAll('[data-doc]').forEach(b=>b.onclick=()=>{ State.arsipKlien=b.dataset.doc; State.view='arsip'; renderApp(); });
  content().querySelectorAll('[data-sptrekap]').forEach(b=>b.onclick=()=>{ const c=clients.find(x=>x.id===b.dataset.sptrekap); if(c) cetakRekapSPT(c); });
}
function modalKlien(c,staff){
  const isEdit=!!c;
  const wrap=document.createElement('div'); wrap.className='modal-bg';
  wrap.innerHTML=`<div class="modal"><div class="hd"><h3>${isEdit?'Ubah Klien':'Tambah Klien'}</h3><button class="x">&times;</button></div>
    <div class="bd"><div id="kMsg"></div>
      <div class="field"><label>Nama Klien / Perusahaan</label><input id="kNama" value="${c?esc(c.nama):''}"></div>
      <div class="flex"><div class="field" style="flex:1"><label>NPWP</label><input id="kNpwp" value="${c?esc(c.npwp||''):''}"></div>
        <div class="field" style="flex:1"><label>Jenis Usaha</label><select id="kUsaha">${jenisUsahaOpts(c?c.jenisUsaha:'')}</select></div></div>
      <div class="flex"><div class="field" style="flex:1"><label>Email</label><input id="kEmail" value="${c?esc(c.email||''):''}"></div>
        <div class="field" style="flex:1"><label>Telepon</label><input id="kTelp" value="${c?esc(c.telepon||''):''}"></div></div>
      <div class="field"><label>Status</label><select id="kStatus"><option value="aktif" ${c&&c.status==='aktif'?'selected':''}>Aktif</option><option value="nonaktif" ${c&&c.status==='nonaktif'?'selected':''}>Nonaktif</option></select></div>
      <p class="muted" style="font-size:12.5px;margin:6px 0 0">💡 Penanggung jawab & pelaksana (pembukuan/pajak) diatur di menu <b>🧩 Penugasan</b>.</p>
      <div class="flex mt"><div class="spacer"></div><button class="btn abu" id="kBatal">Batal</button><button class="btn hijau" id="kSimpan">Simpan</button></div>
    </div></div>`;
  document.body.appendChild(wrap);
  const close=()=>wrap.remove();
  wrap.querySelector('.x').onclick=close; wrap.querySelector('#kBatal').onclick=close; wrap.onclick=(e)=>{if(e.target===wrap)close();};
  wrap.querySelector('#kSimpan').onclick=async()=>{
    const body={nama:wrap.querySelector('#kNama').value,npwp:wrap.querySelector('#kNpwp').value,jenisUsaha:wrap.querySelector('#kUsaha').value,
      email:wrap.querySelector('#kEmail').value,telepon:wrap.querySelector('#kTelp').value,status:wrap.querySelector('#kStatus').value};
    try{ if(isEdit) await api('PUT','/api/clients/'+c.id,body); else await api('POST','/api/clients',body); close(); viewKlien(); }
    catch(e){ wrap.querySelector('#kMsg').innerHTML=`<div class="pesan err">${esc(e.message)}</div>`; }
  };
}

/* ============ PENUGASAN (satu layar: klien × penanggung jawab) ============ */
async function viewPenugasan(){
  const isAdminRole=State.user.role==='admin'||State.user.role==='user';
  const [cl,rs,tk]=await Promise.all([api('GET','/api/clients'),api('GET','/api/staff'),api('GET','/api/tasks').catch(()=>({tasks:[]}))]);
  const clients=(cl.clients||[]).slice().sort((a,b)=>(a.nama||'').localeCompare(b.nama||''));
  const staff=rs.staff||[];
  const tasks=tk.tasks||[];
  const memberList=staff.filter(s=>s.role==='staff'||s.role==='pengawas');   // PJ & pelaksana boleh siapa saja (anggota firma)
  const staffList=memberList;
  const pengawasList=memberList;
  const sptByClient={}; tasks.forEach(t=>{ (sptByClient[t.clientId]=sptByClient[t.clientId]||new Set()).add(t.assigneeName||''); });
  // Sel pelaksana ringkas: chip terpilih (bisa dihapus) + dropdown "+ tambah" (hanya yang belum dipilih).
  const rosterCell=(kind,cid,sel)=>{
    if(!staffList.length) return '<span class="muted" style="font-size:12px">belum ada staf — tambah di Tim/Staff</span>';
    const chips=staffList.filter(s=>sel.has(s.id)).map(s=>`<span class="chip" style="font-size:11px;margin:1px 3px 1px 0;display:inline-flex;align-items:center;gap:4px">${esc(s.name)}<a href="#" class="rm-pel" data-kind="${kind}" data-cid="${cid}" data-uid="${s.id}" title="hapus" style="text-decoration:none;color:var(--merah);font-weight:700">×</a></span>`).join('');
    const unsel=staffList.filter(s=>!sel.has(s.id));
    const add=unsel.length?`<div class="pel-search" data-kind="${kind}" data-cid="${cid}" style="position:relative;display:inline-block;margin-top:2px">
      <input class="pel-inp" placeholder="+ cari nama…" autocomplete="off" style="font-size:12px;width:140px;padding:3px 7px;border:1px solid var(--garis);border-radius:6px">
      <div class="pel-drop" hidden style="position:absolute;left:0;top:100%;z-index:50;background:#fff;border:1px solid var(--garis);border-radius:6px;max-height:180px;overflow:auto;min-width:150px;box-shadow:0 4px 14px rgba(0,0,0,.14)"></div>
    </div>`:'';
    return `<div>${chips||'<span class="muted" style="font-size:11px">— belum ada —</span>'} ${add}</div>`;
  };
  const rows=clients.map(c=>{
    const pemb=new Set(Array.isArray(c.pembukuanBy)?c.pembukuanBy:[]);
    const perp=new Set(Array.isArray(c.perpajakanBy)?c.perpajakanBy:[]);
    const pjName=(staff.find(s=>s.id===c.assignedTo)||{}).name;
    const pengawasCell=isAdminRole
      ? `<select class="pn-pj" data-id="${c.id}"><option value="">— pilih PJ —</option>${pengawasList.map(p=>`<option value="${p.id}" ${c.assignedTo===p.id?'selected':''}>${esc(p.name)}</option>`).join('')}</select>`
      : `<span>${esc(pjName||'—')}</span>`;
    const spt=[...(sptByClient[c.id]||[])].filter(Boolean);
    const perpCell=`${rosterCell('perpajakanBy',c.id,perp)}${spt.length?`<div class="muted" style="font-size:11px;margin-top:3px">tugas SPT aktif: ${spt.map(esc).join(', ')}</div>`:''}<div style="margin-top:3px"><button class="btn abu kecil" data-spt="${c.id}">Atur tugas SPT ›</button></div>`;
    return `<tr><td><b>${esc(c.nama)}</b>${c.status==='nonaktif'?' <span class="chip buruk">nonaktif</span>':''}</td>
      <td>${pengawasCell}</td><td>${rosterCell('pembukuanBy',c.id,pemb)}</td><td>${perpCell}</td></tr>`;
  }).join('')||'<tr><td colspan="4" class="muted" style="text-align:center;padding:16px">Belum ada klien. Tambah di menu Klien.</td></tr>';
  content().innerHTML=`
    <div class="card"><div class="hd"><h3>🧩 Penugasan Klien</h3><span class="muted" id="pnMsg">${clients.length} klien</span></div>
    <div class="bd">
      <p class="muted" style="margin-top:0">Atur semua penugasan di satu tempat — perubahan tersimpan otomatis:
        <b>👤 Penanggung Jawab</b>${isAdminRole?'':' (hanya admin)'}, <b>📒 Pelaksana Pembukuan</b> & <b>🧾 Pelaksana Pajak</b> (boleh beberapa). Pelaksana pembukuan bisa tulis buku (SPT read-only); pelaksana pajak bisa tulis SPT (buku read-only).</p>
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Klien</th><th>👤 Penanggung Jawab</th><th>📒 Pelaksana Pembukuan</th><th>🧾 Pelaksana Pajak</th></tr></thead>
        <tbody>${rows}</tbody></table></div>
    </div></div>`;
  const flash=(t)=>{ const el=document.getElementById('pnMsg'); if(el){ const o=el.textContent; el.textContent=t; el.style.color='var(--aksen)'; setTimeout(()=>{el.textContent=o;el.style.color='';},1500); } };
  content().querySelectorAll('.pn-pj').forEach(sel=>sel.onchange=async()=>{ try{ await api('PUT','/api/clients/'+sel.dataset.id,{assignedTo:sel.value||null}); flash('✓ PJ disimpan'); }catch(e){ alert(e.message); viewPenugasan(); } });
  // Tambah/hapus pelaksana (pembukuan/pajak) → hitung ulang daftar dari data klien, simpan, render ulang.
  const curIds=(cid,kind)=>{ const c=clients.find(x=>x.id===cid); return new Set(Array.isArray(c&&c[kind])?c[kind]:[]); };
  const savePel=async(cid,kind,set)=>{ try{ await api('PUT','/api/clients/'+cid,{[kind]:[...set]}); flash('✓ tersimpan'); viewPenugasan(); }catch(e){ alert(e.message); viewPenugasan(); } };
  content().querySelectorAll('.rm-pel').forEach(a=>a.onclick=(e)=>{ e.preventDefault(); const set=curIds(a.dataset.cid,a.dataset.kind); set.delete(a.dataset.uid); savePel(a.dataset.cid,a.dataset.kind,set); });
  // Pencarian nama pelaksana: ketik → filter → klik untuk tambah
  content().querySelectorAll('.pel-search').forEach(box=>{
    const inp=box.querySelector('.pel-inp'), drop=box.querySelector('.pel-drop');
    const kind=box.dataset.kind, cid=box.dataset.cid;
    const render=()=>{
      const q=inp.value.trim().toLowerCase();
      const set=curIds(cid,kind);
      const opts=staffList.filter(s=>!set.has(s.id) && (s.name||'').toLowerCase().includes(q));
      drop.innerHTML=opts.length
        ? opts.map(s=>`<div class="pel-opt" data-uid="${s.id}" style="padding:5px 9px;cursor:pointer;font-size:12px">${esc(s.name)}</div>`).join('')
        : '<div style="padding:5px 9px;font-size:12px;color:var(--teks2)">tidak ada</div>';
      drop.hidden=false;
      drop.querySelectorAll('.pel-opt').forEach(o=>{
        o.onmouseenter=()=>o.style.background='var(--garis2)'; o.onmouseleave=()=>o.style.background='';
        o.onmousedown=(e)=>{ e.preventDefault(); const st=curIds(cid,kind); st.add(o.dataset.uid); savePel(cid,kind,st); };
      });
    };
    inp.onfocus=render; inp.oninput=render;
    inp.onblur=()=>setTimeout(()=>{ drop.hidden=true; },150);
  });
  content().querySelectorAll('[data-spt]').forEach(b=>b.onclick=()=>{ State.view='pekerjaan'; renderApp(); });
}

/* ============ PEKERJAAN / PROGRES SPT ============ */
async function viewPekerjaan(){
  const meta=await ensureMeta();
  const {clients,staff}=await loadKlienStaff();
  const isAdminRole=State.user.role==='admin'||State.user.role==='user';
  const isPengawas=State.user.role==='pengawas';
  const bisaImpersonate=isAdminRole||isPengawas;
  const asStaff=State.pekAsStaff||'';
  const qs=[]; if(State.tugasMine)qs.push('mine=1'); if(asStaff)qs.push('asStaff='+encodeURIComponent(asStaff));
  const r=await api('GET','/api/tasks'+(qs.length?'?'+qs.join('&'):''));
  const BULAN=['','Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  // daftar tahun dari periode SPT
  const tahunSet=new Set(); r.tasks.forEach(t=>{ const y=(t.periode||'').slice(0,4); if(/^\d{4}$/.test(y)) tahunSet.add(y); });
  tahunSet.add(String(new Date().getFullYear()));
  const tahunList=[...tahunSet].sort((a,b)=>b.localeCompare(a));
  const fTahun=State.pekTahun||'', fBulan=State.pekBulan||'';
  const list=r.tasks.filter(t=>{ const per=t.periode||'';
    if(fTahun && per.slice(0,4)!==fTahun) return false;
    if(fBulan){ if(per.length<7 || per.slice(5,7)!==fBulan) return false; }
    return true;
  });
  const rows=list.map(t=>`<tr>
      <td><b>${esc(t.clientName)}</b></td><td>${esc(t.jenis)}</td><td>${esc(t.periode||'-')}</td>
      <td>${esc(t.assigneeName)}</td>
      <td>${t.canEdit
        ? `<select class="tk-status" data-id="${t.id}" data-cur="${t.status}">${meta.statusTugas.map(s=>`<option value="${s}" ${t.status===s?'selected':''}>${T_STATUS[s][0]}</option>`).join('')}</select>`
        : `<span class="chip">${esc((T_STATUS[t.status]&&T_STATUS[t.status][0])||t.status)}</span>`}</td>
      <td>${t.deadline?(t.deadline<todayStr()&&t.status!=='selesai'?`<span class="neg">${esc(t.deadline)} ⚠</span>`:esc(t.deadline)):'-'}${t.catatanTenggat?`<div class="muted" style="font-size:11px;margin-top:2px;white-space:normal;max-width:200px">↪ efektif ${esc(t.deadlineEfektif)}</div>`:''}</td>
      <td>${t.status==='selesai'?buktiCell(t):'<span class="muted" style="font-size:11px">—</span>'}</td>
      <td class="right">${t.canEdit
        ? `<button class="btn abu kecil" data-edit="${t.id}">Ubah</button>${State.user.role!=='staff'?` <button class="btn abu kecil" data-del="${t.id}">Hapus</button>`:''}`
        : '<span class="muted" style="font-size:11px">👁️ lihat</span>'}</td>
    </tr>`).join('')||'<tr><td colspan="8" class="muted" style="text-align:center;padding:16px">Tidak ada pekerjaan untuk filter ini.</td></tr>';
  const labelFilter=fBulan?`${BULAN[+fBulan]} ${fTahun}`:(fTahun?`Tahun ${fTahun}`:'Semua periode');
  content().innerHTML=`
    <div class="toolbar">
      <div class="field"><label>Tahun</label><select id="pekTahun"><option value="">Semua</option>${tahunList.map(y=>`<option value="${y}" ${fTahun===y?'selected':''}>${y}</option>`).join('')}</select></div>
      <div class="field"><label>Bulan (SPT Masa)</label><select id="pekBulan" ${fTahun?'':'disabled'}><option value="">Semua bulan</option>${[...Array(12)].map((_,i)=>{const mm=String(i+1).padStart(2,'0');return `<option value="${mm}" ${fBulan===mm?'selected':''}>${BULAN[i+1]}</option>`;}).join('')}</select></div>
      ${bisaImpersonate?`<div class="field"><label>Lihat sebagai</label><select id="pekAsStaff"><option value="">${isPengawas?'Seluruh tim':'Semua staf'}</option>${staff.map(s=>`<option value="${s.id}" ${asStaff===s.id?'selected':''}>${esc(s.name)}${s.role==='pengawas'?' (pengawas)':''}</option>`).join('')}</select></div>`:''}
      <label style="font-size:13px;align-self:end;padding-bottom:8px"><input type="checkbox" id="tMine" ${State.tugasMine?'checked':''}> Hanya tugas saya</label>
      <div class="spacer"></div><button class="btn hijau" id="addTugas">+ Tambah Pekerjaan</button>
    </div>
    <div class="card"><div class="hd"><h3>Pekerjaan / Progres SPT</h3><span class="muted">${labelFilter} • ${list.length} dari ${r.tasks.length} pekerjaan</span></div>
    <div class="bd nopad"><div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Klien</th><th>Jenis</th><th>Periode</th><th>Staff</th><th>Status</th><th>Tenggat</th><th>Bukti (BPE)</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table></div></div></div>
    <p class="muted" style="font-size:12.5px">Filter berdasarkan <b>periode SPT</b>: pilih Tahun untuk melihat satu tahun penuh, lalu pilih Bulan untuk SPT Masa tertentu. Menandai <b>Selesai</b> mewajibkan lampiran <b>BPE</b>. 📎</p>`;
  document.getElementById('pekTahun').onchange=(e)=>{State.pekTahun=e.target.value; if(!e.target.value)State.pekBulan=''; viewPekerjaan();};
  document.getElementById('pekBulan').onchange=(e)=>{State.pekBulan=e.target.value;viewPekerjaan();};
  const asSel=document.getElementById('pekAsStaff'); if(asSel) asSel.onchange=(e)=>{State.pekAsStaff=e.target.value;viewPekerjaan();};
  document.getElementById('tMine').onchange=(e)=>{State.tugasMine=e.target.checked;viewPekerjaan();};
  document.getElementById('addTugas').onclick=()=>modalTugas(null,clients,staff,meta);
  content().querySelectorAll('.tk-status').forEach(sel=>sel.onchange=async()=>{
    const id=sel.dataset.id;
    if(sel.value==='selesai'){ sel.value=sel.dataset.cur; modalSelesai(id,viewPekerjaan); return; }
    await api('PUT','/api/tasks/'+id,{status:sel.value}); viewPekerjaan();
  });
  content().querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>modalTugas(r.tasks.find(t=>t.id===b.dataset.edit),clients,staff,meta));
  content().querySelectorAll('[data-bukti]').forEach(b=>b.onclick=()=>modalBukti(r.tasks.find(t=>t.id===b.dataset.bukti)));
  content().querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{ if(!confirm('Hapus pekerjaan ini?'))return; await api('DELETE','/api/tasks/'+b.dataset.del); viewPekerjaan(); });
}
function modalTugas(t,clients,staff,meta){
  const isEdit=!!t;
  const wrap=document.createElement('div'); wrap.className='modal-bg';
  wrap.innerHTML=`<div class="modal"><div class="hd"><h3>${isEdit?'Ubah Pekerjaan':'Tambah Pekerjaan'}</h3><button class="x">&times;</button></div>
    <div class="bd"><div id="tMsg"></div>
      <div class="field"><label>Klien</label><select id="tKlien"><option value="">— pilih —</option>${klienOpts(clients,t?t.clientId:'')}</select></div>
      <div class="field"><label>Jenis Pekerjaan</label><select id="tJenis">${meta.jenisSPT.map(j=>`<option ${t&&t.jenis===j?'selected':''}>${j}</option>`).join('')}</select></div>
      <div class="flex"><div class="field" style="flex:1"><label>Periode</label><input id="tPeriode" placeholder="mis. 2025 atau 2026-07" value="${t?esc(t.periode||''):''}"></div>
        <div class="field" style="flex:1"><label>Tenggat</label><input type="date" id="tDeadline" value="${t?esc(t.deadline||''):''}"></div></div>
      <div class="flex"><div class="field" style="flex:1"><label>Ditugaskan ke</label><select id="tStaff"><option value="">— saya —</option>${staffOpts(staff,t?t.assignedTo:'')}</select></div>
        <div class="field" style="flex:1"><label>Status</label><select id="tStatus">${meta.statusTugas.map(s=>`<option value="${s}" ${t&&t.status===s?'selected':''}>${T_STATUS[s][0]}</option>`).join('')}</select></div></div>
      <div class="field"><label>Catatan</label><input id="tCatatan" value="${t?esc(t.catatan||''):''}"></div>
      <div class="flex mt"><div class="spacer"></div><button class="btn abu" id="tBatal">Batal</button><button class="btn hijau" id="tSimpan">Simpan</button></div>
    </div></div>`;
  document.body.appendChild(wrap);
  const close=()=>wrap.remove();
  wrap.querySelector('.x').onclick=close; wrap.querySelector('#tBatal').onclick=close; wrap.onclick=(e)=>{if(e.target===wrap)close();};
  wrap.querySelector('#tSimpan').onclick=async()=>{
    const body={clientId:wrap.querySelector('#tKlien').value,jenis:wrap.querySelector('#tJenis').value,periode:wrap.querySelector('#tPeriode').value,
      deadline:wrap.querySelector('#tDeadline').value,assignedTo:wrap.querySelector('#tStaff').value||undefined,status:wrap.querySelector('#tStatus').value,catatan:wrap.querySelector('#tCatatan').value};
    try{ if(isEdit) await api('PUT','/api/tasks/'+t.id,body); else await api('POST','/api/tasks',body); close(); viewPekerjaan(); }
    catch(e){ wrap.querySelector('#tMsg').innerHTML=`<div class="pesan err">${esc(e.message)}</div>`; }
  };
}
/* Modal: tandai Selesai dengan bukti lapor (BPE Coretax) — WAJIB lampiran */
function modalSelesai(taskId,onDone){
  const wrap=document.createElement('div'); wrap.className='modal-bg';
  wrap.innerHTML=`<div class="modal" style="max-width:520px"><div class="hd"><h3>Tandai Selesai — Lampirkan Bukti Lapor</h3><button class="x">&times;</button></div>
    <div class="bd">
      <div class="pesan" style="background:#fef3c7;color:#78500a">⚠ <b>Wajib:</b> lampirkan <b>Bukti Penerimaan Elektronik (BPE)</b> dari Coretax/DJP sebagai bukti SPT telah dilapor. Tanpa lampiran, status tidak bisa ditandai Selesai.</div>
      <div id="seMsg"></div>
      <div class="field"><label>Unggah file BPE (PDF/gambar)</label><input type="file" id="seFile" accept=".pdf,image/*"></div>
      <div class="field"><label>atau Tautan bukti (mis. arsip Coretax/Drive)</label><input id="seLink" placeholder="https://..."></div>
      <div class="flex"><div class="field" style="flex:1"><label>Nomor BPE (opsional)</label><input id="seNomor"></div>
        <div class="field" style="flex:1"><label>Tanggal Lapor (opsional)</label><input type="date" id="seTgl"></div></div>
      <div class="flex mt"><div class="spacer"></div><button class="btn abu" id="seBatal">Batal</button><button class="btn hijau" id="seSimpan">✓ Simpan & Tandai Selesai</button></div>
    </div></div>`;
  document.body.appendChild(wrap);
  const close=()=>wrap.remove();
  wrap.querySelector('.x').onclick=close; wrap.querySelector('#seBatal').onclick=close; wrap.onclick=(e)=>{if(e.target===wrap)close();};
  wrap.querySelector('#seSimpan').onclick=async()=>{
    const f=wrap.querySelector('#seFile').files[0]; const link=wrap.querySelector('#seLink').value.trim();
    if(!f && !link){ wrap.querySelector('#seMsg').innerHTML='<div class="pesan err">Lampiran BPE wajib: unggah file atau isi tautan.</div>'; return; }
    const btn=wrap.querySelector('#seSimpan'); btn.disabled=true; btn.textContent='Menyimpan…';
    try{
      const body={link,nomor:wrap.querySelector('#seNomor').value,tanggal:wrap.querySelector('#seTgl').value};
      if(f){ body.base64=await readFile(f,true); body.filename=f.name; body.mime=f.type||'application/octet-stream'; }
      await api('POST','/api/tasks/'+taskId+'/selesai',body);
      close(); if(onDone)onDone();
    }catch(e){ wrap.querySelector('#seMsg').innerHTML=`<div class="pesan err">${esc(e.message)}</div>`; btn.disabled=false; btn.textContent='✓ Simpan & Tandai Selesai'; }
  };
}
function buktiCell(t){
  if(t.bukti||t.buktiLink) return `<button class="btn abu kecil" data-bukti="${t.id}">📎 Lihat BPE</button>`;
  return '<span class="chip buruk" title="Selesai tanpa bukti">tanpa bukti</span>';
}
/* Pratinjau bukti BPE di dalam aplikasi (gambar/PDF), tidak pindah tab */
function modalBukti(t){
  if(!t)return;
  const mime=(t.bukti&&t.bukti.mime)||'';
  const isImg=/image\//.test(mime); const isPdf=/pdf/.test(mime);
  const url=t.bukti?('/api/tasks/'+t.id+'/bukti/file?inline=1'):'';
  let viewer='';
  if(t.bukti){
    if(isImg) viewer=`<img src="${url}" alt="Bukti BPE" style="max-width:100%;max-height:72vh;border-radius:8px;display:block;margin:0 auto">`;
    else if(isPdf) viewer=`<iframe src="${url}" title="Bukti BPE" style="width:100%;height:72vh;border:1px solid var(--garis);border-radius:8px"></iframe>`;
    else viewer=`<div class="pesan" style="background:var(--garis2);color:var(--teks2)">Tipe berkas ini tidak bisa dipratinjau. Silakan unduh untuk membukanya.</div>`;
  } else if(t.buktiLink){
    viewer=`<iframe src="${esc(t.buktiLink)}" title="Bukti (tautan)" style="width:100%;height:72vh;border:1px solid var(--garis);border-radius:8px"></iframe>
      <p class="muted mt" style="font-size:12.5px">Jika pratinjau kosong, situs sumber mungkin memblokir penyematan — <a href="${esc(t.buktiLink)}" target="_blank">buka tautan di tab baru</a>.</p>`;
  }
  const meta=[t.buktiNomor?`No. BPE: <b>${esc(t.buktiNomor)}</b>`:'', t.buktiTanggal?`Tgl lapor: <b>${esc(t.buktiTanggal)}</b>`:'', t.selesaiAt?`Selesai: ${esc((t.selesaiAt||'').slice(0,10))}`:''].filter(Boolean).join(' · ');
  const wrap=document.createElement('div'); wrap.className='modal-bg';
  wrap.innerHTML=`<div class="modal" style="max-width:900px;width:100%"><div class="hd"><h3>Bukti Lapor (BPE) — ${esc(t.jenis||'')}${t.clientName?' · '+esc(t.clientName):''}</h3><button class="x">&times;</button></div>
    <div class="bd">
      ${meta?`<p class="muted" style="margin-top:0">${meta}</p>`:''}
      ${viewer||'<p class="muted">Tidak ada bukti.</p>'}
      <div class="flex mt"><div class="spacer"></div>${t.bukti?`<a class="btn abu" href="/api/tasks/${t.id}/bukti/file" download>⬇ Unduh</a>`:''}<button class="btn" id="bkTutup">Tutup</button></div>
    </div></div>`;
  document.body.appendChild(wrap);
  const close=()=>wrap.remove();
  wrap.querySelector('.x').onclick=close; wrap.querySelector('#bkTutup').onclick=close; wrap.onclick=(e)=>{if(e.target===wrap)close();};
}

/* ============ INVOICE KLIEN ============ */
function terbilang(n){
  n=Math.floor(Math.abs(Number(n)||0)); if(n===0) return 'nol';
  const sat=['','satu','dua','tiga','empat','lima','enam','tujuh','delapan','sembilan','sepuluh','sebelas'];
  const tw=(x)=>{
    if(x<12) return sat[x];
    if(x<20) return tw(x-10)+' belas';
    if(x<100) return tw(Math.floor(x/10))+' puluh'+(x%10?' '+tw(x%10):'');
    if(x<200) return 'seratus'+(x%100?' '+tw(x%100):'');
    if(x<1000) return tw(Math.floor(x/100))+' ratus'+(x%100?' '+tw(x%100):'');
    if(x<2000) return 'seribu'+(x%1000?' '+tw(x%1000):'');
    if(x<1e6) return tw(Math.floor(x/1000))+' ribu'+(x%1000?' '+tw(x%1000):'');
    if(x<1e9) return tw(Math.floor(x/1e6))+' juta'+(x%1e6?' '+tw(x%1e6):'');
    if(x<1e12) return tw(Math.floor(x/1e9))+' miliar'+(x%1e9?' '+tw(x%1e9):'');
    return tw(Math.floor(x/1e12))+' triliun'+(x%1e12?' '+tw(x%1e12):'');
  };
  return tw(n).replace(/\s+/g,' ').trim();
}
function cetakInvoice(inv,clients){
  const c=(clients||[]).find(x=>x.id===inv.clientId)||{};
  const firma=(State.company&&State.company.name)||'';
  const rp=v=>'Rp '+fmtNum(v);
  const statusTxt=(I_STATUS[inv.status]&&I_STATUS[inv.status][0])||inv.status||'';
  const w=window.open('','_blank'); if(!w){alert('Popup diblokir — izinkan popup untuk mencetak.');return;}
  w.document.write(`<html><head><title>Invoice ${esc(inv.nomor)}</title><style>
    body{font-family:Arial,sans-serif;font-size:13px;color:#1a202c;padding:36px;max-width:720px;margin:auto}
    .hd{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0f2a47;padding-bottom:12px;margin-bottom:18px}
    .firma{font-size:18px;font-weight:bold;color:#0f2a47}
    h1{font-size:24px;letter-spacing:3px;color:#0f2a47;margin:0}
    .row{display:flex;justify-content:space-between;margin:8px 0}
    table{width:100%;border-collapse:collapse;margin:16px 0}
    th,td{padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:left}.num{text-align:right}
    thead th{background:#eef2f7}.total td{font-weight:bold;font-size:15px;border-top:2px solid #cbd5e0}
    .terbilang{font-style:italic;color:#444;margin-top:6px}
  </style></head><body>
    <div class="hd"><div class="firma">${esc(firma)}</div><h1>INVOICE</h1></div>
    <div class="row">
      <div><b>Kepada:</b><br>${esc(inv.clientName||c.nama||'')}${c.npwp?'<br>NPWP: '+esc(c.npwp):''}${c.telepon?'<br>'+esc(c.telepon):''}</div>
      <div style="text-align:right">
        <div><b>No:</b> ${esc(inv.nomor)}</div>
        <div><b>Tanggal:</b> ${esc(inv.tanggal||'')}</div>
        <div><b>Jatuh Tempo:</b> ${esc(inv.jatuhTempo||'-')}</div>
        <div><b>Status:</b> ${esc(statusTxt)}</div>
      </div>
    </div>
    <table><thead><tr><th>Keterangan</th><th class="num">Jumlah</th></tr></thead>
      <tbody><tr><td>${esc(inv.keterangan||'Jasa konsultan/pembukuan')}</td><td class="num">${rp(inv.jumlah)}</td></tr></tbody>
      <tfoot><tr class="total"><td class="num">TOTAL</td><td class="num">${rp(inv.jumlah)}</td></tr></tfoot></table>
    <div class="terbilang">Terbilang: ${esc(terbilang(inv.jumlah))} rupiah</div>
    <p style="margin-top:48px">Hormat kami,<br><br><br><b>${esc(firma)}</b></p>
  </body></html>`);
  w.document.close(); setTimeout(()=>w.print(),300);
}
async function cetakRekapSPT(client){
  let list=[];
  try{ const r=await api('GET','/api/tasks?clientId='+encodeURIComponent(client.id)); list=(r.tasks||[]); }catch(e){ alert(e.message); return; }
  list.sort((a,b)=>(a.periode||'').localeCompare(b.periode||''));
  const firma=(State.company&&State.company.name)||'';
  const stTxt=s=>({belum:'Belum',proses:'Proses',review:'Review',selesai:'Selesai'})[s]||s;
  const rows=list.map(t=>`<tr><td>${esc(t.jenis)}</td><td>${esc(t.periode||'-')}</td><td>${esc(t.deadlineEfektif||t.deadline||'-')}</td><td>${esc(stTxt(t.status))}</td><td>${t.punyaBukti?'✓ BPE':'-'}</td></tr>`).join('')||'<tr><td colspan="5" style="text-align:center;color:#888;padding:12px">Belum ada pekerjaan SPT.</td></tr>';
  const w=window.open('','_blank'); if(!w){alert('Popup diblokir — izinkan popup untuk mencetak.');return;}
  w.document.write(`<html><head><title>Rekap SPT — ${esc(client.nama)}</title><style>
    body{font-family:Arial,sans-serif;font-size:12px;padding:32px;color:#1a202c}
    h2{text-align:center;margin:0 0 2px;color:#0f2a47}p.sub{text-align:center;color:#666;margin:0 0 16px}
    table{width:100%;border-collapse:collapse}th,td{padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:left}thead th{background:#eef2f7}
  </style></head><body>
    <h2>Rekap Pekerjaan / SPT</h2>
    <p class="sub">${esc(firma)} — Klien: <b>${esc(client.nama)}</b>${client.npwp?' · NPWP '+esc(client.npwp):''} · dicetak ${esc(todayStr())}</p>
    <table><thead><tr><th>Jenis SPT</th><th>Periode</th><th>Tenggat</th><th>Status</th><th>Bukti</th></tr></thead><tbody>${rows}</tbody></table>
  </body></html>`);
  w.document.close(); setTimeout(()=>w.print(),300);
}
async function viewInvoiceKlien(){
  const meta=await ensureMeta();
  const {clients,staff}=await loadKlienStaff();
  const r=await api('GET','/api/invoices');
  const isAdmin=State.user.role==='admin'||State.user.role==='user';
  const tot={lunas:0,belum:0,tertunda:0};
  r.invoices.forEach(i=>tot[i.status]=(tot[i.status]||0)+(i.jumlah||0));
  const rows=r.invoices.map(i=>`<tr>
      <td class="kode">${esc(i.nomor)}</td><td><b>${esc(i.clientName)}</b></td><td>${esc(i.tanggal)}</td>
      <td>${esc(i.jatuhTempo||'-')}</td><td class="num">${fmtNum(i.jumlah)}</td>
      <td>${i.assigneeName?esc(i.assigneeName):'<span class="muted">—</span>'}</td>
      <td><select class="iv-status" data-id="${i.id}">${meta.statusInvoice.map(s=>`<option value="${s}" ${i.status===s?'selected':''}>${I_STATUS[s][0]}</option>`).join('')}</select></td>
      <td class="right"><button class="btn abu kecil" data-print="${i.id}" title="Cetak/PDF invoice">🖨️</button> <button class="btn abu kecil" data-edit="${i.id}">Ubah</button>${isAdmin?` <button class="btn abu kecil" data-del="${i.id}">Hapus</button>`:''}</td>
    </tr>`).join('')||'<tr><td colspan="8" class="muted" style="text-align:center;padding:16px">Belum ada invoice.</td></tr>';
  content().innerHTML=`
    <div class="grid k3">
      <div class="stat"><div class="lbl">Lunas</div><div class="val hijau">${fmtRp(tot.lunas)}</div></div>
      <div class="stat"><div class="lbl">Belum Lunas</div><div class="val merah">${fmtRp(tot.belum)}</div></div>
      <div class="stat"><div class="lbl">Tertunda</div><div class="val">${fmtRp(tot.tertunda)}</div></div>
    </div>
    <div class="toolbar mt"><div class="spacer"></div><button class="btn hijau" id="addInv">+ Buat Invoice</button></div>
    <div class="card"><div class="hd"><h3>Invoice Klien</h3></div><div class="bd nopad"><div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Nomor</th><th>Klien</th><th>Tanggal</th><th>Jatuh Tempo</th><th class="num">Jumlah</th><th>Petugas</th><th>Status</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table></div></div></div>`;
  document.getElementById('addInv').onclick=()=>modalInvoice(null,clients,staff,meta);
  content().querySelectorAll('.iv-status').forEach(sel=>sel.onchange=async()=>{ await api('PUT','/api/invoices/'+sel.dataset.id,{status:sel.value}); viewInvoiceKlien(); });
  content().querySelectorAll('[data-print]').forEach(b=>b.onclick=()=>{ const inv=r.invoices.find(i=>i.id===b.dataset.print); if(inv) cetakInvoice(inv,clients); });
  content().querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>modalInvoice(r.invoices.find(i=>i.id===b.dataset.edit),clients,staff,meta));
  content().querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{ if(!confirm('Hapus invoice ini?'))return; await api('DELETE','/api/invoices/'+b.dataset.del); viewInvoiceKlien(); });
}
function modalInvoice(i,clients,staff,meta){
  const isEdit=!!i;
  const isAdmin=State.user.role==='admin'||State.user.role==='user';
  const wrap=document.createElement('div'); wrap.className='modal-bg';
  wrap.innerHTML=`<div class="modal"><div class="hd"><h3>${isEdit?'Ubah Invoice':'Buat Invoice'}</h3><button class="x">&times;</button></div>
    <div class="bd"><div id="iMsg"></div>
      <div class="field"><label>Klien</label><select id="iKlien"><option value="">— pilih —</option>${klienOpts(clients,i?i.clientId:'')}</select></div>
      <div class="flex"><div class="field" style="flex:1"><label>Tanggal</label><input type="date" id="iTgl" value="${i?esc(i.tanggal):todayStr()}"></div>
        <div class="field" style="flex:1"><label>Jatuh Tempo</label><input type="date" id="iJt" value="${i?esc(i.jatuhTempo||''):''}"></div></div>
      <div class="flex"><div class="field" style="flex:1"><label>Jumlah (Rp)</label><input type="number" id="iJml" value="${i?i.jumlah:''}"></div>
        <div class="field" style="flex:1"><label>Status</label><select id="iStatus">${meta.statusInvoice.map(s=>`<option value="${s}" ${i&&i.status===s?'selected':''}>${I_STATUS[s][0]}</option>`).join('')}</select></div></div>
      ${isAdmin?`<div class="field"><label>Ditugaskan ke (staf pengerjaan)</label><select id="iStaff"><option value="">— tidak ditugaskan —</option>${staffOpts((staff||[]).filter(s=>s.role==='staff'),i?i.assignedTo:'')}</select></div>`:''}
      <div class="field"><label>Keterangan</label><input id="iKet" value="${i?esc(i.keterangan||''):''}" placeholder="mis. Jasa penyusunan SPT Tahunan 2025"></div>
      <div class="flex mt"><div class="spacer"></div><button class="btn abu" id="iBatal">Batal</button><button class="btn hijau" id="iSimpan">Simpan</button></div>
    </div></div>`;
  document.body.appendChild(wrap);
  const close=()=>wrap.remove();
  wrap.querySelector('.x').onclick=close; wrap.querySelector('#iBatal').onclick=close; wrap.onclick=(e)=>{if(e.target===wrap)close();};
  wrap.querySelector('#iSimpan').onclick=async()=>{
    const body={clientId:wrap.querySelector('#iKlien').value,tanggal:wrap.querySelector('#iTgl').value,jatuhTempo:wrap.querySelector('#iJt').value,
      jumlah:wrap.querySelector('#iJml').value,status:wrap.querySelector('#iStatus').value,keterangan:wrap.querySelector('#iKet').value};
    if(isAdmin){ const st=wrap.querySelector('#iStaff'); if(st) body.assignedTo=st.value||null; }
    try{ if(isEdit) await api('PUT','/api/invoices/'+i.id,body); else await api('POST','/api/invoices',body); close(); viewInvoiceKlien(); }
    catch(e){ wrap.querySelector('#iMsg').innerHTML=`<div class="pesan err">${esc(e.message)}</div>`; }
  };
}

/* ============ ARSIP DOKUMEN ============ */
async function viewArsip(){
  const meta=await ensureMeta();
  const {clients}=await loadKlienStaff();
  const fKlien=State.arsipKlien||''; const fKat=State.arsipKat||'';
  const qp=[]; if(fKlien)qp.push('clientId='+fKlien); if(fKat)qp.push('kategori='+encodeURIComponent(fKat));
  const r=await api('GET','/api/documents'+(qp.length?'?'+qp.join('&'):''));
  const rows=r.documents.map(x=>`<tr>
      <td>${esc(x.kategori)}</td><td><b>${esc(x.nama)}</b>${x.catatan?`<div class="muted" style="font-size:12px">${esc(x.catatan)}</div>`:''}</td>
      <td>${esc(x.clientName)}</td><td>${esc(x.periode||'-')}</td>
      <td>${x.status==='ada'?'<span class="chip baik">Ada</span>':'<span class="chip buruk">Belum</span>'}</td>
      <td>${x.punyaFile?`<a class="btn abu kecil" href="/api/documents/${x.id}/file" target="_blank">⬇ Unduh</a>`:''}${x.link?` <a class="btn abu kecil" href="${esc(x.link)}" target="_blank">🔗 Tautan</a>`:''}</td>
      <td class="right"><button class="btn abu kecil" data-del="${x.id}">Hapus</button></td>
    </tr>`).join('')||'<tr><td colspan="7" class="muted" style="text-align:center;padding:16px">Belum ada dokumen.</td></tr>';
  content().innerHTML=`
    <div class="card"><div class="hd"><h3>📤 Tambah / Unggah Dokumen</h3></div><div class="bd">
      <div id="upMsg"></div>
      <div class="flex">
        <div class="field" style="flex:1"><label>Klien</label><select id="upKlien"><option value="">— pilih —</option>${klienOpts(clients,fKlien)}</select></div>
        <div class="field" style="flex:1"><label>Kategori</label><select id="upKat">${meta.kategoriDokumen.map(k=>`<option>${k}</option>`).join('')}</select></div>
        <div class="field" style="flex:1"><label>Periode/Tahun</label><input id="upPeriode" placeholder="mis. 2025"></div>
      </div>
      <div class="field"><label>Nama dokumen (opsional)</label><input id="upNama" placeholder="otomatis dari nama file bila kosong"></div>
      <div class="flex">
        <div class="field" style="flex:1"><label>Unggah File (PDF/gambar) — opsional</label><input type="file" id="upFile" accept=".pdf,image/*,.xlsx,.docx"></div>
        <div class="field" style="flex:1"><label>atau Tautan (Google Drive dll)</label><input id="upLink" placeholder="https://..."></div>
      </div>
      <div class="field"><label>Catatan</label><input id="upCatatan"></div>
      <button class="btn hijau" id="upSimpan">Simpan Dokumen</button>
    </div></div>
    <div class="toolbar">
      <div class="field"><label>Filter Klien</label><select id="flKlien"><option value="">Semua</option>${klienOpts(clients,fKlien)}</select></div>
      <div class="field"><label>Filter Kategori</label><select id="flKat"><option value="">Semua</option>${meta.kategoriDokumen.map(k=>`<option ${fKat===k?'selected':''}>${k}</option>`).join('')}</select></div>
    </div>
    <div class="card"><div class="hd"><h3>🗄️ Arsip Dokumen</h3><span class="muted">${r.documents.length} dokumen</span></div>
    <div class="bd nopad"><div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Kategori</th><th>Nama</th><th>Klien</th><th>Periode</th><th>Status</th><th>Berkas</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table></div></div></div>`;
  document.getElementById('flKlien').onchange=(e)=>{State.arsipKlien=e.target.value;viewArsip();};
  document.getElementById('flKat').onchange=(e)=>{State.arsipKat=e.target.value;viewArsip();};
  document.getElementById('upSimpan').onclick=async()=>{
    const klien=document.getElementById('upKlien').value; if(!klien){alert('Pilih klien.');return;}
    const f=document.getElementById('upFile').files[0];
    const btn=document.getElementById('upSimpan'); btn.disabled=true; btn.textContent='Menyimpan…';
    try{
      const body={clientId:klien,kategori:document.getElementById('upKat').value,nama:document.getElementById('upNama').value,
        periode:document.getElementById('upPeriode').value,link:document.getElementById('upLink').value,catatan:document.getElementById('upCatatan').value};
      if(f){ body.base64=await readFile(f,true); body.filename=f.name; body.mime=f.type||'application/octet-stream'; }
      await api('POST','/api/documents',body); viewArsip();
    }catch(e){ document.getElementById('upMsg').innerHTML=`<div class="pesan err">${esc(e.message)}</div>`; btn.disabled=false; btn.textContent='Simpan Dokumen'; }
  };
  content().querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{ if(!confirm('Hapus dokumen ini?'))return; await api('DELETE','/api/documents/'+b.dataset.del); viewArsip(); });
}

/* ============ TIM / STAFF ============ */
async function viewTim(){
  const [r,cl,tk]=await Promise.all([api('GET','/api/staff'),api('GET','/api/clients'),api('GET','/api/tasks').catch(()=>({tasks:[]}))]);
  const clients=cl.clients||[];
  const tasks=tk.tasks||[];
  const isAdminRole=State.user.role==='admin'||State.user.role==='user';   // PJ non-admin juga bisa buka menu ini (kelola akun rosternya)
  const peranBadge=(role)=>role==='staff'?'<span class="badge">Anggota</span>':role==='klien-staff'?'<span class="badge" style="background:#0a8a61">Staf Klien</span>':'<span class="badge admin">Admin</span>';
  const chipK=(t)=>`<span class="chip" style="background:var(--garis2);color:var(--teks2);font-size:11px;margin:1px 2px;display:inline-block">${t}</span>`;
  // Kolom "Menangani": klien yang dipegang tiap anggota + perannya (PJ/pembukuan/pajak).
  const menanganiCell=(s)=>{
    if(s.role==='admin'||s.role==='user') return '<span class="muted">semua klien firma</span>';
    if(s.role==='klien-staff') return chipK('🏢 '+esc(s.clientName||'—'));
    const pj=clients.filter(c=>c.assignedTo===s.id).map(c=>c.nama);
    const pemb=clients.filter(c=>Array.isArray(c.pembukuanBy)&&c.pembukuanBy.includes(s.id)).map(c=>c.nama);
    const perp=clients.filter(c=>Array.isArray(c.perpajakanBy)&&c.perpajakanBy.includes(s.id)).map(c=>c.nama);
    const sptTask=[...new Set(tasks.filter(t=>t.assignedTo===s.id).map(t=>t.clientName))].filter(n=>n&&n!=='—');
    const pajak=[...new Set([...perp,...sptTask])];
    const out=[...pj.map(n=>chipK('👤 '+esc(n))), ...pemb.map(n=>chipK('📒 '+esc(n))), ...pajak.filter(n=>!pemb.includes(n)).map(n=>chipK('🧾 '+esc(n)))];
    return out.length?out.join(''):'<span class="muted" style="font-size:12px">belum ditugaskan</span>';
  };
  const rows=r.staff.map(s=>{
    const anggota=s.role==='staff'; const self=s.id===State.user.id; const ks=s.role==='klien-staff';
    const inv=s.perms&&s.perms.invoice;
    const invCell=!anggota?(ks?'<span class="muted">—</span>':'<span class="chip baik">Penuh</span>')
      :(isAdminRole?`<button class="btn ${inv?'hijau':'abu'} kecil" data-inv="${s.id}" data-on="${inv?1:0}">${inv?'✓':'beri'}</button>`:(inv?'<span class="chip baik">✓</span>':'<span class="muted">—</span>'));
    const kelolaBtn=self?'':`<button class="btn abu kecil" data-kelola="${s.id}" title="Reset kata sandi / ubah nama & email">🔑 Kelola</button>`;
    const delBtn=(isAdminRole&&!self&&(anggota||ks))?` <button class="btn abu kecil" data-del="${s.id}">Hapus</button>`:'';
    return `<tr><td><b>${esc(s.name)}</b></td><td>${esc(s.email)}</td><td>${peranBadge(s.role)}</td>
      <td style="max-width:300px;white-space:normal">${menanganiCell(s)}</td>
      <td>${invCell}</td>
      <td class="right">${kelolaBtn}${delBtn}</td></tr>`;
  }).join('');
  content().innerHTML=`
    <div class="toolbar"><div class="spacer"></div><button class="btn hijau" id="addStaff">+ Tambah Anggota</button></div>
    <div class="card"><div class="hd"><h3>Tim / Staff</h3><span class="muted">${r.staff.length} anggota</span></div>
    <div class="bd nopad"><div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Nama</th><th>Email</th><th>Peran</th><th>Menangani (Klien)</th><th>Akses Invoice</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></div></div>
    <p class="muted">• <b>Menangani</b>: <span class="chip" style="font-size:11px">👤 penanggung jawab (PJ)</span> <span class="chip" style="font-size:11px">📒 pelaksana pembukuan</span> <span class="chip" style="font-size:11px">🧾 pelaksana pajak</span> <span class="chip" style="font-size:11px">🏢 buku perusahaannya (staf klien)</span>. Atur di menu <b>🧩 Penugasan</b>.<br>• Peran <b>per-klien</b> (PJ/pelaksana), bukan titel tetap — satu orang bisa PJ di klien A & pelaksana di klien B.<br>• <b>🔑 Kelola</b>: reset kata sandi / ubah nama & email. <b>Akses Invoice</b>: izinkan anggota melihat/mengelola invoice.</p>`;
  document.getElementById('addStaff').onclick=()=>modalStaff(clients,isAdminRole);
  content().querySelectorAll('[data-inv]').forEach(b=>b.onclick=async()=>{ try{ await api('POST','/api/staff/'+b.dataset.inv+'/perms',{invoice:b.dataset.on!=='1'}); viewTim(); }catch(e){alert(e.message);} });
  content().querySelectorAll('[data-kelola]').forEach(b=>b.onclick=()=>{ const m=r.staff.find(x=>x.id===b.dataset.kelola); if(m) modalKelolaAkun(m); });
  content().querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{ if(!confirm('Hapus anggota ini? Akun login-nya akan dihapus.'))return; try{await api('DELETE','/api/staff/'+b.dataset.del); viewTim();}catch(e){alert(e.message);} });
}
function modalStaff(clients,isAdmin){
  clients=clients||[]; isAdmin=isAdmin!==false;
  // Non-admin (PJ): Staf klien hanya untuk klien yang dia pegang.
  const klienOpt=(isAdmin?clients:clients.filter(c=>c.assignedTo===State.user.id));
  const wrap=document.createElement('div'); wrap.className='modal-bg';
  wrap.innerHTML=`<div class="modal" style="max-width:460px"><div class="hd"><h3>Tambah Anggota</h3><button class="x">&times;</button></div>
    <div class="bd"><div id="sMsg"></div>
      <div class="field"><label>Nama</label><input id="sNama"></div>
      <div class="field"><label>Email (untuk login)</label><input id="sEmail" type="email"></div>
      <div class="field"><label>Kata Sandi Awal (min. 6)</label><input id="sPass" type="text" placeholder="beritahukan ke anggota"></div>
      <div class="field"><label>Jenis Akun</label><select id="sRole"><option value="staff">Anggota firma</option><option value="klien-staff">Staf perusahaan klien</option></select></div>
      <div class="field" id="sKlienWrap" style="display:none"><label>Klien yang ditangani (buku miliknya)</label><select id="sKlien"><option value="">— pilih klien —</option>${klienOpt.map(c=>`<option value="${c.id}">${esc(c.nama)}</option>`).join('')}</select>
        <div class="muted" style="font-size:12px;margin-top:4px">Staf ini hanya bisa membuka buku klien tersebut.</div>
        <label style="display:flex;align-items:center;gap:6px;margin-top:8px;font-size:13px"><input type="checkbox" id="sAuto"> Jurnal <b>langsung disetujui</b> <span class="muted">(tanpa perlu persetujuan konsultan)</span></label>
        <div class="muted" style="font-size:11.5px;margin-top:2px">Default: jurnalnya <b>draf</b> dulu sampai konsultan menyetujui (lebih aman). Centang bila staf ini dipercaya posting langsung.</div></div>
      <p class="muted" style="font-size:12px;margin:6px 0 0">💡 Peran (penanggung jawab / pelaksana) diatur per-klien di menu <b>🧩 Penugasan</b> setelah akun dibuat.</p>
      <div class="flex mt"><div class="spacer"></div><button class="btn abu" id="sBatal">Batal</button><button class="btn hijau" id="sSimpan">Buat Akun</button></div>
    </div></div>`;
  document.body.appendChild(wrap);
  const close=()=>wrap.remove();
  wrap.querySelector('.x').onclick=close; wrap.querySelector('#sBatal').onclick=close; wrap.onclick=(e)=>{if(e.target===wrap)close();};
  wrap.querySelector('#sRole').onchange=(e)=>{ const v=e.target.value; const sw=wrap.querySelector('#sSupWrap'); if(sw)sw.style.display=v==='staff'?'':'none'; wrap.querySelector('#sKlienWrap').style.display=v==='klien-staff'?'':'none'; };
  wrap.querySelector('#sSimpan').onclick=async()=>{
    const role=wrap.querySelector('#sRole').value;
    const body={name:wrap.querySelector('#sNama').value,email:wrap.querySelector('#sEmail').value,password:wrap.querySelector('#sPass').value,role};
    const sup=wrap.querySelector('#sSup'); if(role==='staff'&&sup) body.supervisorId=sup.value||null;
    if(role==='klien-staff'){ body.clientId=wrap.querySelector('#sKlien').value||null; body.autoApprove=wrap.querySelector('#sAuto').checked; }
    try{ await api('POST','/api/staff',body); close(); viewTim(); }
    catch(e){ wrap.querySelector('#sMsg').innerHTML=`<div class="pesan err">${esc(e.message)}</div>`; }
  };
}
function modalKelolaAkun(m){
  const wrap=document.createElement('div'); wrap.className='modal-bg';
  wrap.innerHTML=`<div class="modal" style="max-width:440px"><div class="hd"><h3>Kelola Akun — ${esc(m.name)}</h3><button class="x">&times;</button></div>
    <div class="bd"><div id="kaMsg"></div>
      <div class="field"><label>Nama</label><input id="kaNama" value="${esc(m.name||'')}"></div>
      <div class="field"><label>Email (untuk login)</label><input id="kaEmail" type="email" value="${esc(m.email||'')}"></div>
      <div class="field"><label>Reset Kata Sandi <span class="muted">(kosongkan bila tidak diubah)</span></label><input id="kaPass" type="text" placeholder="kata sandi baru (min. 6), beritahukan ke anggota"></div>
      ${m.role==='klien-staff'?`<label style="display:flex;align-items:center;gap:6px;font-size:13px;margin-top:4px"><input type="checkbox" id="kaAuto" ${m.autoApprove?'checked':''}> Jurnal <b>langsung disetujui</b> <span class="muted">(tanpa persetujuan konsultan)</span></label>`:''}
      <div class="flex mt"><div class="spacer"></div><button class="btn abu" id="kaBatal">Batal</button><button class="btn hijau" id="kaSimpan">Simpan</button></div>
    </div></div>`;
  document.body.appendChild(wrap);
  const close=()=>wrap.remove();
  wrap.querySelector('.x').onclick=close; wrap.querySelector('#kaBatal').onclick=close; wrap.onclick=(e)=>{if(e.target===wrap)close();};
  wrap.querySelector('#kaSimpan').onclick=async()=>{
    const body={name:wrap.querySelector('#kaNama').value,email:wrap.querySelector('#kaEmail').value};
    const pass=wrap.querySelector('#kaPass').value;
    if(pass){ if(pass.length<6){ wrap.querySelector('#kaMsg').innerHTML='<div class="pesan err">Kata sandi minimal 6 karakter.</div>'; return; } body.password=pass; }
    const auto=wrap.querySelector('#kaAuto'); if(auto) body.autoApprove=auto.checked;
    try{ await api('PUT','/api/staff/'+m.id,body); close(); viewTim(); }
    catch(e){ wrap.querySelector('#kaMsg').innerHTML=`<div class="pesan err">${esc(e.message)}</div>`; }
  };
}

/* ============ CETAK ============ */
function cetak(id){
  const node=document.getElementById(id); if(!node)return;
  const w=window.open('','_blank');
  w.document.write(`<html><head><title>Cetak Laporan</title>
    <style>body{font-family:Arial,sans-serif;font-size:12px;padding:24px;color:#1a202c}
    table{width:100%;border-collapse:collapse}th,td{padding:6px 10px;border-bottom:1px solid #e2e8f0}
    .num{text-align:right}.subhead td{background:#eef2f7;font-weight:bold}.total td{font-weight:bold;border-top:2px solid #cbd5e0}
    .judul{text-align:center;margin-bottom:12px}.indent{padding-left:24px}.right{text-align:right}
    .chip{display:none}</style></head><body>${node.querySelector('.bd').innerHTML}</body></html>`);
  w.document.close(); setTimeout(()=>{w.print();},300);
}

/* ============ START ============ */
(async function(){
  try{
    const me=await api('GET','/api/me');
    if(me.user){ State.user=me.user; State.company=me.company; await loadBooks(); await loadAccounts(); await loadPerms(); renderApp(); cekPengingatLogin(false); }
    else renderAuth('login');
  }catch(e){ renderAuth('login'); }
})();
