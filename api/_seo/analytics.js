function googleTagManagerHead() {
  return `<script src="/assets/consent.js" defer></script>`;
}

function googleTagManagerNoscript() {
  return "";
}

module.exports = {
  googleTagManagerHead,
  googleTagManagerNoscript
};
