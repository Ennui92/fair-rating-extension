const assumedStar = document.getElementById("assumedStar");
const removalYears = document.getElementById("removalYears");

chrome.storage.sync.get({ assumedStar: 1, removalYears: 0 }, (stored) => {
  if (assumedStar) assumedStar.value = String(stored.assumedStar);
  if (removalYears) removalYears.value = String(stored.removalYears);
});

if (assumedStar) {
  assumedStar.addEventListener("change", () => {
    const value = parseInt(assumedStar.value, 10);
    chrome.storage.sync.set({ assumedStar: value });
  });
}

if (removalYears) {
  removalYears.addEventListener("change", () => {
    const value = parseInt(removalYears.value, 10);
    chrome.storage.sync.set({ removalYears: value });
  });
}
