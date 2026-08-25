import { useEffect, useState } from "react";
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
import { NavLink, Route, Routes } from "react-router-dom";
import { setApiUser, type Bootstrap } from "../api";
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

export function ProductShell({
  data,
  reload,
  reviewClient = defaultReviewClient,
}: {
  data: Bootstrap;
  reload: () => void;
  reviewClient?: ReviewQueueClient;
}) {
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void reviewClient
      .list(controller.signal)
      .then((queue) => setPendingCount(queue.total))
      .catch(() => undefined);
    return () => controller.abort();
  }, [reviewClient]);

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

        <label className="by-global-search">
          <Search />
          <input placeholder="搜索公司、行业、材料或对话" />
          <kbd>⌘ K</kbd>
        </label>

        <div className="by-global-actions">
          <NavLink className="by-pending-link" to="/confirmations">
            <ShieldCheck />
            <span>待确认</span>
            <em>{pendingCount}</em>
          </NavLink>
          <button className="by-icon-button" aria-label="通知">
            <Bell />
            <i />
          </button>
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
                persistentPendingCount={pendingCount}
              />
            }
          />
          <Route path="/companies" element={<CompaniesPage data={data} />} />
          <Route
            path="/companies/import"
            element={<CompanyImportPage data={data} reload={reload} />}
          />
          <Route
            path="/companies/:id"
            element={<CompanyDetailPage data={data} reload={reload} />}
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
