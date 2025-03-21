import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  supabase, 
  fetchProfile, 
  saveAttendance, 
  getTodayAttendance, 
  getMonthAttendance, 
  getWorkSettings, 
  updateWorkSettings, 
  getHolidayWorks, 
  deleteHolidayWork as deleteHolidayWorkApi, 
  updateHolidayWorkExtraOvertime, 
  getTodayOvertimeRecords,
  type Profile, 
  type AttendanceRecord, 
  type AttendanceSettings, 
  type HolidayWork 
} from '../lib/supabase';
import { QRScanner } from '../components/QRScanner';
import { QRCodeGenerator } from '../components/QRCodeGenerator';
import { AttendanceCalendar } from '../components/AttendanceCalendar';

// qrUtils에서 시간 계산 관련 함수 제외하고 가져오기
import { 
  validateQRData, 
  getRecordTypeLabel, 
  formatTimestamp
} from '../lib/qrUtils';

// 시간 계산 관련 함수를 timeCalculationUtils에서 가져오기
import { 
  formatMinutesToHoursAndMinutes, 
  calculateAttendanceStatus,
  calculateMonthlyOvertimeMinutes,
  calculateHolidayWorkMinutes,
  isWithinWorkHours,
  calculateWorkHours, 
  calculateOvertimeMinutes
} from '../lib/timeCalculationUtils';

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
  const [isWorkSettingsExpanded, setIsWorkSettingsExpanded] = useState(false);
  // 관리자 설정 드롭다운 메뉴를 위한 상태 변수 추가
  const [isAdminMenuOpen, setIsAdminMenuOpen] = useState(false);
  // 시간외 근무 사유 입력을 위한 상태 변수 추가
  const [isOvertimeReasonModalOpen, setIsOvertimeReasonModalOpen] = useState(false);
  const [overtimeReason, setOvertimeReason] = useState('');
  const [pendingOvertimeRecord, setPendingOvertimeRecord] = useState<{
    recordType: 'check_in' | 'check_out' | 'overtime_end';
    location: string;
    timestamp: string;
  } | null>(null);
  // 오늘의 시간외 근무 기록 상태
  const [todayOvertimeRecords, setTodayOvertimeRecords] = useState<any[]>([]);
  const [isLoadingOvertimeRecords, setIsLoadingOvertimeRecords] = useState(false);

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
          
          // 시간외 근무 사유 입력 모달 표시
          const recordToSave = {
            recordType,
            location: data.location,
            timestamp: currentTimestamp
          };
          
          setPendingOvertimeRecord(recordToSave);
          setOvertimeReason('');
          
          // 모달 상태 업데이트를 확실히 하기 위해 setTimeout 사용
          setTimeout(() => {
            setIsOvertimeReasonModalOpen(true);
            setActionLoading(false);
          }, 100);
          
          return; // 모달에서 확인 후 saveOvertimeWithReason 함수를 호출하도록 함
        } else {
          // 취소 시 처리 중단
          throw new Error('시간외 근무 기록이 취소되었습니다.');
        }
      }
      
      // 일반 출결 기록 저장 (시간외 근무가 아닌 경우)
      await saveAttendanceRecord(recordType, data.location);
      
    } catch (error: any) {
      console.error('QR 출결 기록 오류:', error);
      setError(error.message || '출결 기록 중 오류가 발생했습니다.');
    } finally {
      setActionLoading(false);
      setCurrentAction(null);
    }
  };

  // 출결 기록 저장 함수 (공통 로직 분리)
  const saveAttendanceRecord = async (recordType: 'check_in' | 'check_out' | 'overtime_end', location: string, reason?: string) => {
    if (!profile) return;
    
    try {
      setActionLoading(true);
      
      // 현재 시간
      const currentTimestamp = new Date().toISOString();
      const now = new Date();
      
      // 현재 시간이 근무시간 외인지 확인
      const isOutsideWorkHours = !isWithinWorkHours(currentTimestamp, workSettings);
      
      // 현재 요일 설정 확인
      const today = new Date();
      const dayOfWeek = today.getDay();
      const todaySettings = workSettings.find(s => s.day_of_week === dayOfWeek);
      
      // 자정 이후 시간(0시~1시) 여부 확인
      const isMidnightHour = now.getHours() >= 0 && now.getHours() < 1;
      
      // 자정 이후 출근인 경우, 전날 미처리 출근 확인
      if (recordType === 'check_in' && isMidnightHour) {
        console.log('자정 직후 출근 감지 - 전날 미처리 기록 확인');
        
        // 전날 날짜 계산
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        
        // 전날 기록 조회
        const yesterdayRecords = await getTodayAttendance(profile.id, yesterday);
        
        // 전날 출근은 있지만 퇴근이 없는 경우, 자동 퇴근 기록 추가
        const hasYesterdayCheckIn = yesterdayRecords.some(r => r.record_type === 'check_in');
        const hasYesterdayCheckOut = yesterdayRecords.some(r => r.record_type === 'check_out' || r.record_type === 'overtime_end');
        
        if (hasYesterdayCheckIn && !hasYesterdayCheckOut) {
          console.log('전날 미처리 출근 기록 발견 - 자동 퇴근 처리');
          
          // 전날 요일 설정
          const yesterdayDayOfWeek = yesterday.getDay();
          const yesterdaySettings = workSettings.find(s => s.day_of_week === yesterdayDayOfWeek);
          
          if (yesterdaySettings) {
            // 전날 근무 종료 시간으로 퇴근 기록 생성
            const [workEndHour, workEndMinute] = yesterdaySettings.work_end_time.split(':').map(Number);
            
            // 어제 날짜의 근무 종료 시간 설정
            const endTime = new Date(yesterday);
            endTime.setHours(workEndHour, workEndMinute, 0, 0);
            
            // 종료 시간이 유효하지 않으면 자정으로 설정
            if (endTime.getTime() > yesterday.getTime() || workEndHour >= 24) {
              endTime.setHours(23, 59, 59, 999);
            }
            
            // 전날의 자동 퇴근 기록 추가
            await saveAttendance(
              profile.id,
              'check_out',
              '자동 퇴근 처리',
              '자정 출근에 의한 자동 퇴근 처리',
              endTime.toISOString()
            );
            
            console.log('전날 자동 퇴근 처리 완료:', endTime.toLocaleString());
          }
        }
      }
      
      // 추가 기록 (자동 퇴근 등)
      let additionalRecord = null;
      
      // 자정 이후 시간외 근무 종료 스캔 시 조치
      let isAfterMidnight = false;
      let overtimeTimestamp = currentTimestamp;
      if (recordType === 'overtime_end') {
        const currentHour = today.getHours();
        // 자정 이후 시간(0시~5시)인 경우, 전날 23:59:59로 시간 조정
        if (currentHour >= 0 && currentHour < 5) {
          isAfterMidnight = true;
          const yesterday = new Date(today);
          yesterday.setDate(yesterday.getDate() - 1);
          yesterday.setHours(23, 59, 59, 999);
          overtimeTimestamp = yesterday.toISOString();
        }
      }
      
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
            location,
            timestamp: currentTimestamp
          };
        }
      }
      
      // 출결 기록 저장 (자정 이후 시간외 근무인 경우 수정된 시간으로 저장)
      const result = await saveAttendance(
        profile.id, 
        recordType, 
        location, 
        reason,
        isAfterMidnight ? overtimeTimestamp : undefined
      );
      
      if (!result.success) {
        throw new Error(result.error ? (result.error as any).message || '출결 기록 중 오류가 발생했습니다.' : '출결 기록 중 오류가 발생했습니다.');
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
      const formattedTime = formatTimestamp(isAfterMidnight ? overtimeTimestamp : currentTimestamp);
      let successMessage = `${actionText} 기록이 완료되었습니다.${timeInfo}\n위치: ${location}\n시간: ${formattedTime}`;
      
      // 자정 이후 시간외 근무 종료 처리 메시지 추가
      if (isAfterMidnight) {
        successMessage += '\n\n※ 자정 이후 시간외근무 종료로, 전날 23:59:59로 기록되었습니다.';
      }
      
      // 사유가 있는 경우 메시지에 추가
      if (reason) {
        successMessage += `\n사유: ${reason}`;
      }
      
      // 자동 퇴근 기록이 추가된 경우 메시지에 추가
      if (additionalRecord) {
        successMessage += '\n\n※ 또한 퇴근 기록도 자동으로 추가되었습니다.';
      }
      
      alert(successMessage);
      return true;
    } catch (error: any) {
      console.error('출결 기록 저장 오류:', error);
      setError(error.message || '출결 기록 중 오류가 발생했습니다.');
      return false;
    } finally {
      setActionLoading(false);
    }
  };

  // 시간외 근무 사유와 함께 저장하는 함수
  const saveOvertimeWithReason = async () => {
    if (!pendingOvertimeRecord) {
      console.error('저장할 시간외 근무 기록이 없습니다.');
      return;
    }
    
    try {
      const success = await saveAttendanceRecord(
        pendingOvertimeRecord.recordType,
        pendingOvertimeRecord.location,
        overtimeReason
      );
      
      // 모달 닫기
      setIsOvertimeReasonModalOpen(false);
      setPendingOvertimeRecord(null);
      setCurrentAction(null);
      
      if (!success) {
        setError('시간외 근무 기록 중 오류가 발생했습니다.');
      }
    } catch (error) {
      console.error('시간외 근무 저장 오류:', error);
      setError('시간외 근무 기록 중 오류가 발생했습니다.');
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
  const overtimeEndRecords = todayRecords.filter(record => record.record_type === 'overtime_end');
  const hasEndedOvertime = overtimeEndRecords.length > 0;

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
  
  // 현재 시간이 근무 시간 내인지 체크하는 함수
  const isCurrentTimeWithinWorkHours = (): boolean => {
    if (!workSettings || workSettings.length === 0) return false;
    
    // 현재 날짜와 시간
    const now = new Date();
    const dayOfWeek = now.getDay();
    
    // 해당 요일의 근무시간 설정 가져오기
    const daySetting = workSettings.find(s => s.day_of_week === dayOfWeek);
    
    // 해당 요일 설정이 없거나 휴무일인 경우, 근무 시간 외로 간주
    if (!daySetting || !daySetting.is_working_day) return false;
    
    // 현재 시간
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTimeInMinutes = currentHour * 60 + currentMinute;
    
    // 근무 시작/종료 시간 (분 단위로 변환)
    const [workStartHour, workStartMinute] = daySetting.work_start_time.split(':').map(Number);
    const workStartTimeInMinutes = workStartHour * 60 + workStartMinute;
    
    const [workEndHour, workEndMinute] = daySetting.work_end_time.split(':').map(Number);
    const workEndTimeInMinutes = workEndHour * 60 + workEndMinute;
    
    // 점심 시간이 있는 경우
    if (daySetting.lunch_start_time !== "00:00" && daySetting.lunch_end_time !== "00:00") {
      const [lunchStartHour, lunchStartMinute] = daySetting.lunch_start_time.split(':').map(Number);
      const lunchStartTimeInMinutes = lunchStartHour * 60 + lunchStartMinute;
      
      const [lunchEndHour, lunchEndMinute] = daySetting.lunch_end_time.split(':').map(Number);
      const lunchEndTimeInMinutes = lunchEndHour * 60 + lunchEndMinute;
      
      // 현재 시간이 근무 시간 내인지 체크 (점심 시간 제외)
      return (
        (currentTimeInMinutes >= workStartTimeInMinutes && currentTimeInMinutes < lunchStartTimeInMinutes) ||
        (currentTimeInMinutes >= lunchEndTimeInMinutes && currentTimeInMinutes < workEndTimeInMinutes)
      );
    }
    
    // 점심 시간이 없는 경우, 단순히 시작 시간과 종료 시간 사이인지 체크
    return currentTimeInMinutes >= workStartTimeInMinutes && currentTimeInMinutes < workEndTimeInMinutes;
  };
  
  // getAttendanceStatus 함수는 새로운 calculateAttendanceStatus 함수를 사용
  const getAttendanceStatus = (records: AttendanceRecord[]) => {
    if (!records || records.length === 0 || !workSettings || workSettings.length === 0) {
      return null;
    }
    
    // 날짜 정보 추출
    const checkInRecord = records.find(r => r.record_type === 'check_in');
    if (!checkInRecord) return null;
    
    const recordDate = new Date(checkInRecord.timestamp);
    const dateStr = `${recordDate.getFullYear()}-${String(recordDate.getMonth() + 1).padStart(2, '0')}-${String(recordDate.getDate()).padStart(2, '0')}`;
    const isHoliday = holidayWorks.some(h => h.date === dateStr);
    
    return calculateAttendanceStatus(records, workSettings, isHoliday);
  };

  // 이 함수들은 qrUtils에서 제공하는 함수를 사용
  // 월별 총 시간외 근무 시간 계산 함수
  const calculateMonthlyOvertimeMinutesLocal = () => {
    if (!monthRecords || !profile) return 0;
    return calculateMonthlyOvertimeMinutes(
      monthRecords, 
      holidayWorks.map(h => h.date), 
      workSettings
    );
  };
  
  // 사용자별 공휴일 근무 시간 계산 (로컬 계산용)
  const calculateUserHolidayWorkMinutesLocal = (userId: string) => {
    if (!holidayWorks || holidayWorks.length === 0 || !monthRecords || monthRecords.length === 0) {
      return { 
        totalMinutes: 0, 
        regularMinutes: 0, 
        exceededMinutes: 0,
        extraMinutes: 0
      };
    }
    return calculateHolidayWorkMinutes(userId, monthRecords, holidayWorks);
  };

  // 총 근무시간 계산 함수 (공휴일 및 휴무일 제외 근무 + 시간외 + 휴일 근무 합산)
  const calculateTotalWorkMinutesLocal = () => {
    if (!profile || !monthRecords) return 0;
    
    // 날짜별로 기록 그룹화
    const recordsByDate = monthRecords.reduce((acc, record) => {
      const date = new Date(record.timestamp);
      const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      
      if (!acc[dateKey]) {
        acc[dateKey] = [];
      }
      
      acc[dateKey].push(record);
      return acc;
    }, {} as Record<string, AttendanceRecord[]>);
    
    // 각 날짜별 총 근무시간 합산
    let totalMinutes = 0;
    
    // 1. 날짜별 총 근무시간 합산 (출퇴근 기록이 있는 날짜)
    Object.entries(recordsByDate).forEach(([dateStr, dayRecords]) => {
      // 출근 및 퇴근(or 마지막 활동) 기록 확인
      const checkInRecord = dayRecords.find(r => r.record_type === 'check_in');
      if (!checkInRecord) return;
      
      // 퇴근 또는 마지막 활동 기록 찾기
      const lastRecord = dayRecords
        .filter(r => r.record_type === 'check_out' || r.record_type === 'overtime_end')
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
      
      if (!lastRecord) return;
      
      // 날짜가 공휴일인지 확인
      const isHoliday = holidayWorks.some(h => h.date === dateStr);
      if (isHoliday) return; // 공휴일 근무는 별도 계산
      
      // 날짜의 요일 설정 확인
      const checkInDate = new Date(checkInRecord.timestamp);
      const dayOfWeek = checkInDate.getDay();
      const daySetting = workSettings.find(s => s.day_of_week === dayOfWeek) || workSettings[0];
      
      // 일별 총 근무시간 계산 (출근에서 퇴근/마지막 활동까지, 점심시간 제외)
      const dailyWorkHours = calculateWorkHours(
        checkInRecord, 
        lastRecord, 
        daySetting.lunch_start_time, 
        daySetting.lunch_end_time
      );
      
      // 점심시간 중 시간외 근무 계산
      let lunchOvertimeMinutes = 0;
      const hasOvertimeEnd = dayRecords.some(r => r.record_type === 'overtime_end');
      
      if (hasOvertimeEnd) {
        const isNonWorkingDay = !daySetting.is_working_day;
        const overtimeResult = calculateOvertimeMinutes(dayRecords, daySetting, isNonWorkingDay);
        lunchOvertimeMinutes = overtimeResult.lunchOvertimeMinutes;
      }
      
      // 총 근무시간 = 기본 근무시간 + 점심시간 중 시간외 근무시간
      totalMinutes += dailyWorkHours.totalMinutes + lunchOvertimeMinutes;
    });
    
    // 2. 공휴일 근무시간 합산 (사용자의 출근 기록이 있는 공휴일)
    const holidayWorkStats = calculateHolidayWorkMinutes(profile.id, monthRecords, holidayWorks);
    
    // 공휴일 근무시간 합산 (8시간 이하 + 8시간 초과 + 공휴일 추가 시간외)
    totalMinutes += holidayWorkStats.regularMinutes + holidayWorkStats.exceededMinutes + holidayWorkStats.extraMinutes;
    
    return totalMinutes;
  };
  
  // 월별 총 시간외 근무 시간
  const monthlyOvertimeMinutes = calculateMonthlyOvertimeMinutesLocal();
  const monthlyOvertimeFormatted = monthlyOvertimeMinutes > 0 
    ? formatMinutesToHoursAndMinutes(monthlyOvertimeMinutes) 
    : '';
    
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
    const days = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
    return days[dayOfWeek] || '알 수 없음';
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
      
      // 함수 호출 인자 수정
      const result = await updateHolidayWorkExtraOvertime(
        selectedHolidayDate,
        profile.id,
        minutes
      );
      
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
      setError(error.message || '저장 중 오류가 발생했습니다.');
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

  // 현재 사용자의 공휴일 근무 시간 계산
  const currentUserHolidayWorkMinutes = profile ? calculateUserHolidayWorkMinutesLocal(profile.id) : { 
    totalMinutes: 0, 
    regularMinutes: 0, 
    exceededMinutes: 0,
    extraMinutes: 0
  };

  // 시간외 근무 파트 타입 정의
  type OvertimePart = 'before_work' | 'lunch_time' | 'after_work';

  // 현재 시간이 어떤 시간외 근무 파트에 해당하는지 판단하는 함수
  const getCurrentOvertimePart = (): OvertimePart | null => {
    if (!workSettings || workSettings.length === 0) return null;
    
    // 현재 날짜와 시간
    const now = new Date();
    const dayOfWeek = now.getDay();
    
    // 해당 요일의 근무시간 설정 가져오기
    const daySetting = workSettings.find(s => s.day_of_week === dayOfWeek);
    
    // 해당 요일 설정이 없거나 휴무일인 경우, null 반환
    if (!daySetting || !daySetting.is_working_day) return null;
    
    // 현재 시간 (분 단위)
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTimeInMinutes = currentHour * 60 + currentMinute;
    
    // 근무 시작 시간
    const [workStartHour, workStartMinute] = daySetting.work_start_time.split(':').map(Number);
    const workStartTimeInMinutes = workStartHour * 60 + workStartMinute;
    
    // 근무 종료 시간
    const [workEndHour, workEndMinute] = daySetting.work_end_time.split(':').map(Number);
    const workEndTimeInMinutes = workEndHour * 60 + workEndMinute;
    
    // 점심 시간이 있는 경우
    if (!hasNoLunchTime(daySetting)) {
      // 점심 시작 시간
      const [lunchStartHour, lunchStartMinute] = daySetting.lunch_start_time.split(':').map(Number);
      const lunchStartTimeInMinutes = lunchStartHour * 60 + lunchStartMinute;
      
      // 점심 종료 시간
      const [lunchEndHour, lunchEndMinute] = daySetting.lunch_end_time.split(':').map(Number);
      const lunchEndTimeInMinutes = lunchEndHour * 60 + lunchEndMinute;
      
      // 근무 시작 전
      if (currentTimeInMinutes < workStartTimeInMinutes) {
        return 'before_work';
      }
      
      // 점심 시간
      if (currentTimeInMinutes >= lunchStartTimeInMinutes && currentTimeInMinutes < lunchEndTimeInMinutes) {
        return 'lunch_time';
      }
      
      // 근무 종료 후
      if (currentTimeInMinutes >= workEndTimeInMinutes) {
        return 'after_work';
      }
    } else {
      // 점심 시간이 없는 경우
      
      // 근무 시작 전
      if (currentTimeInMinutes < workStartTimeInMinutes) {
        return 'before_work';
      }
      
      // 근무 종료 후
      if (currentTimeInMinutes >= workEndTimeInMinutes) {
        return 'after_work';
      }
    }
    
    // 정규 근무 시간 내인 경우 (시간외 근무가 아님)
    return null;
  };
  
  // 특정 시간이 어떤 시간외 근무 파트에 해당하는지 판단하는 함수
  const getOvertimePartFromTimestamp = (timestamp: string): OvertimePart | null => {
    if (!workSettings || workSettings.length === 0) return null;
    
    // 타임스탬프의 날짜와 시간
    const recordDate = new Date(timestamp);
    const dayOfWeek = recordDate.getDay();
    
    // 해당 요일의 근무시간 설정 가져오기
    const daySetting = workSettings.find(s => s.day_of_week === dayOfWeek);
    
    // 해당 요일 설정이 없거나 휴무일인 경우, null 반환
    if (!daySetting || !daySetting.is_working_day) return null;
    
    const recordHour = recordDate.getHours();
    const recordMinute = recordDate.getMinutes();
    const recordTimeInMinutes = recordHour * 60 + recordMinute;
    
    // 근무 시작/종료 시간 (분 단위로 변환)
    const [workStartHour, workStartMinute] = daySetting.work_start_time.split(':').map(Number);
    const workStartTimeInMinutes = workStartHour * 60 + workStartMinute;
    
    const [workEndHour, workEndMinute] = daySetting.work_end_time.split(':').map(Number);
    const workEndTimeInMinutes = workEndHour * 60 + workEndMinute;
    
    // 점심 시간이 있는 경우
    if (daySetting.lunch_start_time !== "00:00" && daySetting.lunch_end_time !== "00:00") {
      const [lunchStartHour, lunchStartMinute] = daySetting.lunch_start_time.split(':').map(Number);
      const lunchStartTimeInMinutes = lunchStartHour * 60 + lunchStartMinute;
      
      const [lunchEndHour, lunchEndMinute] = daySetting.lunch_end_time.split(':').map(Number);
      const lunchEndTimeInMinutes = lunchEndHour * 60 + lunchEndMinute;
      
      // 근무 시작 전 (출근은 했으나 근무 시작 시간 전)
      if (recordTimeInMinutes < workStartTimeInMinutes) {
        return 'before_work';
      }
      
      // 점심 시간
      if (recordTimeInMinutes >= lunchStartTimeInMinutes && recordTimeInMinutes < lunchEndTimeInMinutes) {
        return 'lunch_time';
      }
      
      // 근무 종료 후
      if (recordTimeInMinutes >= workEndTimeInMinutes) {
        return 'after_work';
      }
    } else {
      // 점심 시간이 없는 경우
      
      // 근무 시작 전
      if (recordTimeInMinutes < workStartTimeInMinutes) {
        return 'before_work';
      }
      
      // 근무 종료 후
      if (recordTimeInMinutes >= workEndTimeInMinutes) {
        return 'after_work';
      }
    }
    
    // 그 외의 경우 (정규 근무 시간 내)
    return null;
  };
  
  // 오늘의 시간외 근무 기록을 파트별로 그룹화하는 함수
  const getTodayOvertimeRecordsByPart = () => {
    const result: Record<OvertimePart, AttendanceRecord[]> = {
      before_work: [],
      lunch_time: [],
      after_work: []
    };
    
    // 오늘의 시간외 근무 종료 기록들
    overtimeEndRecords.forEach(record => {
      const part = getOvertimePartFromTimestamp(record.timestamp);
      if (part) {
        result[part].push(record);
      }
    });
    
    return result;
  };
  
  // 현재 시간이 속한 파트에 이미 시간외 근무 기록이 있는지 확인
  const hasOvertimeRecordInCurrentPart = (): boolean => {
    const currentPart = getCurrentOvertimePart();
    if (!currentPart) return false; // 현재 시간이 시간외 근무 파트에 해당하지 않으면 false 반환
    
    const recordsByPart = getTodayOvertimeRecordsByPart();
    return recordsByPart[currentPart].length > 0;
  };

  // 근무시간 설정 폴딩 토글 함수 추가
  const toggleWorkSettings = () => {
    setIsWorkSettingsExpanded(!isWorkSettingsExpanded);
  };

  // 관리자 메뉴 토글 함수
  const toggleAdminMenu = () => {
    setIsAdminMenuOpen(!isAdminMenuOpen);
  };

  // 자동 퇴근 처리를 위한 스케줄러 설정
  useEffect(() => {
    // 중복 실행 방지를 위한 플래그
    let isProcessing = false;
    
    // 자정 자동 퇴근 처리 함수
    const handleAutomaticCheckout = async () => {
      // 이미 처리 중이면 중복 실행 방지
      if (isProcessing || !profile || !workSettings || workSettings.length === 0) return;
      
      try {
        isProcessing = true;
        console.log('자동 퇴근 처리 체크 시작');
        
        // 자동 퇴근 처리할 날짜 설정 (전날)
        const processDate = new Date();
        processDate.setDate(processDate.getDate() - 1);
        console.log('자동 퇴근 처리 대상 날짜:', processDate.toLocaleDateString());
        
        // 전날의 기록 확인
        const records = await getTodayAttendance(profile.id, processDate);
        
        // 출근 기록은 있지만 퇴근 기록이 없는 경우에만 처리
        const hasCheckIn = records.some(r => r.record_type === 'check_in');
        const hasCheckOut = records.some(r => r.record_type === 'check_out' || r.record_type === 'overtime_end');
        
        if (hasCheckIn && !hasCheckOut) {
          console.log('퇴근 기록 없음, 자동 퇴근 처리 진행');
          
          // 전날 요일 설정 확인
          const dayOfWeek = processDate.getDay();
          const daySettings = workSettings.find(s => s.day_of_week === dayOfWeek);
          
          if (daySettings) {
            // 설정된 근무 종료 시간으로 퇴근 기록 생성
            const [workEndHour, workEndMinute] = daySettings.work_end_time.split(':').map(Number);
            
            // 전날 날짜에 근무 종료 시간 설정
            const endTime = new Date(processDate);
            endTime.setHours(workEndHour, workEndMinute, 0, 0);
            
            // 만약 근무 종료 시간이 처리 날짜의 현재 시간보다 미래라면, 자정(23:59:59)으로 설정
            if (endTime.getTime() > processDate.getTime() || workEndHour >= 24) {
              endTime.setHours(23, 59, 59, 999);
            }
            
            console.log('자동 퇴근 시간 설정:', endTime.toLocaleString());
            
            // 자동 퇴근 기록 저장
            const result = await saveAttendance(
              profile.id,
              'check_out',
              '자동 퇴근 처리',
              '자정 자동 퇴근 처리',
              endTime.toISOString()
            );
            
            if (result.success) {
              console.log('자동 퇴근 처리 완료:', endTime.toLocaleTimeString());
              
              // 기록 다시 로드
              const updatedRecords = await getTodayAttendance(profile.id);
              setTodayRecords(updatedRecords);
              
              const monthRecords = await getMonthAttendance(profile.id);
              setMonthRecords(monthRecords);
            } else {
              console.error('자동 퇴근 처리 실패:', result.error);
            }
          }
        } else {
          console.log('자동 퇴근 처리 필요 없음 - 이미 퇴근 기록 있음 또는 출근 기록 없음');
        }
      } catch (error) {
        console.error('자동 퇴근 처리 오류:', error);
      } finally {
        isProcessing = false;
      }
    };
    
    // 현재 시간 체크
    const now = new Date();
    const currentHour = now.getHours();
    
    // 자정 직후(0시~1시)인 경우 바로 실행 - 단, 초기 렌더링 시 한 번만 실행
    if (currentHour >= 0 && currentHour < 1) {
      // 자정 직후 출근인지 확인
      const isMidnightCheckIn = hasCheckedIn && 
                                todayRecords.length > 0 && 
                                todayRecords.some(r => {
                                  const recordHour = new Date(r.timestamp).getHours();
                                  return r.record_type === 'check_in' && recordHour >= 0 && recordHour < 1;
                                });
      
      // 자정 직후 출근이 아닌 경우에만 자동 퇴근 처리 실행
      if (!isMidnightCheckIn) {
        // setTimeout으로 약간의 지연을 주어 중복 실행 방지
        setTimeout(() => {
          handleAutomaticCheckout();
        }, 1000);
      } else {
        console.log('자정 직후 출근 감지됨 - 자동 퇴근 처리 건너뜀');
      }
    }
    
    // 매일 자정에 실행되는 스케줄러 설정
    const scheduleMidnightCheckout = () => {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 1, 0, 0); // 자정 1분 후로 설정하여 중복 실행 가능성 감소
      
      // 자정까지 남은 시간(밀리초)
      const timeUntilMidnight = tomorrow.getTime() - now.getTime();
      
      // 자정에 자동 퇴근 처리 실행
      const midnightTimeout = setTimeout(() => {
        handleAutomaticCheckout();
        // 다음 날을 위한 스케줄러 재설정
        scheduleMidnightCheckout();
      }, timeUntilMidnight);
      
      // 컴포넌트 언마운트 시 타이머 정리를 위해 반환
      return midnightTimeout;
    };
    
    // 스케줄러 설정
    const midnightTimeout = scheduleMidnightCheckout();
    
    // 컴포넌트 언마운트 시 스케줄러 정리
    return () => {
      clearTimeout(midnightTimeout);
    };
  }, [profile, workSettings, hasCheckedIn, todayRecords]);

  // 오늘의 시간외 근무 기록 로드 함수
  const loadTodayOvertimeRecords = async () => {
    if (!profile || profile.role !== 'admin') return;
    
    try {
      setIsLoadingOvertimeRecords(true);
      const records = await getTodayOvertimeRecords();
      setTodayOvertimeRecords(records);
    } catch (error) {
      console.error('시간외 근무 기록 로드 오류:', error);
    } finally {
      setIsLoadingOvertimeRecords(false);
    }
  };
  
  // 시간외 근무 기록 로드 (관리자 메뉴 열 때마다 갱신)
  useEffect(() => {
    if (isAdminMenuOpen && profile?.role === 'admin') {
      loadTodayOvertimeRecords();
    }
  }, [isAdminMenuOpen, profile]);
  
  // 오늘 기록이 변경될 때마다 시간외 근무 기록도 갱신 (관리자인 경우만)
  useEffect(() => {
    if (profile?.role === 'admin' && isAdminMenuOpen) {
      loadTodayOvertimeRecords();
    }
  }, [todayRecords, profile]);
  
  // 컴포넌트 마운트 시 자동으로 시간외 근무 기록 로드 (관리자인 경우만)
  useEffect(() => {
    if (profile?.role === 'admin') {
      loadTodayOvertimeRecords();
    }
  }, [profile]);
  
  // 시간외 근무 시간 계산 함수
  const calculateOvertimeDuration = (overtimeRecord: any) => {
    if (!workSettings || workSettings.length === 0) {
      return 0;
    }
    
    // 해당 요일의 근무 설정 찾기
    const recordDate = new Date(overtimeRecord.timestamp);
    const dayOfWeek = recordDate.getDay();
    const daySetting = workSettings.find(s => s.day_of_week === dayOfWeek);
    
    if (!daySetting) {
      return 0;
    }
    
    // 사용자의 당일 모든 기록 확인
    // 서버에서 가져온 all_day_records가 있으면 해당 데이터 사용, 아니면 현재 사용자의 todayRecords 사용
    const userDayRecords = overtimeRecord.all_day_records || 
                          (overtimeRecord.user_id === profile?.id ? 
                           todayRecords : []);
    
    // 근무일 여부 확인
    const isNonWorkingDay = !daySetting.is_working_day;
    
    // 시간외 근무 시간 계산
    const overtimeResult = calculateOvertimeMinutes(userDayRecords, daySetting, isNonWorkingDay);
    
    return overtimeResult.totalMinutes;
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
        <div className="px-4 py-3 flex justify-between items-center">
          <div className="flex items-center overflow-hidden mr-2">
            <h1 className="text-base sm:text-lg font-bold text-gray-900 mr-2 whitespace-nowrap">샤인치과 출결관리</h1>
            
            {/* 관리자인 경우 전체 직원 근무일지 버튼 표시 */}
            {profile && profile.role === 'admin' && (
              <button 
                onClick={() => navigate('/employee-report')}
                className="ml-1 px-2 py-1 text-xs sm:text-sm font-medium bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 whitespace-nowrap flex-shrink-0"
              >
                전체 직원 근무일지
              </button>
            )}
          </div>
          
          <button
            onClick={handleLogout}
            className="text-xs sm:text-sm text-gray-500 hover:text-gray-700 whitespace-nowrap flex-shrink-0"
          >
            로그아웃
          </button>
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
        </div>
      </div>

      {/* 오늘 날짜 섹션 */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 shadow-sm px-3 py-3 mb-4 text-center rounded-lg">
        <div className="flex justify-center items-center">
          <svg className="w-5 h-5 mr-2 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
          </svg>
          <h2 className="text-lg sm:text-xl font-medium text-gray-800">
            {new Date().toLocaleDateString('ko-KR', { 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric'
            })}
            <span className="ml-2 text-blue-600">
              {new Date().toLocaleDateString('ko-KR', { weekday: 'long' })}
            </span>
          </h2>
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
            <div 
              className="flex justify-between items-center cursor-pointer" 
              onClick={toggleAdminMenu}
            >
              <h2 className="text-lg font-bold text-gray-900">관리자 설정</h2>
              <div className="text-gray-500">
                <svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  className={`h-5 w-5 transition-transform duration-200 ${isAdminMenuOpen ? 'transform rotate-180' : ''}`} 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
            
            {isAdminMenuOpen && (
              <div className="mt-4 grid grid-cols-1 gap-4">
                {/* QR 코드 관리 섹션 */}
                <div className="bg-gray-50 rounded-xl p-4">
                  <h3 className="text-md font-bold text-gray-900 mb-4">QR 코드 관리</h3>
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
                
                {/* 공휴일 근무 시간 관리 섹션 */}
                <div className="bg-gray-50 rounded-xl p-4">
                  <h3 className="text-md font-bold text-gray-900 mb-4">공휴일 근무 시간 관리</h3>
                  
                  {/* 공휴일 근무 시간 목록 */}
                  {holidayWorks.length > 0 ? (
                    <div className="mb-4 bg-white p-2 sm:p-4 rounded-lg overflow-hidden">
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
                    <div className="mb-4 bg-white p-4 rounded-lg text-center text-gray-500">
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
                
                {/* 근무시간 설정 섹션 */}
                <div className="bg-gray-50 rounded-xl p-4">
                  <div 
                    className="flex justify-between items-center cursor-pointer" 
                    onClick={toggleWorkSettings}
                  >
                    <h3 className="text-md font-bold text-gray-900">근무시간 설정</h3>
                    <div className="text-gray-500">
                      <svg 
                        xmlns="http://www.w3.org/2000/svg" 
                        className={`h-5 w-5 transition-transform duration-200 ${isWorkSettingsExpanded ? 'transform rotate-180' : ''}`} 
                        fill="none" 
                        viewBox="0 0 24 24" 
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                  
                  {isWorkSettingsExpanded && (
                    <>
                      {workSettings && workSettings.length > 0 && (
                        <div className="mt-4 mb-4 bg-white p-4 rounded-lg overflow-x-auto">
                          <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-4 gap-4 min-w-[300px]">
                            {workSettings.map((setting) => (
                              <div key={setting.day_of_week} className={`p-3 rounded-lg ${
                                setting.is_working_day ? 'bg-blue-50 border border-blue-100' : 'bg-gray-100 border border-gray-200'
                              }`}>
                                <div className="font-bold text-gray-900 mb-1.5">
                                  {getDayName(setting.day_of_week)}
                                </div>
                                {setting.is_working_day ? (
                                  <>
                                    <div className="text-sm text-gray-600 flex justify-between mb-1">
                                      <span>근무시간:</span>
                                      <span className="font-medium text-blue-700">
                                        {setting.work_start_time} - {setting.work_end_time}
                                      </span>
                                    </div>
                                    <div className="text-sm text-gray-600 flex justify-between">
                                      <span>점심시간:</span>
                                      <span className={`font-medium ${
                                        hasNoLunchTime(setting) ? 'text-gray-400' : 'text-blue-700'
                                      }`}>
                                        {hasNoLunchTime(setting) ? '없음' : `${setting.lunch_start_time} - ${setting.lunch_end_time}`}
                                      </span>
                                    </div>
                                  </>
                                ) : (
                                  <div className="text-sm text-gray-500 italic">휴무일</div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      <button
                        onClick={openWorkSettings}
                        className="w-full p-3 mt-2 bg-blue-100 text-blue-800 rounded-xl font-medium"
                      >
                        근무시간 설정 변경
                      </button>
                    </>
                  )}
                </div>
                
                {/* 시간외 근무 사유 섹션은 제거되었습니다 - 관리자 설정 폴딩 내에 중복되어 표시되는 코드였습니다 */}
              </div>
            )}
          </div>
        )}
        
        {/* 시간외 근무 기록 (관리자만 표시) - 항상 노출 */}
        {profile?.role === 'admin' && (
          <div className="bg-white shadow rounded-xl p-5 mb-5">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-900">오늘의 시간외 근무 기록</h3>
              <button 
                onClick={loadTodayOvertimeRecords}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                새로고침
              </button>
            </div>
            
            {isLoadingOvertimeRecords ? (
              <div className="flex justify-center py-6">
                <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-solid border-blue-500 border-r-transparent"></div>
              </div>
            ) : todayOvertimeRecords && todayOvertimeRecords.length > 0 ? (
              <div className="mb-4 bg-white p-2 sm:p-4 rounded-lg overflow-x-auto">
                <table className="w-full min-w-full">
                  <thead className="border-b">
                    <tr>
                      <th className="p-2 text-left text-sm font-medium text-gray-500">이름 (부서)</th>
                      <th className="p-2 text-left text-sm font-medium text-gray-500">종료시간</th>
                      <th className="p-2 text-left text-sm font-medium text-gray-500">시간외 근무시간</th>
                      <th className="p-2 text-left text-sm font-medium text-gray-500">사유</th>
                    </tr>
                  </thead>
                  <tbody>
                    {todayOvertimeRecords.map((record) => (
                      <tr key={record.id} className="border-b border-gray-200 hover:bg-gray-50">
                        <td className="p-2 text-sm text-gray-800">
                          <div className="font-medium">{record.profiles?.name || '이름 없음'}</div>
                          <div className="text-xs text-gray-500">{record.profiles?.department || '-'}</div>
                        </td>
                        <td className="p-2 text-sm text-gray-800">
                          {new Date(record.timestamp).toLocaleTimeString('ko-KR', { 
                            hour: '2-digit', 
                            minute: '2-digit'
                          })}
                        </td>
                        <td className="p-2 text-sm text-gray-800">
                          {formatMinutesToHoursAndMinutes(calculateOvertimeDuration(record))}
                        </td>
                        <td className="p-2 text-sm text-gray-800">
                          {record.reason || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="mb-4 bg-white p-4 rounded-lg text-center text-gray-500">
                오늘 등록된 시간외 근무 기록이 없습니다.
              </div>
            )}
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
              disabled={actionLoading || !hasCheckedIn || isCurrentTimeWithinWorkHours() || hasOvertimeRecordInCurrentPart() || !getCurrentOvertimePart()}
              className={`p-4 rounded-xl font-medium text-lg ${
                hasEndedOvertime 
                  ? 'bg-purple-100 text-purple-800' 
                  : 'bg-purple-600 text-white active:bg-purple-700'
              } disabled:opacity-50`}
            >
              {actionLoading ? '처리 중...' : 
               isCurrentTimeWithinWorkHours() ? '근무 시간 외에만 사용 가능' : 
               !getCurrentOvertimePart() ? '시간외 근무 시간이 아닙니다' :
               hasOvertimeRecordInCurrentPart() ? `현재 시간대에 이미 기록됨` :
               hasEndedOvertime ? `다른 시간대 시간외근무 추가` : 
               '시간외근무 종료 QR 스캔하기'}
            </button>
            
            {/* 시간외근무 종료 기록 목록 */}
            {overtimeEndRecords.length > 0 && (
              <div className="mt-2 bg-purple-50 rounded-lg p-3">
                <h3 className="text-sm font-medium text-purple-800 mb-2">오늘의 시간외근무 종료 기록:</h3>
                <ul className="space-y-1">
                  {Object.entries(getTodayOvertimeRecordsByPart()).map(([part, records]) => (
                    records.length > 0 && (
                      <li key={part} className="mb-2">
                        <div className="text-xs font-medium text-purple-700 mb-1">
                          {part === 'before_work' ? '근무 시작 전' : 
                           part === 'lunch_time' ? '점심 시간' : 
                           '근무 종료 후'}:
                        </div>
                        {records.map((record) => (
                          <div key={record.id} className="text-sm text-purple-700 flex justify-between pl-2">
                            <span>{formatTime(record.timestamp)}</span>
                          </div>
                        ))}
                      </li>
                    )
                  ))}
                </ul>
              </div>
            )}
            
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
                              {overtimeEndRecords.length > 1 && (
                                <span className="ml-1">
                                  ({overtimeEndRecords.length}회 기록됨)
                                </span>
                              )}
                            </span>
                          </div>
                        )}

                        {/* 공휴일 근무 표시 - 직원에게는 분 단위로 표시 */}
                        {status.isHoliday && (
                          <div className="flex items-center text-sm">
                            <div className="h-2 w-2 bg-red-500 rounded-full mr-2"></div>
                            <span className="text-red-700 font-medium">
                              공휴일 근무 {status.workHours && formatHolidayWorkTime(status.workHours.totalMinutes)}
                            </span>
                          </div>
                        )}
                        
                        {/* 총 근무시간 표시 - 시간외 근무시간 포함 */}
                        {status.workHours && (
                          <div className="flex items-center text-sm">
                            <div className="h-2 w-2 bg-blue-500 rounded-full mr-2"></div>
                            <span className="text-blue-700 font-medium">
                              총 {status.totalWorkHours 
                                ? status.totalWorkHours.formattedTime 
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
                  총 근무시간 {formatMinutesToHoursAndMinutes(calculateTotalWorkMinutesLocal())}
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
            
            <div className="flex flex-col items-center justify-center mb-4">
              <QRCodeGenerator recordType={qrCodeType} />
              <p className="text-sm text-center text-gray-600 mt-4">
                이 QR 코드를 직원들이 스캔하도록 하세요
              </p>
            </div>
            
            <button 
              onClick={() => setShowQRCode(false)}
              className="w-full py-3 bg-gray-200 text-gray-800 rounded-lg font-medium"
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

      {/* 시간외 근무 사유 입력 모달 - z-index 높게 설정 */}
      {isOvertimeReasonModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">시간외 근무 사유</h3>
              <button 
                onClick={() => {
                  setIsOvertimeReasonModalOpen(false);
                  setPendingOvertimeRecord(null);
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="p-4 bg-blue-50 text-blue-700 rounded-lg">
                <p className="font-medium">시간외 근무를 기록합니다</p>
                <p className="text-sm mt-1">
                  근무 유형: {pendingOvertimeRecord?.recordType && getRecordTypeLabel(pendingOvertimeRecord.recordType)}
                </p>
                <p className="text-sm">
                  시간: {pendingOvertimeRecord?.timestamp && formatTimestamp(pendingOvertimeRecord.timestamp)}
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  시간외 근무 사유
                </label>
                <textarea
                  className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  value={overtimeReason}
                  onChange={(e) => setOvertimeReason(e.target.value)}
                  placeholder="사유를 입력해주세요"
                  rows={3}
                  autoFocus
                />
              </div>
            </div>
            
            <div className="flex space-x-3 mt-6">
              <button
                onClick={() => {
                  setIsOvertimeReasonModalOpen(false);
                  setPendingOvertimeRecord(null);
                }}
                className="flex-1 py-3 border-2 border-gray-300 rounded-lg text-gray-700 font-medium"
              >
                취소
              </button>
              <button
                onClick={saveOvertimeWithReason}
                disabled={actionLoading}
                className="flex-1 py-3 bg-blue-600 text-white rounded-lg font-medium disabled:opacity-50"
              >
                {actionLoading ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}; 