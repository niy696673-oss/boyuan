# 普通微信用户接入博源 AI 的渠道方案对比

- **证据日期：** 2026-09-03
- **候选方案：** 微信客服 API、微信内 H5、微信小程序、微信公众号、WorkTool/VBot 类非官方自动化
- **项目 / 用例：** 普通微信用户输入公司名或发送 BP PDF，获得与飞书、企业微信一致的快速分析文本，并在后台启动工作台深度分析
- **决策人：** 博源 AI 产品负责人
- **研究深度：** 标准
- **置信度：** 中高。官方渠道的能力和限制有文档依据；真实租户能否直接发送并下载 PDF、主体资质限制和客户端最终排版仍需最小 E2E 验证

## 执行结论

- **本项目推荐：** 微信客服 API；如需从客户群触达，在客户群开启内置“小助理”关键词回复，固定回复微信客服入口。
- **备选：** 直接在微信里打开现有工作台 H5。
- **原因：** 微信客服直接面向普通微信用户，不要求关注公众号或添加企业成员，官方支持文本、文件、链接等消息，并能通过 API 接管会话；Boyuan 现有 `IntakeService`、快速分析、深度分析和工作台链接可复用，只需新增渠道适配层。
- **最强反对理由：** 微信客服仍是单聊，不会让 AI 直接进入含微信用户的客户群；单条文本上限 2048 字节，用户每次发消息后 48 小时内最多回复 5 条，且需要稳定公网 HTTPS 回调。
- **关键未知：** 当前企业是否已开通并允许 API 管理微信客服、当前主体验证状态、微信客户端发送 PDF 后是否稳定产生 `file` 消息，以及生产域名方案。

## Decision snapshot

| Candidate | Adoption / popularity | Strengths | Weaknesses | Current-project fit | Implementation complexity | Implementation cost | Recommendation |
|---|---|---|---|---|---|---|---|
| 微信客服 API | 官方使用量未披露；腾讯一方能力 | 普通微信原生会话；无需关注/加好友；API 支持文本、文件、链接；可转人工 | 仅单聊；无流式；文本 2048 字节；每次用户消息后最多回复 5 条/48 小时；需 HTTPS 回调 | **strong**：可直接复用现有快速/深度分析 | **medium**：回调验签解密、`sync_msg`、素材下载、回复分片、游标与重试 | 估算 4–7 工程日；企业管理员配置；稳定域名/HTTPS 运维 | **首选**；客户群可用内置小助理导流到客服会话 |
| 微信内 H5 | Web 标准，无法形成可比平台使用量 | 最快复用现有移动工作台；PDF 上传和结构化结果不受聊天气泡限制；无需微信平台审核 | 不在聊天内完成；无原生新消息提醒；公开入口需鉴权、限流和滥用防护 | **strong/conditional**：现有工作台已有上传和移动布局，但外部身份体系未完成 | **low-medium**：独立入口、签名链接、限流、稳定域名 | 估算 1–3 工程日 MVP；公网域名与基础安全运维 | **最快备选**；适合先验证外部需求，不算真正微信机器人 |
| 微信小程序 | 官方使用量未披露；微信一方能力 | 可做最完整上传、进度、结果、历史和授权体验；可从微信会话选择 PDF | 需要单独前端、账号/主体、域名配置、隐私合规和发布审核；仍不能在外部群直接 @AI | **conditional**：长期体验好，首期投入偏大 | **high**：前端、登录、上传、结果页、审核与版本发布 | 估算 7–15 工程日，加账号认证/审核等待；认证费用以平台实际账单为准 | **二期产品化选择**；有稳定外部用户后再做 |
| 微信公众号 | 官方使用量未披露；微信一方能力 | 用户熟悉；文本指令和链接回复成熟；可沉淀关注者 | 需要关注；普通消息类型不包含通用 PDF 文件；48 小时客服回复窗口；最终仍需 H5 承担上传 | **weak**：公司名可用，BP 核心链路不完整 | **medium**：回调、OpenID、客服消息、菜单、H5 上传 | 估算 4–8 工程日，加公众号注册/认证与运营 | **不建议作为首期主入口**；已有活跃服务号时才重评 |
| WorkTool / VBot 类非官方自动化 | WorkTool 2,693 stars/567 forks；VBot 4,591 stars/758 forks；2026-09-03 GitHub API | 表面上最接近外部群内 @AI；能以真实账号执行群操作 | 依赖 Android 无障碍、网页协议或商业私有实现；设备在线、客户端升级、封禁与数据安全风险高；VBot 文档明确不建议商业使用 | **fail**：投资材料敏感，生产可靠性和合规风险不可接受 | **POC low，production high/unknown** | POC 估算 2–5 日，之后持续设备与兼容性运维；商业版价格未知 | **排除生产使用**；最多隔离账号做非敏感实验 |

> 采用量说明：官方平台没有公开、可公平比较的“接入企业数”或 API 调用量；因此不把 GitHub stars 与官方渠道的实际使用量混合评分。WorkTool/VBot 数值仅是开源生态代理指标，不代表生产可靠性或合规性。

## 决策上下文

### 结果、硬约束与偏好

| Requirement | Hard/preferred | Project evidence | Notes |
|---|---|---|---|
| 普通微信用户可使用 | hard | 当前企业微信智能机器人只能服务内部成员和内部群 | 候选必须提供普通微信入口 |
| 支持公司名快速研究 | hard | 当前企业微信入口已支持 `分析/研究 <公司名>` | 应直接复用既有公司快速/深度分流 |
| 支持 BP PDF | hard | 当前企业微信真实 PDF E2E 已完成 | 微信侧需要收文件，或提供低摩擦上传页 |
| 快速结果和深度分析并行 | hard | 当前 `IntakeService` 已采用快速回复 + 后台深度分析 | 新渠道不应重新实现分析逻辑 |
| 快速结果内容语义一致 | hard | 当前企业微信已使用普通文本呈现同一字段 | 渠道可调整排版与分片，不应改变事实边界 |
| 不使用高封禁风险个人微信协议 | hard | BP 可能含敏感投资材料 | 非官方个人号自动化直接失败 |
| 尽量留在微信内 | preferred | 用户希望接入微信渠道 | 原生客服会话优于跳浏览器或要求安装其他应用 |
| 外部群内直接 @AI | preferred，当前无法由官方 API 完整满足 | 本次需求讨论 | 可以用内置小助理固定导流，但不是动态 AI 回复 |

### 假设与非目标

- 预计首期为单企业、低到中等并发，不建设多租户微信渠道 SaaS。
- 首期输出普通文本即可，不要求卡片。
- 不在本次调研中创建微信客服、公众号或小程序账号，也不使用项目材料调用第三方服务。
- 不将客户群关键词“小助理”误称为可编程 AI；它只能匹配预设关键词并返回固定内容、网页或小程序入口。

## Adoption and momentum snapshot

官方平台和开源自动化没有公平的统一采用量指标。以下分别保留平台性质和 GitHub 生态代理，不做汇总分数。

| Candidate | Shared usage/adoption metric | Value | Secondary shared metric | Value | Momentum signal | Source/date |
|---|---:|---:|---:|---:|---|---|
| 微信客服 API | 官方客户/API 使用量 | 未披露 | 官方持续文档 | 有 | 腾讯云 2026 年仍提供智能体发布到微信客服的路径 | 2026-09-03 |
| 微信内 H5 | 不可直接度量 | N/A | Web 标准 | 广泛 | Boyuan 当前已有移动响应式工作台 | 仓库观察 2026-09-03 |
| 微信小程序 | 官方开发者/应用量 | 本次未找到可比最新值 | 官方平台 | 有 | 官方持续维护文件选择、网络和发布能力 | 2026-09-03 |
| 微信公众号 | 官方账号/调用量 | 本次未找到可比最新值 | 官方平台 | 有 | 接口成熟，但 BP 文件入口不匹配 | 2026-09-03 |
| WorkTool | GitHub stars | 2,693 | forks | 567 | 仓库 2026-08-26 有推送，但 README 称开源版本为历史版本 | GitHub API 2026-09-03 |
| VBot | GitHub stars | 4,591 | forks | 758 | 仓库 2026-05-30 有推送；公开文档上次更新 2019-05-22 | GitHub API/项目文档 2026-09-03 |

## Side-by-side comparison

| Dimension | 微信客服 API | 微信内 H5 | 微信小程序 | 微信公众号 | 非官方自动化 |
|---|---|---|---|---|---|
| Positioning / best use | 普通微信用户原生一对一 AI 会话 | 最快把现有能力开放给外部用户 | 长期正式外部产品 | 内容运营已有粉丝入口 | 外部群自动化实验 |
| Core capabilities | 文本、图片、语音、视频、文件、链接、小程序；API 会话 | 浏览器上传、进度、结构化结果 | 登录、文件选择/上传、状态页、历史 | 文本/图片等消息、菜单、客服消息 | 账号级群消息、群管理，取决于实现 |
| Important limits | 2048 字节/条；每次用户消息后 5 条/48h；无群聊 | 无聊天内回复/提醒；需自行鉴权 | 审核和域名；`chooseMessageFile` 主要从微信会话选文件 | 普通消息不含通用文件；需关注；回复窗口 | 封禁、掉线、兼容、安全和供应商锁定 |
| Current-project fit | 强 | 强但体验有缺口 | 条件适合二期 | 弱 | 失败 |
| Implementation complexity | 中 | 低到中 | 高 | 中 | POC 低，生产高/未知 |
| Time to first usable result | 2–3 日 POC；4–7 日生产化 | 当日到 3 日 | 1–3 周含审核波动 | 约 1 周，不含账号审核波动 | 2–5 日 POC |
| Cash cost | 原生平台费未在官方文档中披露；需稳定域名/主机 | 域名/主机 | 认证、域名、主机；以实际账单为准 | 认证、域名、主机；以实际账单为准 | 手机/服务器/商业许可未知 |
| Engineering / migration cost | 新渠道适配器，可复用核心 | 现有 UI 上做外部入口和安全层 | 新端和发布流水线 | 新消息适配器 + H5 文件入口 | 大量运行维护和异常恢复 |
| Permissions / approvals | 企业超级管理员、微信客服 API、Secret、回调 | 无微信管理员；需安全负责人确认公开入口 | 小程序主体、管理员、隐私与发布审核 | 公众号主体、管理员、认证和运营 | 设备账号授权；不解决平台合规 |
| Operations / reliability | 官方 API；需维护 token/cursor/回调重试 | 标准 Web；可观测性最容易 | 官方容器但多一套发布与版本 | 官方 API；成熟 | 对客户端更新和设备状态敏感 |
| Privacy / security | 腾讯通道 + 自有后端；需明确 BP 留存和访问 | 可直传自有后端；必须防公开滥用 | 腾讯容器 + 自有后端；需隐私说明 | 腾讯通道 + 自有后端 | 敏感内容可能经设备、商业平台或协议层 |
| Lock-in / exit | 适配层可替换，核心分析不绑定渠道 | 最低 | 中 | 中 | 高且不透明 |

## Candidate dossiers

### 微信客服 API

- **Exact version/tier/region:** 企业微信 / 微信客服，中国区，企业自建 API 管理模式；具体租户资格待确认。
- **Adoption evidence:** 官方未披露可比较数字；企业微信开发者文档和腾讯云仍在维护接入路径。
- **Best use:** 普通微信用户一对一发送公司名或 PDF，并在原生微信会话收取分析结果。
- **Strengths:** 用户不需要关注公众号或添加员工；客服链接/二维码可投放到客户群、网页和其他渠道；`sync_msg` 支持文件，`send_msg` 支持文本、文件、图文和小程序。
- **Weaknesses:** 非群机器人；回调只通知有新消息，服务端还要调用 `sync_msg`；需维护 cursor、消息排重、token、发送失败事件和会话状态。
- **Hard-gate result:** pass with mitigation。
- **Current-project fit:** strong。
- **Implementation complexity:** medium。
- **Total cost and approvals:** 估算 4–7 工程日；企业管理员开通 API、配置回调、提供 Secret；生产需要稳定 HTTPS 域名。原生平台精确资费应以租户后台为准，不引用第三方套餐价。
- **Operational ownership:** token 缓存、cursor 持久化、消息幂等、素材及时下载、48 小时和 5 条规则、失败回调、外部访问滥用控制。
- **Important unknowns:** 当前企业资格/额度；微信客户端发送 PDF 的真实行为；是否需额外人工客服兜底。

对现有实现的具体改动估算：

1. 增加 `wechat_kf` 渠道标识和平台路由，复用现有 `IntakeService`。
2. 新增 HTTPS 回调验签/解密、`sync_msg` 拉取和持久 cursor。
3. 增加媒体下载器，把微信客服的 `media_id` 转成当前 `IntakeAttachment`。
4. 增加文本发送器和 UTF-8 分片。当前实测快速结果约 2321 字节，超过微信客服单条 2048 字节上限，需拆成两条。
5. 建议消息预算为：1 条处理中 + 2 条快速结果 + 1 条工作台链接，合计 4 条，保留第 5 条用于失败或补充提示。深度分析默认不再额外主动推送，避免挤占窗口。
6. 增加真实微信用户的公司名和 PDF E2E，并验证 30 秒性能目标。

### 微信内 H5

- **Exact version/tier/region:** 现有 Boyuan Vite/React 工作台的移动入口，经微信内置浏览器访问。
- **Adoption evidence:** 不适用；这是实现方法而非单一产品。
- **Best use:** 快速验证外部用户是否愿意提交公司名/BP，或作为所有微信入口的兜底上传页。
- **Strengths:** 现有工作台已有公司研究、材料上传、进度和移动布局；不受微信消息长度限制。
- **Weaknesses:** 用户离开群聊/聊天页；无原生消息提醒；公开链接如果没有认证和限流，会暴露模型成本与材料数据。
- **Hard-gate result:** pass with mitigation。
- **Current-project fit:** strong/conditional。
- **Implementation complexity:** low-medium。
- **Total cost and approvals:** 估算 1–3 工程日；稳定域名、HTTPS、邀请鉴权和限流。
- **Operational ownership:** 入口鉴权、上传限额、恶意文件、会话归属、链接过期、隐私提示。
- **Important unknowns:** 当前移动端在不同微信版本的文件选择体验；对外用户身份方案。

### 微信小程序

- **Exact version/tier/region:** 企业主体微信小程序，中国区；原生或薄壳 + H5 方案待定。
- **Adoption evidence:** 官方未披露本次可比较数字。
- **Best use:** 稳定外部用户规模下，提供正式的上传、进度、结构化结果和历史记录产品。
- **Strengths:** 微信内体验完整；`wx.chooseMessageFile` 可从微信会话选择 PDF；结构化页面适合长分析结果。
- **Weaknesses:** 小程序主要从微信会话选取文件，手机本地文件可能仍需 H5 辅助；账号、域名、隐私、审核和版本发布增加周期。
- **Hard-gate result:** pass with mitigation。
- **Current-project fit:** conditional。
- **Implementation complexity:** high。
- **Total cost and approvals:** 估算 7–15 工程日，加平台审核等待；认证费用和审核周期以账号后台为准。
- **Operational ownership:** 微信登录、会话绑定、上传域名、版本兼容、审核合规、隐私声明。
- **Important unknowns:** 主体是否已有可复用小程序/认证公众号；目标用户 PDF 的实际来源。

### 微信公众号

- **Exact version/tier/region:** 服务号优先，中国区；是否已有账号未知。
- **Adoption evidence:** 官方未披露本次可比较数字。
- **Best use:** 已有大量公众号粉丝、以文本公司查询和内容运营为主的场景。
- **Strengths:** 用户熟悉，菜单和自动回复成熟，可发工作台链接。
- **Weaknesses:** 用户需要关注；公众号接收普通消息的公开类型包括文本、图片、语音、视频、位置和链接，不包含通用 PDF 文件；BP 上传最终仍要跳 H5/小程序。
- **Hard-gate result:** fail for direct BP upload。
- **Current-project fit:** weak。
- **Implementation complexity:** medium。
- **Total cost and approvals:** 估算 4–8 工程日，加账号注册、认证、菜单和内容运营。
- **Operational ownership:** OpenID、token、回调加密、48 小时窗口、关注/取关和菜单版本。
- **Important unknowns:** 是否已有认证服务号和活跃受众。

### WorkTool / VBot 类非官方自动化

- **Exact version/tier/region:** WorkTool 开源历史版本 + 商业版；VBot 网页协议/PHP 7；具体商业版本和价格未披露。
- **Adoption evidence:** WorkTool 2,693 stars/567 forks；VBot 4,591 stars/758 forks，GitHub API 2026-09-03。
- **Best use:** 隔离账号、非敏感、短期实验，且业务硬性要求外部群内自动操作。
- **Strengths:** 可模拟真实账号，最接近客户群内直接响应。
- **Weaknesses:** WorkTool 依赖 Android 设备和无障碍自动化，公开仓库是历史版本；VBot 自称网页协议，公开文档明确“使用上不稳定，不建议用作商业化项目”。两者都增加客户端升级、账号限制、设备故障和敏感数据风险。
- **Hard-gate result:** fail。
- **Current-project fit:** weak/fail。
- **Implementation complexity:** POC low，production high/unknown。
- **Total cost and approvals:** POC 2–5 工程日；长期硬件、账号、值守和商业服务价格未知。
- **Operational ownership:** 设备保活、扫码登录、客户端版本锁定、异常弹窗、账号风控、供应商和数据链路审计。
- **Important unknowns:** 商业版本源码、SLA、数据流向、事故责任和腾讯平台政策适配。

## 推荐与选择指南

### 当前项目建议

首期采用“**微信客服 API + 客户群小助理导流**”：

1. 在企业微信开通一个“博源 AI”微信客服账号，获取二维码和客服链接。
2. 在含普通微信用户的客户群开启企业微信内置“小助理”，配置关键词 `研究`、`分析`、`BP`，固定回复微信客服入口。小助理只做导航，不接触分析数据。
3. 普通微信用户点击后进入原生微信客服会话，发送 `研究 宁德时代` 或 PDF。
4. 新微信客服适配器把消息交给现有快速/深度分析服务，先发处理中，再用两条左右普通文本返回快速结果和工作台链接。
5. 深度分析继续在工作台后台运行；若确实需要完成提醒，再利用剩余消息额度发送一条简短通知。

这套方案牺牲了“一步在群里得到答案”，但只多一次点击，保留官方通道、原生微信通知和 PDF 能力。它也允许后续把同一个客服链接放进公众号、小程序、官网或路演材料二维码，无需重做后端分析链路。

### Choose by scenario

| Choose | When | Avoid when | Evidence that could change this |
|---|---|---|---|
| 微信客服 API | 要普通微信用户原生对话，且接受一对一 | 必须在客户群原地动态回复 | 官方未来开放外部群智能机器人 |
| 微信内 H5 | 目标是最快上线验证，不强调聊天感 | 需要消息提醒和原生会话 | 外部用户对跳转流失明显 |
| 微信小程序 | 外部用户稳定、需要历史和丰富结果 UI | 仍在验证需求或排期很紧 | 已有同主体小程序和可复用前端，可显著降成本 |
| 微信公众号 | 已有大量粉丝且公司名查询多于 BP | 需要直接发送 PDF | 公众号未来补齐通用文件消息，或已有成熟 H5 上传 |
| 非官方自动化 | 只做隔离非敏感实验，并明确接受账号风险 | 生产、敏感材料、对稳定性有要求 | 只有腾讯提供正式外部群双向 API 才能改变排除结论 |

### 重新评估触发条件

- 企业微信正式开放智能机器人进入外部群或客户群。
- 微信客服调整 5 条/48 小时或 2048 字节限制。
- Boyuan 已拥有认证服务号、小程序或稳定公网域名。
- 外部用户量增长到需要历史、权限、项目空间和结构化结果页面。
- 业务把“群内原地回复”提升为硬约束；此时应重新评估需求，而不是默认采用非官方协议。

## Validation plan

| Unknown | Test/review | Shared workload | Success boundary | Cost/permission | Owner |
|---|---|---|---|---|---|
| 当前企业能否 API 管理微信客服 | 管理后台只读检查 | 查看微信客服、API、客服账号与回调配置入口 | 能创建客服账号并看到 API Secret/回调设置 | 企业超级管理员 | 用户 + 开发 |
| 普通微信能否发送 BP PDF | 最小真实租户 smoke | 1 个微信号、1 份现有虚构测试 PDF | `sync_msg` 返回 file，20MB 内素材可下载且文件名/哈希正确 | 测试账号和临时回调 | 开发 |
| 消息分片体验 | 同一快速结果在微信客服实发 | 处理中 + 两段结果 + 链接 | 顺序正确、字段不断裂、总回复不超过 5 条 | 测试消息 | 产品 + 开发 |
| 端到端性能 | 公司名和 PDF 各跑一次 | 复用现有测试材料 | 快速结果目标 30 秒内；深度分析不阻塞 | 模型调用 | 开发 |
| H5 兜底体验 | 微信内置浏览器 smoke | 现有工作台移动页 + PDF | 上传、进度、返回和深链可用 | 无微信平台审批 | 开发 |

停止规则：如果后台不存在微信客服 API 管理能力，或真实微信客户端不能稳定提交并下载 PDF，则停止生产实现，先上线带签名入口的 H5，不继续投入完整适配器。

## Evidence ledger

| Candidate | Label | Finding | Exact version/tier | Source | Source type | Observed date | Relevance / caveat |
|---|---|---|---|---|---|---|---|
| 微信客服 | Observed | 用户可从微信内外入口进入客服；企业开启 API 后可管理会话和收发消息 | 企业微信微信客服 API | [企业微信开发者文档概述](https://developer.work.weixin.qq.com/document/path/94638) | 官方文档 | 2026-09-03 | 官方页面抓取受限，另以文档镜像交叉核对 |
| 微信客服 | Observed | `sync_msg` 支持文本、图片、语音、视频、文件、位置、链接等 | 微信客服 API | [读取消息](https://developer.work.weixin.qq.com/document/path/94670) / [可检索镜像](https://s.apifox.cn/apidoc/docs-site/406014/api-10061327) | 官方文档 + 镜像 | 2026-09-03 | PDF 客户端行为仍需租户 E2E |
| 微信客服 | Observed | 回复支持文件等类型；文本不超过 2048 字节；每次用户消息后 48 小时内最多 5 条 | 微信客服 API | [发送消息](https://developer.work.weixin.qq.com/document/path/94677) / [可检索镜像](https://s.apifox.cn/apidoc/docs-site/406014/api-10061328) | 官方文档 + 镜像 | 2026-09-03 | 是输出分片设计的硬约束 |
| 微信客服 | Observed | 腾讯云支持将智能体发布到微信客服并用二维码进入 | 腾讯云智能体开发平台 | [腾讯云文档](https://cloud.tencent.cn/document/product/1759/122567) | 腾讯官方文档 | 2026-09-03 | 证明渠道可承载 AI，但本项目自行实现适配器 |
| 客户群小助理 | Observed | 外部客户群可按预设关键词让内置小助理回复文本、网页或小程序 | 企业微信客户群自动回复 | [企业微信帮助内容同步页](https://www.qusiyi.com/wecom-business-guide/246.html) | 官方帮助内容同步页 | 2026-09-03 | 只能固定规则，不能接自定义动态分析 |
| H5 | Observed | 当前仓库工作台已有上传、公司研究、深链和移动布局 | Boyuan 当前运行时源码 | `src/product/WorkbenchPage.tsx`、`src/product/product.css` | 项目证据 | 2026-09-03 | 对外鉴权和限流尚未完成 |
| 小程序 | Observed | `wx.chooseMessageFile` 可从客户端会话选择除图片/视频外的文件 | 微信小程序 | [微信开放文档](https://developers.weixin.qq.com/miniprogram/dev/api/media/image/wx.chooseMessageFile.html) | 官方文档 | 2026-09-03 | 主要是从微信会话选择，不等同任意手机文件系统 |
| 小程序 | Observed | `request/uploadFile/downloadFile` 需配置 HTTPS 合法域名 | 微信小程序 | [小程序网络文档](https://developers.weixin.qq.com/miniprogram/dev/framework/ability/network.html) | 官方文档 | 2026-09-03 | 增加域名和发布运维 |
| 公众号 | Observed | 接收普通消息包括文本、图片、语音、视频、位置和链接，未列通用文件 | 微信公众号 | [接收普通消息](https://developers.weixin.qq.com/doc/offiaccount/Message_Management/Receiving_standard_messages.html) | 官方文档 | 2026-09-03 | 直接 BP PDF 链路失败 |
| WorkTool | Observed | 开源仓库为历史版本；方案依赖 Android 无障碍和一台常驻设备 | 当前公开仓库 | [gallonyin/worktool](https://github.com/gallonyin/worktool) | 项目一手资料 | 2026-09-03 | 商业版能力、价格和数据链路未公开 |
| VBot | Observed | 项目基于微信网页协议；文档明确不稳定、不建议商业使用 | 公开文档 2019-05-22 | [VBot 概述](https://create.hanc.cc/vbot/docs/index.html) | 项目一手资料 | 2026-09-03 | 直接触发生产硬门禁失败 |

## Excluded evidence and unresolved conflicts

- **不可访问来源：** 企业微信官方开发者文档页面不易被搜索工具抓取；报告保留官方链接，并用公开镜像核对消息字段和限制。
- **冲突：** 部分第三方文章声称微信客服“只支持人工接待”，但官方 API 明确存在“由智能助手接待”状态和 `send_msg`，因此不采纳该说法。
- **不可比较指标：** 官方微信平台的企业/API 调用量未披露，开源项目 stars 不能与官方平台采用量比较。
- **来源覆盖差异：** WorkTool 商业版价格、SLA、数据流向未披露；不能把公开仓库活跃度当成商业版可靠性证据。
- **费用：** 第三方 SaaS 的微信客服套餐不是企业微信原生 API 的必选费用，未纳入首选方案成本。平台认证和额度以当前租户后台实际信息为准。
