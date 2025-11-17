// script.js – controls the booking form toggle

function toggleForm() {
  const form = document.getElementById("booking-form");
  if (form.style.display === "none" || form.style.display === "") {
    form.style.display = "block";
    form.scrollIntoView({ behavior: "smooth" });
  } else {
    form.style.display = "none";
  }
}
