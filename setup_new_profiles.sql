-- 새로운 프로필 테이블 생성
CREATE TABLE "profiles_new" (
  "id" UUID NOT NULL PRIMARY KEY,
  "name" TEXT,
  "department" TEXT,
  "role" TEXT DEFAULT 'staff' CHECK (role IN ('admin', 'staff')),
  "photo_url" TEXT,
  "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP WITH TIME ZONE,
  CONSTRAINT "profiles_new_id_fkey" FOREIGN KEY ("id") REFERENCES auth.users(id) ON DELETE CASCADE
);

-- RLS(Row Level Security) 설정
ALTER TABLE "profiles_new" ENABLE ROW LEVEL SECURITY;

-- 테이블 소유자 설정
ALTER TABLE "profiles_new" OWNER TO "postgres";

-- 사용자가 자신의 프로필만 읽을 수 있도록 정책 설정
CREATE POLICY "Users can view their own profile"
ON "profiles_new"
FOR SELECT
USING (auth.uid() = id);

-- 사용자가 자신의 프로필만 업데이트할 수 있도록 정책 설정
CREATE POLICY "Users can update their own profile"
ON "profiles_new"
FOR UPDATE
USING (auth.uid() = id);

-- 사용자가 자신의 프로필을 생성할 수 있도록 정책 설정
CREATE POLICY "Users can insert their own profile"
ON "profiles_new"
FOR INSERT
WITH CHECK (auth.uid() = id);

-- 인증된 사용자가 모든 프로필을 볼 수 있는 정책 (관리자용, 이번에는 활성화)
CREATE POLICY "Authenticated users can view all profiles"
ON "profiles_new"
FOR SELECT
TO authenticated
USING (true); 