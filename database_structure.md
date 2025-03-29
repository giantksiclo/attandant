# Attandant 프로젝트 데이터베이스 구조

## 테이블 구조

### attendance_records
| column_name       | data_type                |
|-------------------|--------------------------|
| id                | bigint                   |
| user_id           | uuid                     |
| record_type       | text                     |
| timestamp         | timestamp with time zone |
| location          | text                     |
| notes             | text                     |
| reason            | text                     |
| night_off_time    | timestamp with time zone |
| extra_minutes     | integer                  |

### attendance_settings
| column_name       | data_type                |
|-------------------|--------------------------|
| id                | integer                  |
| day_of_week       | integer                  |
| is_working_day    | boolean                  |
| work_start_time   | character varying        |
| work_end_time     | character varying        |
| lunch_start_time  | character varying        |
| lunch_end_time    | character varying        |
| updated_at        | timestamp with time zone |

### holiday_works
| column_name             | data_type                |
|-------------------------|--------------------------|
| id                      | uuid                     |
| date                    | date                     |
| work_minutes            | integer                  |
| description             | text                     |
| created_by              | uuid                     |
| created_at              | timestamp with time zone |
| extra_overtime_minutes  | integer                  |

### leave_requests
| column_name      | data_type                   |
|------------------|----------------------------|
| id               | uuid                       |
| user_id          | uuid                       |
| start_date       | date                       |
| end_date         | date                       |
| leave_type       | character varying          |
| leave_source     | character varying          |
| special_leave_id | uuid                       |
| total_days       | numeric                    |
| reason           | text                       |
| status           | character varying          |
| approval_date    | timestamp without time zone|
| approved_by      | uuid                       |
| created_at       | timestamp with time zone   |
| updated_at       | timestamp with time zone   |

### monthly_work_stats
| column_name              | data_type                |
|--------------------------|--------------------------|
| id                       | uuid                     |
| user_id                  | uuid                     |
| year                     | integer                  |
| month                    | integer                  |
| name                     | text                     |
| total_work_minutes       | integer                  |
| overtime_minutes         | integer                  |
| holiday_work_minutes     | integer                  |
| holiday_exceeded_minutes | integer                  |
| late_minutes             | integer                  |
| created_at               | timestamp with time zone |
| updated_at               | timestamp with time zone |

### profiles_new
| column_name | data_type                |
|-------------|--------------------------|
| id          | uuid                     |
| name        | text                     |
| department  | text                     |
| role        | text                     |
| photo_url   | text                     |
| created_at  | timestamp with time zone |
| updated_at  | timestamp with time zone |

## 관계 및 제약조건

- `attendance_records.user_id` → `auth.users.id` 외래키 참조
- `holiday_works.created_by` → `auth.users.id` 외래키 참조
- `leave_requests.user_id` → `auth.users.id` 외래키 참조
- `leave_requests.approved_by` → `auth.users.id` 외래키 참조 
- `monthly_work_stats.user_id` → `auth.users.id` 외래키 참조
- `profiles_new.id` → `auth.users.id` 외래키 참조 