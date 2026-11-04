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

  // Read cached settings from localStorage if available
  let cachedSettings = null;
  try {
    const raw = localStorage.getItem('DORM_SETTINGS');
    if (raw) cachedSettings = JSON.parse(raw);
  } catch (e) {}

  if (!scriptUrl) {
    state.settings = cachedSettings || fallbackData.settings;
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
      // Merge: fallback -> cached -> sheet data
      state.settings = {
        ...fallbackData.settings,
        ...(cachedSettings || {}),
        ...(result.data.settings || {})
      };

      // Auto-normalize PromptPay ID leading 0 if dropped by Google Sheets
      if (state.settings.promptpayId && /^\d{9}$/.test(String(state.settings.promptpayId))) {
        state.settings.promptpayId = '0' + String(state.settings.promptpayId);
      }

      // Cache settings into localStorage
      try {
        localStorage.setItem('DORM_SETTINGS', JSON.stringify(state.settings));
      } catch (e) {}

      state.rooms = result.data.rooms || [];
      state.bills = result.data.bills || [];

      // ซิงค์ MAX_ROOM_LIMIT จาก Google Apps Script (Backend) อัตโนมัติ
      if (result.data.maxRoomLimit !== undefined && result.data.maxRoomLimit !== null) {
        CONFIG.MAX_ROOM_LIMIT = Number(result.data.maxRoomLimit);
        try {
          localStorage.setItem('DORM_MAX_ROOM_LIMIT', CONFIG.MAX_ROOM_LIMIT);
        } catch (e) {}
      }

      state.isConnected = true;
      updateConnectionStatusUI(true);
    } else {
      throw new Error(result.error || 'โหลดข้อมูลไม่สำเร็จ');
    }
  } catch (err) {
    console.warn('Cannot fetch from Google Sheet, using fallback/cached data:', err);
    state.settings = cachedSettings || fallbackData.settings;
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
  const mobileBadge = document.getElementById('mobileSheetStatusBadge');
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

  if (mobileBadge) {
    if (connected) {
      mobileBadge.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> Sheets`;
      mobileBadge.className = 'flex items-center gap-1.5 text-[11px] font-medium text-emerald-400 bg-slate-800 px-2.5 py-1 rounded-full border border-slate-700/60';
    } else {
      mobileBadge.innerHTML = `<span class="w-2 h-2 rounded-full bg-amber-400"></span> ไม่ได้เชื่อม`;
      mobileBadge.className = 'flex items-center gap-1.5 text-[11px] font-medium text-amber-400 bg-slate-800 px-2.5 py-1 rounded-full border border-slate-700/60';
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
  populateMonthDropdowns();
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
    dueDateInput.value = ''; // ปล่อยว่างไว้เป็นค่าเริ่มต้น (ไม่บังคับ)
  }
}

// ----------------------------------------------------
// TAB SWITCHING (Desktop Sidebar & Mobile Bottom Navigation)
// ----------------------------------------------------
function switchTab(tabId) {
  state.currentTab = tabId;
  const tabs = ['dashboard', 'rooms', 'meter', 'bills', 'settings'];
  tabs.forEach(t => {
    const el = document.getElementById(`tab-${t}`);
    const navBtn = document.getElementById(`nav-${t}`);
    const bNavBtn = document.getElementById(`bottom-nav-${t}`);
    if (el) el.classList.add('hidden');
    if (navBtn) {
      navBtn.classList.remove('bg-blue-600', 'text-white');
      navBtn.classList.add('text-slate-300', 'hover:bg-slate-800');
    }
    if (bNavBtn) {
      bNavBtn.classList.remove('text-blue-600', 'font-bold', 'bg-blue-50');
      bNavBtn.classList.add('text-slate-500', 'font-medium');
    }
  });

  const activeEl = document.getElementById(`tab-${tabId}`);
  const activeNav = document.getElementById(`nav-${tabId}`);
  const activeBNav = document.getElementById(`bottom-nav-${tabId}`);
  if (activeEl) activeEl.classList.remove('hidden');
  if (activeNav) {
    activeNav.classList.add('bg-blue-600', 'text-white');
    activeNav.classList.remove('text-slate-300', 'hover:bg-slate-800');
  }
  if (activeBNav) {
    activeBNav.classList.add('text-blue-600', 'font-bold', 'bg-blue-50');
    activeBNav.classList.remove('text-slate-500', 'font-medium');
  }

  // Smooth scroll to top on mobile tab change
  window.scrollTo({ top: 0, behavior: 'smooth' });

  const titles = {
    dashboard: ['ภาพรวมหอพัก', 'สถิติห้องพัก ยอดค้างชำระ และข้อมูลล่าสุดจาก Google Sheets'],
    rooms: ['จัดการห้องพัก & ข้อมูลผู้เช่า', 'เพิ่ม แก้ไข ข้อมูลห้องพัก ค่าส่วนกลาง ค่าที่จอดรถ และ LINE User ID'],
    meter: ['จดมิเตอร์น้ำ - ไฟ & คำนวณบิล', 'ดึงเลขมิเตอร์เดิมอัตโนมัติ กรอกเลขใหม่ และกดสร้างบิลได้ในคลิกเดียว'],
    bills: ['ออกบิล & ส่งการแจ้งเตือน LINE', 'รายการใบแจ้งหนี้ ตรวจสอบการชำระเงิน และส่ง Flex Message เข้า LINE ผู้เช่า'],
    settings: ['ตั้งค่าหอพัก & ระบบ Google Sheets / LINE Bot', 'กำหนด Google Apps Script Web App URL และเชื่อมต่อ LINE Messaging API']
  };

  if (document.getElementById('pageTitle') && titles[tabId]) {
    document.getElementById('pageTitle').innerText = titles[tabId][0];
    document.getElementById('pageSubtitle').innerText = titles[tabId][1];
  }

  if (tabId === 'dashboard') {
    populateMonthDropdowns();
    loadDashboard();
  }
  if (tabId === 'rooms') renderRooms();
  if (tabId === 'meter') renderMeter();
  if (tabId === 'bills') {
    populateMonthDropdowns();
    renderBills();
  }
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
// 1. DASHBOARD & MONTH FILTERS
// ----------------------------------------------------
function getDistinctBillMonths() {
  const monthsSet = new Set();
  (state.bills || []).forEach(bill => {
    if (bill.month) {
      const formatted = typeof formatMonthName === 'function' ? formatMonthName(bill.month) : String(bill.month).trim();
      if (formatted && formatted !== '-') monthsSet.add(formatted);
    }
  });

  const now = new Date();
  const currentThaiMonth = now.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
  monthsSet.add(currentThaiMonth);

  return Array.from(monthsSet);
}

function populateMonthDropdowns() {
  const months = getDistinctBillMonths();

  // 1. Dashboard month selector
  const dashSelect = document.getElementById('dashboardMonthFilter');
  if (dashSelect) {
    const currentVal = dashSelect.value;
    const optionsHtml = `<option value="all">ทุกรอบเดือน (ยอดสะสมทั้งหมด)</option>` +
      months.map(m => `<option value="${m}">${m}</option>`).join('');
    dashSelect.innerHTML = optionsHtml;
    if (currentVal && (currentVal === 'all' || months.includes(currentVal))) {
      dashSelect.value = currentVal;
    } else {
      dashSelect.value = 'all';
    }
  }

  // 2. Bills tab month selector
  const billSelect = document.getElementById('billMonthFilter');
  if (billSelect) {
    const currentVal = billSelect.value;
    const optionsHtml = `<option value="all">ทุกรอบเดือน (ทั้งหมด)</option>` +
      months.map(m => `<option value="${m}">${m}</option>`).join('');
    billSelect.innerHTML = optionsHtml;
    if (currentVal && (currentVal === 'all' || months.includes(currentVal))) {
      billSelect.value = currentVal;
    } else {
      billSelect.value = 'all';
    }
  }
}

function loadDashboard() {
  const rooms = state.rooms;
  const bills = state.bills;

  const totalRooms = rooms.length;
  const occupiedRooms = rooms.filter(r => r.status === 'occupied').length;
  const vacantRooms = rooms.filter(r => r.status === 'vacant').length;
  const occupancyRate = totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : 0;

  // Selected month filter on Dashboard
  const monthFilter = document.getElementById('dashboardMonthFilter')?.value || 'all';

  const targetBills = (monthFilter === 'all')
    ? bills
    : bills.filter(b => {
        const fm = typeof formatMonthName === 'function' ? formatMonthName(b.month) : String(b.month || '');
        return fm === monthFilter || String(b.month).trim() === monthFilter;
      });

  let totalBilledAmount = 0;
  let totalBilledCount = 0;
  let totalPaidAmount = 0;
  let paidCount = 0;
  let totalPendingAmount = 0;
  let pendingCount = 0;

  targetBills.forEach(bill => {
    const amt = Number(bill.totalAmount || 0);
    totalBilledAmount += amt;
    totalBilledCount++;
    if (bill.status === 'paid') {
      totalPaidAmount += amt;
      paidCount++;
    } else {
      totalPendingAmount += amt;
      pendingCount++;
    }
  });

  const collectionRate = totalBilledAmount > 0 ? Math.round((totalPaidAmount / totalBilledAmount) * 100) : 0;

  // Room Stats
  const maxLimit = (typeof CONFIG !== 'undefined' && CONFIG.MAX_ROOM_LIMIT) ? Number(CONFIG.MAX_ROOM_LIMIT) : 0;
  if (maxLimit > 0) {
    document.getElementById('statTotalRooms').innerText = `${totalRooms}/${maxLimit} ห้อง`;
  } else {
    document.getElementById('statTotalRooms').innerText = `${totalRooms} ห้อง`;
  }
  document.getElementById('statOccupancyRate').innerText = `มีผู้เช่า ${occupancyRate}%`;
  document.getElementById('statOccupiedRooms').innerText = `${occupiedRooms} ห้อง`;
  const elVacant = document.getElementById('statVacantRooms');
  if (elVacant) elVacant.innerText = `${vacantRooms}`;

  // Financial Stats
  const elBilled = document.getElementById('statTotalBilledAmount');
  if (elBilled) elBilled.innerText = `${totalBilledAmount.toLocaleString()} ฿`;
  const elBilledCount = document.getElementById('statTotalBilledCount');
  if (elBilledCount) elBilledCount.innerText = `${totalBilledCount} บิลที่ออก`;

  const elPaid = document.getElementById('statPaidAmount');
  if (elPaid) elPaid.innerText = `${totalPaidAmount.toLocaleString()} ฿`;
  const elPaidCount = document.getElementById('statPaidCount');
  if (elPaidCount) elPaidCount.innerText = `${paidCount} บิลชำระแล้ว`;

  const elPending = document.getElementById('statPendingAmount');
  if (elPending) elPending.innerText = `${totalPendingAmount.toLocaleString()} ฿`;
  const elPendingCount = document.getElementById('statPendingCount');
  if (elPendingCount) elPendingCount.innerText = `${pendingCount} บิลค้างชำระ`;

  const elMonthLabel = document.getElementById('statMonthLabel');
  if (elMonthLabel) {
    elMonthLabel.innerText = monthFilter === 'all' ? 'ทุกรอบเดือน (ยอดสะสมทั้งหมด)' : `รอบบิล: ${monthFilter}`;
  }

  const elCollectionRate = document.getElementById('statCollectionRate');
  if (elCollectionRate) {
    elCollectionRate.innerText = `ชำระแล้ว ${collectionRate}%`;
  }

  renderQuickRoomGrid();
  lucide.createIcons();
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
function updateRoomQuotaUI() {
  const quotaWrap = document.getElementById('roomQuotaBadgeContainer');
  const quotaText = document.getElementById('roomQuotaBadgeText');
  const btnAddRoom = document.getElementById('btnAddRoom');
  const maxLimit = (typeof CONFIG !== 'undefined' && CONFIG.MAX_ROOM_LIMIT) ? Number(CONFIG.MAX_ROOM_LIMIT) : 0;

  if (!quotaWrap || !quotaText) return;

  if (maxLimit > 0) {
    quotaWrap.classList.remove('hidden');
    quotaWrap.classList.add('flex');
    const isFull = state.rooms.length >= maxLimit;
    if (isFull) {
      quotaWrap.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold bg-amber-50 text-amber-800 border-amber-300 shadow-sm';
      quotaText.innerText = `โควต้า: ${state.rooms.length}/${maxLimit} ห้อง (เต็มโควต้า)`;
      if (btnAddRoom) {
        btnAddRoom.className = 'flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-lg text-sm font-semibold transition shadow-sm border border-slate-300 cursor-not-allowed';
        btnAddRoom.title = `โควต้าห้องพักเต็มแล้ว (${maxLimit}/${maxLimit} ห้อง)`;
      }
    } else {
      quotaWrap.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold bg-blue-50 text-blue-700 border-blue-200 shadow-sm';
      quotaText.innerText = `โควต้าห้อง: ${state.rooms.length}/${maxLimit} ห้อง`;
      if (btnAddRoom) {
        btnAddRoom.className = 'flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition shadow-sm';
        btnAddRoom.title = 'เพิ่มห้องพักใหม่';
      }
    }
  } else {
    quotaWrap.classList.add('hidden');
    quotaWrap.classList.remove('flex');
    if (btnAddRoom) {
      btnAddRoom.className = 'flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition shadow-sm';
      btnAddRoom.title = 'เพิ่มห้องพักใหม่';
    }
  }
}

function renderRooms() {
  updateRoomQuotaUI();
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
  const maxLimit = (typeof CONFIG !== 'undefined' && CONFIG.MAX_ROOM_LIMIT) ? Number(CONFIG.MAX_ROOM_LIMIT) : 0;
  if (maxLimit > 0 && state.rooms.length >= maxLimit) {
    alert(`⚠️ ไม่สามารถเพิ่มห้องพักได้\n\nระบบจำกัดจำนวนห้องพักไว้สูงสุดที่ ${maxLimit} ห้อง (ปัจจุบันมี ${state.rooms.length} ห้อง)\nตามโควต้าแพ็กเกจการใช้งาน\n\nหากต้องการเพิ่มจำนวนห้องพัก กรุณาติดต่อผู้ให้บริการเพื่ออัปเกรดแพ็กเกจ`);
    return;
  }

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

function toggleRoomOtherRemark() {
  const val = Number(document.getElementById('formRoomOtherFee')?.value || 0);
  const grp = document.getElementById('roomOtherRemarkGroup');
  if (grp) {
    if (val > 0) grp.classList.remove('hidden');
    else grp.classList.add('hidden');
  }
}

function toggleCardMeterOtherRemark(roomNumber) {
  const val = Number(document.getElementById(`card-m-other-${roomNumber}`)?.value || 0);
  const grp = document.getElementById(`card-m-remark-group-${roomNumber}`);
  if (grp) {
    if (val > 0) grp.classList.remove('hidden');
    else grp.classList.add('hidden');
  }
}

// ----------------------------------------------------
// DYNAMIC OTHER FEE REMARK POPUP MODAL & HANDLERS
// ----------------------------------------------------
let currentOtherFeeModalRoom = null;

function openOtherFeeModal(roomNumber) {
  const room = state.rooms.find(r => String(r.number) === String(roomNumber));
  if (!room) return;
  currentOtherFeeModalRoom = roomNumber;

  const tableInput = document.getElementById(`m-other-${roomNumber}`);
  const cardInput = document.getElementById(`card-m-other-${roomNumber}`);
  const currentAmount = tableInput ? tableInput.value : (cardInput ? cardInput.value : (room.otherFee || 0));

  const tableRemark = document.getElementById(`m-remark-${roomNumber}`);
  const cardRemark = document.getElementById(`card-m-remark-${roomNumber}`);
  const currentRemark = tableRemark ? tableRemark.value : (cardRemark ? cardRemark.value : (room.otherFeeRemark || ''));

  const titleEl = document.getElementById('otherFeeModalRoomTitle');
  if (titleEl) titleEl.innerText = `ห้อง ${roomNumber} (${room.tenant?.name || 'ไม่มีชื่อผู้เช่า'})`;

  const amountEl = document.getElementById('otherFeeModalAmount');
  if (amountEl) amountEl.innerText = `${Number(currentAmount || 0).toLocaleString()} บาท`;

  const modalInput = document.getElementById('otherFeeModalInput');
  if (modalInput) {
    modalInput.value = currentRemark || '';
    modalInput.onkeydown = function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveOtherFeeModalRemark();
      }
    };
  }

  const modal = document.getElementById('otherFeeModal');
  if (modal) {
    modal.classList.remove('hidden');
    setTimeout(() => {
      if (modalInput) {
        modalInput.focus();
        modalInput.select();
      }
    }, 100);
  }
  lucide.createIcons();
}

function closeOtherFeeModal() {
  const modal = document.getElementById('otherFeeModal');
  if (modal) modal.classList.add('hidden');
  currentOtherFeeModalRoom = null;
}

function setQuickOtherFeeRemark(text) {
  const input = document.getElementById('otherFeeModalInput');
  if (input) {
    input.value = text;
    input.focus();
  }
}

function saveOtherFeeModalRemark() {
  if (!currentOtherFeeModalRoom) {
    closeOtherFeeModal();
    return;
  }
  const roomNumber = currentOtherFeeModalRoom;
  const val = document.getElementById('otherFeeModalInput')?.value.trim() || '';

  // Update in Table View
  const tableHidden = document.getElementById(`m-remark-${roomNumber}`);
  if (tableHidden) tableHidden.value = val;
  const badgeText = document.getElementById(`m-remark-text-${roomNumber}`);
  const badgeBtn = document.getElementById(`m-remark-badge-${roomNumber}`);
  if (badgeText) badgeText.innerText = val || '+ ระบุสาเหตุ';
  if (badgeBtn) {
    if (val) {
      badgeBtn.className = 'text-[10px] flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 font-medium';
    } else {
      badgeBtn.className = 'text-[10px] flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-dashed border-amber-300 font-bold animate-pulse';
    }
  }

  // Update in Card View
  const cardInput = document.getElementById(`card-m-remark-${roomNumber}`);
  if (cardInput) cardInput.value = val;

  // Update in local state room
  const room = state.rooms.find(r => String(r.number) === String(roomNumber));
  if (room) room.otherFeeRemark = val;

  closeOtherFeeModal();
  setTimeout(() => lucide.createIcons(), 50);
}

function handleOtherFeeInput(roomNumber) {
  const input = document.getElementById(`m-other-${roomNumber}`);
  const val = Number(input?.value || 0);
  const badgeWrap = document.getElementById(`m-remark-badge-wrap-${roomNumber}`);
  if (badgeWrap) {
    if (val > 0) badgeWrap.classList.remove('hidden');
    else badgeWrap.classList.add('hidden');
  }
  updateMeterRowCalc(roomNumber);
}

function handleOtherFeeChange(roomNumber) {
  const input = document.getElementById(`m-other-${roomNumber}`);
  const val = Number(input?.value || 0);
  const currentRemark = document.getElementById(`m-remark-${roomNumber}`)?.value.trim() || '';
  if (val > 0 && !currentRemark) {
    openOtherFeeModal(roomNumber);
  }
}

function handleCardOtherFeeChange(roomNumber) {
  const input = document.getElementById(`card-m-other-${roomNumber}`);
  const val = Number(input?.value || 0);
  const currentRemark = document.getElementById(`card-m-remark-${roomNumber}`)?.value.trim() || '';
  if (val > 0 && !currentRemark) {
    openOtherFeeModal(roomNumber);
  }
}

function toggleBillOtherRemark() {
  const val = Number(document.getElementById('formBillOtherFee')?.value || 0);
  const grp = document.getElementById('billOtherRemarkGroup');
  if (grp) {
    if (val > 0) grp.classList.remove('hidden');
    else grp.classList.add('hidden');
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

  // ตรวจสอบการจำกัดจำนวนห้องพัก (กรณีเพิ่มห้องใหม่)
  const isExistingRoom = state.editingRoomId || state.rooms.some(r => String(r.number) === String(number));
  const maxLimit = (typeof CONFIG !== 'undefined' && CONFIG.MAX_ROOM_LIMIT) ? Number(CONFIG.MAX_ROOM_LIMIT) : 0;
  if (!isExistingRoom && maxLimit > 0 && state.rooms.length >= maxLimit) {
    alert(`⚠️ ไม่สามารถบันทึกเพิ่มห้องพักได้\n\nเนื่องจากระบบจำกัดจำนวนห้องพักไว้สูงสุดที่ ${maxLimit} ห้อง (ปัจจุบันมี ${state.rooms.length} ห้อง)\nหากต้องการเพิ่มห้องพัก กรุณาติดต่อผู้ให้บริการเพื่ออัปเกรดแพ็กเกจ`);
    return;
  }

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

// State for per-room meter card modes
const cardModes = {}; // { '101': { elec: 'meter', water: 'meter' } }
let modalElecMode = 'meter';
let modalWaterMode = 'meter';

function getRoomLatestMeters(roomNumber) {
  const room = state.rooms.find(r => String(r.number) === String(roomNumber));
  if (!room) return { elec: 0, water: 0 };

  // Filter bills for this room and sort by createdAt descending (newest first)
  const roomBills = (state.bills || [])
    .filter(b => String(b.roomNumber) === String(roomNumber))
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  if (roomBills.length > 0) {
    const latestBill = roomBills[0];
    return {
      elec: Number(latestBill.currElectricMeter !== undefined ? latestBill.currElectricMeter : room.lastElectricMeter) || 0,
      water: Number(latestBill.currWaterMeter !== undefined ? latestBill.currWaterMeter : room.lastWaterMeter) || 0
    };
  }

  return {
    elec: Number(room.lastElectricMeter) || 0,
    water: Number(room.lastWaterMeter) || 0
  };
}

function setCardElecMode(roomNumber, mode) {
  if (!cardModes[roomNumber]) cardModes[roomNumber] = { elec: 'meter', water: 'meter' };
  cardModes[roomNumber].elec = mode;

  const btnMeter = document.getElementById(`card-btn-elec-meter-${roomNumber}`);
  const btnManual = document.getElementById(`card-btn-elec-manual-${roomNumber}`);
  const meterGrp = document.getElementById(`card-m-elec-meter-grp-${roomNumber}`);
  const manualGrp = document.getElementById(`card-m-elec-manual-grp-${roomNumber}`);

  if (mode === 'meter') {
    if (btnMeter) btnMeter.className = 'px-1.5 py-0.5 rounded font-semibold bg-white text-amber-900 shadow-xs';
    if (btnManual) btnManual.className = 'px-1.5 py-0.5 rounded font-semibold text-amber-800';
    if (meterGrp) meterGrp.classList.remove('hidden');
    if (manualGrp) manualGrp.classList.add('hidden');
  } else {
    if (btnMeter) btnMeter.className = 'px-1.5 py-0.5 rounded font-semibold text-amber-800';
    if (btnManual) btnManual.className = 'px-1.5 py-0.5 rounded font-semibold bg-white text-amber-900 shadow-xs';
    if (meterGrp) meterGrp.classList.add('hidden');
    if (manualGrp) manualGrp.classList.remove('hidden');
  }
  updateMeterCardCalc(roomNumber);
}

function setCardWaterMode(roomNumber, mode) {
  if (!cardModes[roomNumber]) cardModes[roomNumber] = { elec: 'meter', water: 'meter' };
  cardModes[roomNumber].water = mode;

  const btnMeter = document.getElementById(`card-btn-water-meter-${roomNumber}`);
  const btnManual = document.getElementById(`card-btn-water-manual-${roomNumber}`);
  const meterGrp = document.getElementById(`card-m-water-meter-grp-${roomNumber}`);
  const manualGrp = document.getElementById(`card-m-water-manual-grp-${roomNumber}`);

  if (mode === 'meter') {
    if (btnMeter) btnMeter.className = 'px-1.5 py-0.5 rounded font-semibold bg-white text-cyan-900 shadow-xs';
    if (btnManual) btnManual.className = 'px-1.5 py-0.5 rounded font-semibold text-cyan-800';
    if (meterGrp) meterGrp.classList.remove('hidden');
    if (manualGrp) manualGrp.classList.add('hidden');
  } else {
    if (btnMeter) btnMeter.className = 'px-1.5 py-0.5 rounded font-semibold text-cyan-800';
    if (btnManual) btnManual.className = 'px-1.5 py-0.5 rounded font-semibold bg-white text-cyan-900 shadow-xs';
    if (meterGrp) meterGrp.classList.add('hidden');
    if (manualGrp) manualGrp.classList.remove('hidden');
  }
  updateMeterCardCalc(roomNumber);
}

function syncGlobalDueDateToCards() {
  const globalDue = document.getElementById('meterGlobalDueDate')?.value || '';
  state.rooms.forEach(r => {
    const cardEl = document.getElementById(`card-m-duedate-${r.number}`);
    if (cardEl) cardEl.value = globalDue;
    const tableEl = document.getElementById(`m-duedate-${r.number}`);
    if (tableEl) tableEl.value = globalDue;
  });
}

function clearGlobalDueDate() {
  const globalEl = document.getElementById('meterGlobalDueDate');
  if (globalEl) globalEl.value = '';
  syncGlobalDueDateToCards();
}

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

  const globalDueDateVal = document.getElementById('meterGlobalDueDate')?.value || '';

  // Card View (ตรงตามรูปที่ 3)
  cardContainer.innerHTML = occupiedRooms.map(room => {
    const latestMeters = getRoomLatestMeters(room.number);
    const prevElec = latestMeters.elec;
    const prevWater = latestMeters.water;
    const rentVal = room.price !== undefined && room.price !== null ? room.price : '';
    const commonVal = (room.commonFee !== undefined && room.commonFee !== null && room.commonFee !== '') ? room.commonFee : (state.settings.commonFeeDefault || 300);
    const parkingVal = (room.parkingFee && room.parkingFee > 0) ? room.parkingFee : '';
    const plateVal = room.licensePlate || '';
    const otherVal = (room.otherFee && room.otherFee > 0) ? room.otherFee : '';
    const remarkVal = room.otherFeeRemark || '';

    const defaultElecRate = state.settings.electricRate || 8;
    const defaultWaterRate = state.settings.waterRate || 18;

    if (!cardModes[room.number]) {
      cardModes[room.number] = { elec: 'meter', water: 'meter' };
    }
    const currentElecMode = cardModes[room.number].elec;
    const currentWaterMode = cardModes[room.number].water;

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
          <!-- Electricity Box -->
          <div class="p-3 bg-amber-50/60 border border-amber-200/60 rounded-xl space-y-2">
            <div class="flex items-center justify-between text-xs font-bold text-amber-800">
              <span class="flex items-center gap-1"><i data-lucide="zap" class="w-3.5 h-3.5 text-amber-600"></i> ไฟฟ้า</span>
              <div class="flex bg-amber-200/70 p-0.5 rounded text-[10px]">
                <button type="button" onclick="setCardElecMode('${room.number}', 'meter')" id="card-btn-elec-meter-${room.number}" class="px-1.5 py-0.5 rounded font-semibold ${currentElecMode === 'meter' ? 'bg-white text-amber-900 shadow-xs' : 'text-amber-800'}">จดมิเตอร์เอง</button>
                <button type="button" onclick="setCardElecMode('${room.number}', 'manual')" id="card-btn-elec-manual-${room.number}" class="px-1.5 py-0.5 rounded font-semibold ${currentElecMode === 'manual' ? 'bg-white text-amber-900 shadow-xs' : 'text-amber-800'}">ราคาเหมา</button>
              </div>
            </div>

            <!-- Meter Input Sub-group -->
            <div id="card-m-elec-meter-grp-${room.number}" class="${currentElecMode === 'meter' ? '' : 'hidden'} space-y-1.5">
              <div class="flex items-center justify-between text-[11px] text-slate-500">
                <span>เดิม: <strong class="font-mono text-slate-700">${prevElec}</strong></span>
                <span class="flex items-center gap-1">
                  @ <input type="number" step="0.5" id="card-m-elec-rate-${room.number}" value="${defaultElecRate}" oninput="updateMeterCardCalc('${room.number}')" class="w-12 bg-white border border-amber-200 rounded px-1 py-0.5 text-[11px] text-right font-bold text-amber-900"> ฿
                </span>
              </div>
              <input type="number" id="card-m-curr-elec-${room.number}" placeholder="เลขใหม่" oninput="updateMeterCardCalc('${room.number}')" class="w-full bg-white border border-amber-300 rounded-lg p-1.5 text-xs focus:ring-1 focus:ring-amber-500 font-semibold">
              <p class="text-[11px] text-amber-700 font-semibold" id="card-m-diff-elec-${room.number}">0 หน่วย</p>
            </div>

            <!-- Manual Input Sub-group -->
            <div id="card-m-elec-manual-grp-${room.number}" class="${currentElecMode === 'manual' ? '' : 'hidden'} space-y-1">
              <label class="text-[10px] text-amber-800 font-semibold">ระบุค่าไฟเหมาจ่าย (บาท):</label>
              <input type="number" id="card-m-elec-manual-${room.number}" placeholder="เช่น 500" oninput="updateMeterCardCalc('${room.number}')" class="w-full bg-white border border-amber-300 rounded-lg p-1.5 text-xs focus:ring-1 focus:ring-amber-500 font-bold text-amber-900">
            </div>
          </div>

          <!-- Water Box -->
          <div class="p-3 bg-cyan-50/60 border border-cyan-200/60 rounded-xl space-y-2">
            <div class="flex items-center justify-between text-xs font-bold text-cyan-800">
              <span class="flex items-center gap-1"><i data-lucide="droplet" class="w-3.5 h-3.5 text-cyan-600"></i> น้ำประปา</span>
              <div class="flex bg-cyan-200/70 p-0.5 rounded text-[10px]">
                <button type="button" onclick="setCardWaterMode('${room.number}', 'meter')" id="card-btn-water-meter-${room.number}" class="px-1.5 py-0.5 rounded font-semibold ${currentWaterMode === 'meter' ? 'bg-white text-cyan-900 shadow-xs' : 'text-cyan-800'}">จดมิเตอร์เอง</button>
                <button type="button" onclick="setCardWaterMode('${room.number}', 'manual')" id="card-btn-water-manual-${room.number}" class="px-1.5 py-0.5 rounded font-semibold ${currentWaterMode === 'manual' ? 'bg-white text-cyan-900 shadow-xs' : 'text-cyan-800'}">ราคาเหมา</button>
              </div>
            </div>

            <!-- Meter Input Sub-group -->
            <div id="card-m-water-meter-grp-${room.number}" class="${currentWaterMode === 'meter' ? '' : 'hidden'} space-y-1.5">
              <div class="flex items-center justify-between text-[11px] text-slate-500">
                <span>เดิม: <strong class="font-mono text-slate-700">${prevWater}</strong></span>
                <span class="flex items-center gap-1">
                  @ <input type="number" step="0.5" id="card-m-water-rate-${room.number}" value="${defaultWaterRate}" oninput="updateMeterCardCalc('${room.number}')" class="w-12 bg-white border border-cyan-200 rounded px-1 py-0.5 text-[11px] text-right font-bold text-cyan-900"> ฿
                </span>
              </div>
              <input type="number" id="card-m-curr-water-${room.number}" placeholder="เลขใหม่" oninput="updateMeterCardCalc('${room.number}')" class="w-full bg-white border border-cyan-300 rounded-lg p-1.5 text-xs focus:ring-1 focus:ring-cyan-500 font-semibold">
              <p class="text-[11px] text-cyan-700 font-semibold" id="card-m-diff-water-${room.number}">0 หน่วย</p>
            </div>

            <!-- Manual Input Sub-group -->
            <div id="card-m-water-manual-grp-${room.number}" class="${currentWaterMode === 'manual' ? '' : 'hidden'} space-y-1">
              <label class="text-[10px] text-cyan-800 font-semibold">ระบุค่าน้ำเหมาจ่าย (บาท):</label>
              <input type="number" id="card-m-water-manual-${room.number}" placeholder="เช่น 150" oninput="updateMeterCardCalc('${room.number}')" class="w-full bg-white border border-cyan-300 rounded-lg p-1.5 text-xs focus:ring-1 focus:ring-cyan-500 font-bold text-cyan-900">
            </div>
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
              <div class="flex items-center justify-between mb-1">
                <label class="block text-[11px] font-semibold text-slate-600">ค่าอื่นๆ (บาท)</label>
                <button type="button" onclick="openOtherFeeModal('${room.number}')" class="text-[10px] text-amber-700 hover:text-amber-900 font-semibold flex items-center gap-0.5" title="ระบุสาเหตุค่าอื่นๆ">
                  <i data-lucide="edit-3" class="w-2.5 h-2.5 text-amber-600"></i> สาเหตุ
                </button>
              </div>
              <input type="number" id="card-m-other-${room.number}" value="${otherVal}" placeholder="0" oninput="toggleCardMeterOtherRemark('${room.number}'); updateMeterCardCalc('${room.number}')" onchange="handleCardOtherFeeChange('${room.number}')" class="w-full border border-slate-200 rounded-lg p-1.5 text-xs bg-white focus:outline-blue-500 font-medium">
            </div>
            <div id="card-m-remark-group-${room.number}" class="${otherVal ? '' : 'hidden'}">
              <label class="block text-[11px] font-semibold text-amber-700 mb-1">ระบุสาเหตุค่าอื่นๆ *</label>
              <input type="text" id="card-m-remark-${room.number}" value="${remarkVal}" placeholder="เช่น ค่าเช่าตู้เย็น, ค่าคีย์การ์ด" class="w-full border border-amber-300 rounded-lg p-1.5 text-xs bg-amber-50/50 focus:outline-amber-500">
            </div>
          </div>
        </div>

        <!-- Dedicated Due Date Box on Card -->
        <div class="bg-blue-50/80 border border-blue-200 rounded-xl p-3 flex items-center justify-between gap-2 shadow-2xs">
          <div>
            <label class="text-xs font-bold text-blue-900 flex items-center gap-1.5">
              <i data-lucide="calendar" class="w-4 h-4 text-blue-600"></i>
              กำหนดชำระภายใน:
            </label>
            <p class="text-[10px] text-blue-600">(เว้นว่างไว้จะเป็น "-")</p>
          </div>
          <div class="flex items-center gap-1">
            <input type="date" id="card-m-duedate-${room.number}" value="${globalDueDateVal}" class="border border-blue-300 rounded-lg px-2 py-1 text-xs bg-white text-slate-800 font-semibold focus:ring-1 focus:ring-blue-500">
            <button type="button" onclick="document.getElementById('card-m-duedate-${room.number}').value=''" class="text-[11px] text-slate-500 hover:text-rose-600 px-1.5 py-1 bg-white border border-slate-200 rounded-md font-medium" title="ล้างวันที่ (เว้นว่างเป็น -)">ล้าง</button>
          </div>
        </div>

        <!-- Additional Message / Notice Box on Card -->
        <div class="bg-amber-50/70 border border-amber-200/90 rounded-xl p-3 space-y-1.5 shadow-2xs">
          <label class="text-xs font-bold text-amber-900 flex items-center gap-1.5">
            <i data-lucide="message-square" class="w-4 h-4 text-amber-600"></i>
            แจ้งเพิ่มเติม (ข้อความที่จะแจ้งตอนออกบิล):
          </label>
          <input type="text" id="card-m-bill-notice-${room.number}" placeholder="เช่น กรุณาชำระก่อนวันที่ 5, มีพัสดุมาส่ง ฯลฯ" class="w-full border border-amber-300 rounded-lg p-2 text-xs bg-white text-slate-800 placeholder:text-slate-400 focus:outline-amber-500 font-medium">
        </div>

        <button onclick="createBillFromCard('${room.number}')" class="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm transition flex items-center justify-center gap-2">
          <i data-lucide="receipt" class="w-4 h-4"></i> ออกบิลห้อง ${room.number}
        </button>
      </div>
    `;
  }).join('');

  // Table View
  tbody.innerHTML = occupiedRooms.map(room => {
    const latestMeters = getRoomLatestMeters(room.number);
    const prevElec = latestMeters.elec;
    const prevWater = latestMeters.water;
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
          <div class="flex items-center gap-1">
            <input type="number" id="m-other-${room.number}" value="${otherVal}" placeholder="0" oninput="handleOtherFeeInput('${room.number}')" onchange="handleOtherFeeChange('${room.number}')" class="w-16 border border-slate-200 rounded px-1.5 py-1 text-xs focus:ring-1 focus:ring-blue-500 font-medium">
            <button type="button" onclick="openOtherFeeModal('${room.number}')" class="p-1 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50" title="ระบุสาเหตุค่าอื่นๆ">
              <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
            </button>
          </div>
          <div id="m-remark-badge-wrap-${room.number}" class="${otherVal > 0 ? '' : 'hidden'} mt-1">
            <button type="button" onclick="openOtherFeeModal('${room.number}')" id="m-remark-badge-${room.number}" class="text-[10px] flex items-center gap-1 px-1.5 py-0.5 rounded ${remarkVal ? 'bg-amber-100 text-amber-900 border border-amber-300 font-medium' : 'bg-amber-50 text-amber-700 border border-dashed border-amber-300 font-bold animate-pulse'}" title="แตะเพื่อระบุหรือเปลี่ยนสาเหตุ">
              <i data-lucide="${remarkVal ? 'tag' : 'plus-circle'}" class="w-2.5 h-2.5"></i>
              <span id="m-remark-text-${room.number}" class="max-w-[100px] truncate">${remarkVal || '+ ระบุสาเหตุ'}</span>
            </button>
          </div>
          <input type="hidden" id="m-remark-${room.number}" value="${remarkVal}">
        </td>
        <td class="px-3 py-3 bg-amber-50/20">
          <input type="text" id="m-bill-notice-${room.number}" placeholder="ข้อความแจ้งในบิล..." class="w-36 border border-amber-300 rounded px-2 py-1 text-xs bg-white text-slate-800 placeholder:text-slate-400 focus:ring-1 focus:ring-amber-500 font-medium">
        </td>
        <td class="px-3 py-3">
          <input type="date" id="m-duedate-${room.number}" value="${globalDueDateVal}" class="w-28 border border-slate-200 rounded px-1.5 py-1 text-xs" title="กำหนดชำระภายใน (ไม่บังคับ)">
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

function updateMeterCardCalc(roomNumber) {
  const room = state.rooms.find(r => String(r.number) === String(roomNumber));
  if (!room) return;

  const mode = cardModes[roomNumber] || { elec: 'meter', water: 'meter' };
  let elecAmount = 0;
  let waterAmount = 0;

  // Electricity
  if (mode.elec === 'manual') {
    elecAmount = Number(document.getElementById(`card-m-elec-manual-${roomNumber}`)?.value || 0);
  } else {
    const latest = getRoomLatestMeters(roomNumber);
    const prevElec = latest.elec;
    const currElecInput = document.getElementById(`card-m-curr-elec-${roomNumber}`)?.value;
    const currElec = (currElecInput !== '' && currElecInput !== undefined) ? Number(currElecInput) : prevElec;
    const elecRate = Number(document.getElementById(`card-m-elec-rate-${roomNumber}`)?.value || state.settings.electricRate || 8);
    const diffElec = Math.max(0, currElec - prevElec);
    elecAmount = Math.round(diffElec * elecRate);
    const diffElecEl = document.getElementById(`card-m-diff-elec-${roomNumber}`);
    if (diffElecEl) diffElecEl.innerText = `${diffElec} หน่วย (${elecAmount.toLocaleString()} ฿)`;
  }

  // Water
  if (mode.water === 'manual') {
    waterAmount = Number(document.getElementById(`card-m-water-manual-${roomNumber}`)?.value || 0);
  } else {
    const latest = getRoomLatestMeters(roomNumber);
    const prevWater = latest.water;
    const currWaterInput = document.getElementById(`card-m-curr-water-${roomNumber}`)?.value;
    const currWater = (currWaterInput !== '' && currWaterInput !== undefined) ? Number(currWaterInput) : prevWater;
    const waterRate = Number(document.getElementById(`card-m-water-rate-${roomNumber}`)?.value || state.settings.waterRate || 18);
    const diffWater = Math.max(0, currWater - prevWater);
    waterAmount = Math.round(diffWater * waterRate);
    const diffWaterEl = document.getElementById(`card-m-diff-water-${roomNumber}`);
    if (diffWaterEl) diffWaterEl.innerText = `${diffWater} หน่วย (${waterAmount.toLocaleString()} ฿)`;
  }

  const rent = Number(document.getElementById(`card-m-rent-${roomNumber}`)?.value || 0);
  const common = Number(document.getElementById(`card-m-common-${roomNumber}`)?.value || 0);
  const parking = Number(document.getElementById(`card-m-parking-${roomNumber}`)?.value || 0);
  const other = Number(document.getElementById(`card-m-other-${roomNumber}`)?.value || 0);

  const total = rent + common + parking + other + elecAmount + waterAmount;
  const totalEl = document.getElementById(`card-m-total-${roomNumber}`);
  if (totalEl) totalEl.innerText = `${total.toLocaleString()} ฿`;
}

async function createBillFromCard(roomNumber) {
  const room = state.rooms.find(r => String(r.number) === String(roomNumber));
  if (!room) return;

  const month = document.getElementById('meterBillingMonth').value;
  const mode = cardModes[roomNumber] || { elec: 'meter', water: 'meter' };
  const latestMeters = getRoomLatestMeters(roomNumber);
  const prevElec = latestMeters.elec;
  const prevWater = latestMeters.water;

  let currElec = prevElec;
  let elecAmount = 0;
  let elecRate = Number(document.getElementById(`card-m-elec-rate-${roomNumber}`)?.value || state.settings.electricRate || 8);

  if (mode.elec === 'manual') {
    elecAmount = Number(document.getElementById(`card-m-elec-manual-${roomNumber}`)?.value || 0);
  } else {
    const currElecInput = document.getElementById(`card-m-curr-elec-${roomNumber}`)?.value;
    if (currElecInput === '' || currElecInput === undefined) {
      alert(`กรุณากรอกเลขมิเตอร์ไฟใหม่ของห้อง ${roomNumber} หรือเลือก 'ราคาเหมา'`);
      document.getElementById(`card-m-curr-elec-${roomNumber}`)?.focus();
      return;
    }
    currElec = Number(currElecInput);
    elecAmount = Math.round(Math.max(0, currElec - prevElec) * elecRate);
  }

  let currWater = prevWater;
  let waterAmount = 0;
  let waterRate = Number(document.getElementById(`card-m-water-rate-${roomNumber}`)?.value || state.settings.waterRate || 18);

  if (mode.water === 'manual') {
    waterAmount = Number(document.getElementById(`card-m-water-manual-${roomNumber}`)?.value || 0);
  } else {
    const currWaterInput = document.getElementById(`card-m-curr-water-${roomNumber}`)?.value;
    currWater = (currWaterInput !== '' && currWaterInput !== undefined) ? Number(currWaterInput) : prevWater;
    waterAmount = Math.round(Math.max(0, currWater - prevWater) * waterRate);
  }

  const rent = Number(document.getElementById(`card-m-rent-${roomNumber}`)?.value || 0);
  const commonFee = Number(document.getElementById(`card-m-common-${roomNumber}`)?.value || 0);
  const parkingFee = Number(document.getElementById(`card-m-parking-${roomNumber}`)?.value || 0);
  const licensePlate = document.getElementById(`card-m-plate-${roomNumber}`)?.value.trim() || '';
  const otherFee = Number(document.getElementById(`card-m-other-${roomNumber}`)?.value || 0);
  const otherFeeRemark = document.getElementById(`card-m-remark-${roomNumber}`)?.value.trim() || '';
  const billNotice = document.getElementById(`card-m-bill-notice-${roomNumber}`)?.value.trim() || '';
  const dueDate = document.getElementById(`card-m-duedate-${roomNumber}`)?.value || document.getElementById('meterGlobalDueDate')?.value || '';

  let finalRemark = '';
  if (otherFeeRemark && billNotice) {
    finalRemark = `${otherFeeRemark} (${billNotice})`;
  } else {
    finalRemark = otherFeeRemark || billNotice || '';
  }

  const billPayload = {
    roomNumber: room.number,
    tenantName: room.tenant?.name || '',
    month,
    rent,
    electricMode: mode.elec,
    prevElectricMeter: prevElec,
    currElectricMeter: currElec,
    electricRate: elecRate,
    electricAmount: elecAmount,
    waterMode: mode.water,
    prevWaterMeter: prevWater,
    currWaterMeter: currWater,
    waterRate: waterRate,
    waterAmount: waterAmount,
    commonFee,
    parkingFee,
    licensePlate,
    otherFee,
    otherFeeRemark: finalRemark,
    remark: finalRemark,
    dueDate
  };

  try {
    showLoading(true);
    if (CONFIG.getScriptUrl()) {
      const res = await apiCall('saveBill', { data: billPayload });
      if (!res.success) throw new Error(res.error);
    }
    
    // Update local state room meters
    if (mode.elec === 'meter') room.lastElectricMeter = currElec;
    if (mode.water === 'meter') room.lastWaterMeter = currWater;
    
    alert(`สร้างบิลห้อง ${roomNumber} เรียบร้อยแล้ว!`);
    await loadAllDataFromSheet();
    populateMonthDropdowns();
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
  const latestMeters = getRoomLatestMeters(roomNumber);
  const prevElec = latestMeters.elec;
  const prevWater = latestMeters.water;

  if (currElecInput === '' || currElecInput === undefined) {
    alert(`กรุณากรอกเลขมิเตอร์ไฟใหม่ของห้อง ${roomNumber}`);
    document.getElementById(`m-curr-elec-${roomNumber}`)?.focus();
    return;
  }

  const currElec = Number(currElecInput);
  const currWater = (currWaterInput !== '' && currWaterInput !== undefined) ? Number(currWaterInput) : prevWater;

  const rent = Number(document.getElementById(`m-rent-${roomNumber}`)?.value || 0);
  const commonFee = Number(document.getElementById(`m-common-${roomNumber}`)?.value || 0);
  const parkingFee = Number(document.getElementById(`m-parking-${roomNumber}`)?.value || 0);
  const licensePlate = document.getElementById(`m-plate-${roomNumber}`)?.value.trim() || '';
  const otherFee = Number(document.getElementById(`m-other-${roomNumber}`)?.value || 0);
  const otherFeeRemark = document.getElementById(`m-remark-${roomNumber}`)?.value.trim() || '';
  const billNotice = document.getElementById(`m-bill-notice-${roomNumber}`)?.value.trim() || '';
  const dueDate = document.getElementById(`m-duedate-${roomNumber}`)?.value || document.getElementById('meterGlobalDueDate')?.value || '';

  let finalRemark = '';
  if (otherFeeRemark && billNotice && otherFeeRemark !== billNotice) {
    finalRemark = `${otherFeeRemark} (${billNotice})`;
  } else {
    finalRemark = otherFeeRemark || billNotice || '';
  }

  const elecRate = Number(state.settings.electricRate || 8);
  const waterRate = Number(state.settings.waterRate || 18);
  const elecAmount = Math.round(Math.max(0, currElec - prevElec) * elecRate);
  const waterAmount = Math.round(Math.max(0, currWater - prevWater) * waterRate);

  const billPayload = {
    roomNumber: room.number,
    tenantName: room.tenant?.name || '',
    month,
    rent,
    electricMode: 'meter',
    prevElectricMeter: prevElec,
    currElectricMeter: currElec,
    electricRate: elecRate,
    electricAmount: elecAmount,
    waterMode: 'meter',
    prevWaterMeter: prevWater,
    currWaterMeter: currWater,
    waterRate: waterRate,
    waterAmount: waterAmount,
    commonFee,
    parkingFee,
    licensePlate,
    otherFee,
    otherFeeRemark: finalRemark,
    remark: finalRemark,
    dueDate
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
    populateMonthDropdowns();
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
  const monthFilter = document.getElementById('billMonthFilter')?.value || 'all';

  // 1. คำนวณยอดรวมของบิลตามรอบเดือนที่เลือก (หรือทั้งหมด)
  const monthTargetBills = (monthFilter === 'all')
    ? state.bills
    : state.bills.filter(b => {
        const fm = typeof formatMonthName === 'function' ? formatMonthName(b.month) : String(b.month || '');
        return fm === monthFilter || String(b.month).trim() === monthFilter;
      });

  let summaryTotalAmount = 0;
  let summaryTotalCount = 0;
  let summaryPaidAmount = 0;
  let summaryPaidCount = 0;
  let summaryPendingAmount = 0;
  let summaryPendingCount = 0;

  monthTargetBills.forEach(b => {
    const amt = Number(b.totalAmount || 0);
    summaryTotalAmount += amt;
    summaryTotalCount++;
    if (b.status === 'paid') {
      summaryPaidAmount += amt;
      summaryPaidCount++;
    } else {
      summaryPendingAmount += amt;
      summaryPendingCount++;
    }
  });

  const elTitle = document.getElementById('billSummaryMonthTitle');
  if (elTitle) elTitle.innerText = monthFilter === 'all' ? 'ทุกรอบเดือน (ทั้งหมด)' : monthFilter;

  const elCountBadge = document.getElementById('billSummaryCountBadge');
  if (elCountBadge) elCountBadge.innerText = `${summaryTotalCount} รายการ`;

  const elTotal = document.getElementById('billSummaryTotal');
  if (elTotal) elTotal.innerText = `${summaryTotalAmount.toLocaleString()} ฿`;
  const elTotalSub = document.getElementById('billSummaryTotalSub');
  if (elTotalSub) elTotalSub.innerText = `${summaryTotalCount} บิลที่ออก`;

  const elPaid = document.getElementById('billSummaryPaid');
  if (elPaid) elPaid.innerText = `${summaryPaidAmount.toLocaleString()} ฿`;
  const elPaidSub = document.getElementById('billSummaryPaidSub');
  if (elPaidSub) elPaidSub.innerText = `${summaryPaidCount} บิลชำระแล้ว`;

  const elPending = document.getElementById('billSummaryPending');
  if (elPending) elPending.innerText = `${summaryPendingAmount.toLocaleString()} ฿`;
  const elPendingSub = document.getElementById('billSummaryPendingSub');
  if (elPendingSub) elPendingSub.innerText = `${summaryPendingCount} บิลค้างชำระ`;

  // 2. กรองรายการบิลเพื่อแสดงผล (ตามเดือน, สถานะ, และคำค้นหา)
  const filtered = state.bills.filter(bill => {
    const formattedMonth = typeof formatMonthName === 'function' ? formatMonthName(bill.month) : String(bill.month || '');
    const matchMonth = (monthFilter === 'all') || 
      (formattedMonth === monthFilter) || 
      (String(bill.month).trim() === monthFilter);

    const matchSearch = String(bill.roomNumber).toLowerCase().includes(search) ||
      (bill.month && bill.month.toLowerCase().includes(search)) ||
      (formattedMonth && formattedMonth.toLowerCase().includes(search)) ||
      (bill.tenantName && bill.tenantName.toLowerCase().includes(search)) ||
      (bill.id && bill.id.toLowerCase().includes(search)) ||
      (bill.licensePlate && bill.licensePlate.toLowerCase().includes(search));

    const matchStatus = filter === 'all' || bill.status === filter;

    return matchMonth && matchSearch && matchStatus;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="13" class="text-center py-8 text-slate-400">ไม่พบบิลตามเงื่อนไขที่เลือก</td></tr>`;
    cardContainer.innerHTML = `<div class="col-span-full text-center py-12 text-slate-400 bg-white rounded-2xl border border-slate-200">ไม่พบบิลตามเงื่อนไขที่เลือก</div>`;
    lucide.createIcons();
    return;
  }

  // Table View
  tbody.innerHTML = filtered.map(bill => {
    const isPaid = bill.status === 'paid';
    const room = state.rooms.find(r => String(r.number) === String(bill.roomNumber));
    const tenantName = room?.tenant?.name || bill.tenantName || '—';
    const formattedDate = typeof formatThaiDateTime === 'function' ? formatThaiDateTime(bill.createdAt) : bill.createdAt;
    const formattedMonth = typeof formatMonthName === 'function' ? formatMonthName(bill.month) : bill.month;

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
      ? `<div><span class="font-semibold text-slate-700">${Number(bill.otherFee).toLocaleString()} ฿</span></div>`
      : `<span class="text-slate-400 text-xs">-</span>`;

    const remarkContent = bill.otherFeeRemark || bill.remark || '';
    const remarkDisplay = remarkContent
      ? `<span class="bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-md text-[11px] font-medium block max-w-[130px] truncate" title="${remarkContent}">${remarkContent}</span>`
      : `<span class="text-slate-400 text-xs">-</span>`;

    const elecText = bill.electricUnits > 0
      ? `<p class="font-semibold text-slate-800">${Number(bill.electricAmount).toLocaleString()} ฿</p><p class="text-[10px] text-slate-400">(${bill.electricUnits} หน่วย)</p>`
      : `<p class="font-semibold text-slate-800">${Number(bill.electricAmount).toLocaleString()} ฿</p><p class="text-[10px] text-amber-600 font-medium">(ราคาเหมา)</p>`;

    const waterText = bill.waterUnits > 0
      ? `<p class="font-semibold text-slate-800">${Number(bill.waterAmount).toLocaleString()} ฿</p><p class="text-[10px] text-slate-400">(${bill.waterUnits} หน่วย)</p>`
      : `<p class="font-semibold text-slate-800">${Number(bill.waterAmount).toLocaleString()} ฿</p><p class="text-[10px] text-cyan-600 font-medium">(ราคาเหมา)</p>`;

    return `
      <tr class="hover:bg-slate-50 transition">
        <td class="px-4 py-4">
          <p class="font-mono font-bold text-slate-800 text-xs">${bill.id}</p>
          <p class="text-[11px] text-slate-500 font-medium">${formattedMonth}</p>
          <p class="text-[10px] text-slate-400">${formattedDate}</p>
        </td>
        <td class="px-4 py-4">
          <p class="font-bold text-blue-600 text-base">ห้อง ${bill.roomNumber} <span class="text-xs font-normal text-slate-500">(ชั้น ${room?.floor || bill.floor || '-'})</span></p>
          <p class="text-xs font-semibold text-slate-700">${tenantName}</p>
          <p class="text-[10px] text-slate-400 font-medium">${room?.type || bill.roomType || 'มาตรฐาน'}</p>
        </td>
        <td class="px-4 py-4 font-semibold text-slate-700">${Number(bill.rent).toLocaleString()} ฿</td>
        <td class="px-4 py-4">${elecText}</td>
        <td class="px-4 py-4">${waterText}</td>
        <td class="px-4 py-4 text-xs font-semibold text-slate-700">${Number(bill.commonFee || 0).toLocaleString()} ฿</td>
        <td class="px-4 py-4 text-xs">${parkingText}</td>
        <td class="px-4 py-4 text-xs">${otherText}</td>
        <td class="px-4 py-4 text-xs">${remarkDisplay}</td>
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
    const room = state.rooms.find(r => String(r.number) === String(bill.roomNumber));
    const tenantName = room?.tenant?.name || bill.tenantName || '—';
    const formattedDate = typeof formatThaiDateTime === 'function' ? formatThaiDateTime(bill.createdAt) : bill.createdAt;
    const formattedMonth = typeof formatMonthName === 'function' ? formatMonthName(bill.month) : bill.month;

    const borderClass = isPaid ? 'border-emerald-200' : 'border-slate-200';
    const statusBadge = isPaid
      ? `<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1"><i data-lucide="check-circle" class="w-3 h-3"></i> ชำระแล้ว</span>`
      : `<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 flex items-center gap-1"><i data-lucide="clock" class="w-3 h-3"></i> รอชำระ</span>`;

    return `
      <div class="bg-white rounded-2xl border ${borderClass} shadow-sm hover:shadow-md transition p-5 space-y-4 flex flex-col justify-between">
        <div>
          <div class="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <span class="text-[11px] font-mono font-semibold text-slate-400 block">${bill.id}</span>
              <h3 class="text-xl font-bold text-slate-800">ห้อง ${bill.roomNumber} <span class="text-xs font-normal text-slate-500">(ชั้น ${room?.floor || bill.floor || '-'})</span></h3>
              <p class="text-xs text-slate-600 font-medium">👤 ${tenantName} <span class="text-[11px] text-slate-400">• ${room?.type || bill.roomType || 'มาตรฐาน'}</span></p>
              <p class="text-xs text-blue-600 font-semibold mt-0.5">${formattedMonth}</p>
              <p class="text-[10px] text-slate-400">วันที่ออก: ${formattedDate}</p>
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
              <span>${bill.electricUnits > 0 ? `ค่าไฟ (${bill.electricUnits} หน่วย @ ${bill.electricRate}฿)` : 'ค่าไฟ (ราคาเหมา)'}:</span>
              <span class="font-semibold text-slate-800">${Number(bill.electricAmount).toLocaleString()} ฿</span>
            </div>
            <div class="flex justify-between">
              <span>${bill.waterUnits > 0 ? `ค่าน้ำ (${bill.waterUnits} หน่วย @ ${bill.waterRate}฿)` : 'ค่าน้ำ (ราคาเหมา)'}:</span>
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
            ${(bill.otherFeeRemark || bill.remark) ? `
              <div class="mt-2 p-2 bg-amber-50/80 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-start gap-1.5">
                <i data-lucide="message-square" class="w-3.5 h-3.5 mt-0.5 text-amber-600 flex-shrink-0"></i>
                <div class="min-w-0">
                  <span class="font-bold text-[11px] block">หมายเหตุ / รายละเอียดเพิ่มเติม:</span>
                  <span class="break-words">${bill.otherFeeRemark || bill.remark}</span>
                </div>
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
    const billToDelete = state.bills.find(b => b.id === billId);
    const roomNumber = billToDelete ? billToDelete.roomNumber : null;

    if (CONFIG.getScriptUrl()) {
      const res = await apiCall('deleteBill', { id: billId });
      if (!res.success) throw new Error(res.error);
    }
    state.bills = state.bills.filter(b => b.id !== billId);

    // Revert room's last meter readings to the next latest remaining bill
    if (roomNumber) {
      const latestMeters = getRoomLatestMeters(roomNumber);
      const room = state.rooms.find(r => String(r.number) === String(roomNumber));
      if (room) {
        room.lastElectricMeter = latestMeters.elec;
        room.lastWaterMeter = latestMeters.water;
      }
    }

    populateMonthDropdowns();
    renderBills();
    renderMeter();
    loadDashboard();
    alert('ลบบิลและอัปเดตยูนิตมิเตอร์ล่าสุดเรียบร้อยแล้ว!');
  } catch (err) {
    alert(err.message);
  } finally {
    showLoading(false);
  }
}

function openPrintBill(billId) {
  const gasUrl = encodeURIComponent(CONFIG.getScriptUrl());
  window.open(`./print-bill.html?billId=${billId}&gasUrl=${gasUrl}`, '_blank');
}

function openOnlineBill(billId) {
  const gasUrl = encodeURIComponent(CONFIG.getScriptUrl());
  window.open(`./tenant-portal.html?billId=${billId}&gasUrl=${gasUrl}`, '_blank');
}

// ----------------------------------------------------
// CREATE BILL MODAL
// ----------------------------------------------------
function setBillElecMode(mode) {
  modalElecMode = mode;
  const btnMeter = document.getElementById('btnBillElecMeter');
  const btnManual = document.getElementById('btnBillElecManual');
  const meterGrp = document.getElementById('billElecMeterGroup');
  const manualGrp = document.getElementById('billElecManualGroup');

  if (mode === 'meter') {
    if (btnMeter) btnMeter.className = 'px-2 py-0.5 rounded font-semibold bg-white text-amber-900 shadow-xs';
    if (btnManual) btnManual.className = 'px-2 py-0.5 rounded font-semibold text-amber-800 hover:text-amber-950';
    if (meterGrp) meterGrp.classList.remove('hidden');
    if (manualGrp) manualGrp.classList.add('hidden');
  } else {
    if (btnMeter) btnMeter.className = 'px-2 py-0.5 rounded font-semibold text-amber-800 hover:text-amber-950';
    if (btnManual) btnManual.className = 'px-2 py-0.5 rounded font-semibold bg-white text-amber-900 shadow-xs';
    if (meterGrp) meterGrp.classList.add('hidden');
    if (manualGrp) manualGrp.classList.remove('hidden');
  }
  calculateBillTotal();
}

function setBillWaterMode(mode) {
  modalWaterMode = mode;
  const btnMeter = document.getElementById('btnBillWaterMeter');
  const btnManual = document.getElementById('btnBillWaterManual');
  const meterGrp = document.getElementById('billWaterMeterGroup');
  const manualGrp = document.getElementById('billWaterManualGroup');

  if (mode === 'meter') {
    if (btnMeter) btnMeter.className = 'px-2 py-0.5 rounded font-semibold bg-white text-cyan-900 shadow-xs';
    if (btnManual) btnManual.className = 'px-2 py-0.5 rounded font-semibold text-cyan-800 hover:text-cyan-950';
    if (meterGrp) meterGrp.classList.remove('hidden');
    if (manualGrp) manualGrp.classList.add('hidden');
  } else {
    if (btnMeter) btnMeter.className = 'px-2 py-0.5 rounded font-semibold text-cyan-800 hover:text-cyan-950';
    if (btnManual) btnManual.className = 'px-2 py-0.5 rounded font-semibold bg-white text-cyan-900 shadow-xs';
    if (meterGrp) meterGrp.classList.add('hidden');
    if (manualGrp) manualGrp.classList.remove('hidden');
  }
  calculateBillTotal();
}

function openCreateBillModal() {
  const roomSelect = document.getElementById('formBillRoomNumber');
  const occupiedRooms = state.rooms.filter(r => r.status === 'occupied');
  
  if (occupiedRooms.length === 0) {
    alert('ยังไม่มีห้องที่มีผู้เช่า กรุณาเพิ่มผู้เช่าในเมนูจัดการห้องพักก่อน');
    return;
  }

  roomSelect.innerHTML = occupiedRooms.map(r => `<option value="${r.number}">ห้อง ${r.number} (${r.tenant?.name || 'ไม่มีชื่อ'})</option>`).join('');
  setBillElecMode('meter');
  setBillWaterMode('meter');
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

  const latestMeters = getRoomLatestMeters(roomNumber);

  document.getElementById('formBillRent').value = room.price || 4000;
  document.getElementById('formBillCommonFee').value = room.commonFee !== undefined ? room.commonFee : (state.settings.commonFeeDefault || 300);
  document.getElementById('formBillParkingFee').value = room.parkingFee || 0;
  document.getElementById('formBillLicensePlate').value = room.licensePlate || '';
  
  document.getElementById('formBillPrevElec').value = latestMeters.elec;
  document.getElementById('formBillCurrElec').value = latestMeters.elec > 0 ? latestMeters.elec + 50 : 50;
  document.getElementById('formBillElecRate').value = state.settings.electricRate || 8;
  document.getElementById('formBillElecManualAmount').value = 0;

  document.getElementById('formBillPrevWater').value = latestMeters.water;
  document.getElementById('formBillCurrWater').value = latestMeters.water > 0 ? latestMeters.water + 8 : 8;
  document.getElementById('formBillWaterRate').value = state.settings.waterRate || 18;
  document.getElementById('formBillWaterManualAmount').value = 0;

  document.getElementById('formBillOtherFee').value = room.otherFee || 0;
  document.getElementById('formBillOtherRemark').value = room.otherFeeRemark || '';
  if (document.getElementById('formBillRemark')) {
    document.getElementById('formBillRemark').value = room.otherFeeRemark || '';
  }
  document.getElementById('formBillDueDate').value = '';

  toggleBillOtherRemark();
  calculateBillTotal();
}

function calculateBillTotal() {
  const rent = Number(document.getElementById('formBillRent')?.value || 0);
  const commonFee = Number(document.getElementById('formBillCommonFee')?.value || 0);
  const parkingFee = Number(document.getElementById('formBillParkingFee')?.value || 0);
  const otherFee = Number(document.getElementById('formBillOtherFee')?.value || 0);

  // Electricity
  let electricAmount = 0;
  if (modalElecMode === 'manual') {
    electricAmount = Number(document.getElementById('formBillElecManualAmount')?.value || 0);
  } else {
    const prevElec = Number(document.getElementById('formBillPrevElec')?.value || 0);
    const currElec = Number(document.getElementById('formBillCurrElec')?.value || 0);
    const elecRate = Number(document.getElementById('formBillElecRate')?.value || state.settings.electricRate || 8);
    const elecUnits = Math.max(0, currElec - prevElec);
    electricAmount = Math.round(elecUnits * elecRate);
    const calcElecEl = document.getElementById('calcElecAmount');
    if (calcElecEl) calcElecEl.innerText = `${electricAmount.toLocaleString()} ฿ (${elecUnits} หน่วย)`;
  }

  // Water
  let waterAmount = 0;
  if (modalWaterMode === 'manual') {
    waterAmount = Number(document.getElementById('formBillWaterManualAmount')?.value || 0);
  } else {
    const prevWater = Number(document.getElementById('formBillPrevWater')?.value || 0);
    const currWater = Number(document.getElementById('formBillCurrWater')?.value || 0);
    const waterRate = Number(document.getElementById('formBillWaterRate')?.value || state.settings.waterRate || 18);
    const waterUnits = Math.max(0, currWater - prevWater);
    waterAmount = Math.round(waterUnits * waterRate);
    const calcWaterEl = document.getElementById('calcWaterAmount');
    if (calcWaterEl) calcWaterEl.innerText = `${waterAmount.toLocaleString()} ฿ (${waterUnits} หน่วย)`;
  }

  const grandTotal = rent + commonFee + parkingFee + otherFee + electricAmount + waterAmount;
  const calcGrandTotalEl = document.getElementById('calcGrandTotal');
  if (calcGrandTotalEl) calcGrandTotalEl.innerText = `${grandTotal.toLocaleString()} บาท`;
}

async function saveBillForm(e) {
  e.preventDefault();
  const roomNumber = document.getElementById('formBillRoomNumber').value;
  const room = state.rooms.find(r => String(r.number) === String(roomNumber));
  const month = document.getElementById('formBillMonth').value;
  const rent = Number(document.getElementById('formBillRent').value);
  const commonFee = Number(document.getElementById('formBillCommonFee').value || 0);
  const parkingFee = Number(document.getElementById('formBillParkingFee').value || 0);
  const licensePlate = document.getElementById('formBillLicensePlate').value.trim();

  // Electricity
  const prevElec = Number(document.getElementById('formBillPrevElec').value || 0);
  let currElec = prevElec;
  let elecRate = Number(document.getElementById('formBillElecRate').value || state.settings.electricRate || 8);
  let electricAmount = 0;

  if (modalElecMode === 'manual') {
    electricAmount = Number(document.getElementById('formBillElecManualAmount').value || 0);
  } else {
    currElec = Number(document.getElementById('formBillCurrElec').value || 0);
    electricAmount = Math.round(Math.max(0, currElec - prevElec) * elecRate);
  }

  // Water
  const prevWater = Number(document.getElementById('formBillPrevWater').value || 0);
  let currWater = prevWater;
  let waterRate = Number(document.getElementById('formBillWaterRate').value || state.settings.waterRate || 18);
  let waterAmount = 0;

  if (modalWaterMode === 'manual') {
    waterAmount = Number(document.getElementById('formBillWaterManualAmount').value || 0);
  } else {
    currWater = Number(document.getElementById('formBillCurrWater').value || 0);
    waterAmount = Math.round(Math.max(0, currWater - prevWater) * waterRate);
  }

  const otherFee = Number(document.getElementById('formBillOtherFee').value || 0);
  const otherFeeRemark = document.getElementById('formBillOtherRemark').value.trim();
  const billRemark = document.getElementById('formBillRemark')?.value.trim() || '';
  const finalRemark = otherFeeRemark || billRemark || '';
  const dueDate = document.getElementById('formBillDueDate').value;

  const payload = {
    roomNumber,
    tenantName: room?.tenant?.name || '',
    month,
    rent,
    commonFee,
    parkingFee,
    licensePlate,
    electricMode: modalElecMode,
    prevElectricMeter: prevElec,
    currElectricMeter: currElec,
    electricRate: elecRate,
    electricAmount: electricAmount,
    waterMode: modalWaterMode,
    prevWaterMeter: prevWater,
    currWaterMeter: currWater,
    waterRate: waterRate,
    waterAmount: waterAmount,
    otherFee,
    otherFeeRemark: finalRemark,
    remark: finalRemark,
    dueDate
  };

  try {
    showLoading(true);
    if (CONFIG.getScriptUrl()) {
      const res = await apiCall('saveBill', { data: payload });
      if (!res.success) throw new Error(res.error);
    }

    closeBillModal();
    await loadAllDataFromSheet();
    populateMonthDropdowns();
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
  const dormName = state.settings.dormName || 'หอพักสุขสบาย';
  if (document.getElementById('sidebarDormName')) document.getElementById('sidebarDormName').innerText = dormName;
  if (document.getElementById('mobileDormName')) document.getElementById('mobileDormName').innerText = dormName;
  document.getElementById('settingGoogleScriptUrl').value = CONFIG.getScriptUrl();
  document.getElementById('settingDormName').value = state.settings.dormName || '';
  document.getElementById('settingDormPhone').value = state.settings.dormPhone || '';
  document.getElementById('settingDormAddress').value = state.settings.dormAddress || '';

  const elecVal = (state.settings.electricRate !== undefined && state.settings.electricRate !== '')
    ? state.settings.electricRate : 8;
  const waterVal = (state.settings.waterRate !== undefined && state.settings.waterRate !== '')
    ? state.settings.waterRate : 18;
  const commonVal = (state.settings.commonFeeDefault !== undefined && state.settings.commonFeeDefault !== '')
    ? state.settings.commonFeeDefault
    : ((state.settings.commonFee !== undefined && state.settings.commonFee !== '') ? state.settings.commonFee : 300);

  document.getElementById('settingElectricRate').value = elecVal;
  document.getElementById('settingWaterRate').value = waterVal;
  document.getElementById('settingCommonFee').value = commonVal;

  let ppId = state.settings.promptpayId || '';
  if (/^\d{9}$/.test(String(ppId))) ppId = '0' + String(ppId);
  document.getElementById('settingPromptpayId').value = ppId;
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
      state.settings = { ...state.settings, ...(result.data.settings || {}) };
      if (state.settings.promptpayId && /^\d{9}$/.test(String(state.settings.promptpayId))) {
        state.settings.promptpayId = '0' + String(state.settings.promptpayId);
      }
      try {
        localStorage.setItem('DORM_SETTINGS', JSON.stringify(state.settings));
      } catch (e) {}

      state.rooms = result.data.rooms || state.rooms;
      state.bills = result.data.bills || state.bills;

      // ซิงค์ MAX_ROOM_LIMIT จาก Google Apps Script (Backend) อัตโนมัติ
      if (result.data && result.data.maxRoomLimit !== undefined && result.data.maxRoomLimit !== null) {
        CONFIG.MAX_ROOM_LIMIT = Number(result.data.maxRoomLimit);
        try {
          localStorage.setItem('DORM_MAX_ROOM_LIMIT', CONFIG.MAX_ROOM_LIMIT);
        } catch (e) {}
      }

      updateConnectionStatusUI(true);
      populateMonthDropdowns();
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

    // 1. Immediately cache in local memory and browser storage
    state.settings = { ...state.settings, ...payload };
    try {
      localStorage.setItem('DORM_SETTINGS', JSON.stringify(state.settings));
    } catch (e) {}

    // 2. Persist to Google Sheets via Apps Script API
    if (CONFIG.getScriptUrl()) {
      const res = await apiCall('saveSettings', { data: payload });
      if (!res.success) throw new Error(res.error);
    }

    document.getElementById('sidebarDormName').innerText = state.settings.dormName || 'หอพัก';
    renderSettingsInputs();
    alert('✅ บันทึกการตั้งค่าลง Google Sheets และเบราว์เซอร์เรียบร้อยแล้ว!');
  } catch (err) {
    renderSettingsInputs();
    alert(`บันทึกลง Google Sheets ไม่สำเร็จ: ${err.message}\n(แต่ระบบได้จำค่าใหม่นี้ไว้ในเบราว์เซอร์เครื่องนี้ให้แล้ว กรุณาตรวจสอบว่าได้อัปเดตโค้ด Apps Script และกด Deploy New Version หรือยัง)`);
  } finally {
    showLoading(false);
  }
}

