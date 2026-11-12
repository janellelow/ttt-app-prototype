import { useEffect, type ReactNode } from "react";
import { initials } from "../lib/format";
import type { Role } from "../lib/types";
import { Icon } from "./Icon";

export function Avatar({ name, photo, large }: { name: string; photo?: string | null; large?: boolean }) {
  return (
    <span className={`avatar${large ? " avatar--lg" : ""}`} aria-hidden="true">
      {photo ? <img src={photo} alt="" referrerPolicy="no-referrer" /> : initials(name)}
    </span>
  );
}

export function RoleBadge({ role }: { role: Role }) {
  if (role === "trainee") return null;
  return <span className="badge badge--role">{role === "admin" ? "Admin" : "Trainer"}</span>;
}

export function PrivateBadge({ children }: { children: ReactNode }) {
  return (
    <span className="badge">
      <Icon name="lock" size={13} />
      {children}
    </span>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className="row" style={{ justifyContent: "center", padding: 24 }} role="status">
      <div className="spinner" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p className="error" role="alert">
      {error}
    </p>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card" style={{ alignItems: "flex-start" }}>
      <span className="h3">{title}</span>
      {children ? <p className="body">{children}</p> : null}
    </div>
  );
}

/** Bottom sheet. Closes on backdrop tap or Escape. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet__handle" />
        <div className="row row--between">
          <h2 className="h2">{title}</h2>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            <Icon name="close" size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
