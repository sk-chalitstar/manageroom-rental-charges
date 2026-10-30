// Configuration for Google Sheets & GitHub Pages
const CONFIG = {
  // ใส่ Google Apps Script Web App URL ที่ได้จากการ Deploy ที่นี่ (หรือกรอกในหน้าตั้งค่าของระบบก็ได้)
  GOOGLE_SCRIPT_URL: localStorage.getItem('DORM_GOOGLE_SCRIPT_URL') || '',
  
  // บันทึก URL ใหม่
  setScriptUrl: function(url) {
    this.GOOGLE_SCRIPT_URL = url.trim();
    localStorage.setItem('DORM_GOOGLE_SCRIPT_URL', this.GOOGLE_SCRIPT_URL);
  },

  // ดึง URL ปัจจุบัน
  getScriptUrl: function() {
    return this.GOOGLE_SCRIPT_URL || localStorage.getItem('DORM_GOOGLE_SCRIPT_URL') || '';
  }
};

