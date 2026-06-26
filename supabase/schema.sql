create extension if not exists "pgcrypto";

create table if not exists bot_settings (
  id text primary key default 'main',
  is_enabled boolean not null default true,
  automation_level text not null default 'auto_with_review'
    check (automation_level in ('drafts', 'auto_with_review', 'full_auto')),
  daily_contact_limit integer not null default 1 check (daily_contact_limit between 1 and 10),
  max_youths_per_message integer not null default 2 check (max_youths_per_message between 1 and 10),
  no_response_followup_days integer not null default 4 check (no_response_followup_days between 1 and 60),
  stale_youth_days integer not null default 30 check (stale_youth_days between 1 and 365),
  send_window_start text not null default '09:30',
  send_window_end text not null default '20:30',
  send_interval_minutes integer not null default 30 check (send_interval_minutes between 30 and 240),
  daily_cron_time text not null default '01:00',
  project_name text not null default 'מעקב נערים',
  manager_display_name text not null default 'מנדי',
  followup_question_guide text not null default 'ברית, תפילין, שבת, שיעור תורה, חתונה כיהודי וכל התקדמות חדשה אצל הנערים.',
  owner_whatsapp text not null default '',
  tone text not null default 'חם, חסידי, מכבד, קצר ולא לוחץ',
  quiet_hours_start text not null default '21:30',
  quiet_hours_end text not null default '09:00',
  owner_command_routes jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists bot_policies (
  id text primary key default 'main',
  allowed_topics jsonb not null default '[]'::jsonb,
  forbidden_topics jsonb not null default '[]'::jsonb,
  escalation_triggers jsonb not null default '[]'::jsonb,
  blocked_dates jsonb not null default '[]'::jsonb,
  avoid_shabbat boolean not null default true,
  avoid_jewish_holidays boolean not null default true,
  bot_identity text not null default '',
  allowed_answer_style text not null default '',
  unrelated_holding_reply text not null default '',
  forbidden_holding_reply text not null default '',
  owner_alert_template text not null default '',
  require_review_for_all_replies boolean not null default true,
  notify_owner_on_escalation boolean not null default true,
  send_holding_reply_on_escalation boolean not null default true,
  max_auto_reply_length integer not null default 420
    check (max_auto_reply_length between 80 and 1000),
  updated_at timestamptz not null default now()
);

create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  phone text not null unique,
  country text,
  timezone text not null default 'Asia/Jerusalem',
  language text not null default 'he',
  status text not null default 'active'
    check (status in ('active', 'paused', 'needs_attention')),
  preferred_tone text not null default 'חם, מכבד וקצר',
  response_style text not null default 'רגיל',
  best_contact_time text not null default '12:00',
  allow_auto_send boolean not null default false,
  last_contacted_at timestamptz,
  next_due_at timestamptz not null default now(),
  notes text not null default '',
  warmth_score integer not null default 50 check (warmth_score between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists youths (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references contacts(id) on delete cascade,
  display_name text not null,
  city text not null default '',
  stage text not null default 'new'
    check (stage in ('new', 'warming', 'learning', 'mitzvah', 'needs_followup')),
  milestones jsonb not null default '[]'::jsonb,
  last_update_at timestamptz,
  next_action text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists conversation_messages (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references contacts(id) on delete set null,
  direction text not null check (direction in ('inbound', 'outbound')),
  channel text not null default 'whatsapp'
    check (channel in ('whatsapp', 'dashboard', 'system')),
  body text not null default '',
  media_type text not null default 'text'
    check (media_type in ('text', 'audio', 'image', 'document')),
  media_url text,
  provider_message_id text,
  ai_summary text,
  raw_payload jsonb,
  created_at timestamptz not null default now()
);

create table if not exists review_items (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'outbound_message'
    check (type in ('outbound_message', 'data_update', 'owner_report', 'owner_alert')),
  contact_id uuid references contacts(id) on delete set null,
  contact_name text not null default '',
  youth_id uuid references youths(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'sent')),
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high')),
  draft_message text not null,
  ai_reason text not null default '',
  scheduled_for timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists owner_reports (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists owner_alerts (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references contacts(id) on delete set null,
  contact_name text not null default '',
  phone text not null default '',
  incoming_text text not null default '',
  reason text not null default '',
  urgency text not null default 'normal'
    check (urgency in ('normal', 'high')),
  status text not null default 'open'
    check (status in ('open', 'handled', 'dismissed')),
  suggested_owner_reply text not null default '',
  created_at timestamptz not null default now(),
  handled_at timestamptz
);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor text not null default 'system',
  action text not null,
  entity_type text,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists contacts_next_due_idx on contacts(next_due_at);
create index if not exists contacts_phone_idx on contacts(phone);
create index if not exists youths_contact_idx on youths(contact_id);
create index if not exists messages_contact_created_idx on conversation_messages(contact_id, created_at desc);
create index if not exists review_status_scheduled_idx on review_items(status, scheduled_for);
create index if not exists owner_alerts_status_created_idx on owner_alerts(status, created_at desc);
create index if not exists audit_created_idx on audit_logs(created_at desc);

alter table bot_policies add column if not exists blocked_dates jsonb not null default '[]'::jsonb;
alter table bot_policies add column if not exists avoid_shabbat boolean not null default true;
alter table bot_policies add column if not exists avoid_jewish_holidays boolean not null default true;
alter table contacts add column if not exists preferred_tone text not null default 'חם, מכבד וקצר';
alter table contacts add column if not exists response_style text not null default 'רגיל';
alter table contacts add column if not exists best_contact_time text not null default '12:00';
alter table contacts add column if not exists allow_auto_send boolean not null default false;
alter table review_items add column if not exists contact_name text not null default '';
alter table owner_alerts add column if not exists contact_name text not null default '';

alter table bot_settings alter column daily_contact_limit set default 1;
alter table bot_settings add column if not exists max_youths_per_message integer not null default 2 check (max_youths_per_message between 1 and 10);
alter table bot_settings add column if not exists no_response_followup_days integer not null default 4 check (no_response_followup_days between 1 and 60);
alter table bot_settings add column if not exists stale_youth_days integer not null default 30 check (stale_youth_days between 1 and 365);
alter table bot_settings add column if not exists send_window_start text not null default '09:30';
alter table bot_settings add column if not exists send_window_end text not null default '20:30';
alter table bot_settings add column if not exists send_interval_minutes integer not null default 30 check (send_interval_minutes between 30 and 240);
alter table bot_settings add column if not exists daily_cron_time text not null default '01:00';
alter table bot_settings add column if not exists project_name text not null default 'מעקב נערים';
alter table bot_settings add column if not exists manager_display_name text not null default 'מנדי';
alter table bot_settings add column if not exists followup_question_guide text not null default 'ברית, תפילין, שבת, שיעור תורה, חתונה כיהודי וכל התקדמות חדשה אצל הנערים.';
alter table bot_settings add column if not exists owner_command_routes jsonb not null default '[]'::jsonb;

insert into bot_settings (id)
values ('main')
on conflict (id) do nothing;

insert into bot_policies (
  id,
  allowed_topics,
  forbidden_topics,
  escalation_triggers,
  blocked_dates,
  avoid_shabbat,
  avoid_jewish_holidays,
  bot_identity,
  allowed_answer_style,
  unrelated_holding_reply,
  forbidden_holding_reply,
  owner_alert_template
)
values (
  'main',
  '["עדכוני נערים","ברית","תפילין","שבת","שיעור תורה","קשר עם רב","התקדמות בענייני יהדות","פרטי מעקב עבודה"]'::jsonb,
  '["כספים אישיים","הלוואות","רפואה","ייעוץ משפטי","פוליטיקה","רכילות","עניינים משפחתיים פרטיים","בקשות שאינן קשורות לעבודה"]'::jsonb,
  '["שאלה לא קשורה","בקשה אישית","תלונה","כעס","מידע רגיש","החלטה כספית","ספק בזהות הנער","שאלה על זהות הכותב","שאלה אם זה בוט","שאלה אם זה AI","שאלה אם זה מענה אוטומטי"]'::jsonb,
  '["2026-09-12","2026-09-13","2026-09-21","2026-09-22"]'::jsonb,
  true,
  true,
  'לכתוב בשם מנדי ובסגנון האישי שלו לענייני עבודה ומעקב שליחות בלבד, בלי להזכיר בוט, AI, מערכת או אוטומציה לאנשי קשר.',
  'חם, חסידי, מכבד, קצר, אנושי וטבעי כמו הודעת וואטסאפ אישית. בלי ניסוחים מערכתיים, בלי ''כמערכת'', בלי ''אני בוט'', בלי הבטחות ובלי להיכנס לנושאים פרטיים.',
  'ראיתי, תודה. זה נושא שעדיף שאענה עליו יותר בנחת באופן אישי, אחזור לזה בעזרת השם.',
  'תודה שכתבתם. בנושא הזה עדיף שאענה בצורה מסודרת ואישית, אחזור לזה בעזרת השם.',
  'צריך מענה אישי: {contactName}
סיבה: {reason}
הודעה: {message}'
)
on conflict (id) do nothing;

grant usage on schema public to postgres, anon, authenticated, service_role;

grant all on all tables in schema public to postgres, service_role;
grant all on all sequences in schema public to postgres, service_role;

grant select, insert, update, delete on all tables in schema public to authenticated;

alter default privileges in schema public
  grant all on tables to postgres, service_role;

alter default privileges in schema public
  grant all on sequences to postgres, service_role;
