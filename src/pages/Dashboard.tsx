import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, fetchProfile, saveAttendance, getTodayAttendance, getMonthAttendance, getWorkSettings, updateWorkSettings, getHolidayWorks, saveHolidayWork as saveHolidayWorkApi, deleteHolidayWork as deleteHolidayWorkApi, updateHolidayWorkExtraOvertime, type Profile, type AttendanceRecord, type AttendanceSettings, type HolidayWork } from '../lib/supabase';
import { QRScanner } from '../components/QRScanner';
import { QRCodeGenerator } from '../components/QRCodeGenerator';
import { AttendanceCalendar } from '../components/AttendanceCalendar';
import { validateQRData, getRecordTypeLabel, formatTimestamp, isWithinWorkHours, 
  checkLateStatus, checkEarlyLeaveStatus, calculateWorkHours, formatMinutesToHoursAndMinutes } from '../lib/qrUtils';

export const Dashboard = () => {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [todayRecords, setTodayRecords] = useState<AttendanceRecord[]>([]);
  const [monthRecords, setMonthRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [isQRScannerOpen, setIsQRScannerOpen] = useState(false);
  const [currentAction, setCurrentAction] = useState<'check_in' | 'check_out' | 'overtime_end' | null>(null);
  const [showQRCode, setShowQRCode] = useState(false);
  const [qrCodeType, setQrCodeType] = useState<'check_in' | 'check_out' | 'overtime_end' | null>(null);
  const [showMonthCalendar, setShowMonthCalendar] = useState(false);
  const [userEmail, setUserEmail] = useState<string>('');
  const [workSettings, setWorkSettings] = useState<AttendanceSettings[]>([]);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [tempWorkSettings, setTempWorkSettings] = useState<AttendanceSettings[]>([]);
  const [isUpdatingSettings, setIsUpdatingSettings] = useState(false);
  const [activeSettingTab, setActiveSettingTab] = useState<number>(1); // 기본값: 월요일(1)
  const [isHolidayModalOpen, setIsHolidayModalOpen] = useState(false);
  const [holidayWorks, setHolidayWorks] = useState<HolidayWork[]>([]);
  const [selectedHolidayDate, setSelectedHolidayDate] = useState<string>('');
  const [holidayWorkHours, setHolidayWorkHours] = useState<number>(0);
  const [holidayDescription, setHolidayDescription] = useState<string>('');
  const [isUpdatingHoliday, setIsUpdatingHoliday] = useState(false);
  // 직원용 공휴일 추가 시간외 근무시간 관련 상태 변수 추가
  const [isExtraOvertimeModalOpen, setIsExtraOvertimeModalOpen] = useState(false);
  const [extraOvertimeMinutes, setExtraOvertimeMinutes] = useState<number>(0);

  // PWA 설치 프롬프트 저장
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setInstallPrompt(e);
      setShowInstallBanner(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  // 앱 설치 함수
  const handleInstall = async () => {
    if (!installPrompt) return;
    
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    console.log(`설치 ${outcome}`);
    setShowInstallBanner(false);
  };

  useEffect(() => {
    // 세션 확인 및 프로필 로드
    const checkSession = async () => {
      try {
        setLoading(true);
        console.log('세션 및 프로필 로드 시작');
        
        // 세션 가져오기
        const { data: { session } } = await supabase.auth.getSession();
        console.log('현재 세션:', session ? `ID: ${session.user.id}, Email: ${session.user.email}` : '세션 없음');

        if (!session) {
          // 세션이 없으면 로그인 페이지로 이동
          console.log('세션이 없어 로그인 페이지로 이동');
          navigate('/login');
          return;
        }

        // 사용자 ID 저장 (세션에서 가져온 ID를 사용)
        const userId = session.user.id;
        console.log('사용할 사용자 ID:', userId);

        // 사용자 이메일 설정
        const userEmail = session.user.email;
        if (userEmail) {
          setUserEmail(userEmail);
          console.log('사용자 이메일 설정됨:', userEmail);
        }

        // 프로필 정보 로드
        console.log('프로필 로드 시작 - 사용자 ID:', userId);
        const profile = await fetchProfile(userId);
        console.log('프로필 정보 로드됨:', profile);
        
        if (!profile) {
          console.error('프로필을 불러오지 못했습니다. 다시 시도합니다.');
          // 재시도
          const retryProfile = await fetchProfile(userId);
          if (retryProfile) {
            setProfile(retryProfile);
            console.log('재시도 후 프로필 로드 성공:', retryProfile);
          } else {
            console.error('재시도 후에도 프로필 로드 실패');
            setError('프로필 정보를 불러오는 데 실패했습니다. 앱을 다시 시작해 주세요.');
          }
        } else {
          setProfile(profile);
        }

        // 오늘의 출결 기록 로드
        const todayRecords = await getTodayAttendance(userId);
        setTodayRecords(todayRecords);
        console.log('오늘의 출결 기록 로드됨:', todayRecords.length, '개');
        
        // 이번달 출결 기록 로드
        const monthRecords = await getMonthAttendance(userId);
        setMonthRecords(monthRecords);
        console.log('이번달 출결 기록 로드됨:', monthRecords.length, '개');
        
        // 근무시간 설정 로드
        const settings = await getWorkSettings();
        setWorkSettings(settings);
        console.log('근무시간 설정 로드됨:', settings);
        
        // 공휴일 근무 시간 로드
        if (session) {
          await loadHolidayWorks();
        }
        
        console.log('세션 및 프로필 로드 완료');
      } catch (error) {
        console.error('세션/프로필 로드 오류:', error);
        setError('정보를 불러오는 중 오류가 발생했습니다.');
      } finally {
        setLoading(false);
      }
    };

    checkSession();

    // 인증 상태 변경 구독
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('인증 상태 변경 감지:', event, session ? `사용자: ${session.user.email}` : '세션 없음');
      if (!session) {
        navigate('/login');
      } else if (event === 'SIGNED_IN') {
        // 로그인 이벤트 발생 시 프로필 다시 로드
        checkSession();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [navigate]);

  // QR 스캐너 열기 핸들러
  const openQRScanner = (recordType: 'check_in' | 'check_out' | 'overtime_end') => {
    setCurrentAction(recordType);
    setIsQRScannerOpen(true);
  };

  // QR 코드 생성 핸들러
  const openQRGenerator = (recordType: 'check_in' | 'check_out' | 'overtime_end') => {
    setQrCodeType(recordType);
    setShowQRCode(true);
  };

  // QR 스캔 처리 핸들러
  const handleQRScan = async (data: any) => {
    if (!profile || !currentAction || !workSettings || workSettings.length === 0) return;
    
    try {
      setActionLoading(true);
      setError(null);
      setIsQRScannerOpen(false);
      
      // QR 데이터 유효성 검증
      if (!validateQRData(data)) {
        throw new Error('유효하지 않은 QR 코드입니다.');
      }

      console.log('QR 스캔 성공:', data);
      
      // 현재 시간 설정 (QR 코드의 timestamp 대신 현재 시간 사용)
      const currentTimestamp = new Date().toISOString();
      
      // 현재 시간이 근무시간 외인지 확인
      const isOutsideWorkHours = !isWithinWorkHours(currentTimestamp, workSettings);
      
      // 현재 요일 가져오기
      const today = new Date();
      const dayOfWeek = today.getDay();
      const todaySettings = workSettings.find(s => s.day_of_week === dayOfWeek);
      
      // 시간외 근무 처리 - 퇴근 기록이나 출근 기록이 근무시간 외인 경우
      let recordType = currentAction;
      
      // 오늘이 근무일이 아니거나 근무시간 외인 경우
      if (!todaySettings?.is_working_day || isOutsideWorkHours) {
        // 사용자에게 시간외 근무로 처리됨을 알림
        const dayName = ['일', '월', '화', '수', '목', '금', '토'][dayOfWeek];
        const confirm = window.confirm(
          `${dayName}요일 ${new Date().toLocaleTimeString()}은(는) ` +
          (todaySettings?.is_working_day ? '근무시간 외' : '비근무일') + '입니다.\n' +
          `시간외 근무로 기록하시겠습니까?`
        );
        
        if (confirm) {
          // 시간외 근무로 변경
          if (currentAction === 'check_out') {
            recordType = 'overtime_end';
          }
          // 출근은 그대로 출근으로 기록하되, 시간외임을 기록
        } else {
          // 취소 시 처리 중단
          throw new Error('시간외 근무 기록이 취소되었습니다.');
        }
      }

      // 시간외 근무 종료 QR을 찍고, 근무시간 외인 경우 자동으로 퇴근 기록도 추가
      let additionalRecord = null;
      if (recordType === 'overtime_end') {
        // 이미 퇴근 기록이 있는지 확인
        const hasCheckOut = todayRecords.some(record => record.record_type === 'check_out');
        
        // 현재 시간이 점심시간인지 확인
        let isLunchTime = false;
        if (todaySettings && todaySettings.lunch_start_time !== '00:00' && todaySettings.lunch_end_time !== '00:00') {
          const currentDate = new Date();
          const currentHours = currentDate.getHours();
          const currentMinutes = currentDate.getMinutes();
          const currentTimeStr = `${String(currentHours).padStart(2, '0')}:${String(currentMinutes).padStart(2, '0')}`;
          
          const lunchStartMinutes = todaySettings.lunch_start_time.split(':').reduce((acc, val, i) => acc + (i === 0 ? parseInt(val) * 60 : parseInt(val)), 0);
          const lunchEndMinutes = todaySettings.lunch_end_time.split(':').reduce((acc, val, i) => acc + (i === 0 ? parseInt(val) * 60 : parseInt(val)), 0);
          const currentTotalMinutes = currentTimeStr.split(':').reduce((acc, val, i) => acc + (i === 0 ? parseInt(val) * 60 : parseInt(val)), 0);
          
          isLunchTime = currentTotalMinutes >= lunchStartMinutes && currentTotalMinutes <= lunchEndMinutes;
        }
        
        // 퇴근 기록이 없고, 현재 시간이 근무시간 외(점심시간은 제외)라면 퇴근 기록 추가
        if (!hasCheckOut && (isOutsideWorkHours || !todaySettings?.is_working_day) && !isLunchTime) {
          additionalRecord = {
            user_id: profile.id,
            record_type: 'check_out' as 'check_in' | 'check_out' | 'overtime_end',
            location: data.location,
            timestamp: currentTimestamp
          };
        }
      }
      
      // 출결 기록 저장
      const result = await saveAttendance(profile.id, recordType, data.location);
      
      if (!result.success) {
        throw new Error(result.error?.message || '출결 기록 중 오류가 발생했습니다.');
      }

      // 추가 기록(자동 퇴근) 저장
      if (additionalRecord) {
        const additionalResult = await saveAttendance(
          additionalRecord.user_id, 
          additionalRecord.record_type, 
          additionalRecord.location
        );
        
        if (!additionalResult.success) {
          console.warn('자동 퇴근 기록 저장 실패:', additionalResult.error);
        }
      }

      // 기록 후 오늘의 기록 다시 로드
      const records = await getTodayAttendance(profile.id);
      setTodayRecords(records);
      
      // 이번달 기록도 다시 로드
      const monthRecords = await getMonthAttendance(profile.id);
      setMonthRecords(monthRecords);

      // 성공 메시지
      const actionText = getRecordTypeLabel(recordType);
      const timeInfo = isOutsideWorkHours || !todaySettings?.is_working_day ? ' (시간외 근무)' : '';
      const formattedTime = formatTimestamp(currentTimestamp);
      let successMessage = `${actionText} 기록이 완료되었습니다.${timeInfo}\n위치: ${data.location}\n시간: ${formattedTime}`;
      
      // 자동 퇴근 기록이 추가된 경우 메시지에 추가
      if (additionalRecord) {
        successMessage += '\n\n또한 퇴근 기록도 자동으로 추가되었습니다.';
      }
      
      alert(successMessage);
    } catch (error: any) {
      console.error('QR 출결 기록 오류:', error);
      setError(error.message || '출결 기록 중 오류가 발생했습니다.');
    } finally {
      setActionLoading(false);
      setCurrentAction(null);
    }
  };

  // 출퇴근 기록 저장 함수 (기존 코드 대체)
  const handleAttendance = (recordType: 'check_in' | 'check_out' | 'overtime_end') => {
    openQRScanner(recordType);
  };

  // 로그아웃 함수
  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      navigate('/login');
    } catch (error) {
      console.error('로그아웃 오류:', error);
      setError('로그아웃 중 오류가 발생했습니다.');
    }
  };

  // 오늘 이미 기록한 출퇴근 체크
  const hasCheckedIn = todayRecords.some(record => record.record_type === 'check_in');
  const hasCheckedOut = todayRecords.some(record => record.record_type === 'check_out');
  const hasEndedOvertime = todayRecords.some(record => record.record_type === 'overtime_end');

  // 날짜 포맷 함수
  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  };

  // 달력 토글 함수
  const toggleMonthCalendar = () => {
    setShowMonthCalendar(!showMonthCalendar);
  };
  
  // 점심시간 없음 체크 여부 확인
  const hasNoLunchTime = (setting: AttendanceSettings) => {
    return setting.lunch_start_time === "00:00" && setting.lunch_end_time === "00:00";
  };
  
  // 근무 시간 관련 정보 계산 함수
  const getAttendanceStatus = (records: AttendanceRecord[]) => {
    if (!workSettings || workSettings.length === 0) return null;
    
    const checkInRecord = records.find(r => r.record_type === 'check_in');
    const checkOutRecord = records.find(r => r.record_type === 'check_out');
    const overtimeEndRecord = records.find(r => r.record_type === 'overtime_end');
    
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
    
    // 지각 확인 (근무일인 경우에만)
    if (daySetting.is_working_day) {
      const lateStatus = checkLateStatus(checkInRecord.timestamp, daySetting.work_start_time);
      if (lateStatus.isLate && lateStatus.minutesLate > 0) {
        result.late = { 
          isLate: true, 
          minutesLate: lateStatus.minutesLate 
        };
      }
    }
    
    // 퇴근 또는 시간외 근무 종료 기록이 있는 경우
    const lastRecord = checkOutRecord || overtimeEndRecord;
    
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
      
      // 공휴일 근무 시간 체크
      const checkInDateStr = `${checkInDate.getFullYear()}-${String(checkInDate.getMonth() + 1).padStart(2, '0')}-${String(checkInDate.getDate()).padStart(2, '0')}`;
      const isHoliday = holidayWorks.some(h => h.date === checkInDateStr);
      
      // 시간외 근무 계산 - 시간외 근무 종료를 찍은 경우에만 계산 (공휴일 제외)
      if (overtimeEndRecord && !isHoliday) {
        // 시간외 근무 종료 기록이 있고 공휴일이 아닌 경우에만 시간외 근무로 카운팅
        if (isNonWorkingDay) {
          // 비근무일(주말/휴일이지만 공휴일로 지정되지 않은 경우)인 경우 전체 시간을 시간외 근무로 계산
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
          
          // 근무 시작 시간 설정
          const [workStartHour, workStartMinute] = daySetting.work_start_time.split(':').map(Number);
          const workStartTime = new Date(today);
          workStartTime.setHours(workStartHour, workStartMinute, 0, 0);
          
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
          
          // 점심시간 동안 시간외 근무 추가
          if (!hasNoLunchTime(daySetting)) {
            // 점심 시작 시간 설정
            const [lunchStartHour, lunchStartMinute] = daySetting.lunch_start_time.split(':').map(Number);
            const lunchStartTime = new Date(today);
            lunchStartTime.setHours(lunchStartHour, lunchStartMinute, 0, 0);
            
            // 점심 종료 시간 설정
            const [lunchEndHour, lunchEndMinute] = daySetting.lunch_end_time.split(':').map(Number);
            const lunchEndTime = new Date(today);
            lunchEndTime.setHours(lunchEndHour, lunchEndMinute, 0, 0);
            
            // 시간외 근무 종료 시간이 점심시간 내인지 확인
            const isOvertimeEndDuringLunch = 
              overtimeEndTime >= lunchStartTime && overtimeEndTime <= lunchEndTime;
              
            // 점심시간에 시간외 근무 종료를 찍은 경우
            if (isOvertimeEndDuringLunch) {
              // 점심 시작 시간부터 시간외 근무 종료 시간까지만 계산 (실제 근무한 시간)
              const lunchWorkMinutes = Math.floor((overtimeEndTime.getTime() - lunchStartTime.getTime()) / (1000 * 60));
              overtimeMinutes += lunchWorkMinutes;
            }
          }
          
          if (overtimeMinutes > 0) {
            result.overtime = {
              minutes: overtimeMinutes,
              formatted: formatMinutesToHoursAndMinutes(overtimeMinutes)
            };
            
            // 총 근무시간에 시간외 근무시간 포함
            result.totalWorkHours = {
              minutes: workHours.totalMinutes + overtimeMinutes,
              formatted: formatMinutesToHoursAndMinutes(workHours.totalMinutes + overtimeMinutes)
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
        // 퇴근 기록이 없는 경우에도 totalWorkHours 설정
        if (result.workHours) {
          result.totalWorkHours = {
            minutes: result.workHours.totalMinutes,
            formatted: result.workHours.formattedTime
          };
        }
      }
    }
    
    // 공휴일 근무 시간 추가
    const checkInDateStr = `${checkInDate.getFullYear()}-${String(checkInDate.getMonth() + 1).padStart(2, '0')}-${String(checkInDate.getDate()).padStart(2, '0')}`;
    const holidayWorkForThisDay = holidayWorks.find(h => h.date === checkInDateStr);
    
    if (holidayWorkForThisDay) {
      // 오늘 날짜인지 확인
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const isToday = checkInDateStr === todayStr;
      
      let totalMinutes = holidayWorkForThisDay.work_minutes;
      let extraOvertimeTotal = 0;
      
      // DB에 저장된 추가 시간외 근무시간이 있으면 추가
      if (holidayWorkForThisDay.extra_overtime_minutes) {
        totalMinutes += holidayWorkForThisDay.extra_overtime_minutes;
        extraOvertimeTotal += holidayWorkForThisDay.extra_overtime_minutes;
      }
      
      // 오늘이고, 방금 입력한 추가 시간외 근무시간이 아직 DB에 반영되지 않은 경우에만 추가
      // DB에 저장된 extra_overtime_minutes가 없거나 employeeExtraOvertime이 더 큰 경우만 추가
      if (isToday && (!holidayWorkForThisDay.extra_overtime_minutes || extraOvertimeMinutes > holidayWorkForThisDay.extra_overtime_minutes)) {
        // DB에 저장된 값이 없는 경우 전체 값을 더하고, 있는 경우 차이만 더함
        const additionalMinutes = holidayWorkForThisDay.extra_overtime_minutes 
          ? extraOvertimeMinutes - holidayWorkForThisDay.extra_overtime_minutes 
          : extraOvertimeMinutes;
        
        if (additionalMinutes > 0) {
          totalMinutes += additionalMinutes;
          extraOvertimeTotal += additionalMinutes;
        }
      }
      
      result.holidayWork = {
        minutes: totalMinutes,
        formatted: formatMinutesToHoursAndMinutes(totalMinutes),
        description: holidayWorkForThisDay.description,
        extraMinutes: extraOvertimeTotal
      };
    }
    
    return result;
  };

  // 월별 총 시간외 근무 시간 계산 함수
  const calculateMonthlyOvertimeMinutes = () => {
    if (!monthRecords || monthRecords.length === 0 || !workSettings || workSettings.length === 0) {
      return 0;
    }
    
    // 날짜별로 기록 그룹화
    const recordsByDate = monthRecords.reduce((acc, record) => {
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
          const status = getAttendanceStatus(dayRecords);
          if (status && status.overtime) {
            totalOvertimeMinutes += status.overtime.minutes;
          }
        }
      }
    });
    
    return totalOvertimeMinutes;
  };
  
  // 월별 총 지각 시간 계산 함수
  const calculateMonthlyLateMinutes = () => {
    if (!monthRecords || monthRecords.length === 0 || !workSettings || workSettings.length === 0) {
      return 0;
    }
    
    // 날짜별로 기록 그룹화
    const recordsByDate = monthRecords.reduce((acc, record) => {
      const date = new Date(record.timestamp);
      const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      
      if (!acc[dateKey]) {
        acc[dateKey] = [];
      }
      
      acc[dateKey].push(record);
      return acc;
    }, {} as Record<string, AttendanceRecord[]>);
    
    // 각 날짜별 지각 시간 계산 후 합산
    let totalLateMinutes = 0;
    
    Object.values(recordsByDate).forEach(dayRecords => {
      const status = getAttendanceStatus(dayRecords);
      if (status && status.late && status.late.isLate) {
        totalLateMinutes += status.late.minutesLate;
      }
    });
    
    return totalLateMinutes;
  };
  
  // 월별 총 시간외 근무 시간
  const monthlyOvertimeMinutes = calculateMonthlyOvertimeMinutes();
  const monthlyOvertimeFormatted = monthlyOvertimeMinutes > 0 
    ? formatMinutesToHoursAndMinutes(monthlyOvertimeMinutes) 
    : '';
    
  // 월별 총 지각 시간
  const monthlyLateMinutes = calculateMonthlyLateMinutes();
  const monthlyLateFormatted = monthlyLateMinutes > 0 
    ? formatMinutesToHoursAndMinutes(monthlyLateMinutes) 
    : '';

  // 근무시간 설정 열기
  const openWorkSettings = () => {
    if (workSettings.length > 0) {
      setTempWorkSettings([...workSettings]);
    }
    setIsSettingsModalOpen(true);
  };
  
  // 요일명 반환 함수
  const getDayName = (dayOfWeek: number): string => {
    const dayNames = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
    return dayNames[dayOfWeek] || '알 수 없음';
  };
  
  // 설정 탭 변경 함수
  const changeSettingTab = (dayOfWeek: number) => {
    setActiveSettingTab(dayOfWeek);
  };

  // 특정 요일 설정 업데이트
  const updateDaySettings = (dayOfWeek: number, field: string, value: any) => {
    setTempWorkSettings(prev => prev.map(setting => {
      if (setting.day_of_week === dayOfWeek) {
        // 점심시간 없음 관련 처리
        if (field === 'no_lunch_time') {
          if (value === true) {
            // 점심시간 없음으로 설정 (토글 끄기)
            return { 
              ...setting, 
              lunch_start_time: "00:00",
              lunch_end_time: "00:00"
            };
          } else {
            // 점심시간 있음으로 설정 (토글 켜기)
            return { 
              ...setting, 
              lunch_start_time: "12:00",
              lunch_end_time: "13:00"
            };
          }
        }
        
        // 기타 필드 업데이트
        return { ...setting, [field]: value };
      }
      return setting;
    }));
  };

  // 근무시간 설정 저장
  const saveWorkSettings = async () => {
    // 필수 입력 필드 검증
    const invalidSettings = tempWorkSettings.find(s => 
      s.is_working_day && (!s.work_start_time || !s.work_end_time || 
        (!hasNoLunchTime(s) && (!s.lunch_start_time || !s.lunch_end_time)))
    );
    
    if (invalidSettings) {
      setError(`${getDayName(invalidSettings.day_of_week)}의 시간 설정을 모두 입력해주세요.`);
      return;
    }

    try {
      setIsUpdatingSettings(true);
      
      const result = await updateWorkSettings(tempWorkSettings);
      
      if (result.success) {
        setWorkSettings(tempWorkSettings);
        setIsSettingsModalOpen(false);
        alert('근무시간 설정이 저장되었습니다.');
      } else {
        throw new Error('설정 저장 중 오류가 발생했습니다.');
      }
    } catch (error: any) {
      console.error('근무시간 설정 저장 오류:', error);
      setError(error.message || '근무시간 설정 저장 중 오류가 발생했습니다.');
    } finally {
      setIsUpdatingSettings(false);
    }
  };

  // 공휴일 근무 시간 로드 함수 - 기존 구현 대체
  const loadHolidayWorks = async () => {
    try {
      const data = await getHolidayWorks();
      setHolidayWorks(data);
      console.log('공휴일 근무 시간 로드됨:', data.length, '개');
    } catch (error) {
      console.error('공휴일 근무 시간 로드 오류:', error);
    }
  };

  // 공휴일 근무 시간 저장 함수 - 기존 구현 대체
  const saveHolidayWork = async () => {
    if (!selectedHolidayDate || holidayWorkHours <= 0 || !profile) {
      setError('공휴일 정보를 모두 입력해주세요.');
      return;
    }
    
    try {
      setIsUpdatingHoliday(true);
      
      // 시간을 분으로 변환
      const minutes = holidayWorkHours * 60;
      
      const holidayData: HolidayWork = {
        date: selectedHolidayDate,
        work_minutes: minutes,
        description: holidayDescription,
        created_by: profile.id,
        created_at: new Date().toISOString()
      };
      
      const result = await saveHolidayWorkApi(holidayData);
      
      if (!result.success) {
        throw new Error(result.error?.message || '저장 중 오류가 발생했습니다.');
      }
      
      // 공휴일 목록 새로고침
      await loadHolidayWorks();
      
      // 입력 필드 초기화
      setSelectedHolidayDate('');
      setHolidayWorkHours(0);
      setHolidayDescription('');
      setIsHolidayModalOpen(false);
      
      alert('공휴일 근무 시간이 저장되었습니다.');
    } catch (error: any) {
      console.error('공휴일 근무 시간 저장 오류:', error);
      setError('공휴일 근무 시간 저장 중 오류가 발생했습니다: ' + error.message);
    } finally {
      setIsUpdatingHoliday(false);
    }
  };

  // 공휴일 근무 시간 삭제 함수 - 기존 구현 대체
  const deleteHolidayWork = async (id: string) => {
    if (!window.confirm('이 공휴일 근무 시간을 삭제하시겠습니까?')) {
      return;
    }
    
    try {
      const result = await deleteHolidayWorkApi(id);
      
      if (!result.success) {
        throw new Error(result.error?.message || '삭제 중 오류가 발생했습니다.');
      }
      
      // 공휴일 목록 새로고침
      await loadHolidayWorks();
      
      alert('공휴일 근무 시간이 삭제되었습니다.');
    } catch (error: any) {
      console.error('공휴일 근무 시간 삭제 오류:', error);
      setError('공휴일 근무 시간 삭제 중 오류가 발생했습니다: ' + error.message);
    }
  };

  // 공휴일 추가 시간외 근무시간 저장 함수
  const saveExtraOvertimeMinutes = async () => {
    if (extraOvertimeMinutes <= 0) {
      setError('추가 시간외 근무시간을 입력해주세요.');
      return;
    }
    
    if (!profile) {
      setError('프로필 정보가 없습니다.');
      return;
    }
    
    try {
      setActionLoading(true);
      
      // 오늘 날짜 가져오기 (YYYY-MM-DD 형식)
      const today = new Date();
      const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      
      // 추가 시간외 근무시간 DB에 저장
      const result = await updateHolidayWorkExtraOvertime(dateStr, profile.id, extraOvertimeMinutes);
      
      if (!result.success) {
        throw new Error(result.error?.message || '저장 중 오류가 발생했습니다.');
      }
      
      // 입력 필드 초기화 및 모달 닫기
      setExtraOvertimeMinutes(0);
      setIsExtraOvertimeModalOpen(false);
      
      // 공휴일 목록 새로고침 (최신 데이터 반영)
      await loadHolidayWorks();
      
      alert('공휴일 추가 시간외 근무시간이 저장되었습니다.');
    } catch (error: any) {
      console.error('추가 시간외 근무시간 저장 오류:', error);
      setError('추가 시간외 근무시간 저장 중 오류가 발생했습니다: ' + error.message);
    } finally {
      setActionLoading(false);
    }
  };

  // 공휴일 근무 시간 표시 함수 (8시간 초과 시 별도 표시)
  const formatHolidayWorkTime = (minutes: number) => {
    const standardMinutes = 480; // 8시간 = 480분
    
    if (minutes <= standardMinutes) {
      // 8시간 이하인 경우 일반 표시
      return formatMinutesToHoursAndMinutes(minutes);
    } else {
      // 8시간 초과인 경우 '8시간 초과 X시간 X분' 형식으로 표시
      const excessMinutes = minutes - standardMinutes;
      const excessHours = Math.floor(excessMinutes / 60);
      const excessMin = excessMinutes % 60;
      
      let formattedExcess = '';
      if (excessHours > 0) {
        formattedExcess += `${excessHours}시간`;
      }
      if (excessMin > 0) {
        formattedExcess += ` ${excessMin}분`;
      }
      
      return `8시간 초과 ${formattedExcess.trim()}`;
    }
  };
  
  // 분을 시간으로 변환하여 포맷팅하는 함수 (관리자용)
  const formatMinutesToHours = (minutes: number) => {
    const hours = minutes / 60;
    return `${hours.toFixed(1)}시간`;
  };

  // 날짜 포맷 함수 (YYYY-MM-DD를 YYYY년 MM월 DD일로 변환)
  const formatDateToKorean = (dateString: string, includeWeekday: boolean = false) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ko-KR', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      weekday: includeWeekday ? 'long' : undefined
    });
  };

  // 사용자별 공휴일 근무 시간 계산 (로컬 계산용)
  const calculateUserHolidayWorkMinutesLocal = (userId: string) => {
    if (!holidayWorks || holidayWorks.length === 0 || !monthRecords || monthRecords.length === 0) {
      return { 
        totalMinutes: 0, 
        regularMinutes: 0, 
        exceededMinutes: 0 
      };
    }
    
    // 사용자의 출근 기록이 있는 날짜만 추출
    const userCheckInDates = monthRecords
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
  
  // 현재 사용자의 공휴일 근무 시간 계산
  const currentUserHolidayWorkMinutes = profile ? calculateUserHolidayWorkMinutesLocal(profile.id) : { 
    totalMinutes: 0, 
    regularMinutes: 0, 
    exceededMinutes: 0 
  };

  // 총 근무시간 계산 함수 (공휴일 및 휴무일 제외 근무 + 시간외 + 휴일 근무 합산)
  const calculateTotalWorkMinutes = () => {
    if (!profile || !monthRecords || monthRecords.length === 0 || !workSettings || workSettings.length === 0) {
      return 0;
    }
    
    // 1. 공휴일과 휴무일을 제외한 일반 근무시간 계산
    let regularWorkMinutes = 0;
    
    // 날짜별로 기록 그룹화
    const recordsByDate = monthRecords.reduce((acc, record) => {
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
        const status = getAttendanceStatus(dayRecords);
        if (status && status.workHours) {
          regularWorkMinutes += status.workHours.totalMinutes;
        }
      }
    });
    
    // 2. 시간외 근무시간 (공휴일 제외)
    const overtimeMinutes = calculateMonthlyOvertimeMinutes();
    
    // 3 & 4. 휴일 근무시간 (8시간 이하 + 초과분)
    const holidayWorkStats = calculateUserHolidayWorkMinutesLocal(profile.id);
    
    // 합산하여 총 근무시간 계산
    return regularWorkMinutes + overtimeMinutes + holidayWorkStats.totalMinutes;
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
    <div className="bg-gray-50 min-h-screen fade-in">
      {/* 앱 설치 배너 */}
      {showInstallBanner && (
        <div className="install-banner">
          <div>
            <p className="font-medium">앱으로 설치하기</p>
            <p className="text-sm opacity-80">더 나은 경험을 위해 앱으로 설치하세요</p>
          </div>
          <button 
            onClick={handleInstall}
            className="bg-white text-indigo-600 px-4 py-2 rounded-md text-sm font-medium"
          >
            설치
          </button>
        </div>
      )}
    
      {/* 헤더 */}
      <header className="app-header bg-white shadow-sm">
        <div className="px-4 py-4 flex flex-col sm:flex-row sm:justify-between sm:items-center">
          <h1 className="text-lg font-bold text-gray-900 mb-2 sm:mb-0">샤인치과 출결관리</h1>
          
          <div className="flex flex-wrap items-center gap-2 sm:gap-4">
            {/* 관리자인 경우 전체 직원 근무일지 버튼 표시 */}
            {profile && profile.role === 'admin' && (
              <button 
                onClick={() => navigate('/employee-report')}
                className="px-3 py-1.5 text-sm font-medium bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200"
              >
                전체 직원 근무일지
              </button>
            )}
            
            {profile && (
              <div className="flex items-center">
                <div className="h-8 w-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm mr-2">
                  {profile.photo_url ? (
                    <img 
                      src={profile.photo_url} 
                      alt={profile.name || '프로필'} 
                      className="h-8 w-8 rounded-full object-cover"
                    />
                  ) : (
                    profile.name?.[0]?.toUpperCase() || '?'
                  )}
                </div>
                <span className="text-sm font-medium text-gray-700 mr-2">
                  {profile.name || '이름 없음'}
                </span>
              </div>
            )}
            
            <button
              onClick={handleLogout}
              className="text-sm text-gray-500 hover:text-gray-700 whitespace-nowrap"
            >
              로그아웃
            </button>
          </div>
        </div>
      </header>

      {/* 계정 정보 섹션 */}
      <div className="bg-white shadow-sm px-4 py-3 mb-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center mb-2 sm:mb-0">
            <div className="h-12 w-12 rounded-full bg-blue-500 flex items-center justify-center text-white text-lg mr-3">
              {profile && profile.photo_url ? (
                <img 
                  src={profile.photo_url} 
                  alt={profile?.name || '프로필'} 
                  className="h-12 w-12 rounded-full object-cover"
                />
              ) : (
                (profile?.name?.[0] || '?').toUpperCase()
              )}
            </div>
            <div>
              <div className="flex items-center">
                <h2 className="text-lg font-bold text-gray-900">
                  {profile?.name || '이름 정보 없음'}
                </h2>
                <span className={`ml-2 px-2 py-0.5 text-xs rounded-full ${
                  profile?.role === 'admin' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'
                }`}>
                  {profile?.role === 'admin' ? '관리자' : '직원'}
                </span>
              </div>
              <p className="text-sm text-gray-600">
                {profile?.department || '부서 정보 없음'} • 
                <span className="text-blue-600"> {userEmail || '이메일 정보 없음'}</span>
              </p>
            </div>
          </div>
          <div className="flex flex-col items-start sm:items-end">
            <p className="text-sm text-gray-500 mb-1 whitespace-normal">
              {new Date().toLocaleDateString('ko-KR', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric'
              })}
              <span className="ml-1">
                {new Date().toLocaleDateString('ko-KR', { weekday: 'long' })}
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* 메인 컨텐츠 */}
      <main className="px-4 py-6">
        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-md mb-4 text-sm">
            {error}
          </div>
        )}

        {/* 관리자용 QR 코드 생성 버튼 */}
        {profile?.role === 'admin' && (
          <div className="bg-white shadow rounded-xl p-5 mb-5">
            <h2 className="text-lg font-bold text-gray-900 mb-4">QR 코드 관리 (관리자용)</h2>
            <div className="grid grid-cols-1 gap-3">
              <button
                onClick={() => openQRGenerator('check_in')}
                className="p-3 rounded-xl font-medium bg-blue-100 text-blue-800"
              >
                출근용 QR 코드 생성
              </button>
              <button
                onClick={() => openQRGenerator('check_out')}
                className="p-3 rounded-xl font-medium bg-amber-100 text-amber-800"
              >
                퇴근용 QR 코드 생성
              </button>
              <button
                onClick={() => openQRGenerator('overtime_end')}
                className="p-3 rounded-xl font-medium bg-purple-100 text-purple-800"
              >
                시간외근무 종료용 QR 코드 생성
              </button>
            </div>
          </div>
        )}
        
        {/* 관리자용 공휴일 근무 시간 관리 */}
        {profile?.role === 'admin' && (
          <div className="bg-white shadow rounded-xl p-5 mb-5">
            <h2 className="text-lg font-bold text-gray-900 mb-4">공휴일 근무 시간 관리 (관리자용)</h2>
            
            {/* 공휴일 근무 시간 목록 */}
            {holidayWorks.length > 0 ? (
              <div className="mb-4 bg-gray-50 p-2 sm:p-4 rounded-lg overflow-hidden">
                <div className="table-container">
                  <table className="w-full" style={{minWidth: "550px"}}>
                    <thead className="border-b">
                      <tr>
                        <th className="p-2 text-left text-sm font-medium text-gray-500" style={{width: "35%"}}>날짜</th>
                        <th className="p-2 text-left text-sm font-medium text-gray-500" style={{width: "25%"}}>근무시간</th>
                        <th className="p-2 text-left text-sm font-medium text-gray-500" style={{width: "30%"}}>설명</th>
                        <th className="p-2 text-right text-sm font-medium text-gray-500" style={{width: "10%"}}>관리</th>
                      </tr>
                    </thead>
                    <tbody>
                      {holidayWorks.map((holiday) => (
                        <tr key={holiday.id} className="border-b border-gray-200 hover:bg-gray-100">
                          <td className="p-2 text-sm text-gray-800">
                            {formatDateToKorean(holiday.date)}
                          </td>
                          <td className="p-2 text-sm text-gray-800">
                            <div>{formatMinutesToHours(holiday.work_minutes)}</div>
                            {holiday.work_minutes > 480 && (
                              <div className="text-xs text-red-500 font-medium mt-1">
                                8시간 초과: {formatMinutesToHours(holiday.work_minutes - 480)}
                              </div>
                            )}
                          </td>
                          <td className="p-2 text-sm text-gray-800">
                            {holiday.description}
                          </td>
                          <td className="p-2 text-right">
                            <button
                              onClick={() => deleteHolidayWork(holiday.id!)}
                              className="text-xs text-red-600 hover:text-red-800"
                            >
                              삭제
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="mb-4 bg-gray-50 p-4 rounded-lg text-center text-gray-500">
                등록된 공휴일 근무 시간이 없습니다.
              </div>
            )}
            
            <button
              onClick={() => {
                setSelectedHolidayDate('');
                setHolidayWorkHours(8); // 기본값 8시간으로 변경
                setHolidayDescription('');
                setIsHolidayModalOpen(true);
              }}
              className="w-full p-3 bg-indigo-100 text-indigo-800 rounded-xl font-medium"
            >
              공휴일 근무 시간 추가
            </button>
          </div>
        )}
        
        {/* 관리자용 근무시간 설정 */}
        {profile?.role === 'admin' && (
          <div className="bg-white shadow rounded-xl p-5 mb-5">
            <h2 className="text-lg font-bold text-gray-900 mb-4">근무시간 설정 (관리자용)</h2>
            
            {workSettings && workSettings.length > 0 && (
              <div className="mb-4 bg-gray-50 p-4 rounded-lg overflow-x-auto">
                <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-4 gap-4 min-w-[300px]">
                  {workSettings.map((setting) => (
                    <div key={setting.day_of_week} className={`p-3 rounded-lg ${
                      setting.is_working_day ? 'bg-blue-50 border border-blue-100' : 'bg-gray-100 border border-gray-200'
                    }`}>
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-medium text-gray-800">{getDayName(setting.day_of_week).replace('요일', '')}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          setting.is_working_day ? 'bg-blue-100 text-blue-800' : 'bg-gray-300 text-gray-700'
                        }`}>
                          {setting.is_working_day ? '근무일' : '휴무일'}
                        </span>
                      </div>
                      
                      {setting.is_working_day && (
                        <div className="text-xs text-gray-600">
                          <p>근무: {setting.work_start_time} ~ {setting.work_end_time}</p>
                          {!hasNoLunchTime(setting) ? (
                            <p>점심: {setting.lunch_start_time} ~ {setting.lunch_end_time}</p>
                          ) : (
                            <p>점심시간 없음</p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                
               
                
              </div>
            )}
            
            <button
              onClick={openWorkSettings}
              className="w-full p-3 bg-indigo-100 text-indigo-800 rounded-xl font-medium"
            >
              근무시간 설정 변경
            </button>
          </div>
        )}

        {/* 출퇴근 버튼 */}
        <div className="bg-white shadow rounded-xl p-5 mb-5">
          <h2 className="text-lg font-bold text-gray-900 mb-4">근무 기록</h2>
          
          <div className="grid grid-cols-1 gap-3">
            <button
              onClick={() => handleAttendance('check_in')}
              disabled={actionLoading || hasCheckedIn}
              className={`p-4 rounded-xl font-medium text-lg ${
                hasCheckedIn 
                  ? 'bg-green-100 text-green-800' 
                  : 'bg-blue-600 text-white active:bg-blue-700'
              } disabled:opacity-50`}
            >
              {hasCheckedIn 
                ? '✓ 출근 완료' 
                : actionLoading ? '처리 중...' : '출근 QR 스캔하기'}
            </button>
            
            <button
              onClick={() => handleAttendance('check_out')}
              disabled={actionLoading || !hasCheckedIn || hasCheckedOut}
              className={`p-4 rounded-xl font-medium text-lg ${
                hasCheckedOut 
                  ? 'bg-green-100 text-green-800' 
                  : 'bg-amber-600 text-white active:bg-amber-700'
              } disabled:opacity-50`}
            >
              {hasCheckedOut 
                ? '✓ 퇴근 완료' 
                : actionLoading ? '처리 중...' : '퇴근 QR 스캔하기'}
            </button>
            
            <button
              onClick={() => handleAttendance('overtime_end')}
              disabled={actionLoading || !hasCheckedIn || hasEndedOvertime}
              className={`p-4 rounded-xl font-medium text-lg ${
                hasEndedOvertime 
                  ? 'bg-green-100 text-green-800' 
                  : 'bg-purple-600 text-white active:bg-purple-700'
              } disabled:opacity-50`}
            >
              {hasEndedOvertime 
                ? '✓ 시간외 근무 종료 완료' 
                : actionLoading ? '처리 중...' : '시간외근무 종료 QR 스캔하기'}
            </button>
            
            {/* 공휴일 추가 시간외 근무시간 버튼 추가 - 당일이 공휴일인 경우에만 활성화 */}
            {(() => {
              // 오늘 날짜가 공휴일인지 확인
              const today = new Date();
              const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
              const isTodayHoliday = holidayWorks.some(h => h.date === todayStr);
              
              return (
                <button
                  onClick={() => setIsExtraOvertimeModalOpen(true)}
                  disabled={!isTodayHoliday}
                  className={`p-4 rounded-xl font-medium text-lg ${
                    isTodayHoliday 
                      ? 'bg-red-600 text-white active:bg-red-700' 
                      : 'bg-gray-300 text-gray-600'
                  } disabled:opacity-50`}
                >
                  {isTodayHoliday 
                    ? '공휴일 추가 시간외 근무시간 입력' 
                    : '오늘은 공휴일이 아닙니다'}
                </button>
              );
            })()}
          </div>
        </div>

        {/* 오늘의 기록 */}
        <div className="bg-white shadow rounded-xl p-5 mb-5">
          <h2 className="text-lg font-bold text-gray-900 mb-4">오늘의 기록</h2>
          
          {todayRecords.length === 0 ? (
            <p className="text-gray-500 text-center py-4">
              오늘 기록된 출결 정보가 없습니다.
            </p>
          ) : (
            <div className="space-y-3">
              {/* 기록 목록 */}
              {todayRecords.map((record) => (
                <div key={record.id} className="flex justify-between items-center p-3 border border-gray-100 rounded-lg">
                  <span className="font-medium text-gray-800">
                    {getRecordTypeLabel(record.record_type)}
                  </span>
                  <span className="text-gray-600 bg-gray-100 px-3 py-1 rounded-full text-sm">
                    {formatTime(record.timestamp)}
                    {record.location && ` (${record.location})`}
                  </span>
                </div>
              ))}
              
              {/* 근무 상태 요약 */}
              {workSettings && workSettings.length > 0 && (
                <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <h3 className="font-medium text-gray-800 mb-2">근무 상태</h3>
                  
                  {(() => {
                    const status = getAttendanceStatus(todayRecords);
                    if (!status) return <p className="text-sm text-gray-500">근무 상태를 계산할 수 없습니다.</p>;
                    
                    return (
                      <div className="space-y-2">
                        {/* 지각 표시 */}
                        {status.late && status.late.isLate && (
                          <div className="flex items-center text-sm">
                            <div className="h-2 w-2 bg-amber-500 rounded-full mr-2"></div>
                            <span className="text-amber-700 font-medium">
                              {status.late.minutesLate}분 지각
                            </span>
                          </div>
                        )}
                        
                        {/* 조퇴 표시 */}
                        {status.earlyLeave && status.earlyLeave.isEarlyLeave && (
                          <div className="flex items-center text-sm">
                            <div className="h-2 w-2 bg-amber-500 rounded-full mr-2"></div>
                            <span className="text-amber-700 font-medium">
                              {status.earlyLeave.minutesEarly}분 조퇴
                            </span>
                          </div>
                        )}
                        
                        {/* 시간외 근무 표시 */}
                        {status.overtime && (
                          <div className="flex items-center text-sm">
                            <div className="h-2 w-2 bg-purple-500 rounded-full mr-2"></div>
                            <span className="text-purple-700 font-medium">
                              시간외 {status.overtime.formatted} 근무
                            </span>
                          </div>
                        )}

                        {/* 공휴일 근무 표시 - 직원에게는 분 단위로 표시 */}
                        {status.holidayWork && (
                          <div className="flex items-center text-sm">
                            <div className="h-2 w-2 bg-red-500 rounded-full mr-2"></div>
                            <span className="text-red-700 font-medium">
                              공휴일({status.holidayWork.description}) {formatHolidayWorkTime(status.holidayWork.minutes)} 근무
                              {status.holidayWork.extraMinutes > 0 && (
                                <span className="ml-1">(추가 시간외: {formatMinutesToHoursAndMinutes(status.holidayWork.extraMinutes)})</span>
                              )}
                            </span>
                          </div>
                        )}
                        
                        {/* 총 근무시간 표시 - 시간외 근무시간 포함 */}
                        {status.workHours && (
                          <div className="flex items-center text-sm">
                            <div className="h-2 w-2 bg-blue-500 rounded-full mr-2"></div>
                            <span className="text-blue-700 font-medium">
                              총 {status.totalWorkHours 
                                ? status.totalWorkHours.formatted 
                                : status.workHours.formattedTime} 근무
                              {status.overtime && (
                                <span className="ml-1 text-xs text-gray-500">(기본: {status.workHours.formattedTime})</span>
                              )}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* 이번달 기록 */}
        <div className="bg-white shadow rounded-xl p-5 mb-5">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-3 sm:mb-2">
            <div>
              <h2 className="text-lg font-bold text-gray-900 mb-2 sm:mb-0">이번달 기록</h2>
              <div className="flex flex-wrap gap-1 my-2">
                {/* 총 근무시간 표시 */}
                <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded-full">
                  총 근무시간 {formatMinutesToHoursAndMinutes(calculateTotalWorkMinutes())}
                </span>
                {monthlyOvertimeMinutes > 0 && (
                  <span className="px-2 py-1 bg-purple-100 text-purple-800 text-xs font-medium rounded-full">
                    시간외 {monthlyOvertimeFormatted}
                  </span>
                )}
                {monthlyLateMinutes > 0 && (
                  <span className="px-2 py-1 bg-amber-100 text-amber-800 text-xs font-medium rounded-full">
                    지각 {monthlyLateFormatted}
                  </span>
                )}
                {currentUserHolidayWorkMinutes.regularMinutes > 0 && (
                  <span className="px-2 py-1 bg-red-100 text-red-800 text-xs font-medium rounded-full">
                    휴일 {formatMinutesToHoursAndMinutes(currentUserHolidayWorkMinutes.regularMinutes)}
                  </span>
                )}
                {currentUserHolidayWorkMinutes.exceededMinutes > 0 && (
                  <span className="px-2 py-1 bg-red-200 text-red-800 text-xs font-medium rounded-full">
                    휴일 8시간 초과 {formatMinutesToHoursAndMinutes(currentUserHolidayWorkMinutes.exceededMinutes)}
                  </span>
                )}
              </div>
            </div>
            <button 
              onClick={toggleMonthCalendar}
              className="text-blue-600 hover:text-blue-700 text-sm font-medium mt-2 sm:mt-0"
            >
              {showMonthCalendar ? '접기' : '달력 보기'}
            </button>
          </div>
          
          {showMonthCalendar ? (
            <div className="mt-2">
              <AttendanceCalendar records={monthRecords} workSettings={workSettings} holidayWorks={holidayWorks} />
            </div>
          ) : (
            <p className="text-sm text-gray-600 py-2">
              이번달 총 {monthRecords.filter(r => r.record_type === 'check_in').length}회 출근, 
              {monthRecords.filter(r => r.record_type === 'check_out').length}회 퇴근 기록이 있습니다.
            </p>
          )}
        </div>
      </main>

      {/* QR 스캐너 모달 */}
      {isQRScannerOpen && (
        <QRScanner 
          onScan={handleQRScan} 
          onClose={() => setIsQRScannerOpen(false)} 
        />
      )}

      {/* QR 코드 생성기 모달 */}
      {showQRCode && qrCodeType && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">
                {qrCodeType === 'check_in' && '출근용 QR 코드'}
                {qrCodeType === 'check_out' && '퇴근용 QR 코드'}
                {qrCodeType === 'overtime_end' && '시간외근무 종료용 QR 코드'}
              </h3>
              <button 
                onClick={() => setShowQRCode(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            <div className="flex justify-center mb-4">
              <QRCodeGenerator recordType={qrCodeType} />
            </div>
            <p className="text-sm text-gray-600 text-center mb-4">
              이 QR 코드를 직원들이 스캔하도록 하세요
            </p>
            <button
              onClick={() => setShowQRCode(false)}
              className="w-full bg-blue-600 text-white p-3 rounded-lg font-medium"
            >
              닫기
            </button>
          </div>
        </div>
      )}

      {/* 근무시간 설정 모달 */}
      {isSettingsModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md max-h-[90vh] overflow-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">근무시간 설정</h3>
              <button 
                onClick={() => setIsSettingsModalOpen(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            
            {/* 요일 탭 */}
            <div className="table-container">
              <div className="flex mb-4 pb-1 border-b min-w-[500px]">
                {tempWorkSettings.map((setting) => (
                  <button
                    key={setting.day_of_week}
                    onClick={() => changeSettingTab(setting.day_of_week)}
                    className={`px-3 py-2 mr-1 rounded-t-lg ${
                      activeSettingTab === setting.day_of_week 
                        ? 'bg-blue-100 text-blue-800 font-medium' 
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {getDayName(setting.day_of_week).replace('요일', '')}
                  </button>
                ))}
              </div>
            </div>
            
            {/* 선택한 요일 설정 */}
            {tempWorkSettings.map((setting) => (
              <div 
                key={setting.day_of_week} 
                className={activeSettingTab === setting.day_of_week ? 'block' : 'hidden'}
              >
                <div className="mb-4">
                  {/* 근무일/휴무일 토글 스위치 */}
                  <div 
                    className="mb-4 p-4 bg-white rounded-lg border-2 border-gray-200 shadow-sm"
                    onClick={() => updateDaySettings(setting.day_of_week, 'is_working_day', !setting.is_working_day)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="block text-lg font-bold text-gray-800">
                          {setting.is_working_day ? '근무일' : '휴무일'}
                        </span>
                        <span className="text-sm text-gray-500">
                          {setting.is_working_day 
                            ? '근무 시간과 점심 시간을 설정할 수 있습니다' 
                            : '휴무일로 설정되며, 모든 출결은 시간외 근무로 기록됩니다'}
                        </span>
                      </div>
                      <div className={`relative inline-block w-14 h-8 transition-colors duration-200 ease-in-out rounded-full ${
                        setting.is_working_day ? 'bg-blue-600' : 'bg-gray-300'
                      }`}>
                        <span className={`absolute left-1 top-1 w-6 h-6 transition-transform duration-200 ease-in-out transform ${
                          setting.is_working_day ? 'translate-x-6 bg-white' : 'translate-x-0 bg-white'
                        } rounded-full shadow-md`}></span>
                      </div>
                    </div>
                  </div>
                  
                  {setting.is_working_day && (
                    <div className="space-y-5 animate-fade-in p-4 bg-white rounded-lg border-2 border-blue-200 shadow-sm">
                      <h4 className="text-lg font-bold text-blue-800">근무 시간 설정</h4>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          근무 시작 시간
                        </label>
                        <input
                          type="time"
                          className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          value={setting.work_start_time || ''}
                          onChange={(e) => updateDaySettings(setting.day_of_week, 'work_start_time', e.target.value)}
                        />
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          근무 종료 시간
                        </label>
                        <input
                          type="time"
                          className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          value={setting.work_end_time || ''}
                          onChange={(e) => updateDaySettings(setting.day_of_week, 'work_end_time', e.target.value)}
                        />
                      </div>
                      
                      <div className="pt-5 mt-2 border-t-2 border-gray-100">
                        <div className="flex items-center justify-between mb-4"
                          onClick={() => updateDaySettings(setting.day_of_week, 'no_lunch_time', !hasNoLunchTime(setting))}
                        >
                          <div>
                            <h4 className="text-lg font-bold text-blue-800">점심 시간 설정</h4>
                            <span className="text-sm text-gray-500">
                              {hasNoLunchTime(setting) 
                                ? '점심 시간 없이 근무합니다' 
                                : '점심 시간을 설정합니다'}
                            </span>
                          </div>
                          <div className={`relative inline-block w-14 h-8 transition-colors duration-200 ease-in-out rounded-full cursor-pointer ${
                            !hasNoLunchTime(setting) ? 'bg-blue-600' : 'bg-gray-300'
                          }`}>
                            <span className={`absolute left-1 top-1 w-6 h-6 transition-transform duration-200 ease-in-out transform ${
                              !hasNoLunchTime(setting) ? 'translate-x-6 bg-white' : 'translate-x-0 bg-white'
                            } rounded-full shadow-md`}></span>
                          </div>
                        </div>
                        
                        {!hasNoLunchTime(setting) && (
                          <div className="space-y-4 animate-fade-in pl-2 border-l-4 border-blue-200">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">
                                점심 시작 시간
                              </label>
                              <input
                                type="time"
                                className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                value={setting.lunch_start_time || ''}
                                onChange={(e) => updateDaySettings(setting.day_of_week, 'lunch_start_time', e.target.value)}
                              />
                            </div>
                            
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">
                                점심 종료 시간
                              </label>
                              <input
                                type="time"
                                className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                value={setting.lunch_end_time || ''}
                                onChange={(e) => updateDaySettings(setting.day_of_week, 'lunch_end_time', e.target.value)}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
            
            <div className="flex space-x-3 mt-6">
              <button
                onClick={() => setIsSettingsModalOpen(false)}
                className="flex-1 py-3 border-2 border-gray-300 rounded-lg text-gray-700 font-medium"
              >
                취소
              </button>
              <button
                onClick={saveWorkSettings}
                disabled={isUpdatingSettings}
                className="flex-1 py-3 bg-blue-600 text-white rounded-lg font-medium disabled:opacity-50"
              >
                {isUpdatingSettings ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 공휴일 근무 시간 추가 모달 */}
      {isHolidayModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">공휴일 근무 시간 추가</h3>
              <button 
                onClick={() => setIsHolidayModalOpen(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  공휴일 날짜 선택
                </label>
                <input
                  type="date"
                  className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  value={selectedHolidayDate}
                  onChange={(e) => setSelectedHolidayDate(e.target.value)}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  근무 시간 (시간)
                </label>
                <input
                  type="number"
                  className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  value={holidayWorkHours}
                  onChange={(e) => {
                    const hours = parseFloat(e.target.value) || 0;
                    setHolidayWorkHours(hours);
                  }}
                  onFocus={(e) => e.target.select()} // 포커스시 텍스트 자동 선택
                  onClick={(e) => e.currentTarget.select()} // 클릭시 텍스트 자동 선택
                  placeholder="예: 8 (8시간)"
                  min="0"
                  step="0.5" // 30분 단위 입력 가능
                />
                {holidayWorkHours > 0 && (
                  <p className="mt-1 text-sm text-gray-500">
                    {holidayWorkHours}시간 ({formatMinutesToHoursAndMinutes(holidayWorkHours * 60)})
                    {holidayWorkHours > 8 && (
                      <span className="block mt-1 text-red-500 font-medium">
                        8시간 초과 {formatMinutesToHoursAndMinutes((holidayWorkHours * 60) - 480)}
                      </span>
                    )}
                  </p>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  설명 (공휴일명)
                </label>
                <input
                  type="text"
                  className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  value={holidayDescription}
                  onChange={(e) => setHolidayDescription(e.target.value)}
                  placeholder="예: 설날, 추석, 어린이날 등"
                />
              </div>
            </div>
            
            <div className="flex space-x-3 mt-6">
              <button
                onClick={() => setIsHolidayModalOpen(false)}
                className="flex-1 py-3 border-2 border-gray-300 rounded-lg text-gray-700 font-medium"
              >
                취소
              </button>
              <button
                onClick={saveHolidayWork}
                disabled={isUpdatingHoliday || !selectedHolidayDate || holidayWorkHours <= 0}
                className="flex-1 py-3 bg-blue-600 text-white rounded-lg font-medium disabled:opacity-50"
              >
                {isUpdatingHoliday ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 공휴일 추가 시간외 근무시간 입력 모달 */}
      {isExtraOvertimeModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">공휴일 추가 시간외 근무시간 입력</h3>
              <button 
                onClick={() => setIsExtraOvertimeModalOpen(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-4">
              {/* 오늘의 공휴일 정보 표시 */}
              {(() => {
                const today = new Date();
                const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
                const todayHoliday = holidayWorks.find(h => h.date === todayStr);
                
                if (todayHoliday) {
                  return (
                    <div className="p-4 bg-green-50 text-green-700 rounded-lg">
                      <p className="font-medium">오늘은 공휴일입니다: {todayHoliday.description}</p>
                      <p className="text-sm mt-1">기본 근무시간: {formatMinutesToHoursAndMinutes(todayHoliday.work_minutes)}</p>
                    </div>
                  );
                }
                
                return null;
              })()}
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  추가 시간외 근무시간 (분)
                </label>
                <input
                  type="number"
                  className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  value={extraOvertimeMinutes === 0 ? "" : extraOvertimeMinutes}
                  onChange={(e) => setExtraOvertimeMinutes(parseInt(e.target.value) || 0)}
                  onFocus={(e) => e.target.select()} 
                  onClick={(e) => {
                    e.currentTarget.select();
                    // 클릭 후 0인 경우 빈 문자열로 설정
                    if (extraOvertimeMinutes === 0) {
                      const inputElement = e.currentTarget as HTMLInputElement;
                      inputElement.value = "";
                    }
                  }}
                  placeholder="예: 60 (60분)"
                  min="0"
                  step="10" 
                />
                {extraOvertimeMinutes > 0 && (
                  <p className="mt-1 text-sm text-gray-500">
                    {formatMinutesToHoursAndMinutes(extraOvertimeMinutes)}
                  </p>
                )}
              </div>
              
              {/* 기존 추가 시간외 근무시간 내역 표시 */}
              {holidayWorks.length > 0 && (
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">오늘의 추가 시간외 근무 내역</h4>
                  
                  {(() => {
                    // 오늘 날짜 가져오기 (YYYY-MM-DD 형식)
                    const today = new Date();
                    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
                    
                    // 오늘 날짜의 공휴일 근무 기록 찾기
                    const todayHolidayWork = holidayWorks.find(h => h.date === todayStr);
                    
                    if (todayHolidayWork && todayHolidayWork.extra_overtime_minutes && todayHolidayWork.extra_overtime_minutes > 0) {
                      return (
                        <div className="flex items-center justify-between border-b border-gray-200 pb-2">
                          <div>
                            <span className="text-sm text-gray-600">현재 저장된 시간:</span>
                            <span className="ml-2 font-medium text-blue-600">
                              {formatMinutesToHoursAndMinutes(todayHolidayWork.extra_overtime_minutes)}
                            </span>
                          </div>
                          <span className="text-xs text-gray-500">
                            {new Date(todayHolidayWork.created_at).toLocaleTimeString()}
                          </span>
                        </div>
                      );
                    } else {
                      return (
                        <p className="text-sm text-gray-500">오늘 저장된 추가 시간외 근무 내역이 없습니다.</p>
                      );
                    }
                  })()}
                </div>
              )}
              
              <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-100">
                <p className="text-sm text-yellow-700">
                  <strong>참고:</strong> 입력한 시간은 오늘 날짜의 추가 시간외 근무시간으로 저장됩니다.
                  오늘 이미 추가 시간외 근무를 등록한 경우, 기존 값은 새로 입력한 값으로 대체됩니다.
                </p>
              </div>
            </div>
            
            <div className="flex space-x-3 mt-6">
              <button
                onClick={() => setIsExtraOvertimeModalOpen(false)}
                className="flex-1 py-3 border-2 border-gray-300 rounded-lg text-gray-700 font-medium"
              >
                취소
              </button>
              <button
                onClick={saveExtraOvertimeMinutes}
                disabled={extraOvertimeMinutes <= 0}
                className="flex-1 py-3 bg-blue-600 text-white rounded-lg font-medium disabled:opacity-50"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}; 