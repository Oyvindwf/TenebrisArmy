// gallery.js (clean version – no guessing, no captions, no naming logic)

fetch("data/gallery.json")
  .then((res) => res.json())
  .then((concerts) => {
    const container = document.getElementById("gallery-container");

    for (const [title, data] of Object.entries(concerts)) {
      const folder = data.folder;
      const safeId = folder.replace(/[^a-zA-Z0-9_-]/g, "_");

      const section = document.createElement("section");
      section.className = "concert-carousel";

      const heading = document.createElement("h2");
      heading.textContent = title;
      section.appendChild(heading);

      const swiperHTML = document.createElement("div");
      swiperHTML.innerHTML = `
        <div class="swiper mySwiper" id="swiper-${safeId}">
          <div class="swiper-wrapper"></div>
          <div class="swiper-button-prev"></div>
          <div class="swiper-button-next"></div>
        </div>
        <div class="swiper-counter" id="counter-${safeId}">Loading...</div>
      `;

      section.appendChild(swiperHTML);

      if (data.photographer) {
        const credit = document.createElement("p");
        credit.className = "photographer-credit";
        credit.innerHTML = `Photos by <a href="${data.photographer.link}" target="_blank">${data.photographer.name}</a>`;
        section.appendChild(credit);
      }

      container.appendChild(section);

      const wrapper = swiperHTML.querySelector(".swiper-wrapper");
      const counter = swiperHTML.querySelector(`#counter-${safeId}`);

      const extensions = [".jpeg", ".jpg"];
      let index = 1;
      let total = 0;
      let consecutiveFails = 0;
      const maxConsecutiveFails = 10;

      function tryAllExtensions(i, extIndex = 0) {
        if (extIndex >= extensions.length) {
          consecutiveFails++;
          if (consecutiveFails >= maxConsecutiveFails) {
            console.log(`Stopped at img${index}. Total loaded: ${total}`);
            setupSwiper(safeId, total);
            return;
          }
          index++;
          tryAllExtensions(index);
          return;
        }

        const ext = extensions[extIndex];
        const file = `img${i}${ext}`;
        const path = `images/gallery/${safeId}/${file}`;
        const img = new Image();
        img.src = path;

        img.onload = () => {
          consecutiveFails = 0;
          const slide = document.createElement("div");
          slide.className = "swiper-slide";

          slide.innerHTML = `
            <img src="${path}" alt="Image ${i}">
          `;

          slide.querySelector("img").addEventListener("click", () => openLightbox(path));

          wrapper.appendChild(slide);
          total++;
          console.log(`Loaded: ${path}`);
          index++;
          tryAllExtensions(index);
        };

        img.onerror = () => {
          tryAllExtensions(i, extIndex + 1);
        };
      }

      tryAllExtensions(index);
    }
  });

function setupSwiper(id, totalSlides) {
  const swiper = new Swiper(`#swiper-${id}`, {
    slidesPerView: 2,
    spaceBetween: 10,
    loop: totalSlides > 3,
    navigation: {
      nextEl: `#swiper-${id} .swiper-button-next`,
      prevEl: `#swiper-${id} .swiper-button-prev`,
    },
    on: {
      slideChange: function () {
        const active = this.realIndex + 1;
        const visible = this.params.slidesPerView;
        const end = Math.min(active + visible - 1, totalSlides);
        const text = `Showing ${active}–${end} of ${totalSlides}`;
        document.getElementById(`counter-${id}`).textContent = text;
      },
      afterInit: function () {
        const active = this.realIndex + 1;
        const visible = this.params.slidesPerView;
        const end = Math.min(active + visible - 1, totalSlides);
        const text = `Showing ${active}–${end} of ${totalSlides}`;
        document.getElementById(`counter-${id}`).textContent = text;
      }
    },
    breakpoints: {
      0: { slidesPerView: 1 },
      600: { slidesPerView: 2 },
      900: { slidesPerView: 3 }
    }
  });
}

function openLightbox(src) {
  const overlay = document.createElement("div");
  overlay.id = "lightbox";
  overlay.innerHTML = `
    <div class="lightbox-content">
      <img src="${src}">
      <span class="close">&times;</span>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.querySelector(".close").onclick = () => overlay.remove();
  overlay.onclick = (e) => {
    if (e.target.id === "lightbox") overlay.remove();
  };
}
