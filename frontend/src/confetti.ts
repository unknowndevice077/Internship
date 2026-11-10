const COLOURS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#6250d6"];

// a short burst from the top of the page, for the moment a sprint gets closed
export function confetti(pieces = 70) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  for (let i = 0; i < pieces; i++) {
    const el = document.createElement("span");
    el.className = "confetti";
    el.style.background = COLOURS[i % COLOURS.length];
    document.body.append(el);
    const startX = window.innerWidth / 2 + (Math.random() - 0.5) * 240;
    const endX = startX + (Math.random() - 0.5) * window.innerWidth * 0.8;
    const peak = 60 + Math.random() * 140;
    const spin = (Math.random() - 0.5) * 1080;
    el.animate(
      [
        { transform: `translate(${startX}px, -20px) rotate(0deg)`, opacity: 1 },
        { transform: `translate(${(startX + endX) / 2}px, ${peak}px) rotate(${spin / 2}deg)`, opacity: 1, offset: 0.3 },
        { transform: `translate(${endX}px, ${window.innerHeight + 30}px) rotate(${spin}deg)`, opacity: 0.6 },
      ],
      { duration: 1600 + Math.random() * 1200, delay: Math.random() * 180, easing: "cubic-bezier(0.2, 0.6, 0.4, 1)" },
    ).onfinish = () => el.remove();
  }
}
