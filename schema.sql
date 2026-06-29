-- =========================================================================
-- OmniStudy 資料庫 Schema 設計
-- 請將此腳本複製並在 Supabase Dashboard 的 SQL Editor 中執行。
-- =========================================================================

-- 1. 建立使用者表 (為維持免登入共享便利性，採用全域下拉選單切換此表使用者)
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. 建立筆記表
CREATE TABLE IF NOT EXISTS public.notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    subject TEXT NOT NULL,                     -- 學科標籤
    title TEXT NOT NULL,                       -- 標題
    content TEXT NOT NULL,                     -- 內文 (支援 Markdown)
    image_url TEXT,                            -- 圖片網址 (可選)
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. 建立月曆事件表
CREATE TABLE IF NOT EXISTS public.calendar_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    subject TEXT NOT NULL,                     -- 學科標籤
    title TEXT NOT NULL,                       -- 行程名稱
    description TEXT NOT NULL,                 -- 詳細備註 (支援 Markdown)
    image_url TEXT,                            -- 圖片網址 (可選)
    event_date DATE NOT NULL,                  -- 日期
    start_time TIME NOT NULL,                  -- 開始時間
    end_time TIME NOT NULL,                    -- 結束時間
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. 建立待辦事項表
CREATE TABLE IF NOT EXISTS public.todos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    subject TEXT NOT NULL,                     -- 學科標籤
    title TEXT NOT NULL,                       -- 任務名稱
    description TEXT NOT NULL,                 -- 任務詳細說明 (支援 Markdown)
    image_url TEXT,                            -- 參考圖片網址 (可選)
    is_completed BOOLEAN DEFAULT false NOT NULL, -- 是否完成
    due_date DATE,                             -- 截止日期 (可選)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. 建立問題表 (解題模組)
CREATE TABLE IF NOT EXISTS public.questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asker_id UUID REFERENCES public.users(id) ON DELETE SET NULL, -- 提問人
    subject TEXT NOT NULL,                     -- 學科標籤
    title TEXT NOT NULL,                       -- 問題標題
    content TEXT NOT NULL,                     -- 問題描述 (支援 Markdown)
    image_url TEXT,                            -- 題目圖片網址 (可選)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. 建立解答表 (解題模組)
CREATE TABLE IF NOT EXISTS public.solutions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id UUID REFERENCES public.questions(id) ON DELETE CASCADE, -- 對應的問題
    solver_id UUID REFERENCES public.users(id) ON DELETE SET NULL,     -- 解答人
    content TEXT NOT NULL,                     -- 解答內容 (支援 Markdown)
    image_url TEXT,                            -- 解答算式/步驟圖片網址 (可選)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- =========================================================================
-- 預先插入一些測試用使用者資料，確保首頁下拉選單有預設成員
-- =========================================================================
INSERT INTO public.users (name)
VALUES ('3'), ('7'), ('18'), ('34')
ON CONFLICT (name) DO NOTHING;

-- =========================================================================
-- 啟用 Row Level Security (RLS) 並允許全域匿名讀寫 (因為是無區分使用者之共享模式)
-- =========================================================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.todos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solutions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon read/write users" ON public.users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon read/write notes" ON public.notes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon read/write calendar_events" ON public.calendar_events FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon read/write todos" ON public.todos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon read/write questions" ON public.questions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon read/write solutions" ON public.solutions FOR ALL USING (true) WITH CHECK (true);

-- =========================================================================
-- 7. 建立 Supabase Storage 儲存桶與匿名上傳讀取政策
-- =========================================================================

-- 建立公開的 'omnistudy' 儲存桶
INSERT INTO storage.buckets (id, name, public)
VALUES ('omnistudy', 'omnistudy', true)
ON CONFLICT (id) DO NOTHING;

-- 允許任何人（包含匿名）上傳圖片到 'omnistudy' 儲存桶
CREATE POLICY "Allow public upload to omnistudy" 
ON storage.objects 
FOR INSERT 
TO public 
WITH CHECK (bucket_id = 'omnistudy');

-- 允許任何人（包含匿名）讀取 'omnistudy' 儲存桶的公開檔案
CREATE POLICY "Allow public read from omnistudy" 
ON storage.objects 
FOR SELECT 
TO public 
USING (bucket_id = 'omnistudy');

-- =========================================================================
-- 8. 建立出題與答題資料表 (線上學科挑戰)
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.quiz_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    subject TEXT NOT NULL,
    question_text TEXT NOT NULL,
    image_url TEXT,
    option_a TEXT NOT NULL,
    option_b TEXT NOT NULL,
    option_c TEXT,
    option_d TEXT,
    correct_option CHAR(1) NOT NULL CHECK (correct_option IN ('A', 'B', 'C', 'D')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.quiz_answers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quiz_id UUID NOT NULL REFERENCES public.quiz_questions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    selected_option CHAR(1) NOT NULL CHECK (selected_option IN ('A', 'B', 'C', 'D')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_quiz_user_answer UNIQUE (quiz_id, user_id)
);

-- 啟用 RLS
ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_answers ENABLE ROW LEVEL SECURITY;

-- 建立 RLS 政策 (匿名允許全部讀寫)
CREATE POLICY "Allow anon read/write quiz_questions" ON public.quiz_questions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon read/write quiz_answers" ON public.quiz_answers FOR ALL USING (true) WITH CHECK (true);

-- =========================================================================
-- 9. 建立學習筆記留言資料表 (note_comments)
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.note_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    note_id UUID NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 啟用 RLS
ALTER TABLE public.note_comments ENABLE ROW LEVEL SECURITY;

-- 建立 RLS 政策 (匿名允許全部讀寫)
CREATE POLICY "Allow anon read/write note_comments" ON public.note_comments FOR ALL USING (true) WITH CHECK (true);

