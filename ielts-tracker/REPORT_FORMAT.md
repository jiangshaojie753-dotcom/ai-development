# ChatGPT 学习报告 JSON v1

可把此规范交给 ChatGPT：完成教学 / 纠错后只返回 JSON，不编造任何未知数据。软件只负责记录，不替代教学。

顶层字段只允许：

| 字段 | 约束 |
| --- | --- |
| `schemaVersion` | 必须为数字 `1` |
| `reportId` | 可选、非空、稳定的唯一报告 ID；同一报告反复导出应保持一致 |
| `date` | 必填，真实日期 `YYYY-MM-DD` |
| `tasks` | 可选任务数组 |
| `sessions` | 可选四科训练数组 |
| `errors` | 可选纠错出现事件数组 |

三个数组至少一条记录。子记录的 `id` 可省略，导入时生成；若提供，请保持唯一且稳定。子记录的日期可以省略，将采用顶层日期。未知字段会报错，避免悄悄丢失信息。机器格式见 `report.schema.json`；跨字段的题数大小关系等由 `core.js` 进一步校验。

下例仅展示结构，所有字段均是虚构技术占位；请替换日期、任务和来源，不要将其作为真实学习记录：

```json
{
  "schemaVersion": 1,
  "reportId": "replace-with-stable-unique-id",
  "date": "2000-01-01",
  "tasks": [
    {
      "skill": "reading",
      "title": "技术占位任务，请替换",
      "plannedMinutes": null,
      "actualMinutes": null,
      "completed": false,
      "notes": ""
    }
  ],
  "sessions": [
    {
      "skill": "speaking",
      "source": "技术占位来源，请替换",
      "questionType": "",
      "difficulty": "",
      "timed": null,
      "firstAttempt": null,
      "scoreType": "practice",
      "correct": null,
      "total": null,
      "minutes": null,
      "questions": null,
      "topic": "",
      "feedback": "",
      "band": null
    }
  ],
  "errors": []
}
```

## 任务

- `skill` 必填：`listening` / `reading` / `speaking` / `writing`。
- `title` 必填非空；`notes` 可选文字。
- `plannedMinutes` / `actualMinutes`：数字 0–1440，或 null / 缺省。0 表示确认投入零分钟，不能用来代表未知。
- `completed`：布尔值，缺省 false；完成与否不推断实际时间。

## 训练

- `skill` 必填；`source`、`questionType`、`difficulty` 是文字，未知留空。
- `timed`、`firstAttempt`：true / false / null，缺省 null。重复作答不参加正确率比较。
- `scoreType`：`practice`（默认）、`mock`（正式计时模考，timed 必须 true）、`ai_estimate`（AI 参考估计）。来源 / 题型缺失仍可保存，但不参加趋势比较。
- `correct`、`total`：仅听力 / 阅读；整数 0–1000，必须同时已知或同时为 null。total > 0，correct ≤ total。
- `minutes`：数字 0–1440 或 null。不得根据计划时间、题数、对话轮次自动填入。
- `band`：仅在明确记录模考分或 AI 估计时填写 0–9；练习类型必须为空。软件不换算 Band。
- 口语：`questions`（0–1000 整数或 null）、`topic`（话题）、`feedback`（表达错误反馈）。不接受估算语速、发音 / 流利度指标等额外字段。
- 写作：`writingTask` 为 `task1` / `task2` / null；`dimensions` 为 null 或 `{taskResponse, coherence, lexical, grammar}`，每个维度 0–9 或 null。维度有分数时必须明确选择 mock / ai_estimate，不能混入练习成绩。`improvements` 为改进建议文字。
- `feedback` / `improvements` 可用于各科。空白文字标准化为空字符串，未知数字为 null。

## 纠错出现事件

每次出现用单独对象：`skill`、`original`、`corrected`、`category` 必填；`date` 默认顶层日期，`explanation` 可选。

`category`：`grammar`（语法）、`collocation`（搭配）、`natural`（更自然）、`other`。

相同原句 + 修改 + 分类，去掉首尾空格并转小写后聚合。口语 / 写作可共用条目。同日期、同科目、同原改句和解释视为同一出现，跨报告不重复累计。不同日期或科目的新出现会累计并恢复待复习。此规则保守合并，若同一天确有两次相同错误且需要区分，请在反馈中明确不同练习背景。

## 旧版兼容

只接受明确的简化结构，无 schemaVersion：

```json
{
  "date": "2000-01-01",
  "listening": {"correct": null, "total": null, "minutes": null},
  "speaking": {"questions": null, "feedback": ""}
}
```

支持四科对象；内部字段与 sessions 相同，但无需 skill / date；也支持 tasks / errors 和 reportId。缺失条件保留 null 或空，不自动推断 timed、firstAttempt、分钟或 Band。未列出的旧版字段将要求手动更正，不声称兼容未知原型。可粘贴 JSON 代码块，不能粘贴夹杂解释的普通对话。

## 确认、更正与备份

先校验并查看完整标准化数据，再确认导入。预览前 / 后可以修改 JSON，修改后需重新校验。已导入的数据可在任务、训练、纠错页面编辑；相同 reportId 内容改变时提示编辑原记录，而非覆盖。完整 JSON 备份包含 `app`、`backupVersion`、`exportedAt`、`data`，需在备份区恢复，不可作为报告导入。
