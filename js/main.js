document.addEventListener("DOMContentLoaded", function () {
  const hamburger = document.querySelector(".hamburger");
  const navbar = document.querySelector(".navbar");

  hamburger.addEventListener("click", function () {
    hamburger.classList.toggle("open");
    navbar.classList.toggle("open");
  });

  // Optional: Close nav if you click a link (for single-page feel)
  navbar.querySelectorAll("a").forEach(link => {
    link.addEventListener("click", () => {
      hamburger.classList.remove("open");
      navbar.classList.remove("open");
    });
  });
});
