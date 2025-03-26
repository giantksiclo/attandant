import { AttendanceRecord, AttendanceSettings, HolidayWork } from './supabase';

// 분을 시간:분 형식으로 변환
export const formatMinutesToHoursAndMinutes = (totalMinutes: number): string => {
  if (totalMinutes <= 0) return '0:00';
  
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}:${minutes.toString().padStart(2, '0')}`;
};

// 분을 "10시간 47분" 형식으로 변환 (총 근무시간용)
export const formatMinutesToTimeOnly = (totalMinutes: number): string => {
  if (totalMinutes <= 0) return '0시간 0분';
  
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}시간 ${minutes}분`;
};

// 분을 "152분" 형식으로 변환 (그 외 항목용)
export const formatMinutesOnly = (totalMinutes: number): string => {
  if (totalMinutes <= 0) return '0분';
  return `${totalMinutes}분`;
};

// 분을 "647분 (10시간 47분)" 형식으로 변환
export const formatMinutesToHoursAndMinutesWithTotal = (totalMinutes: number): string => {
  if (totalMinutes <= 0) return '0분 (0시간 0분)';
  
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${totalMinutes}분 (${hours}시간 ${minutes}분)`;
};

// 시간 문자열이 점심 시간이 없는지 확인
export const hasNoLunchTime = (setting: AttendanceSettings): boolean => {
  return (
    setting.lunch_start_time === "00:00" || 
    setting.lunch_end_time === "00:00" || 
    !setting.lunch_start_time || 
    !setting.lunch_end_time
  );
};

// 조퇴 상태 확인
export const checkEarlyLeaveStatus = (
  checkOutTimestamp: string, 
  workEndTime: string
): { isEarlyLeave: boolean; minutesEarly: number } => {
  const checkOutTime = new Date(checkOutTimestamp);
  const checkOutHours = checkOutTime.getHours();
  const checkOutMinutes = checkOutTime.getMinutes();
  const checkOutTimeStr = `${checkOutHours.toString().padStart(2, '0')}:${checkOutMinutes.toString().padStart(2, '0')}`;
  
  if (checkOutTimeStr < workEndTime) {
    // 조퇴: 퇴근 시간이 설정된 근무 종료 시간보다 이름
    const [endHour, endMinute] = workEndTime.split(':').map(Number);
    const endTimeMinutes = endHour * 60 + endMinute;
    const checkOutTimeMinutes = checkOutHours * 60 + checkOutMinutes;
    
    return {
      isEarlyLeave: true,
      minutesEarly: endTimeMinutes - checkOutTimeMinutes
    };
  }
  
  return { isEarlyLeave: false, minutesEarly: 0 };
};

// 지각 상태 확인
export const checkLateStatus = (
  checkInTimestamp: string, 
  workStartTime: string
): { isLate: boolean; minutesLate: number } => {
  const checkInTime = new Date(checkInTimestamp);
  const checkInHours = checkInTime.getHours();
  const checkInMinutes = checkInTime.getMinutes();
  const checkInTimeStr = `${checkInHours.toString().padStart(2, '0')}:${checkInMinutes.toString().padStart(2, '0')}`;
  
  if (checkInTimeStr > workStartTime) {
    // 지각: 출근 시간이 설정된 근무 시작 시간보다 늦음
    const [startHour, startMinute] = workStartTime.split(':').map(Number);
    const startTimeMinutes = startHour * 60 + startMinute;
    const checkInTimeMinutes = checkInHours * 60 + checkInMinutes;
    
    return {
      isLate: true,
      minutesLate: checkInTimeMinutes - startTimeMinutes
    };
  }
  
  return { isLate: false, minutesLate: 0 };
};

/**
 * 출근/퇴근 기록으로부터 근무 시간 계산
 * 출근부터 퇴근까지의 모든 시간을 합산 (점심시간 제외)
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
  
  return {
    totalMinutes,
    formattedTime: formatMinutesToHoursAndMinutes(totalMinutes)
  };
};

/**
 * 시간외 근무 시간 계산
 * 1. 근무일: 
 *    a. 점심시간에 시간외 근무 종료시간 입력 -> 점심시간 시작부터 종료시간까지
 *    b. 근무종료시간 이후 시간외 근무 종료시간 입력 -> 근무종료시간부터 시간외 근무 종료시간까지
 *    c. 근무시작시간 이전 시간외 근무 종료시간 입력 -> 출근시간부터 시간외 근무 종료시간까지
 *    d. 근무종료시간 이후에 출근한 경우 -> 출근시간부터 시간외 근무 종료시간까지
 *    e. 야간 오프인 경우 -> 19:00부터 시간외 근무 종료시간까지
 * 2. 휴무일: 출근부터 퇴근까지 모든 시간
 */
export const calculateOvertimeMinutes = (
  dayRecords: AttendanceRecord[],
  daySetting: AttendanceSettings,
  isNonWorkingDay: boolean
): { totalMinutes: number, lunchOvertimeMinutes: number } => {
  // 출근 기록 찾기
  const checkInRecord = dayRecords.find(r => r.record_type === 'check_in');
  if (!checkInRecord) return { totalMinutes: 0, lunchOvertimeMinutes: 0 };
  
  // 시간외 근무 종료 기록 찾기
  const overtimeEndRecords = dayRecords.filter(r => r.record_type === 'overtime_end');
  if (overtimeEndRecords.length === 0) return { totalMinutes: 0, lunchOvertimeMinutes: 0 };
  
  // 휴무일인 경우, 출근부터 퇴근까지 모든 시간을
  // 시간외 근무로 계산
  if (isNonWorkingDay) {
    const lastRecord = dayRecords
      .filter(r => r.record_type === 'check_out' || r.record_type === 'overtime_end')
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
    
    if (lastRecord) {
      const workHours = calculateWorkHours(
        checkInRecord, 
        lastRecord,
        daySetting.lunch_start_time, 
        daySetting.lunch_end_time
      );
      return { 
        totalMinutes: workHours.totalMinutes, 
        lunchOvertimeMinutes: 0 // 휴무일에는 점심시간 개념이 없음
      };
    }
    return { totalMinutes: 0, lunchOvertimeMinutes: 0 };
  }
  
  // 근무일인 경우 시간외 근무 계산
  const checkInTime = new Date(checkInRecord.timestamp);
  const today = new Date(checkInTime);
  today.setHours(0, 0, 0, 0);
  
  // 설정된 근무 시작/종료 시간
  const [workStartHour, workStartMinute] = daySetting.work_start_time.split(':').map(Number);
  const workStartTime = new Date(today);
  workStartTime.setHours(workStartHour, workStartMinute, 0, 0);
  
  const [workEndHour, workEndMinute] = daySetting.work_end_time.split(':').map(Number);
  const workEndTime = new Date(today);
  workEndTime.setHours(workEndHour, workEndMinute, 0, 0);
  
  // 점심 시작/종료 시간 설정
  const hasLunchTime = !hasNoLunchTime(daySetting);
  let lunchStartTime: Date | null = null;
  let lunchEndTime: Date | null = null;
  
  if (hasLunchTime) {
    const [lunchStartHour, lunchStartMinute] = daySetting.lunch_start_time.split(':').map(Number);
    lunchStartTime = new Date(today);
    lunchStartTime.setHours(lunchStartHour, lunchStartMinute, 0, 0);
    
    const [lunchEndHour, lunchEndMinute] = daySetting.lunch_end_time.split(':').map(Number);
    lunchEndTime = new Date(today);
    lunchEndTime.setHours(lunchEndHour, lunchEndMinute, 0, 0);
  }
  
  let totalOvertimeMinutes = 0;
  let lunchOvertimeMinutes = 0;

  // 퇴근시간 이후에 출근했는지 체크
  const isCheckInAfterWorkEnd = checkInTime > workEndTime;
  
  // 각 시간외 근무 종료 기록에 대해 계산
  overtimeEndRecords.forEach(overtimeEndRecord => {
    const overtimeEndTime = new Date(overtimeEndRecord.timestamp);
    let recordOvertimeMinutes = 0;
    let recordLunchOvertimeMinutes = 0;
    
    // e. 야간 오프인 경우 -> 19:00부터 시간외 근무 종료시간까지
    if (overtimeEndRecord.night_off_time) {
      const nightOffStartTime = new Date(overtimeEndRecord.night_off_time);
      recordOvertimeMinutes = Math.floor((overtimeEndTime.getTime() - nightOffStartTime.getTime()) / (1000 * 60));
    }
    // d. 근무종료시간 이후에 출근한 경우 -> 출근시간부터 시간외 근무 종료시간까지
    else if (isCheckInAfterWorkEnd) {
      recordOvertimeMinutes = Math.floor((overtimeEndTime.getTime() - checkInTime.getTime()) / (1000 * 60));
    } else {
      // a. 점심시간에 시간외 근무 종료시간 입력 -> 점심시간 시작부터 종료시간까지
      if (hasLunchTime && lunchStartTime && lunchEndTime) {
        if (overtimeEndTime >= lunchStartTime && overtimeEndTime <= lunchEndTime) {
          // 점심 시작 시간부터 시간외 근무 종료 시간까지 추가
          recordLunchOvertimeMinutes = Math.floor((overtimeEndTime.getTime() - lunchStartTime.getTime()) / (1000 * 60));
          recordOvertimeMinutes += recordLunchOvertimeMinutes;
        }
      }
      
      // b. 근무종료시간 이후 시간외 근무 종료시간 입력 -> 근무종료시간부터 시간외 근무 종료시간까지
      if (overtimeEndTime > workEndTime) {
        // 정규 퇴근 시간 이후부터 시간외 근무 종료 시간까지 계산
        recordOvertimeMinutes += Math.floor((overtimeEndTime.getTime() - workEndTime.getTime()) / (1000 * 60));
      }
      
      // c. 근무시작시간 이전 시간외 근무 종료시간 입력 -> 출근시간부터 시간외 근무 종료시간까지
      if (overtimeEndTime <= workStartTime) {
        recordOvertimeMinutes += Math.floor((overtimeEndTime.getTime() - checkInTime.getTime()) / (1000 * 60));
      }
    }
    
    totalOvertimeMinutes += recordOvertimeMinutes;
    lunchOvertimeMinutes += recordLunchOvertimeMinutes;
  });
  
  return {
    totalMinutes: totalOvertimeMinutes,
    lunchOvertimeMinutes: lunchOvertimeMinutes
  };
};

/**
 * 기본 근무 시간 계산 (설정된 근무 시간에 제한)
 * 1. 출근 시간이 설정된 근무 시작 시간보다 이른 경우: 설정된 근무 시작 시간을 시작점으로 사용
 * 2. 출근 시간이 설정된 근무 시작 시간보다 늦은 경우: 실제 출근 시간을 시작점으로 사용
 * 3. 퇴근 시간이 설정된 근무 종료 시간보다 이른 경우: 실제 퇴근 시간을 종료점으로 사용
 * 4. 퇴근 시간이 설정된 근무 종료 시간보다 늦은 경우: 설정된 근무 종료 시간을 종료점으로 사용
 */
export const calculateRegularWorkHours = (
  checkInRecord: AttendanceRecord, 
  checkOutRecord: AttendanceRecord,
  workStartTime: string,
  workEndTime: string,
  lunchStartTime?: string,
  lunchEndTime?: string
): { totalMinutes: number, formattedTime: string } => {
  const checkInTime = new Date(checkInRecord.timestamp);
  const checkOutTime = new Date(checkOutRecord.timestamp);
  
  // 기준 날짜 설정 (출근 날짜 기준)
  const today = new Date(checkInTime);
  today.setHours(0, 0, 0, 0);
  
  // 설정된 근무 시작/종료 시간
  const [workStartHour, workStartMinute] = workStartTime.split(':').map(Number);
  const settingStartTime = new Date(today);
  settingStartTime.setHours(workStartHour, workStartMinute, 0, 0);
  
  const [workEndHour, workEndMinute] = workEndTime.split(':').map(Number);
  const settingEndTime = new Date(today);
  settingEndTime.setHours(workEndHour, workEndMinute, 0, 0);
  
  // 시작 시간 조정: 실제 출근 시간과 설정된 근무 시작 시간 중 늦은 시간 선택
  const effectiveStartTime = checkInTime < settingStartTime ? settingStartTime : checkInTime;
  
  // 종료 시간 조정: 실제 퇴근 시간과 설정된 근무 종료 시간 중 이른 시간 선택
  const effectiveEndTime = checkOutTime > settingEndTime ? settingEndTime : checkOutTime;
  
  // 종료 시간이 시작 시간보다 이른 경우 0 반환
  if (effectiveEndTime <= effectiveStartTime) {
    return {
      totalMinutes: 0,
      formattedTime: '0:00'
    };
  }
  
  // 총 근무 시간 (밀리초)
  let totalWorkTimeMs = effectiveEndTime.getTime() - effectiveStartTime.getTime();
  
  // 점심 시간이 설정되어 있고, 00:00이 아닌 경우 (점심 시간 있음)
  if (lunchStartTime && lunchEndTime && lunchStartTime !== "00:00" && lunchEndTime !== "00:00") {
    const [lunchStartHour, lunchStartMinute] = lunchStartTime.split(':').map(Number);
    const lunchStart = new Date(today);
    lunchStart.setHours(lunchStartHour, lunchStartMinute, 0, 0);
    
    const [lunchEndHour, lunchEndMinute] = lunchEndTime.split(':').map(Number);
    const lunchEnd = new Date(today);
    lunchEnd.setHours(lunchEndHour, lunchEndMinute, 0, 0);
    
    // 점심 시간 계산 (밀리초)
    const lunchTimeMs = lunchEnd.getTime() - lunchStart.getTime();
    
    // 점심 시간이 근무 시간 내에 있는 경우만 제외
    if (effectiveStartTime <= lunchStart && effectiveEndTime >= lunchEnd) {
      totalWorkTimeMs -= lunchTimeMs;
    } else if (effectiveStartTime <= lunchStart && effectiveEndTime > lunchStart && effectiveEndTime < lunchEnd) {
      // 점심 시간 도중 퇴근한 경우
      totalWorkTimeMs -= (effectiveEndTime.getTime() - lunchStart.getTime());
    } else if (effectiveStartTime > lunchStart && effectiveStartTime < lunchEnd && effectiveEndTime >= lunchEnd) {
      // 점심 시간 도중 출근한 경우
      totalWorkTimeMs -= (lunchEnd.getTime() - effectiveStartTime.getTime());
    }
  }
  
  // 총 근무 시간 (분)
  const totalMinutes = Math.floor(totalWorkTimeMs / (1000 * 60));
  
  return {
    totalMinutes,
    formattedTime: formatMinutesToHoursAndMinutes(totalMinutes)
  };
};

/**
 * 출결 상태 종합 계산
 */
export const calculateAttendanceStatus = (
  dayRecords: AttendanceRecord[],
  workSettings: AttendanceSettings[],
  isHoliday: boolean
) => {
  if (!dayRecords || dayRecords.length === 0 || !workSettings || workSettings.length === 0) {
    return null;
  }
  
  // 출근 기록 확인
  const checkInRecord = dayRecords.find(r => r.record_type === 'check_in');
  if (!checkInRecord) return null;
  
  // 퇴근 기록 (시간외 근무 종료 포함, 가장 늦은 시간으로 선택)
  const lastRecord = dayRecords
    .filter(r => r.record_type === 'check_out' || r.record_type === 'overtime_end')
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
    
  if (!lastRecord) return null;
  
  // 시간외 근무 종료 기록만 필터링
  const overtimeEndRecords = dayRecords.filter(r => r.record_type === 'overtime_end');
  
  // 날짜 및 요일 정보
  const recordDate = new Date(checkInRecord.timestamp);
  const dayOfWeek = recordDate.getDay(); // 0: 일요일, 1: 월요일, ...
  
  // 해당 요일의 근무 설정 가져오기
  const daySetting = workSettings.find(s => s.day_of_week === dayOfWeek) || workSettings[0];
  
  // 근무일 여부 확인
  const isNonWorkingDay = !daySetting.is_working_day;
  
  // 결과 객체 초기화
  const result = {
    checkInTime: new Date(checkInRecord.timestamp),
    lastActivityTime: new Date(lastRecord.timestamp),
    isNonWorkingDay,
    isHoliday,
    isEarlyLeave: false,
    minutesEarly: 0,
    workHours: { totalMinutes: 0, formattedTime: '0:00' },
    overtime: { minutes: 0, formatted: '0:00' },
    dayOfWeek,
    late: { isLate: false, minutesLate: 0 },
    earlyLeave: { isEarlyLeave: false, minutesEarly: 0 },
    totalWorkHours: { totalMinutes: 0, formattedTime: '0:00' },
    holidayWork: null
  };
  
  // 조퇴 확인 (근무일이고 시간외근무 종료가 아닌 경우에만)
  if (daySetting.is_working_day && lastRecord.record_type === 'check_out') {
    const earlyLeaveStatus = checkEarlyLeaveStatus(lastRecord.timestamp, daySetting.work_end_time);
    if (earlyLeaveStatus.isEarlyLeave && earlyLeaveStatus.minutesEarly > 0) {
      result.isEarlyLeave = true;
      result.minutesEarly = earlyLeaveStatus.minutesEarly;
    }
  }
  
  // 근무 시간 계산 (변경: 기본 근무시간 계산 함수 사용)
  result.workHours = calculateRegularWorkHours(
    checkInRecord, 
    lastRecord, 
    daySetting.work_start_time,
    daySetting.work_end_time,
    daySetting.lunch_start_time, 
    daySetting.lunch_end_time
  );
  
  // 총 근무시간 (출근부터 퇴근까지 실제 시간)
  const actualWorkHours = calculateWorkHours(
    checkInRecord,
    lastRecord,
    daySetting.lunch_start_time,
    daySetting.lunch_end_time
  );
  
  // 시간외 근무 계산 (공휴일 제외)
  let overtimeResult = { totalMinutes: 0, lunchOvertimeMinutes: 0 };
  if (!isHoliday && overtimeEndRecords.length > 0) {
    overtimeResult = calculateOvertimeMinutes(dayRecords, daySetting, isNonWorkingDay);
    result.overtime = {
      minutes: overtimeResult.totalMinutes,
      formatted: formatMinutesToHoursAndMinutes(overtimeResult.totalMinutes)
    };
  }
  
  // 점심시간 중 시간외 근무가 있을 경우 총 근무시간에 추가
  // 총 근무 시간 = 실제 근무 시간(점심 제외) + 점심시간 중 시간외 근무 시간
  const totalMinutes = actualWorkHours.totalMinutes + overtimeResult.lunchOvertimeMinutes;
  
  // 총 근무 시간 초기화
  result.totalWorkHours = {
    totalMinutes: totalMinutes,
    formattedTime: formatMinutesToHoursAndMinutes(totalMinutes)
  };
  
  // 퇴근시간 이후에 출근했는지 체크
  const checkInTime = new Date(checkInRecord.timestamp);
  const today = new Date(checkInTime);
  today.setHours(0, 0, 0, 0);
  
  // 근무 종료 시간 설정
  const [workEndHour, workEndMinute] = daySetting.work_end_time.split(':').map(Number);
  const workEndTime = new Date(today);
  workEndTime.setHours(workEndHour, workEndMinute, 0, 0);
  
  const isCheckInAfterWorkEnd = checkInTime > workEndTime;
  
  // 지각 확인 - 퇴근시간 이후 출근한 경우에는 지각으로 계산하지 않음
  if (daySetting.is_working_day && !isCheckInAfterWorkEnd) {
    const lateStatus = checkLateStatus(checkInRecord.timestamp, daySetting.work_start_time);
    if (lateStatus.isLate) {
      result.late = lateStatus;
    }
  }
  
  return result;
};

/**
 * 월별 일반 근무 시간 계산 (공휴일/휴무일 제외)
 */
export const calculateMonthlyRegularWorkMinutes = (
  records: AttendanceRecord[],
  holidayDates: string[],
  workSettings: AttendanceSettings[]
): number => {
  if (!records || records.length === 0 || !workSettings || workSettings.length === 0) {
    return 0;
  }
  
  // 날짜별로 기록 그룹화
  const recordsByDate = records.reduce((acc, record) => {
    const date = new Date(record.timestamp);
    const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    
    if (!acc[dateKey]) {
      acc[dateKey] = [];
    }
    
    acc[dateKey].push(record);
    return acc;
  }, {} as Record<string, AttendanceRecord[]>);
  
  // 일반 근무시간 합산 (공휴일 및 휴무일 제외)
  let totalRegularMinutes = 0;
  
  Object.entries(recordsByDate).forEach(([dateStr, dayRecords]) => {
    // 출근 기록 확인
    const checkInRecord = dayRecords.find(r => r.record_type === 'check_in');
    if (!checkInRecord) return;
    
    // 퇴근 기록 확인
    const checkOutRecord = dayRecords.find(r => r.record_type === 'check_out');
    if (!checkOutRecord) return;
    
    // 날짜가 공휴일인지 확인
    const isHoliday = holidayDates.includes(dateStr);
    
    // 날짜가 휴무일인지 확인 (요일 설정 확인)
    const checkInDate = new Date(checkInRecord.timestamp);
    const dayOfWeek = checkInDate.getDay();
    const daySetting = workSettings.find(s => s.day_of_week === dayOfWeek) || workSettings[0];
    const isNonWorkingDay = !daySetting.is_working_day;
    
    // 공휴일이 아니고 휴무일도 아닌 경우에만 일반 근무시간 계산
    if (!isHoliday && !isNonWorkingDay) {
      const workHours = calculateWorkHours(
        checkInRecord, 
        checkOutRecord, 
        daySetting.lunch_start_time, 
        daySetting.lunch_end_time
      );
      totalRegularMinutes += workHours.totalMinutes;
    }
  });
  
  return totalRegularMinutes;
};

/**
 * 월별 시간외 근무 시간 계산 (공휴일 제외)
 */
export const calculateMonthlyOvertimeMinutes = (
  records: AttendanceRecord[],
  holidayDates: string[],
  workSettings: AttendanceSettings[]
): number => {
  if (!records || records.length === 0 || !workSettings || workSettings.length === 0) {
    return 0;
  }
  
  // 날짜별로 기록 그룹화
  const recordsByDate = records.reduce((acc, record) => {
    const date = new Date(record.timestamp);
    const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    
    if (!acc[dateKey]) {
      acc[dateKey] = [];
    }
    
    acc[dateKey].push(record);
    return acc;
  }, {} as Record<string, AttendanceRecord[]>);
  
  // 시간외 근무 합산 (공휴일 제외)
  let totalOvertimeMinutes = 0;
  
  Object.entries(recordsByDate).forEach(([dateStr, dayRecords]) => {
    // 해당 날짜에 시간외 근무 종료 기록이 있는지 확인
    const hasOvertimeEnd = dayRecords.some(r => r.record_type === 'overtime_end');
    if (!hasOvertimeEnd) return;
    
    // 공휴일인지 확인
    const isHoliday = holidayDates.includes(dateStr);
    if (isHoliday) return; // 공휴일 제외
    
    // 출근 기록 확인
    const checkInRecord = dayRecords.find(r => r.record_type === 'check_in');
    if (!checkInRecord) return;
    
    // 날짜가 휴무일인지 확인 (요일 설정 확인)
    const checkInDate = new Date(checkInRecord.timestamp);
    const dayOfWeek = checkInDate.getDay();
    const daySetting = workSettings.find(s => s.day_of_week === dayOfWeek) || workSettings[0];
    const isNonWorkingDay = !daySetting.is_working_day;
    
    // 시간외 근무 계산
    const overtimeMinutes = calculateOvertimeMinutes(dayRecords, daySetting, isNonWorkingDay);
    totalOvertimeMinutes += overtimeMinutes.totalMinutes;
  });
  
  return totalOvertimeMinutes;
};

/**
 * 공휴일 근무 시간 계산
 * 1. 8시간 이하 부분 (regularMinutes)
 * 2. 8시간 초과 부분 (exceededMinutes)
 * 3. 근로자 직접 입력 추가 시간 (extraMinutes)
 */
export const calculateHolidayWorkMinutes = (
  userId: string,
  records: AttendanceRecord[],
  holidayWorks: HolidayWork[]
): { 
  totalMinutes: number, 
  regularMinutes: number, 
  exceededMinutes: number,
  extraMinutes: number 
} => {
  if (!holidayWorks || holidayWorks.length === 0 || !records || records.length === 0) {
    return { 
      totalMinutes: 0, 
      regularMinutes: 0, 
      exceededMinutes: 0,
      extraMinutes: 0
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
  let extraOvertimeMinutes = 0; // 직접 입력한 추가 시간외 근무
  const standardMinutes = 480; // 8시간 = 480분
  
  holidayWorks.forEach(holiday => {
    if (userCheckInDates.includes(holiday.date)) {
      // 관리자가 설정한 근무 시간
      let minutes = holiday.work_minutes || 0;
      
      // 직접 입력한 추가 시간외 근무시간
      if (holiday.extra_overtime_minutes) {
        extraOvertimeMinutes += holiday.extra_overtime_minutes;
      }
      
      // 8시간(480분) 기준으로 나누어 계산
      if (minutes <= standardMinutes) {
        regularHolidayWorkMinutes += minutes;
      } else {
        regularHolidayWorkMinutes += standardMinutes;
        exceededHolidayWorkMinutes += (minutes - standardMinutes);
      }
      
      totalHolidayWorkMinutes += minutes + (holiday.extra_overtime_minutes || 0);
    }
  });
  
  return {
    totalMinutes: totalHolidayWorkMinutes,
    regularMinutes: regularHolidayWorkMinutes,
    exceededMinutes: exceededHolidayWorkMinutes,
    extraMinutes: extraOvertimeMinutes
  };
};

/**
 * 월별 총 근무 시간 계산 (일반 근무 + 시간외 근무 + 공휴일 근무)
 */
export const calculateTotalWorkMinutes = (
  userId: string,
  records: AttendanceRecord[],
  holidayWorks: HolidayWork[],
  workSettings: AttendanceSettings[]
): {
  totalMinutes: number,
  regularWorkMinutes: number,
  overtimeMinutes: number,
  holidayRegularMinutes: number,
  holidayExceededMinutes: number,
  holidayExtraMinutes: number
} => {
  if (!records || records.length === 0 || !workSettings || workSettings.length === 0) {
    return {
      totalMinutes: 0,
      regularWorkMinutes: 0,
      overtimeMinutes: 0,
      holidayRegularMinutes: 0,
      holidayExceededMinutes: 0,
      holidayExtraMinutes: 0
    };
  }
  
  // 공휴일 날짜 목록 추출
  const holidayDates = holidayWorks.map(h => h.date);
  
  // 1. 일반 근무 시간 (공휴일 및 휴무일 제외)
  const regularWorkMinutes = calculateMonthlyRegularWorkMinutes(records, holidayDates, workSettings);
  
  // 2. 시간외 근무 시간 (공휴일 제외)
  const overtimeMinutes = calculateMonthlyOvertimeMinutes(records, holidayDates, workSettings);
  
  // 3. 공휴일 근무 시간
  const holidayWorkStats = calculateHolidayWorkMinutes(userId, records, holidayWorks);
  
  // 총 근무 시간 합산
  const totalMinutes = regularWorkMinutes + overtimeMinutes + 
                       holidayWorkStats.regularMinutes + holidayWorkStats.exceededMinutes + 
                       holidayWorkStats.extraMinutes;
  
  return {
    totalMinutes,
    regularWorkMinutes,
    overtimeMinutes,
    holidayRegularMinutes: holidayWorkStats.regularMinutes,
    holidayExceededMinutes: holidayWorkStats.exceededMinutes,
    holidayExtraMinutes: holidayWorkStats.extraMinutes
  };
};

// 현재 시간이 근무 시간 내인지 확인하는 함수
export const isWithinWorkHours = (timestamp: string, settingsArray: AttendanceSettings[]): boolean => {
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
}; 