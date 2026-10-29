// Future server integration only. Never accept or store model provider API keys here.
// Inject a same-origin authenticated backend implementation; its result must still
// pass the editable, per-entry confirmation flow before any learning-data write.
export function createOCRAdapter(recognize = null) {
  return {
    configured: typeof recognize === "function",
    async recognize(file) {
      if (typeof recognize !== "function")
        throw new Error("OCR 识别服务未配置，请使用 ChatGPT 识别后粘贴导入");
      if (
        !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
        file.size > 10 * 1024 * 1024
      )
        throw new Error("图片格式或大小不支持");
      return await recognize(file);
    },
  };
}
