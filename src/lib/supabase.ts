import { createClient } from '@supabase/supabase-js';

// 환경 변수에서 Supabase 설정 가져오기
const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY as string;

// 기본 데이터베이스 스키마 정의
const PROFILES_TABLE = 'profiles_new';

// Supabase 클라이언트 생성 - 디버깅 추가
console.log('Supabase 초기화 - URL:', supabaseUrl);
console.log('Supabase 초기화 - KEY:', supabaseAnonKey ? '설정됨' : '설정안됨');

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true
  }
});

// 현재 인증된 사용자의 상세 정보를 콘솔에 출력
supabase.auth.onAuthStateChange((event, session) => {
  console.log('인증 상태 변경:', event);
  console.log('세션 정보:', session ? {
    id: session.user.id,
    email: session.user.email,
    role: session.user.role,
    user_metadata: session.user.user_metadata,
  } : null);
});

// 프로필 정보 타입 정의
export type Profile = {
  id: string;
  name: string | null;
  department: string | null;
  role: 'admin' | 'staff';
  photo_url?: string | null;
  created_at: string;
  updated_at: string | null;
};

// 출결 기록 타입 정의
export type AttendanceRecord = {
  id: number;
  user_id: string;
  record_type: 'check_in' | 'check_out' | 'overtime_end';
  timestamp: string;
  location?: string | null;
  notes?: string | null;
};

// 출결 설정 타입 정의
export type AttendanceSettings = {
  id: number;
  day_of_week: number; // 0: 일요일, 1: 월요일, ... 6: 토요일
  is_working_day: boolean; // 근무일 여부
  work_start_time: string; // "09:00"
  work_end_time: string; // "18:00"
  lunch_start_time: string; // "12:00"
  lunch_end_time: string; // "13:00"
  updated_at: string;
};

// 공휴일 근무 시간 인터페이스
export interface HolidayWork {
  id?: string;
  date: string;
  work_minutes: number;
  description: string;
  created_by: string;
  created_at: string;
}

// 프로필 가져오기 함수 - 개선된 로직
export async function fetchProfile(userId: string) {
  console.log('프로필 조회 시작 - 사용자 ID:', userId);
  
  try {
    // 먼저 현재 사용자의 인증 정보 확인
    const { data: authData } = await supabase.auth.getUser();
    console.log('현재 인증된 사용자:', authData.user);
    
    // ID 확인
    if (authData.user?.id !== userId) {
      console.warn('인증된 사용자 ID와 요청된 ID가 일치하지 않습니다:', {
        authUserId: authData.user?.id,
        requestedId: userId
      });
    }
    
    // 프로필 정보 조회
    const { data, error } = await supabase
      .from(PROFILES_TABLE)
      .select('*')
      .eq('id', userId)
      .single();
    
    if (error) {
      console.error('프로필 조회 오류:', error);
      
      // 프로필이 없는 경우, 새 프로필 생성 시도
      if (error.code === 'PGRST116') { // 단일 행이 없는 경우 Supabase에서 발생하는 오류 코드
        console.log('프로필이 없어 새로 생성합니다.');
        const profile = await createProfile(userId);
        return profile;
      }
      
      return null;
    }
    
    console.log('프로필 조회 성공:', data);
    return data as Profile;
  } catch (error) {
    console.error('프로필 조회 중 예외 발생:', error);
    return null;
  }
}

// 프로필 생성 함수 - 개선된 로직
export async function createProfile(userId: string) {
  console.log('새 프로필 생성 시작 - 사용자 ID:', userId);
  
  // 사용자 정보 가져오기
  const { data: { user } } = await supabase.auth.getUser();
  console.log('인증된, 프로필 생성할 사용자:', user);
  
  if (!user) {
    console.error('사용자 정보를 가져올 수 없습니다.');
    return null;
  }
  
  // 메타데이터에서 이름 가져오기
  const userEmail = user.email || '';
  const userName = user.user_metadata?.name || userEmail.split('@')[0] || '사용자';
  const userDepartment = user.user_metadata?.department || '미지정';
  
  // 기본 프로필 데이터 설정
  const defaultProfileData = {
    id: userId,
    name: userName,
    department: userDepartment,
    role: 'staff' as const, // admin에서 staff로 변경
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  
  console.log('생성할 프로필 데이터:', defaultProfileData);
  
  try {
    // 1. Auth 사용자 메타데이터 업데이트
    const { success: metaSuccess } = await updateUserMetadata({
      name: userName,
      department: userDepartment,
      role: 'staff'
    });
    
    if (!metaSuccess) {
      console.warn('사용자 메타데이터 업데이트 실패, 프로필 생성 계속 진행');
    }
    
    // 2. 프로필 생성 - RLS 정책으로 인한 실패를 방지하기 위해 트랜잭션 사용
    const { data, error } = await supabase
      .from(PROFILES_TABLE)
      .insert(defaultProfileData)
      .select()
      .single();
    
    if (error) {
      console.error('프로필 생성 오류:', error);
      if (error.code === '23505') { // 중복 키 오류
        console.log('이미 존재하는 프로필입니다. 기존 프로필을 조회합니다.');
        const { data: existingProfile, error: fetchError } = await supabase
          .from(PROFILES_TABLE)
          .select('*')
          .eq('id', userId)
          .single();
        
        if (fetchError) {
          console.error('기존 프로필 조회 오류:', fetchError);
          return defaultProfileData; // 오류 시에도 기본 프로필 객체 반환
        }
        
        return existingProfile as Profile;
      }
      
      // 다른 오류의 경우 기본 프로필 객체 반환
      return defaultProfileData;
    }
    
    console.log('새 프로필 생성 성공:', data);
    return data as Profile;
  } catch (error) {
    console.error('프로필 생성 중 예외 발생:', error);
    return defaultProfileData;
  }
}

// 프로필 업데이트 함수 - 개선된 로직
export async function updateProfile(profile: Partial<Profile> & { id: string }) {
  console.log('프로필 업데이트 시작:', profile);
  
  try {
    // 1. Auth 사용자 메타데이터 업데이트
    if (profile.name || profile.department || profile.role) {
      const { success: metaSuccess } = await updateUserMetadata({
        name: profile.name,
        department: profile.department,
        role: profile.role
      });
      
      if (!metaSuccess) {
        console.warn('사용자 메타데이터 업데이트 실패, 프로필 업데이트 계속 진행');
      }
    }
    
    // 2. 프로필 데이터 업데이트
    const updateData = {
      ...profile,
      updated_at: new Date().toISOString()
    };
    
    const { data, error } = await supabase
      .from(PROFILES_TABLE)
      .update(updateData)
      .eq('id', profile.id)
      .select()
      .single();
    
    if (error) {
      console.error('프로필 업데이트 오류:', error);
      return { success: false, error };
    }
    
    console.log('프로필 업데이트 성공:', data);
    return { success: true, data };
  } catch (error) {
    console.error('프로필 업데이트 중 예외 발생:', error);
    return { success: false, error };
  }
}

// 출결 기록 저장 함수
export async function saveAttendance(userId: string, recordType: 'check_in' | 'check_out' | 'overtime_end', location?: string) {
  const { data, error } = await supabase
    .from('attendance_records')
    .insert({
      user_id: userId,
      record_type: recordType,
      timestamp: new Date().toISOString(),
      location: location || '샤인치과' // 기본값 설정
    })
    .select()
    .single();
    
  if (error) {
    console.error('출결 기록 저장 오류:', error);
    return { success: false, error };
  }
  
  return { success: true, data };
}

// 오늘의 출결 기록 가져오기
export async function getTodayAttendance(userId: string) {
  // 오늘 날짜의 시작(00:00:00) 구하기
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const { data, error } = await supabase
    .from('attendance_records')
    .select('*')
    .eq('user_id', userId)
    .gte('timestamp', today.toISOString())
    .order('timestamp', { ascending: true });
    
  if (error) {
    console.error('출결 기록 조회 오류:', error);
    return [];
  }
  
  return data as AttendanceRecord[];
}

// 이번달 출결 기록 가져오기
export async function getMonthAttendance(userId: string, year?: number, month?: number) {
  // 현재 날짜 기준으로 년도와 월 설정
  const now = new Date();
  const targetYear = year || now.getFullYear();
  const targetMonth = month || now.getMonth(); // 0부터 시작 (0 = 1월)
  
  // 해당 월의 시작일과 마지막일 계산
  const startDate = new Date(targetYear, targetMonth, 1);
  const endDate = new Date(targetYear, targetMonth + 1, 0);
  
  // 날짜 범위에 맞는 출결 기록 조회
  const { data, error } = await supabase
    .from('attendance_records')
    .select('*')
    .eq('user_id', userId)
    .gte('timestamp', startDate.toISOString())
    .lte('timestamp', new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), 23, 59, 59).toISOString())
    .order('timestamp', { ascending: true });
    
  if (error) {
    console.error('월간 출결 기록 조회 오류:', error);
    return [];
  }
  
  return data as AttendanceRecord[];
}

// Auth 사용자 메타데이터 업데이트 함수
export async function updateUserMetadata(userData: {
  name?: string | null;
  department?: string | null;
  role?: string | null;
}) {
  try {
    // null 값은 undefined로 변환하여 제거 (Supabase API는 null 값을 제거하지 않음)
    const cleanedData = Object.entries(userData).reduce((acc, [key, value]) => {
      if (value !== null) {
        acc[key] = value;
      }
      return acc;
    }, {} as Record<string, any>);
    
    console.log('사용자 메타데이터 업데이트 시작:', cleanedData);
    
    const { data, error } = await supabase.auth.updateUser({
      data: cleanedData
    });
    
    if (error) {
      console.error('사용자 메타데이터 업데이트 오류:', error);
      return { success: false, error };
    }
    
    console.log('사용자 메타데이터 업데이트 성공:', data.user.user_metadata);
    return { success: true, user: data.user };
  } catch (error) {
    console.error('사용자 메타데이터 업데이트 중 예외 발생:', error);
    return { success: false, error };
  }
}

// 근무 설정 가져오기 함수
export async function getWorkSettings() {
  console.log('근무시간 설정 조회 시작');
  
  try {
    const { data, error } = await supabase
      .from('attendance_settings')
      .select('*')
      .order('day_of_week', { ascending: true });
    
    if (error) {
      console.error('근무시간 설정 조회 오류:', error);
      // 기본 설정값 제공
      return generateDefaultWorkSettings();
    }
    
    if (!data || data.length === 0) {
      console.log('근무시간 설정이 없어 기본값 사용');
      return generateDefaultWorkSettings();
    }
    
    console.log('근무시간 설정 조회 성공:', data);
    return data as AttendanceSettings[];
  } catch (error) {
    console.error('근무시간 설정 조회 중 예외 발생:', error);
    return generateDefaultWorkSettings();
  }
}

// 기본 근무시간 설정 생성 함수
function generateDefaultWorkSettings(): AttendanceSettings[] {
  const now = new Date().toISOString();
  return [
    { id: 0, day_of_week: 0, is_working_day: false, work_start_time: '09:00', work_end_time: '18:00', lunch_start_time: '12:00', lunch_end_time: '13:00', updated_at: now },
    { id: 1, day_of_week: 1, is_working_day: true, work_start_time: '09:00', work_end_time: '18:00', lunch_start_time: '12:00', lunch_end_time: '13:00', updated_at: now },
    { id: 2, day_of_week: 2, is_working_day: true, work_start_time: '09:00', work_end_time: '18:00', lunch_start_time: '12:00', lunch_end_time: '13:00', updated_at: now },
    { id: 3, day_of_week: 3, is_working_day: true, work_start_time: '09:00', work_end_time: '18:00', lunch_start_time: '12:00', lunch_end_time: '13:00', updated_at: now },
    { id: 4, day_of_week: 4, is_working_day: true, work_start_time: '09:00', work_end_time: '18:00', lunch_start_time: '12:00', lunch_end_time: '13:00', updated_at: now },
    { id: 5, day_of_week: 5, is_working_day: true, work_start_time: '09:00', work_end_time: '18:00', lunch_start_time: '12:00', lunch_end_time: '13:00', updated_at: now },
    { id: 6, day_of_week: 6, is_working_day: false, work_start_time: '09:00', work_end_time: '18:00', lunch_start_time: '12:00', lunch_end_time: '13:00', updated_at: now },
  ];
}

// 근무 설정 업데이트 함수
export async function updateWorkSettings(settings: AttendanceSettings[]) {
  console.log('근무시간 설정 업데이트 시작:', settings);
  
  try {
    // 기존 데이터를 모두 삭제
    await supabase
      .from('attendance_settings')
      .delete()
      .neq('id', 0); // 모든 행 삭제 (안전을 위해 조건 추가)
    
    // 새 데이터 삽입
    const { data, error } = await supabase
      .from('attendance_settings')
      .insert(settings.map(s => ({
        day_of_week: s.day_of_week,
        is_working_day: s.is_working_day,
        work_start_time: s.work_start_time,
        work_end_time: s.work_end_time,
        lunch_start_time: s.lunch_start_time,
        lunch_end_time: s.lunch_end_time,
        updated_at: new Date().toISOString()
      })))
      .select();
    
    if (error) {
      console.error('근무시간 설정 업데이트 오류:', error);
      return { success: false, error };
    }
    
    console.log('근무시간 설정 업데이트 성공:', data);
    return { success: true, data };
  } catch (error) {
    console.error('근무시간 설정 업데이트 중 예외 발생:', error);
    return { success: false, error };
  }
}

// 시간이 근무시간 내인지 확인하는 함수
export function isWithinWorkHours(timestamp: string, settingsArray: AttendanceSettings[]): boolean {
  const date = new Date(timestamp);
  const dayOfWeek = date.getDay(); // 0: 일요일, 1: 월요일, ... 6: 토요일
  
  // 해당 요일의 설정 찾기
  const settings = settingsArray.find(s => s.day_of_week === dayOfWeek);
  
  if (!settings || !settings.is_working_day) {
    // 해당 요일 설정이 없거나 근무일이 아님
    return false;
  }
  
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const currentTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  
  // 근무 시작/종료 시간 확인
  return currentTime >= settings.work_start_time && currentTime <= settings.work_end_time;
}

// 공휴일 근무 시간 불러오기
export const getHolidayWorks = async (): Promise<HolidayWork[]> => {
  try {
    const { data, error } = await supabase
      .from('holiday_works')
      .select('*')
      .order('date', { ascending: false });
    
    if (error) {
      console.error('공휴일 근무 시간 조회 오류:', error);
      return [];
    }
    
    return data || [];
  } catch (error) {
    console.error('공휴일 근무 시간 조회 중 예외 발생:', error);
    return [];
  }
};

// 공휴일 근무 시간 저장
export const saveHolidayWork = async (holidayWork: HolidayWork): Promise<{ success: boolean; error?: any; data?: HolidayWork }> => {
  try {
    const { data, error } = await supabase
      .from('holiday_works')
      .insert(holidayWork)
      .select();
    
    if (error) {
      return { success: false, error };
    }
    
    return { success: true, data: data[0] };
  } catch (error) {
    return { success: false, error };
  }
};

// 공휴일 근무 시간 삭제
export const deleteHolidayWork = async (id: string): Promise<{ success: boolean; error?: any }> => {
  try {
    const { error } = await supabase
      .from('holiday_works')
      .delete()
      .eq('id', id);
    
    if (error) {
      return { success: false, error };
    }
    
    return { success: true };
  } catch (error) {
    return { success: false, error };
  }
};

// 사용자별 공휴일 근무 시간 계산
export const calculateUserHolidayWorkMinutes = async (userId: string): Promise<number> => {
  try {
    // 공휴일 데이터 불러오기
    const holidayWorks = await getHolidayWorks();
    
    if (holidayWorks.length === 0) {
      return 0;
    }
    
    // 사용자 출근 기록 불러오기 (이번 달)
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    
    const { data: records, error } = await supabase
      .from('attendance_records')
      .select('*')
      .eq('user_id', userId)
      .eq('record_type', 'check_in')
      .gte('timestamp', startOfMonth.toISOString())
      .lte('timestamp', endOfMonth.toISOString());
    
    if (error || !records || records.length === 0) {
      return 0;
    }
    
    // 사용자의 출근 기록이 있는 날짜 추출
    const userCheckInDates = records.map(record => {
      const date = new Date(record.timestamp);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    });
    
    // 공휴일 중 사용자가 출근한 날짜에 대한 근무 시간 합산
    let totalHolidayWorkMinutes = 0;
    
    holidayWorks.forEach(holiday => {
      if (userCheckInDates.includes(holiday.date)) {
        totalHolidayWorkMinutes += holiday.work_minutes;
      }
    });
    
    return totalHolidayWorkMinutes;
  } catch (error) {
    console.error('공휴일 근무 시간 계산 오류:', error);
    return 0;
  }
};