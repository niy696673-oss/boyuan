import { useEffect, useState } from "react";
import { CircleAlert, LoaderCircle, Sparkles } from "lucide-react";
import { api, ApiError, type Bootstrap } from "./api";
import { ProductShell } from "./product/ProductShell";

export default function App() {
  const [data, setData] = useState<Bootstrap | null>(null);
  const [error, setError] = useState("");
  const [authRequired, setAuthRequired] = useState(false);

  const load = () =>
    api
      .bootstrap()
      .then((value) => {
        setData(value);
        setError("");
        setAuthRequired(false);
      })
      .catch((reason) => {
        setError(reason instanceof Error ? reason.message : "加载失败");
        setAuthRequired(reason instanceof ApiError && reason.status === 401);
      });

  useEffect(() => {
    void load();
  }, []);

  if (authRequired) return <Login onSuccess={load} />;
  if (error)
    return (
      <main className="by-center-state">
        <CircleAlert />
        <h1>暂时无法进入工作台</h1>
        <p>{error}</p>
        <button onClick={() => void load()}>重新连接</button>
      </main>
    );
  if (!data)
    return (
      <main className="by-center-state loading">
        <span><Sparkles /></span>
        <LoaderCircle />
        <p>正在加载有权限的机构知识</p>
      </main>
    );
  return <ProductShell data={data} reload={load} />;
}

function Login({ onSuccess }: { onSuccess: () => void }) {
  const [email, setEmail] = useState("admin@boyuan.local");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <main className="by-login-page">
      <section>
        <div className="by-login-brand"><span><Sparkles /></span><strong>博源 AI</strong></div>
        <div><span>机构研究工作台</span><h1>让材料进入工作，<br />让知识留在机构。</h1><p>以对话开始研究，以公司沉淀认知，以证据和人工确认控制知识质量。</p></div>
      </section>
      <form onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError("");
        try { await api.login(email, password); onSuccess(); } catch (reason) { setError(reason instanceof Error ? reason.message : "登录失败"); } finally { setBusy(false); }
      }}>
        <span>安全登录</span><h2>进入博源 AI 平台</h2><p>使用机构账号访问获得授权的材料与知识。</p>
        <label>邮箱<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
        <label>密码<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required placeholder="输入机构账号密码" /></label>
        {error && <div className="by-login-error"><CircleAlert />{error}</div>}
        <button disabled={busy}>{busy ? "正在验证" : "安全登录"}</button>
        <small>登录和材料访问行为会被记录在审计日志中。</small>
      </form>
    </main>
  );
}
