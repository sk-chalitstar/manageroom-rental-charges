// State management
let state = {
  rooms: [],
  bills: [],
  settings: {},
  currentTab: 'dashboard',
  editingRoomId: null,
  roomViewMode: 'card',    // 'card' or 'table'
  meterViewMode: 'card',   // 'card' or 'table'
  billViewMode: 'table',   // 'table' or 'card'
  isConnecting: false,
  isConnected: false
};

// Initial sample data if no Google Sheet is connected yet
const fallbackData = {
  settings: {
    dormName: 'หอพักสุขสบาย (Suk-Sabai Residence)',
    dormAddress: '123 ซอยสุขุมวิท กทม.',
    dormPhone: '081-234-5678',
    promptpayId: '0812345678',
    promptpayName: 'นายสมชาย ผู้ดูแลหอ',
    electricRate: 8,
    waterRate: 18,
    commonFeeDefault: 300,
    lineToken: ''
  },
  rooms: [
    {
      id: "101", number: "101", floor: 1, type: "แอร์ (Air Conditioner)",
      price: 4500, commonFee: 300, parkingFee: 500, licensePlate: "1กข-9999 กทม.",
      otherFee: 0, otherFeeRemark: "", status: "occupied",
      tenant: { name: "สมชาย รักสงบ", phone: "089-111-2233", lineUserId: "", startDate: "2025-01-01" },
      lastElectricMeter: 1250, lastWaterMeter: 340
    },
    {
      id: "102", number: "102", floor: 1, type: "พัดลม (Fan Room)",
      price: 3200, commonFee: 300, parkingFee: 0, licensePlate: "",
      otherFee: 0, otherFeeRemark: "", status: "occupied",
      tenant: { name: "วิภา สดใส", phone: "086-555-7788", lineUserId: "", startDate: "2025-02-15" },
      lastElectricMeter: 890, lastWaterMeter: 210
    },
    {
      id: "103", number: "103", floor: 1, type: "แอร์ (Air Conditioner)",
      price: 4500, commonFee: 300, parkingFee: 0, licensePlate: "",
      otherFee: 0, otherFeeRemark: "", status: "vacant", tenant: null,
      lastElectricMeter: 500, lastWaterMeter: 100
    },
    {
      id: "201", number: "201", floor: 2, type: "แอร์ VIP (Balcony)",
      price: 5200, commonFee: 300, parkingFee: 500, licensePlate: "9กผ-1234 กทม.",
      otherFee: 100, otherFeeRemark: "ค่าเช่าตู้เย็น", status: "occupied",
      tenant: { name: "อรรถพล ก้าวหน้า", phone: "091-888-9900", lineUserId: "", startDate: "2024-11-01" },
      lastElectricMeter: 2100, lastWaterMeter: 450
    }
  ],
  bills: [
    {
      id: "BILL-2025-02-101", roomNumber: "101", month: "กุมภาพันธ์ 2025",
      createdAt: new Date().toISOString(), dueDate: "2025-03-05", rent: 4500,
      prevElectricMeter: 1200, currElectricMeter: 1250, electricUnits: 50, electricRate: 8, electricAmount: 400,
      prevWaterMeter: 330, currWaterMeter: 340, waterUnits: 10, waterRate: 18, waterAmount: 180,
      commonFee: 300, parkingFee: 500, licensePlate: "1กข-9999 กทม.", otherFee: 0, otherFeeRemark: "",
      discount: 0, totalAmount: 5880, status: "paid", paidAt: new Date().toISOString(),
      lineSent: true, lineSentAt: new Date().toISOString()
    }
  ]
};

// ----------------------------------------------------
// API CLIENT (Communicates with Google Apps Script)
// ----------------------------------------------------

function getBaseUrl() {
  const url = window.location.href;
  return url.substring(0, url.lastIndexOf('/'));
}

async function apiCall(action, data = {}) {
  const scriptUrl = CONFIG.getScriptUrl();
  if (!scriptUrl) {
    throw new Error('ยังไม่ได้เชื่อมต่อ Google Sheets! กรุณาใส่ Web App URL ในเมนูตั้งค่า');
  }

  const payload = { action, ...data, baseUrl: getBaseUrl() };
  const res = await fetch(scriptUrl, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return await res.json();
}

async function loadAllDataFromSheet() {
  const scriptUrl = CONFIG.getScriptUrl();
  if (!scriptUrl) {
    state.settings = fallbackData.settings;
    state.rooms = fallbackData.rooms;
    state.bills = fallbackData.bills;
    updateConnectionStatusUI(false);
    return;
  }

  try {
    showLoading(true);
    const res = await fetch(`${scriptUrl}?action=getAll`);
    const result = await res.json();
    if (result.success && result.data) {
      state.settings = result.data.settings || fallbackData.settings;
      state.rooms = result.data.rooms || [];
      state.bills = result.data.bills || [];
      state.isConnected = true;
      updateConnectionStatusUI(true);
    } else {
      throw new Error(result.error || 'โหลดข้อมูลไม่สำเร็จ');
    }
  } catch (err) {
    console.warn('Cannot fetch from Google Sheet, using fallback/cached data:', err);
    state.settings = fallbackData.settings;
    state.rooms = fallbackData.rooms;
    state.bills = fallbackData.bills;
    state.isConnected = false;
    updateConnectionStatusUI(false, err.message);
  } finally {
    showLoading(false);
  }
}

function showLoading(show) {
  const el = document.getElementById('globalLoadingBar');
  if (el) el.style.display = show ? 'block' : 'none';
}

function updateConnectionStatusUI(connected, errorMsg = '') {
  const banner = document.getElementById('sheetConnectionBanner');
  const badge = document.getElementById('sheetStatusBadge');
  const testMsg = document.getElementById('sheetTestResultMsg');

  if (badge) {
    if (connected) {
      badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> เชื่อมต่อ Google Sheets แล้ว`;
      badge.className = 'flex items-center gap-1.5 font-medium text-emerald-400 text-xs';
    } else {
      badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-amber-400"></span> ยังไม่ต่อ Google Sheets`;
      badge.className = 'flex items-center gap-1.5 font-medium text-amber-300 text-xs';
    }
  }

  if (banner) {
    if (connected) {
      banner.classList.add('hidden');
    } else {
      banner.classList.remove('hidden');
      if (errorMsg) {
        document.getElementById('sheetBannerError').innerText = `(${errorMsg})`;
      }
    }
  }

  if (testMsg) {
    if (connected) {
      testMsg.innerHTML = `<span class="text-emerald-600 font-semibold flex items-center gap-1"><i data-lucide="check-circle" class="w-4 h-4"></i> เชื่อมต่อ Google Sheets สำเร็จเรียบร้อย!</span>`;
    } else if (errorMsg) {
      testMsg.innerHTML = `<span class="text-rose-600 font-semibold flex items-center gap-1"><i data-lucide="alert-circle" class="w-4 h-4"></i> เชื่อมต่อไม่สำเร็จ: ${errorMsg}</span>`;
    }
  }
  lucide.createIcons();
}

// ----------------------------------------------------
// INITIALIZE ON DOM READY
// ----------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  setupBillingMonthDefaults();
  await loadAllDataFromSheet();
  loadDashboard();
  renderRooms();
  renderMeter();
  renderBills();
  renderSettingsInputs();
  lucide.createIcons();
});

function setupBillingMonthDefaults() {
  const now = new Date();
  const thMonth = now.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
  const meterMonthInput = document.getElementById('meterBillingMonth');
  if (meterMonthInput) {
    meterMonthInput.value = thMonth;
    meterMonthInput.addEventListener('input', () => renderMeter());
  }

  const billMonthInput = document.getElementById('formBillMonth');
  if (billMonthInput) billMonthInput.value = thMonth;

  const dueDateInput = document.getElementById('formBillDueDate');
  if (dueDateInput) {
    const due = new Date();
    due.setDate(due.getDate() + 7);
    dueDateInput.value = due.toISOString().split('T')[0];
  }
}

// ----------------------------------------------------
// TAB SWITCHING
// ----------------------------------------------------
function switchTab(tabId) {
  state.currentTab = tabId;
  const tabs = ['dashboard', 'rooms', 'meter', 'bills', 'settings'];
  tabs.forEach(t => {
    const el = document.getElementById(`tab-${t}`);
    const navBtn = document.getElementById(`nav-${t}`);
    if (el) el.classList.add('hidden');
    if (navBtn) {
      navBtn.classList.remove('bg-blue-600', 'text-white');
      navBtn.classList.add('text-slate-300', 'hover:bg-slate-800');
    }
  });

  const activeEl = document.getElementById(`tab-${tabId}`);
  const activeNav = document.getElementById(`nav-${tabId}`);
  if (activeEl) activeEl.classList.remove('hidden');
  if (activeNav) {
    activeNav.classList.add('bg-blue-600', 'text-white');
    activeNav.classList.remove('text-slate-300', 'hover:bg-slate-800');
  }

  const titles = {
    dashboard: ['ภาพรวมหอพัก', 'สถิติห้องพัก ยอดค้างชำระ และข้อมูลล่าสุดจาก Google Sheets'],
    rooms: ['จัดการห้องพัก & ข้อมูลผู้เช่า', 'เพิ่ม แก้ไข ข้อมูลห้องพัก ค่าส่วนกลาง ค่าที่จอดรถ และ LINE User ID'],
    meter: ['จดมิเตอร์น้ำ - ไฟ & คำนวณบิล', 'ดึงเลขมิเตอร์เดิมอัตโนมัติ กรอกเลขใหม่ และกดสร้างบิลได้ในคลิกเดียว'],
    bills: ['ออกบิล & ส่งการแจ้งเตือน LINE', 'รายการใบแจ้งหนี้ ตรวจสอบการชำระเงิน และส่ง Flex Message เข้า LINE ผู้เช่า'],
    settings: ['ตั้งค่าหอพัก & ระบบ Google Sheets / LINE Bot', 'กำหนด Google Apps Script Web App URL และเชื่อมต่อ LINE Messaging API']
  };

  document.getElementById('pageTitle').innerText = titles[tabId][0];
  document.getElementById('pageSubtitle').innerText = titles[tabId][1];

  if (tabId === 'dashboard') loadDashboard();
  if (tabId === 'rooms') renderRooms();
  if (tabId === 'meter') renderMeter();
  if (tabId === 'bills') renderBills();
  if (tabId === 'settings') renderSettingsInputs();

  setTimeout(() => lucide.createIcons(), 50);
}

// ----------------------------------------------------
// VIEW MODES (Card vs Table)
// ----------------------------------------------------
function setRoomViewMode(mode) {
  state.roomViewMode = mode;
  const btnCard = document.getElementById('btnRoomViewCard');
  const btnTable = document.getElementById('btnRoomViewTable');
  const tableCont = document.getElementById('roomsTableContainer');
  const cardCont = document.getElementById('roomsCardContainer');

  if (mode === 'card') {
    btnCard.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition bg-white text-blue-600 shadow-sm';
    btnTable.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition text-slate-600 hover:text-slate-900';
    tableCont.classList.add('hidden');
    cardCont.classList.remove('hidden');
  } else {
    btnTable.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition bg-white text-blue-600 shadow-sm';
    btnCard.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition text-slate-600 hover:text-slate-900';
    cardCont.classList.add('hidden');
    tableCont.classList.remove('hidden');
  }
  renderRooms();
}

function setMeterViewMode(mode) {
  state.meterViewMode = mode;
  const btnCard = document.getElementById('btnMeterViewCard');
  const btnTable = document.getElementById('btnMeterViewTable');
  const tableCont = document.getElementById('meterTableContainer');
  const cardCont = document.getElementById('meterCardContainer');

  if (mode === 'card') {
    btnCard.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition bg-white text-blue-600 shadow-sm';
    btnTable.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition text-slate-600 hover:text-slate-900';
    tableCont.classList.add('hidden');
    cardCont.classList.remove('hidden');
  } else {
    btnTable.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition bg-white text-blue-600 shadow-sm';
    btnCard.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition text-slate-600 hover:text-slate-900';
    cardCont.classList.add('hidden');
    tableCont.classList.remove('hidden');
  }
  renderMeter();
}

function setBillViewMode(mode) {
  state.billViewMode = mode;
  const btnTable = document.getElementById('btnBillViewTable');
  const btnCard = document.getElementById('btnBillViewCard');
  const tableCont = document.getElementById('billsTableContainer');
  const cardCont = document.getElementById('billsCardContainer');

  if (mode === 'card') {
    btnCard.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition bg-white text-blue-600 shadow-sm';
    btnTable.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition text-slate-600 hover:text-slate-900';
    tableCont.classList.add('hidden');
    cardCont.classList.remove('hidden');
  } else {
    btnTable.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition bg-white text-blue-600 shadow-sm';
    btnCard.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition text-slate-600 hover:text-slate-900';
    cardCont.classList.add('hidden');
    tableCont.classList.remove('hidden');
  }
  renderBills();
}

// Dynamic Remark Input Toggles
function toggleRoomOtherRemark() {
  const fee = Number(document.getElementById('formRoomOtherFee')?.value || 0);
  const group = document.getElementById('roomOtherRemarkGroup');
  if (group) {
    if (fee > 0) group.classList.remove('hidden');
    else group.classList.add('hidden');
  }
}

function toggleBillOtherRemark() {
  const fee = Number(document.getElementById('formBillOtherFee')?.value || 0);
  const group = document.getElementById('billOtherRemarkGroup');
  if (group) {
    if (fee > 0) group.classList.remove('hidden');
    else group.classList.add('hidden');
  }
}

// ----------------------------------------------------
// 1. DASHBOARD
// ----------------------------------------------------
function loadDashboard() {
  const rooms = state.rooms;
  const bills = state.bills;

  const totalRooms = rooms.length;
  const occupiedRooms = rooms.filter(r => r.status === 'occupied').length;
  const vacantRooms = rooms.filter(r => r.status === 'vacant').length;
  const occupancyRate = totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : 0;

  let totalPendingAmount = 0;
  let totalPaidThisMonth = 0;
  let pendingBillsCount = 0;

  bills.forEach(bill => {
    if (bill.status === 'pending' || bill.status === 'overdue') {
      totalPendingAmount += Number(bill.totalAmount || 0);
      pendingBillsCount++;
    } else if (bill.status === 'paid') {
      totalPaidThisMonth += Number(bill.totalAmount || 0);
    }
  });

  const now = new Date();
  const currentMonth = now.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });

  document.getElementById('statTotalRooms').innerText = `${totalRooms} ห้อง`;
  document.getElementById('statOccupancyRate').innerText = `มีผู้เช่า ${occupancyRate}%`;
  document.getElementById('statOccupiedRooms').innerText = `${occupiedRooms} ห้อง`;
  document.getElementById('statVacantRooms').innerText = `${vacantRooms} ห้อง`;
  document.getElementById('statPendingAmount').innerText = `${totalPendingAmount.toLocaleString()} ฿`;
  document.getElementById('statPendingCount').innerText = pendingBillsCount;
  document.getElementById('statPaidAmount').innerText = `${totalPaidThisMonth.toLocaleString()} ฿`;
  document.getElementById('statMonthLabel').innerText = `รอบ: ${currentMonth}`;

  renderQuickRoomGrid();
}

function renderQuickRoomGrid() {
  const container = document.getElementById('quickRoomGrid');
  if (!container) return;

  container.innerHTML = state.rooms.map(room => {
    let colorClass = 'bg-emerald-50 border-emerald-300 text-emerald-800';
    let statusText = 'มีผู้เช่า';
    if (room.status === 'vacant') {
      colorClass = 'bg-slate-50 border-slate-200 text-slate-500';
      statusText = 'ห้องว่าง';
    } else if (room.status === 'maintenance') {
      colorClass = 'bg-amber-50 border-amber-300 text-amber-800';
      statusText = 'ซ่อมบำรุง';
    }

    return `
      <div class="border rounded-xl p-3 flex flex-col justify-between transition hover:shadow-md cursor-pointer ${colorClass}" onclick="openEditRoomModal('${room.number}')">
        <div class="flex items-center justify-between">
          <span class="font-bold text-base">ห้อง ${room.number}</span>
          <span class="text-[10px] px-1.5 py-0.5 rounded font-medium bg-white/70">${statusText}</span>
        </div>
        <div class="mt-2 text-xs">
          <p class="font-semibold text-slate-700 truncate">${room.tenant ? room.tenant.name : '—'}</p>
          <p class="text-[11px] opacity-75">${Number(room.price).toLocaleString()} ฿/ด.</p>
        </div>
      </div>
    `;
  }).join('');
}

// ----------------------------------------------------
// 2. ROOMS MANAGEMENT
// ----------------------------------------------------
function renderRooms() {
  const tbody = document.getElementById('roomsTableBody');
  const cardContainer = document.getElementById('roomsCardContainer');
  if (!tbody || !cardContainer) return;

  const search = (document.getElementById('roomSearchInput')?.value || '').toLowerCase();
  const filter = document.getElementById('roomStatusFilter')?.value || 'all';

  const filtered = state.rooms.filter(room => {
    const matchSearch = String(room.number).toLowerCase().includes(search) ||
      (room.tenant && room.tenant.name.toLowerCase().includes(search)) ||
      (room.licensePlate && room.licensePlate.toLowerCase().includes(search));
    const matchStatus = filter === 'all' || room.status === filter;
    return matchSearch && matchStatus;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" class="text-center py-8 text-slate-400">ไม่พบห้องพักตามเงื่อนไข</td></tr>`;
    cardContainer.innerHTML = `<div class="col-span-full text-center py-12 text-slate-400 bg-white rounded-2xl border border-slate-200">ไม่พบห้องพักตามเงื่อนไข</div>`;
    return;
  }

  // Table View
  tbody.innerHTML = filtered.map(room => {
    let badge = `<span class="px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">มีผู้เช่า</span>`;
    if (room.status === 'vacant') badge = `<span class="px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600">ว่าง</span>`;
    if (room.status === 'maintenance') badge = `<span class="px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">ซ่อมบำรุง</span>`;

    const tenant = room.tenant || {};
    const lineBadge = tenant.lineUserId 
      ? `<span class="font-mono text-[10px] text-emerald-600 font-medium truncate max-w-[100px] block" title="${tenant.lineUserId}">✓ เชื่อมแล้ว</span>`
      : `<span class="text-[11px] text-slate-400">ยังไม่ระบุ</span>`;

    const parkingInfo = room.parkingFee > 0
      ? `<div><span class="font-semibold text-slate-700">${Number(room.parkingFee).toLocaleString()} ฿</span>${room.licensePlate ? `<span class="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 block mt-0.5">${room.licensePlate}</span>` : ''}</div>`
      : `<span class="text-slate-400 text-xs">-</span>`;

    const otherInfo = room.otherFee > 0
      ? `<div><span class="font-semibold text-slate-700">${Number(room.otherFee).toLocaleString()} ฿</span>${room.otherFeeRemark ? `<span class="text-[10px] text-slate-500 block truncate max-w-[100px]" title="${room.otherFeeRemark}">(${room.otherFeeRemark})</span>` : ''}</div>`
      : `<span class="text-slate-400 text-xs">-</span>`;

    return `
      <tr class="hover:bg-slate-50 transition">
        <td class="px-5 py-4 font-bold text-slate-800 text-base">ห้อง ${room.number}</td>
        <td class="px-5 py-4 text-xs">${room.type || 'มาตรฐาน'} (ชั้น ${room.floor || 1})</td>
        <td class="px-5 py-4 font-semibold text-slate-700">${Number(room.price).toLocaleString()} ฿</td>
        <td class="px-5 py-4 text-xs">${Number(room.commonFee || 0).toLocaleString()} ฿</td>
        <td class="px-5 py-4 text-xs">${parkingInfo}</td>
        <td class="px-5 py-4 text-xs">${otherInfo}</td>
        <td class="px-5 py-4">${badge}</td>
        <td class="px-5 py-4">
          <p class="font-medium text-slate-800 text-xs">${tenant.name || '—'}</p>
          <p class="text-[11px] text-slate-400">${tenant.phone || ''}</p>
        </td>
        <td class="px-5 py-4">${lineBadge}</td>
        <td class="px-5 py-4 text-center">
          <div class="flex items-center justify-center gap-1.5">
            <button onclick="openEditRoomModal('${room.number}')" class="p-1.5 hover:bg-blue-50 text-blue-600 rounded-lg transition" title="แก้ไข">
              <i data-lucide="edit-2" class="w-4 h-4"></i>
            </button>
            <button onclick="deleteRoom('${room.number}')" class="p-1.5 hover:bg-rose-50 text-rose-600 rounded-lg transition" title="ลบ">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  // Card View
  cardContainer.innerHTML = filtered.map(room => {
    let borderClass = 'border-slate-200';
    let statusBadge = `<span class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">มีผู้เช่า</span>`;
    if (room.status === 'vacant') {
      statusBadge = `<span class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">ห้องว่าง</span>`;
    } else if (room.status === 'maintenance') {
      borderClass = 'border-amber-200';
      statusBadge = `<span class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">ซ่อมบำรุง</span>`;
    }

    const tenant = room.tenant || {};
    const lineBadge = tenant.lineUserId 
      ? `<span class="text-[10px] text-emerald-600 font-semibold flex items-center gap-1"><i data-lucide="check-circle" class="w-3 h-3"></i> มี LINE ID</span>`
      : `<span class="text-[10px] text-slate-400">ยังไม่มี LINE ID</span>`;

    return `
      <div class="bg-white rounded-2xl border ${borderClass} shadow-sm hover:shadow-md transition p-5 flex flex-col justify-between space-y-4">
        <div>
          <div class="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <span class="text-xs font-semibold text-blue-600">ชั้น ${room.floor || 1} • ${room.type || 'มาตรฐาน'}</span>
              <h3 class="text-xl font-bold text-slate-800">ห้อง ${room.number}</h3>
            </div>
            <div>${statusBadge}</div>
          </div>

          <div class="mt-3 bg-slate-50 rounded-xl p-3 space-y-1.5 text-xs text-slate-600">
            <div class="flex justify-between items-center">
              <span>ค่าเช่าห้อง:</span>
              <span class="font-bold text-slate-800 text-sm">${Number(room.price).toLocaleString()} ฿/ด.</span>
            </div>
            <div class="flex justify-between items-center">
              <span>ค่าส่วนกลาง:</span>
              <span class="font-medium text-slate-700">${Number(room.commonFee || 0).toLocaleString()} ฿</span>
            </div>
            ${room.parkingFee > 0 ? `
              <div class="flex justify-between items-center text-indigo-700">
                <span class="flex items-center gap-1"><i data-lucide="car" class="w-3.5 h-3.5"></i> ที่จอดรถ ${room.licensePlate ? `(${room.licensePlate})` : ''}:</span>
                <span class="font-semibold">${Number(room.parkingFee).toLocaleString()} ฿</span>
              </div>
            ` : ''}
            ${room.otherFee > 0 ? `
              <div class="flex justify-between items-center text-amber-700">
                <span>อื่นๆ (${room.otherFeeRemark || 'เพิ่มเติม'}):</span>
                <span class="font-semibold">${Number(room.otherFee).toLocaleString()} ฿</span>
              </div>
            ` : ''}
          </div>

          <div class="mt-3 pt-2 border-t border-slate-100 text-xs">
            ${room.status === 'occupied' && tenant.name ? `
              <div class="space-y-1">
                <div class="flex items-center justify-between">
                  <p class="font-semibold text-slate-800 flex items-center gap-1">
                    <i data-lucide="user" class="w-3.5 h-3.5 text-blue-600"></i> ${tenant.name}
                  </p>
                  ${lineBadge}
                </div>
                <p class="text-slate-500 text-[11px] flex items-center gap-1">
                  <i data-lucide="phone" class="w-3 h-3"></i> ${tenant.phone || 'ไม่ระบุเบอร์'}
                </p>
              </div>
            ` : `
              <p class="text-slate-400 italic flex items-center gap-1">
                <i data-lucide="info" class="w-3.5 h-3.5"></i> ยังไม่มีผู้เช่าในห้องนี้
              </p>
            `}
          </div>
        </div>

        <div class="flex items-center justify-between border-t border-slate-100 pt-3">
          <div class="text-[11px] text-slate-400">
            มิเตอร์เดิม: ไฟ ${room.lastElectricMeter || 0} / น้ำ ${room.lastWaterMeter || 0}
          </div>
          <div class="flex items-center gap-1">
            <button onclick="openEditRoomModal('${room.number}')" class="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg text-xs font-semibold transition flex items-center gap-1">
              <i data-lucide="edit-2" class="w-3.5 h-3.5"></i> แก้ไข
            </button>
            <button onclick="deleteRoom('${room.number}')" class="p-1.5 hover:bg-rose-50 text-rose-600 rounded-lg transition" title="ลบ">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  lucide.createIcons();
}

function openAddRoomModal() {
  state.editingRoomId = null;
  document.getElementById('roomModalTitle').innerText = 'เพิ่มห้องพักใหม่';
  document.getElementById('formRoomNumber').value = '';
  document.getElementById('formRoomNumber').disabled = false;
  document.getElementById('formRoomFloor').value = '1';
  document.getElementById('formRoomType').value = 'แอร์';
  document.getElementById('formRoomPrice').value = '4500';
  document.getElementById('formRoomCommonFee').value = state.settings.commonFeeDefault || 300;
  document.getElementById('formRoomParkingFee').value = '0';
  document.getElementById('formRoomLicensePlate').value = '';
  document.getElementById('formRoomOtherFee').value = '0';
  document.getElementById('formRoomOtherRemark').value = '';
  document.getElementById('formRoomStatus').value = 'occupied';
  document.getElementById('formTenantName').value = '';
  document.getElementById('formTenantPhone').value = '';
  document.getElementById('formTenantLineId').value = '';
  document.getElementById('formLastElecMeter').value = '0';
  document.getElementById('formLastWaterMeter').value = '0';
  toggleTenantFields();
  toggleRoomOtherRemark();
  document.getElementById('roomModal').classList.remove('hidden');
}

function openEditRoomModal(roomNumber) {
  const room = state.rooms.find(r => String(r.number) === String(roomNumber));
  if (!room) return;

  state.editingRoomId = room.number;
  document.getElementById('roomModalTitle').innerText = `แก้ไขห้อง ${room.number}`;
  document.getElementById('formRoomNumber').value = room.number;
  document.getElementById('formRoomNumber').disabled = true;
  document.getElementById('formRoomFloor').value = room.floor || 1;
  document.getElementById('formRoomType').value = room.type || '';
  document.getElementById('formRoomPrice').value = room.price || '';
  document.getElementById('formRoomCommonFee').value = room.commonFee !== undefined ? room.commonFee : (state.settings.commonFeeDefault || 300);
  document.getElementById('formRoomParkingFee').value = room.parkingFee || 0;
  document.getElementById('formRoomLicensePlate').value = room.licensePlate || '';
  document.getElementById('formRoomOtherFee').value = room.otherFee || 0;
  document.getElementById('formRoomOtherRemark').value = room.otherFeeRemark || '';
  document.getElementById('formRoomStatus').value = room.status || 'occupied';

  const tenant = room.tenant || {};
  document.getElementById('formTenantName').value = tenant.name || '';
  document.getElementById('formTenantPhone').value = tenant.phone || '';
  document.getElementById('formTenantLineId').value = tenant.lineUserId || '';
  document.getElementById('formLastElecMeter').value = room.lastElectricMeter || 0;
  document.getElementById('formLastWaterMeter').value = room.lastWaterMeter || 0;

  toggleTenantFields();
  toggleRoomOtherRemark();
  document.getElementById('roomModal').classList.remove('hidden');
}

function toggleTenantFields() {
  const status = document.getElementById('formRoomStatus').value;
  const tenantBox = document.getElementById('tenantFields');
  if (status === 'vacant') {
    tenantBox.classList.add('opacity-40', 'pointer-events-none');
  } else {
    tenantBox.classList.remove('opacity-40', 'pointer-events-none');
  }
}

function closeRoomModal() {
  document.getElementById('roomModal').classList.add('hidden');
}

async function saveRoomForm(e) {
  e.preventDefault();
  const number = document.getElementById('formRoomNumber').value.trim();
  const floor = Number(document.getElementById('formRoomFloor').value);
  const type = document.getElementById('formRoomType').value.trim();
  const price = Number(document.getElementById('formRoomPrice').value);
  const commonFee = Number(document.getElementById('formRoomCommonFee').value || 0);
  const parkingFee = Number(document.getElementById('formRoomParkingFee').value || 0);
  const licensePlate = document.getElementById('formRoomLicensePlate').value.trim();
  const otherFee = Number(document.getElementById('formRoomOtherFee').value || 0);
  const otherFeeRemark = document.getElementById('formRoomOtherRemark').value.trim();
  const status = document.getElementById('formRoomStatus').value;

  const tenantName = document.getElementById('formTenantName').value.trim();
  const tenantPhone = document.getElementById('formTenantPhone').value.trim();
  const tenantLineId = document.getElementById('formTenantLineId').value.trim();

  const lastElectricMeter = Number(document.getElementById('formLastElecMeter').value || 0);
  const lastWaterMeter = Number(document.getElementById('formLastWaterMeter').value || 0);

  const roomData = {
    number, floor, type, price, commonFee, parkingFee, licensePlate,
    otherFee, otherFeeRemark, status,
    tenant: status === 'occupied' ? {
      name: tenantName, phone: tenantPhone, lineUserId: tenantLineId
    } : null,
    lastElectricMeter, lastWaterMeter
  };

  try {
    showLoading(true);
    if (CONFIG.getScriptUrl()) {
      const res = await apiCall('saveRoom', { data: roomData });
      if (!res.success) throw new Error(res.error);
    }
    
    // Update local state
    const idx = state.rooms.findIndex(r => String(r.number) === String(number));
    if (idx >= 0) state.rooms[idx] = roomData;
    else state.rooms.push(roomData);

    closeRoomModal();
    renderRooms();
    renderMeter();
    loadDashboard();
    alert('บันทึกข้อมูลห้องพักลง Google Sheets เรียบร้อย!');
  } catch (err) {
    alert(`เกิดข้อผิดพลาด: ${err.message}`);
  } finally {
    showLoading(false);
  }
}

async function deleteRoom(roomNumber) {
  if (!confirm(`คุณแน่ใจว่าต้องการลบห้อง ${roomNumber} ออกจากระบบและ Google Sheets หรือไม่?`)) return;
  try {
    showLoading(true);
    if (CONFIG.getScriptUrl()) {
      const res = await apiCall('deleteRoom', { roomNumber });
      if (!res.success) throw new Error(res.error);
    }
    state.rooms = state.rooms.filter(r => String(r.number) !== String(roomNumber));
    renderRooms();
    renderMeter();
    loadDashboard();
  } catch (err) {
    alert(err.message);
  } finally {
    showLoading(false);
  }
}

// ----------------------------------------------------
// 3. METER RECORDING & QUICK BILL
// ----------------------------------------------------
function renderMeter() {
  const tbody = document.getElementById('meterEntryTableBody');
  const cardContainer = document.getElementById('meterCardContainer');
  if (!tbody || !cardContainer) return;

  const occupiedRooms = state.rooms.filter(r => r.status === 'occupied');
  if (occupiedRooms.length === 0) {
    tbody.innerHTML = `<tr><td colspan="15" class="text-center py-8 text-slate-400">ยังไม่มีห้องที่มีผู้เช่า</td></tr>`;
    cardContainer.innerHTML = `<div class="col-span-full text-center py-12 text-slate-400 bg-slate-50 rounded-2xl border border-slate-200">ยังไม่มีห้องที่มีผู้เช่า</div>`;
    return;
  }

  // Card View (รูปที่ 1 & 2)
  cardContainer.innerHTML = occupiedRooms.map(room => {
    const prevElec = room.lastElectricMeter || 0;
    const prevWater = room.lastWaterMeter || 0;
    const rentVal = room.price !== undefined && room.price !== null ? room.price : '';
    const commonVal = (room.commonFee !== undefined && room.commonFee !== null && room.commonFee !== '') ? room.commonFee : (state.settings.commonFeeDefault || 300);
    const parkingVal = (room.parkingFee && room.parkingFee > 0) ? room.parkingFee : '';
    const plateVal = room.licensePlate || '';
    const otherVal = (room.otherFee && room.otherFee > 0) ? room.otherFee : '';
    const remarkVal = room.otherFeeRemark || '';

    const initialTotal = Number(rentVal || 0) + Number(commonVal || 0) + Number(parkingVal || 0) + Number(otherVal || 0);

    return `
      <div class="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4 hover:shadow-md transition">
        <div class="flex items-center justify-between border-b border-slate-100 pb-2">
          <div>
            <h4 class="font-bold text-slate-800 text-lg">ห้อง ${room.number}</h4>
            <p class="text-xs text-slate-500 font-medium">${room.tenant?.name || '—'}</p>
          </div>
          <span class="text-xs px-2.5 py-1 bg-blue-50 text-blue-700 font-bold rounded-lg text-sm" id="card-m-total-${room.number}">
            ${initialTotal.toLocaleString()} ฿
          </span>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div class="p-3 bg-amber-50/60 border border-amber-200/60 rounded-xl space-y-1.5">
            <div class="flex items-center justify-between text-xs font-bold text-amber-800">
              <span class="flex items-center gap-1"><i data-lucide="zap" class="w-3.5 h-3.5 text-amber-600"></i> ไฟฟ้า</span>
              <span class="text-[10px] text-slate-400">เดิม: ${prevElec}</span>
            </div>
            <input type="number" id="card-m-curr-elec-${room.number}" placeholder="เลขใหม่" oninput="updateMeterCardCalc('${room.number}')" class="w-full bg-white border border-amber-300 rounded-lg p-1.5 text-xs focus:ring-1 focus:ring-amber-500 font-semibold">
            <p class="text-[11px] text-amber-700 font-semibold" id="card-m-diff-elec-${room.number}">0 หน่วย</p>
          </div>

          <div class="p-3 bg-cyan-50/60 border border-cyan-200/60 rounded-xl space-y-1.5">
            <div class="flex items-center justify-between text-xs font-bold text-cyan-800">
              <span class="flex items-center gap-1"><i data-lucide="droplet" class="w-3.5 h-3.5 text-cyan-600"></i> น้ำประปา</span>
              <span class="text-[10px] text-slate-400">เดิม: ${prevWater}</span>
            </div>
            <input type="number" id="card-m-curr-water-${room.number}" placeholder="เลขใหม่" oninput="updateMeterCardCalc('${room.number}')" class="w-full bg-white border border-cyan-300 rounded-lg p-1.5 text-xs focus:ring-1 focus:ring-cyan-500 font-semibold">
            <p class="text-[11px] text-cyan-700 font-semibold" id="card-m-diff-water-${room.number}">0 หน่วย</p>
          </div>
        </div>

        <div class="border border-slate-200 rounded-xl p-3.5 bg-slate-50 space-y-2.5 text-xs">
          <p class="font-bold text-slate-700 flex items-center gap-1.5 text-xs">
            <i data-lucide="calculator" class="w-4 h-4 text-indigo-600"></i>
            ค่าใช้จ่ายประจำห้องพัก (สำหรับคิดบิลอัตโนมัติ)
          </p>

          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block text-[11px] font-semibold text-slate-600 mb-1">ค่าเช่าห้อง (บาท) *</label>
              <input type="number" id="card-m-rent-${room.number}" value="${rentVal}" placeholder="0" oninput="updateMeterCardCalc('${room.number}')" class="w-full border border-slate-200 rounded-lg p-1.5 text-xs bg-white focus:outline-blue-500 font-medium">
            </div>
            <div>
              <label class="block text-[11px] font-semibold text-slate-600 mb-1">ค่าส่วนกลาง (บาท)</label>
              <input type="number" id="card-m-common-${room.number}" value="${commonVal}" placeholder="0" oninput="updateMeterCardCalc('${room.number}')" class="w-full border border-slate-200 rounded-lg p-1.5 text-xs bg-white focus:outline-blue-500 font-medium">
            </div>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block text-[11px] font-semibold text-slate-600 mb-1">ค่าที่จอดรถ (บาท)</label>
              <input type="number" id="card-m-parking-${room.number}" value="${parkingVal}" placeholder="0" oninput="updateMeterCardCalc('${room.number}')" class="w-full border border-slate-200 rounded-lg p-1.5 text-xs bg-white focus:outline-blue-500 font-medium">
            </div>
            <div>
              <label class="block text-[11px] font-semibold text-slate-600 mb-1">ทะเบียนรถ (ถ้ามี)</label>
              <input type="text" id="card-m-plate-${room.number}" value="${plateVal}" placeholder="1กข-9999 กทม." class="w-full border border-slate-200 rounded-lg p-1.5 text-xs bg-white focus:outline-blue-500">
            </div>
          </div>

          <div class="grid grid-cols-2 gap-2 pt-1 border-t border-slate-200">
            <div>
              <label class="block text-[11px] font-semibold text-slate-600 mb-1">ค่าอื่นๆ (บาท)</label>
              <input type="number" id="card-m-other-${room.number}" value="${otherVal}" placeholder="0" oninput="toggleCardMeterOtherRemark('${room.number}'); updateMeterCardCalc('${room.number}')" class="w-full border border-slate-200 rounded-lg p-1.5 text-xs bg-white focus:outline-blue-500 font-medium">
            </div>
            <div id="card-m-remark-group-${room.number}" class="${otherVal ? '' : 'hidden'}">
              <label class="block text-[11px] font-semibold text-amber-700 mb-1">ระบุหมายเหตุค่าอื่นๆ *</label>
              <input type="text" id="card-m-remark-${room.number}" value="${remarkVal}" placeholder="เช่น ค่าเช่าตู้เย็น, ค่าคีย์การ์ด" class="w-full border border-amber-300 rounded-lg p-1.5 text-xs bg-amber-50/50 focus:outline-amber-500">
            </div>
          </div>
        </div>

        <button onclick="createBillFromCard('${room.number}')" class="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm transition flex items-center justify-center gap-2">
          <i data-lucide="receipt" class="w-4 h-4"></i> ออกบิลห้อง ${room.number}
        </button>
      </div>
    `;
  }).join('');

  // Table View
  tbody.innerHTML = occupiedRooms.map(room => {
    const prevElec = room.lastElectricMeter || 0;
    const prevWater = room.lastWaterMeter || 0;
    const rentVal = room.price !== undefined && room.price !== null ? room.price : '';
    const commonVal = (room.commonFee !== undefined && room.commonFee !== null && room.commonFee !== '') ? room.commonFee : (state.settings.commonFeeDefault || 300);
    const parkingVal = (room.parkingFee && room.parkingFee > 0) ? room.parkingFee : '';
    const plateVal = room.licensePlate || '';
    const otherVal = (room.otherFee && room.otherFee > 0) ? room.otherFee : '';
    const remarkVal = room.otherFeeRemark || '';

    const initialTotal = Number(rentVal || 0) + Number(commonVal || 0) + Number(parkingVal || 0) + Number(otherVal || 0);

    return `
      <tr id="meter-row-${room.number}" class="hover:bg-slate-50 transition text-xs">
        <td class="px-3 py-3">
          <p class="font-bold text-slate-800 text-sm">ห้อง ${room.number}</p>
          <p class="text-[11px] text-slate-500">${room.tenant?.name || '—'}</p>
        </td>

        <td class="px-3 py-3 font-mono text-slate-500 bg-slate-50/50">
          <input type="number" id="m-prev-elec-${room.number}" value="${prevElec}" readonly class="w-14 bg-transparent border-0 font-mono text-xs">
        </td>
        <td class="px-3 py-3">
          <input type="number" id="m-curr-elec-${room.number}" placeholder="เลขใหม่" oninput="updateMeterRowCalc('${room.number}')" class="w-20 border border-amber-300 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-amber-500 font-semibold">
        </td>
        <td class="px-3 py-3 font-bold text-amber-600" id="m-diff-elec-${room.number}">0 น.</td>

        <td class="px-3 py-3 font-mono text-slate-500 bg-slate-50/50">
          <input type="number" id="m-prev-water-${room.number}" value="${prevWater}" readonly class="w-14 bg-transparent border-0 font-mono text-xs">
        </td>
        <td class="px-3 py-3">
          <input type="number" id="m-curr-water-${room.number}" placeholder="เลขใหม่" oninput="updateMeterRowCalc('${room.number}')" class="w-20 border border-cyan-300 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-cyan-500 font-semibold">
        </td>
        <td class="px-3 py-3 font-bold text-cyan-600" id="m-diff-water-${room.number}">0 น.</td>

        <td class="px-3 py-3">
          <input type="number" id="m-rent-${room.number}" value="${rentVal}" placeholder="0" oninput="updateMeterRowCalc('${room.number}')" class="w-20 border border-slate-200 rounded px-1.5 py-1 text-xs">
        </td>
        <td class="px-3 py-3">
          <input type="number" id="m-common-${room.number}" value="${commonVal}" placeholder="0" oninput="updateMeterRowCalc('${room.number}')" class="w-16 border border-slate-200 rounded px-1.5 py-1 text-xs">
        </td>
        <td class="px-3 py-3">
          <input type="number" id="m-parking-${room.number}" value="${parkingVal}" placeholder="0" oninput="updateMeterRowCalc('${room.number}')" class="w-16 border border-slate-200 rounded px-1.5 py-1 text-xs">
        </td>
        <td class="px-3 py-3">
          <input type="text" id="m-plate-${room.number}" value="${plateVal}" placeholder="ทะเบียนรถ" class="w-24 border border-slate-200 rounded px-1.5 py-1 text-xs">
        </td>
        <td class="px-3 py-3">
          <input type="number" id="m-other-${room.number}" value="${otherVal}" placeholder="0" oninput="toggleTableMeterOtherRemark('${room.number}'); updateMeterRowCalc('${room.number}')" class="w-16 border border-slate-200 rounded px-1.5 py-1 text-xs">
        </td>
        <td class="px-3 py-3">
          <input type="text" id="m-remark-${room.number}" value="${remarkVal}" placeholder="ระบุหมายเหตุ" class="w-28 border border-amber-300 rounded px-1.5 py-1 text-xs ${otherVal ? '' : 'hidden'} bg-amber-50/50">
        </td>

        <td class="px-3 py-3 font-bold text-blue-600 text-sm whitespace-nowrap" id="m-total-${room.number}">
          ${initialTotal.toLocaleString()} ฿
        </td>

        <td class="px-3 py-3 text-center">
          <button onclick="createBillFromMeterRow('${room.number}')" class="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm transition whitespace-nowrap">
            สร้างบิล
          </button>
        </td>
      </tr>
    `;
  }).join('');

  lucide.createIcons();
}

function toggleCardMeterOtherRemark(roomNumber) {
  const fee = Number(document.getElementById(`card-m-other-${roomNumber}`)?.value || 0);
  const group = document.getElementById(`card-m-remark-group-${roomNumber}`);
  if (group) {
    if (fee > 0) group.classList.remove('hidden');
    else group.classList.add('hidden');
  }
}

function toggleTableMeterOtherRemark(roomNumber) {
  const fee = Number(document.getElementById(`m-other-${roomNumber}`)?.value || 0);
  const input = document.getElementById(`m-remark-${roomNumber}`);
  if (input) {
    if (fee > 0) input.classList.remove('hidden');
    else input.classList.add('hidden');
  }
}

function updateMeterCardCalc(roomNumber) {
  const room = state.rooms.find(r => String(r.number) === String(roomNumber));
  if (!room) return;

  const elecRate = Number(state.settings.electricRate || 8);
  const waterRate = Number(state.settings.waterRate || 18);

  const prevElec = Number(room.lastElectricMeter || 0);
  const currElecInput = document.getElementById(`card-m-curr-elec-${roomNumber}`)?.value;
  const currElec = (currElecInput !== '' && currElecInput !== undefined) ? Number(currElecInput) : prevElec;
  const diffElec = Math.max(0, currElec - prevElec);
  const elecAmount = Math.round(diffElec * elecRate);
  const diffElecEl = document.getElementById(`card-m-diff-elec-${roomNumber}`);
  if (diffElecEl) diffElecEl.innerText = `${diffElec} หน่วย (${elecAmount.toLocaleString()} ฿)`;

  const prevWater = Number(room.lastWaterMeter || 0);
  const currWaterInput = document.getElementById(`card-m-curr-water-${roomNumber}`)?.value;
  const currWater = (currWaterInput !== '' && currWaterInput !== undefined) ? Number(currWaterInput) : prevWater;
  const diffWater = Math.max(0, currWater - prevWater);
  const waterAmount = Math.round(diffWater * waterRate);
  const diffWaterEl = document.getElementById(`card-m-diff-water-${roomNumber}`);
  if (diffWaterEl) diffWaterEl.innerText = `${diffWater} หน่วย (${waterAmount.toLocaleString()} ฿)`;

  const rent = Number(document.getElementById(`card-m-rent-${roomNumber}`)?.value || 0);
  const common = Number(document.getElementById(`card-m-common-${roomNumber}`)?.value || 0);
  const parking = Number(document.getElementById(`card-m-parking-${roomNumber}`)?.value || 0);
  const other = Number(document.getElementById(`card-m-other-${roomNumber}`)?.value || 0);

  const total = rent + common + parking + other + elecAmount + waterAmount;
  const totalEl = document.getElementById(`card-m-total-${roomNumber}`);
  if (totalEl) totalEl.innerText = `${total.toLocaleString()} ฿`;
}

function updateMeterRowCalc(roomNumber) {
  const room = state.rooms.find(r => String(r.number) === String(roomNumber));
  if (!room) return;

  const elecRate = Number(state.settings.electricRate || 8);
  const waterRate = Number(state.settings.waterRate || 18);

  const prevElec = Number(document.getElementById(`m-prev-elec-${roomNumber}`)?.value || room.lastElectricMeter || 0);
  const currElecInput = document.getElementById(`m-curr-elec-${roomNumber}`)?.value;
  const currElec = (currElecInput !== '' && currElecInput !== undefined) ? Number(currElecInput) : prevElec;
  const diffElec = Math.max(0, currElec - prevElec);
  const elecAmount = Math.round(diffElec * elecRate);
  const diffElecEl = document.getElementById(`m-diff-elec-${roomNumber}`);
  if (diffElecEl) diffElecEl.innerText = `${diffElec} น. (${elecAmount}฿)`;

  const prevWater = Number(document.getElementById(`m-prev-water-${roomNumber}`)?.value || room.lastWaterMeter || 0);
  const currWaterInput = document.getElementById(`m-curr-water-${roomNumber}`)?.value;
  const currWater = (currWaterInput !== '' && currWaterInput !== undefined) ? Number(currWaterInput) : prevWater;
  const diffWater = Math.max(0, currWater - prevWater);
  const waterAmount = Math.round(diffWater * waterRate);
  const diffWaterEl = document.getElementById(`m-diff-water-${roomNumber}`);
  if (diffWaterEl) diffWaterEl.innerText = `${diffWater} น. (${waterAmount}฿)`;

  const rent = Number(document.getElementById(`m-rent-${roomNumber}`)?.value || 0);
  const common = Number(document.getElementById(`m-common-${roomNumber}`)?.value || 0);
  const parking = Number(document.getElementById(`m-parking-${roomNumber}`)?.value || 0);
  const other = Number(document.getElementById(`m-other-${roomNumber}`)?.value || 0);

  const total = rent + common + parking + other + elecAmount + waterAmount;
  const totalEl = document.getElementById(`m-total-${roomNumber}`);
  if (totalEl) totalEl.innerText = `${total.toLocaleString()} ฿`;
}

async function createBillFromCard(roomNumber) {
  const room = state.rooms.find(r => String(r.number) === String(roomNumber));
  if (!room) return;

  const month = document.getElementById('meterBillingMonth').value;
  const currElecInput = document.getElementById(`card-m-curr-elec-${roomNumber}`)?.value;
  const currWaterInput = document.getElementById(`card-m-curr-water-${roomNumber}`)?.value;

  if (currElecInput === '' || currElecInput === undefined) {
    alert(`กรุณากรอกเลขมิเตอร์ไฟใหม่ของห้อง ${roomNumber}`);
    document.getElementById(`card-m-curr-elec-${roomNumber}`)?.focus();
    return;
  }

  const currElec = Number(currElecInput);
  const currWater = (currWaterInput !== '' && currWaterInput !== undefined) ? Number(currWaterInput) : (room.lastWaterMeter || 0);

  const rent = Number(document.getElementById(`card-m-rent-${roomNumber}`)?.value || 0);
  const commonFee = Number(document.getElementById(`card-m-common-${roomNumber}`)?.value || 0);
  const parkingFee = Number(document.getElementById(`card-m-parking-${roomNumber}`)?.value || 0);
  const licensePlate = document.getElementById(`card-m-plate-${roomNumber}`)?.value.trim() || '';
  const otherFee = Number(document.getElementById(`card-m-other-${roomNumber}`)?.value || 0);
  const otherFeeRemark = document.getElementById(`card-m-remark-${roomNumber}`)?.value.trim() || '';

  const billPayload = {
    roomNumber: room.number, month, rent,
    prevElectricMeter: room.lastElectricMeter || 0, currElectricMeter: currElec,
    prevWaterMeter: room.lastWaterMeter || 0, currWaterMeter: currWater,
    commonFee, parkingFee, licensePlate, otherFee, otherFeeRemark,
    electricRate: state.settings.electricRate || 8, waterRate: state.settings.waterRate || 18
  };

  try {
    showLoading(true);
    if (CONFIG.getScriptUrl()) {
      const res = await apiCall('saveBill', { data: billPayload });
      if (!res.success) throw new Error(res.error);
    }
    
    // Update local state
    room.lastElectricMeter = currElec;
    room.lastWaterMeter = currWater;
    
    // Prepend mock bill locally
    const newBill = {
      ...billPayload,
      id: `BILL-${Date.now().toString().slice(-6)}-${room.number}`,
      electricUnits: Math.max(0, currElec - (room.lastElectricMeter || 0)),
      electricAmount: Math.round(Math.max(0, currElec - (room.lastElectricMeter || 0)) * (state.settings.electricRate || 8)),
      waterUnits: Math.max(0, currWater - (room.lastWaterMeter || 0)),
      waterAmount: Math.round(Math.max(0, currWater - (room.lastWaterMeter || 0)) * (state.settings.waterRate || 18)),
      totalAmount: rent + commonFee + parkingFee + otherFee + Math.round(Math.max(0, currElec - (room.lastElectricMeter || 0)) * (state.settings.electricRate || 8)) + Math.round(Math.max(0, currWater - (room.lastWaterMeter || 0)) * (state.settings.waterRate || 18)),
      status: 'pending', lineSent: false
    };
    state.bills.unshift(newBill);

    alert(`สร้างบิลห้อง ${roomNumber} เรียบร้อยแล้ว!`);
    renderBills();
    renderMeter();
    loadDashboard();
    switchTab('bills');
  } catch (err) {
    alert(`เกิดข้อผิดพลาด: ${err.message}`);
  } finally {
    showLoading(false);
  }
}

async function createBillFromMeterRow(roomNumber) {
  const room = state.rooms.find(r => String(r.number) === String(roomNumber));
  if (!room) return;

  const month = document.getElementById('meterBillingMonth').value;
  const currElecInput = document.getElementById(`m-curr-elec-${roomNumber}`)?.value;
  const currWaterInput = document.getElementById(`m-curr-water-${roomNumber}`)?.value;

  if (currElecInput === '' || currElecInput === undefined) {
    alert(`กรุณากรอกเลขมิเตอร์ไฟใหม่ของห้อง ${roomNumber}`);
    document.getElementById(`m-curr-elec-${roomNumber}`)?.focus();
    return;
  }

  const currElec = Number(currElecInput);
  const currWater = (currWaterInput !== '' && currWaterInput !== undefined) ? Number(currWaterInput) : (room.lastWaterMeter || 0);

  const rent = Number(document.getElementById(`m-rent-${roomNumber}`)?.value || 0);
  const commonFee = Number(document.getElementById(`m-common-${roomNumber}`)?.value || 0);
  const parkingFee = Number(document.getElementById(`m-parking-${roomNumber}`)?.value || 0);
  const licensePlate = document.getElementById(`m-plate-${roomNumber}`)?.value.trim() || '';
  const otherFee = Number(document.getElementById(`m-other-${roomNumber}`)?.value || 0);
  const otherFeeRemark = document.getElementById(`m-remark-${roomNumber}`)?.value.trim() || '';

  const billPayload = {
    roomNumber: room.number, month, rent,
    prevElectricMeter: room.lastElectricMeter || 0, currElectricMeter: currElec,
    prevWaterMeter: room.lastWaterMeter || 0, currWaterMeter: currWater,
    commonFee, parkingFee, licensePlate, otherFee, otherFeeRemark,
    electricRate: state.settings.electricRate || 8, waterRate: state.settings.waterRate || 18
  };

  try {
    showLoading(true);
    if (CONFIG.getScriptUrl()) {
      const res = await apiCall('saveBill', { data: billPayload });
      if (!res.success) throw new Error(res.error);
    }
    
    room.lastElectricMeter = currElec;
    room.lastWaterMeter = currWater;
    
    alert(`สร้างบิลห้อง ${roomNumber} เรียบร้อยแล้ว!`);
    await loadAllDataFromSheet();
    renderBills();
    renderMeter();
    loadDashboard();
    switchTab('bills');
  } catch (err) {
    alert(`เกิดข้อผิดพลาด: ${err.message}`);
  } finally {
    showLoading(false);
  }
}

function openMeterModal() {
  switchTab('meter');
}

// ----------------------------------------------------
// 4. BILLS & INVOICES & LINE SENDING
// ----------------------------------------------------
function renderBills() {
  const tbody = document.getElementById('billsTableBody');
  const cardContainer = document.getElementById('billsCardContainer');
  if (!tbody || !cardContainer) return;

  const search = (document.getElementById('billSearchInput')?.value || '').toLowerCase();
  const filter = document.getElementById('billStatusFilter')?.value || 'all';

  const filtered = state.bills.filter(bill => {
    const matchSearch = String(bill.roomNumber).toLowerCase().includes(search) ||
      (bill.month && bill.month.toLowerCase().includes(search)) ||
      (bill.licensePlate && bill.licensePlate.toLowerCase().includes(search));
    const matchStatus = filter === 'all' || bill.status === filter;
    return matchSearch && matchStatus;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="12" class="text-center py-8 text-slate-400">ยังไม่มีข้อมูลบิลในระบบ</td></tr>`;
    cardContainer.innerHTML = `<div class="col-span-full text-center py-12 text-slate-400 bg-white rounded-2xl border border-slate-200">ยังไม่มีข้อมูลบิลในระบบ</div>`;
    return;
  }

  // Table View
  tbody.innerHTML = filtered.map(bill => {
    const isPaid = bill.status === 'paid';
    const statusBadge = isPaid
      ? `<span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 flex items-center gap-1 w-fit"><i data-lucide="check-circle-2" class="w-3.5 h-3.5"></i> ชำระแล้ว</span>`
      : `<span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 flex items-center gap-1 w-fit"><i data-lucide="clock" class="w-3.5 h-3.5"></i> รอชำระ</span>`;

    const lineBadge = bill.lineSent
      ? `<span class="text-emerald-600 text-xs font-medium flex items-center gap-1"><i data-lucide="check" class="w-3.5 h-3.5"></i> ส่งแล้ว</span>`
      : `<span class="text-slate-400 text-xs font-medium">ยังไม่ส่ง</span>`;

    const parkingText = bill.parkingFee > 0
      ? `<div><span class="font-semibold text-slate-700">${Number(bill.parkingFee).toLocaleString()} ฿</span>${bill.licensePlate ? `<span class="text-[10px] text-slate-500 block">(${bill.licensePlate})</span>` : ''}</div>`
      : `<span class="text-slate-400 text-xs">-</span>`;

    const otherText = bill.otherFee > 0
      ? `<div><span class="font-semibold text-slate-700">${Number(bill.otherFee).toLocaleString()} ฿</span>${bill.otherFeeRemark ? `<span class="text-[10px] text-slate-500 block truncate max-w-[100px]" title="${bill.otherFeeRemark}">(${bill.otherFeeRemark})</span>` : ''}</div>`
      : `<span class="text-slate-400 text-xs">-</span>`;

    return `
      <tr class="hover:bg-slate-50 transition">
        <td class="px-4 py-4">
          <p class="font-bold text-slate-800 text-xs">${bill.id}</p>
          <p class="text-[11px] text-slate-400">${bill.month}</p>
        </td>
        <td class="px-4 py-4 font-bold text-blue-600 text-base">ห้อง ${bill.roomNumber}</td>
        <td class="px-4 py-4 font-semibold text-slate-700">${Number(bill.rent).toLocaleString()} ฿</td>
        <td class="px-4 py-4">
          <p class="font-semibold text-slate-800">${Number(bill.electricAmount).toLocaleString()} ฿</p>
          <p class="text-[10px] text-slate-400">(${bill.electricUnits} หน่วย)</p>
        </td>
        <td class="px-4 py-4">
          <p class="font-semibold text-slate-800">${Number(bill.waterAmount).toLocaleString()} ฿</p>
          <p class="text-[10px] text-slate-400">(${bill.waterUnits} หน่วย)</p>
        </td>
        <td class="px-4 py-4 text-xs font-semibold text-slate-700">${Number(bill.commonFee || 0).toLocaleString()} ฿</td>
        <td class="px-4 py-4 text-xs">${parkingText}</td>
        <td class="px-4 py-4 text-xs">${otherText}</td>
        <td class="px-4 py-4 font-bold text-blue-700 text-base">${Number(bill.totalAmount).toLocaleString()} ฿</td>
        <td class="px-4 py-4">
          ${statusBadge}
          <button onclick="toggleBillStatus('${bill.id}', '${isPaid ? 'pending' : 'paid'}')" class="text-[10px] text-blue-600 underline mt-1 block">
            ${isPaid ? 'เปลี่ยนเป็นรอชำระ' : 'กดเมื่อชำระแล้ว'}
          </button>
        </td>
        <td class="px-4 py-4">${lineBadge}</td>
        <td class="px-4 py-4 text-center">
          <div class="flex items-center justify-center gap-1.5">
            <button onclick="sendLineBill('${bill.id}')" class="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg transition" title="ส่งบิลเข้า LINE">
              <i data-lucide="send" class="w-4 h-4"></i>
            </button>
            <button onclick="openPrintBill('${bill.id}')" class="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition" title="พิมพ์ใบแจ้งหนี้ / PDF">
              <i data-lucide="printer" class="w-4 h-4"></i>
            </button>
            <button onclick="openOnlineBill('${bill.id}')" class="p-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg transition" title="เปิดหน้า QR จ่ายเงินผู้เช่า">
              <i data-lucide="qr-code" class="w-4 h-4"></i>
            </button>
            <button onclick="deleteBill('${bill.id}')" class="p-1.5 hover:bg-rose-50 text-rose-500 rounded-lg transition" title="ลบบิล">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  // Card View
  cardContainer.innerHTML = filtered.map(bill => {
    const isPaid = bill.status === 'paid';
    const borderClass = isPaid ? 'border-emerald-200' : 'border-slate-200';
    const statusBadge = isPaid
      ? `<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1"><i data-lucide="check-circle" class="w-3 h-3"></i> ชำระแล้ว</span>`
      : `<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 flex items-center gap-1"><i data-lucide="clock" class="w-3 h-3"></i> รอชำระ</span>`;

    return `
      <div class="bg-white rounded-2xl border ${borderClass} shadow-sm hover:shadow-md transition p-5 space-y-4 flex flex-col justify-between">
        <div>
          <div class="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <span class="text-xs font-semibold text-slate-400">${bill.id}</span>
              <h3 class="text-xl font-bold text-slate-800">ห้อง ${bill.roomNumber}</h3>
              <p class="text-xs text-blue-600 font-medium">${bill.month}</p>
            </div>
            <div>${statusBadge}</div>
          </div>

          <div class="my-3 p-3 rounded-xl bg-slate-50 flex items-center justify-between">
            <span class="text-xs text-slate-500">ยอดชำระสุทธิ:</span>
            <span class="text-xl font-extrabold ${isPaid ? 'text-emerald-600' : 'text-blue-600'}">
              ${Number(bill.totalAmount).toLocaleString()} บาท
            </span>
          </div>

          <div class="space-y-1.5 text-xs text-slate-600 border-t border-slate-100 pt-3">
            <div class="flex justify-between">
              <span>ค่าเช่าห้อง:</span>
              <span class="font-semibold text-slate-800">${Number(bill.rent).toLocaleString()} ฿</span>
            </div>
            <div class="flex justify-between">
              <span>ค่าไฟ (${bill.electricUnits} หน่วย @ ${bill.electricRate}฿):</span>
              <span class="font-semibold text-slate-800">${Number(bill.electricAmount).toLocaleString()} ฿</span>
            </div>
            <div class="flex justify-between">
              <span>ค่าน้ำ (${bill.waterUnits} หน่วย @ ${bill.waterRate}฿):</span>
              <span class="font-semibold text-slate-800">${Number(bill.waterAmount).toLocaleString()} ฿</span>
            </div>
            <div class="flex justify-between">
              <span>ค่าส่วนกลาง:</span>
              <span class="font-semibold text-slate-800">${Number(bill.commonFee || 0).toLocaleString()} ฿</span>
            </div>
            ${bill.parkingFee > 0 ? `
              <div class="flex justify-between text-indigo-700">
                <span>ค่าที่จอดรถ ${bill.licensePlate ? `(${bill.licensePlate})` : ''}:</span>
                <span class="font-semibold">${Number(bill.parkingFee).toLocaleString()} ฿</span>
              </div>
            ` : ''}
            ${bill.otherFee > 0 ? `
              <div class="flex justify-between text-amber-700">
                <span>อื่นๆ (${bill.otherFeeRemark || 'เพิ่มเติม'}):</span>
                <span class="font-semibold">${Number(bill.otherFee).toLocaleString()} ฿</span>
              </div>
            ` : ''}
          </div>
        </div>

        <div class="border-t border-slate-100 pt-3 space-y-2">
          <div class="flex items-center justify-between text-xs">
            <span class="${bill.lineSent ? 'text-emerald-600 font-semibold' : 'text-slate-400'} flex items-center gap-1">
              <i data-lucide="${bill.lineSent ? 'check-check' : 'message-square'}" class="w-3.5 h-3.5"></i>
              ${bill.lineSent ? 'ส่ง LINE แล้ว' : 'ยังไม่ส่ง LINE'}
            </span>
            <button onclick="toggleBillStatus('${bill.id}', '${isPaid ? 'pending' : 'paid'}')" class="text-[11px] text-blue-600 underline font-medium">
              ${isPaid ? 'เปลี่ยนเป็นรอชำระ' : 'กดเมื่อชำระแล้ว'}
            </button>
          </div>

          <div class="grid grid-cols-4 gap-1.5 pt-1">
            <button onclick="sendLineBill('${bill.id}')" class="py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1" title="ส่งบิลเข้า LINE">
              <i data-lucide="send" class="w-3.5 h-3.5"></i> LINE
            </button>
            <button onclick="openPrintBill('${bill.id}')" class="py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1" title="พิมพ์">
              <i data-lucide="printer" class="w-3.5 h-3.5"></i> พิมพ์
            </button>
            <button onclick="openOnlineBill('${bill.id}')" class="py-2 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1" title="ดู QR">
              <i data-lucide="qr-code" class="w-3.5 h-3.5"></i> QR
            </button>
            <button onclick="deleteBill('${bill.id}')" class="py-2 hover:bg-rose-50 text-rose-600 rounded-lg text-xs font-semibold transition flex items-center justify-center" title="ลบ">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  lucide.createIcons();
}

async function sendLineBill(billId) {
  if (!confirm('ยืนยันส่งบิลนี้ไปยัง LINE ของผู้เช่า?')) return;
  try {
    showLoading(true);
    const res = await apiCall('sendLineBill', { billId });
    if (res.success) {
      alert(res.message);
      const b = state.bills.find(x => x.id === billId);
      if (b) b.lineSent = true;
      renderBills();
    } else {
      alert(`ไม่สามารถส่งได้: ${res.error}`);
    }
  } catch (err) {
    alert(`ข้อผิดพลาด: ${err.message}`);
  } finally {
    showLoading(false);
  }
}

async function batchSendLineBills() {
  if (!confirm('ยืนยันส่งบิล LINE ให้ทุกห้องที่ยังค้างชำระและมี LINE User ID?')) return;
  try {
    showLoading(true);
    const res = await apiCall('batchSendLine');
    if (res.success) {
      alert(res.message);
      await loadAllDataFromSheet();
      renderBills();
    } else {
      alert(`ไม่สามารถส่งได้: ${res.error}`);
    }
  } catch (err) {
    alert(`ข้อผิดพลาด: ${err.message}`);
  } finally {
    showLoading(false);
  }
}

async function toggleBillStatus(billId, newStatus) {
  try {
    showLoading(true);
    if (CONFIG.getScriptUrl()) {
      const res = await apiCall('updateBillStatus', { id: billId, status: newStatus });
      if (!res.success) throw new Error(res.error);
    }
    const b = state.bills.find(x => x.id === billId);
    if (b) b.status = newStatus;
    renderBills();
    loadDashboard();
  } catch (err) {
    alert(err.message);
  } finally {
    showLoading(false);
  }
}

async function deleteBill(billId) {
  if (!confirm('ยืนยันลบบิลนี้ออกจากระบบและ Google Sheets?')) return;
  try {
    showLoading(true);
    if (CONFIG.getScriptUrl()) {
      const res = await apiCall('deleteBill', { id: billId });
      if (!res.success) throw new Error(res.error);
    }
    state.bills = state.bills.filter(b => b.id !== billId);
    renderBills();
    loadDashboard();
  } catch (err) {
    alert(err.message);
  } finally {
    showLoading(false);
  }
}

function openPrintBill(billId) {
  window.open(`./print-bill.html?billId=${billId}`, '_blank');
}

function openOnlineBill(billId) {
  window.open(`./tenant-portal.html?billId=${billId}`, '_blank');
}

// ----------------------------------------------------
// CREATE BILL MODAL
// ----------------------------------------------------
function openCreateBillModal() {
  const roomSelect = document.getElementById('formBillRoomNumber');
  const occupiedRooms = state.rooms.filter(r => r.status === 'occupied');
  
  if (occupiedRooms.length === 0) {
    alert('ยังไม่มีห้องที่มีผู้เช่า กรุณาเพิ่มผู้เช่าในเมนูจัดการห้องพักก่อน');
    return;
  }

  roomSelect.innerHTML = occupiedRooms.map(r => `<option value="${r.number}">ห้อง ${r.number} (${r.tenant?.name || 'ไม่มีชื่อ'})</option>`).join('');
  onBillRoomSelect();
  document.getElementById('billModal').classList.remove('hidden');
}

function closeBillModal() {
  document.getElementById('billModal').classList.add('hidden');
}

function onBillRoomSelect() {
  const roomNumber = document.getElementById('formBillRoomNumber').value;
  const room = state.rooms.find(r => String(r.number) === String(roomNumber));
  if (!room) return;

  document.getElementById('formBillRent').value = room.price || 4000;
  document.getElementById('formBillCommonFee').value = room.commonFee !== undefined ? room.commonFee : (state.settings.commonFeeDefault || 300);
  document.getElementById('formBillParkingFee').value = room.parkingFee || 0;
  document.getElementById('formBillLicensePlate').value = room.licensePlate || '';
  document.getElementById('formBillPrevElec').value = room.lastElectricMeter || 0;
  document.getElementById('formBillCurrElec').value = (room.lastElectricMeter || 0) + 50;
  document.getElementById('formBillPrevWater').value = room.lastWaterMeter || 0;
  document.getElementById('formBillCurrWater').value = (room.lastWaterMeter || 0) + 8;
  document.getElementById('formBillOtherFee').value = room.otherFee || 0;
  document.getElementById('formBillOtherRemark').value = room.otherFeeRemark || '';

  document.getElementById('rateLabelElec').innerText = state.settings.electricRate || 8;
  document.getElementById('rateLabelWater').innerText = state.settings.waterRate || 18;

  toggleBillOtherRemark();
  calculateBillTotal();
}

function calculateBillTotal() {
  const rent = Number(document.getElementById('formBillRent')?.value || 0);
  const commonFee = Number(document.getElementById('formBillCommonFee')?.value || 0);
  const parkingFee = Number(document.getElementById('formBillParkingFee')?.value || 0);
  const otherFee = Number(document.getElementById('formBillOtherFee')?.value || 0);

  const prevElec = Number(document.getElementById('formBillPrevElec')?.value || 0);
  const currElec = Number(document.getElementById('formBillCurrElec')?.value || 0);
  const elecRate = Number(state.settings.electricRate || 8);
  const elecUnits = Math.max(0, currElec - prevElec);
  const electricAmount = Math.round(elecUnits * elecRate);
  const calcElecEl = document.getElementById('calcElecAmount');
  if (calcElecEl) calcElecEl.innerText = `${electricAmount.toLocaleString()} ฿ (${elecUnits} หน่วย)`;

  const prevWater = Number(document.getElementById('formBillPrevWater')?.value || 0);
  const currWater = Number(document.getElementById('formBillCurrWater')?.value || 0);
  const waterRate = Number(state.settings.waterRate || 18);
  const waterUnits = Math.max(0, currWater - prevWater);
  const waterAmount = Math.round(waterUnits * waterRate);
  const calcWaterEl = document.getElementById('calcWaterAmount');
  if (calcWaterEl) calcWaterEl.innerText = `${waterAmount.toLocaleString()} ฿ (${waterUnits} หน่วย)`;

  const grandTotal = rent + commonFee + parkingFee + otherFee + electricAmount + waterAmount;
  const calcGrandTotalEl = document.getElementById('calcGrandTotal');
  if (calcGrandTotalEl) calcGrandTotalEl.innerText = `${grandTotal.toLocaleString()} บาท`;
}

async function saveBillForm(e) {
  e.preventDefault();
  const roomNumber = document.getElementById('formBillRoomNumber').value;
  const month = document.getElementById('formBillMonth').value;
  const rent = Number(document.getElementById('formBillRent').value);
  const commonFee = Number(document.getElementById('formBillCommonFee').value || 0);
  const parkingFee = Number(document.getElementById('formBillParkingFee').value || 0);
  const licensePlate = document.getElementById('formBillLicensePlate').value.trim();
  const prevElec = Number(document.getElementById('formBillPrevElec').value || 0);
  const currElec = Number(document.getElementById('formBillCurrElec').value || 0);
  const prevWater = Number(document.getElementById('formBillPrevWater').value || 0);
  const currWater = Number(document.getElementById('formBillCurrWater').value || 0);
  const otherFee = Number(document.getElementById('formBillOtherFee').value || 0);
  const otherFeeRemark = document.getElementById('formBillOtherRemark').value.trim();
  const dueDate = document.getElementById('formBillDueDate').value;

  const payload = {
    roomNumber, month, rent, commonFee, parkingFee, licensePlate,
    prevElectricMeter: prevElec, currElectricMeter: currElec,
    prevWaterMeter: prevWater, currWaterMeter: currWater,
    otherFee, otherFeeRemark, dueDate
  };

  try {
    showLoading(true);
    if (CONFIG.getScriptUrl()) {
      const res = await apiCall('saveBill', { data: payload });
      if (!res.success) throw new Error(res.error);
    }

    closeBillModal();
    await loadAllDataFromSheet();
    renderBills();
    renderMeter();
    loadDashboard();
    alert('สร้างบิลและบันทึกลง Google Sheets เรียบร้อยแล้ว!');
  } catch (err) {
    alert(err.message);
  } finally {
    showLoading(false);
  }
}

// ----------------------------------------------------
// 5. SETTINGS & GOOGLE SHEETS CONNECTION
// ----------------------------------------------------
function renderSettingsInputs() {
  document.getElementById('sidebarDormName').innerText = state.settings.dormName || 'หอพักสุขสบาย';
  document.getElementById('settingGoogleScriptUrl').value = CONFIG.getScriptUrl();
  document.getElementById('settingDormName').value = state.settings.dormName || '';
  document.getElementById('settingDormPhone').value = state.settings.dormPhone || '';
  document.getElementById('settingDormAddress').value = state.settings.dormAddress || '';
  document.getElementById('settingElectricRate').value = state.settings.electricRate || 8;
  document.getElementById('settingWaterRate').value = state.settings.waterRate || 18;
  document.getElementById('settingCommonFee').value = state.settings.commonFeeDefault || 300;
  document.getElementById('settingPromptpayId').value = state.settings.promptpayId || '';
  document.getElementById('settingPromptpayName').value = state.settings.promptpayName || '';
  document.getElementById('settingLineToken').value = state.settings.lineToken || '';
}

async function testGoogleSheetConnection() {
  const url = document.getElementById('settingGoogleScriptUrl').value.trim();
  if (!url) {
    alert('กรุณากรอก Google Apps Script Web App URL ก่อน');
    return;
  }
  CONFIG.setScriptUrl(url);

  const testMsg = document.getElementById('sheetTestResultMsg');
  testMsg.innerHTML = `<span class="text-blue-600 flex items-center gap-1"><i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> กำลังทดสอบเชื่อมต่อ Google Sheets...</span>`;
  lucide.createIcons();

  try {
    const res = await fetch(`${url}?action=getAll`);
    const result = await res.json();
    if (result.success) {
      state.isConnected = true;
      state.settings = result.data.settings || state.settings;
      state.rooms = result.data.rooms || state.rooms;
      state.bills = result.data.bills || state.bills;
      updateConnectionStatusUI(true);
      renderRooms();
      renderMeter();
      renderBills();
      loadDashboard();
      renderSettingsInputs();
      alert('🎉 เชื่อมต่อกับ Google Sheets สำเร็จเรียบร้อย!');
    } else {
      throw new Error(result.error || 'Server returned failure');
    }
  } catch (err) {
    updateConnectionStatusUI(false, err.message);
    alert(`เชื่อมต่อไม่สำเร็จ: ${err.message}\nโปรดตรวจสอบว่าได้เลือก "Who has access" เป็น "Anyone" หรือยัง`);
  }
}

async function saveSettings(e) {
  e.preventDefault();
  const scriptUrl = document.getElementById('settingGoogleScriptUrl').value.trim();
  CONFIG.setScriptUrl(scriptUrl);

  const payload = {
    dormName: document.getElementById('settingDormName').value.trim(),
    dormPhone: document.getElementById('settingDormPhone').value.trim(),
    dormAddress: document.getElementById('settingDormAddress').value.trim(),
    electricRate: Number(document.getElementById('settingElectricRate').value),
    waterRate: Number(document.getElementById('settingWaterRate').value),
    commonFeeDefault: Number(document.getElementById('settingCommonFee').value),
    promptpayId: document.getElementById('settingPromptpayId').value.trim(),
    promptpayName: document.getElementById('settingPromptpayName').value.trim(),
    lineToken: document.getElementById('settingLineToken').value.trim()
  };

  try {
    showLoading(true);
    if (CONFIG.getScriptUrl()) {
      const res = await apiCall('saveSettings', { data: payload });
      if (!res.success) throw new Error(res.error);
    }
    state.settings = { ...state.settings, ...payload };
    document.getElementById('sidebarDormName').innerText = state.settings.dormName;
    alert('บันทึกการตั้งค่าลง Google Sheets เรียบร้อยแล้ว!');
  } catch (err) {
    alert(`ผิดพลาด: ${err.message}`);
  } finally {
    showLoading(false);
  }
}

