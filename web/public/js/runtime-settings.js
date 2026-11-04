(() => {
  window.restaurantReady = fetch('/api/runtime-settings')
    .then(async (response) => {
      if (!response.ok) throw Error('No se pudo cargar la configuración');
      const cfg = await response.json();
      window.restaurantSettings = cfg;
      const apply = () => {
        document.documentElement.dataset.theme = cfg.ui.theme;
        document.documentElement.dataset.density = cfg.ui.density;
        document.documentElement.dataset.animations = String(cfg.ui.animations);
        document.documentElement.style.setProperty('--settings-font', cfg.ui.fontSize + 'px');
        document.documentElement.style.setProperty('--pos-columns', cfg.ui.posColumns);
        for (const [id, key] of [
          ['tab-btn-salon', 'dineIn'],
          ['tab-btn-takeout', 'takeout'],
          ['tab-btn-delivery', 'delivery'],
        ]) {
          const button = document.getElementById(id);
          if (button && !cfg.orders[key]) button.style.display = 'none';
        }
      };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply);
      else apply();
      return cfg;
    })
    .catch((error) => {
      console.error(error.message);
      return null;
    });
  window.restaurantMoney = (value) =>
    new Intl.NumberFormat(window.restaurantSettings?.business.locale || 'es-MX', {
      style: 'currency',
      currency: window.restaurantSettings?.business.currency || 'MXN',
    }).format(Number(value) || 0);
})();
