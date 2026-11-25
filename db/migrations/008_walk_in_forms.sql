-- Walk-in forms: a QR code at reception. A visitor scans it, fills in the form on their phone, becomes a lead
-- (or is matched to their record) and joins the office check-in queue, so reception sees them waiting.
alter table lead_forms add column kind text not null default 'event' check (kind in ('event','walk_in'));
