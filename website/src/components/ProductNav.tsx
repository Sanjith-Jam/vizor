import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowUpRight, Menu, X } from "lucide-react";
export function ProductNav() {
  const [open, setOpen] = useState(false),
    panel = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    if (!open) return;
    const main = document.getElementById("main");
    if (main) main.inert = true;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.querySelector<HTMLAnchorElement>("a")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
      if (e.key === "Tab") {
        const items = [
          trigger.current,
          ...Array.from(
            panel.current?.querySelectorAll<HTMLElement>("a,button") || [],
          ),
        ].filter(Boolean) as HTMLElement[];
        const index = items.indexOf(document.activeElement as HTMLElement);
        if (e.shiftKey && index <= 0) {
          e.preventDefault();
          items.at(-1)?.focus();
        } else if (!e.shiftKey && index === items.length - 1) {
          e.preventDefault();
          items[0]?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      if (main) main.inert = false;
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  return (
    <>
      <header
        className={`product-nav ${location.pathname !== "/" ? "nav-solid" : ""}`}
      >
        <Link className="wordmark" to="/" aria-label="Vizor home">
          VIZOR<span>01</span>
        </Link>
        <div className="nav-right">
          <span className="nav-caption">A BETTER WAY FORWARD.</span>
          <Link className="nav-launch" to="/demo">
            Explore the experience <ArrowUpRight size={16} />
          </Link>
          <button
            ref={trigger}
            className="menu-toggle"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="product-menu"
            onClick={() => setOpen(!open)}
          >
            {open ? <X /> : <Menu />}
          </button>
        </div>
      </header>
      <div
        ref={panel}
        id="product-menu"
        className={`product-menu ${open ? "is-open" : ""}`}
        inert={!open}
        aria-hidden={!open}
      >
        <div className="menu-index">01 — FIND YOUR WAY</div>
        <nav>
          {[
            ["The helmet", "/"],
            ["The experience", "/demo"],
            ["Your dashboard", "/dashboard"],
            ["Connected photo demo", "/lab"],
            ["Get the app", "/#app"],
          ].map(([label, url], i) => (
            <Link key={url} to={url} onClick={() => setOpen(false)}>
              <span>0{i + 1}</span>
              {label}
              <ArrowUpRight />
            </Link>
          ))}
        </nav>
        <div className="menu-bottom">
          BUILT TO SEE WHAT’S AHEAD.<span>VISION. NAVIGATION. CONNECTION.</span>
        </div>
      </div>
    </>
  );
}
