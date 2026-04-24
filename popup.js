const select = document.getElementById("assumedStar");

chrome.storage.sync.get({ assumedStar: 1 }, (stored) => {
  select.value = String(stored.assumedStar);
});

select.addEventListener("change", () => {
  const value = parseInt(select.value, 10);
  chrome.storage.sync.set({ assumedStar: value });
});
