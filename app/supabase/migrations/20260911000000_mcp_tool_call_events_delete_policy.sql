drop policy if exists "mcp_tool_call_events_delete_own" on public.mcp_tool_call_events;

create policy "mcp_tool_call_events_delete_own"
on public.mcp_tool_call_events
for delete
using (auth.uid() = user_id);
