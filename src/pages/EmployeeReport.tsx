import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, fetchProfile, getMonthAttendance, getHolidayWorks, getWorkSettings, type Profile, type AttendanceRecord, type HolidayWork, type AttendanceSettings } from '../lib/supabase';
import { formatMinutesToHoursAndMinutes, checkLateStatus, checkEarlyLeaveStatus, calculateWorkHours } from '../lib/qrUtils';

interface EmployeeStats {
  id: string;
  name: string;
  totalWorkMinutes: number;
  totalWorkFormatted: string;
  overtimeMinutes: number;
  overtimeFormatted: string;
  holidayWorkMinutes: number;
  holidayWorkFormatted: string;
  holidayExceededMinutes: number;
  holidayExceededFormatted: string;
}

type SortField = 'name' | 'totalWorkMinutes' | 'overtimeMinutes' | 'holidayWorkMinutes' | 'holidayExceededMinutes';
type SortDirection = 'asc' | 'desc';

export const EmployeeReport = () => {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [employeeStats, setEmployeeStats] = useState<EmployeeStats[]>([]);
  const [holidayWorks, setHolidayWorks] = useState<HolidayWork[]>([]);
  const [workSettings, setWorkSettings] = useState<AttendanceSettings[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<Record<string, AttendanceRecord[]>>({});
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  useEffect(() => {
    // 세션 확인 및 프로필 로드
    const checkSession = async () => {
      try {
        setLoading(true);
        
        // 세션 가져오기
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
          // 세션이 없으면 로그인 페이지로 이동
          navigate('/login');
          return;
        }

        // 사용자 ID 저장
        const userId = session.user.id;
        
        // 프로필 정보 로드
        const profile = await fetchProfile(userId);
        
        if (!profile) {
          setError('프로필 정보를 불러오는 데 실패했습니다.');
          navigate('/login');
          return;
        }
        
        setProfile(profile);
        
        // 관리자 확인
        if (profile.role !== 'admin') {
          setError('관리자만 접근할 수 있는 페이지입니다.');
          navigate('/');
          return;
        }
        
        // 모든 직원 정보 가져오기
        const { data: employeesData, error: employeesError } = await supabase
          .from('profiles_new')
          .select('*')
          .order('name');
        
        if (employeesError) {
          throw new Error('직원 정보를 불러오는 데 실패했습니다.');
        }
        
        setEmployees(employeesData || []);
        
        // 공휴일 정보 불러오기
        const holidayWorksData = await getHolidayWorks();
        setHolidayWorks(holidayWorksData);
        
        // 근무시간 설정 로드 추가
        const settings = await getWorkSettings();
        setWorkSettings(settings);
        
        // 모든 직원의 출결 기록 가져오기
        const attendanceData: Record<string, AttendanceRecord[]> = {};
        
        for (const employee of employeesData || []) {
          const records = await getMonthAttendance(employee.id);
          attendanceData[employee.id] = records;
        }
        
        setAttendanceRecords(attendanceData);
        
      } catch (error: any) {
        console.error('데이터 로드 오류:', error);
        setError('정보를 불러오는 중 오류가 발생했습니다.');
      } finally {
        setLoading(false);
      }
    };

    checkSession();
  }, [navigate]);
  
  // 근무 상태 계산 함수 (Dashboard의 getAttendanceStatus 함수와 유사하게 구현)
  const getEmployeeAttendanceStatus = (records: AttendanceRecord[], settings: AttendanceSettings[]) => {
    if (!settings || settings.length === 0) return null;
    
    const checkInRecord = records.find(r => r.record_type === 'check_in');
    const checkOutRecord = records.find(r => r.record_type === 'check_out');
    const overtimeEndRecord = records.find(r => r.record_type === 'overtime_end');
    
    if (!checkInRecord) return null;
    
    // 출근 날짜의 요일 확인
    const checkInDate = new Date(checkInRecord.timestamp);
    const dayOfWeek = checkInDate.getDay();
    
    // 해당 요일의 근무시간 설정 가져오기
    const daySetting = settings.find(s => s.day_of_week === dayOfWeek);
    
    if (!daySetting) return null;
    
    let result: any = {};
    
    // 비근무일(휴일) 체크
    const isNonWorkingDay = !daySetting.is_working_day;
    
    // 퇴근 또는 시간외 근무 종료 기록이 있는 경우
    const lastRecord = checkOutRecord || overtimeEndRecord;
    
    if (lastRecord) {
      // 총 근무시간 계산
      const workHours = calculateWorkHours(
        checkInRecord, 
        lastRecord, 
        daySetting.lunch_start_time, 
        daySetting.lunch_end_time
      );
      
      result.workHours = workHours;
      
      // 시간외 근무 계산 - 시간외 근무 종료를 찍은 경우에만 계산
      if (overtimeEndRecord) {
        // 시간외 근무 종료 기록이 있는 경우
        if (isNonWorkingDay) {
          // 비근무일인 경우 전체 시간을 시간외 근무로 계산
          result.overtime = {
            minutes: workHours.totalMinutes,
            formatted: workHours.formattedTime
          };
        } else {
          // 근무일인 경우, 정규 근무시간을 제외한 시간만 계산
          const checkInTime = new Date(checkInRecord.timestamp);
          const overtimeEndTime = new Date(overtimeEndRecord.timestamp);
          
          // 설정된 근무 시작/종료 시간
          const today = new Date(checkInTime);
          today.setHours(0, 0, 0, 0);
          
          // 근무 종료 시간 설정
          const [workEndHour, workEndMinute] = daySetting.work_end_time.split(':').map(Number);
          const workEndTime = new Date(today);
          workEndTime.setHours(workEndHour, workEndMinute, 0, 0);
          
          let overtimeMinutes = 0;
          
          // 시간외 근무 종료 기록이 있고, 정규 퇴근 시간 이후인 경우만 시간외 근무로 계산
          if (overtimeEndTime > workEndTime) {
            // 정규 퇴근 시간 이후부터 시간외 근무 종료 시간까지 계산
            const lateMinutes = Math.floor((overtimeEndTime.getTime() - workEndTime.getTime()) / (1000 * 60));
            overtimeMinutes += lateMinutes;
          }
          
          if (overtimeMinutes > 0) {
            result.overtime = {
              minutes: overtimeMinutes,
              formatted: formatMinutesToHoursAndMinutes(overtimeMinutes)
            };
          }
        }
      }
    }
    
    return result;
  };
  
  // 직원별 통계 계산
  useEffect(() => {
    if (employees.length === 0 || Object.keys(attendanceRecords).length === 0 || workSettings.length === 0) return;
    
    const stats: EmployeeStats[] = employees.map(employee => {
      const records = attendanceRecords[employee.id] || [];
      
      // 일별 출결 기록 그룹화
      const recordsByDate: Record<string, AttendanceRecord[]> = {};
      
      records.forEach(record => {
        const recordDate = new Date(record.timestamp);
        const dateKey = `${recordDate.getFullYear()}-${recordDate.getMonth()}-${recordDate.getDate()}`;
        
        if (!recordsByDate[dateKey]) {
          recordsByDate[dateKey] = [];
        }
        
        recordsByDate[dateKey].push(record);
      });
      
      // 1. 시간외 근무시간 계산 (공휴일 제외)
      let overtimeMinutes = 0;
      
      Object.values(recordsByDate).forEach(dayRecords => {
        // 해당 날짜에 시간외 근무 종료 기록이 있는 경우에만 계산
        if (dayRecords.some(r => r.record_type === 'overtime_end')) {
          const checkInRecord = dayRecords.find(r => r.record_type === 'check_in');
          if (!checkInRecord) return;
          
          // 날짜가 공휴일인지 확인
          const recordDate = new Date(checkInRecord.timestamp);
          const dateStr = `${recordDate.getFullYear()}-${String(recordDate.getMonth() + 1).padStart(2, '0')}-${String(recordDate.getDate()).padStart(2, '0')}`;
          const isHoliday = holidayWorks.some(h => h.date === dateStr);
          
          // 공휴일이 아닌 경우에만 시간외 근무 시간 합산
          if (!isHoliday) {
            const status = getEmployeeAttendanceStatus(dayRecords, workSettings);
            if (status && status.overtime) {
              overtimeMinutes += status.overtime.minutes;
            }
          }
        }
      });
      
      // 2 & 3. 휴일 근무시간 및 초과시간 계산
      const standardMinutes = 480; // 8시간 = 480분
      let holidayWorkMinutes = 0; // 8시간 이하 근무 합계
      let holidayExceededMinutes = 0; // 8시간 초과분 합계
      
      // 직원의 출근 기록이 있는 날짜만 추출
      const userCheckInDates = records
        .filter(record => record.record_type === 'check_in')
        .map(record => {
          const date = new Date(record.timestamp);
          return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        });
      
      // 공휴일 중 사용자가 출근한 날짜에 대한 근무 시간 계산
      holidayWorks.forEach(holiday => {
        if (userCheckInDates.includes(holiday.date)) {
          let minutes = holiday.work_minutes || 0;
          
          // 추가 시간외 근무시간이 있으면 더함
          if (holiday.extra_overtime_minutes) {
            minutes += holiday.extra_overtime_minutes;
          }
          
          // 8시간(480분) 기준으로 나누어 계산
          if (minutes <= standardMinutes) {
            holidayWorkMinutes += minutes;
          } else {
            holidayWorkMinutes += standardMinutes;
            holidayExceededMinutes += (minutes - standardMinutes);
          }
        }
      });
      
      // 4. 총 근무시간 계산 (공휴일 및 휴무일 제외 일반 근무 + 시간외 + 휴일 근무 합계)
      let regularWorkMinutes = 0;
      
      // 각 날짜별 일반 근무시간 계산 (공휴일 및 휴무일 제외)
      Object.values(recordsByDate).forEach(dayRecords => {
        const checkInRecord = dayRecords.find(r => r.record_type === 'check_in');
        if (!checkInRecord) return;
        
        const checkInTime = new Date(checkInRecord.timestamp);
        
        // 해당 날짜가 공휴일인지 확인
        const checkInDateStr = `${checkInTime.getFullYear()}-${String(checkInTime.getMonth() + 1).padStart(2, '0')}-${String(checkInTime.getDate()).padStart(2, '0')}`;
        const isHoliday = holidayWorks.some(h => h.date === checkInDateStr);
        
        // 해당 날짜가 휴무일인지 확인
        const dayOfWeek = checkInTime.getDay(); // 0: 일요일, 1: 월요일, ...
        const daySettings = workSettings.find(s => s.day_of_week === dayOfWeek);
        const isNonWorkingDay = !daySettings?.is_working_day;
        
        // 공휴일이 아니고 휴무일도 아닌 경우에만 추가 (공휴일과 휴무일 근무는 별도로 계산됨)
        if (!isHoliday && !isNonWorkingDay) {
          const status = getEmployeeAttendanceStatus(dayRecords, workSettings);
          if (status && status.workHours) {
            regularWorkMinutes += status.workHours.totalMinutes;
          }
        }
      });

      // 총 근무시간 = 일반 근무시간 + 시간외 근무시간 + 휴일 근무시간(정규+초과)
      const totalWorkMinutes = regularWorkMinutes + overtimeMinutes + holidayWorkMinutes + holidayExceededMinutes;
      
      return {
        id: employee.id,
        name: employee.name || '이름 없음',
        totalWorkMinutes,
        totalWorkFormatted: formatMinutesToHoursAndMinutes(totalWorkMinutes),
        overtimeMinutes,
        overtimeFormatted: formatMinutesToHoursAndMinutes(overtimeMinutes),
        holidayWorkMinutes,
        holidayWorkFormatted: formatMinutesToHoursAndMinutes(holidayWorkMinutes),
        holidayExceededMinutes,
        holidayExceededFormatted: formatMinutesToHoursAndMinutes(holidayExceededMinutes)
      };
    });
    
    setEmployeeStats(stats);
  }, [employees, attendanceRecords, holidayWorks, workSettings]);
  
  // 정렬 함수
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      // 같은 필드면 방향만 변경
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // 다른 필드면 필드 변경 및 오름차순으로 시작
      setSortField(field);
      setSortDirection('asc');
    }
  };
  
  // 정렬된, 필터링된 직원 통계
  const sortedEmployeeStats = [...employeeStats].sort((a, b) => {
    if (sortField === 'name') {
      return sortDirection === 'asc' 
        ? a.name.localeCompare(b.name)
        : b.name.localeCompare(a.name);
    } else {
      // 숫자 필드 정렬
      const aValue = a[sortField];
      const bValue = b[sortField];
      
      return sortDirection === 'asc' 
        ? Number(aValue) - Number(bValue)
        : Number(bValue) - Number(aValue);
    }
  });
  
  // 정렬 표시 함수
  const renderSortIndicator = (field: SortField) => {
    if (sortField !== field) return null;
    
    return sortDirection === 'asc' ? '↑' : '↓';
  };
  
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="mt-4 text-gray-600">로딩 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 min-h-screen">
      {/* 헤더 */}
      <header className="bg-white shadow-sm">
        <div className="px-4 py-4 flex justify-between items-center">
          <div className="flex items-center">
            <button
              onClick={() => navigate('/')}
              className="mr-4 text-gray-600 hover:text-gray-900"
            >
              ← 대시보드
            </button>
            <h1 className="text-lg font-bold text-gray-900">전체 직원 근무 일지</h1>
          </div>
        </div>
      </header>

      {/* 메인 컨텐츠 */}
      <main className="px-4 py-6">
        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-md mb-4 text-sm">
            {error}
          </div>
        )}

        <div className="bg-white shadow rounded-xl p-5 mb-5">
          <h2 className="text-lg font-bold text-gray-900 mb-4">이번 달 직원별 근무 통계</h2>
          
          {sortedEmployeeStats.length === 0 ? (
            <p className="text-gray-500 text-center py-4">
              직원 정보가 없거나 근무 기록이 없습니다.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full table-auto">
                <thead className="bg-gray-50">
                  <tr>
                    <th 
                      className="px-4 py-2 text-left text-sm font-medium text-gray-500 border-b cursor-pointer"
                      onClick={() => handleSort('name')}
                    >
                      이름 {renderSortIndicator('name')}
                    </th>
                    <th 
                      className="px-4 py-2 text-right text-sm font-medium text-gray-500 border-b cursor-pointer"
                      onClick={() => handleSort('totalWorkMinutes')}
                    >
                      총 근무시간 {renderSortIndicator('totalWorkMinutes')}
                    </th>
                    <th 
                      className="px-4 py-2 text-right text-sm font-medium text-gray-500 border-b cursor-pointer"
                      onClick={() => handleSort('overtimeMinutes')}
                    >
                      시간외 근무 총시간 {renderSortIndicator('overtimeMinutes')}
                    </th>
                    <th 
                      className="px-4 py-2 text-right text-sm font-medium text-gray-500 border-b cursor-pointer"
                      onClick={() => handleSort('holidayWorkMinutes')}
                    >
                      휴일 근무 총시간 {renderSortIndicator('holidayWorkMinutes')}
                    </th>
                    <th 
                      className="px-4 py-2 text-right text-sm font-medium text-gray-500 border-b cursor-pointer"
                      onClick={() => handleSort('holidayExceededMinutes')}
                    >
                      휴일 8시간 초과 근무시간 {renderSortIndicator('holidayExceededMinutes')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedEmployeeStats.map((stat) => (
                    <tr key={stat.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 border-b">{stat.name}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 text-right border-b">{stat.totalWorkFormatted}</td>
                      <td className="px-4 py-3 text-sm text-purple-700 text-right border-b">{stat.overtimeFormatted}</td>
                      <td className="px-4 py-3 text-sm text-red-700 text-right border-b">{stat.holidayWorkFormatted}</td>
                      <td className="px-4 py-3 text-sm text-red-700 font-medium text-right border-b">{stat.holidayExceededFormatted}</td>
                    </tr>
                  ))}
                  
                  {/* 합계 행 추가 */}
                  <tr className="bg-gray-50">
                    <td className="px-4 py-3 text-sm font-bold text-gray-900">전체 합계</td>
                    <td className="px-4 py-3 text-sm font-bold text-gray-900 text-right">
                      {formatMinutesToHoursAndMinutes(employeeStats.reduce((sum, stat) => sum + stat.totalWorkMinutes, 0))}
                    </td>
                    <td className="px-4 py-3 text-sm font-bold text-purple-700 text-right">
                      {formatMinutesToHoursAndMinutes(employeeStats.reduce((sum, stat) => sum + stat.overtimeMinutes, 0))}
                    </td>
                    <td className="px-4 py-3 text-sm font-bold text-red-700 text-right">
                      {formatMinutesToHoursAndMinutes(employeeStats.reduce((sum, stat) => sum + stat.holidayWorkMinutes, 0))}
                    </td>
                    <td className="px-4 py-3 text-sm font-bold text-red-700 text-right">
                      {formatMinutesToHoursAndMinutes(employeeStats.reduce((sum, stat) => sum + stat.holidayExceededMinutes, 0))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}; 