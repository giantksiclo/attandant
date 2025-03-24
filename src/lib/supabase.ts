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
  reason?: string | null; // 시간외 근무 사유
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
  extra_overtime_minutes?: number; // 추가 시간외 근무시간 필드 추가
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
export async function saveAttendance(
  userId: string, 
  recordType: 'check_in' | 'check_out' | 'overtime_end', 
  location?: string,
  reason?: string, // 시간외 근무 사유 파라미터 추가
  customTimestamp?: string // 커스텀 타임스탬프 파라미터 추가
) {
  try {
    const { data, error } = await supabase
      .from('attendance_records')
      .insert({
        user_id: userId,
        record_type: recordType,
        timestamp: customTimestamp || new Date().toISOString(), // 커스텀 타임스탬프 사용
        location,
        reason // 사유 필드 추가
      });
    
    if (error) throw error;
    
    return { success: true, data };
  } catch (error) {
    console.error('출결 기록 오류:', error);
    return { success: false, error };
  }
}

// 오늘의 출결 기록 가져오기
export async function getTodayAttendance(userId: string, specificDate?: Date) {
  // 특정 날짜가 지정되었으면 해당 날짜 사용, 아니면 오늘 날짜 사용
  const targetDate = specificDate || new Date();
  
  // 해당 날짜의 시작(00:00:00) 구하기
  const startOfDay = new Date(targetDate);
  startOfDay.setHours(0, 0, 0, 0);
  
  // 해당 날짜의 끝(23:59:59) 구하기
  const endOfDay = new Date(targetDate);
  endOfDay.setHours(23, 59, 59, 999);
  
  console.log(`${targetDate.toLocaleDateString()} 출결 기록 조회 시작`);
  
  const { data, error } = await supabase
    .from('attendance_records')
    .select('*')
    .eq('user_id', userId)
    .gte('timestamp', startOfDay.toISOString())
    .lte('timestamp', endOfDay.toISOString())
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

// 공휴일 추가 시간외 근무시간 업데이트
export const updateHolidayWorkExtraOvertime = async (
  date: string,
  userId: string,
  extraOvertimeMinutes: number
): Promise<{ success: boolean; error?: any; data?: HolidayWork }> => {
  try {
    // 해당 날짜의 공휴일 근무 기록 조회
    const { data: existingData, error: queryError } = await supabase
      .from('holiday_works')
      .select('*')
      .eq('date', date)
      .single();
    
    if (queryError && queryError.code !== 'PGRST116') { // PGRST116: 결과가 없는 경우
      return { success: false, error: queryError };
    }
    
    if (!existingData) {
      // 해당 날짜의 공휴일 근무 기록이 없는 경우 새로 생성
      const newHolidayWork: HolidayWork = {
        date: date,
        work_minutes: 0, // 근무 시간은 0으로 설정
        description: '추가 시간외 근무', // 기본 설명
        created_by: userId,
        created_at: new Date().toISOString(),
        extra_overtime_minutes: extraOvertimeMinutes
      };
      
      const { data: insertData, error: insertError } = await supabase
        .from('holiday_works')
        .insert(newHolidayWork)
        .select();
      
      if (insertError) {
        return { success: false, error: insertError };
      }
      
      return { success: true, data: insertData[0] };
    } else {
      // 기존 공휴일 근무 기록이 있는 경우 업데이트
      const { data: updateData, error: updateError } = await supabase
        .from('holiday_works')
        .update({ extra_overtime_minutes: extraOvertimeMinutes })
        .eq('id', existingData.id)
        .select();
      
      if (updateError) {
        return { success: false, error: updateError };
      }
      
      return { success: true, data: updateData[0] };
    }
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
        
        // 추가 시간외 근무시간이 있으면 합산
        if (holiday.extra_overtime_minutes) {
          totalHolidayWorkMinutes += holiday.extra_overtime_minutes;
        }
      }
    });
    
    return totalHolidayWorkMinutes;
  } catch (error) {
    console.error('공휴일 근무 시간 계산 오류:', error);
    return 0;
  }
};

// 모든 사용자의 프로필 정보 가져오기
export async function getAllProfiles() {
  try {
    const { data, error } = await supabase
      .from(PROFILES_TABLE)
      .select('*')
      .order('name', { ascending: true });
    
    if (error) {
      console.error('모든 프로필 조회 오류:', error);
      return [];
    }
    
    return data as Profile[];
  } catch (error) {
    console.error('모든 프로필 조회 중 예외 발생:', error);
    return [];
  }
}

// 오늘의 시간외 근무 기록(사유 포함) 조회 함수
export async function getTodayOvertimeRecords(specificDate?: Date) {
  try {
    // 특정 날짜가 지정되었으면 해당 날짜 사용, 아니면 오늘 날짜 사용
    const targetDate = specificDate || new Date();
    
    // 해당 날짜의 시작(00:00:00) 구하기
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    
    // 해당 날짜의 끝(23:59:59) 구하기
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);
    
    console.log('시간외 근무 조회 날짜 범위:', {
      start: startOfDay.toISOString(),
      end: endOfDay.toISOString()
    });
    
    // 1. 시간외 근무 종료 기록 가져오기 - JOIN 없이 기본 쿼리만 사용
    const { data: overtimeRecords, error: overtimeError } = await supabase
      .from('attendance_records')
      .select('*')
      .eq('record_type', 'overtime_end')
      .gte('timestamp', startOfDay.toISOString())
      .lte('timestamp', endOfDay.toISOString())
      .order('timestamp', { ascending: false });
    
    if (overtimeError) {
      console.error('시간외 근무 기록 조회 오류:', overtimeError);
      return [];
    }
    
    console.log('시간외 근무 종료 기록 조회 결과:', overtimeRecords);
    
    // 2. 사용자 정보 가져오기 (필요한 경우)
    if (overtimeRecords && overtimeRecords.length > 0) {
      // 사용자 ID 목록 추출
      const userIds = [...new Set(overtimeRecords.map(r => r.user_id))];
      console.log('시간외 근무를 등록한 사용자 ID 목록:', userIds);
      
      // 사용자 정보 조회
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles_new')  // profiles_new 테이블 사용
        .select('id, name, department')
        .in('id', userIds);
      
      if (profilesError) {
        console.error('사용자 정보 조회 오류:', profilesError);
        // 프로필 조회 실패해도 기록은 반환
        return overtimeRecords;
      }
      
      console.log('사용자 정보 조회 결과:', profiles);
      
      // 사용자 ID로 조회하기 쉽게 맵으로 변환
      const profilesMap = (profiles || []).reduce((acc, profile) => {
        acc[profile.id] = profile;
        return acc;
      }, {} as Record<string, any>);
      
      // 3. 각 사용자별 당일 모든 출결 기록 가져오기 (시간외 근무 계산에 필요)
      const { data: allRecords, error: allRecordsError } = await supabase
        .from('attendance_records')
        .select('*')
        .in('user_id', userIds)
        .gte('timestamp', startOfDay.toISOString())
        .lte('timestamp', endOfDay.toISOString())
        .order('timestamp', { ascending: true });
      
      if (allRecordsError) {
        console.error('사용자별 출결 기록 조회 오류:', allRecordsError);
      } else {
        console.log('사용자별 출결 기록 조회 결과:', allRecords);
      }
      
      // 각 사용자별로 당일 출결 기록 그룹화
      const recordsByUser = (allRecords || []).reduce((acc, record) => {
        if (!acc[record.user_id]) {
          acc[record.user_id] = [];
        }
        acc[record.user_id].push(record);
        return acc;
      }, {} as Record<string, any[]>);
      
      // 시간외 근무 기록에 사용자 정보와 당일 기록 추가
      const result = overtimeRecords.map(record => ({
        ...record,
        profiles: profilesMap[record.user_id] || { 
          name: '사용자 정보 없음', 
          department: '부서 정보 없음' 
        },
        all_day_records: recordsByUser[record.user_id] || []
      }));
      
      console.log('최종 결과:', result);
      return result;
    }
    
    return overtimeRecords || [];
  } catch (error) {
    console.error('시간외 근무 기록 조회 중 예외 발생:', error);
    return [];
  }
}

// 출결 기록 수정 함수
export async function updateAttendanceRecord(
  recordId: number,
  data: {
    reason?: string;
    timestamp?: string;
  }
) {
  try {
    const { data: updatedRecord, error } = await supabase
      .from('attendance_records')
      .update({
        reason: data.reason,
        timestamp: data.timestamp
      })
      .eq('id', recordId)
      .select('*')
      .single();
    
    if (error) throw error;
    
    return { success: true, data: updatedRecord };
  } catch (error) {
    console.error('출결 기록 수정 오류:', error);
    return { success: false, error };
  }
}

// 출결 기록 삭제 함수
export async function deleteAttendanceRecord(recordId: number) {
  try {
    const { error } = await supabase
      .from('attendance_records')
      .delete()
      .eq('id', recordId);
    
    if (error) throw error;
    
    return { success: true };
  } catch (error) {
    console.error('출결 기록 삭제 오류:', error);
    return { success: false, error };
  }
}

// 월별 통계 데이터 타입 정의
export type MonthlyWorkStats = {
  id?: string;
  user_id: string;
  year: number;
  month: number;
  name: string;
  total_work_minutes: number;
  overtime_minutes: number;
  holiday_work_minutes: number;
  holiday_exceeded_minutes: number;
  late_minutes: number;
  created_at?: string;
  updated_at?: string;
};

// 월별 통계 저장/업데이트 함수
export const saveMonthlyStats = async (
  stats: MonthlyWorkStats[]
) => {
  try {
    console.log('월별 통계 저장 시작:', stats.length, '개 항목');
    
    // upsert 사용 - 이미 있으면 업데이트, 없으면 새로 생성
    const { data, error } = await supabase
      .from('monthly_work_stats')
      .upsert(
        stats.map(stat => ({
          ...stat,
          updated_at: new Date().toISOString()
        })),
        { onConflict: 'user_id,year,month' }
      );

    if (error) {
      console.error('월별 통계 저장 오류:', error);
      throw error;
    }
    
    console.log('월별 통계 저장 성공:', data);
    return { success: true, data };
  } catch (error) {
    console.error('월별 통계 저장 중 예외 발생:', error);
    return { success: false, error };
  }
};

// 월별 통계 조회 함수
export const getMonthlyStats = async (year: number, month: number) => {
  try {
    console.log(`${year}년 ${month}월 통계 조회 시작`);
    
    const { data, error } = await supabase
      .from('monthly_work_stats')
      .select('*')
      .eq('year', year)
      .eq('month', month);

    if (error) {
      console.error('월별 통계 조회 오류:', error);
      throw error;
    }
    
    console.log(`${year}년 ${month}월 통계 조회 결과:`, data?.length || 0, '개 항목');
    return data || [];
  } catch (error) {
    console.error('월별 통계 조회 중 예외 발생:', error);
    return [];
  }
};

// 특정 직원의 월별 통계 조회 함수
export const getEmployeeMonthlyStats = async (userId: string, year: number, month: number) => {
  try {
    console.log(`${userId} 사용자의 ${year}년 ${month}월 통계 조회 시작`);
    
    const { data, error } = await supabase
      .from('monthly_work_stats')
      .select('*')
      .eq('user_id', userId)
      .eq('year', year)
      .eq('month', month)
      .single();

    if (error) {
      console.error('직원 월별 통계 조회 오류:', error);
      return null;
    }
    
    console.log(`${userId} 사용자의 ${year}년 ${month}월 통계 조회 결과:`, data);
    return data as MonthlyWorkStats;
  } catch (error) {
    console.error('직원 월별 통계 조회 중 예외 발생:', error);
    return null;
  }
};