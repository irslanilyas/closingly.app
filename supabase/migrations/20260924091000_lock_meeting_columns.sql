-- Meeting columns a user may write.
--
-- APPLY ONLY AFTER the code that moves the meeting agent's writes to the
-- service client is deployed. The previous app version set recall_bot_id and
-- status from the user's own session; against these grants it would fail to
-- schedule a bot.
--
-- Why: the update policy scopes a user to their own meetings but not to their
-- columns. recall_bot_id is global across every customer's bots in the one
-- Recall account, so a user who wrote another customer's bot id onto their
-- own meeting would have the worker fetch that customer's transcript into it.
-- Status, the bot id, the deal link and the classification are the server's
-- to set. What a user session legitimately writes:
--   - calendar sync upsert: the Google-owned fields (and user_id and
--     google_event_id, which an upsert's conflict update also sets);
--   - a pasted transcript import: those plus the transcript, its fetch time,
--     an initial status and agent_enabled = false.
revoke insert, update on public.meetings from anon, authenticated;

grant insert (
  user_id, google_event_id, title, starts_at, ends_at, attendees, meet_link,
  platform, event_type, is_call, not_call_reason,
  transcript, transcript_fetched_at, status, agent_enabled
) on public.meetings to authenticated;

grant update (
  user_id, google_event_id, title, starts_at, ends_at, attendees, meet_link,
  platform, event_type, is_call, not_call_reason
) on public.meetings to authenticated;
