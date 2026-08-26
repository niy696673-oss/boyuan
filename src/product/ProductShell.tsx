import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  Building2,
  ChevronDown,
  Menu,
  Network,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import {
  NavLink,
  Route,
  Routes,
  useNavigate,
  useParams,
} from "react-router-dom";
import { setApiUser, type Bootstrap } from "../api";
import type { CompanyDirectoryClient } from "../capabilities/companies/client";
import {
  createPlatformNavigationClient,
  type GlobalSearchResults,
  type PlatformNavigationClient,
} from "../capabilities/navigation/client";
import type { PlatformNotificationV1 } from "../../shared/research-platform-v1";
import {
  createReviewQueueClient,
  type ReviewQueueClient,
} from "../capabilities/review/client";
import { WorkbenchPage } from "./WorkbenchPage";
import {
  CompaniesPage,
  CompanyDetailPage,
  CompanyImportPage,
} from "./CompanyPages";
import { IndustriesPage, IndustryDetailPage } from "./IndustryPages";
import { ConfirmationPage } from "./ConfirmationPage";
import { OperationsPage } from "./OperationsPage";

const defaultReviewClient = createReviewQueueClient();
const defaultNavigationClient = createPlatformNavigationClient();
const notificationPollIntervalMs = 5_000;

export function ProductShell({
  data,
  reload,
  reviewClient = defaultReviewClient,
  navigationClient = defaultNavigationClient,
  companyClient,
}: {
  data: Bootstrap;
  reload: () => void;
  reviewClient?: ReviewQueueClient;
  navigationClient?: PlatformNavigationClient;
  companyClient?: CompanyDirectoryClient;
}) {
  const navigate = useNavigate();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const notificationRequestRef = useRef<AbortController | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<GlobalSearchResults>();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [notifications, setNotifications] = useState<PlatformNotificationV1[]>(
    [],
  );
  const [notificationOpen, setNotificationOpen] = useState(false);

  const refreshNotifications = useCallback(() => {
    notificationRequestRef.current?.abort();
    const controller = new AbortController();
    notificationRequestRef.current = controller;
    void navigationClient
      .notifications(controller.signal)
      .then((result) => setNotifications(result.items))
      .catch(() => undefined);
  }, [navigationClient]);

  useEffect(() => {
    const controller = new AbortController();
    void reviewClient
      .list(controller.signal)
      .then((queue) => setPendingCount(queue.total))
      .catch(() => undefined);
    return () => controller.abort();
  }, [reviewClient]);

  useEffect(() => {
    refreshNotifications();
    const timer = window.setInterval(
      refreshNotifications,
      notificationPollIntervalMs,
    );
    window.addEventListener("focus", refreshNotifications);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshNotifications);
      notificationRequestRef.current?.abort();
    };
  }, [refreshNotifications]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInputRef.current?.focus();
        setSearchOpen(true);
      }
      if (event.key === "Escape") {
        setSearchOpen(false);
        setNotificationOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const query = searchQuery.trim();
    if (!query) {
      setSearchResults(undefined);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    const timer = window.setTimeout(() => {
      void navigationClient
        .search(query, controller.signal)
        .then((result) => setSearchResults(result))
        .catch(() => setSearchResults(undefined))
        .finally(() => setSearching(false));
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [navigationClient, searchQuery]);

  const searchItems = useMemo(
    () => searchResultItems(searchResults),
    [searchResults],
  );
  const unreadCount = notifications.filter((item) => !item.readAt).length;

  const openTarget = (targetUrl: string) => {
    setSearchOpen(false);
    setNotificationOpen(false);
    navigate(normalizeProductTarget(targetUrl));
  };

  const openNotification = async (notification: PlatformNotificationV1) => {
    if (!notification.readAt) {
      try {
        const updated = await navigationClient.markNotificationRead(
          notification.notificationId,
        );
        setNotifications((current) =>
          current.map((item) =>
            item.notificationId === updated.notificationId ? updated : item,
          ),
        );
      } catch {
        // The target remains useful even when the read receipt cannot be saved.
      }
    }
    openTarget(notification.targetUrl);
  };

  const navigation = (
    <>
      <NavLink to="/" end onClick={() => setMobileNavOpen(false)}>
        <Sparkles />
        工作台
      </NavLink>
      <NavLink to="/companies" onClick={() => setMobileNavOpen(false)}>
        <Building2 />
        公司
      </NavLink>
      <NavLink to="/industry" onClick={() => setMobileNavOpen(false)}>
        <Network />
        行业
      </NavLink>
      {["knowledge_admin", "system_admin"].includes(data.user.role) && (
        <NavLink to="/admin" onClick={() => setMobileNavOpen(false)}>
          <Settings />
          管理后台
        </NavLink>
      )}
    </>
  );

  return (
    <div className="by-app">
      <a className="by-skip-link" href="#by-main">
        跳至主要内容
      </a>
      <header className="by-global-nav">
        <NavLink className="by-brand" to="/" aria-label="博源 AI 首页">
          <span className="by-brand-symbol">
            <Sparkles />
          </span>
          <strong>博源 AI</strong>
        </NavLink>

        <nav className="by-primary-nav" aria-label="一级导航">
          {navigation}
        </nav>

        <div className="by-global-search">
          <Search />
          <input
            ref={searchInputRef}
            value={searchQuery}
            placeholder="搜索公司、行业、材料或对话"
            aria-label="全局搜索"
            onFocus={() => setSearchOpen(true)}
            onChange={(event) => {
              setSearchQuery(event.target.value);
              setSearchOpen(true);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && searchItems[0]) {
                openTarget(searchItems[0].targetUrl);
              }
            }}
          />
          <kbd>⌘ K</kbd>
          {searchOpen && searchQuery.trim() && (
            <div className="by-search-panel" role="listbox">
              <header>
                <strong>
                  {searching ? "正在搜索…" : `找到 ${searchItems.length} 项`}
                </strong>
                {searchResults && <small>{searchResults.modelId}</small>}
              </header>
              {!searching && !searchItems.length && (
                <p>没有匹配的公司、行业、材料或对话。</p>
              )}
              {searchItems.map((item) => (
                <button
                  key={`${item.kind}:${item.targetUrl}`}
                  onClick={() => openTarget(item.targetUrl)}
                >
                  <span>{item.kind}</span>
                  <strong>{item.title}</strong>
                  <small>{item.reason}</small>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="by-global-actions">
          <NavLink className="by-pending-link" to="/confirmations">
            <ShieldCheck />
            <span>待确认</span>
            <em>{pendingCount}</em>
          </NavLink>
          <button
            className="by-icon-button"
            aria-label="通知"
            aria-expanded={notificationOpen}
            onClick={() => {
              const nextOpen = !notificationOpen;
              setNotificationOpen(nextOpen);
              if (nextOpen) refreshNotifications();
              setSearchOpen(false);
            }}
          >
            <Bell />
            {unreadCount > 0 && <i />}
          </button>
          {notificationOpen && (
            <div className="by-notification-panel">
              <header>
                <strong>通知</strong>
                <small>{unreadCount} 条未读</small>
              </header>
              {!notifications.length && <p>暂时没有新的通知。</p>}
              {notifications.slice(0, 20).map((item) => (
                <button
                  className={item.readAt ? "read" : "unread"}
                  key={item.notificationId}
                  onClick={() => void openNotification(item)}
                >
                  <strong>{item.title}</strong>
                  <span>{item.description}</span>
                  <small>
                    {new Date(item.createdAt).toLocaleString("zh-CN")}
                  </small>
                </button>
              ))}
            </div>
          )}
          <div className="by-user-menu-wrap">
            <button
              className="by-user-trigger"
              aria-expanded={userMenuOpen}
              onClick={() => setUserMenuOpen((open) => !open)}
            >
              <span>{data.user.name.slice(0, 1)}</span>
              <strong>{data.user.name}</strong>
              <ChevronDown />
            </button>
            {userMenuOpen && (
              <div className="by-user-menu">
                <p>切换演示身份</p>
                {data.users.map((user) => (
                  <button
                    key={user.id}
                    className={user.id === data.user.id ? "active" : ""}
                    onClick={() => {
                      setApiUser(user.id);
                      setUserMenuOpen(false);
                      reload();
                    }}
                  >
                    <span>{user.name}</span>
                    <small>{roleLabel(user.role)}</small>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            className="by-mobile-menu-button"
            aria-label={mobileNavOpen ? "关闭导航" : "打开导航"}
            onClick={() => setMobileNavOpen((open) => !open)}
          >
            {mobileNavOpen ? <X /> : <Menu />}
          </button>
        </div>
      </header>

      {mobileNavOpen && <nav className="by-mobile-nav">{navigation}</nav>}

      <main className="by-main" id="by-main">
        <Routes>
          <Route
            path="/"
            element={
              <WorkbenchPage
                data={data}
                reload={reload}
                companyClient={companyClient}
                persistentPendingCount={pendingCount}
              />
            }
          />
          <Route
            path="/workbench/conversations/:conversationId"
            element={
              <WorkbenchConversationRoute
                data={data}
                reload={reload}
                persistentPendingCount={pendingCount}
              />
            }
          />
          <Route
            path="/companies"
            element={
              <CompaniesPage data={data} companyClient={companyClient} />
            }
          />
          <Route
            path="/companies/import"
            element={<CompanyImportPage data={data} reload={reload} />}
          />
          <Route
            path="/companies/:id"
            element={
              <CompanyDetailPage
                data={data}
                reload={reload}
                companyClient={companyClient}
              />
            }
          />
          <Route
            path="/industry"
            element={<IndustriesPage data={data} reload={reload} />}
          />
          <Route
            path="/industry/:id"
            element={<IndustryDetailPage data={data} />}
          />
          <Route
            path="/confirmations"
            element={
              <ConfirmationPage
                data={data}
                reload={reload}
                reviewClient={reviewClient}
                onQueueCountChange={setPendingCount}
              />
            }
          />
          <Route
            path="/tasks"
            element={
              <OperationsPage data={data} mode="tasks" reload={reload} />
            }
          />
          <Route
            path="/admin"
            element={
              <OperationsPage data={data} mode="admin" reload={reload} />
            }
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </div>
  );
}

function WorkbenchConversationRoute({
  data,
  reload,
  persistentPendingCount,
}: {
  data: Bootstrap;
  reload: () => void;
  persistentPendingCount: number;
}) {
  const { conversationId } = useParams();
  return (
    <WorkbenchPage
      data={data}
      reload={reload}
      persistentPendingCount={persistentPendingCount}
      initialConversationId={conversationId}
    />
  );
}

function searchResultItems(results: GlobalSearchResults | undefined) {
  if (!results) return [];
  return [
    ...results.companies.map((item) => ({
      kind: "公司",
      title: item.canonicalName,
      reason: item.match.reason,
      score: item.match.score,
      targetUrl: `/companies/${encodeURIComponent(item.companyId)}`,
    })),
    ...results.industries.map((item) => ({
      kind: "行业",
      title: item.name,
      reason: item.match.reason,
      score: item.match.score,
      targetUrl: `/industry/${encodeURIComponent(item.industryId)}`,
    })),
    ...results.materials.map((item) => ({
      kind: "材料",
      title: item.fileName,
      reason: item.match.reason,
      score: item.match.score,
      targetUrl: `/workbench/conversations/${encodeURIComponent(item.conversationId)}`,
    })),
    ...results.conversations.map((item) => ({
      kind: "对话",
      title: item.title,
      reason: item.match.reason,
      score: item.match.score,
      targetUrl: `/workbench/conversations/${encodeURIComponent(item.conversationId)}`,
    })),
  ]
    .sort((left, right) => right.score - left.score)
    .slice(0, 24);
}

function normalizeProductTarget(targetUrl: string) {
  const [path, query = ""] = targetUrl.split("?", 2);
  if (path !== "/") return targetUrl;
  const conversationId = new URLSearchParams(query).get("conversationId");
  return conversationId
    ? `/workbench/conversations/${encodeURIComponent(conversationId)}`
    : targetUrl;
}

function NotFound() {
  return (
    <section className="by-empty-page">
      <span>404</span>
      <h1>没有找到这个页面</h1>
      <p>该入口可能已经移动，返回工作台继续研究。</p>
      <NavLink to="/">返回工作台</NavLink>
    </section>
  );
}

function roleLabel(role: string) {
  return (
    {
      investor: "投资经理",
      partner: "投资合伙人",
      knowledge_admin: "知识运营",
      system_admin: "系统管理员",
    }[role] || role
  );
}
