const demoVideo = document.querySelector("[data-demo-video]");
const navLinks = Array.from(document.querySelectorAll("[data-nav-link]"));
const pageName = document.body.dataset.page || "home";

function updateScrollGradient() {
  const scrollable = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  const progress = Math.min(1, Math.max(0, window.scrollY / scrollable));
  document.documentElement.style.setProperty("--scroll-progress", progress.toFixed(4));
}

updateScrollGradient();
window.addEventListener("scroll", updateScrollGradient, { passive: true });
window.addEventListener("resize", updateScrollGradient);

function setActiveNavLink(activeKey) {
  navLinks.forEach((link) => {
    const isActive = link.dataset.navLink === activeKey;
    link.classList.toggle("active-page-link", isActive);
    if (isActive) {
      link.setAttribute("aria-current", pageName === "home" ? "location" : "page");
    } else if (link.getAttribute("aria-current") !== "page") {
      link.removeAttribute("aria-current");
    }
  });
}

if (pageName !== "home") {
  setActiveNavLink(pageName);
} else {
  const sections = ["inside", "examples", "pricing", "faq", "offer"]
    .map((id) => document.getElementById(id))
    .filter(Boolean);

  if ("IntersectionObserver" in window && sections.length) {
    const sectionObserver = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

        if (visible?.target?.id) setActiveNavLink(visible.target.id);
      },
      {
        rootMargin: "-34% 0px -54% 0px",
        threshold: [0.12, 0.28, 0.5],
      },
    );

    sections.forEach((section) => sectionObserver.observe(section));
  }
}

if (demoVideo) {
  demoVideo.muted = true;

  const playVideo = () => {
    const playAttempt = demoVideo.play();
    if (playAttempt && typeof playAttempt.catch === "function") {
      playAttempt.catch(() => {});
    }
  };

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          playVideo();
        } else {
          demoVideo.pause();
        }
      },
      { threshold: 0.35 },
    );

    observer.observe(demoVideo);
  } else {
    playVideo();
  }
}
