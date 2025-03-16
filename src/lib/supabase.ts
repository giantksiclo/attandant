import { createClient } from '@supabase/supabase-js';

// 환경 변수에서 Supabase 설정 가져오기
const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY as string;

// Supabase 클라이언트 생성
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true
  }
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
  work_start_time: string; // "09:00"
  work_end_time: string; // "18:00"
  lunch_start_time: string; // "12:00"
  lunch_end_time: string; // "13:00"
  updated_at: string;
};

// 프로필 가져오기 함수
export async function fetchProfile(userId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
    
  if (error) {
    console.error('프로필 조회 오류:', error);
    return null;
  }
  
  return data as Profile;
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