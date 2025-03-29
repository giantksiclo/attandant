import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { LeaveCalendar } from '../components/LeaveCalendar';
import { supabase } from '../lib/supabase';

type LeaveType = 'annual' | 'special';

interface SpecialLeave {
  id: string;
  total_days: number;
  remaining_days: number;
  reason: string;
  expires_at: string;
}

// 연차 신청 타입 정의
interface LeaveRequestType {
  id: string;
  user_id: string;
  start_date: string;
  end_date: string;
  leave_type: 'annual' | 'special';
  leave_source: 'half_day' | 'full_day';
  special_leave_id: string | null;
  total_days: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

const LeaveRequest = () => {
  const navigate = useNavigate();
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [leaveType, setLeaveType] = useState<LeaveType>('annual');
  const [specialLeaveId, setSpecialLeaveId] = useState<string>('');
  const [isHalfDay, setIsHalfDay] = useState<boolean>(false);
  const [halfDayPeriod, setHalfDayPeriod] = useState<'morning' | 'afternoon'>('morning');
  const [reason, setReason] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [specialLeaves, setSpecialLeaves] = useState<SpecialLeave[]>([]);
  const [annualLeaveInfo, setAnnualLeaveInfo] = useState<{total: number, used: number, remaining: number}>({
    total: 0,
    used: 0,
    remaining: 0
  });
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [selectedDates, setSelectedDates] = useState<Date[]>([]);
  const [calculatedDays, setCalculatedDays] = useState<number>(0);
  const [existingLeaves, setExistingLeaves] = useState<LeaveRequestType[]>([]);
  
  // 수정 관련 상태
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [editingLeave, setEditingLeave] = useState<LeaveRequestType | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [withdrawConfirmId, setWithdrawConfirmId] = useState<string | null>(null);

  useEffect(() => {
    const fetchUserAndLeaves = async () => {
      try {
        // 현재 로그인된 사용자 정보 가져오기
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
          toast.error('로그인이 필요합니다');
          navigate('/login');
          return;
        }
        
        setCurrentUser(user);
        
        // 사용자의 프로필 정보 가져오기
        const { data: profileData } = await supabase
          .from('profiles_new')
          .select('*')
          .eq('id', user.id)
          .single();
          
        if (!profileData) {
          toast.error('프로필 정보를 찾을 수 없습니다');
          return;
        }
        
        // 사용자의 기존 연차 신청 내역 가져오기
        const { data: leaves } = await supabase
          .from('leave_requests')
          .select('*')
          .eq('user_id', user.id);
          
        if (leaves) {
          setExistingLeaves(leaves);
        }
        
        // 외부 시스템에서 사용자의 연차 정보 가져오기
        fetchLeaveInfoFromExternalSystem();
      } catch (error) {
        console.error('Error fetching user data:', error);
        toast.error('사용자 정보를 불러오는데 실패했습니다');
      }
    };

    fetchUserAndLeaves();
  }, [navigate]);

  // 외부 시스템에서 연차 정보 가져오기 (employ 프로젝트)
  const fetchLeaveInfoFromExternalSystem = async () => {
    try {
      const employSupabase = supabase.setProject('qebiqdtvyvnzizddmczj');
      
      // 직원 ID 찾기 (email로 매칭)
      const { data: userData } = await supabase.auth.getUser();
      
      if (!userData.user) return;
      
      const { data: employeeData } = await employSupabase
        .from('employees')
        .select('id')
        .eq('email', userData.user.email)
        .single();
        
      if (!employeeData) {
        console.log('외부 시스템에서 직원 정보를 찾을 수 없습니다');
        return;
      }
      
      const employeeId = employeeData.id;
      
      // 연차 정보 가져오기
      const currentYear = new Date().getFullYear();
      
      const { data: annualLeave } = await employSupabase
        .from('annual_leaves')
        .select('*')
        .eq('employee_id', employeeId)
        .eq('year', currentYear)
        .single();
        
      if (annualLeave) {
        setAnnualLeaveInfo({
          total: annualLeave.total_days,
          used: annualLeave.used_days,
          remaining: annualLeave.remaining_days
        });
      }
      
      // 특별 연차 정보 가져오기
      const { data: specialLeavesData } = await employSupabase
        .from('special_leaves')
        .select('*')
        .eq('employee_id', employeeId)
        .gt('remaining_days', 0)
        .lt('expires_at', new Date().toISOString());
        
      if (specialLeavesData) {
        setSpecialLeaves(specialLeavesData);
      }
    } catch (error) {
      console.error('Error fetching leave info from external system:', error);
    }
  };

  // 날짜 범위에서 일요일을 제외하고 일수 계산
  const calculateBusinessDays = (start: Date, end: Date): number => {
    let count = 0;
    const curDate = new Date(start.getTime());
    
    while (curDate <= end) {
      const dayOfWeek = curDate.getDay();
      if (dayOfWeek !== 0) { // 0은 일요일
        count++;
      }
      curDate.setDate(curDate.getDate() + 1);
    }
    
    return count;
  };

  // 날짜 선택 변경 시 계산
  useEffect(() => {
    if (startDate && endDate) {
      if (isHalfDay) {
        // 반차는 시작일과 종료일이 같아야 함
        if (startDate.getTime() !== endDate.getTime()) {
          setEndDate(startDate);
        }
        setCalculatedDays(0.5);
      } else {
        // 일수 계산 (일요일 제외)
        const days = calculateBusinessDays(startDate, endDate);
        setCalculatedDays(days);
        
        // 선택된 날짜 배열 생성
        const dates: Date[] = [];
        const currentDate = new Date(startDate.getTime());
        
        while (currentDate <= endDate) {
          if (currentDate.getDay() !== 0) { // 일요일 제외
            dates.push(new Date(currentDate.getTime()));
          }
          currentDate.setDate(currentDate.getDate() + 1);
        }
        
        setSelectedDates(dates);
      }
    } else {
      setCalculatedDays(0);
      setSelectedDates([]);
    }
  }, [startDate, endDate, isHalfDay]);

  // 반차 선택 시 시작일과 종료일 동기화
  useEffect(() => {
    if (isHalfDay && startDate) {
      setEndDate(startDate);
    }
  }, [isHalfDay, startDate]);

  // 연차 신청 수정을 위한 함수
  const openEditModal = (leave: LeaveRequestType) => {
    if (leave.status !== 'pending') {
      toast.error('이미 처리된 연차는 수정할 수 없습니다.');
      return;
    }
    
    setEditingLeave(leave);
    
    // 수정할 신청 정보로 폼 설정
    setLeaveType(leave.leave_type);
    setSpecialLeaveId(leave.special_leave_id || '');
    setIsHalfDay(leave.leave_source === 'half_day');
    setStartDate(new Date(leave.start_date));
    setEndDate(new Date(leave.end_date));
    setReason(leave.reason);
    
    setIsEditModalOpen(true);
  };

  // 수정 완료 처리
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!editingLeave || !startDate || !endDate) {
      toast.error('필수 정보가 누락되었습니다.');
      return;
    }
    
    try {
      setLoading(true);
      
      // 수정된 연차 신청 데이터
      const updatedData = {
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0],
        leave_type: leaveType,
        leave_source: isHalfDay ? 'half_day' : 'full_day',
        special_leave_id: leaveType === 'special' ? specialLeaveId : null,
        total_days: calculatedDays,
        reason,
      };
      
      // Supabase에 업데이트
      const { data, error } = await supabase
        .from('leave_requests')
        .update(updatedData)
        .eq('id', editingLeave.id)
        .select();
        
      if (error) {
        throw error;
      }
      
      toast.success('연차 신청이 수정되었습니다.');
      
      // 기존 연차 목록 갱신
      if (data) {
        setExistingLeaves(existingLeaves.map(leave => 
          leave.id === editingLeave.id ? data[0] : leave
        ));
      }
      
      // 모달 닫기
      setIsEditModalOpen(false);
      setEditingLeave(null);
      
      // 폼 초기화
      resetForm();
      
    } catch (error: any) {
      console.error('Error updating leave request:', error);
      toast.error(`연차 신청 수정 중 오류가 발생했습니다: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 연차 신청 철회
  const withdrawLeaveRequest = async (id: string) => {
    try {
      setProcessingId(id);
      
      const { error } = await supabase
        .from('leave_requests')
        .delete()
        .eq('id', id);
        
      if (error) {
        throw error;
      }
      
      toast.success('연차 신청이 철회되었습니다.');
      
      // 목록에서 제거
      setExistingLeaves(existingLeaves.filter(leave => leave.id !== id));
      
    } catch (error: any) {
      console.error('Error withdrawing leave request:', error);
      toast.error(`연차 신청 철회 중 오류가 발생했습니다: ${error.message}`);
    } finally {
      setProcessingId(null);
      setWithdrawConfirmId(null);
    }
  };

  // 폼 초기화
  const resetForm = () => {
    setStartDate(null);
    setEndDate(null);
    setLeaveType('annual');
    setSpecialLeaveId('');
    setIsHalfDay(false);
    setReason('');
    setCalculatedDays(0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!startDate || !endDate) {
      toast.error('날짜를 선택해주세요');
      return;
    }
    
    if (!reason.trim()) {
      toast.error('사유를 입력해주세요');
      return;
    }
    
    if (leaveType === 'special' && !specialLeaveId) {
      toast.error('특별 연차를 선택해주세요');
      return;
    }
    
    try {
      setLoading(true);
      
      // 연차 신청 데이터 생성
      const leaveRequestData = {
        user_id: currentUser.id,
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0],
        leave_type: leaveType,
        leave_source: isHalfDay ? 'half_day' : 'full_day',
        special_leave_id: leaveType === 'special' ? specialLeaveId : null,
        total_days: calculatedDays,
        reason,
        status: 'pending', // 승인 대기 상태
      };
      
      // Supabase에 저장
      const { data, error } = await supabase
        .from('leave_requests')
        .insert(leaveRequestData)
        .select();
        
      if (error) {
        throw error;
      }
      
      toast.success('연차 신청이 완료되었습니다');
      // 폼 초기화
      setStartDate(null);
      setEndDate(null);
      setLeaveType('annual');
      setSpecialLeaveId('');
      setIsHalfDay(false);
      setReason('');
      
      // 기존 연차 리스트 갱신
      if (data) {
        setExistingLeaves([...existingLeaves, data[0]]);
      }
      
    } catch (error: any) {
      console.error('Error submitting leave request:', error);
      toast.error(`연차 신청 중 오류가 발생했습니다: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
  };

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">연차 신청</h1>
        <button 
          onClick={() => navigate('/')}
          className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md flex items-center"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
            <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
          </svg>
          메인으로
        </button>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 연차 폼 */}
        <div className="lg:col-span-2 bg-white shadow-md rounded-md p-6">
          <h2 className="text-lg font-semibold mb-4">연차 신청서</h2>
          
          {/* 연차 정보 */}
          <div className="mb-6 flex justify-between bg-gray-50 p-3 rounded-md">
            <div>
              <p className="text-sm text-gray-500">총 연차</p>
              <p className="font-medium">{annualLeaveInfo.total}일</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">사용</p>
              <p className="font-medium">{annualLeaveInfo.used}일</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">잔여</p>
              <p className="font-medium">{annualLeaveInfo.remaining}일</p>
            </div>
          </div>
          
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="leaveType" className="block text-sm font-medium text-gray-700 mb-1">연차 종류</label>
                <select
                  id="leaveType"
                  className="w-full p-2 border border-gray-300 rounded-md"
                  value={leaveType}
                  onChange={(e) => setLeaveType(e.target.value as LeaveType)}
                >
                  <option value="annual">일반 연차</option>
                  <option value="special">특별 연차</option>
                </select>
              </div>
              
              {leaveType === 'special' && (
                <div>
                  <label htmlFor="specialLeave" className="block text-sm font-medium text-gray-700 mb-1">특별 연차 선택</label>
                  <select
                    id="specialLeave"
                    className="w-full p-2 border border-gray-300 rounded-md"
                    value={specialLeaveId}
                    onChange={(e) => setSpecialLeaveId(e.target.value)}
                  >
                    <option value="">선택하세요</option>
                    {specialLeaves.map(leave => (
                      <option key={leave.id} value={leave.id}>
                        {`${leave.reason} (${leave.remaining_days}일 남음, ~${new Date(leave.expires_at).toLocaleDateString()})`}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              
              <div>
                <label htmlFor="halfDay" className="flex items-center text-sm font-medium text-gray-700 mb-1">
                  <input
                    id="halfDay"
                    type="checkbox"
                    className="mr-2"
                    checked={isHalfDay}
                    onChange={(e) => setIsHalfDay(e.target.checked)}
                  />
                  반차 신청
                </label>
                
                {isHalfDay && (
                  <div className="mt-2">
                    <label className="text-sm font-medium text-gray-700 mb-1">반차 구분</label>
                    <div className="flex gap-4">
                      <label className="flex items-center">
                        <input
                          type="radio"
                          className="mr-2"
                          name="halfDayPeriod"
                          value="morning"
                          checked={halfDayPeriod === 'morning'}
                          onChange={() => setHalfDayPeriod('morning')}
                        />
                        오전
                      </label>
                      <label className="flex items-center">
                        <input
                          type="radio"
                          className="mr-2"
                          name="halfDayPeriod"
                          value="afternoon"
                          checked={halfDayPeriod === 'afternoon'}
                          onChange={() => setHalfDayPeriod('afternoon')}
                        />
                        오후
                      </label>
                    </div>
                  </div>
                )}
              </div>
              
              <div>
                <label htmlFor="startDate" className="block text-sm font-medium text-gray-700 mb-1">시작일</label>
                <input
                  id="startDate"
                  type="date"
                  className="w-full p-2 border border-gray-300 rounded-md"
                  value={startDate ? startDate.toISOString().split('T')[0] : ''}
                  onChange={(e) => setStartDate(e.target.value ? new Date(e.target.value) : null)}
                />
              </div>
              
              {!isHalfDay && (
                <div>
                  <label htmlFor="endDate" className="block text-sm font-medium text-gray-700 mb-1">종료일</label>
                  <input
                    id="endDate"
                    type="date"
                    className="w-full p-2 border border-gray-300 rounded-md"
                    value={endDate ? endDate.toISOString().split('T')[0] : ''}
                    onChange={(e) => setEndDate(e.target.value ? new Date(e.target.value) : null)}
                    min={startDate ? startDate.toISOString().split('T')[0] : ''}
                  />
                </div>
              )}
              
              <div className="md:col-span-2">
                <label htmlFor="reason" className="block text-sm font-medium text-gray-700 mb-1">사유</label>
                <textarea
                  id="reason"
                  className="w-full p-2 border border-gray-300 rounded-md"
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="연차 사용 사유를 입력해주세요"
                ></textarea>
              </div>
            </div>
            
            <div className="mt-4">
              <p className="text-sm text-gray-600">
                {calculatedDays > 0 
                  ? `총 ${calculatedDays}일의 연차가 사용됩니다${isHalfDay ? ' (반차)' : ''}.` 
                  : '날짜를 선택해주세요.'}
              </p>
            </div>
            
            <div className="mt-6">
              <button
                type="submit"
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-400"
                disabled={loading || calculatedDays === 0 || !reason.trim()}
              >
                {loading ? '처리 중...' : '연차 신청'}
              </button>
            </div>
          </form>
        </div>
        
        {/* 달력 뷰 */}
        <div className="lg:col-span-1 bg-white shadow-md rounded-md p-6">
          <h2 className="text-lg font-semibold mb-4">연차 일정</h2>
          <LeaveCalendar 
            highlightDates={selectedDates}
            leaveRequests={existingLeaves}
          />
        </div>
      </div>
      
      {/* 기존 연차 신청 목록 */}
      <div className="mt-6 bg-white shadow-md rounded-md p-6">
        <h2 className="text-lg font-semibold mb-4">신청 내역</h2>
        {existingLeaves.length > 0 ? (
          <div className="overflow-x-auto -mx-4 sm:-mx-0">
            <table className="min-w-full divide-y divide-gray-200 table-auto">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">신청일</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">기간</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">종류</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">사유</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">상태</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">작업</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {existingLeaves.map((leave) => (
                  <tr key={leave.id}>
                    <td className="px-3 py-3 text-sm text-gray-500">
                      {new Date(leave.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-500 break-words min-w-[120px]">
                      {formatDate(leave.start_date)}
                      {leave.leave_source === 'half_day' ? ' (반차)' : ` ~ ${formatDate(leave.end_date)}`}
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-500">
                      {leave.leave_type === 'annual' ? '일반 연차' : '특별 연차'}
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-500 break-words max-w-[200px]">
                      {leave.reason}
                    </td>
                    <td className="px-3 py-3 text-sm">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        leave.status === 'approved' 
                          ? 'bg-green-100 text-green-800' 
                          : leave.status === 'rejected' 
                            ? 'bg-red-100 text-red-800'
                            : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {leave.status === 'approved' 
                          ? '승인됨' 
                          : leave.status === 'rejected' 
                            ? '반려됨'
                            : '승인 대기'}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-sm whitespace-nowrap">
                      {leave.status === 'pending' && (
                        <>
                          <button
                            onClick={() => openEditModal(leave)}
                            className="text-blue-600 hover:text-blue-900 mr-3"
                            disabled={processingId === leave.id}
                          >
                            수정
                          </button>
                          
                          {withdrawConfirmId === leave.id ? (
                            <>
                              <button
                                onClick={() => withdrawLeaveRequest(leave.id)}
                                className="text-red-600 hover:text-red-900 mr-2"
                                disabled={processingId === leave.id}
                              >
                                {processingId === leave.id ? '처리 중...' : '확인'}
                              </button>
                              <button
                                onClick={() => setWithdrawConfirmId(null)}
                                className="text-gray-600 hover:text-gray-900"
                              >
                                취소
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => setWithdrawConfirmId(leave.id)}
                              className="text-red-600 hover:text-red-900"
                              disabled={processingId === leave.id}
                            >
                              철회
                            </button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-500">연차 신청 내역이 없습니다.</p>
        )}
      </div>
      
      {/* 수정 모달 */}
      {isEditModalOpen && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center">
          <div className="relative bg-white rounded-lg shadow-xl mx-auto p-6 w-full max-w-2xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold">연차 신청 수정</h3>
              <button 
                className="text-gray-500 hover:text-gray-700"
                onClick={() => {
                  setIsEditModalOpen(false);
                  setEditingLeave(null);
                  resetForm();
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <form onSubmit={handleEditSubmit}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="editLeaveType" className="block text-sm font-medium text-gray-700 mb-1">연차 종류</label>
                  <select
                    id="editLeaveType"
                    className="w-full p-2 border border-gray-300 rounded-md"
                    value={leaveType}
                    onChange={(e) => setLeaveType(e.target.value as LeaveType)}
                  >
                    <option value="annual">일반 연차</option>
                    <option value="special">특별 연차</option>
                  </select>
                </div>
                
                {leaveType === 'special' && (
                  <div>
                    <label htmlFor="editSpecialLeave" className="block text-sm font-medium text-gray-700 mb-1">특별 연차 선택</label>
                    <select
                      id="editSpecialLeave"
                      className="w-full p-2 border border-gray-300 rounded-md"
                      value={specialLeaveId}
                      onChange={(e) => setSpecialLeaveId(e.target.value)}
                    >
                      <option value="">선택하세요</option>
                      {specialLeaves.map(leave => (
                        <option key={leave.id} value={leave.id}>
                          {`${leave.reason} (${leave.remaining_days}일 남음, ~${new Date(leave.expires_at).toLocaleDateString()})`}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                
                <div>
                  <label htmlFor="editHalfDay" className="flex items-center text-sm font-medium text-gray-700 mb-1">
                    <input
                      id="editHalfDay"
                      type="checkbox"
                      className="mr-2"
                      checked={isHalfDay}
                      onChange={(e) => setIsHalfDay(e.target.checked)}
                    />
                    반차 신청
                  </label>
                  
                  {isHalfDay && (
                    <div className="mt-2">
                      <label className="text-sm font-medium text-gray-700 mb-1">반차 구분</label>
                      <div className="flex gap-4">
                        <label className="flex items-center">
                          <input
                            type="radio"
                            className="mr-2"
                            name="editHalfDayPeriod"
                            value="morning"
                            checked={halfDayPeriod === 'morning'}
                            onChange={() => setHalfDayPeriod('morning')}
                          />
                          오전
                        </label>
                        <label className="flex items-center">
                          <input
                            type="radio"
                            className="mr-2"
                            name="editHalfDayPeriod"
                            value="afternoon"
                            checked={halfDayPeriod === 'afternoon'}
                            onChange={() => setHalfDayPeriod('afternoon')}
                          />
                          오후
                        </label>
                      </div>
                    </div>
                  )}
                </div>
                
                <div>
                  <label htmlFor="editStartDate" className="block text-sm font-medium text-gray-700 mb-1">시작일</label>
                  <input
                    id="editStartDate"
                    type="date"
                    className="w-full p-2 border border-gray-300 rounded-md"
                    value={startDate ? startDate.toISOString().split('T')[0] : ''}
                    onChange={(e) => setStartDate(e.target.value ? new Date(e.target.value) : null)}
                  />
                </div>
                
                {!isHalfDay && (
                  <div>
                    <label htmlFor="editEndDate" className="block text-sm font-medium text-gray-700 mb-1">종료일</label>
                    <input
                      id="editEndDate"
                      type="date"
                      className="w-full p-2 border border-gray-300 rounded-md"
                      value={endDate ? endDate.toISOString().split('T')[0] : ''}
                      onChange={(e) => setEndDate(e.target.value ? new Date(e.target.value) : null)}
                      min={startDate ? startDate.toISOString().split('T')[0] : ''}
                    />
                  </div>
                )}
                
                <div className="md:col-span-2">
                  <label htmlFor="editReason" className="block text-sm font-medium text-gray-700 mb-1">사유</label>
                  <textarea
                    id="editReason"
                    className="w-full p-2 border border-gray-300 rounded-md"
                    rows={3}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="연차 사용 사유를 입력해주세요"
                  ></textarea>
                </div>
              </div>
              
              <div className="mt-4">
                <p className="text-sm text-gray-600">
                  {calculatedDays > 0 
                    ? `총 ${calculatedDays}일의 연차가 사용됩니다${isHalfDay ? ' (반차)' : ''}.` 
                    : '날짜를 선택해주세요.'}
                </p>
              </div>
              
              <div className="mt-6 flex justify-end space-x-3">
                <button
                  type="button"
                  className="bg-gray-300 text-gray-800 px-4 py-2 rounded-md hover:bg-gray-400"
                  onClick={() => {
                    setIsEditModalOpen(false);
                    setEditingLeave(null);
                    resetForm();
                  }}
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-400"
                  disabled={loading || calculatedDays === 0 || !reason.trim()}
                >
                  {loading ? '처리 중...' : '수정 완료'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default LeaveRequest; 