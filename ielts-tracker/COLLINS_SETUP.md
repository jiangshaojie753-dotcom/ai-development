# 柯林斯官方释义接入准备

目前没有 Collins API 授权或后端服务，不能在应用里声称已自动取得柯林斯释义。“在柯林斯查这个词”只打开官方网站。英英释义字段允许保存自己的学习笔记。

## 已确认的可申请范围

2026-10-29 核对官方页面：API 申请表仍可访问，列出了 COBUILD 英式与美式学习词典；API 介绍页公布每月不超过 5,000 次调用的免费档。以上仅说明存在申请渠道，不代表本项目已提交申请、已获批或已取得密钥。

申请表没有单列英汉词典选项，因此中文释义接口是否可授予，需要在 Message 中向官方确认。普通许可的缓存限制与本项目的离线卡片需求也需要单独说明。

接入顺序：先尝试获得符合用途的柯林斯官方授权；官方方案不可获得或不能满足离线卡片需求时，再启用免费替代方案。等待申请回复不视为申请被拒绝。当前免费查询接口不在页面中启用。

## 申请入口与建议填写

本人在 [Collins API 申请表](https://blog.collinsdictionary.com/collins-api-apply-for-a-key/) 填写自己的姓名、邮箱和国家，选择 Non-commercial，并选择 **Collins COBUILD Advanced Learner’s Dictionary — British English**（英式学习词典）。如更偏好美式，可改选 American English。

建议在 Message 中使用以下说明（按自己的实际情况调整；不要在公开 Issue 填个人信息）：

> I am building a personal, non-commercial IELTS vocabulary study tracker hosted on GitHub Pages. I would like to look up individual English words and phrases, display COBUILD definitions with attribution, and let the user select senses for spaced repetition. Could you confirm whether a licence is available that permits saving user-selected definitions in browser localStorage and including them in private JSON/CSV backups? I will not redistribute a dictionary dataset. Please also confirm whether English–Simplified Chinese translations are available under the same licence, the current API documentation, and any applicable usage limits or fees.

普通 API 条款限制把释义缓存到离线或在线存储中以免再次请求 API；当前学习卡需要离线复习和备份，因此要获得适合该用途的明确授权。如果仅允许实时展示，后续接入应保存条目 ID，每次联网查询，在离线时只展示个人笔记。不要自行把官网内容批量复制到公开仓库。

## 获批后的接入

1. 密钥放在可信后端的环境变量或密钥服务中，不能放入 GitHub Pages JavaScript、localStorage、JSON 备份或公开仓库。
2. GitHub Pages 本身不能安全托管私密 API 密钥。需另行部署有访问控制、调用额度和限流的后端代理，再接前端查询按钮。
3. 按获批的文档核实词典 ID、条目结构、来源及版权标注。中文与英英释义需要确认是同一个词义，不能按数组下标强行对应。
4. 按许可决定哪些字段可存储和导出。默认不复制词典全文；无法取得真实释义时明确报错，不以模型生成内容标注为 Collins。
5. 使用获得授权的测试账户做线上集成验证后，通过独立 PR 发布；申请不等于已获授权，获授权也不等于已部署。

资料核对日期：2026-10-29。价格与额度以申请时官方回复为准。

- [Collins API 与申请说明](https://www.collinsdictionary.com/collins-api)
- [Collins API 条款](https://blog.collinsdictionary.com/terms-conditions-collins-api/)
