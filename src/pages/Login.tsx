import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate, Link } from 'react-router-dom';

export const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendingEmail, setResendingEmail] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

  // 이미 로그인 되어 있는지 확인
  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          navigate('/dashboard');
        }
      } catch (error) {
        console.error('세션 확인 오류:', error);
      }
    };

    checkSession();
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password) {
      setError('이메일과 비밀번호를 입력해주세요.');
      return;
    }
    
    try {
      setError(null);
      setLoading(true);
      
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password
      });
      
      if (error) throw error;
      
      // 로그인 성공, 메인 페이지로 이동
      navigate('/dashboard');
    } catch (error: any) {
      console.error('로그인 오류:', error);
      
      // 에러 메시지 처리
      if (error.message) {
        // 이메일 미인증 에러 확인
        if (error.message.includes('Email not confirmed') || 
            error.message.includes('not confirmed') || 
            error.message.includes('Invalid login credentials')) {
          setError('이메일 인증이 완료되지 않았거나 로그인 정보가 올바르지 않습니다. 이메일을 확인하여 인증을 완료해주세요.');
        } else {
          setError(error.message);
        }
      } else {
        setError('로그인 중 오류가 발생했습니다.');
      }
    } finally {
      setLoading(false);
    }
  };

  // 인증 이메일 재발송 함수
  const handleResendConfirmation = async () => {
    if (!email) {
      setError('이메일을 입력해주세요.');
      return;
    }
    
    try {
      setResendingEmail(true);
      setError(null);
      setResendSuccess(false);
      
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: {
          emailRedirectTo: window.location.origin + '/login'
        }
      });
      
      if (error) throw error;
      
      setResendSuccess(true);
    } catch (error: any) {
      console.error('이메일 재발송 오류:', error);
      setError(`이메일 재발송 오류: ${error.message || '알 수 없는 오류가 발생했습니다.'}`);
    } finally {
      setResendingEmail(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col fade-in">
      {/* 헤더 */}
      <div className="app-header bg-white shadow-sm px-4 py-5 text-center">
        <h1 className="text-xl font-bold text-gray-900">샤인치과 출결관리</h1>
      </div>
      
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-xl shadow p-6">
          <div className="text-center mb-8">
            <img 
              src="/icons/icon-192x192.png" 
              alt="로고" 
              className="w-20 h-20 mx-auto mb-4"
              onError={(e) => {
                // 이미지가 없을 경우 대체 텍스트 표시
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
            <h2 className="text-2xl font-bold text-gray-800">로그인</h2>
            <p className="text-gray-600 mt-2">
              출퇴근 관리를 시작하려면 로그인하세요
            </p>
          </div>
          
          {error && (
            <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-6 text-sm border border-red-100">
              <p className="font-medium">로그인 오류</p>
              <p>{error}</p>
              
              {/* 이메일 인증 관련 오류 메시지에 재발송 버튼 추가 */}
              {(error.includes('이메일 인증이 완료되지 않았') || error.includes('로그인 정보가 올바르지 않습니다')) && (
                <button
                  onClick={handleResendConfirmation}
                  disabled={resendingEmail}
                  className="mt-3 px-3 py-1 bg-red-100 text-red-800 rounded-md text-sm hover:bg-red-200 focus:outline-none disabled:opacity-50"
                >
                  {resendingEmail ? '발송 중...' : '인증 이메일 재발송'}
                </button>
              )}
            </div>
          )}
          
          {resendSuccess && (
            <div className="bg-green-50 text-green-600 p-4 rounded-lg mb-6 text-sm border border-green-100">
              <p className="font-medium">인증 이메일 발송 완료</p>
              <p>
                입력하신 이메일로 인증 링크가 발송되었습니다. 이메일을 확인하여 인증을 완료한 후 로그인해주세요.
              </p>
            </div>
          )}
          
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                이메일
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                disabled={loading}
                required
                autoComplete="email"
                inputMode="email"
              />
            </div>
            
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                비밀번호
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                disabled={loading}
                required
                autoComplete="current-password"
              />
            </div>
            
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 text-white p-3 rounded-lg text-lg font-medium 
              focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 
              disabled:opacity-50 transition-transform active:scale-98"
            >
              {loading ? '로그인 중...' : '로그인'}
            </button>
            
            <div className="mt-4 text-center text-sm text-gray-600">
              계정이 없으신가요?{' '}
              <Link to="/register" className="text-indigo-600 hover:underline font-medium">
                회원가입
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}; 