/**
 * ==============================================================================
 * ระบบจัดการหอพัก (Dormitory Management System) - Google Apps Script Backend
 * ==============================================================================
 * ใช้เป็น Backend และ Database จัดเก็บข้อมูลใน Google Sheets 100%
 * เชื่อมต่อกับเว็บแอปบน GitHub Pages และ LINE Messaging API
 */

// ------------------------------------------------------------------------------
// 1. INITIALIZATION & SETUP
// ------------------------------------------------------------------------------

function initDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1. Settings Sheet
  let settingsSheet = ss.getSheetByName('Settings');
  if (!settingsSheet) {
    settingsSheet = ss.insertSheet('Settings');
    settingsSheet.appendRow(['Key', 'Value', 'Description']);
    settingsSheet.getRange('A1:C1').setFontWeight('bold').setBackground('#f1f5f9');
    
    const defaultSettings = [
      ['dormName', 'หอพักสุขสบาย (Suk-Sabai Residence)', 'ชื่อหอพัก'],
      ['dormAddress', '123 ซอยสุขุมวิท แขวงคลองเตย เขตคลองเตย กทม. 10110', 'ที่อยู่หอพัก'],
      ['dormPhone', '081-234-5678', 'เบอร์โทรศัพท์ติดต่อ'],
      ['promptpayId', '0812345678', 'เบอร์พร้อมเพย์ หรือเลข ปชช. รับเงิน'],
      ['promptpayName', 'นายสมชาย ผู้ดูแลหอ', 'ชื่อบัญชีพร้อมเพย์'],
      ['electricRate', '8', 'อัตราค่าไฟ (บาท/หน่วย)'],
      ['waterRate', '18', 'อัตราค่าน้ำ (บาท/หน่วย)'],
      ['commonFeeDefault', '300', 'ค่าส่วนกลางเริ่มต้น (บาท)'],
      ['lineToken', '', 'LINE Channel Access Token']
    ];
    defaultSettings.forEach(row => settingsSheet.appendRow(row));
    settingsSheet.autoResizeColumns(1, 3);
  }

  // 2. Rooms Sheet
  let roomsSheet = ss.getSheetByName('Rooms');
  if (!roomsSheet) {
    roomsSheet = ss.insertSheet('Rooms');
    const roomHeaders = [
      'number', 'floor', 'type', 'price', 'commonFee', 'parkingFee', 
      'licensePlate', 'otherFee', 'otherFeeRemark', 'status', 
      'tenantName', 'tenantPhone', 'lineUserId', 'startDate', 
      'lastElectricMeter', 'lastWaterMeter'
    ];
    roomsSheet.appendRow(roomHeaders);
    roomsSheet.getRange(1, 1, 1, roomHeaders.length).setFontWeight('bold').setBackground('#e2e8f0');

    // Default sample rooms
    const sampleRooms = [
      ['101', 1, 'แอร์ (Air Conditioner)', 4500, 300, 500, '1กข-9999 กทม.', 0, '', 'occupied', 'สมชาย รักสงบ', '089-111-2233', '', '2025-01-01', 1250, 340],
      ['102', 1, 'พัดลม (Fan Room)', 3200, 300, 0, '', 0, '', 'occupied', 'วิภา สดใส', '086-555-7788', '', '2025-02-15', 890, 210],
      ['103', 1, 'แอร์ (Air Conditioner)', 4500, 300, 0, '', 0, '', 'vacant', '', '', '', '', 500, 100],
      ['201', 2, 'แอร์ VIP (Balcony)', 5200, 300, 500, '9กผ-1234 กทม.', 100, 'ค่าเช่าตู้เย็น', 'occupied', 'อรรถพล ก้าวหน้า', '091-888-9900', '', '2024-11-01', 2100, 450],
      ['202', 2, 'แอร์ (Air Conditioner)', 4500, 300, 0, '', 0, '', 'vacant', '', '', '', '', 1420, 310]
    ];
    sampleRooms.forEach(row => roomsSheet.appendRow(row));
    roomsSheet.autoResizeColumns(1, roomHeaders.length);
  }

  // 3. Bills Sheet
  let billsSheet = ss.getSheetByName('Bills');
  if (!billsSheet) {
    billsSheet = ss.insertSheet('Bills');
    const billHeaders = [
      'id', 'roomNumber', 'month', 'createdAt', 'dueDate', 
      'rent', 'prevElectricMeter', 'currElectricMeter', 'electricUnits', 'electricRate', 'electricAmount',
      'prevWaterMeter', 'currWaterMeter', 'waterUnits', 'waterRate', 'waterAmount',
      'commonFee', 'parkingFee', 'licensePlate', 'otherFee', 'otherFeeRemark', 'discount', 'totalAmount',
      'status', 'paidAt', 'lineSent', 'lineSentAt'
    ];
    billsSheet.appendRow(billHeaders);
    billsSheet.getRange(1, 1, 1, billHeaders.length).setFontWeight('bold').setBackground('#e2e8f0');

    // Default sample bill
    billsSheet.appendRow([
      'BILL-2025-02-101', '101', 'กุมภาพันธ์ 2025', new Date().toISOString(), '2025-03-05',
      4500, 1200, 1250, 50, 8, 400,
      330, 340, 10, 18, 180,
      300, 500, '1กข-9999 กทม.', 0, '', 0, 5880,
      'paid', new Date().toISOString(), true, new Date().toISOString()
    ]);
    billsSheet.autoResizeColumns(1, billHeaders.length);
  }

  // Remove default Sheet1 if exists
  const sheet1 = ss.getSheetByName('Sheet1') || ss.getSheetByName('แผ่น1');
  if (sheet1 && ss.getSheets().length > 1) {
    ss.deleteSheet(sheet1);
  }
}

// ------------------------------------------------------------------------------
// 2. HELPER FUNCTIONS FOR GOOGLE SHEETS
// ------------------------------------------------------------------------------

function getSheetData(sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    initDatabase();
    sheet = ss.getSheetByName(sheetName);
  }
  const rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return [];

  const headers = rows[0];
  const data = [];
  for (let i = 1; i < rows.length; i++) {
    const item = {};
    for (let j = 0; j < headers.length; j++) {
      item[headers[j]] = rows[i][j];
    }
    data.push(item);
  }
  return data;
}

function getSettingsObject() {
  const settingsRows = getSheetData('Settings');
  const settings = {};
  settingsRows.forEach(row => {
    if (row.Key) {
      settings[row.Key] = row.Value;
    }
  });
  return settings;
}

function getRoomsList() {
  const rows = getSheetData('Rooms');
  return rows.map(r => ({
    id: String(r.number),
    number: String(r.number),
    floor: Number(r.floor) || 1,
    type: r.type || 'มาตรฐาน',
    price: Number(r.price) || 0,
    commonFee: Number(r.commonFee) || 0,
    parkingFee: Number(r.parkingFee) || 0,
    licensePlate: r.licensePlate || '',
    otherFee: Number(r.otherFee) || 0,
    otherFeeRemark: r.otherFeeRemark || '',
    status: r.status || 'vacant',
    tenant: {
      name: r.tenantName || '',
      phone: r.tenantPhone || '',
      lineUserId: r.lineUserId || '',
      startDate: r.startDate || ''
    },
    lastElectricMeter: Number(r.lastElectricMeter) || 0,
    lastWaterMeter: Number(r.lastWaterMeter) || 0
  }));
}

function getBillsList() {
  const rows = getSheetData('Bills');
  return rows.map(b => ({
    id: String(b.id),
    roomNumber: String(b.roomNumber),
    month: b.month || '',
    createdAt: b.createdAt ? new Date(b.createdAt).toISOString() : new Date().toISOString(),
    dueDate: b.dueDate ? String(b.dueDate).substring(0, 10) : '',
    rent: Number(b.rent) || 0,
    prevElectricMeter: Number(b.prevElectricMeter) || 0,
    currElectricMeter: Number(b.currElectricMeter) || 0,
    electricUnits: Number(b.electricUnits) || 0,
    electricRate: Number(b.electricRate) || 8,
    electricAmount: Number(b.electricAmount) || 0,
    prevWaterMeter: Number(b.prevWaterMeter) || 0,
    currWaterMeter: Number(b.currWaterMeter) || 0,
    waterUnits: Number(b.waterUnits) || 0,
    waterRate: Number(b.waterRate) || 18,
    waterAmount: Number(b.waterAmount) || 0,
    commonFee: Number(b.commonFee) || 0,
    parkingFee: Number(b.parkingFee) || 0,
    licensePlate: b.licensePlate || '',
    otherFee: Number(b.otherFee) || 0,
    otherFeeRemark: b.otherFeeRemark || '',
    discount: Number(b.discount) || 0,
    totalAmount: Number(b.totalAmount) || 0,
    status: b.status || 'pending',
    paidAt: b.paidAt ? new Date(b.paidAt).toISOString() : null,
    lineSent: b.lineSent === true || b.lineSent === 'true',
    lineSentAt: b.lineSentAt ? new Date(b.lineSentAt).toISOString() : null
  }));
}

// ------------------------------------------------------------------------------
// 3. HTTP HANDLERS (doGet & doPost)
// ------------------------------------------------------------------------------

function createJsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  try {
    const action = e?.parameter?.action;

    if (action === 'getAll') {
      const settings = getSettingsObject();
      const rooms = getRoomsList();
      const bills = getBillsList();
      return createJsonResponse({
        success: true,
        data: { settings, rooms, bills }
      });
    }

    if (action === 'getBill') {
      const billId = e.parameter.id;
      const bills = getBillsList();
      const bill = bills.find(b => b.id === billId);
      if (!bill) return createJsonResponse({ success: false, error: 'ไม่พบบิล' });

      const rooms = getRoomsList();
      const room = rooms.find(r => r.number === bill.roomNumber);
      const settings = getSettingsObject();

      return createJsonResponse({
        success: true,
        data: { bill, room, settings }
      });
    }

    // Default status ping
    return createJsonResponse({
      success: true,
      message: 'Dormitory Management System Apps Script API is Running!',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return createJsonResponse({ success: false, error: err.toString() });
  }
}

function doPost(e) {
  try {
    let payload = null;
    if (e.postData && e.postData.contents) {
      try {
        payload = JSON.parse(e.postData.contents);
      } catch (err) {
        payload = e.parameter;
      }
    } else {
      payload = e.parameter;
    }

    // A. Check if this is a LINE Webhook event
    if (payload && payload.events && Array.isArray(payload.events)) {
      return handleLineWebhook(payload.events);
    }

    // B. Normal API Actions from Frontend
    const action = payload.action;

    if (action === 'saveRoom') {
      return handleSaveRoom(payload.data);
    }
    if (action === 'deleteRoom') {
      return handleDeleteRoom(payload.roomNumber);
    }
    if (action === 'saveBill') {
      return handleSaveBill(payload.data);
    }
    if (action === 'updateBillStatus') {
      return handleUpdateBillStatus(payload.id, payload.status);
    }
    if (action === 'deleteBill') {
      return handleDeleteBill(payload.id);
    }
    if (action === 'saveSettings') {
      return handleSaveSettings(payload.data);
    }
    if (action === 'sendLineBill') {
      return handleSendLineBill(payload.billId, payload.baseUrl);
    }
    if (action === 'batchSendLine') {
      return handleBatchSendLine(payload.baseUrl);
    }

    return createJsonResponse({ success: false, error: 'Unknown action: ' + action });
  } catch (err) {
    return createJsonResponse({ success: false, error: err.toString() });
  }
}

// ------------------------------------------------------------------------------
// 4. ACTION HANDLERS
// ------------------------------------------------------------------------------

function handleSaveRoom(room) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Rooms');
  const rows = sheet.getDataRange().getValues();
  const roomNumStr = String(room.number).trim();

  let targetRowIndex = -1;
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === roomNumStr) {
      targetRowIndex = i + 1; // 1-based index
      break;
    }
  }

  const tenant = room.tenant || {};
  const rowData = [
    roomNumStr,
    room.floor || 1,
    room.type || 'มาตรฐาน',
    Number(room.price) || 0,
    Number(room.commonFee) || 0,
    Number(room.parkingFee) || 0,
    room.licensePlate || '',
    Number(room.otherFee) || 0,
    room.otherFeeRemark || '',
    room.status || 'occupied',
    tenant.name || '',
    tenant.phone || '',
    tenant.lineUserId || '',
    tenant.startDate || '',
    Number(room.lastElectricMeter) || 0,
    Number(room.lastWaterMeter) || 0
  ];

  if (targetRowIndex > 0) {
    sheet.getRange(targetRowIndex, 1, 1, rowData.length).setValues([rowData]);
  } else {
    sheet.appendRow(rowData);
  }

  return createJsonResponse({ success: true, data: room });
}

function handleDeleteRoom(roomNumber) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Rooms');
  const rows = sheet.getDataRange().getValues();
  const roomNumStr = String(roomNumber).trim();

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === roomNumStr) {
      sheet.deleteRow(i + 1);
      return createJsonResponse({ success: true, message: 'ลบห้อง ' + roomNumber + ' เรียบร้อย' });
    }
  }
  return createJsonResponse({ success: false, error: 'ไม่พบห้องที่ต้องการลบ' });
}

function handleSaveBill(billData) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const billsSheet = ss.getSheetByName('Bills');
  const roomsSheet = ss.getSheetByName('Rooms');

  const settings = getSettingsObject();
  const rooms = getRoomsList();
  const room = rooms.find(r => r.number === String(billData.roomNumber));

  if (!room) {
    return createJsonResponse({ success: false, error: 'ไม่พบข้อมูลห้องพักนี้' });
  }

  const electricRate = Number(billData.electricRate) || Number(settings.electricRate) || 8;
  const waterRate = Number(billData.waterRate) || Number(settings.waterRate) || 18;

  const prevElec = Number(billData.prevElectricMeter || room.lastElectricMeter || 0);
  const currElec = Number(billData.currElectricMeter || 0);
  const elecUnits = Math.max(0, currElec - prevElec);
  const electricAmount = Math.round(elecUnits * electricRate);

  const prevWater = Number(billData.prevWaterMeter || room.lastWaterMeter || 0);
  const currWater = Number(billData.currWaterMeter || 0);
  const waterUnits = Math.max(0, currWater - prevWater);
  const waterAmount = Math.round(waterUnits * waterRate);

  const rent = Number(billData.rent || room.price || 0);
  const commonFee = Number(billData.commonFee !== undefined ? billData.commonFee : (room.commonFee || 0));
  const parkingFee = Number(billData.parkingFee !== undefined ? billData.parkingFee : (room.parkingFee || 0));
  const licensePlate = billData.licensePlate || room.licensePlate || '';
  const otherFee = Number(billData.otherFee !== undefined ? billData.otherFee : (room.otherFee || 0));
  const otherFeeRemark = billData.otherFeeRemark || room.otherFeeRemark || '';
  const discount = Number(billData.discount || 0);

  const totalAmount = Math.max(0, rent + electricAmount + waterAmount + commonFee + parkingFee + otherFee - discount);
  const monthStr = billData.month || new Date().toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
  const billId = billData.id || `BILL-${Date.now().toString().slice(-6)}-${billData.roomNumber}`;

  const rowData = [
    billId, String(billData.roomNumber), monthStr, new Date().toISOString(), billData.dueDate || '',
    rent, prevElec, currElec, elecUnits, electricRate, electricAmount,
    prevWater, currWater, waterUnits, waterRate, waterAmount,
    commonFee, parkingFee, licensePlate, otherFee, otherFeeRemark, discount, totalAmount,
    billData.status || 'pending', null, false, null
  ];

  // Insert at top of bills sheet (below header)
  billsSheet.insertRowBefore(2);
  billsSheet.getRange(2, 1, 1, rowData.length).setValues([rowData]);

  // Update room last meter readings
  const roomRows = roomsSheet.getDataRange().getValues();
  for (let i = 1; i < roomRows.length; i++) {
    if (String(roomRows[i][0]).trim() === String(billData.roomNumber).trim()) {
      roomsSheet.getRange(i + 1, 15).setValue(currElec); // lastElectricMeter
      roomsSheet.getRange(i + 1, 16).setValue(currWater); // lastWaterMeter
      break;
    }
  }

  return createJsonResponse({ success: true, data: { id: billId, totalAmount } });
}

function handleUpdateBillStatus(billId, status) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Bills');
  const rows = sheet.getDataRange().getValues();

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === String(billId).trim()) {
      sheet.getRange(i + 1, 24).setValue(status); // status column
      sheet.getRange(i + 1, 25).setValue(status === 'paid' ? new Date().toISOString() : ''); // paidAt
      return createJsonResponse({ success: true, message: 'อัปเดตสถานะบิลเรียบร้อย' });
    }
  }
  return createJsonResponse({ success: false, error: 'ไม่พบบิล' });
}

function handleDeleteBill(billId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Bills');
  const rows = sheet.getDataRange().getValues();

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === String(billId).trim()) {
      sheet.deleteRow(i + 1);
      return createJsonResponse({ success: true, message: 'ลบบิลเรียบร้อย' });
    }
  }
  return createJsonResponse({ success: false, error: 'ไม่พบบิล' });
}

function handleSaveSettings(settingsData) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Settings');
  const rows = sheet.getDataRange().getValues();

  Object.keys(settingsData).forEach(key => {
    let found = false;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] === key) {
        sheet.getRange(i + 1, 2).setValue(settingsData[key]);
        found = true;
        break;
      }
    }
    if (!found) {
      sheet.appendRow([key, settingsData[key], '']);
    }
  });

  return createJsonResponse({ success: true, data: settingsData });
}

// ------------------------------------------------------------------------------
// 5. LINE MESSAGING API & FLEX MESSAGE
// ------------------------------------------------------------------------------

function buildBillFlexMessage(dormSettings, bill, publicUrl) {
  const isPaid = bill.status === 'paid';
  const headerColor = isPaid ? '#10b981' : '#2563eb';
  const statusBadgeText = isPaid ? 'ชำระเงินเรียบร้อยแล้ว' : 'รอชำระเงิน';
  const statusBadgeColor = isPaid ? '#059669' : '#dc2626';

  const contents = [
    {
      type: "box",
      layout: "horizontal",
      contents: [
        { type: "text", text: "สถานะบิล:", size: "sm", color: "#64748b" },
        { type: "text", text: statusBadgeText, size: "sm", weight: "bold", color: statusBadgeColor, align: "end" }
      ]
    },
    { type: "separator", margin: "md" },
    {
      type: "box",
      layout: "vertical",
      margin: "md",
      spacing: "sm",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: "1. ค่าเช่าห้อง", size: "sm", color: "#334155" },
            { type: "text", text: `${Number(bill.rent).toLocaleString()} ฿`, size: "sm", align: "end", weight: "bold" }
          ]
        },
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: `2. ค่าไฟ (${bill.electricUnits} หน่วย @ ${bill.electricRate}฿)`, size: "xs", color: "#64748b" },
            { type: "text", text: `${Number(bill.electricAmount).toLocaleString()} ฿`, size: "sm", align: "end", weight: "bold" }
          ]
        },
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: `3. ค่าน้ำ (${bill.waterUnits} หน่วย @ ${bill.waterRate}฿)`, size: "xs", color: "#64748b" },
            { type: "text", text: `${Number(bill.waterAmount).toLocaleString()} ฿`, size: "sm", align: "end", weight: "bold" }
          ]
        },
        ...(bill.commonFee > 0 ? [{
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: "4. ค่าส่วนกลาง", size: "sm", color: "#334155" },
            { type: "text", text: `${Number(bill.commonFee).toLocaleString()} ฿`, size: "sm", align: "end", weight: "bold" }
          ]
        }] : []),
        ...(bill.parkingFee > 0 ? [{
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: `5. ค่าที่จอดรถ${bill.licensePlate ? ' (' + bill.licensePlate + ')' : ''}`, size: "sm", color: "#334155" },
            { type: "text", text: `${Number(bill.parkingFee).toLocaleString()} ฿`, size: "sm", align: "end", weight: "bold" }
          ]
        }] : []),
        ...(bill.otherFee > 0 ? [{
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: `6. อื่นๆ (${bill.otherFeeRemark || 'เพิ่มเติม'})`, size: "xs", color: "#64748b" },
            { type: "text", text: `${Number(bill.otherFee).toLocaleString()} ฿`, size: "sm", align: "end", weight: "bold" }
          ]
        }] : [])
      ]
    },
    { type: "separator", margin: "lg" },
    {
      type: "box",
      layout: "horizontal",
      margin: "md",
      contents: [
        { type: "text", text: "ยอดชำระสุทธิ", size: "md", weight: "bold", color: "#0f172a" },
        { type: "text", text: `${Number(bill.totalAmount).toLocaleString()} บาท`, size: "xl", weight: "bold", color: "#dc2626", align: "end" }
      ]
    },
    {
      type: "box",
      layout: "vertical",
      margin: "md",
      backgroundColor: "#f8fafc",
      paddingAll: "10px",
      cornerRadius: "8px",
      contents: [
        { type: "text", text: `📅 กำหนดชำระภายใน: ${bill.dueDate || 'ตามกำหนด'}`, size: "xs", color: "#475569" },
        { type: "text", text: `💳 พร้อมเพย์: ${dormSettings.promptpayId || '-'} (${dormSettings.promptpayName || 'ผู้ดูแลหอ'})`, size: "xs", color: "#475569", margin: "xs" }
      ]
    }
  ];

  const flexContents = {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: headerColor,
      paddingAll: "20px",
      contents: [
        { type: "text", text: dormSettings.dormName || "หอพักสุขสบาย", weight: "bold", color: "#ffffff", size: "lg" },
        { type: "text", text: `ใบแจ้งหนี้ค่าเช่าห้องพัก - ห้อง ${bill.roomNumber}`, color: "#ffffffcc", size: "sm", margin: "xs" },
        { type: "text", text: `ประจำรอบ: ${bill.month}`, color: "#ffffffee", size: "xs", margin: "xs" }
      ]
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "20px",
      contents: contents
    },
    footer: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: [
        ...(publicUrl ? [{
          type: "button",
          style: "primary",
          color: "#2563eb",
          action: {
            type: "uri",
            label: "ดูบิล & สแกน QR ชำระเงิน",
            uri: `${publicUrl}/tenant-portal.html?billId=${bill.id}`
          }
        }] : []),
        {
          type: "text",
          text: `ติดต่อสอบถาม: ${dormSettings.dormPhone || '-'}`,
          align: "center",
          size: "xxs",
          color: "#94a3b8"
        }
      ]
    }
  };

  return {
    type: "flex",
    altText: `ใบแจ้งหนี้ห้อง ${bill.roomNumber} ยอดชำระ ${Number(bill.totalAmount).toLocaleString()} บาท`,
    contents: flexContents
  };
}

function pushLineMessage(token, toUserId, messages) {
  const url = 'https://api.line.me/v2/bot/message/push';
  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Authorization': 'Bearer ' + token
    },
    payload: JSON.stringify({
      to: toUserId,
      messages: Array.isArray(messages) ? messages : [messages]
    }),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(url, options);
  const code = response.getResponseCode();
  const text = response.getContentText();
  if (code !== 200) {
    throw new Error(`LINE Push Error (${code}): ${text}`);
  }
  return true;
}

function handleSendLineBill(billId, baseUrl) {
  const settings = getSettingsObject();
  const token = settings.lineToken;
  if (!token) return createJsonResponse({ success: false, error: 'ยังไม่ได้ระบุ LINE Channel Access Token ในการตั้งค่า' });

  const bills = getBillsList();
  const bill = bills.find(b => b.id === billId);
  if (!bill) return createJsonResponse({ success: false, error: 'ไม่พบบิล' });

  const rooms = getRoomsList();
  const room = rooms.find(r => r.number === bill.roomNumber);
  if (!room || !room.tenant || !room.tenant.lineUserId) {
    return createJsonResponse({ success: false, error: `ห้อง ${bill.roomNumber} ยังไม่มี LINE User ID ของผู้เช่า` });
  }

  const flexMsg = buildBillFlexMessage(settings, bill, baseUrl);
  pushLineMessage(token, room.tenant.lineUserId, flexMsg);

  // Mark bill as lineSent
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const billsSheet = ss.getSheetByName('Bills');
  const rows = billsSheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === String(billId).trim()) {
      billsSheet.getRange(i + 1, 26).setValue(true);
      billsSheet.getRange(i + 1, 27).setValue(new Date().toISOString());
      break;
    }
  }

  return createJsonResponse({ success: true, message: `ส่งบิลห้อง ${bill.roomNumber} เข้า LINE สำเร็จเรียบร้อย!` });
}

function handleBatchSendLine(baseUrl) {
  const settings = getSettingsObject();
  const token = settings.lineToken;
  if (!token) return createJsonResponse({ success: false, error: 'ยังไม่ได้ระบุ LINE Channel Access Token ในการตั้งค่า' });

  const bills = getBillsList();
  const rooms = getRoomsList();

  let sentCount = 0;
  let failedCount = 0;
  const errors = [];

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const billsSheet = ss.getSheetByName('Bills');
  const rows = billsSheet.getDataRange().getValues();

  for (const bill of bills) {
    if (bill.status !== 'paid') {
      const room = rooms.find(r => r.number === bill.roomNumber);
      if (room?.tenant?.lineUserId) {
        try {
          const flexMsg = buildBillFlexMessage(settings, bill, baseUrl);
          pushLineMessage(token, room.tenant.lineUserId, flexMsg);

          // Update lineSent in sheet
          for (let i = 1; i < rows.length; i++) {
            if (String(rows[i][0]).trim() === String(bill.id).trim()) {
              billsSheet.getRange(i + 1, 26).setValue(true);
              billsSheet.getRange(i + 1, 27).setValue(new Date().toISOString());
              break;
            }
          }
          sentCount++;
        } catch (e) {
          failedCount++;
          errors.push(`ห้อง ${bill.roomNumber}: ${e.message}`);
        }
      }
    }
  }

  return createJsonResponse({
    success: true,
    message: `ส่งบิลสำเร็จ ${sentCount} ห้อง, ไม่สำเร็จ/ไม่มี LINE ID ${failedCount} ห้อง`,
    details: { sentCount, failedCount, errors }
  });
}

// ------------------------------------------------------------------------------
// 6. LINE WEBHOOK AUTO-BINDING (ผู้เช่าทักเลขห้อง หรือชื่อ -> ผูก LINE User ID ทันที)
// ------------------------------------------------------------------------------

function handleLineWebhook(events) {
  const settings = getSettingsObject();
  const token = settings.lineToken;
  if (!token) return createJsonResponse({ success: false, error: 'No token' });

  const rooms = getRoomsList();
  const bills = getBillsList();

  for (const event of events) {
    if (event.type === 'message' && event.message.type === 'text') {
      const userText = event.message.text.trim();
      const userId = event.source.userId;
      const replyToken = event.replyToken;

      let matchedRoom = null;
      let detectedName = '';

      // Match by room number digits
      const numbersInText = userText.match(/\d+/g);
      if (numbersInText) {
        for (const num of numbersInText) {
          const found = rooms.find(r => String(r.number).trim() === String(num).trim());
          if (found) {
            matchedRoom = found;
            const nameCandidate = userText.replace(/ห้อง|room|\d+/gi, '').trim();
            if (nameCandidate.length >= 2) detectedName = nameCandidate;
            break;
          }
        }
      }

      // Match by tenant name if not matched by number
      if (!matchedRoom) {
        const cleanUserText = userText.replace(/^(นาย|นาง|นางสาว|คุณ)\s*/i, '').replace(/\s+/g, '').toLowerCase();
        const words = userText.split(/[\s,.-]+/).map(w => w.trim()).filter(w => w.length >= 2);

        matchedRoom = rooms.find(r => {
          const rawName = (r.tenant?.name || '').trim();
          if (!rawName) return false;
          const tenantNameClean = rawName.replace(/^(นาย|นาง|นางสาว|คุณ)\s*/i, '').replace(/\s+/g, '').toLowerCase();
          if (tenantNameClean && (cleanUserText.includes(tenantNameClean) || tenantNameClean.includes(cleanUserText))) {
            return true;
          }
          return words.some(w => tenantNameClean.includes(w.toLowerCase()));
        });

        if (matchedRoom && userText.length >= 2) {
          detectedName = userText;
        }
      }

      let replyMessages = [];

      if (matchedRoom) {
        // Save Line User ID into Rooms Sheet
        const ss = SpreadsheetApp.getActiveSpreadsheet();
        const roomsSheet = ss.getSheetByName('Rooms');
        const rows = roomsSheet.getDataRange().getValues();

        for (let i = 1; i < rows.length; i++) {
          if (String(rows[i][0]).trim() === String(matchedRoom.number).trim()) {
            roomsSheet.getRange(i + 1, 10).setValue('occupied'); // status
            if (detectedName) {
              roomsSheet.getRange(i + 1, 11).setValue(detectedName); // tenantName
            }
            roomsSheet.getRange(i + 1, 13).setValue(userId); // lineUserId
            break;
          }
        }

        const tenantDisplayName = detectedName || matchedRoom.tenant?.name || 'คุณ';
        let successMsg = `🎉 ผูกบัญชี LINE สำเร็จเรียบร้อย!\n\n🏢 ${settings.dormName || 'หอพัก'}\n🚪 ห้องพัก: ห้อง ${matchedRoom.number}\n👤 ผู้เช่า: ${tenantDisplayName}\n\n✅ ระบบได้บันทึก LINE User ID ของคุณเข้าสู่ห้อง ${matchedRoom.number} ใน Google Sheet เรียบร้อยแล้ว ต่อจากนี้เมื่อเจ้าของหอพักออกบิลประจำเดือน ใบแจ้งหนี้จะถูกส่งเข้ามาในแชทนี้โดยอัตโนมัติครับ`;

        const pendingBill = bills.find(b => b.roomNumber === matchedRoom.number && b.status !== 'paid');
        if (pendingBill) {
          successMsg += `\n\n📌 คุณมียอดค้างชำระรอบ ${pendingBill.month}\n💰 ยอดสุทธิ: ${Number(pendingBill.totalAmount).toLocaleString()} บาท`;
        }

        replyMessages.push({ type: 'text', text: successMsg });

      } else {
        // Check if already bound
        const alreadyBound = rooms.find(r => r.tenant && r.tenant.lineUserId === userId);

        if (alreadyBound && (userText.includes('บิล') || userText.includes('ยอด') || userText.includes('ค่าเช่า') || userText.includes('จ่าย'))) {
          const pendingBill = bills.find(b => b.roomNumber === alreadyBound.number && b.status !== 'paid');
          if (pendingBill) {
            replyMessages.push({
              type: 'text',
              text: `📄 ยอดค้างชำระห้อง ${alreadyBound.number} (${pendingBill.month})\n💰 ยอดสุทธิ: ${Number(pendingBill.totalAmount).toLocaleString()} บาท\n📅 กำหนดชำระ: ${pendingBill.dueDate || 'ตามกำหนด'}`
            });
          } else {
            replyMessages.push({
              type: 'text',
              text: `✅ ห้อง ${alreadyBound.number} ไม่มีบิลค้างชำระในขณะนี้ครับ ขอบคุณครับ!`
            });
          }
        } else {
          replyMessages.push({
            type: 'text',
            text: `สวัสดีครับ/ค่ะ! ยินดีต้อนรับสู่ ${settings.dormName || 'ระบบหอพัก'}\n\n👉 เพื่อเปิดรับบิลค่าเช่าห้องพักอัตโนมัติ กรุณาพิมพ์ "เลขห้อง" ของคุณ เช่น:\n"ห้อง 101" หรือ "101"\n(หรือพิมพ์ "ห้อง 101 ชลิต พานเพ็ง")\n\nระบบจะทำการผูก LINE เข้าห้องพักให้ทันทีครับ!\n\n🔑 รหัส LINE User ID ของคุณคือ:\n${userId}`
          });
        }
      }

      // Reply using LINE reply API
      try {
        const replyUrl = 'https://api.line.me/v2/bot/message/reply';
        UrlFetchApp.fetch(replyUrl, {
          method: 'post',
          contentType: 'application/json',
          headers: { 'Authorization': 'Bearer ' + token },
          payload: JSON.stringify({
            replyToken: replyToken,
            messages: replyMessages
          }),
          muteHttpExceptions: true
        });
      } catch (err) {
        console.error('Reply error:', err);
      }
    }
  }

  return createJsonResponse({ success: true });
}
