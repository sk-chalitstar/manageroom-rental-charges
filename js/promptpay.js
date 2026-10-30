/**
 * Client-Side PromptPay EMVCo Generator
 * Generates official Thai PromptPay QR payload & renders directly in browser
 */

function crc16(data) {
  let crc = 0xFFFF;
  for (let i = 0; i < data.length; i++) {
    let x = ((crc >> 8) ^ data.charCodeAt(i)) & 0xFF;
    x ^= x >> 4;
    crc = ((crc << 8) ^ (x << 12) ^ (x << 5) ^ x) & 0xFFFF;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function formatTag(id, value) {
  const len = String(value.length).padStart(2, '0');
  return `${id}${len}${value}`;
}

function generatePromptPayPayload(target, amount = null) {
  if (!target) return '';
  const cleanTarget = String(target).replace(/[^0-9]/g, '');
  if (!cleanTarget) return '';

  let formattedTarget = '';
  let subTag = '';

  if (cleanTarget.length === 10) {
    formattedTarget = '0066' + cleanTarget.substring(1);
    subTag = '01';
  } else if (cleanTarget.length === 13) {
    formattedTarget = cleanTarget;
    subTag = '02';
  } else {
    formattedTarget = cleanTarget;
    subTag = '01';
  }

  const aid = formatTag('00', 'A000000677010111');
  const targetField = formatTag(subTag, formattedTarget);
  const merchantInfo = formatTag('29', aid + targetField);

  let payload = '';
  payload += formatTag('00', '01');
  payload += formatTag('01', amount && Number(amount) > 0 ? '12' : '11');
  payload += merchantInfo;
  payload += formatTag('53', '764'); // THB

  if (amount && Number(amount) > 0) {
    payload += formatTag('54', Number(amount).toFixed(2));
  }

  payload += formatTag('58', 'TH');
  const payloadToCrc = payload + '6304';
  const checksum = crc16(payloadToCrc);
  return payloadToCrc + checksum;
}

function generatePromptPayQRUrl(target, amount = null) {
  if (!target) return '';
  const payload = generatePromptPayPayload(target, amount);
  if (!payload) return '';
  return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(payload)}`;
}
