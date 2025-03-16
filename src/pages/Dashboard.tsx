import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, fetchProfile, saveAttendance, getTodayAttendance, getMonthAttendance, updateProfile, updateUserMetadata, type Profile, type AttendanceRecord } from '../lib/supabase';
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
  const [userEmail, setUserEmail] = useState<string>('');
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);

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

  // 프로필 업데이트 함수
  const handleUpdateProfile = async (role: 'admin' | 'staff' = 'admin') => {
    if (!profile) return;
    
    try {
      setIsUpdatingProfile(true);
      
      // 프로필 데이터 준비
      const profileData = {
        id: profile.id,
        role: role,
        name: profile.name || '관리자',
        department: profile.department || '경영',
      };
      
      // 프로필 업데이트
      const result = await updateProfile(profileData);
      
      if (!result.success) {
        const errorMessage = result.error && typeof result.error === 'object' && result.error !== null
          ? String(result.error) 
          : '프로필 업데이트 중 오류가 발생했습니다.';
        throw new Error(errorMessage);
      }
      
      // 세션 새로고침으로 메타데이터 변경사항 적용
      await supabase.auth.refreshSession();
      
      // 프로필 다시 로드
      const updatedProfile = await fetchProfile(profile.id);
      setProfile(updatedProfile);
      
      alert('프로필이 업데이트되었습니다. 관리자 권한이 적용되었습니다.');
      
      // 관리자 기능 표시를 위해 페이지 새로고침
      if (role === 'admin' && profile.role !== 'admin') {
        window.location.reload();
      }
    } catch (error: any) {
      console.error('프로필 업데이트 오류:', error);
      setError(error.message || '프로필 업데이트 중 오류가 발생했습니다.');
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  // 프로필 강제 생성 함수
  const handleForceCreateProfile = async () => {
    try {
      setLoading(true);
      
      // 현재 인증된 사용자 정보 가져오기
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        alert('로그인이 필요합니다.');
        navigate('/login');
        return;
      }
      
      console.log('프로필 강제 생성 시작 - 사용자 ID:', session.user.id);
      
      // 사용자 이름 설정
      const userName = session.user.email?.split('@')[0] || '사용자';
      const department = '미지정';
      const role = 'admin';
      
      // 1. Auth 사용자 메타데이터 업데이트
      const { success: metaSuccess } = await updateUserMetadata({
        name: userName,
        department: department,
        role: role
      });
      
      if (!metaSuccess) {
        console.warn('사용자 메타데이터 업데이트 실패, 프로필 생성 계속 진행');
      } else {
        console.log('사용자 메타데이터 업데이트 성공');
      }
      
      // 2. 프로필 데이터 직접 생성
      const { error } = await supabase
        .from('profiles')
        .insert({
          id: session.user.id,
          name: userName,
          department: department,
          role: role,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          instance_id: 1 // 기본값 0 대신 1로 설정
        });
      
      if (error) {
        console.error('프로필 강제 생성 오류:', error);
        
        if (error.code === '23505') { // 중복 키
          alert('이미 프로필이 존재합니다. 강제 업데이트를 진행합니다.');
          
          // 업데이트로 시도
          const { error: updateError } = await supabase
            .from('profiles')
            .update({
              name: userName,
              department: department,
              role: role,
              updated_at: new Date().toISOString(),
              instance_id: 1 // 기본값 0 대신 1로 설정
            })
            .eq('id', session.user.id);
          
          if (updateError) {
            throw new Error('프로필 강제 업데이트 실패: ' + updateError.message);
          }
        } else {
          throw new Error('프로필 강제 생성 실패: ' + error.message);
        }
      }
      
      // 3. 프로필 다시 로드 및 세션 새로고침
      await supabase.auth.refreshSession();
      const refreshedProfile = await fetchProfile(session.user.id);
      setProfile(refreshedProfile);
      
      alert('프로필이 강제로 생성/업데이트되었습니다.');
    } catch (error: any) {
      console.error('프로필 강제 생성 오류:', error);
      setError(error.message || '프로필 강제 생성 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
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

      {/* 디버깅 정보 (개발 환경에서만 표시) */}
      <div className="bg-yellow-50 p-2 text-xs text-yellow-800 border-b border-yellow-200">
        <div>프로필 데이터: {profile ? '있음' : '없음'}</div>
        <div>이메일: {userEmail || '없음'}</div>
        <div>역할: {profile?.role || '없음'}</div>
        <div>ID: {profile?.id || '없음'}</div>
        <button
          onClick={handleForceCreateProfile}
          className="mt-1 px-2 py-0.5 text-xs bg-red-200 text-red-800 rounded hover:bg-red-300"
        >
          프로필 강제 생성/업데이트
        </button>
      </div>

      {/* 계정 정보 섹션 */}
      <div className="bg-white shadow-sm px-4 py-3 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
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
                
                {/* 프로필 업데이트 버튼 */}
                <button
                  onClick={() => handleUpdateProfile('admin')}
                  disabled={isUpdatingProfile || profile?.role === 'admin'}
                  className="ml-2 px-2 py-0.5 text-xs bg-green-100 text-green-800 rounded-full hover:bg-green-200 disabled:opacity-50"
                >
                  {isUpdatingProfile 
                    ? '처리 중...' 
                    : profile?.role === 'admin' 
                      ? '이미 관리자' 
                      : '관리자로 설정'}
                </button>
              </div>
              <p className="text-sm text-gray-600">
                {profile?.department || '부서 정보 없음'} • 
                <span className="text-blue-600"> {userEmail || '이메일 정보 없음'}</span>
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end">
            <p className="text-sm text-gray-500 mb-1">
              {new Date().toLocaleDateString('ko-KR', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric', 
                weekday: 'long' 
              })}
            </p>
            
            {/* 프로필 강제 새로고침 버튼 */}
            <div className="flex space-x-2">
              <button
                onClick={async () => {
                  if (!profile) return;
                  setLoading(true);
                  const refreshedProfile = await fetchProfile(profile.id);
                  setProfile(refreshedProfile);
                  setLoading(false);
                  alert('프로필 정보가 새로고침되었습니다.');
                }}
                className="text-xs text-blue-600 hover:underline"
              >
                프로필 새로고침
              </button>
            </div>
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