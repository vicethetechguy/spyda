// Browser-only landing page script for Spyda's marketing pages.
const demoVideo = document.querySelector("[data-demo-video]");
const navLinks = Array.from(document.querySelectorAll("[data-nav-link]"));
const pageName = document.body.dataset.page || "home";

function updateScrollGradient() {
  const scrollable = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  const progress = Math.min(1, Math.max(0, window.scrollY / scrollable));
  document.documentElement.style.setProperty("--scroll-progress", progress.toFixed(4));
  
  const headerCta = document.querySelector(".header-cta");
  if (headerCta) {
    if (window.scrollY > 50) {
      headerCta.textContent = "Get Access";
      headerCta.href = "signup.html";
    } else {
      headerCta.textContent = "Sign in";
      headerCta.href = "signin.html";
    }
  }
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

function updateLandingMiniWebLines() {
  const miniCanvas = document.querySelector(".mini-canvas");
  const svg = document.querySelector(".mini-canvas-web");
  const flyer = document.querySelector(".mini-flyer");
  const nodes = document.querySelectorAll(".mini-node");
  
  if (!miniCanvas || !svg || !flyer || nodes.length === 0) return;
  
  const canvasRect = miniCanvas.getBoundingClientRect();
  const flyerRect = flyer.getBoundingClientRect();
  
  const flyerCenter = {
    x: flyerRect.left - canvasRect.left + flyerRect.width / 2,
    y: flyerRect.top - canvasRect.top + flyerRect.height / 2
  };
  
  svg.innerHTML = "";
  
  nodes.forEach((node) => {
    const nodeRect = node.getBoundingClientRect();
    const nodeCenter = {
      x: nodeRect.left - canvasRect.left + nodeRect.width / 2,
      y: nodeRect.top - canvasRect.top + nodeRect.height / 2
    };
    
    const distanceX = Math.abs(nodeCenter.x - flyerCenter.x);
    const distanceY = Math.abs(nodeCenter.y - flyerCenter.y);
    const bend = Math.max(30, Math.min(80, (distanceX + distanceY) * 0.3));
    const directionX = nodeCenter.x >= flyerCenter.x ? 1 : -1;
    
    const controlOne = {
      x: flyerCenter.x + bend * directionX,
      y: flyerCenter.y,
    };
    const controlTwo = {
      x: nodeCenter.x - bend * directionX,
      y: nodeCenter.y,
    };
    
    const pathData = `M ${flyerCenter.x.toFixed(1)} ${flyerCenter.y.toFixed(1)} C ${controlOne.x.toFixed(1)} ${controlOne.y.toFixed(1)}, ${controlTwo.x.toFixed(1)} ${controlTwo.y.toFixed(1)}, ${nodeCenter.x.toFixed(1)} ${nodeCenter.y.toFixed(1)}`;
    
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("class", "mini-web-line");
    path.setAttribute("d", pathData);
    svg.appendChild(path);
  });
}

window.addEventListener("resize", updateLandingMiniWebLines);
window.setTimeout(updateLandingMiniWebLines, 100);
// Also animate it in requestAnimationFrame if the nodes are floating via CSS
function animateMiniWebLines() {
  updateLandingMiniWebLines();
  window.requestAnimationFrame(animateMiniWebLines);
}
if (document.querySelector(".mini-canvas-web")) {
  animateMiniWebLines();
}

// Mobile Menu Toggle
const mobileMenuToggle = document.querySelector(".mobile-menu-toggle");
const mobileNavDrawer = document.querySelector(".mobile-nav-drawer");
const mobileNavLinks = document.querySelectorAll(".mobile-nav-links a");

if (mobileMenuToggle && mobileNavDrawer) {
  mobileMenuToggle.addEventListener("click", () => {
    const isExpanded = mobileMenuToggle.getAttribute("aria-expanded") === "true";
    mobileMenuToggle.setAttribute("aria-expanded", !isExpanded);
    mobileNavDrawer.classList.toggle("is-open", !isExpanded);
    document.body.style.overflow = !isExpanded ? "hidden" : "";
  });

  mobileNavLinks.forEach(link => {
    link.addEventListener("click", () => {
      mobileMenuToggle.setAttribute("aria-expanded", "false");
      mobileNavDrawer.classList.remove("is-open");
      document.body.style.overflow = "";
    });
  });
}
