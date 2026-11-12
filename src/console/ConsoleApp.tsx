import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { HashRouter, NavLink, Navigate, Route, Routes } from "react-router-dom";
import { Icon, type IconName } from "../components/Icon";
import { Avatar, ErrorNote, Spinner } from "../components/ui";
import { errorText } from "../lib/format";
import { ROLE_LABEL } from "../lib/types";
import { useConsoleAuth, useLeader } from "./auth";
import { fetchTeam, type Team } from "./data";
import { Access } from "./pages/Access";
import { ChangeLog } from "./pages/ChangeLog";
import { Overview } from "./pages/Overview";
import { People } from "./pages/People";
import { Person } from "./pages/Person";
import { RoadmapEditor } from "./pages/RoadmapEditor";

interface TeamCtx {
  team: Team;
  reload: () => Promise<void>;
}
const TeamContext = createContext<TeamCtx | null>(null);

export function useTeam(): TeamCtx {
  const ctx = useContext(TeamContext);
  if (!ctx) throw new Error("useTeam must be used inside the console shell");
  return ctx;
}

export function ConsoleApp() {
  const { status, message, signIn } = useConsoleAuth();

  if (status === "loading") {
    return (
      <div className="center-screen">
        <div className="spinner" />
        <p className="muted">Signing you in…</p>
      </div>
    );
  }
  if (status === "not-configured") {
    return (
      <div className="center-screen">
        <h1 className="h1">Almost there</h1>
        <p className="body">
          Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to <code>.env.local</code>. See docs/SETUP.md.
        </p>
      </div>
    );
  }
  if (status !== "ready") return <SignIn message={message} onSignIn={signIn} />;

  return (
    <HashRouter>
      <Shell />
    </HashRouter>
  );
}

function SignIn({ message, onSignIn }: { message: string | null; onSignIn: () => void }) {
  return (
    <div className="signin">
      <section className="signin__brand">
        <span className="signin__mark">TTT</span>
        <h1 className="signin__title">Leaders' console</h1>
        <p className="signin__lede">
          For trainers, admins and Heads of Department of the worship team. See where everyone is on the road,
          sign off steps and record what people accomplish.
        </p>
      </section>
      <section className="signin__panel">
        <div className="signin__card">
          <h2 className="h2">Sign in</h2>
          <p className="body">Use the Google account your Head of Department added for you.</p>
          <button className="google-btn" onClick={onSignIn}>
            <GoogleMark />
            Sign in with Google
          </button>
          <ErrorNote error={message} />
          <p className="tiny muted">
            Trainees use TTT in Telegram. Everything you change here shows up there straight away.
          </p>
        </div>
      </section>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z" />
      <path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.2-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />
    </svg>
  );
}

const NAV: { to: string; label: string; icon: IconName; headOnly?: boolean }[] = [
  { to: "/", label: "Overview", icon: "home" },
  { to: "/people", label: "People", icon: "community" },
  { to: "/roadmap", label: "Roadmap", icon: "journey" },
  { to: "/access", label: "Console access", icon: "lock", headOnly: true },
  { to: "/log", label: "Change log", icon: "text", headOnly: true },
];

function Shell() {
  const me = useLeader();
  const { isHead, signOut } = useConsoleAuth();
  const [team, setTeam] = useState<Team | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setTeam(await fetchTeam());
    } catch (e) {
      setError(errorText(e));
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return (
    <div className="console">
      <aside className="console__nav">
        <div className="console__brand">
          <span className="signin__mark signin__mark--sm">TTT</span>
          <span>Leaders' console</span>
        </div>
        <nav className="console__links" aria-label="Sections">
          {NAV.filter((n) => !n.headOnly || isHead).map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === "/"} className={({ isActive }) => `console__link${isActive ? " is-active" : ""}`}>
              <Icon name={n.icon} size={18} />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="console__me">
          <Avatar name={me.display_name} photo={me.photo_url} />
          <span className="stack" style={{ gap: 0, minWidth: 0 }}>
            <span className="small" style={{ fontWeight: 700 }}>
              {me.display_name}
            </span>
            <span className="tiny muted">{ROLE_LABEL[me.role]}</span>
          </span>
          <button className="btn btn--sm btn--ghost" onClick={signOut}>
            Sign out
          </button>
        </div>
      </aside>

      <main className="console__main">
        <ErrorNote error={error} />
        {!team ? (
          <Spinner />
        ) : (
          <TeamContext.Provider value={{ team, reload }}>
            <Routes>
              <Route path="/" element={<Overview />} />
              <Route path="/people" element={<People />} />
              <Route path="/people/:personId" element={<Person />} />
              <Route path="/roadmap" element={<RoadmapEditor />} />
              <Route path="/access" element={isHead ? <Access /> : <Navigate to="/" replace />} />
              <Route path="/log" element={isHead ? <ChangeLog /> : <Navigate to="/" replace />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </TeamContext.Provider>
        )}
      </main>
    </div>
  );
}
