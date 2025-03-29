import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { supabase } from '../lib/supabase';
import { LeaveCalendar } from '../components/LeaveCalendar';

interface LeaveRequest {
  id: string;
  user_id: string;
  start_date: string;
  end_date: string;
  leave_type: string;
  leave_source: string;
  special_leave_id: string | null;
  total_days: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  approval_date: string | null;
  approved_by: string | null;
  created_at: string;
  userName?: string;
  userDepartment?: string;
}

interface EmployeeInfo {
  id: string;
  name: string;
  department: string;
  email: string;
  annualLeave?: {
    total: number;
    used: number;
    remaining: number;
  };
  specialLeaves?: Array<{
    id: string;
    total_days: number;
    used_days: number;
    remaining_days: number;
    reason: string;
    expires_at: string;
  }>;
}

// 상태 업데이트 시 사용하는 타입
interface LeaveRequestUpdate {
  status: 'pending' | 'approved' | 'rejected';
  approval_date: string;
  approved_by: string;
}

const LeaveManagement = () => {
  const navigate = useNavigate();
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [filteredRequests, setFilteredRequests] = useState<LeaveRequest[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [loading, setLoading] = useState<boolean>(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [calendarView, setCalendarView] = useState<boolean>(false);
  const [employees, setEmployees] = useState<EmployeeInfo[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);
  const [months, setMonths] = useState<{ year: number; month: number }[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<{ year: number; month: number } | null>(null);
  const [departments, setDepartments] = useState<string[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    const createUserProfile = async (userId: string, userEmail: string) => {
      try {
        console.log('Creating new profile for user:', userId);
        
        // 기본 프로필 데이터
        const profileData = {
          id: userId,
          name: userEmail.split('@')[0], // 이메일 앞부분을 이름으로 사용
          department: '미지정',
          role: 'staff', // 기본값은 일반 직원
          email: userEmail,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        
        const { data, error } = await supabase
          .from('profiles_new')
          .insert(profileData)
          .select()
          .single();
          
        if (error) {
          console.error('Error creating profile:', error);
          return null;
        }
        
        console.log('Profile created successfully:', data);
        return data;
      } catch (error) {
        console.error('Error in profile creation:', error);
        return null;
      }
    };

    const checkAdmin = async () => {
      try {
        // 인증 상태 확인
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        
        if (authError) {
          console.error('Auth error:', authError);
          toast.error('인증 오류가 발생했습니다. 다시 로그인해주세요.');
          navigate('/login');
          return false;
        }
        
        if (!user) {
          console.error('No user found');
          toast.error('로그인이 필요합니다');
          navigate('/login');
          return false;
        }
        
        console.log('User authenticated:', user.id);
        setCurrentUser(user);
        
        // 사용자 프로필 정보 확인
        const { data: profileData, error: profileError } = await supabase
          .from('profiles_new')
          .select('*')
          .eq('id', user.id)
          .single();
          
        // 프로필이 없는 경우 (PGRST116: 단일 행을 찾을 수 없음)
        if (profileError && profileError.code === 'PGRST116' && user.email) {
          console.log('Profile not found, attempting to create');
          
          // 프로필 자동 생성 시도
          const newProfile = await createUserProfile(user.id, user.email);
          
          if (newProfile) {
            if (newProfile.role !== 'admin') {
              toast.error('관리자 권한이 필요합니다');
              navigate('/');
              return false;
            }
            
            console.log('Profile created with admin rights');
            return true;
          } else {
            toast.error('프로필 생성에 실패했습니다. 관리자에게 문의하세요.');
            navigate('/');
            return false;
          }
        } else if (profileError) {
          console.error('Profile error:', profileError);
          toast.error('프로필 정보를 가져오는 중 오류가 발생했습니다.');
          navigate('/');
          return false;
        }
        
        if (!profileData) {
          console.error('No profile data');
          toast.error('프로필 정보를 찾을 수 없습니다');
          navigate('/');
          return false;
        }
        
        console.log('Profile data:', profileData);
        
        // 관리자 권한 확인
        if (profileData.role !== 'admin') {
          console.error('Not admin role:', profileData.role);
          toast.error('관리자 권한이 필요합니다');
          navigate('/');
          return false;
        }
        
        console.log('Admin access confirmed');
        return true;
      } catch (error) {
        console.error('Unexpected error during auth check:', error);
        toast.error('인증 과정에서 예상치 못한 오류가 발생했습니다.');
        navigate('/login');
        return false;
      }
    };
    
    const fetchData = async () => {
      const isAdmin = await checkAdmin();
      if (!isAdmin) return;
      
      try {
        setLoading(true);
        
        console.log('관리자 권한 확인 완료, 데이터 로드 시작');
        
        // 서비스 키 대신 현재 인증된 클라이언트 사용
        console.log('인증된 Supabase 클라이언트 사용');
        
        let requests = [];
        let profiles = [];
        
        // 모든 연차 신청 내역 가져오기
        try {
          const { data: requestsData, error: requestsError } = await supabase
            .from('leave_requests')
            .select('*')
            .order('created_at', { ascending: false });
            
          if (requestsError) {
            console.error('연차 신청 내역 조회 오류:', requestsError);
            toast.error('연차 신청 내역을 불러오는데 실패했습니다');
          } else {
            console.log(`연차 신청 내역 ${requestsData?.length || 0}개 조회 성공`);
            requests = requestsData || [];
          }
        } catch (requestFetchError) {
          console.error('연차 신청 내역 조회 중 예외 발생:', requestFetchError);
          toast.error('연차 신청 내역을 불러오는데 실패했습니다');
        }
        
        // 사용자 프로필 정보 가져오기
        try {
          const { data: profilesData, error: profilesError } = await supabase
            .from('profiles_new')
            .select('*');
            
          if (profilesError) {
            console.error('프로필 정보 조회 오류:', profilesError);
            toast.error('사용자 정보를 불러오는데 실패했습니다');
          } else {
            console.log(`사용자 프로필 ${profilesData?.length || 0}개 조회 성공`);
            profiles = profilesData || [];
          }
        } catch (profileFetchError) {
          console.error('프로필 정보 조회 중 예외 발생:', profileFetchError);
          toast.error('사용자 정보를 불러오는데 실패했습니다');
        }
        
        // 부서 목록 추출
        const depts = [...new Set(profiles.map(p => p.department))].filter(Boolean);
        console.log('부서 목록 추출:', depts);
        setDepartments(depts);
        
        // 연차 신청 내역에 사용자 정보 추가
        const requestsWithUserInfo = requests.map((req: LeaveRequest) => {
          const userProfile = profiles.find(p => p.id === req.user_id);
          return {
            ...req,
            userName: userProfile?.name || '알 수 없음',
            userDepartment: userProfile?.department || '알 수 없음'
          };
        });
        
        console.log('사용자 정보가 추가된 연차 신청 내역:', requestsWithUserInfo.length);
        setLeaveRequests(requestsWithUserInfo);
        setFilteredRequests(requestsWithUserInfo);
        
        // 직원 정보 취합
        const employeeList: EmployeeInfo[] = profiles.map(profile => ({
          id: profile.id,
          name: profile.name || '알 수 없음',
          department: profile.department || '알 수 없음',
          email: profile.email || '',
        }));
        
        console.log('기본 직원 정보 생성:', employeeList.length);
        setEmployees(employeeList);
        
        // 달력 표시용 월 정보 생성
        const today = new Date();
        const monthsList = [];
        for (let i = -1; i <= 6; i++) {
          const date = new Date(today.getFullYear(), today.getMonth() + i, 1);
          monthsList.push({
            year: date.getFullYear(),
            month: date.getMonth() + 1
          });
        }
        setMonths(monthsList);
        setSelectedMonth({
          year: today.getFullYear(),
          month: today.getMonth() + 1
        });
        
      } catch (error) {
        console.error('데이터 로드 중 최상위 오류 발생:', error);
        toast.error('데이터를 불러오는데 실패했습니다.');
      } finally {
        setLoading(false);
        console.log('데이터 로드 과정 완료, 로딩 상태 해제');
      }
    };
    
    fetchData();
  }, [navigate]);

  // useEffect 추가: 직원 선택 시 해당 직원의 연차 정보 조회
  useEffect(() => {
    if (selectedEmployee) {
      fetchSingleEmployeeInfo(selectedEmployee);
    }
  }, [selectedEmployee]);

  // 특정 직원의 연차 정보만 조회하는 함수
  const fetchSingleEmployeeInfo = async (employeeId: string) => {
    console.log(`직원 ID: ${employeeId}의 연차 정보 조회 시작`);
    try {
      // 선택한 직원 정보 찾기
      const selectedEmployee = employees.find(emp => emp.id === employeeId);
      if (!selectedEmployee) {
        console.error('직원 정보를 찾을 수 없습니다');
        return;
      }

      if (!selectedEmployee.email) {
        // 이메일 정보가 없는 경우 auth API를 통해 조회
        console.log(`직원 ${employeeId} 이메일 조회 시도`);
        
        try {
          // 특정 사용자 정보 조회
          const { data: userData, error: userError } = await supabase.auth.admin.getUserById(employeeId);
          
          if (!userError && userData && userData.user && userData.user.email) {
            console.log(`직원 ${employeeId} 이메일 조회 성공: ${userData.user.email}`);
            selectedEmployee.email = userData.user.email;
          } else {
            console.error(`직원 ${employeeId} 이메일 조회 실패:`, userError);
            
            // 일반 Auth API를 통한 조회 시도 (현재 사용자인 경우)
            if (currentUser && currentUser.id === employeeId && currentUser.email) {
              selectedEmployee.email = currentUser.email;
              console.log(`현재 사용자 이메일 사용: ${currentUser.email}`);
            } else {
              console.log(`직원 ${employeeId} 이메일 정보 없음`);
              return;
            }
          }
        } catch (err) {
          console.error(`직원 ${employeeId} 이메일 조회 중 예외 발생:`, err);
          return;
        }
      }

      if (!selectedEmployee.email) {
        console.log(`직원 ${employeeId} 이메일 정보 없어 연차 정보 조회 불가`);
        return;
      }

      // 외부 시스템에서 직원 정보 조회
      const employSupabase = supabase.setProject('qebiqdtvyvnzizddmczj');
      console.log(`직원 ${selectedEmployee.name} 이메일(${selectedEmployee.email})로 외부 시스템 ID 조회`);
      
      const { data: employeeData, error: employeeError } = await employSupabase
        .from('employees')
        .select('id')
        .eq('email', selectedEmployee.email)
        .single();
        
      if (employeeError || !employeeData) {
        console.error(`외부 시스템에서 직원 ${selectedEmployee.email} 정보 없음:`, employeeError);
        return;
      }
      
      const employeeExternalId = employeeData.id;
      console.log(`외부 시스템에서 직원 ID 조회 성공: ${employeeExternalId}`);
      
      // 일반 연차 정보 가져오기
      const currentYear = new Date().getFullYear();
      console.log(`${currentYear}년 연차 정보 조회 시도`);
      
      const { data: annualLeave, error: annualError } = await employSupabase
        .from('annual_leaves')
        .select('*')
        .eq('employee_id', employeeExternalId)
        .eq('year', currentYear)
        .single();
        
      if (annualError) {
        console.error(`연차 정보 조회 실패:`, annualError);
      } else if (annualLeave) {
        // 직원 상태 업데이트를 위한 복사본 생성
        const updatedEmployees = [...employees];
        const employeeToUpdate = updatedEmployees.find(emp => emp.id === employeeId);
        
        if (employeeToUpdate) {
          employeeToUpdate.annualLeave = {
            total: annualLeave.total_days,
            used: annualLeave.used_days,
            remaining: annualLeave.remaining_days
          };
          
          console.log(`연차 정보 조회 성공: 총 ${annualLeave.total_days}일, 사용 ${annualLeave.used_days}일, 잔여 ${annualLeave.remaining_days}일`);
          
          // 특별 연차 정보 가져오기
          console.log(`특별 연차 정보 조회 시도`);
          const { data: specialLeaves, error: specialError } = await employSupabase
            .from('special_leaves')
            .select('*')
            .eq('employee_id', employeeExternalId)
            .lt('expires_at', new Date().toISOString())
            .gt('remaining_days', 0);
            
          if (specialError) {
            console.error(`특별 연차 정보 조회 실패:`, specialError);
          } else if (specialLeaves && specialLeaves.length > 0) {
            employeeToUpdate.specialLeaves = specialLeaves;
            console.log(`특별 연차 정보 조회 성공: ${specialLeaves.length}개`);
          }
          
          // 업데이트된 직원 정보 저장
          setEmployees(updatedEmployees);
        }
      }
    } catch (error) {
      console.error(`직원 ${employeeId} 연차 정보 조회 중 오류 발생:`, error);
      toast.error('연차 정보를 불러오는데 실패했습니다.');
    }
  };

  // 필터링 처리
  useEffect(() => {
    let filtered = [...leaveRequests];
    
    if (statusFilter !== 'all') {
      filtered = filtered.filter(req => req.status === statusFilter);
    }
    
    if (departmentFilter !== 'all') {
      filtered = filtered.filter(req => req.userDepartment === departmentFilter);
    }
    
    if (selectedEmployee) {
      filtered = filtered.filter(req => req.user_id === selectedEmployee);
    }
    
    setFilteredRequests(filtered);
  }, [leaveRequests, statusFilter, departmentFilter, selectedEmployee]);

  // 연차 신청 승인/반려 처리
  const handleApproval = async (id: string, approve: boolean) => {
    try {
      setProcessingId(id);
      
      const leaveRequest = leaveRequests.find(req => req.id === id);
      if (!leaveRequest) {
        toast.error('신청 정보를 찾을 수 없습니다');
        return;
      }
      
      // 상태 업데이트
      const updateData: LeaveRequestUpdate = {
        status: approve ? 'approved' : 'rejected',
        approval_date: new Date().toISOString(),
        approved_by: currentUser.id
      };
      
      // 인증된 클라이언트 사용하여 데이터 업데이트
      const { error: updateError } = await supabase
        .from('leave_requests')
        .update(updateData)
        .eq('id', id);
        
      if (updateError) throw updateError;
      
      // 승인된 경우 외부 시스템에 연차 사용 기록 추가
      if (approve) {
        try {
          await updateExternalSystem(leaveRequest);
        } catch (externalError: any) {
          // 외부 시스템 업데이트 오류 시에도 UI 업데이트는 계속 진행
          console.error('외부 시스템 업데이트 중 오류 발생:', externalError);
          toast.warning(`외부 시스템 업데이트 중 오류 발생: ${externalError.message}`);
        }
      }
      
      // 로컬 상태 업데이트
      const updatedRequests = leaveRequests.map(req => 
        req.id === id ? { ...req, ...updateData } : req
      );
      
      setLeaveRequests(updatedRequests as LeaveRequest[]);
      toast.success(approve ? '연차가 승인되었습니다' : '연차가 반려되었습니다');
      
    } catch (error: any) {
      console.error('Error updating leave request:', error);
      toast.error(`처리 중 오류가 발생했습니다: ${error.message}`);
    } finally {
      setProcessingId(null);
    }
  };

  // 외부 시스템에 연차 사용 기록 추가
  const updateExternalSystem = async (leaveRequest: LeaveRequest) => {
    try {
      const employSupabase = supabase.setProject('qebiqdtvyvnzizddmczj');
      
      // 사용자 이메일 가져오기 - 조회 방식 개선
      let userEmail = '';
      
      // 1. 현재 사용자와 동일한 경우 현재 사용자 이메일 사용 (가장 빠르고 안정적인 방법)
      if (currentUser && currentUser.id === leaveRequest.user_id && currentUser.email) {
        userEmail = currentUser.email;
        console.log('Using current user email:', userEmail);
      }
      
      // 2. Auth API를 통해 사용자 정보 조회 (이메일 없는 경우에만)
      if (!userEmail) {
        try {
          // 특정 사용자 정보 조회
          const { data: userData, error: userError } = await supabase.auth.admin.getUserById(leaveRequest.user_id);
          
          if (!userError && userData && userData.user && userData.user.email) {
            userEmail = userData.user.email;
            console.log('Found email from auth API:', userEmail);
          } else {
            console.error('Auth API에서 사용자 조회 오류:', userError);
          }
        } catch (authError) {
          console.error('Auth API 호출 중 오류 발생:', authError);
        }
      }
      
      // 3. 일반 Auth API를 통해 현재 사용자 정보 조회 (다른 방법 실패 시)
      if (!userEmail) {
        try {
          const { data } = await supabase.auth.getUser();
          if (data && data.user && data.user.email) {
            userEmail = data.user.email;
            console.log('Using current auth user email:', userEmail);
          }
        } catch (authError) {
          console.error('일반 Auth API 호출 중 오류:', authError);
        }
      }
      
      // 이메일을 찾지 못한 경우
      if (!userEmail) {
        throw new Error('사용자 이메일을 찾을 수 없습니다');
      }
      
      // 외부 시스템에서 직원 ID 찾기
      const { data: employeeData, error: employeeError } = await employSupabase
        .from('employees')
        .select('id')
        .eq('email', userEmail)
        .single();
        
      if (employeeError || !employeeData) {
        throw new Error('외부 시스템에서 직원 정보를 찾을 수 없습니다');
      }
      
      const employeeId = employeeData.id;
      
      // 일반 연차인 경우
      if (leaveRequest.leave_type === 'annual') {
        const currentYear = new Date().getFullYear();
        
        // 연차 정보 조회
        const { data: annualLeave, error: annualError } = await employSupabase
          .from('annual_leaves')
          .select('*')
          .eq('employee_id', employeeId)
          .eq('year', currentYear)
          .single();
          
        if (annualError || !annualLeave) {
          throw new Error('연차 정보를 찾을 수 없습니다');
        }
        
        // 연차 기록 추가
        const leaveRecordData = {
          employee_id: employeeId,
          annual_leave_id: annualLeave.id,
          start_date: leaveRequest.start_date,
          end_date: leaveRequest.end_date,
          days: leaveRequest.total_days,
          reason: leaveRequest.reason,
          status: 'approved',
          leave_type: 'annual',
          is_half_day: leaveRequest.leave_source === 'half_day',
          half_day_type: leaveRequest.leave_source === 'half_day' ? 'morning' : null
        };
        
        const { error: recordError } = await employSupabase
          .from('leave_records')
          .insert(leaveRecordData);
          
        if (recordError) throw recordError;
        
        // 연차 잔여일수 업데이트
        const updatedRemaining = annualLeave.remaining_days - leaveRequest.total_days;
        const updatedUsed = annualLeave.used_days + leaveRequest.total_days;
        
        const { error: updateError } = await employSupabase
          .from('annual_leaves')
          .update({
            used_days: updatedUsed,
            remaining_days: updatedRemaining,
            updated_at: new Date().toISOString()
          })
          .eq('id', annualLeave.id);
          
        if (updateError) throw updateError;
      } 
      // 특별 연차인 경우
      else if (leaveRequest.leave_type === 'special' && leaveRequest.special_leave_id) {
        // 특별 연차 정보 조회
        const { data: specialLeave, error: specialError } = await employSupabase
          .from('special_leaves')
          .select('*')
          .eq('id', leaveRequest.special_leave_id)
          .single();
          
        if (specialError || !specialLeave) {
          throw new Error('특별 연차 정보를 찾을 수 없습니다');
        }
        
        // 특별 연차 기록 추가
        const specialLeaveRecordData = {
          employee_id: employeeId,
          special_leave_id: specialLeave.id,
          start_date: leaveRequest.start_date,
          end_date: leaveRequest.end_date,
          days: leaveRequest.total_days,
          reason: leaveRequest.reason,
          status: 'approved'
        };
        
        const { error: recordError } = await employSupabase
          .from('special_leave_records')
          .insert(specialLeaveRecordData);
          
        if (recordError) throw recordError;
        
        // 특별 연차 잔여일수 업데이트
        const updatedRemaining = specialLeave.remaining_days - leaveRequest.total_days;
        const updatedUsed = specialLeave.used_days + leaveRequest.total_days;
        
        const { error: updateError } = await employSupabase
          .from('special_leaves')
          .update({
            used_days: updatedUsed,
            remaining_days: updatedRemaining,
            updated_at: new Date().toISOString()
          })
          .eq('id', specialLeave.id);
          
        if (updateError) throw updateError;
      }
      
    } catch (error) {
      console.error('Error updating external system:', error);
      throw error;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
  };

  // 연차 신청 세부 정보
  const getLeaveDaysText = (leave: LeaveRequest) => {
    if (leave.leave_source === 'half_day') {
      return `${formatDate(leave.start_date)} (반차)`;
    } else {
      return `${formatDate(leave.start_date)} ~ ${formatDate(leave.end_date)} (${leave.total_days}일)`;
    }
  };

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">연차 관리</h1>
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
      
      {/* 필터 섹션 */}
      <div className="mb-6 bg-white p-4 rounded-md shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">상태 필터</label>
            <select
              className="w-full p-2 border border-gray-300 rounded-md"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">모든 상태</option>
              <option value="pending">승인 대기</option>
              <option value="approved">승인됨</option>
              <option value="rejected">반려됨</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">부서 필터</label>
            <select
              className="w-full p-2 border border-gray-300 rounded-md"
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
            >
              <option value="all">모든 부서</option>
              {departments.map(dept => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">직원 선택</label>
            <select
              className="w-full p-2 border border-gray-300 rounded-md"
              value={selectedEmployee || ''}
              onChange={(e) => setSelectedEmployee(e.target.value || null)}
            >
              <option value="">모든 직원</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.name} ({emp.department})</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">보기 방식</label>
            <div className="flex space-x-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  className="mr-2"
                  checked={!calendarView}
                  onChange={() => setCalendarView(false)}
                />
                리스트 보기
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  className="mr-2"
                  checked={calendarView}
                  onChange={() => setCalendarView(true)}
                />
                달력 보기
              </label>
            </div>
          </div>
        </div>
      </div>
      
      {/* 달력 보기 */}
      {calendarView && (
        <div className="bg-white p-4 rounded-md shadow-sm mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">연차 달력</h2>
            <div className="flex space-x-2 overflow-x-auto">
              {months.map(m => (
                <button
                  key={`${m.year}-${m.month}`}
                  className={`px-3 py-1 rounded text-sm ${
                    selectedMonth && selectedMonth.year === m.year && selectedMonth.month === m.month
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200'
                  }`}
                  onClick={() => setSelectedMonth(m)}
                >
                  {m.year}.{m.month}
                </button>
              ))}
            </div>
          </div>
          {selectedMonth && (
            <LeaveCalendar 
              leaveRequests={filteredRequests}
              year={selectedMonth.year}
              month={selectedMonth.month - 1}
            />
          )}
        </div>
      )}
      
      {/* 리스트 보기 */}
      {!calendarView && (
        <div className="bg-white rounded-md shadow-sm">
          {loading ? (
            <div className="p-6 text-center">로딩 중...</div>
          ) : filteredRequests.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">신청자</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">기간</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">종류</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">사유</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">상태</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">신청일</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">작업</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredRequests.map((request) => {
                    return (
                      <tr key={request.id}>
                        <td className="px-3 py-3">
                          <div className="font-medium text-gray-900">{request.userName}</div>
                          <div className="text-sm text-gray-500">{request.userDepartment}</div>
                        </td>
                        <td className="px-3 py-3 text-sm text-gray-500 break-words">
                          {getLeaveDaysText(request)}
                        </td>
                        <td className="px-3 py-3 text-sm text-gray-500">
                          {request.leave_type === 'annual' ? '일반 연차' : '특별 연차'}
                        </td>
                        <td className="px-3 py-3 text-sm text-gray-500 break-words max-w-[150px]">
                          {request.reason}
                        </td>
                        <td className="px-3 py-3">
                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            request.status === 'approved' 
                              ? 'bg-green-100 text-green-800' 
                              : request.status === 'rejected' 
                                ? 'bg-red-100 text-red-800'
                                : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {request.status === 'approved' 
                              ? '승인됨' 
                              : request.status === 'rejected' 
                                ? '반려됨'
                                : '승인 대기'}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-sm text-gray-500">
                          {new Date(request.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-3 py-3 text-sm text-right space-x-2">
                          {request.status === 'pending' ? (
                            <>
                              <button
                                className="text-green-600 hover:text-green-900 mr-2"
                                onClick={() => handleApproval(request.id, true)}
                                disabled={processingId === request.id}
                              >
                                {processingId === request.id ? '처리 중...' : '승인'}
                              </button>
                              <button
                                className="text-red-600 hover:text-red-900"
                                onClick={() => handleApproval(request.id, false)}
                                disabled={processingId === request.id}
                              >
                                {processingId === request.id ? '처리 중...' : '반려'}
                              </button>
                            </>
                          ) : (
                            <span className="text-gray-400">완료됨</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-6 text-center text-gray-500">
              조건에 맞는 연차 신청 내역이 없습니다.
            </div>
          )}
        </div>
      )}
      
      {/* 직원 연차 정보 */}
      {selectedEmployee && (
        <div className="mt-6 bg-white p-4 rounded-md shadow-sm">
          <h2 className="text-lg font-semibold mb-4">직원 연차 정보</h2>
          {(() => {
            const employee = employees.find(emp => emp.id === selectedEmployee);
            if (!employee) return <p className="text-gray-500">직원 정보를 찾을 수 없습니다.</p>;
            
            return (
              <div>
                <div className="mb-4">
                  <h3 className="font-medium">{employee.name} ({employee.department})</h3>
                  <p className="text-sm text-gray-500">{employee.email}</p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-gray-50 p-3 rounded">
                    <h4 className="font-medium mb-2">일반 연차</h4>
                    {employee.annualLeave ? (
                      <div className="flex justify-between">
                        <div>
                          <p className="text-sm text-gray-500">총 연차</p>
                          <p>{employee.annualLeave.total}일</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">사용</p>
                          <p>{employee.annualLeave.used}일</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">잔여</p>
                          <p>{employee.annualLeave.remaining}일</p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-gray-500">연차 정보가 없습니다.</p>
                    )}
                  </div>
                  
                  <div className="bg-gray-50 p-3 rounded">
                    <h4 className="font-medium mb-2">특별 연차</h4>
                    {employee.specialLeaves && employee.specialLeaves.length > 0 ? (
                      <div className="space-y-2">
                        {employee.specialLeaves.map(leave => (
                          <div key={leave.id} className="flex justify-between">
                            <div className="flex-1">
                              <p className="text-sm font-medium">{leave.reason}</p>
                              <p className="text-xs text-gray-500">만료: {new Date(leave.expires_at).toLocaleDateString()}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm">{leave.remaining_days} / {leave.total_days}일</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-gray-500">특별 연차가 없습니다.</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
};

export default LeaveManagement; 