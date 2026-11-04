(() => {
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const response = await nativeFetch(...args);
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
    if (response.status === 401 && url?.startsWith('/api/') && !url.startsWith('/api/auth/')) {
      localStorage.removeItem('empleado_sesion');
      if (location.pathname !== '/' && location.pathname !== '/index.html')
        location.assign('/index.html');
    }
    return response;
  };
})();
