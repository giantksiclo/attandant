import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export const Register = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showResendButton, setShowResendButton] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // 기본 유효성 검사
    if (!name || !email || !password) {
      setError('이름, 이메일, 비밀번호를 모두 입력해주세요.');
      return;
    }
    
    if (name.length < 2) {
      setError('이름은 최소 2자 이상 입력해주세요.');
      return;
    }
    
    if (password !== confirmPassword) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }
    
    if (password.length < 6) {
      setError('비밀번호는 최소 6자 이상이어야 합니다.');
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      
      // Supabase 회원가입 API 호출
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin + '/login', // 이메일 확인 후 리다이렉트 URL
          data: {
            name: name, // 사용자가 입력한 이름 사용
            department: '미지정',
            role: 'staff' // admin에서 staff로 변경
          }
        }
      });
      
      if (error) {
        throw error;
      }
      
      if (data?.user) {
        // 이메일 확인 메시지와 함께 성공 메시지 표시
        setSuccessMessage(
          '회원가입이 완료되었습니다. 입력하신 이메일로 인증 링크가 발송되었습니다. ' +
          '이메일을 확인하고 인증 링크를 클릭해주세요.'
        );
        setShowResendButton(true);
        
        // 이메일 인증이 필요 없는 경우 바로 로그인 처리 (현재는 주석 처리)
        // if (!data.user.identities || data.user.identities.length === 0) {
        //   setTimeout(() => {
        //     navigate('/login');
        //   }, 3000);
        // }
      } else {
        setError('회원가입에 실패했습니다. 다시 시도해주세요.');
      }
    } catch (err: any) {
      console.error('회원가입 오류:', err);
      
      if (err.message) {
        if (err.message.includes('already registered')) {
          setError('이미 가입된 이메일입니다. 로그인을 시도해보세요.');
        } else {
          setError(`회원가입 오류: ${err.message}`);
        }
      } else {
        setError('회원가입 중 오류가 발생했습니다.');
      }
    } finally {
      setLoading(false);
    }
  };

  // 인증 이메일 재발송 함수
  const handleResendEmail = async () => {
    if (!email) {
      setError('이메일을 입력해주세요.');
      return;
    }
    
    try {
      setResendLoading(true);
      setError(null);
      
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: {
          emailRedirectTo: window.location.origin + '/login',
        }
      });
      
      if (error) {
        throw error;
      }
      
      setSuccessMessage('인증 이메일이 재발송되었습니다. 이메일을 확인해주세요.');
    } catch (err: any) {
      console.error('이메일 재발송 오류:', err);
      setError(err.message || '이메일 재발송 중 오류가 발생했습니다.');
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">회원가입</h2>
          <p className="text-gray-600">샤인치과 출결관리 시스템에 가입하세요</p>
        </div>
        
        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-md mb-4 text-sm">
            {error}
          </div>
        )}
        
        {successMessage && (
          <div className="bg-green-50 text-green-600 p-4 rounded-md mb-4 text-sm">
            <p className="font-medium mb-2">회원가입 성공</p>
            <p>{successMessage}</p>
            
            {showResendButton && (
              <button
                onClick={handleResendEmail}
                disabled={resendLoading}
                className="mt-3 px-4 py-2 bg-green-100 text-green-800 rounded-md text-sm hover:bg-green-200 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50"
              >
                {resendLoading ? '발송 중...' : '인증 이메일 재발송'}
              </button>
            )}
            
            <p className="mt-3">
              <Link to="/login" className="text-green-700 font-medium hover:underline">
                로그인 페이지로 이동
              </Link>
            </p>
          </div>
        )}
        
        {!successMessage && (
          <form onSubmit={handleRegister} className="bg-white p-8 shadow-md rounded-lg">
            <div className="mb-4">
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                이름
              </label>
              <input
                id="name"
                type="text"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={loading}
                required
                minLength={2}
              />
              <p className="mt-1 text-xs text-gray-500">
                실명을 입력해주세요. 최소 2자 이상이어야 합니다.
              </p>
            </div>
            
            <div className="mb-4">
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                이메일
              </label>
              <input
                id="email"
                type="email"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                required
              />
              <p className="mt-1 text-xs text-gray-500">
                가입 후 이메일 인증이 필요합니다. 사용 중인 이메일을 입력해주세요.
              </p>
            </div>
            
            <div className="mb-4">
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                비밀번호
              </label>
              <input
                id="password"
                type="password"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                required
                minLength={6}
              />
              <p className="mt-1 text-xs text-gray-500">
                6자 이상의 비밀번호를 입력해주세요.
              </p>
            </div>
            
            <div className="mb-6">
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                비밀번호 확인
              </label>
              <input
                id="confirmPassword"
                type="password"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading}
                required
              />
            </div>
            
            <button
              type="submit"
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
              disabled={loading}
            >
              {loading ? '처리 중...' : '회원가입'}
            </button>
            
            <div className="mt-4 text-center text-sm text-gray-600">
              이미 계정이 있으신가요?{' '}
              <Link to="/login" className="text-blue-600 hover:underline">
                로그인
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}; 