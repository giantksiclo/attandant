-- holiday_works 테이블 생성
CREATE TABLE IF NOT EXISTS public.holiday_works (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date DATE NOT NULL,
  work_minutes INTEGER NOT NULL,
  description TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS 정책 설정
ALTER TABLE public.holiday_works ENABLE ROW LEVEL SECURITY;

-- 모든 사용자가 조회할 수 있도록 정책 설정
CREATE POLICY "모든 사용자가 holiday_works를 조회할 수 있음" ON public.holiday_works
  FOR SELECT USING (true);

-- 관리자만 생성, 수정, 삭제할 수 있도록 정책 설정
CREATE POLICY "관리자만 holiday_works를 생성할 수 있음" ON public.holiday_works
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles_new
      WHERE profiles_new.id = auth.uid() AND profiles_new.role = 'admin'
    )
  );

CREATE POLICY "관리자만 holiday_works를 수정할 수 있음" ON public.holiday_works
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.profiles_new
      WHERE profiles_new.id = auth.uid() AND profiles_new.role = 'admin'
    )
  );

CREATE POLICY "관리자만 holiday_works를 삭제할 수 있음" ON public.holiday_works
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.profiles_new
      WHERE profiles_new.id = auth.uid() AND profiles_new.role = 'admin'
    )
  );

-- 인덱스 생성
CREATE INDEX idx_holiday_works_date ON public.holiday_works(date);
CREATE INDEX idx_holiday_works_created_by ON public.holiday_works(created_by); 