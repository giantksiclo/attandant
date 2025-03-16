import { QRCodeData } from '../components/QRScanner';
import { AttendanceRecord } from './supabase';

/**
 * QR 코드 데이터가 유효한지 검증
 */
export const validateQRData = (data: any): data is QRCodeData => {
  if (!data) return false;
  
  // 필수 필드 확인
  if (!data.type || !data.location) {
    return false;
  }
  
  // 타입 확인
  if (!['check_in', 'check_out', 'overtime_end'].includes(data.type)) {
    return false;
  }
  
  // timestamp가 있다면 형식 확인 (선택적)
  if (data.timestamp) {
    try {
      new Date(data.timestamp);
    } catch {
      return false;
    }
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

/**
 * 두 시간 문자열 사이의 분 차이 계산 (HH:MM 형식)
 */
export const getMinutesDifference = (time1: string, time2: string): number => {
  const [hours1, minutes1] = time1.split(':').map(Number);
  const [hours2, minutes2] = time2.split(':').map(Number);
  
  return (hours2 * 60 + minutes2) - (hours1 * 60 + minutes1);
};

/**
 * 분을 시간:분 형식으로 변환
 */
export const formatMinutesToHoursAndMinutes = (minutes: number): string => {
  const absMinutes = Math.abs(minutes);
  const hours = Math.floor(absMinutes / 60);
  const mins = absMinutes % 60;
  
  if (hours === 0) {
    return `${mins}분`;
  } else if (mins === 0) {
    return `${hours}시간`;
  } else {
    return `${hours}시간 ${mins}분`;
  }
};

/**
 * 출근 기록에서 지각 여부 및 시간 확인
 */
export const checkLateStatus = (checkInTime: string, workStartTime: string): { isLate: boolean, minutesLate: number } => {
  // timestamp를 시간 문자열로 변환 (HH:MM 형식)
  const checkInDate = new Date(checkInTime);
  const checkInTimeStr = `${checkInDate.getHours().toString().padStart(2, '0')}:${checkInDate.getMinutes().toString().padStart(2, '0')}`;
  
  const minutesLate = getMinutesDifference(workStartTime, checkInTimeStr);
  
  return {
    isLate: minutesLate > 0,  // 양수면 지각
    minutesLate: minutesLate
  };
};

/**
 * 퇴근 기록에서 조퇴 여부 및 시간 확인
 */
export const checkEarlyLeaveStatus = (checkOutTime: string, workEndTime: string): { isEarlyLeave: boolean, minutesEarly: number } => {
  // timestamp를 시간 문자열로 변환 (HH:MM 형식)
  const checkOutDate = new Date(checkOutTime);
  const checkOutTimeStr = `${checkOutDate.getHours().toString().padStart(2, '0')}:${checkOutDate.getMinutes().toString().padStart(2, '0')}`;
  
  const minutesEarly = getMinutesDifference(checkOutTimeStr, workEndTime);
  
  return {
    isEarlyLeave: minutesEarly > 0,  // 양수면 조퇴
    minutesEarly: minutesEarly
  };
};

/**
 * 출근/퇴근 기록으로부터 근무 시간 계산
 */
export const calculateWorkHours = (
  checkInRecord: AttendanceRecord, 
  checkOutRecord: AttendanceRecord,
  lunchStartTime?: string,
  lunchEndTime?: string
): { totalMinutes: number, formattedTime: string } => {
  const checkInTime = new Date(checkInRecord.timestamp);
  const checkOutTime = new Date(checkOutRecord.timestamp);
  
  // 총 근무 시간 (밀리초)
  let totalWorkTimeMs = checkOutTime.getTime() - checkInTime.getTime();
  
  // 점심 시간이 설정되어 있고, 00:00이 아닌 경우 (점심 시간 있음)
  if (lunchStartTime && lunchEndTime && lunchStartTime !== "00:00" && lunchEndTime !== "00:00") {
    const today = new Date(checkInTime);
    today.setHours(0, 0, 0, 0);
    
    // 점심 시작 시간 설정
    const [lunchStartHour, lunchStartMinute] = lunchStartTime.split(':').map(Number);
    const lunchStart = new Date(today);
    lunchStart.setHours(lunchStartHour, lunchStartMinute, 0, 0);
    
    // 점심 종료 시간 설정
    const [lunchEndHour, lunchEndMinute] = lunchEndTime.split(':').map(Number);
    const lunchEnd = new Date(today);
    lunchEnd.setHours(lunchEndHour, lunchEndMinute, 0, 0);
    
    // 점심 시간 계산 (밀리초)
    const lunchTimeMs = lunchEnd.getTime() - lunchStart.getTime();
    
    // 점심 시간이 근무 시간 내에 있는 경우만 제외
    if (checkInTime <= lunchStart && checkOutTime >= lunchEnd) {
      totalWorkTimeMs -= lunchTimeMs;
    } else if (checkInTime <= lunchStart && checkOutTime > lunchStart && checkOutTime < lunchEnd) {
      // 점심 시간 도중 퇴근한 경우
      totalWorkTimeMs -= (checkOutTime.getTime() - lunchStart.getTime());
    } else if (checkInTime > lunchStart && checkInTime < lunchEnd && checkOutTime >= lunchEnd) {
      // 점심 시간 도중 출근한 경우
      totalWorkTimeMs -= (lunchEnd.getTime() - checkInTime.getTime());
    }
  }
  
  // 총 근무 시간 (분)
  const totalMinutes = Math.floor(totalWorkTimeMs / (1000 * 60));
  
  // 시간:분 형식으로 변환
  const formattedTime = formatMinutesToHoursAndMinutes(totalMinutes);
  
  return { totalMinutes, formattedTime };
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