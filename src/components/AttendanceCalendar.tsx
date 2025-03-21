import React, { useState, useMemo } from 'react';
import { type AttendanceRecord, type AttendanceSettings, type HolidayWork } from '../lib/supabase';
import { 
  formatMinutesToHoursAndMinutes, 
  calculateWorkHours, 
  checkLateStatus,
  calculateOvertimeMinutes
} from '../lib/timeCalculationUtils';

interface AttendanceCalendarProps {
  records: AttendanceRecord[];
  year?: number;
  month?: number;
  workSettings?: AttendanceSettings[];
  holidayWorks?: HolidayWork[];
}

interface DayAttendanceStatus {
  isLate?: boolean;
  minutesLate?: number;
  isEarlyLeave?: boolean;
  minutesEarly?: number;
  overtimeMinutes?: number;
  overtimeFormatted?: string;
  workHours?: {
    totalMinutes: number;
    formattedTime: string;
  };
  totalWorkHours?: {
    totalMinutes: number;
    formattedTime: string;
  };
  isHoliday?: boolean;
  holidayWorkMinutes?: number;
  holidayWorkFormatted?: string;
  isHolidayWorkExceeded?: boolean;
  holidayDescription?: string;
  overtime?: {
    minutes: number;
    formatted: string;
  };
}

export const AttendanceCalendar: React.FC<AttendanceCalendarProps> = ({ 
  records, 
  year: initialYear, 
  month: initialMonth,
  workSettings = [],
  holidayWorks = []
}) => {
  // 현재 날짜 정보 초기화
  const now = new Date();
  const [currentYear, setCurrentYear] = useState<number>(initialYear || now.getFullYear());
  const [currentMonth, setCurrentMonth] = useState<number>(initialMonth || now.getMonth());

  // 요일 및 월 이름
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  const monthNames = [
    '1월', '2월', '3월', '4월', '5월', '6월',
    '7월', '8월', '9월', '10월', '11월', '12월'
  ];

  // 이전 달로 이동
  const goToPrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  // 다음 달로 이동
  const goToNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  // 날짜별 출결 상태 계산 함수
  const calculateDayStatus = (dayRecords: AttendanceRecord[]): DayAttendanceStatus | null => {
    if (!dayRecords.length || !workSettings.length) return null;
    
    const checkInRecord = dayRecords.find(r => r.record_type === 'check_in');
    const checkOutRecord = dayRecords.find(r => r.record_type === 'check_out') || 
                           dayRecords.find(r => r.record_type === 'overtime_end');
    
    if (!checkInRecord) return null;
    
    // 출근 날짜의 요일 확인
    const checkInDate = new Date(checkInRecord.timestamp);
    const dayOfWeek = checkInDate.getDay();
    
    // 해당 요일의 근무시간 설정 가져오기
    const daySetting = workSettings.find(s => s.day_of_week === dayOfWeek);
    
    if (!daySetting) return null;
    
    let result: DayAttendanceStatus = {};
    
    // 비근무일(휴일) 체크
    const isNonWorkingDay = !daySetting.is_working_day;
    
    // 공휴일 체크
    const checkInDateStr = `${checkInDate.getFullYear()}-${String(checkInDate.getMonth() + 1).padStart(2, '0')}-${String(checkInDate.getDate()).padStart(2, '0')}`;
    const holidayWork = holidayWorks.find(h => h.date === checkInDateStr);
    
    if (holidayWork) {
      result.isHoliday = true;
      result.holidayDescription = holidayWork.description;
      
      // 공휴일 근무 시간 표시 - 관리자가 입력한 work_minutes 값을 사용
      if (holidayWork.work_minutes > 0) {
        // 기본 근무 시간
        let totalHolidayWorkMinutes = holidayWork.work_minutes;
        
        // 수동 입력된 추가 초과근무시간이 있으면 더함
        if (holidayWork.extra_overtime_minutes && holidayWork.extra_overtime_minutes > 0) {
          totalHolidayWorkMinutes += holidayWork.extra_overtime_minutes;
        }
        
        // 공휴일 근무 시간을 별도로 저장
        result.holidayWorkMinutes = totalHolidayWorkMinutes;
        result.holidayWorkFormatted = formatMinutesToHoursAndMinutes(totalHolidayWorkMinutes);
        
        // 8시간(480분) 초과 여부 체크
        if (totalHolidayWorkMinutes > 480) {
          result.isHolidayWorkExceeded = true;
        }
      }
    }
    
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
        result.isLate = true;
        result.minutesLate = lateStatus.minutesLate;
      }
    }
    
    // 퇴근 기록이 있는 경우
    if (checkOutRecord) {
      // 총 근무시간 계산
      const workHours = calculateWorkHours(
        checkInRecord, 
        checkOutRecord,
        daySetting.lunch_start_time, 
        daySetting.lunch_end_time
      );
      
      // 기본 근무시간 저장
      result.workHours = workHours;
      
      // totalWorkHours 추가 - 기본적으로 workHours로 초기화
      result.totalWorkHours = {
        totalMinutes: workHours.totalMinutes,
        formattedTime: workHours.formattedTime
      };
      
      // 시간외 근무 계산 (공휴일이 아닌 경우에만)
      if (!result.isHoliday) {
        // 시간외 근무 종료 기록이 있는지 확인 - 모든 시간외 근무 종료 기록을 찾음
        const overtimeEndRecords = dayRecords.filter(r => r.record_type === 'overtime_end');
        
        if (overtimeEndRecords.length > 0) {
          // 통합된 시간외 근무 계산 함수 사용
          const overtimeResult = calculateOvertimeMinutes(dayRecords, daySetting, isNonWorkingDay);
          
          // 반환값 타입 변경: totalMinutes 속성 사용
          if (overtimeResult.totalMinutes > 0) {
            result.overtime = {
              minutes: overtimeResult.totalMinutes,
              formatted: formatMinutesToHoursAndMinutes(overtimeResult.totalMinutes)
            };
            
            // 근무일이 아닌 경우, 전체 근무시간이 시간외 근무로 계산되므로 
            // 별도로 표시할 필요 없음
            
            // 근무일인 경우에는 일반 근무시간 + 시간외 근무시간을 총 근무시간으로 표시
            if (!isNonWorkingDay) {
              // 점심시간 중 시간외 근무시간도 포함
              const totalMinutes = workHours.totalMinutes + overtimeResult.totalMinutes;
              result.totalWorkHours = {
                totalMinutes,
                formattedTime: formatMinutesToHoursAndMinutes(totalMinutes)
              };
            }
          }
        }
      }
    }
    
    return result;
  };

  // 달력 데이터 생성
  const calendarData = useMemo(() => {
    // 해당 월의 첫날
    const firstDayOfMonth = new Date(currentYear, currentMonth, 1);
    // 해당 월의 마지막 날짜
    const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0);
    
    // 해당 월의 첫날 요일 (0: 일요일, 1: 월요일, ...)
    const firstDayOfWeek = firstDayOfMonth.getDay();
    // 달력의 첫 주 빈 셀 채우기
    const daysInMonth = lastDayOfMonth.getDate();
    
    // 출결 기록을 날짜별로 정리
    const recordsByDate: Record<string, AttendanceRecord[]> = {};
    
    records.forEach(record => {
      const recordDate = new Date(record.timestamp);
      // 해당 월의 데이터만 필터링
      if (recordDate.getMonth() !== currentMonth || recordDate.getFullYear() !== currentYear) return;
      
      const dateKey = recordDate.getDate().toString();
      
      if (!recordsByDate[dateKey]) {
        recordsByDate[dateKey] = [];
      }
      
      recordsByDate[dateKey].push(record);
    });

    // 출결 상태 계산
    const statusByDate: Record<string, DayAttendanceStatus | null> = {};
    Object.entries(recordsByDate).forEach(([dateKey, dayRecords]) => {
      statusByDate[dateKey] = calculateDayStatus(dayRecords);
    });

    // 달력에 표시할 날짜 배열 (6주 x 7일)
    const days = [];
    let dayCounter = 1;
    
    // 6주 생성 (최대 6주까지 표시)
    for (let week = 0; week < 6; week++) {
      const weekData = [];
      
      // 각 주의 7일 생성
      for (let day = 0; day < 7; day++) {
        if (week === 0 && day < firstDayOfWeek) {
          // 첫 주 시작 전 빈 셀
          weekData.push({ date: null, records: [], status: null });
        } else if (dayCounter > daysInMonth) {
          // 마지막 날 이후 빈 셀
          weekData.push({ date: null, records: [], status: null });
        } else {
          // 날짜 및 해당 날짜의 출결 기록과 상태
          weekData.push({
            date: dayCounter,
            records: recordsByDate[dayCounter.toString()] || [],
            status: statusByDate[dayCounter.toString()] || null
          });
          dayCounter++;
        }
      }
      
      days.push(weekData);
      
      // 모든 날짜를 표시했으면 종료
      if (dayCounter > daysInMonth && week >= 3) {
        break;
      }
    }
    
    return days;
  }, [currentYear, currentMonth, records, workSettings, holidayWorks]);

  // 오늘 날짜인지 확인
  const isToday = (date: number | null) => {
    if (!date) return false;
    
    const today = new Date();
    return (
      date === today.getDate() &&
      currentMonth === today.getMonth() &&
      currentYear === today.getFullYear()
    );
  };

  return (
    <div className="bg-white rounded-xl shadow-sm p-2 sm:p-4">
      <div className="flex justify-between items-center mb-2">
        <button 
          onClick={goToPrevMonth}
          className="p-1 text-gray-600 hover:text-gray-900 text-lg"
          aria-label="이전 달"
        >
          &lsaquo;
        </button>
        <h3 className="text-sm sm:text-base font-bold">
          {currentYear}년 {monthNames[currentMonth]}
        </h3>
        <button 
          onClick={goToNextMonth}
          className="p-1 text-gray-600 hover:text-gray-900 text-lg"
          aria-label="다음 달"
        >
          &rsaquo;
        </button>
      </div>
      
      <div className="grid grid-cols-7 gap-0.5">
        {/* 요일 헤더 */}
        {dayNames.map((day, index) => (
          <div 
            key={day} 
            className={`text-center py-1 text-[10px] sm:text-xs font-medium ${
              index === 0 ? 'text-red-500' : index === 6 ? 'text-blue-500' : 'text-gray-700'
            }`}
          >
            {day}
          </div>
        ))}
        
        {/* 날짜 셀 */}
        {calendarData.map((week, weekIndex) => (
          week.map((day, dayIndex) => (
            <div 
              key={`${weekIndex}-${dayIndex}`}
              className={`p-0.5 min-h-[4.5rem] sm:min-h-24 border border-gray-100 ${
                day.date 
                  ? day.status?.isHoliday 
                    ? 'bg-red-50' // 공휴일인 경우 연한 빨간색 배경
                    : 'bg-white' 
                  : 'bg-gray-50'
              } ${
                isToday(day.date) ? 'ring-2 ring-blue-500' : ''
              } rounded-md overflow-hidden`}
            >
              {day.date && (
                <>
                  <div className={`text-xs font-medium mb-0.5 ${
                    day.status?.isHoliday
                      ? 'text-red-600 font-bold' // 공휴일인 경우 빨간색 글씨와 볼드체
                      : dayIndex === 0 
                        ? 'text-red-500' 
                        : dayIndex === 6 
                          ? 'text-blue-500' 
                          : 'text-gray-700'
                  }`}>
                    {day.date}
                  </div>
                  
                  {/* 근무 상태 정보 */}
                  {day.status && (
                    <div className="flex flex-col space-y-0.5 mt-0.5">
                      {/* 시간외 근무 */}
                      {day.records.some(r => r.record_type === 'overtime_end') && day.status?.overtime && day.status?.overtime.minutes > 0 && (
                        <div className="flex items-center">
                          <div className="h-1.5 w-1.5 bg-purple-500 rounded-full"></div>
                          <span className="text-[7px] sm:text-[8px] text-purple-700 font-medium ml-0.5">
                            {day.status.overtime.minutes}분
                          </span>
                        </div>
                      )}
                      
                      {/* 공휴일 근무 */}
                      {day.status?.isHoliday && day.status?.holidayWorkMinutes && day.status?.holidayWorkMinutes > 0 && (
                        <div className="flex items-center">
                          <div className="h-1.5 w-1.5 bg-red-500 rounded-full"></div>
                          <span className="text-[7px] sm:text-[8px] text-red-700 font-medium ml-0.5">
                            {day.status.holidayWorkMinutes > 480 ? 480 : day.status.holidayWorkMinutes}분
                          </span>
                        </div>
                      )}
                      
                      {/* 휴일 8시간 초과 */}
                      {day.status?.isHolidayWorkExceeded && day.status?.holidayWorkMinutes && day.status?.holidayWorkMinutes > 480 && (
                        <div className="flex items-center">
                          <div className="h-1.5 w-1.5 bg-red-600 rounded-full"></div>
                          <span className="text-[7px] sm:text-[8px] text-red-700 font-medium ml-0.5">
                            {day.status.holidayWorkMinutes - 480}분
                          </span>
                        </div>
                      )}
                      
                      {/* 지각 정보 */}
                      {day.status.isLate && day.status.minutesLate && day.status.minutesLate > 0 && (
                        <div className="flex items-center">
                          <div className="h-1.5 w-1.5 bg-amber-500 rounded-full"></div>
                          <span className="text-[7px] sm:text-[8px] text-amber-700 font-medium ml-0.5">
                            {day.status.minutesLate}분
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          ))
        ))}
      </div>
      
      {/* 범례 */}
      <div className="mt-2 flex flex-wrap items-center gap-1 sm:gap-2 text-[8px] sm:text-[10px] text-gray-600">
        <div className="flex items-center">
          <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
          <span className="ml-0.5">시간외</span>
        </div>
        <div className="flex items-center ml-1">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
          <span className="ml-0.5">공휴일</span>
        </div>
        <div className="flex items-center ml-1">
          <span className="w-1.5 h-1.5 rounded-full bg-red-600"></span>
          <span className="ml-0.5">휴일 8시간 초과</span>
        </div>
        <div className="flex items-center ml-1">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
          <span className="ml-0.5">지각</span>
        </div>
      </div>
    </div>
  );
}; 