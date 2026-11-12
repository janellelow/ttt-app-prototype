import { useEffect } from "react";
import { HashRouter, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { TabBar } from "./components/TabBar";
import { useAuth } from "./lib/auth";
import { tg } from "./lib/telegram";
import { Admin } from "./pages/Admin";
import { Community } from "./pages/Community";
import { Course } from "./pages/Course";
import { Feedback } from "./pages/Feedback";
import { FeedbackThread } from "./pages/FeedbackThread";
import { Learn } from "./pages/Learn";
import { Manage } from "./pages/Manage";
import { QuizPage } from "./pages/Quiz";
import { Wrapped } from "./pages/Wrapped";

const TAB_ROOTS = ["/", "/learn", "/feedback"];

/** Shows Telegram's own back button on inner screens. */
function TelegramBackButton() {
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    if (!tg) return;
    const onBack = () => navigate(-1);
    if (TAB_ROOTS.includes(location.pathname)) {
      tg.BackButton.hide();
    } else {
      tg.BackButton.show();
      tg.BackButton.onClick(onBack);
    }
    return () => tg?.BackButton.offClick(onBack);
  }, [location.pathname, navigate]);
  return null;
}

function WithTabs() {
  return (
    <>
      <Outlet />
      <TabBar />
    </>
  );
}

function StaffOnly({ children }: { children: JSX.Element }) {
  const { isStaff } = useAuth();
  return isStaff ? children : <Navigate to="/" replace />;
}

export function App() {
  const { status, error, retry } = useAuth();

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
          Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to <code>.env.local</code>, then
          restart <code>npm run dev</code>. See docs/SETUP.md.
        </p>
      </div>
    );
  }

  if (status === "outside-telegram") {
    return (
      <div className="center-screen">
        <h1 className="h1">Open TTT in Telegram</h1>
        <p className="body">
          This app signs you in with your Telegram account, so it only works when opened from the bot's menu button
          in Telegram.
        </p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="center-screen">
        <h1 className="h1">Couldn't sign you in</h1>
        <p className="body">{error}</p>
        <button className="btn btn--primary" onClick={retry}>
          Try again
        </button>
      </div>
    );
  }

  return (
    <HashRouter>
      <TelegramBackButton />
      <Routes>
        <Route element={<WithTabs />}>
          <Route path="/" element={<Community />} />
          <Route path="/learn" element={<Learn />} />
          <Route path="/learn/:courseId" element={<Course />} />
          <Route path="/feedback" element={<Feedback />} />
          <Route path="/feedback/:submissionId" element={<FeedbackThread />} />
          <Route path="/admin" element={<StaffOnly><Admin /></StaffOnly>} />
          <Route path="/manage" element={<StaffOnly><Manage /></StaffOnly>} />
        </Route>
        <Route path="/quiz/:quizId" element={<QuizPage />} />
        <Route path="/wrapped" element={<Wrapped />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
