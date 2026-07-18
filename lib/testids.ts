// E2E 地基(决策4=iOS Maestro 先行;2026-07-08 PM"testID 地基现在埋,Maestro 脚本+EAS 构建上架冲刺前集中做")。
// 单一真源:所有 testID 字符串集中于此,组件里 import 使用、不各自手写字面量(防漂移/改名漏改)。
// 首批 5 条核心流程(测试缺口盘点建议清单):OTP登录 / 首页 / 修持打卡 / 班级本周课 / 课时学习。
export const testIds = {
  login: {
    emailInput: 'login-email-input',
    nextButton: 'login-next-button',
  },
  verify: {
    codeInput: 'verify-code-input',
    submitButton: 'verify-submit-button',
  },
  register: {
    emailInput: 'register-email-input',
    passwordInput: 'register-password-input',
    password2Input: 'register-password2-input',
    submitButton: 'register-submit-button',
    codeInput: 'register-code-input',
    codeSubmitButton: 'register-code-submit-button',
    resendButton: 'register-resend-button',
  },
  home: {
    quickCountCard: 'home-quick-count-card',
  },
  quickCount: {
    // 弹层跨首页/修持页复用,testID 不分场景(同一份判例)
    vowChip: (vowId: string) => `qc-vow-chip-${vowId}`,
    digitKey: (d: number) => `qc-digit-${d}`,
    recordButton: 'qc-record-button',
    savedMark: 'qc-saved-mark',
  },
  class: {
    weekLessonRow: (lessonId: string) => `class-week-lesson-${lessonId}`,
  },
  lesson: {
    markCompleteButton: 'lesson-mark-complete-button',
    markConfirmButton: 'lesson-mark-confirm-button',
  },
  practice: {
    // 加功课(自建功课)弹层·2026-07-13补(PM测出"每日目标可填0"边界问题起)
    addVowButton: 'practice-add-vow-button',
    addVowDailyInput: 'practice-add-vow-daily-input',
    addVowTargetInput: 'practice-add-vow-target-input',
    addVowSaveButton: 'practice-add-vow-save-button',
  },
  care: {
    // 关怀跟进记录(2026-07-14补·A3幂等e2e覆盖)
    addFollowupButton: 'care-add-followup-button',
    followupSummaryInput: 'care-followup-summary-input',
    followupSaveButton: 'care-followup-save-button',
  },
  event: {
    // 法会详情页·报名发愿(2026-07-14补·A3幂等e2e覆盖)
    joinButton: 'event-join-button',
  },
  help: {
    // 帮助与反馈页·意见反馈(2026-07-14补·A3幂等e2e覆盖)
    feedbackInput: 'help-feedback-input',
    feedbackSubmitButton: 'help-feedback-submit-button',
  },
  guan: {
    // 观修步(2026-07-14补·A3幂等e2e覆盖)
    mainButton: 'guan-main-button',
    manualOpenButton: 'guan-manual-open-button',
    manualInput: 'guan-manual-input',
    manualConfirmButton: 'guan-manual-confirm-button',
  },
  practiceConfig: {
    // 功课模板配置(2026-07-14补·A3幂等e2e覆盖;2026-07-16补剩余交互:编辑/停用启用/传承)
    newTemplateButton: 'practice-config-new-template-button',
    practiceChip: (practiceId: string) => `practice-config-practice-chip-${practiceId}`,
    nameInput: 'practice-config-name-input',
    dailyTargetInput: 'practice-config-daily-target-input',
    weeklyTargetInput: 'practice-config-weekly-target-input',
    minSessionInput: 'practice-config-min-session-input',
    offsetDaysInput: 'practice-config-offset-days-input',
    durationDaysInput: 'practice-config-duration-days-input',
    submitButton: 'practice-config-submit-button',
    // 页面顶层"选择专业"chip——与弹层内"适用专业"chip文案可能相同(同一批programs.map),
    // RN Modal开着时底层DOM不摘除,两处同名chip会撞严格模式,分别给testID区分
    programChip: (programId: string) => `practice-config-program-chip-${programId}`,
    appliesProgramChip: (programId: string) => `practice-config-applies-program-chip-${programId}`,
    editButton: (templateId: string) => `practice-config-edit-${templateId}`,
    toggleButton: (templateId: string) => `practice-config-toggle-${templateId}`,
    newTransmissionButton: 'practice-config-new-transmission-button',
    transmissionNameInput: 'practice-config-transmission-name-input',
    transmissionSaveButton: 'practice-config-transmission-save-button',
    requiredTransmissionChip: (transmissionId: string) => `practice-config-required-transmission-chip-${transmissionId}`,
    // 按班覆盖 + 同步发放(2026-07-16补·PM"把剩余的测试内容也加进去")
    cohortChip: (cohortId: string) => `practice-config-cohort-chip-${cohortId}`,
    bindToggleButton: (templateId: string) => `practice-config-bind-toggle-${templateId}`,
    provisionButton: 'practice-config-provision-button',
    // 自选经候选清单
    optionalPracticeChip: (practiceId: string) => `practice-config-optional-practice-chip-${practiceId}`,
    // 修法节奏权限(2026-07-17·PM决策方案3:班级/自学双通道独立设置,各自三态自由/限定值/锁定)
    paceLockButton: 'practice-config-pace-lock-button',
    paceLockModeChip: (practiceId: string, channel: 'auto' | 'custom', mode: 'free' | 'whitelist' | 'locked') =>
      `practice-config-pace-lock-mode-${practiceId}-${channel}-${mode}`,
    paceLockWhitelistInput: (practiceId: string, channel: 'auto' | 'custom') =>
      `practice-config-pace-lock-whitelist-input-${practiceId}-${channel}`,
    paceLockApplyButton: (practiceId: string, channel: 'auto' | 'custom') =>
      `practice-config-pace-lock-apply-${practiceId}-${channel}`,
  },
  reminderPresets: {
    // 提醒语预设库(2026-07-14补·A3幂等e2e覆盖)
    newButton: 'reminder-presets-new-button',
    labelInput: 'reminder-presets-label-input',
    submitButton: 'reminder-presets-submit-button',
  },
  speaking: {
    // 新建讲考场次(2026-07-14补·A3幂等e2e覆盖)
    newButton: 'speaking-new-button',
    lessonRow: (lessonId: string) => `speaking-lesson-row-${lessonId}`,
    dateInput: 'speaking-date-input',
    submitButton: 'speaking-submit-button',
  },
  events: {
    // 法会管理页(2026-07-14补·A3幂等e2e覆盖):新建法会/管理场次/发公告 三处
    newEventButton: 'events-new-event-button',
    newEventNameInput: 'events-new-event-name-input',
    newEventStartInput: 'events-new-event-start-input',
    newEventEndInput: 'events-new-event-end-input',
    newEventSubmitButton: 'events-new-event-submit-button',
    manageSessionsButton: (eventId: string) => `events-manage-sessions-button-${eventId}`,
    sessionDateInput: 'events-session-date-input',
    sessionAddButton: 'events-session-add-button',
    addAnnouncementButton: 'events-add-announcement-button',
    cohortOption: (cohortId: string) => `events-cohort-option-${cohortId}`,
    announcementContentInput: 'events-announcement-content-input',
    announcementPublishButton: 'events-announcement-publish-button',
  },
  classDetail: {
    // 班级详情管理操作(2026-07-16补·此前0个testID)
    addMembersButton: 'class-add-members-button',
    staffButton: 'class-staff-button',
    scheduleButton: 'class-schedule-button',
    restButton: 'class-rest-button',
    endClassButton: 'class-end-class-button',
    reopenClassButton: 'class-reopen-class-button',
    manageMemberButton: (userId: string) => `class-manage-member-${userId}`,
    // 添加学员弹层
    addMembersSearchInput: 'class-add-members-search-input',
    addMembersRow: (profileId: string) => `class-add-members-row-${profileId}`,
    addMembersSubmitButton: 'class-add-members-submit-button',
    // 设辅导员/爱心弹层
    staffSearchInput: 'class-staff-search-input',
    staffAppointButton: (profileId: string) => `class-staff-appoint-${profileId}`,
    staffRevokeButton: (userId: string, role: string) => `class-staff-revoke-${userId}-${role}`,
    staffDoneButton: 'class-staff-done-button',
    // 设休息周弹层
    restDateInput: 'class-rest-date-input',
    restAddButton: 'class-rest-add-button',
    restRemoveButton: (id: string) => `class-rest-remove-${id}`,
    // 成员管理弹层(转正/暂停/留级/恢复/移出)
    memberPromoteButton: 'class-member-promote-button',
    memberPauseButton: 'class-member-pause-button',
    memberHoldBackButton: 'class-member-holdback-button',
    memberResumeButton: 'class-member-resume-button',
    memberLeaveButton: 'class-member-leave-button',
    // 学习提醒弹层(决策188方案A·2026-07-17补)
    reminderButton: 'class-reminder-button',
    reminderEnabledToggle: 'class-reminder-enabled-toggle',
    reminderTimeInput: 'class-reminder-time-input',
    reminderMessageInput: 'class-reminder-message-input',
    reminderSaveButton: 'class-reminder-save-button',
  },
  attendance: {
    // 出勤逐人点名(2026-07-16补·此前0个testID)
    statusToggle: (userId: string) => `attendance-status-toggle-${userId}`,
    saveButton: 'attendance-save-button',
  },
  speakingDetail: {
    // 讲考逐人记录页(2026-07-16补·此前0个testID;与 speaking.newButton 等新建表单testID区分)
    statusChip: (userId: string, status: string) => `speaking-detail-status-${userId}-${status}`,
    gradeChip: (userId: string, grade: string) => `speaking-detail-grade-${userId}-${grade}`,
    saveButton: 'speaking-detail-save-button',
    deleteButton: 'speaking-detail-delete-button',
    groupLinkButton: 'speaking-detail-group-link-button',
    groupPickerNoneRow: 'speaking-detail-group-picker-none-row',
    groupPickerRow: (sessionId: string) => `speaking-detail-group-picker-row-${sessionId}`,
    groupPickerConfirmButton: 'speaking-detail-group-picker-confirm-button',
  },
  advancement: {
    // 升学评定详情页(2026-07-16补·此前0个testID)
    graduateButton: 'advancement-graduate-button',
    holdBackButton: 'advancement-holdback-button',
    leaveButton: 'advancement-leave-button',
    confirmActionButton: 'advancement-confirm-action-button',
    examEntryButton: 'advancement-exam-entry-button',
    examScoreInput: 'advancement-exam-score-input',
    examSaveButton: 'advancement-exam-save-button',
  },
  semesterEnd: {
    // 学期末一站式工作流(2026-07-16补·此前0个testID):"处理"按钮同页多行同文案,靠userId区分
    processButton: (userId: string) => `semester-end-process-${userId}`,
  },
  vowDetail: {
    // 功课详情/管理页(2026-07-16补·此前0个testID)
    paceButton: 'vow-detail-pace-button',
    paceInput: 'vow-detail-pace-input',
    paceSaveButton: 'vow-detail-pace-save-button',
    backfillButton: 'vow-detail-backfill-button',
    backfillAmountInput: 'vow-detail-backfill-amount-input',
    backfillSubmitButton: 'vow-detail-backfill-submit-button',
    abandonButton: 'vow-detail-abandon-button',
    abandonConfirmButton: 'vow-detail-abandon-confirm-button',
  },
  scheduling: {
    // 排课管理(2026-07-16补·此前0个testID,写program_semesters/weeks/week_courses这条
    // 全app"本周应学"的数据源)
    programOption: (programId: string) => `scheduling-program-${programId}`,
    generateButton: 'scheduling-generate-button',
    courseOption: (courseId: string) => `scheduling-course-option-${courseId}`,
    fromNStepper: 'scheduling-fromn-stepper',
    toNStepper: 'scheduling-ton-stepper',
    perWeekStepper: 'scheduling-perweek-stepper',
    generateSubmitButton: 'scheduling-generate-submit-button',
    holidayToggle: (weekId: string) => `scheduling-holiday-toggle-${weekId}`,
    removeCourseButton: (weekCourseId: string) => `scheduling-remove-course-${weekCourseId}`,
    clearSemesterButton: (semesterId: string) => `scheduling-clear-semester-${semesterId}`,
    selfStudyButton: 'scheduling-selfstudy-button',
    selfStudyBookOption: (bookId: string) => `scheduling-selfstudy-book-${bookId}`,
    selfStudyWeekCountStepper: 'scheduling-selfstudy-weekcount-stepper',
    selfStudySubmitButton: 'scheduling-selfstudy-submit-button',
  },
  courseDetail: {
    // 课程详情页"加入自学"(2026-07-16补·此前0个testID,决策119自助报名零e2e覆盖)
    startSelfStudyButton: 'course-detail-start-selfstudy-button',
    enrollProgramOption: (programId: string) => `course-detail-enroll-program-${programId}`,
  },
  quiz: {
    // 思考题管理(2026-07-16补·此前0个testID)
    coursePickerTrigger: 'quiz-course-picker-trigger',
    courseOption: (courseId: string) => `quiz-course-option-${courseId}`,
    lessonPickerTrigger: 'quiz-lesson-picker-trigger',
    lessonOption: (lessonId: string) => `quiz-lesson-option-${lessonId}`,
    promptInput: 'quiz-prompt-input',
    referenceInput: 'quiz-reference-input',
    createButton: 'quiz-create-button',
    lessonGroupHeader: (lessonId: string) => `quiz-lesson-group-header-${lessonId}`,
    questionRow: (questionId: string) => `quiz-question-row-${questionId}`,
    // 详情页几处按钮文案随态切换(编辑/保存、添加/修改/取消),不靠文案定位,统一走testID
    editPromptButton: 'quiz-edit-prompt-button',
    promptEditInput: 'quiz-prompt-edit-input',
    editReferenceButton: 'quiz-edit-reference-button',
    referenceEditInput: 'quiz-reference-edit-input',
    saveReferenceButton: 'quiz-save-reference-button',
    deleteButton: 'quiz-delete-button',
    extractButton: 'quiz-extract-button',
  },
  settings: {
    // 通知区·学习提醒权限状态(决策188方案A·2026-07-17补)
    enableNotificationsButton: 'settings-enable-notifications-button',
  },
  setPassword: {
    // 强制/顺路改密码页(2026-07-17补·此前0个testID,回归覆盖"无限循环卡在重设密码页面"bug)
    pwdInput: 'set-password-pwd-input',
    pwd2Input: 'set-password-pwd2-input',
    submitButton: 'set-password-submit-button',
    signOutButton: 'set-password-signout-button',
  },
  students: {
    // 后台创建学员账号(2026-07-15·免手机端注册)
    createButton: 'students-create-button',
    createEmailInput: 'students-create-email-input',
    createPasswordInput: 'students-create-password-input',
    createNameInput: 'students-create-name-input',
    createSubmitButton: 'students-create-submit-button',
    // 学员管理操作(2026-07-16补·此前0个testID,靠文案定位)
    approveButton: 'students-approve-button',
    rejectButton: 'students-reject-button',
    promoteButton: 'students-promote-button',
    // 学员详情页「管理操作」剩余交互(2026-07-18补·后台全面测试方案批①):
    // 切主班 / 设宽限-暂停-纠错 / 代行,此前这几处 0 个 testID。
    switchCohortButton: 'students-switch-cohort-button',
    switchCohortOption: (cohortId: string) => `students-switch-cohort-option-${cohortId}`,
    graceButton: 'students-grace-button',
    graceVowRow: (vowId: string) => `students-grace-vow-row-${vowId}`,
    gracePauseToggle: (vowId: string) => `students-grace-pause-toggle-${vowId}`,
    graceDateInput: 'students-grace-date-input',
    graceExtendButton: 'students-grace-extend-button',
    graceMinSessionInput: 'students-grace-min-session-input',
    graceMinSessionButton: 'students-grace-min-session-button',
    graceDailyTargetChip: (value: number) => `students-grace-daily-target-chip-${value}`,
    graceDailyTargetButton: 'students-grace-daily-target-button',
    proxyButton: 'students-proxy-button',
    proxyTypeChip: (type: string) => `students-proxy-type-chip-${type}`,
    proxyKindChip: (kind: string) => `students-proxy-kind-chip-${kind}`,
    proxyVowRow: (vowId: string) => `students-proxy-vow-row-${vowId}`,
    proxyNoteInput: 'students-proxy-note-input',
    proxyPracticeChip: (practiceId: string) => `students-proxy-practice-chip-${practiceId}`,
    proxyCountInput: 'students-proxy-count-input',
    proxyReasonInput: 'students-proxy-reason-input',
    proxyBasisInput: 'students-proxy-basis-input',
    proxySubmitButton: 'students-proxy-submit-button',
    // 独立路由 /students/[id] 专属区块(宽屏 master-detail 面板不渲染这几块):
    // 无障碍学修 chip、传承记录录入、撤回注销。
    a11yBlindChip: 'students-a11y-blind-chip',
    a11yDeafChip: 'students-a11y-deaf-chip',
    cancelDeletionButton: 'students-cancel-deletion-button',
    transmissionRecordButton: 'students-transmission-record-button',
    transmissionPickChip: (transmissionId: string) => `students-transmission-pick-chip-${transmissionId}`,
    transmissionDateInput: 'students-transmission-date-input',
    transmissionReasonInput: 'students-transmission-reason-input',
    transmissionConfirmButton: 'students-transmission-confirm-button',
  },
  calendarPicker: {
    // 共享日期选择弹层(components/month-calendar.tsx DatePickerModal·2026-07-18 后台日期录入
    // 体验审计改造后新用)。dIso 用 yyyy-MM-dd(同组件内部 iso() 那份格式,e2e 按目标日期直接算 testID)。
    // scope 用调用方(AdminDateField 自己的 testID)做后缀区分——CI 真机跑到:同屏两个日期字段
    // (如"新建法会"的起止日期)各自的 DatePickerModal 在 RN Modal(web 端不摘除底层 DOM)下
    // 会同时挂载,不加区分会撞 Playwright 严格模式(getByTestId 解析到 2 个元素)。不传 scope 时
    // 退回不带后缀的原始 ID(没 testID 的字段没有 e2e 覆盖,不需要区分)。
    nextMonthButton: (scope?: string) => (scope ? `calendar-next-month-button-${scope}` : 'calendar-next-month-button'),
    prevMonthButton: (scope?: string) => (scope ? `calendar-prev-month-button-${scope}` : 'calendar-prev-month-button'),
    dayCell: (dIso: string, scope?: string) => (scope ? `calendar-day-${dIso}-${scope}` : `calendar-day-${dIso}`),
  },
  timePicker: {
    // 共享时间选择弹层(components/time-picker.tsx TimePickerModal·同上审计改造新用)。
    // h/m 为数字(非补零字符串),e2e 按目标 HH:mm 拆出数字直接算 testID。scope 同 calendarPicker
    // 那份道理(同屏两个时间字段,如共修起止时间,需要区分)。
    hourCell: (h: number, scope?: string) => (scope ? `time-picker-hour-${h}-${scope}` : `time-picker-hour-${h}`),
    minuteCell: (m: number, scope?: string) => (scope ? `time-picker-minute-${m}-${scope}` : `time-picker-minute-${m}`),
    confirmButton: (scope?: string) => (scope ? `time-picker-confirm-button-${scope}` : 'time-picker-confirm-button'),
  },
  posterTheme: {
    // 画报强调色/透明度 实时预览窗(2026-07-18·PM"先做预览窗"新增)。previewTabBarBg 是预览里
    // tab栏那层背景色 View,e2e 靠读它的computed backgroundColor验证预览真的跟着表单联动。
    hexInput: 'poster-theme-hex-input',
    previewTabBarBg: 'poster-theme-preview-tabbar-bg',
  },
} as const;
