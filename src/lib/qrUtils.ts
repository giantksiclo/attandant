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

// AttendanceSettings 타입 재정의 (기존 타입 export로 변경)
export type AttendanceSettings = {
  id: number;
  day_of_week: number; // 0: 일요일, 1: 월요일, ... 6: 토요일
  is_working_day: boolean; // 근무일 여부
  work_start_time: string; // "09:00"
  work_end_time: string; // "18:00"
  lunch_start_time: string; // "12:00"
  lunch_end_time: string; // "13:00"
  updated_at: string;
};

// HolidayWork 타입 수정 (supabase의 타입과 일치)
export type HolidayWork = {
  id?: string;
  date: string;
  description: string;
  work_minutes?: number;
  extra_overtime_minutes?: number;
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

// 사용자별 공휴일 근무 시간 계산 함수
export const calculateUserHolidayWorkMinutes = (
  userId: string, 
  records: AttendanceRecord[], 
  holidayWorks: HolidayWork[]
) => {
  if (!holidayWorks || holidayWorks.length === 0 || !records || records.length === 0) {
    return { 
      totalMinutes: 0, 
      regularMinutes: 0, 
      exceededMinutes: 0 
    };
  }
  
  // 사용자의 출근 기록이 있는 날짜만 추출
  const userCheckInDates = records
    .filter(record => record.user_id === userId && record.record_type === 'check_in')
    .map(record => {
      const date = new Date(record.timestamp);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    });
  
  // 공휴일 중 사용자가 출근한 날짜에 대한 근무 시간 합산
  let totalHolidayWorkMinutes = 0;
  let regularHolidayWorkMinutes = 0; // 8시간 이하 근무 합계
  let exceededHolidayWorkMinutes = 0; // 8시간 초과분 합계
  const standardMinutes = 480; // 8시간 = 480분
  
  holidayWorks.forEach(holiday => {
    if (userCheckInDates.includes(holiday.date)) {
      let minutes = holiday.work_minutes || 0;
      
      // 추가 시간외 근무시간이 있으면 더함
      if (holiday.extra_overtime_minutes) {
        minutes += holiday.extra_overtime_minutes;
      }
      
      totalHolidayWorkMinutes += minutes;
      
      // 8시간(480분) 기준으로 나누어 계산
      if (minutes <= standardMinutes) {
        regularHolidayWorkMinutes += minutes;
      } else {
        regularHolidayWorkMinutes += standardMinutes;
        exceededHolidayWorkMinutes += (minutes - standardMinutes);
      }
    }
  });
  
  return {
    totalMinutes: totalHolidayWorkMinutes,
    regularMinutes: regularHolidayWorkMinutes,
    exceededMinutes: exceededHolidayWorkMinutes
  };
};

// 빈 값 체크 유틸리티 함수
const hasNoLunchTime = (setting: AttendanceSettings) => 
  setting.lunch_start_time === "00:00" || setting.lunch_end_time === "00:00";

// 월별 총 시간외 근무 시간 계산 함수
export const calculateMonthlyOvertimeMinutes = (
  records: AttendanceRecord[], 
  holidayWorks: HolidayWork[], 
  workSettings: AttendanceSettings[]
) => {
  if (!records || records.length === 0 || !workSettings || workSettings.length === 0) {
    return 0;
  }
  
  // 날짜별로 기록 그룹화
  const recordsByDate = records.reduce((acc, record) => {
    const date = new Date(record.timestamp);
    const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    
    if (!acc[dateKey]) {
      acc[dateKey] = [];
    }
    
    acc[dateKey].push(record);
    return acc;
  }, {} as Record<string, AttendanceRecord[]>);
  
  // 각 날짜별 시간외 근무 계산 후 합산 - 시간외 근무 종료 찍은 날만 계산하고 공휴일 제외
  let totalOvertimeMinutes = 0;
  
  Object.values(recordsByDate).forEach(dayRecords => {
    // 해당 날짜에 시간외 근무 종료 기록이 있는 경우에만 계산
    if (dayRecords.some(r => r.record_type === 'overtime_end')) {
      // 공휴일인지 확인
      const dateRecord = dayRecords[0]; // 해당 일자의 첫 번째 기록으로 날짜 확인
      const recordDate = new Date(dateRecord.timestamp);
      const dateStr = `${recordDate.getFullYear()}-${String(recordDate.getMonth() + 1).padStart(2, '0')}-${String(recordDate.getDate()).padStart(2, '0')}`;
      const isHoliday = holidayWorks.some(h => h.date === dateStr);
      
      // 공휴일이 아닌 경우에만 시간외 근무 시간 합산
      if (!isHoliday) {
        // 여기서는 getAttendanceStatus 대신 getAttendanceStatusForUtils 함수를 사용해야 함
        const status = getAttendanceStatusForUtils(dayRecords, workSettings);
        // 시간외 근무 시간이 있으면 합산
        if (status && status.overtime) {
          totalOvertimeMinutes += status.overtime.minutes;
        }
      }
    }
  });
  
  return totalOvertimeMinutes;
};

// 총 근무시간 계산 함수 (공휴일 및 휴무일 제외 근무 + 시간외 + 휴일 근무 합산)
export const calculateTotalWorkMinutes = (
  records: AttendanceRecord[],
  holidayWorks: HolidayWork[],
  workSettings: AttendanceSettings[],
  userId: string
) => {
  if (!records || records.length === 0 || !workSettings || workSettings.length === 0) {
    return 0;
  }
  
  // 1. 공휴일과 휴무일을 제외한 일반 근무시간 계산
  let regularWorkMinutes = 0;
  
  // 날짜별로 기록 그룹화
  const recordsByDate = records.reduce((acc, record) => {
    const date = new Date(record.timestamp);
    const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    
    if (!acc[dateKey]) {
      acc[dateKey] = [];
    }
    
    acc[dateKey].push(record);
    return acc;
  }, {} as Record<string, AttendanceRecord[]>);
  
  // 각 날짜별 근무시간 계산 (공휴일 및 휴무일 제외)
  Object.values(recordsByDate).forEach(dayRecords => {
    const checkInRecord = dayRecords.find(r => r.record_type === 'check_in');
    if (!checkInRecord) return;
    
    // 출근 날짜 정보
    const recordDate = new Date(checkInRecord.timestamp);
    
    // 1-1. 날짜가 공휴일인지 확인
    const dateStr = `${recordDate.getFullYear()}-${String(recordDate.getMonth() + 1).padStart(2, '0')}-${String(recordDate.getDate()).padStart(2, '0')}`;
    const isHoliday = holidayWorks.some(h => h.date === dateStr);
    
    // 1-2. 날짜가 휴무일인지 확인 (요일 설정 확인)
    const dayOfWeek = recordDate.getDay(); // 0: 일요일, 1: 월요일, ...
    const daySettings = workSettings.find(s => s.day_of_week === dayOfWeek);
    const isNonWorkingDay = !daySettings?.is_working_day;
    
    // 공휴일이 아니고 휴무일도 아닌 경우에만 일반 근무시간 계산
    if (!isHoliday && !isNonWorkingDay) {
      const status = getAttendanceStatusForUtils(dayRecords, workSettings);
      if (status && status.workHours) {
        regularWorkMinutes += status.workHours.totalMinutes;
      }
    }
  });
  
  // 2. 시간외 근무시간 (공휴일 제외)
  const overtimeMinutes = calculateMonthlyOvertimeMinutes(records, holidayWorks, workSettings);
  
  // 3 & 4. 휴일 근무시간 (8시간 이하 + 초과분)
  const holidayWorkStats = calculateUserHolidayWorkMinutes(userId, records, holidayWorks);
  
  // 합산하여 총 근무시간 계산
  return regularWorkMinutes + overtimeMinutes + holidayWorkStats.totalMinutes;
};

// getAttendanceStatus 대체 함수 (Dashboard.tsx의 getAttendanceStatus와 동일한 로직)
export const getAttendanceStatusForUtils = (records: AttendanceRecord[], workSettings: AttendanceSettings[]) => {
  if (!workSettings || workSettings.length === 0) return null;
  
  const checkInRecord = records.find(r => r.record_type === 'check_in');
  const checkOutRecord = records.find(r => r.record_type === 'check_out');
  const overtimeEndRecords = records
    .filter(r => r.record_type === 'overtime_end')
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  
  if (!checkInRecord) return null;
  
  // 출근 날짜의 요일 확인
  const checkInDate = new Date(checkInRecord.timestamp);
  const dayOfWeek = checkInDate.getDay();
  
  // 해당 요일의 근무시간 설정 가져오기
  const daySetting = workSettings.find(s => s.day_of_week === dayOfWeek);
  
  if (!daySetting) return null;
  
  let result: any = {};
  
  // 비근무일(휴일) 체크
  const isNonWorkingDay = !daySetting.is_working_day;
  
  // 퇴근시간 이후에 출근했는지 체크
  const checkInTime = new Date(checkInRecord.timestamp);
  const today = new Date(checkInTime);
  today.setHours(0, 0, 0, 0);
  
  // 근무 종료 시간 설정
  const [workEndHour, workEndMinute] = daySetting.work_end_time.split(':').map(Number);
  const workEndTime = new Date(today);
  workEndTime.setHours(workEndHour, workEndMinute, 0, 0);
  
  const isCheckInAfterWorkEnd = checkInTime > workEndTime;
  
  // 지각 확인 (근무일이고 퇴근시간 이후 출근한 경우가 아닐 때만)
  if (daySetting.is_working_day && !isCheckInAfterWorkEnd) {
    const lateStatus = checkLateStatus(checkInRecord.timestamp, daySetting.work_start_time);
    if (lateStatus.isLate && lateStatus.minutesLate > 0) {
      result.late = { 
        isLate: true, 
        minutesLate: lateStatus.minutesLate 
      };
    }
  }
  
  // 퇴근 또는 시간외 근무 종료 기록이 있는 경우
  const lastRecord = checkOutRecord || (overtimeEndRecords.length > 0 ? overtimeEndRecords[overtimeEndRecords.length - 1] : null);
  
  if (lastRecord) {
    // 조퇴 확인 (근무일이고 시간외근무 종료가 아닌 경우에만)
    if (daySetting.is_working_day && lastRecord.record_type === 'check_out') {
      const earlyLeaveStatus = checkEarlyLeaveStatus(lastRecord.timestamp, daySetting.work_end_time);
      if (earlyLeaveStatus.isEarlyLeave && earlyLeaveStatus.minutesEarly > 0) {
        result.earlyLeave = { 
          isEarlyLeave: true, 
          minutesEarly: earlyLeaveStatus.minutesEarly 
        };
      }
    }
    
    // 총 근무시간 계산
    const workHours = calculateWorkHours(
      checkInRecord, 
      lastRecord, 
      daySetting.lunch_start_time, 
      daySetting.lunch_end_time
    );
    
    result.workHours = workHours;
    
    // 시간외 근무 계산 (공휴일 제외)
    if (overtimeEndRecords.length > 0) {
      // 시간외 근무 종료 기록이 있는 경우
      if (isNonWorkingDay) {
        // 비근무일(주말/휴일이지만 공휴일로 지정되지 않은 경우)인 경우 전체 시간을 시간외 근무로 계산
        result.overtime = {
          minutes: workHours.totalMinutes,
          formatted: workHours.formattedTime
        };
        
        // 총 근무시간 설정
        result.totalWorkHours = {
          minutes: workHours.totalMinutes,
          formatted: workHours.formattedTime
        };
      } else {
        // 근무일인 경우, 정규 근무시간을 제외한 시간만 계산
        // 설정된 근무 시작/종료 시간
        const [workStartHour, workStartMinute] = daySetting.work_start_time.split(':').map(Number);
        const workStartTime = new Date(today);
        workStartTime.setHours(workStartHour, workStartMinute, 0, 0);
        
        // 점심 시작/종료 시간 설정
        const hasLunchTime = !hasNoLunchTime(daySetting);
        let lunchStartTime = null;
        let lunchEndTime = null;
        
        if (hasLunchTime) {
          const [lunchStartHour, lunchStartMinute] = daySetting.lunch_start_time.split(':').map(Number);
          lunchStartTime = new Date(today);
          lunchStartTime.setHours(lunchStartHour, lunchStartMinute, 0, 0);
          
          const [lunchEndHour, lunchEndMinute] = daySetting.lunch_end_time.split(':').map(Number);
          lunchEndTime = new Date(today);
          lunchEndTime.setHours(lunchEndHour, lunchEndMinute, 0, 0);
        }
        
        let totalOvertimeMinutes = 0;
        
        // 각 시간외근무 종료 기록에 대해 계산
        overtimeEndRecords.forEach(overtimeEndRecord => {
          const overtimeEndTime = new Date(overtimeEndRecord.timestamp);
          let overtimeMinutes = 0;
          
          // 퇴근시간 이후에 출근한 경우 -> 출근시간부터 시간외 근무 종료시간까지 전체 계산
          if (isCheckInAfterWorkEnd) {
            overtimeMinutes = Math.floor((overtimeEndTime.getTime() - checkInTime.getTime()) / (1000 * 60));
          } else {
            // 1. 정규 근무시간 이후 시간외 근무 계산
            if (overtimeEndTime > workEndTime) {
              // 정규 퇴근 시간 이후부터 시간외 근무 종료 시간까지 계산
              const lateMinutes = Math.floor((overtimeEndTime.getTime() - workEndTime.getTime()) / (1000 * 60));
              overtimeMinutes += lateMinutes;
            }
            
            // 2. 점심시간 동안의 시간외 근무 계산
            if (hasLunchTime && lunchStartTime && lunchEndTime) {
              // 점심시간에 시간외 근무를 했는지 확인
              if (overtimeEndTime >= lunchStartTime && overtimeEndTime <= lunchEndTime) {
                // 점심 시작 시간부터 시간외 근무 종료 시간까지 추가
                const lunchWorkMinutes = Math.floor((overtimeEndTime.getTime() - lunchStartTime.getTime()) / (1000 * 60));
                overtimeMinutes += lunchWorkMinutes;
              } else if (overtimeEndTime > lunchEndTime && checkInTime < lunchStartTime) {
                // 점심시간을 포함하여 시간외 근무한 경우, 점심시간 전체를 추가
                const lunchDurationMinutes = Math.floor((lunchEndTime.getTime() - lunchStartTime.getTime()) / (1000 * 60));
                overtimeMinutes += lunchDurationMinutes;
              }
            }
            
            // 3. 오전 근무 시작 전 시간외 근무 계산 (드문 경우)
            if (overtimeEndTime <= workStartTime) {
              const earlyMinutes = Math.floor((overtimeEndTime.getTime() - checkInTime.getTime()) / (1000 * 60));
              if (earlyMinutes > 0) {
                overtimeMinutes += earlyMinutes;
              }
            }
          }
          
          // 전체 시간외 근무 시간에 추가
          if (overtimeMinutes > 0) {
            totalOvertimeMinutes += overtimeMinutes;
          }
        });
        
        if (totalOvertimeMinutes > 0) {
          result.overtime = {
            minutes: totalOvertimeMinutes,
            formatted: formatMinutesToHoursAndMinutes(totalOvertimeMinutes)
          };
          
          // 총 근무시간에 시간외 근무시간 포함
          result.totalWorkHours = {
            minutes: workHours.totalMinutes + totalOvertimeMinutes,
            formatted: formatMinutesToHoursAndMinutes(workHours.totalMinutes + totalOvertimeMinutes)
          };
        } else {
          // 시간외 근무가 없으면 기본 근무시간이 총 근무시간
          result.totalWorkHours = {
            minutes: workHours.totalMinutes,
            formatted: workHours.formattedTime
          };
        }
      }
    } else {
      // 시간외 근무가 없으면 기본 근무시간이 총 근무시간
      result.totalWorkHours = {
        minutes: workHours.totalMinutes,
        formatted: workHours.formattedTime
      };
    }
  }
  
  return result;
};

export const formatQRDataWithTimestamp = (userId: string, type: string, location?: string) => {
  const timestamp = new Date().toISOString();
  return JSON.stringify({ userId, type, timestamp, location });
};

export const generateQRCode = async (_: string): Promise<string> => {
  // QR 코드 생성 로직 (실제 구현은 프로젝트에 맞게 조정)
  return "data:image/png;base64,..."; // 더미 QR 코드 데이터
};

export const showQRCode = (qrCodeData: string, element: HTMLElement) => {
  if (element) {
    const img = document.createElement('img');
    img.src = qrCodeData;
    element.innerHTML = '';
    element.appendChild(img);
  }
}; 