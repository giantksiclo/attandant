import React, { useState, useMemo } from 'react';

interface LeaveRequest {
  id: string;
  user_id: string;
  start_date: string;
  end_date: string;
  leave_type: string;
  leave_source: string;
  status: string;
  reason: string;
  userName?: string;
}

interface LeaveCalendarProps {
  highlightDates?: Date[];
  leaveRequests?: LeaveRequest[];
  year?: number;
  month?: number;
}

export const LeaveCalendar: React.FC<LeaveCalendarProps> = ({
  highlightDates = [],
  leaveRequests = [],
  year: initialYear,
  month: initialMonth,
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

    // 날짜별 연차 신청 정보
    const leavesByDate: Record<string, LeaveRequest[]> = {};
    
    leaveRequests.forEach(leave => {
      const startDate = new Date(leave.start_date);
      const endDate = new Date(leave.end_date);
      
      // 현재 표시중인 월에 해당하는 연차만 필터링
      let currentDate = new Date(startDate);
      
      while (currentDate <= endDate) {
        if (currentDate.getMonth() === currentMonth && currentDate.getFullYear() === currentYear) {
          const dateKey = currentDate.getDate().toString();
          
          if (!leavesByDate[dateKey]) {
            leavesByDate[dateKey] = [];
          }
          
          leavesByDate[dateKey].push(leave);
        }
        
        currentDate.setDate(currentDate.getDate() + 1);
      }
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
          weekData.push({ date: null, leaves: [] });
        } else if (dayCounter > daysInMonth) {
          // 마지막 날 이후 빈 셀
          weekData.push({ date: null, leaves: [] });
        } else {
          const currentDate = new Date(currentYear, currentMonth, dayCounter);
          
          // 하이라이트 여부 확인
          const isHighlighted = highlightDates.some(date => 
            date.getDate() === currentDate.getDate() &&
            date.getMonth() === currentDate.getMonth() &&
            date.getFullYear() === currentDate.getFullYear()
          );
          
          // 날짜 및 해당 날짜의 연차 신청 정보
          weekData.push({
            date: dayCounter,
            leaves: leavesByDate[dayCounter.toString()] || [],
            isHighlighted
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
  }, [currentYear, currentMonth, leaveRequests, highlightDates]);

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

  // 연차 상태에 따른 색상 클래스
  const getStatusColorClass = (status: string) => {
    switch (status) {
      case 'approved':
        return 'bg-green-100 text-green-800';
      case 'rejected':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-yellow-100 text-yellow-800';
    }
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
              className={`p-0.5 min-h-[4.5rem] sm:min-h-24 border ${
                day.isHighlighted 
                  ? 'border-blue-400 bg-blue-50' 
                  : 'border-gray-100 bg-white'
              } ${
                isToday(day.date) ? 'ring-2 ring-blue-500' : ''
              } ${
                !day.date ? 'bg-gray-50' : ''
              } ${
                dayIndex === 0 && day.date ? 'bg-red-50' : ''
              } rounded-md overflow-hidden`}
            >
              {day.date && (
                <>
                  <div className={`text-xs font-medium mb-0.5 ${
                    dayIndex === 0 
                      ? 'text-red-500' 
                      : dayIndex === 6 
                        ? 'text-blue-500' 
                        : 'text-gray-700'
                  }`}>
                    {day.date}
                  </div>
                  
                  {/* 연차 신청 정보 */}
                  {day.leaves.length > 0 && (
                    <div className="flex flex-col space-y-0.5 mt-0.5">
                      {day.leaves.slice(0, 2).map((leave, idx) => (
                        <div 
                          key={`${leave.id}-${idx}`}
                          className={`text-[7px] sm:text-[8px] px-1 py-0.5 rounded-sm ${getStatusColorClass(leave.status)}`}
                          title={`${leave.reason} (${leave.leave_type === 'annual' ? '일반 연차' : '특별 연차'})`}
                        >
                          {leave.leave_source === 'half_day' ? '반차' : '연차'}
                        </div>
                      ))}
                      
                      {day.leaves.length > 2 && (
                        <div className="text-[7px] sm:text-[8px] text-gray-600 ml-1">
                          +{day.leaves.length - 2}개 더
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
          <span className="w-2 h-2 rounded-full bg-yellow-100 border border-yellow-300"></span>
          <span className="ml-0.5">승인 대기</span>
        </div>
        <div className="flex items-center ml-1">
          <span className="w-2 h-2 rounded-full bg-green-100 border border-green-300"></span>
          <span className="ml-0.5">승인됨</span>
        </div>
        <div className="flex items-center ml-1">
          <span className="w-2 h-2 rounded-full bg-red-100 border border-red-300"></span>
          <span className="ml-0.5">반려됨</span>
        </div>
        <div className="flex items-center ml-1">
          <span className="w-2 h-2 rounded-full bg-blue-50 border border-blue-300"></span>
          <span className="ml-0.5">선택된 날짜</span>
        </div>
      </div>
    </div>
  );
};

export default LeaveCalendar; 