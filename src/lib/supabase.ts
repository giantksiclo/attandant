import { createClient } from '@supabase/supabase-js';

// 환경 변수에서 Supabase 설정 가져오기
const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY as string;

// 기본 데이터베이스 스키마 정의
const PROFILES_TABLE = 'profiles';

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
  instance_id: number;
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
  work_start_time: string; // "09:00"
  work_end_time: string; // "18:00"
  lunch_start_time: string; // "12:00"
  lunch_end_time: string; // "13:00"
  updated_at: string;
};

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
  
  // 기본 프로필 데이터 설정
  const userEmail = user.email || '';
  const userName = userEmail.split('@')[0] || '사용자';
  const defaultProfileData = {
    id: userId,
    name: userName,
    department: '미지정',
    role: 'admin' as const, // 첫 번째 사용자를 관리자로 기본 설정
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    instance_id: 1 // 기본값 0 대신 1로 설정
  };
  
  console.log('생성할 프로필 데이터:', defaultProfileData);
  
  try {
    // 1. Auth 사용자 메타데이터 업데이트
    const { success: metaSuccess } = await updateUserMetadata({
      name: userName,
      department: '미지정',
      role: 'admin'
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
      updated_at: new Date().toISOString(),
      instance_id: 1 // instance_id 값 설정
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