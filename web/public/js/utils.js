// Gestor de Notificaciones Toast no bloqueantes
function showToast(mensaje, tipo = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${tipo}`;

  let iconName = 'info';
  if (tipo === 'success') iconName = 'check_circle';
  if (tipo === 'error') iconName = 'error';

  toast.textContent = String(mensaje);
  container.appendChild(toast);

  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, window.restaurantSettings?.ui.toastMs ?? 3200);
}

// Teclado Numérico (Numpad) Táctil
let numpadInputObjetivo = null;
let numpadCallback = null;

function abrirNumpad(inputElement, titulo = 'Ingresa Valor', callback = null) {
  numpadInputObjetivo = inputElement;
  numpadCallback = callback;
  document.getElementById('numpad-modal-titulo').innerText = titulo;
  document.getElementById('numpad-display').value = inputElement.value || '';
  document.getElementById('modal-numpad-custom').style.display = 'flex';
}

function numpadDigitar(valor) {
  const display = document.getElementById('numpad-display');
  if (valor === 'C') {
    display.value = '';
  } else if (valor === 'DEL') {
    display.value = display.value.slice(0, -1);
  } else if (valor === '.') {
    if (!display.value.includes('.')) display.value += '.';
  } else {
    display.value += valor;
  }
}

function confirmarNumpad() {
  const display = document.getElementById('numpad-display');
  if (numpadInputObjetivo) {
    numpadInputObjetivo.value = display.value;
    if (numpadCallback) numpadCallback(display.value);
  }
  document.getElementById('modal-numpad-custom').style.display = 'none';
}
