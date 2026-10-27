// Optional integration seam. Not imported by app.js: V1 performs NO cloud requests.
// Inject an authenticated @supabase/supabase-js client only after implementing login,
// explicit sync consent and conflict UI. Tokens stay with that client, never in backups.
import { backup, restore } from "./core.js";
export function createSyncAdapter(client) {
  async function owner() {
    const { data, error } = await client.auth.getUser();
    if (error || !data?.user?.id || data.user.is_anonymous)
      throw new Error("需要非匿名 Supabase 登录");
    return data.user.id;
  }
  return {
    async pull() {
      const userId = await owner();
      const { data, error } = await client
        .from("ielts_snapshots")
        .select("payload,revision")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return data
        ? { state: restore(data.payload), revision: data.revision }
        : null;
    },
    async push(state, expectedRevision = null) {
      const userId = await owner(),
        payload = backup(state);
      // Validate before sending; no service role or account ID can be supplied by the caller.
      restore(payload);
      let query;
      if (expectedRevision === null)
        query = client
          .from("ielts_snapshots")
          .insert({ user_id: userId, payload, revision: 1 })
          .select("revision");
      else {
        if (!Number.isInteger(expectedRevision) || expectedRevision < 1)
          throw new Error("无效 revision");
        query = client
          .from("ielts_snapshots")
          .update({ payload, revision: expectedRevision + 1 })
          .eq("user_id", userId)
          .eq("revision", expectedRevision)
          .select("revision");
      }
      const { data, error } = await query;
      if (error) throw error;
      if (!data?.length)
        throw new Error("云端已变化，请先拉取、比较并手动解决冲突");
      return data[0].revision;
    },
  };
}
