// Pequeño feedback en cards "Próximamente"
document.querySelectorAll('.game-card.soon').forEach(card => {
  card.addEventListener('click', () => {
    const title = card.querySelector('h2').textContent;
    showToast(`${title}: en construcción 🛠`);
    card.animate(
      [{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' },
       { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }],
      { duration: 280, easing: 'ease-out' }
    );
  });
});

function showToast(msg) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    document.body.appendChild(t);
    Object.assign(t.style, {
      position: 'fixed',
      bottom: '24px',
      left: '50%',
      transform: 'translateX(-50%) translateY(40px)',
      background: 'rgba(10, 13, 24, 0.95)',
      border: '1px solid rgba(255, 215, 94, 0.4)',
      color: '#ffd75e',
      padding: '12px 22px',
      borderRadius: '999px',
      fontSize: '14px',
      fontWeight: '600',
      backdropFilter: 'blur(10px)',
      transition: 'opacity .25s, transform .25s',
      opacity: '0',
      zIndex: '100'
    });
  }
  t.textContent = msg;
  requestAnimationFrame(() => {
    t.style.opacity = '1';
    t.style.transform = 'translateX(-50%) translateY(0)';
  });
  clearTimeout(showToast._tid);
  showToast._tid = setTimeout(() => {
    t.style.opacity = '0';
    t.style.transform = 'translateX(-50%) translateY(40px)';
  }, 2200);
}
