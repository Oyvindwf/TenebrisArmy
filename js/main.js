document.addEventListener("DOMContentLoaded", () => {
  const hamburger = document.querySelector(".hamburger");
  const navbar = document.querySelector(".navbar");

  if (!hamburger || !navbar) return;

  hamburger.addEventListener("click", () => {
    hamburger.classList.toggle("open");
    navbar.classList.toggle("open");
  });

  navbar.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      hamburger.classList.remove("open");
      navbar.classList.remove("open");
    });
  });
});
