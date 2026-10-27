# 启用云同步前的权限隔离验证

当前 V1 没有真实登录和同步。下面是可重复步骤，尚未在用户数据库执行。只在自己新建的测试项目进行；不要复制真实学习报告作为测试数据。

1. 在 SQL Editor 运行 `schema.sql`，确认 `ielts_snapshots` 已启用 RLS，并运行 Supabase Security Advisor，处理相关发现。
2. 在 Auth 创建并验证两个测试账户 A、B，另保留一个无登录客户端。用前端 publishable key，分别以 A、B 登录各自的 Supabase JS 客户端；不要用 service role 进行权限测试。
3. 用 `createSyncAdapter(clientA).push(emptyState())` 上传 A 的空快照，应返回 revision 1。B 同样上传自己的空快照。A、B 各调用 pull，只应获得自己的快照。
4. 直接用 `clientB.from('ielts_snapshots').select('*').eq('user_id', aId)`，结果须为空。用 B 的客户端 UPDATE / DELETE A 的 user_id 并 `.select()`，须返回空数组且 A 的原快照未变化。
5. B 使用 INSERT，明确填 A 的 user_id，须失败。B 更新自己的行，把 user_id 改为 A 或其他 UUID，须失败（WITH CHECK 或约束拒绝）。验证 A 的记录保持不变。
6. 无登录客户端 SELECT / INSERT / UPDATE / DELETE 均不得访问表；启用匿名 Auth 时，匿名登录账户也不得读写。不能把 anon publishable key 与匿名 Auth 登录账户混为一谈。
7. A 以 revision 1 成功更新得到 2，第二个模拟设备继续以 revision 1 更新，应提示冲突，原快照保持 revision 2。B 仍然读不到 A 的新快照。
8. 退出后调用适配器，应在数据库访问前拒绝；切换账号时，确认 UI 不会自动将 A 的本机记录上传到 B。

每一步记录实际结果和时间，全部通过后再开放同步按钮。SQL Editor 通常拥有管理权限，直接在 SQL Editor SELECT 看见所有行不代表 RLS 失效，也不能作为前端权限通过的证明。
