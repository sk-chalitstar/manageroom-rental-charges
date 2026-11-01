// Configuration for Google Sheets & GitHub Pages
const CONFIG = {
  // ============================================================================
  // ตั้งค่าจำกัดจำนวนห้องพักสูงสุด (สำหรับโมเดลนำโปรแกรมไปให้คนอื่นเช่ารายเดือน / SaaS Quota)
  // ระบบจะซิงค์ตัวเลข MAX_ROOM_LIMIT จาก Google Apps Script มาใช้อัตโนมัติ
  // หรือกำหนดค่าเริ่มต้นตรงนี้ได้เลย (ใส่ 0 หรือ null หากไม่ต้องการจำกัด)
  // ============================================================================
  MAX_ROOM_LIMIT: (function() {
    try {
      const cached = localStorage.getItem('DORM_MAX_ROOM_LIMIT');
      if (cached !== null && cached !== '') return Number(cached);
    } catch (e) {}
    return 20; // ค่าเริ่มต้น (เช่น 20 ห้อง)
  })(),

  // อ่าน URL จาก query string (?gasUrl=...) ก่อน หากไม่มีให้อ่านจาก localStorage
  GOOGLE_SCRIPT_URL: (function() {
    try {
      if (typeof window !== 'undefined' && window.location && window.location.search) {
        const urlParams = new URLSearchParams(window.location.search);
        const gasUrl = urlParams.get('gasUrl');
        if (gasUrl) {
          const decoded = decodeURIComponent(gasUrl).trim();
          localStorage.setItem('DORM_GOOGLE_SCRIPT_URL', decoded);
          return decoded;
        }
      }
    } catch (e) {}
    try {
      return localStorage.getItem('DORM_GOOGLE_SCRIPT_URL') || '';
    } catch (e) {
      return '';
    }
  })(),

  // บันทึก URL ใหม่
  setScriptUrl: function(url) {
    this.GOOGLE_SCRIPT_URL = (url || '').trim();
    try {
      localStorage.setItem('DORM_GOOGLE_SCRIPT_URL', this.GOOGLE_SCRIPT_URL);
    } catch (e) {}
  },

  // ดึง URL ปัจจุบัน
  getScriptUrl: function() {
    if (!this.GOOGLE_SCRIPT_URL) {
      try {
        if (typeof window !== 'undefined' && window.location && window.location.search) {
          const urlParams = new URLSearchParams(window.location.search);
          const gasUrl = urlParams.get('gasUrl');
          if (gasUrl) {
            this.setScriptUrl(decodeURIComponent(gasUrl));
            return this.GOOGLE_SCRIPT_URL;
          }
        }
      } catch (e) {}
      try {
        this.GOOGLE_SCRIPT_URL = localStorage.getItem('DORM_GOOGLE_SCRIPT_URL') || '';
      } catch (e) {
        this.GOOGLE_SCRIPT_URL = '';
      }
    }
    return this.GOOGLE_SCRIPT_URL;
  }
};

// ----------------------------------------------------
// Thai Date & Time Formatters (No seconds, Clean Thai)
// ----------------------------------------------------

/**
 * รูปแบบ วัน/เดือน/ปี เวลา (ไม่เอาวินาที)
 * เช่น 30/10/2569 21:32 น.
 */
function formatThaiDateTime(dateVal) {
  if (!dateVal) return '-';
  try {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return String(dateVal);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    let year = d.getFullYear();
    if (year < 2400) year += 543;
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes} น.`;
  } catch (e) {
    return String(dateVal);
  }
}

/**
 * รูปแบบ วัน/เดือน/ปี
 * เช่น 05/11/2569
 */
function formatThaiDate(dateVal) {
  if (!dateVal) return '-';
  try {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return String(dateVal);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    let year = d.getFullYear();
    if (year < 2400) year += 543;
    return `${day}/${month}/${year}`;
  } catch (e) {
    return String(dateVal);
  }
}

/**
 * รูปแบบชื่อเดือนภาษาไทย เช่น "กันยายน 2569"
 * ป้องกันการแสดง ISO timestamp เช่น 2569-09-30T17:00:00.000Z
 */
function formatMonthName(monthVal) {
  if (!monthVal) return '-';
  const str = String(monthVal).trim();
  const thaiMonths = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
  ];

  for (let i = 0; i < thaiMonths.length; i++) {
    if (str.indexOf(thaiMonths[i]) !== -1) return str;
  }

  try {
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      const monthIdx = d.getMonth();
      let year = d.getFullYear();
      if (year < 2400) year += 543;
      return `${thaiMonths[monthIdx]} ${year}`;
    }
  } catch (e) {}

  return str;
}
