import { QRCodeData } from '../components/QRScanner';

/**
 * QR 코드 데이터가 유효한지 검증
 */
export const validateQRData = (data: any): data is QRCodeData => {
  if (!data) return false;
  
  // 필수 필드 확인
  if (!data.type || !data.timestamp || !data.location) {
    return false;
  }
  
  // 타입 확인
  if (!['check_in', 'check_out', 'overtime_end'].includes(data.type)) {
    return false;
  }
  
  // 타임스탬프 형식 확인 (ISO 문자열)
  try {
    new Date(data.timestamp);
  } catch {
    return false;
  }
  
  return true;
};

/**
 * QR 코드 스캔 결과에서 한글 타입명 변환
 */
export const getRecordTypeLabel = (type: string): string => {
  switch (type) {
    case 'check_in':
      return '출근';
    case 'check_out':
      return '퇴근';
    case 'overtime_end':
      return '시간외근무 종료';
    default:
      return type;
  }
};

/**
 * 타임스탬프 포맷팅
 */
export const formatTimestamp = (timestamp: string): string => {
  try {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('ko-KR', { 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit'
    });
  } catch {
    return timestamp;
  }
}; 