"use client";

import {
  Activity,
  AlertCircle,
  Ban,
  BellRing,
  Brain,
  CalendarDays,
  CheckCircle2,
  CircleHelp,
  ClipboardCheck,
  Database,
  Download,
  Edit3,
  FileText,
  HeartHandshake,
  MessageCircle,
  Mic,
  PauseCircle,
  Phone,
  Play,
  RefreshCw,
  Save,
  Search,
  Send,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Square,
  Trash2,
  Upload,
  UserCheck,
  UserPlus,
  Users,
  XCircle,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import type {
  BotPolicy,
  BotSettings,
  Contact,
  ContactTimelineItem,
  DashboardData,
  ImportResult,
  IntegrationHealth,
  OwnerAlert,
  OwnerCommandRoute,
  ReviewItem,
  SearchResult,
  SimulationResult,
  WeeklyReport,
  Youth,
} from "@/lib/types";
import { mergeOwnerCommandRoutes } from "@/lib/owner-command-routes";

type ContactForm = {
  id?: string;
  name: string;
  phone: string;
  country: string;
  timezone: string;
  language: Contact["language"];
  status: Contact["status"];
  preferredTone: string;
  responseStyle: string;
  bestContactTime: string;
  allowAutoSend: boolean;
  nextDueAt: string;
  notes: string;
  warmthScore: number;
};

type YouthForm = {
  id?: string;
  contactId: string;
  name: string;
  city: string;
  stage: Youth["stage"];
  milestones: string;
  nextAction: string;
};

const emptyContactForm: ContactForm = {
  name: "",
  phone: "",
  country: "",
  timezone: "Asia/Jerusalem",
  language: "he",
  status: "active",
  preferredTone: "חם, מכבד וקצר",
  responseStyle: "רגיל",
  bestContactTime: "12:00",
  allowAutoSend: false,
  nextDueAt: "",
  notes: "",
  warmthScore: 50,
};

const emptyYouthForm: YouthForm = {
  contactId: "",
  name: "",
  city: "",
  stage: "new",
  milestones: "",
  nextAction: "",
};

const stageLabels: Record<Youth["stage"], string> = {
  new: "חדש",
  warming: "מתחמם",
  learning: "לומד",
  mitzvah: "התקדמות במצווה",
  needs_followup: "צריך מעקב",
};

const statusLabels: Record<Contact["status"], string> = {
  active: "פעיל",
  paused: "מושהה",
  needs_attention: "צריך תשומת לב",
};

export default function DashboardClient({
  initialDashboard,
}: {
  initialDashboard: DashboardData;
}) {
  const initialContactId = initialDashboard.contacts[0]?.id || "";
  const [dashboard, setDashboard] = useState<DashboardData>(initialDashboard);
  const [settingsDraft, setSettingsDraft] = useState<BotSettings>(
    initialDashboard.settings,
  );
  const [policyDraft, setPolicyDraft] = useState<BotPolicy>(
    initialDashboard.policy,
  );
  const [contactForm, setContactForm] = useState<ContactForm>(emptyContactForm);
  const [youthForm, setYouthForm] = useState<YouthForm>({
    ...emptyYouthForm,
    contactId: initialContactId,
  });
  const [selectedContactId, setSelectedContactId] = useState(initialContactId);
  const [selectedYouthId, setSelectedYouthId] = useState(
    initialDashboard.youths.find(
      (youth) => youth.contactId === initialDashboard.contacts[0]?.id,
    )?.id ||
      initialDashboard.youths[0]?.id ||
      "",
  );
  const [timeline, setTimeline] = useState<ContactTimelineItem[]>(() =>
    createDashboardTimeline(initialDashboard, initialContactId),
  );
  const [reviewDrafts, setReviewDrafts] = useState<Record<string, string>>({});
  const [csvText, setCsvText] = useState("");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [simulationText, setSimulationText] = useState(
    "אפשר לשאול משהו אישי שלא קשור לנערים?",
  );
  const [simulationFrom, setSimulationFrom] = useState(
    initialDashboard.contacts[0]?.phone || "",
  );
  const [simulation, setSimulation] = useState<SimulationResult | null>(null);
  const [weeklyReport, setWeeklyReport] = useState<WeeklyReport | null>(null);
  const [command, setCommand] = useState("");
  const [commandReply, setCommandReply] = useState("");
  const [assistantNotice, setAssistantNotice] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    setLoading(true);
    const data = await fetchJson<DashboardData>("/api/dashboard");
    setDashboard(data);
    setSettingsDraft(data.settings);
    setPolicyDraft(data.policy);
    setNowMs(Date.now());
    setLoading(false);
  }, []);

  const selectedContact = dashboard.contacts.find(
    (contact) => contact.id === selectedContactId,
  );
  const selectedYouths = dashboard.youths.filter(
    (youth) => youth.contactId === selectedContactId,
  );
  const selectedYouth =
    selectedYouths.find((youth) => youth.id === selectedYouthId) ||
    selectedYouths[0];
  const selectedYouthTimeline = selectedYouth
    ? timeline.filter(
        (item) =>
          item.youthId === selectedYouth.id ||
          (item.type === "message" && item.body.includes(selectedYouth.name)),
      )
    : [];
  const dueContacts = useMemo(() => {
    return dashboard.contacts.filter(
      (contact) =>
        contact.status !== "paused" &&
        new Date(contact.nextDueAt).getTime() <= nowMs,
    );
  }, [dashboard.contacts, nowMs]);
  const unresponsiveContacts = useMemo(
    () =>
      dashboard.contacts
        .filter((contact) =>
          isContactUnresponsive(
            contact,
            dashboard.messages,
            dashboard.settings.noResponseFollowupDays,
            nowMs,
          ),
        )
        .sort(
          (a, b) =>
            new Date(a.lastContactedAt || 0).getTime() -
            new Date(b.lastContactedAt || 0).getTime(),
        ),
    [
      dashboard.contacts,
      dashboard.messages,
      dashboard.settings.noResponseFollowupDays,
      nowMs,
    ],
  );
  const staleYouths = useMemo(
    () =>
      dashboard.youths
        .filter((youth) =>
          isYouthStale(youth, dashboard.settings.staleYouthDays, nowMs),
        )
        .sort(
          (a, b) =>
            lastYouthUpdateMs(a) - lastYouthUpdateMs(b),
        ),
    [dashboard.youths, dashboard.settings.staleYouthDays, nowMs],
  );

  const loadTimeline = useCallback(async (contactId: string) => {
    const data = await fetchJson<{ timeline: ContactTimelineItem[] }>(
      `/api/contact-timeline?contactId=${encodeURIComponent(contactId)}`,
    );
    setTimeline(data.timeline);
  }, []);

  function selectContact(contactId: string) {
    setSelectedContactId(contactId);
    const firstYouth = dashboard.youths.find(
      (youth) => youth.contactId === contactId,
    );
    setSelectedYouthId(firstYouth?.id || "");
    void loadTimeline(contactId);
  }

  async function toggleBot() {
    setBusy("toggle");
    await postJson("/api/bot/status", {
      isEnabled: !dashboard.settings.isEnabled,
    });
    await refresh();
    setBusy(null);
  }

  async function runDailyQueue() {
    setBusy("daily");
    const data = await postJson<{ reply: string }>("/api/owner-command", {
      command: "הפעל הרצה יומית",
    });
    setAssistantNotice(data.reply);
    await refresh();
    setBusy(null);
  }

  async function savePolicy() {
    setBusy("policy");
    await postJson("/api/policy", {
      ...policyDraft,
      maxAutoReplyLength: Number(policyDraft.maxAutoReplyLength),
    });
    await refresh();
    setBusy(null);
  }

  async function saveSettings() {
    setBusy("settings");
    await postJson("/api/settings", {
      ...settingsDraft,
      dailyContactLimit: 1,
      maxYouthsPerMessage: Number(settingsDraft.maxYouthsPerMessage),
      noResponseFollowupDays: Number(settingsDraft.noResponseFollowupDays),
      staleYouthDays: Number(settingsDraft.staleYouthDays),
      sendIntervalMinutes: Number(settingsDraft.sendIntervalMinutes),
    });
    await refresh();
    setBusy(null);
  }

  async function saveClientBasics() {
    setBusy("client-basics");
    await postJson("/api/settings", {
      ...settingsDraft,
      dailyContactLimit: Number(settingsDraft.dailyContactLimit),
      maxYouthsPerMessage: Number(settingsDraft.maxYouthsPerMessage),
      noResponseFollowupDays: Number(settingsDraft.noResponseFollowupDays),
      staleYouthDays: Number(settingsDraft.staleYouthDays),
      sendIntervalMinutes: Number(settingsDraft.sendIntervalMinutes),
    });
    await postJson("/api/policy", {
      ...policyDraft,
      maxAutoReplyLength: Number(policyDraft.maxAutoReplyLength),
    });
    await refresh();
    setAssistantNotice("ההגדרה הבסיסית נשמרה.");
    setBusy(null);
  }

  async function startConversationNow(contactId: string) {
    const contact = dashboard.contacts.find((item) => item.id === contactId);
    if (!contact) {
      return;
    }

    setBusy("start-conversation");
    const data = await postJson<{ reply: string }>("/api/owner-command", {
      command: `התחל שיחה עם ${contact.name}`,
    });
    setAssistantNotice(data.reply);
    await refresh();
    setBusy(null);
  }

  async function saveContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("contact");
    const data = await postJson<{ contact: Contact }>("/api/contacts", {
      ...contactForm,
      nextDueAt: contactForm.nextDueAt
        ? new Date(contactForm.nextDueAt).toISOString()
        : new Date().toISOString(),
      warmthScore: Number(contactForm.warmthScore),
    });
    setSelectedContactId(data.contact.id);
    setContactForm(emptyContactForm);
    await refresh();
    await loadTimeline(data.contact.id);
    setBusy(null);
  }

  async function removeContact(id: string) {
    setBusy(id);
    await fetch(`/api/contacts?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (selectedContactId === id) {
      setSelectedContactId("");
      setSelectedYouthId("");
      setTimeline([]);
    }
    await refresh();
    setBusy(null);
  }

  async function saveYouth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("youth");
    const data = await postJson<{ youth: Youth }>("/api/youths", {
      ...youthForm,
      milestones: splitLines(youthForm.milestones),
    });
    setSelectedContactId(data.youth.contactId);
    setSelectedYouthId(data.youth.id);
    setYouthForm({
      ...emptyYouthForm,
      contactId: data.youth.contactId || dashboard.contacts[0]?.id || "",
    });
    await refresh();
    await loadTimeline(data.youth.contactId);
    setBusy(null);
  }

  async function removeYouth(id: string) {
    setBusy(id);
    await fetch(`/api/youths?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (selectedYouthId === id) {
      setSelectedYouthId("");
    }
    await refresh();
    setBusy(null);
  }

  async function reviewAction(
    id: string,
    action: "send" | "reject" | "edit" | "schedule",
    scheduledFor?: string,
  ) {
    setBusy(id);
    await postJson("/api/reviews", {
      id,
      action,
      draftMessage: reviewDrafts[id],
      scheduledFor,
    });
    await refresh();
    setBusy(null);
  }

  async function alertAction(id: string, status: "handled" | "dismissed") {
    setBusy(id);
    await postJson("/api/alerts", { id, status });
    await refresh();
    setBusy(null);
  }

  async function importCsv() {
    setBusy("import");
    const data = await postJson<{ result: ImportResult }>("/api/import", {
      csv: csvText,
    });
    setImportResult(data.result);
    await refresh();
    setBusy(null);
  }

  async function runSearch(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    setBusy("search");
    const data = await fetchJson<{ results: SearchResult[] }>(
      `/api/search?q=${encodeURIComponent(searchQuery)}`,
    );
    setSearchResults(data.results);
    setBusy(null);
  }

  async function runSimulation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("simulate");
    const data = await postJson<{ result: SimulationResult }>("/api/simulate", {
      from: simulationFrom,
      text: simulationText,
      mediaType: "text",
    });
    setSimulation(data.result);
    setBusy(null);
  }

  async function createReport() {
    setBusy("weekly");
    const data = await postJson<{ report: WeeklyReport }>("/api/reports/weekly", {});
    setWeeklyReport(data.report);
    await refresh();
    setBusy(null);
  }

  async function sendCommand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!command.trim()) {
      return;
    }
    setBusy("command");
    const data = await postJson<{ reply: string }>("/api/owner-command", {
      command,
    });
    setCommandReply(data.reply);
    setCommand("");
    await refresh();
    setBusy(null);
  }

  return (
    <main dir="rtl" className="min-h-screen bg-[#f6f3ee] text-[#1c1b18]">
      <header className="border-b border-[#ded6c8] bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#174c3b] text-white">
              <HeartHandshake className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">מנדי בוטי</h1>
              <p className="text-sm text-[#686158]">
                דשבורד עבודה, ביקורת, קשרים, נערים וסוכן WhatsApp
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <StatusPill enabled={dashboard.settings.isEnabled} />
            <IconButton onClick={refresh} title="רענון">
              <RefreshCw className={["h-4 w-4", loading ? "animate-spin" : ""].join(" ")} />
              רענן
            </IconButton>
            <button
              onClick={toggleBot}
              disabled={busy === "toggle"}
              className={[
                "inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-bold text-white transition disabled:opacity-60",
                dashboard.settings.isEnabled
                  ? "bg-[#9b2f2f] hover:bg-[#842727]"
                  : "bg-[#1f7a5a] hover:bg-[#176246]",
              ].join(" ")}
            >
              {dashboard.settings.isEnabled ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {dashboard.settings.isEnabled ? "עצור" : "הפעל"}
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:grid-cols-[13rem_1fr]">
        <ManagerSideNav dashboard={dashboard} />

        <div className="min-w-0">
        <section id="home" className="scroll-mt-6">
          <ClientAssistantHome
            dashboard={dashboard}
            settings={settingsDraft}
            policy={policyDraft}
            dueContacts={dueContacts}
            staleYouths={staleYouths}
            unresponsiveContacts={unresponsiveContacts}
            busy={busy}
            notice={assistantNotice}
            onSettingsChange={setSettingsDraft}
            onPolicyChange={setPolicyDraft}
            onSaveBasics={saveClientBasics}
            onStartConversation={startConversationNow}
          />
        </section>

        <section id="advanced" className="mt-5 scroll-mt-6">
          <div className="rounded-lg border border-dashed border-[#d8d0c4] bg-white/70 p-4">
            <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-[#4e4841]">
              <SlidersHorizontal className="h-4 w-4" />
              אזור מתקדם
              <HelpTip text="כל מה שמתחת כאן נשאר זמין למנהל שרוצה שליטה עמוקה יותר: ביקורות, דוחות, מדיניות, פקודות, ייבוא וייצוא." />
            </div>
            <p className="mt-2 text-sm leading-6 text-[#6f675e]">
              הלקוח יכול לעבוד כמעט רק מהמסך העליון ומהוואטסאפ. הכלים המתקדמים נמצאים כאן למעקב, תיקון ידני ובדיקות.
            </p>
          </div>
        </section>

        <section id="today" className="scroll-mt-6 grid gap-4 lg:grid-cols-[1.35fr_0.9fr]">
          <Panel>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <PanelEyebrow icon={<ShieldCheck className="h-4 w-4" />}>
                  מצב מערכת
                </PanelEyebrow>
                <h2 className="mt-3 text-3xl font-bold">
                  {dashboard.settings.isEnabled ? "פעיל עם ביקורת ומדיניות" : "כבוי"}
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[#686158]">
                  {dashboard.settings.dailyContactLimit} פניות ביום · Cron {dashboard.settings.dailyCronTime} · כל {dashboard.settings.sendIntervalMinutes} דק׳ · שבת{" "}
                  {dashboard.policy.avoidShabbat ? "חסומה" : "פתוחה"} · כל תשובה{" "}
                  {dashboard.policy.requireReviewForAllReplies ? "בביקורת" : "לפי אמון"}
                </p>
              </div>
              <button
                onClick={runDailyQueue}
                disabled={busy === "daily"}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#203864] px-4 text-sm font-bold text-white transition hover:bg-[#182b4d] disabled:opacity-60"
              >
                <CalendarDays className="h-4 w-4" />
                פתח תור יומי
                <HelpTip text="מפעיל עכשיו את אותה פעולה שה־Cron היומי עושה: הכנת פנייה יומית, שליחה מותרת ודוח מנהל." light />
              </button>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-4">
              <ControlMetric label="מגיעים לתור" value={dueContacts.length} icon={<Users className="h-4 w-4" />} />
              <ControlMetric label="חלון שליחה" value={`${dashboard.settings.sendWindowStart}-${dashboard.settings.sendWindowEnd}`} icon={<PauseCircle className="h-4 w-4" />} />
              <ControlMetric label="תאריכים חסומים" value={dashboard.policy.blockedDates.length} icon={<Ban className="h-4 w-4" />} />
              <ControlMetric label="מענה אישי" value={dashboard.stats.openOwnerAlerts} icon={<BellRing className="h-4 w-4" />} />
            </div>
          </Panel>
          <IntegrationPanel health={dashboard.health} />
        </section>

        <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
          <StatCard label="אנשי קשר" value={dashboard.stats.activeContacts} icon={<Phone className="h-5 w-5" />} tone="green" />
          <StatCard label="נערים" value={dashboard.stats.trackedYouths} icon={<Users className="h-5 w-5" />} tone="blue" />
          <StatCard label="ביקורות" value={dashboard.stats.pendingReviews} icon={<ClipboardCheck className="h-5 w-5" />} tone="amber" />
          <StatCard label="ישנים" value={dashboard.stats.staleContacts} icon={<AlertCircle className="h-5 w-5" />} tone="rose" />
          <StatCard label="לא מגיבים" value={dashboard.stats.unresponsiveContacts} icon={<MessageCircle className="h-5 w-5" />} tone="rose" />
          <StatCard label="נערים בלי עדכון" value={dashboard.stats.staleYouths} icon={<Users className="h-5 w-5" />} tone="amber" />
          <StatCard label="שיעור שליחה" value={dashboard.stats.responseRate} suffix="%" icon={<Activity className="h-5 w-5" />} tone="green" />
        </section>

        <section id="command" className="mt-5 scroll-mt-6">
          <ManagementCommandCenter
            dashboard={dashboard}
            dueContacts={dueContacts}
            unresponsiveContacts={unresponsiveContacts}
            staleYouths={staleYouths}
            nowMs={nowMs}
            onSelectContact={selectContact}
            onSelectYouth={setSelectedYouthId}
          />
        </section>

        <section id="work" className="mt-5 scroll-mt-6">
          <ProfessionalOpsCenter
            dashboard={dashboard}
            dueContacts={dueContacts}
            unresponsiveContacts={unresponsiveContacts}
            staleYouths={staleYouths}
            selectedContact={selectedContact}
            selectedYouth={selectedYouth}
            selectedYouthTimeline={selectedYouthTimeline}
            reviewDrafts={reviewDrafts}
            busy={busy}
            nowMs={nowMs}
            onReviewAction={reviewAction}
            onAlertAction={alertAction}
            onSelectContact={selectContact}
            onSelectYouth={setSelectedYouthId}
            onSetReviewDraft={(id, value) =>
              setReviewDrafts((drafts) => ({ ...drafts, [id]: value }))
            }
          />
        </section>

        <section id="contacts" className="mt-5 scroll-mt-6">
          <RelationshipWorkspace
            contacts={dashboard.contacts}
            youths={dashboard.youths}
            selectedContact={selectedContact}
            selectedContactId={selectedContactId}
            selectedYouth={selectedYouth}
            selectedYouthId={selectedYouth?.id || selectedYouthId}
            timeline={timeline}
            selectedYouthTimeline={selectedYouthTimeline}
            onSelectContact={selectContact}
            onSelectYouth={setSelectedYouthId}
            onRefreshTimeline={() => selectedContactId && loadTimeline(selectedContactId)}
            onEditContact={(contact) => setContactForm(contactToForm(contact))}
            onEditYouth={(youth) => setYouthForm(youthToForm(youth))}
          />
        </section>

        <section id="settings" className="mt-5 scroll-mt-6 grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
          <ManagerSettingsPanel
            settings={settingsDraft}
            busy={busy === "settings"}
            onChange={setSettingsDraft}
            onSave={saveSettings}
          />
          <FollowupIntelligencePanel
            contacts={dashboard.contacts}
            messages={dashboard.messages}
            settings={dashboard.settings}
            unresponsiveContacts={unresponsiveContacts}
            staleYouths={staleYouths}
            nowMs={nowMs}
            onSelectContact={selectContact}
            onSelectYouth={setSelectedYouthId}
          />
        </section>

        <section id="command-routes" className="mt-5 scroll-mt-6">
          <WhatsappCommandRouterPanel
            settings={settingsDraft}
            busy={busy === "settings"}
            onChange={setSettingsDraft}
            onSave={saveSettings}
          />
        </section>

        <section id="reviews" className="mt-5 scroll-mt-6 grid gap-5 xl:grid-cols-[1.2fr_1fr]">
          <ReviewQueue
            reviews={dashboard.reviews}
            busy={busy}
            reviewDrafts={reviewDrafts}
            setReviewDrafts={setReviewDrafts}
            onAction={reviewAction}
          />
          <OwnerAlertsPanel alerts={dashboard.alerts} busy={busy} onAction={alertAction} />
        </section>

        <section className="mt-5 scroll-mt-6 grid gap-5 xl:grid-cols-[1fr_1fr]">
          <ContactManager
            contacts={dashboard.contacts}
            form={contactForm}
            busy={busy}
            selectedContactId={selectedContactId}
            onFormChange={setContactForm}
            onSubmit={saveContact}
            onEdit={(contact) => setContactForm(contactToForm(contact))}
            onDelete={removeContact}
            onSelect={selectContact}
          />
          <YouthManager
            contacts={dashboard.contacts}
            youths={dashboard.youths}
            form={youthForm}
            busy={busy}
            selectedContactId={selectedContactId}
            selectedYouthId={selectedYouth?.id || selectedYouthId}
            onFormChange={setYouthForm}
            onSubmit={saveYouth}
            onEdit={(youth) => setYouthForm(youthToForm(youth))}
            onDelete={removeYouth}
            onSelect={setSelectedYouthId}
          />
        </section>

        <section id="reports" className="mt-5 scroll-mt-6">
          <ReportsCommandCenter
            dashboard={dashboard}
            weeklyReport={weeklyReport}
            nowMs={nowMs}
          />
        </section>

        <section className="mt-5 grid gap-5 xl:grid-cols-[1fr_1fr]">
          <ContactDetail
            contact={selectedContact}
            youths={selectedYouths}
            timeline={timeline}
            onLoadTimeline={() => selectedContactId && loadTimeline(selectedContactId)}
          />
          <ToolsPanel
            csvText={csvText}
            setCsvText={setCsvText}
            importResult={importResult}
            busy={busy}
            onImport={importCsv}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            searchResults={searchResults}
            onSearch={runSearch}
            simulationText={simulationText}
            setSimulationText={setSimulationText}
            simulationFrom={simulationFrom}
            setSimulationFrom={setSimulationFrom}
            simulation={simulation}
            onSimulate={runSimulation}
            weeklyReport={weeklyReport}
            onWeeklyReport={createReport}
          />
        </section>

        <section id="policy" className="mt-5 scroll-mt-6">
          <PolicyPanel
            policy={policyDraft}
            busy={busy === "policy"}
            onChange={setPolicyDraft}
            onSave={savePolicy}
          />
        </section>

        <section id="whatsapp" className="mt-5 scroll-mt-6 grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
          <CommandPanel
            command={command}
            commandReply={commandReply}
            busy={busy}
            onCommandChange={setCommand}
            onSubmit={sendCommand}
          />
          <ReportPanel reports={dashboard.reports} />
        </section>
        </div>
      </div>
    </main>
  );
}

function StatusPill({ enabled }: { enabled: boolean }) {
  return (
    <span
      className={[
        "inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-bold",
        enabled ? "bg-[#e2f4e9] text-[#15583f]" : "bg-[#f6e1df] text-[#8a2929]",
      ].join(" ")}
    >
      {enabled ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
      {enabled ? "פעיל" : "כבוי"}
    </span>
  );
}

function Panel({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-[#ded6c8] bg-white p-5 shadow-sm">
      {children}
    </div>
  );
}

function PanelEyebrow({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-sm font-bold text-[#174c3b]">
      {icon}
      {children}
    </div>
  );
}

function IconButton({
  children,
  onClick,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#d8d0c4] bg-white px-3 text-sm font-medium transition hover:bg-[#f2ede5]"
    >
      {children}
    </button>
  );
}

function ControlMetric({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-[#e5ded2] bg-[#fbfaf7] p-3">
      <div className="flex items-center gap-2 text-xs font-bold text-[#6f675e]">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-lg font-bold">{value}</div>
    </div>
  );
}

function SimpleMetric({
  label,
  value,
  help,
}: {
  label: string;
  value: string | number;
  help: string;
}) {
  return (
    <div className="rounded-lg border border-[#e5ded2] bg-[#fbfaf7] p-3">
      <div className="flex items-center gap-2 text-xs font-bold text-[#6f675e]">
        {label}
        <HelpTip text={help} />
      </div>
      <div className="mt-2 text-xl font-bold">{value}</div>
    </div>
  );
}

function PriorityLine({
  title,
  value,
  help,
}: {
  title: string;
  value: number;
  help: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-[#e5ded2] bg-[#fbfaf7] p-3">
      <div className="flex items-center gap-2 text-sm font-bold">
        {title}
        <HelpTip text={help} />
      </div>
      <Badge tone={value ? "amber" : "neutral"}>{value}</Badge>
    </div>
  );
}

function ManagerSideNav({ dashboard }: { dashboard: DashboardData }) {
  const pending = dashboard.reviews.filter((review) => review.status === "pending").length;
  const alerts = dashboard.alerts.filter((alert) => alert.status === "open").length;
  const navItems = [
    { href: "#home", label: "בית", icon: <HeartHandshake className="h-4 w-4" />, count: null },
    { href: "#today", label: "היום", icon: <Activity className="h-4 w-4" />, count: dashboard.stats.dueContacts },
    { href: "#contacts", label: "קשרים", icon: <Users className="h-4 w-4" />, count: dashboard.contacts.length },
    { href: "#reports", label: "דוחות", icon: <FileText className="h-4 w-4" />, count: dashboard.reports.length },
    { href: "#settings", label: "הגדרות", icon: <Settings className="h-4 w-4" />, count: null },
    { href: "#advanced", label: "מתקדם", icon: <Database className="h-4 w-4" />, count: pending + alerts },
    { href: "#reviews", label: "אישורים", icon: <Send className="h-4 w-4" />, count: pending },
    { href: "#command-routes", label: "פקודות", icon: <SlidersHorizontal className="h-4 w-4" />, count: dashboard.settings.ownerCommandRoutes.length },
    { href: "#whatsapp", label: "וואטסאפ", icon: <MessageCircle className="h-4 w-4" />, count: null },
  ];

  return (
    <aside className="hidden lg:block">
      <nav className="sticky top-4 rounded-lg border border-[#ded6c8] bg-white p-3 shadow-sm">
        <div className="px-2 pb-3 text-xs font-bold text-[#6f675e]">
          ניווט מנהל
        </div>
        <div className="grid gap-1">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="flex h-10 items-center justify-between gap-2 rounded-lg px-2 text-sm font-bold text-[#4e4841] transition hover:bg-[#f6f3ee]"
            >
              <span className="flex min-w-0 items-center gap-2">
                {item.icon}
                <span className="truncate">{item.label}</span>
              </span>
              {item.count === null ? null : (
                <span className="rounded-md bg-[#f2ede5] px-2 py-1 text-xs text-[#686158]">
                  {item.count}
                </span>
              )}
            </a>
          ))}
        </div>
      </nav>
    </aside>
  );
}

function ClientAssistantHome({
  dashboard,
  settings,
  policy,
  dueContacts,
  staleYouths,
  unresponsiveContacts,
  busy,
  notice,
  onSettingsChange,
  onPolicyChange,
  onSaveBasics,
  onStartConversation,
}: {
  dashboard: DashboardData;
  settings: BotSettings;
  policy: BotPolicy;
  dueContacts: Contact[];
  staleYouths: Youth[];
  unresponsiveContacts: Contact[];
  busy: string | null;
  notice: string;
  onSettingsChange: (settings: BotSettings) => void;
  onPolicyChange: (policy: BotPolicy) => void;
  onSaveBasics: () => void;
  onStartConversation: (contactId: string) => void;
}) {
  const defaultContactId = dueContacts[0]?.id || dashboard.contacts[0]?.id || "";
  const [contactId, setContactId] = useState(defaultContactId);
  const selectedContact =
    dashboard.contacts.find((contact) => contact.id === contactId) ||
    dueContacts[0] ||
    dashboard.contacts[0];
  const selectedYouths = selectedContact
    ? dashboard.youths.filter((youth) => youth.contactId === selectedContact.id)
    : [];
  const inboundToday = dashboard.messages.filter(
    (message) =>
      message.direction === "inbound" &&
      isSameDay(message.createdAt, new Date().toISOString()),
  ).length;
  const mitzvahUpdatesThisMonth =
    dashboard.stats.britMilestonesThisMonth +
    dashboard.stats.tefillinMilestonesThisMonth;

  return (
    <div className="grid gap-5">
      <Panel>
        <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <PanelEyebrow icon={<HeartHandshake className="h-4 w-4" />}>
              המזכיר האישי של הוואטסאפ
            </PanelEyebrow>
            <h2 className="mt-3 max-w-3xl text-3xl font-bold leading-tight">
              כל יום המערכת פונה לאיש קשר אחד, מבינה את התשובות ומעדכנת את המעקב.
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-[#6f675e]">
              זה המסך שהלקוח אמור לחיות בו. כל השאר נשאר למטה למקרים שצריך בקרה, תיקון או הגדרה מתקדמת.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-4">
              <SimpleMetric label="איש קשר היום" value={dueContacts[0]?.name || "אין בתור"} help="זה האיש שהמערכת תנסה לפנות אליו בהרצה היומית הקרובה." />
              <SimpleMetric label="תשובות היום" value={inboundToday} help="כמה הודעות נכנסות התקבלו היום מאנשי קשר שמופיעים במערכת." />
              <SimpleMetric label="דורשים יחס" value={dashboard.stats.openOwnerAlerts} help="שיחות שהמערכת החליטה שלא נכון לענות עליהן לבד וצריך שהמנהל יראה." />
              <SimpleMetric label="מצוות החודש" value={mitzvahUpdatesThisMonth} help="עדכוני ברית ותפילין שנשמרו החודש מתוך תשובות אנשי הקשר." />
            </div>
          </div>

          <div className="rounded-lg border border-[#e5ded2] bg-[#fbfaf7] p-4">
            <div className="flex items-center gap-2 text-sm font-bold">
              פעולה מהירה
              <HelpTip text="כאן המנהל יכול להתחיל שיחה מיד עם איש קשר, בלי לחכות להרצה היומית של מחר." />
            </div>
            <label className="mt-3 block">
              <span className="flex items-center gap-2 text-xs font-bold text-[#6f675e]">
                עם מי להתחיל שיחה
                <HelpTip text="בחר איש קשר קיים. המערכת תנסח הודעת פתיחה לפי הנערים שלו והנתונים שחסרים." />
              </span>
              <select
                value={selectedContact?.id || ""}
                onChange={(event) => setContactId(event.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-[#d8d0c4] bg-white px-3 text-sm outline-none focus:border-[#1f7a5a]"
              >
                {dashboard.contacts.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.name} · {dashboard.youths.filter((youth) => youth.contactId === contact.id).length} נערים
                  </option>
                ))}
              </select>
            </label>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <Mini label="נערים אצל איש הקשר" value={String(selectedYouths.length)} />
              <Mini label="מותר אוטומטי" value={selectedContact?.allowAutoSend ? "כן" : "ידני"} />
            </div>
            <div className="mt-4">
              <ActionButton
                busy={busy === "start-conversation"}
                tone="green"
                onClick={() => selectedContact && onStartConversation(selectedContact.id)}
                icon={<Send className="h-4 w-4" />}
                help="שולח עכשיו הודעת פתיחה אם מותר לשלוח לפי שבת, חג ושעות השליחה. אם אסור, נוצרת טיוטה לביקורת."
              >
                התחל שיחה עכשיו
              </ActionButton>
            </div>
            {notice ? (
              <div className="mt-3 rounded-lg border border-[#d8d0c4] bg-white p-3 text-sm leading-6 text-[#4e4841]">
                {notice}
              </div>
            ) : null}
          </div>
        </div>
      </Panel>

      <div className="grid gap-5 xl:grid-cols-[1fr_0.9fr]">
        <Panel>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <PanelEyebrow icon={<Settings className="h-4 w-4" />}>
              הגדרה בסיסית ללקוח
            </PanelEyebrow>
            <ActionButton
              busy={busy === "client-basics"}
              tone="blue"
              onClick={onSaveBasics}
              icon={<Save className="h-4 w-4" />}
              help="שומר את הפרטים שהבוט צריך כדי לכתוב כמו המנהל ולעבוד לפי קצב פשוט."
            >
              שמור הגדרה
            </ActionButton>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <TextInput
              label="שם הפרויקט"
              value={settings.projectName}
              onChange={(value) => onSettingsChange({ ...settings, projectName: value })}
              help="השם שיופיע בהקשר של השאלות, למשל מעקב נערים או פרויקט שליחות."
            />
            <TextInput
              label="איך קוראים למנהל"
              value={settings.managerDisplayName}
              onChange={(value) =>
                onSettingsChange({ ...settings, managerDisplayName: value })
              }
              help="שם פרטי או כינוי שההודעה יכולה להסתיים בו כדי להישמע אישית."
            />
            <NumberInput
              label="כמה אנשי קשר ביום"
              value={1}
              min={1}
              max={1}
              onChange={() => onSettingsChange({ ...settings, dailyContactLimit: 1 })}
              help="ברירת המחדל המומלצת היא 1 כדי לשמור על וואטסאפ רגוע. המנהל יכול להתחיל עוד שיחות ידנית."
            />
            <TextInput
              label="שעות שמותר לשלוח"
              value={`${settings.sendWindowStart}-${settings.sendWindowEnd}`}
              onChange={(value) => {
                const [start, end] = value.split("-").map((part) => part.trim());
                onSettingsChange({
                  ...settings,
                  sendWindowStart: start || settings.sendWindowStart,
                  sendWindowEnd: end || settings.sendWindowEnd,
                });
              }}
              help="טווח השעות שבו מותר למערכת לשלוח הודעות יזומות. למשל 09:30-20:30."
            />
            <TextareaInput
              label="מה חשוב לשאול"
              value={settings.followupQuestionGuide}
              onChange={(value) =>
                onSettingsChange({ ...settings, followupQuestionGuide: value })
              }
              rows={3}
              wide
              help="כאן הלקוח כותב במילים פשוטות איזה עדכונים חשוב לו לקבל: ברית, תפילין, שבת, שיעור, חתונה וכו׳."
            />
            <TextareaInput
              label="איך המערכת צריכה להזדהות"
              value={policy.botIdentity}
              onChange={(value) => onPolicyChange({ ...policy, botIdentity: value })}
              rows={3}
              wide
              help="הסבר פנימי לבוט: בשם מי הוא כותב, איזה סגנון לשמור, ומה אסור לחשוף לאנשי הקשר."
            />
          </div>
        </Panel>

        <Panel>
          <PanelEyebrow icon={<ClipboardCheck className="h-4 w-4" />}>
            מה דורש תשומת לב
          </PanelEyebrow>
          <div className="mt-4 grid gap-3">
            <PriorityLine
              title="לא ענו אחרי פנייה"
              value={unresponsiveContacts.length}
              help="אנשי קשר שקיבלו הודעה ולא חזרו בזמן שהוגדר."
            />
            <PriorityLine
              title="נערים בלי עדכון"
              value={staleYouths.length}
              help="נערים שלא קיבלו עדכון חדש מספיק זמן."
            />
            <PriorityLine
              title="טיוטות שממתינות"
              value={dashboard.stats.pendingReviews}
              help="הודעות שהמערכת הכינה אבל עדיין לא נשלחו או אושרו."
            />
          </div>
          <div className="mt-4 rounded-lg border border-[#e5ded2] bg-[#fbfaf7] p-3 text-sm leading-6 text-[#6f675e]">
            דרך וואטסאפ המנהל יכול לשאול: כמה נערים יש לחיים, מי עשה ברית החודש, מי לא ענה השבוע, או לכתוב: התחל שיחה עם חיים.
          </div>
        </Panel>
      </div>
    </div>
  );
}

function ReportsCommandCenter({
  dashboard,
  weeklyReport,
  nowMs,
}: {
  dashboard: DashboardData;
  weeklyReport: WeeklyReport | null;
  nowMs: number;
}) {
  const dailyOutbound = dashboard.messages.filter(
    (message) =>
      message.direction === "outbound" &&
      message.channel === "whatsapp" &&
      isToday(message.createdAt, nowMs),
  ).length;
  const dailyInbound = dashboard.messages.filter(
    (message) =>
      message.direction === "inbound" &&
      message.channel === "whatsapp" &&
      isToday(message.createdAt, nowMs),
  ).length;
  const weeklyMessages = dashboard.messages.filter((message) =>
    isWithinDays(message.createdAt, nowMs, 7),
  ).length;
  const monthlyYouthUpdates = dashboard.youths.filter((youth) =>
    isWithinDays(youth.lastUpdateAt || youth.updatedAt || youth.createdAt, nowMs, 30),
  ).length;
  const openAlerts = dashboard.alerts.filter((alert) => alert.status === "open").length;
  const pendingReviews = dashboard.reviews.filter((review) => review.status === "pending").length;

  return (
    <Panel>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <PanelEyebrow icon={<FileText className="h-4 w-4" />}>
            מרכז דוחות
          </PanelEyebrow>
          <h2 className="mt-2 text-2xl font-bold">תמונת מנהל מסודרת</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone={pendingReviews ? "amber" : "neutral"}>{pendingReviews} אישורים</Badge>
          <Badge tone={openAlerts ? "rose" : "neutral"}>{openAlerts} אישי</Badge>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <ReportTile title="היום" primary={`${dailyOutbound} נשלחו`} secondary={`${dailyInbound} נכנסו`} />
        <ReportTile title="השבוע" primary={`${weeklyMessages} הודעות`} secondary={`${dashboard.reports.length} דוחות`} />
        <ReportTile title="החודש" primary={`${monthlyYouthUpdates} עדכוני נערים`} secondary={`${dashboard.youths.length} במעקב`} />
        <ReportTile title="איכות נתונים" primary={`${dataQualityScore(dashboard)}%`} secondary="שלמות קשרים ונערים" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1fr]">
        <div className="rounded-lg border border-[#e5ded2] bg-[#fbfaf7] p-4">
          <div className="text-sm font-bold">דוח אחרון</div>
          <p className="mt-2 whitespace-pre-line text-sm leading-6 text-[#4e4841]">
            {weeklyReport?.body || dashboard.reports[0]?.body || "אין עדיין דוח להצגה."}
          </p>
        </div>
        <div className="rounded-lg border border-[#e5ded2] bg-[#fbfaf7] p-4">
          <div className="text-sm font-bold">דוחות מהירים בוואטסאפ</div>
          <div className="mt-3 grid gap-2 text-sm leading-6 text-[#4e4841]">
            <div>דוח - סיכום מצב מיידי</div>
            <div>היום - משימות ותור</div>
            <div>טיוטות - אישורים פתוחים</div>
            <div>מי לא מגיב - רשימת קשרים שדורשים טיפול</div>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function ReportTile({
  title,
  primary,
  secondary,
}: {
  title: string;
  primary: string;
  secondary: string;
}) {
  return (
    <div className="rounded-lg border border-[#e5ded2] bg-[#fbfaf7] p-4">
      <div className="text-xs font-bold text-[#6f675e]">{title}</div>
      <div className="mt-2 text-xl font-bold">{primary}</div>
      <div className="mt-1 text-sm text-[#686158]">{secondary}</div>
    </div>
  );
}

function IntegrationPanel({ health }: { health: IntegrationHealth }) {
  return (
    <Panel>
      <PanelEyebrow icon={<Activity className="h-4 w-4" />}>חיבורים</PanelEyebrow>
      <div className="mt-4 grid gap-3">
        <HealthRow icon={<Database className="h-4 w-4" />} label="Supabase" value={health.supabase} />
        <HealthRow icon={<Brain className="h-4 w-4" />} label="OpenAI" value={health.openai} />
        <HealthRow icon={<MessageCircle className="h-4 w-4" />} label="GNAPI" value={health.gnapi} />
      </div>
      {health.lastError ? (
        <div className="mt-4 rounded-lg border border-[#e6b8a2] bg-[#fff3ed] p-3 text-xs leading-5 text-[#8a3b1f]">
          {health.lastError}
        </div>
      ) : null}
    </Panel>
  );
}

function HealthRow({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: "mock" | "configured" | "error";
}) {
  const classes =
    value === "configured"
      ? "bg-[#e2f4e9] text-[#15583f]"
      : value === "error"
        ? "bg-[#f6e1df] text-[#8a2929]"
        : "bg-[#eee7dc] text-[#6f675e]";
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-[#e5ded2] bg-[#fbfaf7] px-3 py-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        {icon}
        {label}
      </div>
      <span className={`rounded-md px-2 py-1 text-xs font-bold ${classes}`}>
        {value === "configured" ? "מחובר" : value === "error" ? "שגיאה" : "דמו"}
      </span>
    </div>
  );
}

function StatCard({
  label,
  value,
  suffix = "",
  icon,
  tone,
}: {
  label: string;
  value: number;
  suffix?: string;
  icon: ReactNode;
  tone: "green" | "blue" | "amber" | "rose";
}) {
  const tones = {
    green: "bg-[#e2f4e9] text-[#15583f]",
    blue: "bg-[#e3edf9] text-[#203864]",
    amber: "bg-[#f7ecd2] text-[#7a5315]",
    rose: "bg-[#f6e1df] text-[#8a2929]",
  };
  return (
    <div className="rounded-lg border border-[#ded6c8] bg-white p-4 shadow-sm">
      <div className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${tones[tone]}`}>
        {icon}
      </div>
      <div className="mt-4 text-3xl font-bold">
        {value}
        {suffix}
      </div>
      <div className="mt-1 text-sm font-medium text-[#686158]">{label}</div>
    </div>
  );
}

function ManagementCommandCenter({
  dashboard,
  dueContacts,
  unresponsiveContacts,
  staleYouths,
  nowMs,
  onSelectContact,
  onSelectYouth,
}: {
  dashboard: DashboardData;
  dueContacts: Contact[];
  unresponsiveContacts: Contact[];
  staleYouths: Youth[];
  nowMs: number;
  onSelectContact: (id: string) => void;
  onSelectYouth: (id: string) => void;
}) {
  const activeContacts = dashboard.contacts.filter(
    (contact) => contact.status === "active",
  ).length;
  const attentionContacts = dashboard.contacts.filter(
    (contact) => contact.status === "needs_attention",
  );
  const pausedContacts = dashboard.contacts.filter(
    (contact) => contact.status === "paused",
  ).length;
  const autoAllowed = dashboard.contacts.filter(
    (contact) => contact.allowAutoSend && contact.status === "active",
  ).length;
  const pendingReviews = dashboard.reviews.filter(
    (review) => review.status === "pending",
  );
  const sentReviews = dashboard.reviews.filter(
    (review) => review.status === "sent",
  ).length;
  const openAlerts = dashboard.alerts.filter((alert) => alert.status === "open");
  const inboundRecent = dashboard.messages.filter(
    (message) =>
      message.direction === "inbound" &&
      nowMs - new Date(message.createdAt).getTime() <= 14 * 86400000,
  ).length;
  const outboundRecent = dashboard.messages.filter(
    (message) =>
      message.direction === "outbound" &&
      nowMs - new Date(message.createdAt).getTime() <= 14 * 86400000,
  ).length;
  const workPressure =
    dueContacts.length +
    pendingReviews.length +
    openAlerts.length +
    unresponsiveContacts.length +
    staleYouths.length;
  const dailyCapacity = Math.max(1, dashboard.settings.dailyContactLimit);
  const healthScore = clampPercent(
    100 -
      pendingReviews.length * 4 -
      openAlerts.length * 9 -
      unresponsiveContacts.length * 6 -
      staleYouths.length * 2 -
      (dashboard.settings.isEnabled ? 0 : 25),
  );
  const stageRows = youthStageRows(dashboard.youths);
  const statusRows = contactStatusRows(dashboard.contacts);
  const reviewRows = reviewStatusRows(dashboard.reviews);
  const countryRows = topCountryRows(dashboard.contacts);
  const latestMessages = dashboard.messages.slice(0, 6);

  return (
    <Panel>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <PanelEyebrow icon={<Activity className="h-4 w-4" />}>
            לוח ניהול ראשי
          </PanelEyebrow>
          <h2 className="mt-2 text-2xl font-bold">חדר מצב יומי</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[#686158]">
            תמונת עבודה מרוכזת: עומס, תגובות, נערים, ביקורות, התראות, ואיפה כדאי להתחיל.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone={healthScore >= 75 ? "neutral" : healthScore >= 45 ? "amber" : "rose"}>
            בריאות {healthScore}%
          </Badge>
          <Badge tone={workPressure > dailyCapacity * 2 ? "rose" : "amber"}>
            עומס {workPressure}
          </Badge>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <CommandMetric
          icon={<CalendarDays className="h-4 w-4" />}
          label="תור היום"
          value={`${dueContacts.length}/${dailyCapacity}`}
          detail="אנשי קשר שמגיעים למעקב"
          tone={dueContacts.length > dailyCapacity ? "rose" : "green"}
        />
        <CommandMetric
          icon={<ClipboardCheck className="h-4 w-4" />}
          label="ביקורות פתוחות"
          value={pendingReviews.length}
          detail={`${sentReviews} הודעות כבר נשלחו`}
          tone={pendingReviews.length ? "amber" : "green"}
        />
        <CommandMetric
          icon={<BellRing className="h-4 w-4" />}
          label="מענה אישי"
          value={openAlerts.length}
          detail="שיחות שלא כדאי להשאיר לבוט"
          tone={openAlerts.length ? "rose" : "green"}
        />
        <CommandMetric
          icon={<ShieldCheck className="h-4 w-4" />}
          label="אוטומציה מוכנה"
          value={autoAllowed}
          detail={`${activeContacts} פעילים, ${attentionContacts.length} לתשומת לב, ${pausedContacts} מושהים`}
          tone={autoAllowed ? "blue" : "amber"}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1fr_0.9fr]">
        <div className="rounded-lg border border-[#e5ded2] bg-[#fbfaf7] p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-bold">
              <Brain className="h-4 w-4 text-[#203864]" />
              סדר עדיפות
            </div>
            <Badge tone={workPressure > dailyCapacity ? "amber" : "neutral"}>
              קיבולת {dailyCapacity}
            </Badge>
          </div>
          <div className="mt-3 grid gap-2">
            {openAlerts.slice(0, 2).map((alert) => (
              <PriorityRow
                key={alert.id}
                icon={<BellRing className="h-4 w-4" />}
                title={alert.contactName}
                detail={alert.reason}
                badge="מענה אישי"
                tone="rose"
                onClick={() => alert.contactId && onSelectContact(alert.contactId)}
              />
            ))}
            {unresponsiveContacts.slice(0, 2).map((contact) => (
              <PriorityRow
                key={contact.id}
                icon={<MessageCircle className="h-4 w-4" />}
                title={contact.name}
                detail={`אין תגובה ${daysSince(contact.lastContactedAt, nowMs)} ימים`}
                badge="לא מגיב"
                tone="rose"
                onClick={() => onSelectContact(contact.id)}
              />
            ))}
            {staleYouths.slice(0, 2).map((youth) => {
              const contact = dashboard.contacts.find(
                (item) => item.id === youth.contactId,
              );
              return (
                <PriorityRow
                  key={youth.id}
                  icon={<Users className="h-4 w-4" />}
                  title={youth.name}
                  detail={`${contact?.name || "ללא איש קשר"} · ${youth.nextAction || "אין פעולה הבאה"}`}
                  badge="נער ישן"
                  tone="amber"
                  onClick={() => {
                    onSelectContact(youth.contactId);
                    onSelectYouth(youth.id);
                  }}
                />
              );
            })}
            {!openAlerts.length && !unresponsiveContacts.length && !staleYouths.length ? (
              <EmptyState text="אין כרגע צוואר בקבוק משמעותי. אפשר לעבוד לפי התור היומי." />
            ) : null}
          </div>
        </div>

        <div className="rounded-lg border border-[#e5ded2] bg-[#fbfaf7] p-4">
          <div className="flex items-center gap-2 text-sm font-bold">
            <FileText className="h-4 w-4 text-[#174c3b]" />
            מדדי עבודה
          </div>
          <div className="mt-3 grid gap-3">
            <ProgressRow
              label="ניצול תור יומי"
              value={percent(dueContacts.length, dailyCapacity)}
              caption={`${dueContacts.length} מתוך ${dailyCapacity}`}
              tone={dueContacts.length > dailyCapacity ? "rose" : "green"}
            />
            <ProgressRow
              label="תגובה מול שליחה ב-14 יום"
              value={percent(inboundRecent, Math.max(1, outboundRecent))}
              caption={`${inboundRecent} נכנסות / ${outboundRecent} יוצאות`}
              tone={inboundRecent >= outboundRecent ? "green" : "amber"}
            />
            <ProgressRow
              label="בריאות תפעולית"
              value={healthScore}
              caption="מבוסס על ביקורות, התראות וחוסר תגובה"
              tone={healthScore >= 75 ? "green" : healthScore >= 45 ? "amber" : "rose"}
            />
          </div>
        </div>

        <div className="rounded-lg border border-[#e5ded2] bg-[#fbfaf7] p-4">
          <div className="flex items-center gap-2 text-sm font-bold">
            <Database className="h-4 w-4 text-[#203864]" />
            מצב נתונים
          </div>
          <div className="mt-3 grid gap-2">
            <Mini label="הודעות במעקב" value={String(dashboard.messages.length)} />
            <Mini label="דוחות מנהל" value={String(dashboard.reports.length)} />
            <Mini label="מדינות/אזורים" value={String(countryRows.length)} />
          </div>
          <div className="mt-3 grid gap-2">
            {countryRows.map((row) => (
              <DistributionRow key={row.label} {...row} />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-4">
        <DistributionPanel title="שלבי נערים" rows={stageRows} />
        <DistributionPanel title="סטטוס אנשי קשר" rows={statusRows} />
        <DistributionPanel title="ביקורות" rows={reviewRows} />
        <div className="rounded-lg border border-[#e5ded2] bg-[#fbfaf7] p-4">
          <div className="flex items-center gap-2 text-sm font-bold">
            <MessageCircle className="h-4 w-4 text-[#174c3b]" />
            דופק אחרון
          </div>
          <div className="mt-3 grid gap-2">
            {latestMessages.length ? (
              latestMessages.map((message) => (
                <div key={message.id} className="rounded-lg border border-[#e5ded2] bg-white p-3">
                  <div className="flex items-center justify-between gap-2">
                    <Badge tone={message.direction === "inbound" ? "amber" : "neutral"}>
                      {message.direction === "inbound" ? "נכנסת" : "יוצאת"}
                    </Badge>
                    <span className="text-xs text-[#686158]">
                      {formatDateTime(message.createdAt)}
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-[#4e4841]">
                    {message.aiSummary || message.body}
                  </p>
                </div>
              ))
            ) : (
              <EmptyState text="אין עדיין הודעות להצגה." />
            )}
          </div>
        </div>
      </div>
    </Panel>
  );
}

function CommandMetric({
  icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
  detail: string;
  tone: "green" | "blue" | "amber" | "rose";
}) {
  const classes = {
    green: "border-[#c9e4d3] bg-[#f4fbf7] text-[#15583f]",
    blue: "border-[#cbd8ee] bg-[#f5f8fd] text-[#203864]",
    amber: "border-[#ecd6a8] bg-[#fffaf0] text-[#7a5315]",
    rose: "border-[#e9c4c1] bg-[#fff7f6] text-[#8a2929]",
  };
  return (
    <div className={`rounded-lg border p-4 ${classes[tone]}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/80">
          {icon}
        </div>
        <div className="text-2xl font-bold">{value}</div>
      </div>
      <div className="mt-3 text-sm font-bold">{label}</div>
      <div className="mt-1 text-xs leading-5 opacity-80">{detail}</div>
    </div>
  );
}

function PriorityRow({
  icon,
  title,
  detail,
  badge,
  tone,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
  badge: string;
  tone: "amber" | "rose";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-[#e5ded2] bg-white p-3 text-right transition hover:border-[#cfc3b1]"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#eef3fb] text-[#203864]">
            {icon}
          </span>
          <span className="truncate font-bold">{title}</span>
        </div>
        <Badge tone={tone}>{badge}</Badge>
      </div>
      <div className="mt-2 line-clamp-2 text-xs leading-5 text-[#686158]">
        {detail}
      </div>
    </button>
  );
}

function ProgressRow({
  label,
  value,
  caption,
  tone,
}: {
  label: string;
  value: number;
  caption: string;
  tone: "green" | "amber" | "rose";
}) {
  const colors = {
    green: "bg-[#1f7a5a]",
    amber: "bg-[#b7791f]",
    rose: "bg-[#9b2f2f]",
  };
  return (
    <div>
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="font-bold">{label}</span>
        <span className="text-[#686158]">{value}%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#e5ded2]">
        <div className={`h-full rounded-full ${colors[tone]}`} style={{ width: `${value}%` }} />
      </div>
      <div className="mt-1 text-xs text-[#686158]">{caption}</div>
    </div>
  );
}

function DistributionPanel({
  title,
  rows,
}: {
  title: string;
  rows: DistributionRowData[];
}) {
  return (
    <div className="rounded-lg border border-[#e5ded2] bg-[#fbfaf7] p-4">
      <div className="text-sm font-bold">{title}</div>
      <div className="mt-3 grid gap-2">
        {rows.length ? (
          rows.map((row) => <DistributionRow key={row.label} {...row} />)
        ) : (
          <EmptyState text="אין נתונים להצגה." />
        )}
      </div>
    </div>
  );
}

type DistributionRowData = {
  label: string;
  value: number;
  total: number;
  tone: "green" | "blue" | "amber" | "rose";
};

function DistributionRow({ label, value, total, tone }: DistributionRowData) {
  const colors = {
    green: "bg-[#1f7a5a]",
    blue: "bg-[#203864]",
    amber: "bg-[#b7791f]",
    rose: "bg-[#9b2f2f]",
  };
  const width = percent(value, total);
  return (
    <div className="rounded-lg border border-[#e5ded2] bg-white p-2">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-bold">{label}</span>
        <span className="text-[#686158]">{value}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#eee7dc]">
        <div className={`h-full rounded-full ${colors[tone]}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function ProfessionalOpsCenter({
  dashboard,
  dueContacts,
  unresponsiveContacts,
  staleYouths,
  selectedContact,
  selectedYouth,
  selectedYouthTimeline,
  reviewDrafts,
  busy,
  nowMs,
  onReviewAction,
  onAlertAction,
  onSelectContact,
  onSelectYouth,
  onSetReviewDraft,
}: {
  dashboard: DashboardData;
  dueContacts: Contact[];
  unresponsiveContacts: Contact[];
  staleYouths: Youth[];
  selectedContact?: Contact;
  selectedYouth?: Youth;
  selectedYouthTimeline: ContactTimelineItem[];
  reviewDrafts: Record<string, string>;
  busy: string | null;
  nowMs: number;
  onReviewAction: (
    id: string,
    action: "send" | "reject" | "edit" | "schedule",
    scheduledFor?: string,
  ) => void;
  onAlertAction: (id: string, status: "handled" | "dismissed") => void;
  onSelectContact: (id: string) => void;
  onSelectYouth: (id: string) => void;
  onSetReviewDraft: (id: string, value: string) => void;
}) {
  return (
    <div className="grid gap-5">
      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <SmartWorkInbox
          dashboard={dashboard}
          dueContacts={dueContacts}
          unresponsiveContacts={unresponsiveContacts}
          staleYouths={staleYouths}
          busy={busy}
          nowMs={nowMs}
          onReviewAction={onReviewAction}
          onAlertAction={onAlertAction}
          onSelectContact={onSelectContact}
          onSelectYouth={onSelectYouth}
        />
        <SendingCalendarPanel
          reviews={dashboard.reviews}
          settings={dashboard.settings}
          busy={busy}
          nowMs={nowMs}
          onReviewAction={onReviewAction}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <ContactHealthBoard
          dashboard={dashboard}
          unresponsiveContacts={unresponsiveContacts}
          staleYouths={staleYouths}
          nowMs={nowMs}
          onSelectContact={onSelectContact}
        />
        <YouthProgressBoard
          youths={dashboard.youths}
          contacts={dashboard.contacts}
          selectedContact={selectedContact}
          selectedYouth={selectedYouth}
          selectedYouthTimeline={selectedYouthTimeline}
          staleYouths={staleYouths}
          nowMs={nowMs}
          onSelectContact={onSelectContact}
          onSelectYouth={onSelectYouth}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <TemplatePanel
          reviews={dashboard.reviews}
          contacts={dashboard.contacts}
          youths={dashboard.youths}
          reviewDrafts={reviewDrafts}
          onSetReviewDraft={onSetReviewDraft}
        />
        <SafetyLogPanel dashboard={dashboard} />
      </div>
    </div>
  );
}

function SmartWorkInbox({
  dashboard,
  dueContacts,
  unresponsiveContacts,
  staleYouths,
  busy,
  nowMs,
  onReviewAction,
  onAlertAction,
  onSelectContact,
  onSelectYouth,
}: {
  dashboard: DashboardData;
  dueContacts: Contact[];
  unresponsiveContacts: Contact[];
  staleYouths: Youth[];
  busy: string | null;
  nowMs: number;
  onReviewAction: (
    id: string,
    action: "send" | "reject" | "edit" | "schedule",
    scheduledFor?: string,
  ) => void;
  onAlertAction: (id: string, status: "handled" | "dismissed") => void;
  onSelectContact: (id: string) => void;
  onSelectYouth: (id: string) => void;
}) {
  const pendingReviews = dashboard.reviews.filter(
    (review) => review.status === "pending",
  );
  const openAlerts = dashboard.alerts.filter((alert) => alert.status === "open");
  const items = [
    ...openAlerts.map((alert) => ({
      id: alert.id,
      kind: "alert" as const,
      title: alert.contactName,
      detail: alert.reason,
      when: alert.createdAt,
      tone: "rose" as const,
      contactId: alert.contactId || "",
      alert,
    })),
    ...pendingReviews.map((review) => ({
      id: review.id,
      kind: "review" as const,
      title: review.contactName,
      detail: review.aiReason,
      when: review.scheduledFor,
      tone: review.priority === "high" ? ("rose" as const) : ("amber" as const),
      contactId: review.contactId || "",
      review,
    })),
    ...unresponsiveContacts.slice(0, 8).map((contact) => ({
      id: `unresponsive-${contact.id}`,
      kind: "unresponsive" as const,
      title: contact.name,
      detail: `אין תגובה ${daysSince(contact.lastContactedAt, nowMs)} ימים`,
      when: contact.lastContactedAt || contact.nextDueAt,
      tone: "rose" as const,
      contactId: contact.id,
    })),
    ...staleYouths.slice(0, 8).map((youth) => {
      const contact = dashboard.contacts.find((item) => item.id === youth.contactId);
      return {
        id: `stale-youth-${youth.id}`,
        kind: "stale_youth" as const,
        title: youth.name,
        detail: `${contact?.name || "איש קשר לא ידוע"} · עודכן לפני ${daysSince(
          youth.lastUpdateAt || youth.updatedAt || youth.createdAt,
          nowMs,
        )} ימים`,
        when: youth.lastUpdateAt || youth.updatedAt || youth.createdAt || "",
        tone: "amber" as const,
        contactId: youth.contactId,
        youthId: youth.id,
      };
    }),
    ...dueContacts.slice(0, 8).map((contact) => ({
      id: `due-${contact.id}`,
      kind: "due" as const,
      title: contact.name,
      detail: `${contact.country || "ללא מדינה"} · ${contact.bestContactTime}`,
      when: contact.nextDueAt,
      tone: "neutral" as const,
      contactId: contact.id,
    })),
  ]
    .sort((a, b) => urgencyRank(a.kind) - urgencyRank(b.kind) || a.when.localeCompare(b.when))
    .slice(0, 12);

  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PanelEyebrow icon={<ClipboardCheck className="h-4 w-4" />}>
          תיבת עבודה חכמה
        </PanelEyebrow>
        <div className="flex flex-wrap gap-2">
          <Badge tone="rose">{openAlerts.length} אישי</Badge>
          <Badge tone="amber">{pendingReviews.length} אישור</Badge>
          <Badge>{dueContacts.length} תור</Badge>
        </div>
      </div>

      <div className="mt-4 grid gap-2">
        {items.length ? (
          items.map((item) => (
            <div
              key={`${item.kind}-${item.id}`}
              className="rounded-lg border border-[#e5ded2] bg-[#fbfaf7] p-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <button
                  type="button"
                  onClick={() => {
                    if (item.contactId) {
                      onSelectContact(item.contactId);
                    }
                    if ("youthId" in item && item.youthId) {
                      onSelectYouth(item.youthId);
                    }
                  }}
                  className="min-w-0 flex-1 text-right"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={item.tone}>{workKindLabel(item.kind)}</Badge>
                    <span className="font-bold">{item.title}</span>
                    <span className="text-xs text-[#686158]">
                      {formatDateTime(item.when)}
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-[#4e4841]">
                    {item.detail}
                  </p>
                </button>

                {item.kind === "review" && "review" in item ? (
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <ActionButton
                      busy={busy === item.review.id}
                      tone="green"
                      onClick={() => onReviewAction(item.review.id, "send")}
                      icon={<Send className="h-4 w-4" />}
                    >
                      שלח
                    </ActionButton>
                    <IconButton
                      title="דחה בחצי שעה"
                      onClick={() =>
                        onReviewAction(
                          item.review.id,
                          "schedule",
                          addMinutesIso(30),
                        )
                      }
                    >
                      <CalendarDays className="h-4 w-4" />
                      30 דק׳
                    </IconButton>
                  </div>
                ) : null}

                {item.kind === "alert" && "alert" in item ? (
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <ActionButton
                      busy={busy === item.alert.id}
                      tone="green"
                      onClick={() => onAlertAction(item.alert.id, "handled")}
                      icon={<UserCheck className="h-4 w-4" />}
                    >
                      טופל
                    </ActionButton>
                  </div>
                ) : null}
              </div>
            </div>
          ))
        ) : (
          <EmptyState text="אין כרגע משימות פתוחות." />
        )}
      </div>
    </Panel>
  );
}

function SendingCalendarPanel({
  reviews,
  settings,
  busy,
  nowMs,
  onReviewAction,
}: {
  reviews: ReviewItem[];
  settings: BotSettings;
  busy: string | null;
  nowMs: number;
  onReviewAction: (
    id: string,
    action: "send" | "reject" | "edit" | "schedule",
    scheduledFor?: string,
  ) => void;
}) {
  const pending = reviews
    .filter((review) => review.status === "pending")
    .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
  const today = pending.filter((review) => isToday(review.scheduledFor, nowMs));
  const later = pending.filter((review) => !isToday(review.scheduledFor, nowMs));

  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PanelEyebrow icon={<CalendarDays className="h-4 w-4" />}>
          יומן שליחות
        </PanelEyebrow>
        <div className="flex flex-wrap gap-2">
          <Badge>{settings.sendWindowStart}-{settings.sendWindowEnd}</Badge>
          <Badge tone="amber">כל {settings.sendIntervalMinutes} דק׳</Badge>
        </div>
      </div>

      <div className="mt-4 grid gap-3">
        <CalendarBucket
          title="היום"
          reviews={today}
          busy={busy}
          settings={settings}
          onReviewAction={onReviewAction}
        />
        <CalendarBucket
          title="בהמשך"
          reviews={later.slice(0, 8)}
          busy={busy}
          settings={settings}
          onReviewAction={onReviewAction}
        />
      </div>
    </Panel>
  );
}

function CalendarBucket({
  title,
  reviews,
  busy,
  settings,
  onReviewAction,
}: {
  title: string;
  reviews: ReviewItem[];
  busy: string | null;
  settings: BotSettings;
  onReviewAction: (
    id: string,
    action: "send" | "reject" | "edit" | "schedule",
    scheduledFor?: string,
  ) => void;
}) {
  return (
    <div>
      <div className="mb-2 text-sm font-bold">{title}</div>
      <div className="grid gap-2">
        {reviews.length ? (
          reviews.map((review) => (
            <div key={review.id} className="rounded-lg border border-[#e5ded2] bg-[#fbfaf7] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-bold">{review.contactName}</div>
                  <div className="mt-1 text-xs text-[#686158]">
                    {formatDateTime(review.scheduledFor)}
                  </div>
                </div>
                <PriorityBadge priority={review.priority} />
              </div>
              <p className="mt-2 line-clamp-2 text-xs leading-5 text-[#7b7368]">
                {review.draftMessage}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <IconButton
                  title="דחה בחצי שעה"
                  onClick={() =>
                    onReviewAction(
                      review.id,
                      "schedule",
                      addMinutesIso(settings.sendIntervalMinutes),
                    )
                  }
                >
                  <CalendarDays className="h-4 w-4" />
                  +{settings.sendIntervalMinutes}
                </IconButton>
                <IconButton
                  title="שלח מחר"
                  onClick={() =>
                    onReviewAction(
                      review.id,
                      "schedule",
                      tomorrowAtIso(settings.sendWindowStart),
                    )
                  }
                >
                  <CalendarDays className="h-4 w-4" />
                  מחר
                </IconButton>
                <ActionButton
                  busy={busy === review.id}
                  tone="green"
                  onClick={() => onReviewAction(review.id, "send")}
                  icon={<Send className="h-4 w-4" />}
                >
                  שלח
                </ActionButton>
              </div>
            </div>
          ))
        ) : (
          <EmptyState text="אין פריטים." />
        )}
      </div>
    </div>
  );
}

function ContactHealthBoard({
  dashboard,
  unresponsiveContacts,
  staleYouths,
  nowMs,
  onSelectContact,
}: {
  dashboard: DashboardData;
  unresponsiveContacts: Contact[];
  staleYouths: Youth[];
  nowMs: number;
  onSelectContact: (id: string) => void;
}) {
  const rows = contactHealthRows(
    dashboard,
    unresponsiveContacts,
    staleYouths,
    nowMs,
  );

  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PanelEyebrow icon={<Activity className="h-4 w-4" />}>
          בריאות אנשי קשר
        </PanelEyebrow>
        <Badge tone={rows.some((row) => row.score < 45) ? "rose" : "neutral"}>
          {rows.filter((row) => row.score < 45).length} בסיכון
        </Badge>
      </div>

      <div className="mt-4 grid gap-2">
        {rows.slice(0, 10).map((row) => (
          <button
            key={row.contact.id}
            type="button"
            onClick={() => onSelectContact(row.contact.id)}
            className="rounded-lg border border-[#e5ded2] bg-[#fbfaf7] p-3 text-right transition hover:border-[#cfc3b1]"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-bold">{row.contact.name}</div>
                <div className="mt-1 text-xs text-[#686158]">{row.reason}</div>
              </div>
              <Badge tone={row.score >= 70 ? "neutral" : row.score >= 45 ? "amber" : "rose"}>
                {row.score}%
              </Badge>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#e5ded2]">
              <div
                className={`h-full rounded-full ${
                  row.score >= 70
                    ? "bg-[#1f7a5a]"
                    : row.score >= 45
                      ? "bg-[#b7791f]"
                      : "bg-[#9b2f2f]"
                }`}
                style={{ width: `${row.score}%` }}
              />
            </div>
          </button>
        ))}
      </div>
    </Panel>
  );
}

function YouthProgressBoard({
  youths,
  contacts,
  selectedContact,
  selectedYouth,
  selectedYouthTimeline,
  staleYouths,
  nowMs,
  onSelectContact,
  onSelectYouth,
}: {
  youths: Youth[];
  contacts: Contact[];
  selectedContact?: Contact;
  selectedYouth?: Youth;
  selectedYouthTimeline: ContactTimelineItem[];
  staleYouths: Youth[];
  nowMs: number;
  onSelectContact: (id: string) => void;
  onSelectYouth: (id: string) => void;
}) {
  const youth = selectedYouth || staleYouths[0] || youths[0];
  const contact =
    selectedContact?.id === youth?.contactId
      ? selectedContact
      : contacts.find((item) => item.id === youth?.contactId);

  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PanelEyebrow icon={<Users className="h-4 w-4" />}>
          כרטיס נער מתקדם
        </PanelEyebrow>
        <Badge tone={staleYouths.length ? "amber" : "neutral"}>
          {staleYouths.length} בלי עדכון
        </Badge>
      </div>

      {youth ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="rounded-lg border border-[#e5ded2] bg-[#fbfaf7] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <button
                  type="button"
                  className="text-right text-xl font-bold"
                  onClick={() => {
                    onSelectContact(youth.contactId);
                    onSelectYouth(youth.id);
                  }}
                >
                  {youth.name}
                </button>
                <div className="mt-1 text-sm text-[#686158]">
                  {contact?.name || "איש קשר לא ידוע"} · {youth.city || "ללא עיר"}
                </div>
              </div>
              <Badge tone={youth.stage === "needs_followup" ? "rose" : "amber"}>
                {stageLabels[youth.stage]}
              </Badge>
            </div>

            <div className="mt-4">
              <StageRail stage={youth.stage} />
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <Mini label="נכנס" value={formatDateTime(youth.createdAt)} />
              <Mini
                label="עודכן"
                value={`${daysSince(
                  youth.lastUpdateAt || youth.updatedAt || youth.createdAt,
                  nowMs,
                )} ימים`}
              />
              <Mini label="אבני דרך" value={String(youth.milestones.length)} />
              <Mini label="התקדמות" value={`${youthProgressPercent(youth.stage)}%`} />
            </div>

            <div className="mt-4 rounded-lg border border-[#e5ded2] bg-white p-3">
              <div className="text-xs font-bold text-[#6f675e]">פעולה הבאה</div>
              <p className="mt-2 text-sm leading-6 text-[#4e4841]">
                {youth.nextAction || "לא הוגדרה פעולה הבאה."}
              </p>
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-bold">
              <FileText className="h-4 w-4 text-[#203864]" />
              היסטוריית נער
            </div>
            <TimelineList
              items={selectedYouthTimeline.slice(0, 6)}
              emptyText="אין עדיין היסטוריה ממוקדת לנער הזה."
              compact
            />
          </div>
        </div>
      ) : (
        <EmptyState text="אין עדיין נערים להצגה." />
      )}
    </Panel>
  );
}

function StageRail({ stage }: { stage: Youth["stage"] }) {
  const stages = Object.keys(stageLabels) as Youth["stage"][];
  const currentIndex = stages.indexOf(stage);
  return (
    <div className="grid gap-2">
      {stages.map((item, index) => (
        <div key={item} className="flex items-center gap-3">
          <span
            className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold ${
              index <= currentIndex
                ? "bg-[#203864] text-white"
                : "bg-[#eee7dc] text-[#686158]"
            }`}
          >
            {index + 1}
          </span>
          <span className="text-sm font-bold">{stageLabels[item]}</span>
        </div>
      ))}
    </div>
  );
}

function TemplatePanel({
  reviews,
  contacts,
  youths,
  reviewDrafts,
  onSetReviewDraft,
}: {
  reviews: ReviewItem[];
  contacts: Contact[];
  youths: Youth[];
  reviewDrafts: Record<string, string>;
  onSetReviewDraft: (id: string, value: string) => void;
}) {
  const pending = reviews.filter((review) => review.status === "pending");
  const [selectedReviewId, setSelectedReviewId] = useState("");
  const activeReviewId =
    selectedReviewId && pending.some((review) => review.id === selectedReviewId)
      ? selectedReviewId
      : pending[0]?.id || "";
  const review = pending.find((item) => item.id === activeReviewId);
  const contact = contacts.find((item) => item.id === review?.contactId);
  const youth = youths.find((item) => item.id === review?.youthId);
  const templates = messageTemplates.map((template) => ({
    ...template,
    body: renderMessageTemplate(template.id, contact, youth, review),
  }));

  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PanelEyebrow icon={<FileText className="h-4 w-4" />}>
          תבניות הודעה
        </PanelEyebrow>
        <Badge>{pending.length} טיוטות</Badge>
      </div>

      <div className="mt-4 grid gap-3">
        <SelectInput
          label="טיוטה"
          value={activeReviewId}
          onChange={setSelectedReviewId}
          options={
            pending.length
              ? pending.map((item) => ({
                  value: item.id,
                  label: `${item.contactName} · ${formatDateTime(item.scheduledFor)}`,
                }))
              : [{ value: "", label: "אין טיוטות פתוחות" }]
          }
        />

        <div className="grid gap-2 sm:grid-cols-2">
          {templates.map((template) => (
            <button
              key={template.id}
              type="button"
              disabled={!review}
              onClick={() => review && onSetReviewDraft(review.id, template.body)}
              className="rounded-lg border border-[#e5ded2] bg-[#fbfaf7] p-3 text-right transition hover:border-[#cfc3b1] disabled:opacity-60"
            >
              <div className="font-bold">{template.label}</div>
              <p className="mt-2 line-clamp-3 text-xs leading-5 text-[#686158]">
                {template.body}
              </p>
            </button>
          ))}
        </div>

        {review ? (
          <div className="rounded-lg border border-[#d8e5dc] bg-white p-3">
            <div className="text-xs font-bold text-[#6f675e]">טיוטה נוכחית</div>
            <p className="mt-2 whitespace-pre-line text-sm leading-6 text-[#4e4841]">
              {reviewDrafts[review.id] || review.draftMessage}
            </p>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

function SafetyLogPanel({ dashboard }: { dashboard: DashboardData }) {
  const systemMessages = dashboard.messages
    .filter((message) => message.channel === "system")
    .slice(0, 8);
  const sentReviews = dashboard.reviews
    .filter((review) => review.status === "sent")
    .slice(0, 4);
  const blockedReviews = dashboard.reviews
    .filter((review) => review.aiReason.includes("לא נשלח"))
    .slice(0, 4);

  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PanelEyebrow icon={<ShieldCheck className="h-4 w-4" />}>
          לוג בטיחות ושליחות
        </PanelEyebrow>
        <div className="flex flex-wrap gap-2">
          <Badge>{systemMessages.length} מערכת</Badge>
          <Badge tone={blockedReviews.length ? "amber" : "neutral"}>
            {blockedReviews.length} חסימות
          </Badge>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="grid gap-2">
          {systemMessages.length ? (
            systemMessages.map((message) => (
              <div key={message.id} className="rounded-lg border border-[#e5ded2] bg-[#fbfaf7] p-3">
                <div className="text-xs text-[#686158]">
                  {formatDateTime(message.createdAt)}
                </div>
                <p className="mt-2 text-sm leading-6 text-[#4e4841]">
                  {message.body}
                </p>
              </div>
            ))
          ) : (
            <EmptyState text="אין אירועי מערכת להצגה." />
          )}
        </div>

        <div className="grid gap-2">
          {sentReviews.concat(blockedReviews).length ? (
            sentReviews.concat(blockedReviews).map((review) => (
              <div key={`${review.id}-${review.status}`} className="rounded-lg border border-[#e5ded2] bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold">{review.contactName}</span>
                  <Badge tone={review.status === "sent" ? "neutral" : "amber"}>
                    {reviewStatusLabel(review.status)}
                  </Badge>
                </div>
                <p className="mt-2 line-clamp-2 text-xs leading-5 text-[#7b7368]">
                  {review.aiReason || review.draftMessage}
                </p>
              </div>
            ))
          ) : (
            <EmptyState text="אין שליחות או חסימות להצגה." />
          )}
        </div>
      </div>
    </Panel>
  );
}

function RelationshipWorkspace({
  contacts,
  youths,
  selectedContact,
  selectedContactId,
  selectedYouth,
  selectedYouthId,
  timeline,
  selectedYouthTimeline,
  onSelectContact,
  onSelectYouth,
  onRefreshTimeline,
  onEditContact,
  onEditYouth,
}: {
  contacts: Contact[];
  youths: Youth[];
  selectedContact?: Contact;
  selectedContactId: string;
  selectedYouth?: Youth;
  selectedYouthId: string;
  timeline: ContactTimelineItem[];
  selectedYouthTimeline: ContactTimelineItem[];
  onSelectContact: (id: string) => void;
  onSelectYouth: (id: string) => void;
  onRefreshTimeline: () => void;
  onEditContact: (contact: Contact) => void;
  onEditYouth: (youth: Youth) => void;
}) {
  const youthCountByContact = youths.reduce<Record<string, number>>(
    (counts, youth) => {
      counts[youth.contactId] = (counts[youth.contactId] || 0) + 1;
      return counts;
    },
    {},
  );
  const selectedContactYouths = selectedContact
    ? youths.filter((youth) => youth.contactId === selectedContact.id)
    : [];

  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <PanelEyebrow icon={<Users className="h-4 w-4" />}>
            מרכז ניהול קשרים
          </PanelEyebrow>
          <p className="mt-2 text-sm leading-6 text-[#686158]">
            כניסה מהירה לאיש קשר, לנערים שלו, ולכל העדכונים שנרשמו במערכת.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge>{contacts.length} אנשי קשר</Badge>
          <Badge tone="amber">{youths.length} נערים</Badge>
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[0.82fr_1.1fr_1fr]">
        <div className="rounded-lg border border-[#e5ded2] bg-[#fbfaf7] p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-bold">
              <Phone className="h-4 w-4 text-[#174c3b]" />
              אנשי קשר
            </div>
            <span className="text-xs font-bold text-[#6f675e]">
              {contacts.length}
            </span>
          </div>
          <div className="mt-3 grid max-h-[28rem] gap-2 overflow-y-auto pr-1">
            {contacts.length === 0 ? (
              <EmptyState text="אין עדיין אנשי קשר." />
            ) : (
              contacts.map((contact) => {
                const youthCount = youthCountByContact[contact.id] || 0;
                return (
                  <button
                    key={contact.id}
                    type="button"
                    onClick={() => onSelectContact(contact.id)}
                    className={`rounded-lg border p-3 text-right transition ${
                      selectedContactId === contact.id
                        ? "border-[#1f7a5a] bg-[#eef8f2] shadow-sm"
                        : "border-[#e5ded2] bg-white hover:border-[#cfc3b1]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold">{contact.name}</span>
                      <Badge tone={youthCount ? "amber" : "neutral"}>
                        {youthCount} נערים
                      </Badge>
                    </div>
                    <div className="mt-1 text-xs leading-5 text-[#686158]">
                      {contact.phone} · {statusLabels[contact.status]}
                    </div>
                    <div className="mt-2 text-xs text-[#7b7368]">
                      קשר אחרון: {formatDateTime(contact.lastContactedAt)}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="rounded-lg border border-[#d8e5dc] bg-[#f8fcfa] p-4">
          {selectedContact ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-xl font-bold">{selectedContact.name}</h3>
                    <Badge
                      tone={
                        selectedContact.status === "needs_attention"
                          ? "rose"
                          : "neutral"
                      }
                    >
                      {statusLabels[selectedContact.status]}
                    </Badge>
                  </div>
                  <div className="mt-1 text-sm text-[#686158]">
                    {selectedContact.phone} · {selectedContact.country || "ללא מדינה"} ·{" "}
                    {selectedContact.timezone}
                  </div>
                </div>
                <IconButton title="ערוך איש קשר" onClick={() => onEditContact(selectedContact)}>
                  <Edit3 className="h-4 w-4" />
                  ערוך
                </IconButton>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <Mini label="נערים במעקב" value={String(selectedContactYouths.length)} />
                <Mini label="נכנס למערכת" value={formatDateTime(selectedContact.createdAt)} />
                <Mini label="קשר אחרון" value={formatDateTime(selectedContact.lastContactedAt)} />
                <Mini label="מעקב הבא" value={formatDateTime(selectedContact.nextDueAt)} />
              </div>

              <div className="mt-4 rounded-lg border border-[#d8e5dc] bg-white p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-[#6f675e]">חום קשר</span>
                  <span className="text-sm font-bold">{selectedContact.warmthScore}%</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#e5ded2]">
                  <div
                    className="h-full rounded-full bg-[#1f7a5a]"
                    style={{ width: `${selectedContact.warmthScore}%` }}
                  />
                </div>
                {selectedContact.notes ? (
                  <p className="mt-3 text-sm leading-6 text-[#4e4841]">
                    {selectedContact.notes}
                  </p>
                ) : null}
              </div>

              <div className="mt-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-bold">
                  <Users className="h-4 w-4 text-[#203864]" />
                  נערים של איש הקשר
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {selectedContactYouths.length === 0 ? (
                    <EmptyState text="אין נערים משויכים לאיש הקשר הזה." />
                  ) : (
                    selectedContactYouths.map((youth) => (
                      <button
                        key={youth.id}
                        type="button"
                        onClick={() => onSelectYouth(youth.id)}
                        className={`rounded-lg border p-3 text-right transition ${
                          selectedYouthId === youth.id
                            ? "border-[#203864] bg-[#eef3fb]"
                            : "border-[#e5ded2] bg-white hover:border-[#cfc3b1]"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold">{youth.name}</span>
                          <Badge>{stageLabels[youth.stage]}</Badge>
                        </div>
                        <div className="mt-1 text-xs text-[#686158]">
                          עודכן: {formatDateTime(youth.lastUpdateAt || youth.updatedAt)}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </>
          ) : (
            <EmptyState text="בחר איש קשר כדי לפתוח את הכרטיס שלו." />
          )}
        </div>

        <div className="rounded-lg border border-[#d8d4e8] bg-[#f8f7fd] p-4">
          {selectedYouth ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-xl font-bold">{selectedYouth.name}</h3>
                    <Badge tone="amber">{stageLabels[selectedYouth.stage]}</Badge>
                  </div>
                  <div className="mt-1 text-sm text-[#686158]">
                    {selectedYouth.city || "ללא עיר"}
                  </div>
                </div>
                <IconButton title="ערוך נער" onClick={() => onEditYouth(selectedYouth)}>
                  <Edit3 className="h-4 w-4" />
                  ערוך
                </IconButton>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <Mini label="נכנס למערכת" value={formatDateTime(selectedYouth.createdAt)} />
                <Mini
                  label="עודכן לאחרונה"
                  value={formatDateTime(selectedYouth.lastUpdateAt || selectedYouth.updatedAt)}
                />
                <Mini label="שלב" value={stageLabels[selectedYouth.stage]} />
                <Mini label="פעולה הבאה" value={selectedYouth.nextAction || "לא הוגדרה"} />
              </div>

              <div className="mt-4 rounded-lg border border-[#ddd8ef] bg-white p-3">
                <div className="text-xs font-bold text-[#6f675e]">אבני דרך</div>
                {selectedYouth.milestones.length ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selectedYouth.milestones.map((milestone) => (
                      <Badge key={milestone}>{milestone}</Badge>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-[#686158]">אין עדיין אבני דרך.</p>
                )}
              </div>

              <div className="mt-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-bold">
                  <FileText className="h-4 w-4 text-[#203864]" />
                  עדכונים על הנער
                </div>
                <TimelineList
                  items={selectedYouthTimeline}
                  emptyText="אין עדיין עדכונים ייעודיים לנער הזה."
                  compact
                />
              </div>
            </>
          ) : (
            <EmptyState text="בחר נער כדי לראות מתי נכנס ומה עודכן עליו." />
          )}
        </div>
      </div>

      <div className="mt-4 border-t border-[#e5ded2] pt-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-bold">
            <Activity className="h-4 w-4 text-[#174c3b]" />
            ציר פעילות של איש הקשר
          </div>
          <IconButton title="רענן ציר פעילות" onClick={onRefreshTimeline}>
            <RefreshCw className="h-4 w-4" />
            רענן
          </IconButton>
        </div>
        <TimelineList
          items={timeline.slice(0, 12)}
          emptyText="אין עדיין פעילות לאיש הקשר הזה."
        />
      </div>
    </Panel>
  );
}

function TimelineList({
  items,
  emptyText,
  compact,
}: {
  items: ContactTimelineItem[];
  emptyText: string;
  compact?: boolean;
}) {
  if (items.length === 0) {
    return <EmptyState text={emptyText} />;
  }

  return (
    <div className={compact ? "grid gap-2" : "grid gap-3 md:grid-cols-2"}>
      {items.map((item) => (
        <div
          key={`${item.type}-${item.id}`}
          className="rounded-lg border border-[#e5ded2] bg-white p-3"
        >
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#eef3fb] text-[#203864]">
              <TimelineIcon type={item.type} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-bold">{item.title}</div>
                <div className="text-xs text-[#686158]">
                  {formatDateTime(item.createdAt)}
                </div>
              </div>
              {item.youthName ? (
                <div className="mt-1">
                  <Badge>{item.youthName}</Badge>
                </div>
              ) : null}
              <p className="mt-2 whitespace-pre-line text-sm leading-6 text-[#4e4841]">
                {item.body}
              </p>
              {item.status ? (
                <div className="mt-2 text-xs font-bold text-[#7b7368]">
                  {item.status}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function TimelineIcon({ type }: { type: ContactTimelineItem["type"] }) {
  if (type === "message") {
    return <MessageCircle className="h-4 w-4" />;
  }
  if (type === "review") {
    return <ClipboardCheck className="h-4 w-4" />;
  }
  if (type === "alert") {
    return <BellRing className="h-4 w-4" />;
  }
  if (type === "contact_update") {
    return <UserCheck className="h-4 w-4" />;
  }
  return <Users className="h-4 w-4" />;
}

function ManagerSettingsPanel({
  settings,
  busy,
  onChange,
  onSave,
}: {
  settings: BotSettings;
  busy: boolean;
  onChange: (settings: BotSettings) => void;
  onSave: () => void;
}) {
  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PanelEyebrow icon={<Settings className="h-4 w-4" />}>
          הגדרות מנהל
        </PanelEyebrow>
        <ActionButton busy={busy} tone="blue" onClick={onSave} icon={<Save className="h-4 w-4" />}>
          שמור
        </ActionButton>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <NumberInput
          label="אנשי קשר ביום"
          value={settings.dailyContactLimit}
          min={1}
          max={10}
          onChange={(value) => onChange({ ...settings, dailyContactLimit: value })}
        />
        <NumberInput
          label="נערים בהודעה"
          value={settings.maxYouthsPerMessage}
          min={1}
          max={10}
          onChange={(value) => onChange({ ...settings, maxYouthsPerMessage: value })}
        />
        <NumberInput
          label="ימי המתנה לתגובה"
          value={settings.noResponseFollowupDays}
          min={1}
          max={60}
          onChange={(value) => onChange({ ...settings, noResponseFollowupDays: value })}
        />
        <NumberInput
          label="נער ללא עדכון אחרי ימים"
          value={settings.staleYouthDays}
          min={1}
          max={365}
          onChange={(value) => onChange({ ...settings, staleYouthDays: value })}
        />
        <TextInput
          label="שליחה מותרת מ"
          value={settings.sendWindowStart}
          onChange={(value) => onChange({ ...settings, sendWindowStart: value })}
        />
        <TextInput
          label="שליחה מותרת עד"
          value={settings.sendWindowEnd}
          onChange={(value) => onChange({ ...settings, sendWindowEnd: value })}
        />
        <NumberInput
          label="מרווח שליחה בדקות"
          value={settings.sendIntervalMinutes}
          min={30}
          max={240}
          onChange={(value) => onChange({ ...settings, sendIntervalMinutes: value })}
        />
        <SelectInput
          label="רמת אוטומציה"
          value={settings.automationLevel}
          onChange={(value) =>
            onChange({
              ...settings,
              automationLevel: value as BotSettings["automationLevel"],
            })
          }
          options={[
            { value: "drafts", label: "טיוטות בלבד" },
            { value: "auto_with_review", label: "אוטומטי עם ביקורת" },
            { value: "full_auto", label: "אוטומטי מלא" },
          ]}
        />
        <TextInput
          label="וואטסאפ מנהל"
          value={settings.ownerWhatsapp}
          onChange={(value) => onChange({ ...settings, ownerWhatsapp: value })}
        />
        <TextInput
          label="שעת Cron יומי"
          value={settings.dailyCronTime}
          onChange={(value) => onChange({ ...settings, dailyCronTime: value })}
        />
        <TextInput
          label="תחילת שעות שקט"
          value={settings.quietHoursStart}
          onChange={(value) => onChange({ ...settings, quietHoursStart: value })}
        />
        <TextInput
          label="סוף שעות שקט"
          value={settings.quietHoursEnd}
          onChange={(value) => onChange({ ...settings, quietHoursEnd: value })}
        />
        <TextInput
          label="טון כללי"
          value={settings.tone}
          onChange={(value) => onChange({ ...settings, tone: value })}
          wide
        />
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <Mini label="תור יומי" value={`${settings.dailyContactLimit} אנשי קשר`} />
        <Mini label="Cron יומי" value={settings.dailyCronTime} />
        <Mini label="קצב שליחה" value={`אחת כל ${settings.sendIntervalMinutes} דקות`} />
      </div>
      <p className="mt-3 text-xs leading-5 text-[#6f675e]">
        ב־Vercel Hobby השעה האוטומטית בפועל נקבעת ב־vercel.json ודורשת פריסה מחדש. להפעלה נוספת בכל רגע כתוב בוואטסאפ: הפעל הרצה יומית.
      </p>
    </Panel>
  );
}

function WhatsappCommandRouterPanel({
  settings,
  busy,
  onChange,
  onSave,
}: {
  settings: BotSettings;
  busy: boolean;
  onChange: (settings: BotSettings) => void;
  onSave: () => void;
}) {
  const routes = mergeOwnerCommandRoutes(settings.ownerCommandRoutes);
  const enabledRoutes = routes.filter((route) => route.enabled);
  const triggerCount = routes.reduce(
    (sum, route) => sum + route.triggers.length,
    0,
  );

  const updateRoute = (id: string, patch: Partial<OwnerCommandRoute>) => {
    onChange({
      ...settings,
      ownerCommandRoutes: routes.map((route) =>
        route.id === id ? { ...route, ...patch } : route,
      ),
    });
  };

  const splitTriggers = (value: string) =>
    value
      .split(/\r?\n/)
      .map((trigger) => trigger.trim())
      .filter(Boolean);

  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PanelEyebrow icon={<MessageCircle className="h-4 w-4" />}>
          מילון פקודות וואטסאפ
        </PanelEyebrow>
        <ActionButton busy={busy} tone="blue" onClick={onSave} icon={<Save className="h-4 w-4" />}>
          שמור פקודות
        </ActionButton>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <Mini label="פקודות פעילות" value={`${enabledRoutes.length}/${routes.length}`} />
        <Mini label="מילים מפעילות" value={`${triggerCount}`} />
        <Mini label="מסלול שמירה" value="דשבורד -> WhatsApp" />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {routes.map((route) => (
          <div key={route.id} className="rounded-lg border border-[#e5ded2] bg-[#fbfaf7] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-bold">{route.label}</div>
                <div className="mt-1 text-xs text-[#6f675e]">{route.id}</div>
              </div>
              <Badge tone={route.enabled ? "neutral" : "rose"}>
                {route.enabled ? "פעיל" : "כבוי"}
              </Badge>
            </div>

            <div className="mt-3 grid gap-3">
              <CheckboxRow
                label="פעיל בווטסאפ"
                checked={route.enabled}
                onChange={(checked) => updateRoute(route.id, { enabled: checked })}
              />
              <TextInput
                label="יעד במערכת"
                value={route.destination}
                onChange={(destination) => updateRoute(route.id, { destination })}
              />
              <TextareaInput
                label="מילים מפעילות"
                value={route.triggers.join("\n")}
                rows={3}
                onChange={(value) =>
                  updateRoute(route.id, { triggers: splitTriggers(value) })
                }
              />
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function FollowupIntelligencePanel({
  contacts,
  messages,
  settings,
  unresponsiveContacts,
  staleYouths,
  nowMs,
  onSelectContact,
  onSelectYouth,
}: {
  contacts: Contact[];
  messages: DashboardData["messages"];
  settings: BotSettings;
  unresponsiveContacts: Contact[];
  staleYouths: Youth[];
  nowMs: number;
  onSelectContact: (id: string) => void;
  onSelectYouth: (id: string) => void;
}) {
  const contactById = new Map(contacts.map((contact) => [contact.id, contact]));
  const priorityContacts = contacts.filter(
    (contact) => contact.status === "needs_attention",
  );
  const recommendations = [
    unresponsiveContacts.length
      ? `להתחיל היום עם ${unresponsiveContacts[0].name}, אין תגובה כבר ${daysSince(
          unresponsiveContacts[0].lastContactedAt,
          nowMs,
        )} ימים.`
      : "",
    staleYouths.length
      ? `לבקש עדכון על ${staleYouths[0].name}, הכרטיס שלו לא התעדכן ${daysSince(
          staleYouths[0].lastUpdateAt ||
            staleYouths[0].updatedAt ||
            staleYouths[0].createdAt,
          nowMs,
        )} ימים.`
      : "",
    priorityContacts.length
      ? `${priorityContacts.length} אנשי קשר מסומנים כצריכים תשומת לב.`
      : "",
  ].filter(Boolean);

  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PanelEyebrow icon={<AlertCircle className="h-4 w-4" />}>
          תור חכם ומעקב תגובות
        </PanelEyebrow>
        <div className="flex flex-wrap gap-2">
          <Badge tone="rose">{unresponsiveContacts.length} לא מגיבים</Badge>
          <Badge tone="amber">{staleYouths.length} נערים בלי עדכון</Badge>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-bold">
            <MessageCircle className="h-4 w-4 text-[#9b2f2f]" />
            מי לא מגיב
          </div>
          <div className="grid gap-2">
            {unresponsiveContacts.length === 0 ? (
              <EmptyState text="אין כרגע אנשי קשר שעברו את זמן ההמתנה לתגובה." />
            ) : (
              unresponsiveContacts.slice(0, 6).map((contact) => (
                <button
                  key={contact.id}
                  type="button"
                  onClick={() => onSelectContact(contact.id)}
                  className="rounded-lg border border-[#ead0cd] bg-[#fff8f7] p-3 text-right transition hover:border-[#d89c95]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold">{contact.name}</span>
                    <Badge tone="rose">
                      {daysSince(contact.lastContactedAt, nowMs)} ימים
                    </Badge>
                  </div>
                  <div className="mt-1 text-xs leading-5 text-[#686158]">
                    נשלח לאחרונה: {formatDateTime(contact.lastContactedAt)}
                  </div>
                  <p className="mt-2 text-xs leading-5 text-[#7b7368]">
                    {latestContactMessage(messages, contact.id) || "אין תקציר הודעה אחרונה."}
                  </p>
                </button>
              ))
            )}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-bold">
            <Users className="h-4 w-4 text-[#203864]" />
            נערים שצריך לעדכן
          </div>
          <div className="grid gap-2">
            {staleYouths.length === 0 ? (
              <EmptyState text="כל הנערים עודכנו במסגרת הזמן שהוגדרה." />
            ) : (
              staleYouths.slice(0, 6).map((youth) => {
                const contact = contactById.get(youth.contactId);
                return (
                  <button
                    key={youth.id}
                    type="button"
                    onClick={() => {
                      onSelectContact(youth.contactId);
                      onSelectYouth(youth.id);
                    }}
                    className="rounded-lg border border-[#d8d4e8] bg-[#f8f7fd] p-3 text-right transition hover:border-[#b9afd9]"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold">{youth.name}</span>
                      <Badge>{stageLabels[youth.stage]}</Badge>
                    </div>
                    <div className="mt-1 text-xs leading-5 text-[#686158]">
                      {contact?.name || "איש קשר לא ידוע"} · עודכן לפני{" "}
                      {daysSince(youth.lastUpdateAt || youth.updatedAt || youth.createdAt, nowMs)} ימים
                    </div>
                    <p className="mt-2 text-xs leading-5 text-[#7b7368]">
                      {youth.nextAction || "לא הוגדרה פעולה הבאה."}
                    </p>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <Mini label="ממתינים לתגובה אחרי" value={`${settings.noResponseFollowupDays} ימים`} />
        <Mini label="נער נחשב ישן אחרי" value={`${settings.staleYouthDays} ימים`} />
        <Mini label="צריך תשומת לב" value={`${priorityContacts.length} אנשי קשר`} />
      </div>

      <div className="mt-4 rounded-lg border border-[#e5ded2] bg-[#fbfaf7] p-3">
        <div className="flex items-center gap-2 text-sm font-bold">
          <Brain className="h-4 w-4 text-[#203864]" />
          המלצות עבודה
        </div>
        <div className="mt-2 grid gap-2">
          {recommendations.length ? (
            recommendations.map((recommendation) => (
              <div key={recommendation} className="text-sm leading-6 text-[#4e4841]">
                {recommendation}
              </div>
            ))
          ) : (
            <div className="text-sm leading-6 text-[#686158]">
              התור נראה רגוע, כדאי להתקדם לפי אנשי הקשר שמגיעים למעקב היום.
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}

function ReviewQueue({
  reviews,
  busy,
  reviewDrafts,
  setReviewDrafts,
  onAction,
}: {
  reviews: ReviewItem[];
  busy: string | null;
  reviewDrafts: Record<string, string>;
  setReviewDrafts: (value: Record<string, string>) => void;
  onAction: (id: string, action: "send" | "reject" | "edit") => void;
}) {
  const pending = reviews.filter((review) => review.status === "pending");
  return (
    <Panel>
      <div className="flex items-center justify-between gap-3">
        <PanelEyebrow icon={<ClipboardCheck className="h-4 w-4" />}>
          תור ביקורת
        </PanelEyebrow>
        <Badge tone="amber">{pending.length} פתוחות</Badge>
      </div>
      <div className="mt-4 grid gap-3">
        {pending.length === 0 ? (
          <EmptyState text="אין הודעות שממתינות לביקורת." />
        ) : (
          pending.map((review) => {
            const draft = reviewDrafts[review.id] ?? review.draftMessage;
            return (
              <div key={review.id} className="rounded-lg border border-[#e5ded2] bg-[#fbfaf7] p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold">{review.contactName}</span>
                  {review.youthName ? <Badge>{review.youthName}</Badge> : null}
                  <PriorityBadge priority={review.priority} />
                  <ConfidenceBadge text={review.aiReason} />
                </div>
                <textarea
                  value={draft}
                  onChange={(event) =>
                    setReviewDrafts({ ...reviewDrafts, [review.id]: event.target.value })
                  }
                  rows={4}
                  className="mt-3 w-full resize-y rounded-lg border border-[#d8d0c4] bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-[#1f7a5a]"
                />
                <p className="mt-2 text-xs leading-5 text-[#7b7368]">{review.aiReason}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <ActionButton busy={busy === review.id} tone="blue" onClick={() => onAction(review.id, "edit")} icon={<Save className="h-4 w-4" />}>
                    שמור
                  </ActionButton>
                  <ActionButton busy={busy === review.id} tone="green" onClick={() => onAction(review.id, "send")} icon={<Send className="h-4 w-4" />}>
                    שלח
                  </ActionButton>
                  <ActionButton busy={busy === review.id} tone="rose" onClick={() => onAction(review.id, "reject")} icon={<XCircle className="h-4 w-4" />}>
                    דחה
                  </ActionButton>
                </div>
              </div>
            );
          })
        )}
      </div>
    </Panel>
  );
}

function OwnerAlertsPanel({
  alerts,
  busy,
  onAction,
}: {
  alerts: OwnerAlert[];
  busy: string | null;
  onAction: (id: string, status: "handled" | "dismissed") => void;
}) {
  const open = alerts.filter((alert) => alert.status === "open");
  return (
    <Panel>
      <div className="flex items-center justify-between gap-3">
        <PanelEyebrow icon={<BellRing className="h-4 w-4" />}>
          מענה אישי
        </PanelEyebrow>
        <Badge tone="rose">{open.length} פתוחות</Badge>
      </div>
      <div className="mt-4 grid gap-3">
        {open.length === 0 ? (
          <EmptyState text="אין שיחות שממתינות למענה אישי." />
        ) : (
          open.map((alert) => (
            <div key={alert.id} className="rounded-lg border border-[#e5ded2] bg-[#fbfaf7] p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold">{alert.contactName}</span>
                <Badge tone={alert.urgency === "high" ? "rose" : "neutral"}>
                  {alert.urgency === "high" ? "דחוף" : "רגיל"}
                </Badge>
              </div>
              <p className="mt-2 text-sm leading-6 text-[#4e4841]">{alert.incomingText}</p>
              <p className="mt-2 text-xs leading-5 text-[#7b7368]">{alert.reason}</p>
              <div className="mt-3 rounded-lg border border-[#d8e5dc] bg-white p-3 text-sm leading-6 text-[#15583f]">
                {alert.suggestedOwnerReply}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <ActionButton busy={busy === alert.id} tone="green" onClick={() => onAction(alert.id, "handled")} icon={<UserCheck className="h-4 w-4" />}>
                  טופל
                </ActionButton>
                <ActionButton busy={busy === alert.id} tone="rose" onClick={() => onAction(alert.id, "dismissed")} icon={<XCircle className="h-4 w-4" />}>
                  סגור
                </ActionButton>
              </div>
            </div>
          ))
        )}
      </div>
    </Panel>
  );
}

function ContactManager(props: {
  contacts: Contact[];
  form: ContactForm;
  busy: string | null;
  selectedContactId: string;
  onFormChange: (form: ContactForm) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onEdit: (contact: Contact) => void;
  onDelete: (id: string) => void;
  onSelect: (id: string) => void;
}) {
  const { contacts, form, busy, selectedContactId, onFormChange, onSubmit, onEdit, onDelete, onSelect } = props;
  return (
    <Panel>
      <PanelEyebrow icon={<UserPlus className="h-4 w-4" />}>אנשי קשר</PanelEyebrow>
      <form onSubmit={onSubmit} className="mt-4 grid gap-3 sm:grid-cols-2">
        <TextInput label="שם" value={form.name} onChange={(value) => onFormChange({ ...form, name: value })} />
        <TextInput label="טלפון" value={form.phone} onChange={(value) => onFormChange({ ...form, phone: value })} />
        <TextInput label="מדינה" value={form.country} onChange={(value) => onFormChange({ ...form, country: value })} />
        <TextInput label="אזור זמן" value={form.timezone} onChange={(value) => onFormChange({ ...form, timezone: value })} />
        <TextInput label="שעה מומלצת" value={form.bestContactTime} onChange={(value) => onFormChange({ ...form, bestContactTime: value })} />
        <NumberInput label="חום קשר" value={form.warmthScore} onChange={(value) => onFormChange({ ...form, warmthScore: value })} />
        <SelectInput label="סטטוס" value={form.status} onChange={(value) => onFormChange({ ...form, status: value as Contact["status"] })} options={statusOptions} />
        <label className="flex h-10 items-center justify-between rounded-lg border border-[#d8d0c4] bg-white px-3 text-sm font-medium">
          שליחה אוטומטית
          <input type="checkbox" checked={form.allowAutoSend} onChange={(event) => onFormChange({ ...form, allowAutoSend: event.target.checked })} className="h-5 w-5 accent-[#1f7a5a]" />
        </label>
        <TextInput label="טון אישי" value={form.preferredTone} onChange={(value) => onFormChange({ ...form, preferredTone: value })} wide />
        <TextInput label="זיכרון סגנון" value={form.responseStyle} onChange={(value) => onFormChange({ ...form, responseStyle: value })} wide />
        <TextareaInput label="הערות" value={form.notes} onChange={(value) => onFormChange({ ...form, notes: value })} wide rows={3} />
        <div className="sm:col-span-2 flex flex-wrap gap-2">
          <ActionButton busy={busy === "contact"} tone="blue" icon={<Save className="h-4 w-4" />}>
            שמור איש קשר
          </ActionButton>
          <IconButton title="נקה" onClick={() => onFormChange(emptyContactForm)}>
            <XCircle className="h-4 w-4" />
            נקה
          </IconButton>
        </div>
      </form>
      <div className="mt-4 grid gap-2">
        {contacts.map((contact) => (
          <div key={contact.id} className={`rounded-lg border p-3 ${selectedContactId === contact.id ? "border-[#1f7a5a] bg-[#eef8f2]" : "border-[#e5ded2] bg-[#fbfaf7]"}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button type="button" onClick={() => onSelect(contact.id)} className="text-right font-bold">
                {contact.name}
              </button>
              <div className="flex gap-2">
                <button type="button" onClick={() => onEdit(contact)} title="ערוך" className="rounded-md border border-[#d8d0c4] bg-white p-2">
                  <Edit3 className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => onDelete(contact.id)} title="מחק" className="rounded-md border border-[#e2b9b9] bg-white p-2 text-[#8a2929]">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="mt-1 text-xs text-[#686158]">{contact.country} · {contact.phone} · {statusLabels[contact.status]}</div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function YouthManager(props: {
  contacts: Contact[];
  youths: Youth[];
  form: YouthForm;
  busy: string | null;
  selectedContactId: string;
  selectedYouthId: string;
  onFormChange: (form: YouthForm) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onEdit: (youth: Youth) => void;
  onDelete: (id: string) => void;
  onSelect: (id: string) => void;
}) {
  const {
    contacts,
    youths,
    form,
    busy,
    selectedContactId,
    selectedYouthId,
    onFormChange,
    onSubmit,
    onEdit,
    onDelete,
    onSelect,
  } = props;
  const shown = selectedContactId ? youths.filter((youth) => youth.contactId === selectedContactId) : youths;
  return (
    <Panel>
      <PanelEyebrow icon={<Users className="h-4 w-4" />}>נערים</PanelEyebrow>
      <form onSubmit={onSubmit} className="mt-4 grid gap-3 sm:grid-cols-2">
        <SelectInput label="איש קשר" value={form.contactId} onChange={(value) => onFormChange({ ...form, contactId: value })} options={contacts.map((contact) => ({ value: contact.id, label: contact.name }))} />
        <TextInput label="שם נער" value={form.name} onChange={(value) => onFormChange({ ...form, name: value })} />
        <TextInput label="עיר" value={form.city} onChange={(value) => onFormChange({ ...form, city: value })} />
        <SelectInput label="שלב" value={form.stage} onChange={(value) => onFormChange({ ...form, stage: value as Youth["stage"] })} options={stageOptions} />
        <TextareaInput label="אבני דרך" value={form.milestones} onChange={(value) => onFormChange({ ...form, milestones: value })} rows={3} wide />
        <TextareaInput label="פעולה הבאה" value={form.nextAction} onChange={(value) => onFormChange({ ...form, nextAction: value })} rows={3} wide />
        <div className="sm:col-span-2 flex flex-wrap gap-2">
          <ActionButton busy={busy === "youth"} tone="blue" icon={<Save className="h-4 w-4" />}>
            שמור נער
          </ActionButton>
          <IconButton title="נקה" onClick={() => onFormChange({ ...emptyYouthForm, contactId: selectedContactId || contacts[0]?.id || "" })}>
            <XCircle className="h-4 w-4" />
            נקה
          </IconButton>
        </div>
      </form>
      <div className="mt-4 grid gap-2">
        {shown.map((youth) => (
          <div
            key={youth.id}
            className={`rounded-lg border p-3 ${
              selectedYouthId === youth.id
                ? "border-[#203864] bg-[#eef3fb]"
                : "border-[#e5ded2] bg-[#fbfaf7]"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button type="button" onClick={() => onSelect(youth.id)} className="text-right">
                <div className="font-bold">{youth.name}</div>
                <div className="mt-1 text-xs text-[#686158]">{youth.city} · {stageLabels[youth.stage]}</div>
              </button>
              <div className="flex gap-2">
                <button type="button" onClick={() => onEdit(youth)} className="rounded-md border border-[#d8d0c4] bg-white p-2">
                  <Edit3 className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => onDelete(youth.id)} className="rounded-md border border-[#e2b9b9] bg-white p-2 text-[#8a2929]">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            <p className="mt-2 text-xs leading-5 text-[#686158]">{youth.nextAction}</p>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function ContactDetail({
  contact,
  youths,
  timeline,
  onLoadTimeline,
}: {
  contact?: Contact;
  youths: Youth[];
  timeline: ContactTimelineItem[];
  onLoadTimeline: () => void;
}) {
  return (
    <Panel>
      <div className="flex items-center justify-between gap-3">
        <PanelEyebrow icon={<FileText className="h-4 w-4" />}>כרטיס שיחה</PanelEyebrow>
        <IconButton title="טען ציר זמן" onClick={onLoadTimeline}>
          <RefreshCw className="h-4 w-4" />
          טען
        </IconButton>
      </div>
      {contact ? (
        <>
          <div className="mt-4 rounded-lg border border-[#e5ded2] bg-[#fbfaf7] p-4">
            <h3 className="text-lg font-bold">{contact.name}</h3>
            <div className="mt-1 text-sm text-[#686158]">{contact.phone} · {contact.country} · {contact.timezone}</div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <Mini label="טון" value={contact.preferredTone} />
              <Mini label="סגנון" value={contact.responseStyle} />
              <Mini label="שעה" value={contact.bestContactTime} />
              <Mini label="אוטומטי" value={contact.allowAutoSend ? "כן" : "לא"} />
            </div>
          </div>
          <div className="mt-4 grid gap-2">
            {youths.map((youth) => (
              <div key={youth.id} className="rounded-lg border border-[#e5ded2] bg-white p-3">
                <div className="font-bold">{youth.name}</div>
                <div className="mt-1 text-xs text-[#686158]">{stageLabels[youth.stage]} · {youth.milestones.join(", ") || "אין אבני דרך"}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-2">
            {timeline.length === 0 ? (
              <EmptyState text="טען ציר זמן כדי לראות היסטוריית שיחה." />
            ) : (
              timeline.map((item) => (
                <div key={`${item.type}-${item.id}`} className="rounded-lg border border-[#e5ded2] bg-[#fbfaf7] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-bold">{item.title}</span>
                    <span className="text-xs text-[#686158]">{new Date(item.createdAt).toLocaleDateString("he-IL")}</span>
                  </div>
                  <p className="mt-1 text-sm leading-6 text-[#4e4841]">{item.body}</p>
                </div>
              ))
            )}
          </div>
        </>
      ) : (
        <EmptyState text="בחר איש קשר." />
      )}
    </Panel>
  );
}

function ToolsPanel(props: {
  csvText: string;
  setCsvText: (value: string) => void;
  importResult: ImportResult | null;
  busy: string | null;
  onImport: () => void;
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  searchResults: SearchResult[];
  onSearch: (event?: FormEvent<HTMLFormElement>) => void;
  simulationText: string;
  setSimulationText: (value: string) => void;
  simulationFrom: string;
  setSimulationFrom: (value: string) => void;
  simulation: SimulationResult | null;
  onSimulate: (event: FormEvent<HTMLFormElement>) => void;
  weeklyReport: WeeklyReport | null;
  onWeeklyReport: () => void;
}) {
  return (
    <Panel>
      <PanelEyebrow icon={<SlidersHorizontal className="h-4 w-4" />}>
        כלים
      </PanelEyebrow>

      <div className="mt-4 grid gap-4">
        <form onSubmit={props.onSearch} className="flex gap-2">
          <input
            value={props.searchQuery}
            onChange={(event) => props.setSearchQuery(event.target.value)}
            placeholder="חיפוש חכם"
            className="h-10 min-w-0 flex-1 rounded-lg border border-[#d8d0c4] bg-[#fbfaf7] px-3 text-sm outline-none focus:border-[#1f7a5a]"
          />
          <ActionButton busy={props.busy === "search"} tone="blue" icon={<Search className="h-4 w-4" />}>
            חפש
          </ActionButton>
        </form>
        {props.searchResults.length ? (
          <div className="grid gap-2">
            {props.searchResults.map((result) => (
              <div key={`${result.kind}-${result.id}`} className="rounded-lg border border-[#e5ded2] bg-[#fbfaf7] p-3">
                <div className="font-bold">{result.title}</div>
                <div className="text-xs text-[#686158]">{result.kind} · {result.subtitle}</div>
                <p className="mt-1 text-sm leading-6 text-[#4e4841]">{result.body}</p>
              </div>
            ))}
          </div>
        ) : null}

        <form onSubmit={props.onSimulate} className="rounded-lg border border-[#e5ded2] bg-[#fbfaf7] p-3">
          <div className="flex items-center gap-2 text-xs font-bold text-[#6f675e]">
            <Brain className="h-4 w-4" />
            סימולטור מענה
          </div>
          <input
            value={props.simulationFrom}
            onChange={(event) => props.setSimulationFrom(event.target.value)}
            className="mt-2 h-10 w-full rounded-lg border border-[#d8d0c4] bg-white px-3 text-sm outline-none focus:border-[#1f7a5a]"
          />
          <textarea
            value={props.simulationText}
            onChange={(event) => props.setSimulationText(event.target.value)}
            rows={3}
            className="mt-2 w-full rounded-lg border border-[#d8d0c4] bg-white px-3 py-2 text-sm outline-none focus:border-[#1f7a5a]"
          />
          <div className="mt-2 flex justify-end">
            <ActionButton busy={props.busy === "simulate"} tone="blue" icon={<Brain className="h-4 w-4" />}>
              בדוק
            </ActionButton>
          </div>
          {props.simulation ? (
            <div className="mt-3 rounded-lg border border-[#d8e5dc] bg-white p-3 text-sm leading-6">
              <div className="font-bold">החלטה: {props.simulation.decision}</div>
              <div>{props.simulation.reason}</div>
              <div className="mt-1 text-[#686158]">{props.simulation.suggestedDraft}</div>
            </div>
          ) : null}
        </form>

        <div className="rounded-lg border border-[#e5ded2] bg-[#fbfaf7] p-3">
          <div className="flex items-center gap-2 text-xs font-bold text-[#6f675e]">
            <Upload className="h-4 w-4" />
            ייבוא CSV
          </div>
          <textarea
            value={props.csvText}
            onChange={(event) => props.setCsvText(event.target.value)}
            rows={5}
            placeholder="contactName,phone,country,youthName,city,nextAction"
            className="mt-2 w-full rounded-lg border border-[#d8d0c4] bg-white px-3 py-2 text-sm outline-none focus:border-[#1f7a5a]"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <ActionButton busy={props.busy === "import"} tone="blue" onClick={props.onImport} icon={<Upload className="h-4 w-4" />}>
              ייבא
            </ActionButton>
            <a className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#d8d0c4] bg-white px-3 text-sm font-bold" href="/api/export?format=csv">
              <Download className="h-4 w-4" />
              CSV
            </a>
            <a className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#d8d0c4] bg-white px-3 text-sm font-bold" href="/api/export?format=json">
              <Download className="h-4 w-4" />
              JSON
            </a>
          </div>
          {props.importResult ? (
            <p className="mt-2 text-xs leading-5 text-[#686158]">
              חדשים {props.importResult.contactsCreated}, עודכנו {props.importResult.contactsUpdated}, נערים {props.importResult.youthsCreated}
            </p>
          ) : null}
        </div>

        <div className="rounded-lg border border-[#e5ded2] bg-[#fbfaf7] p-3">
          <div className="flex items-center gap-2 text-xs font-bold text-[#6f675e]">
            <FileText className="h-4 w-4" />
            דוחות ופקודות קוליות
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <ActionButton busy={props.busy === "weekly"} tone="blue" onClick={props.onWeeklyReport} icon={<FileText className="h-4 w-4" />}>
              דוח שבועי
            </ActionButton>
            <span className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#d8d0c4] bg-white px-3 text-sm font-bold text-[#686158]">
              <Mic className="h-4 w-4" />
              קול דרך GNAPI
            </span>
          </div>
          {props.weeklyReport ? (
            <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-white p-3 text-sm leading-6 text-[#4e4841]">
              {props.weeklyReport.body}
            </pre>
          ) : null}
        </div>
      </div>
    </Panel>
  );
}

function PolicyPanel({
  policy,
  busy,
  onChange,
  onSave,
}: {
  policy: BotPolicy;
  busy: boolean;
  onChange: (policy: BotPolicy) => void;
  onSave: () => void;
}) {
  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PanelEyebrow icon={<Settings className="h-4 w-4" />}>
          מדיניות
        </PanelEyebrow>
        <ActionButton busy={busy} tone="blue" onClick={onSave} icon={<Save className="h-4 w-4" />}>
          שמור מדיניות
        </ActionButton>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-4">
        <TextareaInput label="מותר" value={policy.allowedTopics.join("\n")} onChange={(value) => onChange({ ...policy, allowedTopics: splitLines(value) })} rows={6} />
        <TextareaInput label="אסור" value={policy.forbiddenTopics.join("\n")} onChange={(value) => onChange({ ...policy, forbiddenTopics: splitLines(value) })} rows={6} />
        <TextareaInput label="הסלמה" value={policy.escalationTriggers.join("\n")} onChange={(value) => onChange({ ...policy, escalationTriggers: splitLines(value) })} rows={6} />
        <TextareaInput label="תאריכים חסומים" value={policy.blockedDates.join("\n")} onChange={(value) => onChange({ ...policy, blockedDates: splitLines(value) })} rows={6} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <TextInput label="קול הכתיבה" value={policy.botIdentity} onChange={(value) => onChange({ ...policy, botIdentity: value })} />
        <TextInput label="סגנון מענה" value={policy.allowedAnswerStyle} onChange={(value) => onChange({ ...policy, allowedAnswerStyle: value })} />
        <TextInput label="תגובה לשאלה לא קשורה" value={policy.unrelatedHoldingReply} onChange={(value) => onChange({ ...policy, unrelatedHoldingReply: value })} />
        <TextInput label="תגובה לנושא אסור" value={policy.forbiddenHoldingReply} onChange={(value) => onChange({ ...policy, forbiddenHoldingReply: value })} />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <CheckboxRow label="ביקורת לכל תשובה" checked={policy.requireReviewForAllReplies} onChange={(checked) => onChange({ ...policy, requireReviewForAllReplies: checked })} />
        <CheckboxRow label="התראה למנדי" checked={policy.notifyOwnerOnEscalation} onChange={(checked) => onChange({ ...policy, notifyOwnerOnEscalation: checked })} />
        <CheckboxRow label="לא בשבת" checked={policy.avoidShabbat} onChange={(checked) => onChange({ ...policy, avoidShabbat: checked })} />
        <CheckboxRow label="לא בחגים" checked={policy.avoidJewishHolidays} onChange={(checked) => onChange({ ...policy, avoidJewishHolidays: checked })} />
      </div>
    </Panel>
  );
}

function CommandPanel({
  command,
  commandReply,
  busy,
  onCommandChange,
  onSubmit,
}: {
  command: string;
  commandReply: string;
  busy: string | null;
  onCommandChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Panel>
      <PanelEyebrow icon={<MessageCircle className="h-4 w-4" />}>
        פקודת מנהל
      </PanelEyebrow>
      <form onSubmit={onSubmit} className="mt-4 flex gap-2">
        <input value={command} onChange={(event) => onCommandChange(event.target.value)} placeholder="סיכום / התראות / מדיניות / דוח שבועי" className="h-11 min-w-0 flex-1 rounded-lg border border-[#d8d0c4] bg-[#fbfaf7] px-3 text-sm outline-none focus:border-[#1f7a5a]" />
        <ActionButton busy={busy === "command"} tone="blue" icon={<Send className="h-4 w-4" />}>
          שלח
        </ActionButton>
      </form>
      {commandReply ? (
        <div className="mt-4 whitespace-pre-line rounded-lg border border-[#d8e5dc] bg-[#eef8f2] p-3 text-sm leading-6 text-[#15583f]">
          {commandReply}
        </div>
      ) : null}
    </Panel>
  );
}

function ReportPanel({ reports }: { reports: DashboardData["reports"] }) {
  return (
    <Panel>
      <PanelEyebrow icon={<ShieldCheck className="h-4 w-4" />}>
        עדכוני מנהל
      </PanelEyebrow>
      <div className="mt-4 grid gap-3">
        {reports.map((report) => (
          <div key={report.id} className="rounded-lg border border-[#e5ded2] bg-[#fbfaf7] p-3">
            <div className="text-sm font-bold">{report.title}</div>
            <p className="mt-1 text-sm leading-6 text-[#686158]">{report.body}</p>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function TextInput({
  label,
  value,
  onChange,
  wide,
  help,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  wide?: boolean;
  help?: string;
}) {
  return (
    <label className={wide ? "sm:col-span-2" : ""}>
      <span className="flex items-center gap-2 text-xs font-bold text-[#6f675e]">
        {label}
        {help ? <HelpTip text={help} /> : null}
      </span>
      <input value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-[#d8d0c4] bg-white px-3 text-sm outline-none focus:border-[#1f7a5a]" />
    </label>
  );
}

function NumberInput({
  label,
  value,
  onChange,
  min = 0,
  max = 365,
  help,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  help?: string;
}) {
  return (
    <label>
      <span className="flex items-center gap-2 text-xs font-bold text-[#6f675e]">
        {label}
        {help ? <HelpTip text={help} /> : null}
      </span>
      <input type="number" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} className="mt-1 h-10 w-full rounded-lg border border-[#d8d0c4] bg-white px-3 text-sm outline-none focus:border-[#1f7a5a]" />
    </label>
  );
}

function SelectInput({
  label,
  value,
  options,
  onChange,
  help,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  help?: string;
}) {
  return (
    <label>
      <span className="flex items-center gap-2 text-xs font-bold text-[#6f675e]">
        {label}
        {help ? <HelpTip text={help} /> : null}
      </span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-[#d8d0c4] bg-white px-3 text-sm outline-none focus:border-[#1f7a5a]">
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextareaInput({
  label,
  value,
  onChange,
  rows = 4,
  wide,
  help,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  wide?: boolean;
  help?: string;
}) {
  return (
    <label className={wide ? "sm:col-span-2" : ""}>
      <span className="flex items-center gap-2 text-xs font-bold text-[#6f675e]">
        {label}
        {help ? <HelpTip text={help} /> : null}
      </span>
      <textarea value={value} rows={rows} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full resize-y rounded-lg border border-[#d8d0c4] bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-[#1f7a5a]" />
    </label>
  );
}

function CheckboxRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex h-10 items-center justify-between gap-3 rounded-lg border border-[#d8d0c4] bg-white px-3 text-sm font-bold">
      {label}
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-5 w-5 accent-[#1f7a5a]" />
    </label>
  );
}

function ActionButton({
  children,
  icon,
  tone,
  busy,
  onClick,
  help,
}: {
  children: ReactNode;
  icon: ReactNode;
  tone: "blue" | "green" | "rose";
  busy?: boolean;
  onClick?: () => void;
  help?: string;
}) {
  const classes = {
    blue: "bg-[#203864] hover:bg-[#182b4d]",
    green: "bg-[#1f7a5a] hover:bg-[#176246]",
    rose: "bg-[#9b2f2f] hover:bg-[#842727]",
  };
  return (
    <button type={onClick ? "button" : "submit"} onClick={onClick} disabled={busy} className={`inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-bold text-white transition disabled:opacity-60 ${classes[tone]}`}>
      {icon}
      {children}
      {help ? <HelpTip text={help} light /> : null}
    </button>
  );
}

function HelpTip({ text, light }: { text: string; light?: boolean }) {
  return (
    <span className="group relative inline-flex">
      <CircleHelp
        className={[
          "h-4 w-4 shrink-0 cursor-help",
          light ? "text-white/85" : "text-[#8a8176]",
        ].join(" ")}
      />
      <span className="pointer-events-none absolute right-0 top-6 z-30 hidden w-64 rounded-lg border border-[#d8d0c4] bg-white p-3 text-right text-xs font-normal leading-5 text-[#4e4841] shadow-lg group-hover:block">
        {text}
      </span>
    </span>
  );
}

function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "amber" | "rose";
}) {
  const classes = {
    neutral: "bg-white text-[#686158]",
    amber: "bg-[#f7ecd2] text-[#7a5315]",
    rose: "bg-[#f6e1df] text-[#8a2929]",
  };
  return <span className={`rounded-md px-2 py-1 text-xs font-bold ${classes[tone]}`}>{children}</span>;
}

function PriorityBadge({ priority }: { priority: ReviewItem["priority"] }) {
  return (
    <Badge tone={priority === "high" ? "rose" : priority === "normal" ? "amber" : "neutral"}>
      {priority === "high" ? "גבוה" : priority === "normal" ? "רגיל" : "נמוך"}
    </Badge>
  );
}

function isSameDay(value: string, compare: string) {
  const first = new Date(value);
  const second = new Date(compare);
  return (
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate()
  );
}

function ConfidenceBadge({ text }: { text: string }) {
  const match = text.match(/(\d+)%/);
  if (!match) {
    return <Badge>אמון לא ידוע</Badge>;
  }
  const value = Number(match[1]);
  return <Badge tone={value >= 75 ? "neutral" : value >= 45 ? "amber" : "rose"}>{value}% אמון</Badge>;
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#e5ded2] bg-white p-2">
      <div className="text-xs font-bold text-[#6f675e]">{label}</div>
      <div className="mt-1 text-sm">{value}</div>
    </div>
  );
}

function createDashboardTimeline(
  dashboard: DashboardData,
  contactId: string,
): ContactTimelineItem[] {
  if (!contactId) {
    return [];
  }

  const contact = dashboard.contacts.find((item) => item.id === contactId);
  const youths = dashboard.youths.filter((youth) => youth.contactId === contactId);
  const contactItems: ContactTimelineItem[] = contact
    ? [
        {
          id: `contact-${contact.id}-created`,
          type: "contact_update",
          title: "איש קשר נכנס למערכת",
          body: contact.notes || "נפתח כרטיס איש קשר למעקב.",
          createdAt: contact.createdAt || contact.updatedAt || contact.nextDueAt,
          status: contact.status,
        },
      ]
    : [];

  return [
    ...contactItems,
    ...dashboard.messages
      .filter((message) => message.contactId === contactId)
      .map((message) => ({
        id: message.id,
        type: "message" as const,
        title: message.direction === "inbound" ? "הודעה נכנסת" : "הודעה יוצאת",
        body: message.aiSummary || message.body,
        createdAt: message.createdAt,
        status: message.direction,
      })),
    ...dashboard.reviews
      .filter((review) => review.contactId === contactId)
      .map((review) => ({
        id: review.id,
        type: "review" as const,
        title: "פריט ביקורת",
        body: review.draftMessage,
        createdAt: review.createdAt,
        status: review.status,
        youthId: review.youthId || null,
        youthName: review.youthName || null,
      })),
    ...dashboard.alerts
      .filter((alert) => alert.contactId === contactId)
      .map((alert) => ({
        id: alert.id,
        type: "alert" as const,
        title: "התראת מענה אישי",
        body: alert.incomingText,
        createdAt: alert.createdAt,
        status: alert.status,
      })),
    ...youths.map((youth) => ({
      id: `youth-${youth.id}-updated`,
      type: "youth_update" as const,
      title: `עדכון נער: ${youth.name}`,
      body: [
        `שלב: ${stageLabels[youth.stage]}`,
        youth.nextAction ? `פעולה הבאה: ${youth.nextAction}` : "",
        youth.milestones.length
          ? `אבני דרך: ${youth.milestones.join(", ")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
      createdAt:
        youth.lastUpdateAt ||
        youth.updatedAt ||
        youth.createdAt ||
        new Date().toISOString(),
      status: youth.stage,
      youthId: youth.id,
      youthName: youth.name,
    })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function isContactUnresponsive(
  contact: Contact,
  messages: DashboardData["messages"],
  waitDays: number,
  nowMs: number,
) {
  if (!contact.lastContactedAt || contact.status === "paused") {
    return false;
  }

  const lastContactedMs = new Date(contact.lastContactedAt).getTime();
  const hasInboundAfterLastContact = messages.some((message) => {
    return (
      message.contactId === contact.id &&
      message.direction === "inbound" &&
      new Date(message.createdAt).getTime() > lastContactedMs
    );
  });

  return !hasInboundAfterLastContact && daysSince(contact.lastContactedAt, nowMs) >= waitDays;
}

function isYouthStale(youth: Youth, staleDays: number, nowMs: number) {
  return daysSince(youth.lastUpdateAt || youth.updatedAt || youth.createdAt, nowMs) >= staleDays;
}

function lastYouthUpdateMs(youth: Youth) {
  return new Date(
    youth.lastUpdateAt || youth.updatedAt || youth.createdAt || 0,
  ).getTime();
}

function daysSince(value?: string | null, nowMs = Date.now()) {
  if (!value) {
    return 999;
  }

  const dateMs = new Date(value).getTime();
  if (Number.isNaN(dateMs)) {
    return 999;
  }

  return Math.max(0, Math.floor((nowMs - dateMs) / 86400000));
}

function latestContactMessage(
  messages: DashboardData["messages"],
  contactId: string,
) {
  const message = messages
    .filter((item) => item.contactId === contactId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (!message) {
    return "";
  }

  return message.aiSummary || message.body;
}

const messageTemplates = [
  { id: "gentle_checkin", label: "בדיקה עדינה" },
  { id: "no_response", label: "לא הגיב" },
  { id: "youth_progress", label: "התקדמות נער" },
  { id: "holiday_sensitive", label: "לפני שבת/חג" },
  { id: "short_confirm", label: "אישור קצר" },
];

function renderMessageTemplate(
  templateId: string,
  contact?: Contact,
  youth?: Youth,
  review?: ReviewItem,
) {
  const contactName = contact?.name || review?.contactName || "שלום וברכה";
  const youthName = youth?.name || review?.youthName || "הנערים";

  if (templateId === "no_response") {
    return `שלום וברכה ${contactName}, רק מוודא בעדינות שההודעה הקודמת הגיעה. אם יש עדכון קצר על ${youthName}, אשמח לשמוע כשנוח.`;
  }

  if (templateId === "youth_progress") {
    return `שלום וברכה ${contactName}, רציתי לשאול מה שלום ${youthName}. האם היה משהו חדש בענייני שיעור, שבת, תפילין, ברית או קשר נוסף?`;
  }

  if (templateId === "holiday_sensitive") {
    return `שלום וברכה ${contactName}, לפני שבת/חג רציתי לשאול בעדינות אם יש עדכון קצר על ${youthName}. בשורות טובות.`;
  }

  if (templateId === "short_confirm") {
    return `תודה רבה ${contactName}, קיבלתי. אעדכן אצלי ואמשיך לעקוב בעזרת השם.`;
  }

  return `שלום וברכה ${contactName}, מה שלומכם? רציתי לשאול בעדינות אם יש עדכון טוב על ${youthName}.`;
}

function urgencyRank(kind: string) {
  if (kind === "alert") {
    return 0;
  }
  if (kind === "review") {
    return 1;
  }
  if (kind === "unresponsive") {
    return 2;
  }
  if (kind === "stale_youth") {
    return 3;
  }
  return 4;
}

function workKindLabel(kind: string) {
  if (kind === "alert") {
    return "מענה אישי";
  }
  if (kind === "review") {
    return "אישור";
  }
  if (kind === "unresponsive") {
    return "לא מגיב";
  }
  if (kind === "stale_youth") {
    return "נער בלי עדכון";
  }
  return "תור";
}

function contactHealthRows(
  dashboard: DashboardData,
  unresponsiveContacts: Contact[],
  staleYouths: Youth[],
  nowMs: number,
) {
  const unresponsiveIds = new Set(unresponsiveContacts.map((contact) => contact.id));
  const staleByContact = staleYouths.reduce<Record<string, number>>((acc, youth) => {
    acc[youth.contactId] = (acc[youth.contactId] || 0) + 1;
    return acc;
  }, {});

  return dashboard.contacts
    .map((contact) => {
      const messages = dashboard.messages.filter(
        (message) => message.contactId === contact.id,
      );
      const inboundCount = messages.filter(
        (message) => message.direction === "inbound",
      ).length;
      const staleCount = staleByContact[contact.id] || 0;
      const days = daysSince(contact.lastContactedAt || contact.createdAt, nowMs);
      const score = clampPercent(
        contact.warmthScore +
          inboundCount * 4 -
          days * 0.8 -
          staleCount * 9 -
          (unresponsiveIds.has(contact.id) ? 25 : 0) -
          (contact.status === "paused" ? 20 : 0) -
          (contact.status === "needs_attention" ? 12 : 0),
      );
      const reason = [
        `${inboundCount} תגובות`,
        `${staleCount} נערים בלי עדכון`,
        `קשר אחרון לפני ${days} ימים`,
      ].join(" · ");

      return { contact, score, reason };
    })
    .sort((a, b) => a.score - b.score);
}

function reviewStatusLabel(status: ReviewItem["status"]) {
  if (status === "pending") {
    return "ממתין";
  }
  if (status === "approved") {
    return "אושר";
  }
  if (status === "rejected") {
    return "נדחה";
  }
  return "נשלח";
}

function youthProgressPercent(stage: Youth["stage"]) {
  const order: Youth["stage"][] = [
    "new",
    "warming",
    "learning",
    "mitzvah",
    "needs_followup",
  ];
  const index = order.indexOf(stage);
  if (index < 0) {
    return 0;
  }

  return Math.round(((index + 1) / order.length) * 100);
}

function addMinutesIso(minutesToAdd: number) {
  return new Date(Date.now() + minutesToAdd * 60000).toISOString();
}

function tomorrowAtIso(time: string) {
  const date = new Date();
  const [hours, minutes] = time.split(":").map(Number);
  date.setDate(date.getDate() + 1);
  date.setHours(hours || 9, minutes || 0, 0, 0);
  return date.toISOString();
}

function isToday(value: string | null | undefined, nowMs: number) {
  if (!value) {
    return false;
  }

  const date = new Date(value);
  const now = new Date(nowMs);
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function isWithinDays(value: string | null | undefined, nowMs: number, days: number) {
  if (!value) {
    return false;
  }

  const dateMs = new Date(value).getTime();
  if (Number.isNaN(dateMs)) {
    return false;
  }

  return nowMs - dateMs <= days * 86400000;
}

function dataQualityScore(dashboard: DashboardData) {
  const contactChecks = dashboard.contacts.flatMap((contact) => [
    Boolean(contact.phone),
    Boolean(contact.timezone),
    Boolean(contact.bestContactTime),
    Boolean(contact.notes || contact.responseStyle),
  ]);
  const youthChecks = dashboard.youths.flatMap((youth) => [
    Boolean(youth.contactId),
    Boolean(youth.nextAction),
    Boolean(youth.stage),
    Boolean(youth.lastUpdateAt || youth.updatedAt),
  ]);
  const checks = [...contactChecks, ...youthChecks];
  if (!checks.length) {
    return 0;
  }

  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function percent(value: number, total: number) {
  if (total <= 0) {
    return value > 0 ? 100 : 0;
  }

  return clampPercent((value / total) * 100);
}

function youthStageRows(youths: Youth[]): DistributionRowData[] {
  const total = youths.length;
  const tones: Record<Youth["stage"], DistributionRowData["tone"]> = {
    new: "blue",
    warming: "amber",
    learning: "green",
    mitzvah: "green",
    needs_followup: "rose",
  };

  return (Object.keys(stageLabels) as Youth["stage"][])
    .map((stage) => ({
      label: stageLabels[stage],
      value: youths.filter((youth) => youth.stage === stage).length,
      total,
      tone: tones[stage],
    }))
    .filter((row) => row.value > 0);
}

function contactStatusRows(contacts: Contact[]): DistributionRowData[] {
  const total = contacts.length;
  const tones: Record<Contact["status"], DistributionRowData["tone"]> = {
    active: "green",
    paused: "amber",
    needs_attention: "rose",
  };

  return (Object.keys(statusLabels) as Contact["status"][])
    .map((status) => ({
      label: statusLabels[status],
      value: contacts.filter((contact) => contact.status === status).length,
      total,
      tone: tones[status],
    }))
    .filter((row) => row.value > 0);
}

function reviewStatusRows(reviews: ReviewItem[]): DistributionRowData[] {
  const total = reviews.length;
  const labels: Record<ReviewItem["status"], string> = {
    pending: "ממתין",
    approved: "אושר",
    rejected: "נדחה",
    sent: "נשלח",
  };
  const tones: Record<ReviewItem["status"], DistributionRowData["tone"]> = {
    pending: "amber",
    approved: "blue",
    rejected: "rose",
    sent: "green",
  };
  const order: ReviewItem["status"][] = [
    "pending",
    "approved",
    "sent",
    "rejected",
  ];

  return order
    .map((status) => ({
      label: labels[status],
      value: reviews.filter((review) => review.status === status).length,
      total,
      tone: tones[status],
    }))
    .filter((row) => row.value > 0);
}

function topCountryRows(contacts: Contact[]): DistributionRowData[] {
  const total = contacts.length;
  const counts = contacts.reduce<Record<string, number>>((acc, contact) => {
    const label = contact.country.trim() || "לא ידוע";
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {});

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([label, value], index) => ({
      label,
      value,
      total,
      tone: (index === 0 ? "blue" : index === 1 ? "green" : "amber") as DistributionRowData["tone"],
    }));
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return "לא ידוע";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "לא ידוע";
  }

  return new Intl.DateTimeFormat("he-IL", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-[#d8d0c4] bg-[#fbfaf7] p-5 text-center text-sm font-medium text-[#686158]">
      {text}
    </div>
  );
}

const statusOptions = [
  { value: "active", label: "פעיל" },
  { value: "paused", label: "מושהה" },
  { value: "needs_attention", label: "צריך תשומת לב" },
];

const stageOptions = [
  { value: "new", label: "חדש" },
  { value: "warming", label: "מתחמם" },
  { value: "learning", label: "לומד" },
  { value: "mitzvah", label: "התקדמות במצווה" },
  { value: "needs_followup", label: "צריך מעקב" },
];

function contactToForm(contact: Contact): ContactForm {
  return {
    id: contact.id,
    name: contact.name,
    phone: contact.phone,
    country: contact.country,
    timezone: contact.timezone,
    language: contact.language,
    status: contact.status,
    preferredTone: contact.preferredTone,
    responseStyle: contact.responseStyle,
    bestContactTime: contact.bestContactTime,
    allowAutoSend: contact.allowAutoSend,
    nextDueAt: contact.nextDueAt ? toLocalInput(contact.nextDueAt) : "",
    notes: contact.notes,
    warmthScore: contact.warmthScore,
  };
}

function youthToForm(youth: Youth): YouthForm {
  return {
    id: youth.id,
    contactId: youth.contactId,
    name: youth.name,
    city: youth.city,
    stage: youth.stage,
    milestones: youth.milestones.join("\n"),
    nextAction: youth.nextAction,
  };
}

function toLocalInput(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toISOString().slice(0, 16);
}

function splitLines(value: string) {
  return value
    .split(/\r?\n|;/)
    .map((line) => line.trim())
    .filter(Boolean);
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json() as Promise<T>;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json() as Promise<T>;
}
