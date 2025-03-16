import React, { useState, useMemo } from 'react';
import { AttendanceRecord } from '../lib/supabase';

interface AttendanceCalendarProps {
  records: AttendanceRecord[];
  year?: number;
  month?: number;
}

export const AttendanceCalendar: React.FC<AttendanceCalendarProps> = ({ 
  records, 
  year: initialYear, 
  month: initialMonth 
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
      const dateKey = recordDate.getDate().toString();
      
      if (!recordsByDate[dateKey]) {
        recordsByDate[dateKey] = [];
      }
      
      recordsByDate[dateKey].push(record);
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
          weekData.push({ date: null, records: [] });
        } else if (dayCounter > daysInMonth) {
          // 마지막 날 이후 빈 셀
          weekData.push({ date: null, records: [] });
        } else {
          // 날짜 및 해당 날짜의 출결 기록
          weekData.push({
            date: dayCounter,
            records: recordsByDate[dayCounter.toString()] || []
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
  }, [currentYear, currentMonth, records]);

  // 출결 타입에 따른 배지 색상
  const getRecordTypeBadge = (type: string) => {
    switch (type) {
      case 'check_in':
        return <span className="w-2 h-2 rounded-full bg-blue-500"></span>;
      case 'check_out':
        return <span className="w-2 h-2 rounded-full bg-amber-500"></span>;
      case 'overtime_end':
        return <span className="w-2 h-2 rounded-full bg-purple-500"></span>;
      default:
        return null;
    }
  };

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
      <div className="flex justify-between items-center mb-4">
        <button 
          onClick={goToPrevMonth}
          className="p-2 text-gray-600 hover:text-gray-900 text-xl"
          aria-label="이전 달"
        >
          &lsaquo;
        </button>
        <h3 className="text-base sm:text-lg font-bold">
          {currentYear}년 {monthNames[currentMonth]}
        </h3>
        <button 
          onClick={goToNextMonth}
          className="p-2 text-gray-600 hover:text-gray-900 text-xl"
          aria-label="다음 달"
        >
          &rsaquo;
        </button>
      </div>
      
      <div className="grid grid-cols-7 gap-1">
        {/* 요일 헤더 */}
        {dayNames.map((day, index) => (
          <div 
            key={day} 
            className={`text-center py-1 sm:py-2 text-xs sm:text-sm font-medium ${
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
              className={`p-1 min-h-12 sm:min-h-16 border border-gray-100 ${
                day.date ? 'bg-white' : 'bg-gray-50'
              } ${
                isToday(day.date) ? 'ring-2 ring-blue-500' : ''
              } rounded-md overflow-hidden`}
            >
              {day.date && (
                <>
                  <div className={`text-xs font-medium mb-0.5 sm:mb-1 ${
                    dayIndex === 0 ? 'text-red-500' : dayIndex === 6 ? 'text-blue-500' : 'text-gray-700'
                  }`}>
                    {day.date}
                  </div>
                  <div className="flex flex-col space-y-0.5 sm:space-y-1 overflow-y-auto max-h-14">
                    {day.records.slice(0, 3).map((record, i) => (
                      <div 
                        key={i} 
                        className="flex items-center text-xs space-x-1"
                        title={`${record.record_type === 'check_in' ? '출근' : 
                                record.record_type === 'check_out' ? '퇴근' : 
                                '시간외근무 종료'} - ${new Date(record.timestamp).toLocaleTimeString('ko-KR', { 
                                  hour: '2-digit', 
                                  minute: '2-digit' 
                                })}${record.location ? ` (${record.location})` : ''}`}
                      >
                        {getRecordTypeBadge(record.record_type)}
                        <span className="truncate text-[10px] sm:text-xs">
                          {new Date(record.timestamp).toLocaleTimeString('ko-KR', { 
                            hour: '2-digit', 
                            minute: '2-digit' 
                          })}
                        </span>
                      </div>
                    ))}
                    {day.records.length > 3 && (
                      <div className="text-[9px] sm:text-xs text-gray-500">
                        +{day.records.length - 3}건 더 있음
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          ))
        ))}
      </div>
      
      {/* 범례 */}
      <div className="mt-3 flex flex-wrap items-center gap-2 sm:gap-4 text-[10px] sm:text-xs text-gray-600">
        <div className="flex items-center space-x-1">
          <span className="w-2 h-2 rounded-full bg-blue-500"></span>
          <span>출근</span>
        </div>
        <div className="flex items-center space-x-1">
          <span className="w-2 h-2 rounded-full bg-amber-500"></span>
          <span>퇴근</span>
        </div>
        <div className="flex items-center space-x-1">
          <span className="w-2 h-2 rounded-full bg-purple-500"></span>
          <span>시간외근무 종료</span>
        </div>
      </div>
    </div>
  );
}; 