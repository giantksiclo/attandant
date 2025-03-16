import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, fetchProfile, saveAttendance, getTodayAttendance, getMonthAttendance, type Profile, type AttendanceRecord } from '../lib/supabase';
import { QRScanner } from '../components/QRScanner';
import { QRCodeGenerator } from '../components/QRCodeGenerator';
import { AttendanceCalendar } from '../components/AttendanceCalendar';
import { validateQRData, getRecordTypeLabel, formatTimestamp } from '../lib/qrUtils';

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
        const { data: { session } } = await supabase.auth.getSession();

        if (!session) {
          // 세션이 없으면 로그인 페이지로 이동
          navigate('/login');
          return;
        }

        // 프로필 정보 로드
        const profile = await fetchProfile(session.user.id);
        setProfile(profile);

        // 오늘의 출결 기록 로드
        const todayRecords = await getTodayAttendance(session.user.id);
        setTodayRecords(todayRecords);
        
        // 이번달 출결 기록 로드
        const monthRecords = await getMonthAttendance(session.user.id);
        setMonthRecords(monthRecords);
      } catch (error) {
        console.error('세션/프로필 로드 오류:', error);
        setError('정보를 불러오는 중 오류가 발생했습니다.');
      } finally {
        setLoading(false);
      }
    };

    checkSession();

    // 인증 상태 변경 구독
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        navigate('/login');
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
    if (!profile || !currentAction) return;
    
    try {
      setActionLoading(true);
      setError(null);
      setIsQRScannerOpen(false);
      
      // QR 데이터 유효성 검증
      if (!validateQRData(data)) {
        throw new Error('유효하지 않은 QR 코드입니다.');
      }
      
      // QR 코드 타입과 현재 액션 비교 (추가 보안 검증)
      if (data.type !== currentAction) {
        throw new Error(`${getRecordTypeLabel(currentAction)} QR 코드가 아닙니다.`);
      }

      console.log('QR 스캔 성공:', data);
      
      // 출결 기록 저장
      const result = await saveAttendance(profile.id, currentAction, data.location);
      
      if (!result.success) {
        throw new Error(result.error?.message || '출결 기록 중 오류가 발생했습니다.');
      }

      // 기록 후 오늘의 기록 다시 로드
      const records = await getTodayAttendance(profile.id);
      setTodayRecords(records);
      
      // 이번달 기록도 다시 로드
      const monthRecords = await getMonthAttendance(profile.id);
      setMonthRecords(monthRecords);

      // 성공 메시지
      const actionText = getRecordTypeLabel(currentAction);
      alert(`${actionText} 기록이 완료되었습니다.\n위치: ${data.location}\n시간: ${formatTimestamp(data.timestamp)}`);
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
        <div className="px-4 py-4 flex justify-between items-center">
          <h1 className="text-lg font-bold text-gray-900">샤인치과 출결관리</h1>
          
          <div className="flex items-center space-x-4">
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
                <span className="text-sm font-medium text-gray-700">
                  {profile.name || '이름 없음'}
                </span>
              </div>
            )}
            
            <button
              onClick={handleLogout}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              로그아웃
            </button>
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
              {todayRecords.map((record) => (
                <div key={record.id} className="flex justify-between items-center p-3 border border-gray-100 rounded-lg">
                  <span className="font-medium text-gray-800">
                    {record.record_type === 'check_in' && '출근'}
                    {record.record_type === 'check_out' && '퇴근'}
                    {record.record_type === 'overtime_end' && '시간외근무 종료'}
                  </span>
                  <span className="text-gray-600 bg-gray-100 px-3 py-1 rounded-full text-sm">
                    {formatTime(record.timestamp)}
                    {record.location && ` (${record.location})`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* 이번달 기록 */}
        <div className="bg-white shadow rounded-xl p-5 mb-5">
          <div 
            className="flex justify-between items-center mb-2 cursor-pointer" 
            onClick={toggleMonthCalendar}
          >
            <h2 className="text-lg font-bold text-gray-900">이번달 기록</h2>
            <button className="text-blue-600 hover:text-blue-700 text-sm font-medium">
              {showMonthCalendar ? '접기' : '달력 보기'}
            </button>
          </div>
          
          {showMonthCalendar ? (
            <div className="mt-4">
              <AttendanceCalendar records={monthRecords} />
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
    </div>
  );
}; 