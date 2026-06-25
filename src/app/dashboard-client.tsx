"use client";

import {
  Activity,
  AlertCircle,
  Ban,
  BellRing,
  Brain,
  CalendarDays,
  CheckCircle2,
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
  Contact,
  ContactTimelineItem,
  DashboardData,
  ImportResult,
  IntegrationHealth,
  OwnerAlert,
  ReviewItem,
  SearchResult,
  SimulationResult,
  WeeklyReport,
  Youth,
} from "@/lib/types";

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
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    setLoading(true);
    const data = await fetchJson<DashboardData>("/api/dashboard");
    setDashboard(data);
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
    await fetch("/api/cron/daily", { method: "POST" });
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

  async function reviewAction(id: string, action: "send" | "reject" | "edit") {
    setBusy(id);
    await postJson("/api/reviews", {
      id,
      action,
      draftMessage: reviewDrafts[id],
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

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <section className="grid gap-4 lg:grid-cols-[1.35fr_0.9fr]">
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
                  {dashboard.settings.dailyContactLimit} פניות ביום · שבת{" "}
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
              </button>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-4">
              <ControlMetric label="מגיעים לתור" value={dueContacts.length} icon={<Users className="h-4 w-4" />} />
              <ControlMetric label="שעת שקט" value={`${dashboard.settings.quietHoursStart}-${dashboard.settings.quietHoursEnd}`} icon={<PauseCircle className="h-4 w-4" />} />
              <ControlMetric label="תאריכים חסומים" value={dashboard.policy.blockedDates.length} icon={<Ban className="h-4 w-4" />} />
              <ControlMetric label="מענה אישי" value={dashboard.stats.openOwnerAlerts} icon={<BellRing className="h-4 w-4" />} />
            </div>
          </Panel>
          <IntegrationPanel health={dashboard.health} />
        </section>

        <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard label="אנשי קשר" value={dashboard.stats.activeContacts} icon={<Phone className="h-5 w-5" />} tone="green" />
          <StatCard label="נערים" value={dashboard.stats.trackedYouths} icon={<Users className="h-5 w-5" />} tone="blue" />
          <StatCard label="ביקורות" value={dashboard.stats.pendingReviews} icon={<ClipboardCheck className="h-5 w-5" />} tone="amber" />
          <StatCard label="ישנים" value={dashboard.stats.staleContacts} icon={<AlertCircle className="h-5 w-5" />} tone="rose" />
          <StatCard label="שיעור שליחה" value={dashboard.stats.responseRate} suffix="%" icon={<Activity className="h-5 w-5" />} tone="green" />
        </section>

        <section className="mt-5">
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

        <section className="mt-5 grid gap-5 xl:grid-cols-[1.2fr_1fr]">
          <ReviewQueue
            reviews={dashboard.reviews}
            busy={busy}
            reviewDrafts={reviewDrafts}
            setReviewDrafts={setReviewDrafts}
            onAction={reviewAction}
          />
          <OwnerAlertsPanel alerts={dashboard.alerts} busy={busy} onAction={alertAction} />
        </section>

        <section className="mt-5 grid gap-5 xl:grid-cols-[1fr_1fr]">
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

        <section className="mt-5">
          <PolicyPanel
            policy={policyDraft}
            busy={busy === "policy"}
            onChange={setPolicyDraft}
            onSave={savePolicy}
          />
        </section>

        <section className="mt-5 grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  wide?: boolean;
}) {
  return (
    <label className={wide ? "sm:col-span-2" : ""}>
      <span className="text-xs font-bold text-[#6f675e]">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-[#d8d0c4] bg-white px-3 text-sm outline-none focus:border-[#1f7a5a]" />
    </label>
  );
}

function NumberInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label>
      <span className="text-xs font-bold text-[#6f675e]">{label}</span>
      <input type="number" min={0} max={100} value={value} onChange={(event) => onChange(Number(event.target.value))} className="mt-1 h-10 w-full rounded-lg border border-[#d8d0c4] bg-white px-3 text-sm outline-none focus:border-[#1f7a5a]" />
    </label>
  );
}

function SelectInput({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span className="text-xs font-bold text-[#6f675e]">{label}</span>
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  wide?: boolean;
}) {
  return (
    <label className={wide ? "sm:col-span-2" : ""}>
      <span className="text-xs font-bold text-[#6f675e]">{label}</span>
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
}: {
  children: ReactNode;
  icon: ReactNode;
  tone: "blue" | "green" | "rose";
  busy?: boolean;
  onClick?: () => void;
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
    </button>
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
