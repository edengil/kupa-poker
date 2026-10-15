-- ============================================================================
-- תזכורות בוט על שעון — pg_cron + pg_net בתוך Supabase (הוכן 2026-10-16).
-- מריץ את /api/wa-reminders כל 2 דקות, כך שתזכורות ממתינים/ביט־שקט יוצאות
-- גם כשהקבוצה שקטה (עד היום הן רצו רק כתופעת לוואי של הודעות נכנסות).
--
-- איך מריצים: Supabase → SQL Editor → מדביקים את הקובץ → מחליפים את
-- <CRON_SECRET> בערך של CRON_SECRET מהגדרות Vercel → Run.
-- דרישות מקדימות: הרחבות pg_cron ו־pg_net פעילות (Database → Extensions).
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'wa-reminders-every-2-min',
  '*/2 * * * *',
  $$
  select net.http_get(
    url := 'https://kupa-poker.vercel.app/api/wa-reminders',
    headers := '{"Authorization": "Bearer <CRON_SECRET>"}'::jsonb
  );
  $$
);

-- בדיקה: select * from cron.job where jobname = 'wa-reminders-every-2-min';
-- הסרה:  select cron.unschedule('wa-reminders-every-2-min');
