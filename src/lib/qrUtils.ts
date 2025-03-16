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

// AttendanceSettings 타입 추가
type AttendanceSettings = {
  id: number;
  day_of_week: number; // 0: 일요일, 1: 월요일, ... 6: 토요일
  is_working_day: boolean; // 근무일 여부
  work_start_time: string; // "09:00"
  work_end_time: string; // "18:00"
  lunch_start_time: string; // "12:00"
  lunch_end_time: string; // "13:00"
  updated_at: string;
};

// 시간이 근무시간 내인지 확인하는 함수
export function isWithinWorkHours(timestamp: string, settingsArray: AttendanceSettings[]): boolean {
  const date = new Date(timestamp);
  const dayOfWeek = date.getDay(); // 0: 일요일, 1: 월요일, ... 6: 토요일
  
  // 해당 요일의 설정 찾기
  const settings = settingsArray.find(s => s.day_of_week === dayOfWeek);
  
  if (!settings || !settings.is_working_day) {
    // 해당 요일 설정이 없거나 근무일이 아님
    return false;
  }
  
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const currentTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  
  // 근무 시작/종료 시간 확인
  return currentTime >= settings.work_start_time && currentTime <= settings.work_end_time;
} 