import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDown,
  ArrowUpRight,
  ArrowLeft,
  ArrowRight,
  Bluetooth,
  Check,
  ChevronRight,
  MapPin,
  Mic,
  Plus,
  Minus,
  Shield,
  Smartphone,
  TriangleAlert,
} from "lucide-react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
gsap.registerPlugin(ScrollTrigger);
const features = [
  {
    title: "Find your flow.",
    label: "01 / NAVIGATION",
    text: "Your next turn. Right where you need it. Clear directions on your visor, with your phone keeping the journey connected.",
    icon: MapPin,
  },
  {
    title: "See the unexpected.",
    label: "02 / ROAD INTELLIGENCE",
    text: "Camera observations and motion signals become a shared picture of the road. Because a pothole seen once should help the next rider.",
    icon: TriangleAlert,
  },
  {
    title: "Just say the word.",
    label: "03 / YOUR CO-PILOT",
    text: "Ask where to go, repeat a direction, or check what’s ahead. A push-to-talk assistant keeps the conversation simple.",
    icon: Mic,
  },
];
const faqs = [
  [
    "What is Vizor?",
    "Vizor is an AR helmet navigation prototype connecting a forward-facing camera, a compact visor display, your Android phone, and a shared pothole database.",
  ],
  [
    "How does pothole detection work?",
    "Pothole-trained YOLO weights run on a Banana Pi. Detections are associated with available positioning and sensor evidence. Repeated reports help build a shared, approximate hazard map.",
  ],
  [
    "Does the helmet need a phone?",
    "The Android companion app handles destination selection, navigation, voice assistance, and helmet connectivity. The Banana Pi processes the camera locally. Cloud services require a network connection.",
  ],
  [
    "Can I try it without the hardware?",
    "Yes. Explore the clearly labeled demonstration dashboard. Its illustrated route and sample hazard records show the interaction without claiming to be a live ride.",
  ],
  [
    "Is this a finished road-certified helmet?",
    "This is a project prototype. The imagery is a concept visualization. Physical mounting, optics, battery runtime, and road performance require hardware testing.",
  ],
];
export function LandingPage() {
  const root = useRef<HTMLDivElement>(null),
    [turn, setTurn] = useState(0),
    [faq, setFaq] = useState<number | null>(null);
  const turns = ["LEFT", "STRAIGHT", "RIGHT"];
  useEffect(() => {
    const media = gsap.matchMedia();
    const ctx = gsap.context(() => {
      media.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from(".hero-reveal", {
          y: 60,
          opacity: 0,
          duration: 0.75,
          stagger: 0.09,
          ease: "power3.out",
        });
        gsap.utils
          .toArray<HTMLElement>(".reveal")
          .forEach((el) =>
            gsap.from(el, {
              y: 36,
              opacity: 0,
              duration: 0.55,
              scrollTrigger: { trigger: el, start: "top 90%", once: true },
            }),
          );
        media.add("(min-width: 1024px)", () => {
          gsap.to(".story-helmet", {
            y: -60,
            rotation: -3,
            ease: "none",
            scrollTrigger: {
              trigger: ".product-story",
              start: "top top",
              end: "+=400",
              pin: true,
              scrub: 1,
            },
          });
        });
      });
    }, root);
    return () => {
      media.revert();
      ctx.revert();
    };
  }, []);
  return (
    <div ref={root} className="landing">
      <section className="hero" aria-label="Vizor AR helmet">
        <div className="hero-grid" />
        <div className="hero-topline hero-reveal">
          <span>CONNECTED AR HELMET / PROTOTYPE 01</span>
          <span>DESIGNED FOR THE ROAD AHEAD</span>
        </div>
        <h1 className="hero-title hero-reveal">
          LOOK
          <br />
          <span>AHEAD.</span>
        </h1>
        <div className="hero-product">
          <img
            src="/images/helmet-concept.png"
            alt="Vizor concept helmet in matte charcoal with electric-yellow details"
            fetchPriority="high"
          />
          <span className="image-caption">
            01 / HELMET CONCEPT VISUALIZATION
          </span>
        </div>
        <div className="hero-description hero-reveal">
          <span className="eyebrow">
            <span className="tiny-square" /> MORE AWARE. MORE CONNECTED.
          </span>
          <p>
            The road changes.
            <br />
            Stay one step ahead.
          </p>
          <Link to="/demo" className="round-link">
            <span>MEET YOUR CO-PILOT</span>
            <ArrowUpRight />
          </Link>
        </div>
        <div className="hero-bottom hero-reveal">
          <a href="#experience">
            SCROLL TO DISCOVER <ArrowDown size={16} />
          </a>
          <span>VISION + NAVIGATION + YOU</span>
        </div>
      </section>
      <section id="experience" className="intro light-section">
        <div className="section-top reveal">
          <span>01 / A DIFFERENT PERSPECTIVE</span>
          <span>THE VIZOR EXPERIENCE</span>
        </div>
        <h2 className="reveal">
          LESS LOOKING DOWN.
          <br />
          <span>MORE BEING THERE.</span>
        </h2>
        <div className="intro-bottom reveal">
          <p>
            One connected system. Your route in sight, your hands on the ride,
            and a clearer picture of what comes next.
          </p>
          <Link to="/demo" className="text-link">
            Take a closer look <ArrowUpRight size={20} />
          </Link>
        </div>
        <div className="feature-strips">
          {features.map(({ title, label, text, icon: Icon }) => (
            <article className="feature-strip reveal" key={label}>
              <span className="eyebrow">{label}</span>
              <Icon size={28} />
              <h3>{title}</h3>
              <p>{text}</p>
              <ArrowUpRight size={24} />
            </article>
          ))}
        </div>
      </section>
      <section className="product-story">
        <div className="section-top reveal">
          <span>02 / IN YOUR LINE OF SIGHT</span>
          <span>SMALL DISPLAY. CLEAR DIRECTION.</span>
        </div>
        <div className="story-layout">
          <div className="story-copy reveal">
            <h2>
              THE NEXT TURN.
              <br />
              <span>
                NOT ANOTHER
                <br />
                DISTRACTION.
              </span>
            </h2>
            <p>
              Glanceable arrows. Distance to your turn. A pothole warning that
              keeps your navigation in view.
            </p>
            <span className="eyebrow">
              INTERACTIVE HUD PREVIEW / ILLUSTRATIVE
            </span>
            <div className="hud-demo">
              <div className="hud-top">
                <span>VIZOR / NAV</span>
                <span>
                  <Bluetooth size={12} /> DEMO
                </span>
              </div>
              <div className="hud-main">
                {turn === 0 ? (
                  <ArrowLeft />
                ) : turn === 2 ? (
                  <ArrowRight />
                ) : (
                  <ArrowUpRight style={{ transform: "rotate(-45deg)" }} />
                )}
                <div>
                  <strong>
                    120<span>m</span>
                  </strong>
                  <p>{turns[turn]} AT THE NEXT TURN</p>
                </div>
              </div>
              <div className="hud-warning">
                <TriangleAlert size={15} /> POTHOLE AHEAD{" "}
                <span>KEEP AWARE</span>
              </div>
            </div>
            <div className="hud-controls">
              {turns.map((t, i) => (
                <button
                  key={t}
                  className={turn === i ? "selected" : ""}
                  aria-pressed={turn === i}
                  onClick={() => setTurn(i)}
                >
                  {t}
                  <ChevronRight size={14} />
                </button>
              ))}
            </div>
          </div>
          <div className="story-visual">
            <img
              className="story-helmet"
              src="/images/helmet-concept.png"
              loading="lazy"
              alt="Concept helmet profile"
            />
            <div className="story-callout">
              <span className="tiny-square" /> YOUR ROUTE, IN FOCUS.
              <span>CONCEPT VISUALIZATION</span>
            </div>
          </div>
        </div>
      </section>
      <section className="intelligence light-section">
        <div className="section-top reveal">
          <span>03 / KNOWLEDGE WORTH SHARING</span>
          <span>ROAD INTELLIGENCE</span>
        </div>
        <div className="intelligence-heading reveal">
          <h2>
            ONE RIDER SEES IT.
            <br />
            <span>THE NEXT ONE KNOWS.</span>
          </h2>
          <p>
            A shared memory for the road. Camera detections and sensor evidence
            help turn individual observations into useful warnings.
          </p>
        </div>
        <div className="pipeline reveal">
          {[
            ["01", "SEE", "ESP32-CAM captures the road."],
            ["02", "UNDERSTAND", "Banana Pi runs pothole-trained YOLO."],
            ["03", "CONNECT", "Position and sensor evidence join the record."],
            ["04", "WARN", "Approaching riders get a heads-up."],
          ].map(([n, t, d]) => (
            <div key={n}>
              <span>{n}</span>
              <h3>{t}</h3>
              <p>{d}</p>
            </div>
          ))}
        </div>
        <div className="inference-proof reveal">
          <img
            src="/images/inference-india.jpg"
            alt="Actual pretrained YOLO detection on a held-out Indian road image"
            loading="lazy"
          />
          <div>
            <span className="eyebrow">
              REAL INFERENCE / HELD-OUT INDIA IMAGE
            </span>
            <h3>
              Evidence,
              <br />
              before promises.
            </h3>
            <p>
              A pothole-trained Nano model. Local processing. Recorded,
              reproducible results. This image is an actual software diagnostic,
              not a live helmet feed.
            </p>
            <span className="eyebrow">YOLOV8N · 640 PX · CONFIDENCE 0.30</span>
            <p className="attribution">
              RDD2022 · Arya et al. · CC BY-SA 4.0.{" "}
              <a href="https://github.com/sekilab/RoadDamageDetector">
                Dataset & attribution ↗
              </a>
            </p>
          </div>
        </div>
        <Link className="map-teaser reveal" to="/demo">
          <div className="teaser-roads">
            <svg viewBox="0 0 1000 280" aria-hidden="true">
              <path d="M0 60H1000M0 160H1000M100 0V280M400 0V280M700 0V280M900 0V280" />
              <path className="teaser-route" d="M70 220H400V60H800" />
              <circle cx="400" cy="160" r="9" />
              <circle cx="600" cy="60" r="9" />
            </svg>
          </div>
          <div>
            <span className="eyebrow">EXPLORE THE ILLUSTRATIVE DEMO</span>
            <h3>
              A map that
              <br />
              remembers.
            </h3>
            <span className="text-link">
              Explore road intelligence <ArrowUpRight size={20} />
            </span>
          </div>
          <span className="teaser-note">
            SAMPLE HAZARDS / NOT LIVE ROAD DATA
          </span>
        </Link>
      </section>
      <section id="app" className="app-section">
        <div className="app-copy reveal">
          <span className="eyebrow">04 / THE CONNECTION IN YOUR POCKET</span>
          <h2>
            YOUR RIDE.
            <br />
            YOUR WAY.
          </h2>
          <p>
            Choose a destination. Meet your co-pilot. Check your helmet.
            Everything you need, in one focused Android companion.
          </p>
          <ul>
            {[
              [MapPin, "Destination search and turn-by-turn guidance"],
              [Mic, "Push-to-talk voice assistance"],
              [Shield, "Shared hazard map and ride history"],
              [Bluetooth, "Helmet pairing and connection health"],
            ].map(([Icon, label]) => {
              const I = Icon as typeof MapPin;
              return (
                <li key={String(label)}>
                  <I size={18} />
                  {label as string}
                </li>
              );
            })}
          </ul>
          <Link to="/download" className="primary-button">
            Get the Android app <ArrowUpRight size={18} />
          </Link>
          <span className="app-footnote">
            ANDROID COMPANION / PROJECT PREVIEW
          </span>
        </div>
        <div className="phone-stage reveal">
          <div className="phone-mock">
            <div className="phone-island" />
            <div className="phone-brand">
              VIZOR<span>CONNECTED RIDING</span>
            </div>
            <div className="phone-welcome">GOOD MORNING, RIDER.</div>
            <h3>
              Where
              <br />
              to next?
            </h3>
            <div className="phone-search">
              <MapPin size={15} /> Find your destination{" "}
              <ArrowUpRight size={16} />
            </div>
            <div className="phone-map">
              <svg viewBox="0 0 260 230" aria-hidden="true">
                <path d="M0 40H260M0 100H260M0 180H260M40 0V230M130 0V230M210 0V230" />
                <path d="M40 210V100H210V40" className="phone-route" />
                <circle cx="40" cy="210" r="7" />
              </svg>
              <div className="phone-map-label">ILLUSTRATIVE PREVIEW</div>
            </div>
            <div className="phone-status">
              <Bluetooth size={16} />
              <div>
                Helmet connection<span>Ready when you are</span>
              </div>
              <Check size={17} />
            </div>
            <div className="phone-tabs">
              <MapPin />
              <TriangleAlert />
              <Shield />
              <Smartphone />
            </div>
          </div>
          <span className="phone-caption">APP INTERFACE CONCEPT</span>
        </div>
      </section>
      <section className="spec-section light-section">
        <div className="section-top reveal">
          <span>05 / BUILT WITH PURPOSE</span>
          <span>THE PROTOTYPE</span>
        </div>
        <h2 className="reveal">
          REAL COMPONENTS.
          <br />
          <span>ONE CONNECTED IDEA.</span>
        </h2>
        <div className="spec-grid reveal">
          {[
            ["EDGE COMPUTE", "Banana Pi", "Local vision inference"],
            ["VISION", "ESP32-CAM", "Forward-facing camera stream"],
            ["DISPLAY", "OLED HUD", "Compact monochrome guidance"],
            ["POSITIONING", "GNSS + IMU", "Location and motion evidence"],
            ["MOBILE", "Android", "BLE-connected companion"],
            ["INTELLIGENCE", "YOLO + Gemini", "Detection and voice assistance"],
          ].map(([label, title, desc]) => (
            <div key={label}>
              <span className="eyebrow">{label}</span>
              <h3>{title}</h3>
              <p>{desc}</p>
            </div>
          ))}
        </div>
        <div className="faq-block">
          <span className="eyebrow">A FEW THINGS TO KNOW</span>
          <div>
            {faqs.map(([q, a], i) => (
              <div className="faq-item" key={q}>
                <button
                  aria-expanded={faq === i}
                  aria-controls={`answer-${i}`}
                  onClick={() => setFaq(faq === i ? null : i)}
                >
                  {q}
                  {faq === i ? <Minus size={20} /> : <Plus size={20} />}
                </button>
                <div id={`answer-${i}`} hidden={faq !== i}>
                  <p>{a}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="final-cta">
        <span className="eyebrow">A BETTER WAY FORWARD.</span>
        <Link to="/demo">
          SEE WHAT’S
          <br />
          AHEAD.
          <ArrowUpRight />
        </Link>
        <div>
          <span>VIZOR / CONNECTED AR HELMET</span>
          <span>BUILT TO EXPLORE. DESIGNED TO CONNECT.</span>
        </div>
      </section>
      <footer className="product-footer">
        <Link className="wordmark" to="/">
          VIZOR<span>01</span>
        </Link>
        <p>
          An AR helmet navigation project.
          <br />
          Concept imagery. Real software. Hardware validation in progress.
        </p>
        <div>
          <Link to="/demo">Explore demo</Link>
          <Link to="/download">Android app</Link>
          <Link to="/privacy">Privacy & data</Link>
        </div>
        <span>© {new Date().getFullYear()} VIZOR PROJECT</span>
      </footer>
    </div>
  );
}
