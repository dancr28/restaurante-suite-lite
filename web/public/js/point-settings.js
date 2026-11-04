'use strict';

/*
 * ============================================================
 * MERCADO PAGO POINT · CONFIGURACION
 * MP6_POINT_SETTINGS_UI_V1
 * ============================================================
 *
 * Este módulo:
 * - NO conoce el Access Token.
 * - NO crea cobros.
 * - NO abre cajón.
 * - NO libera mesas.
 *
 * La sincronización remota sólo ocurre cuando
 * el administrador pulsa "Sincronizar terminales".
 * ============================================================
 */

(() => {

  const ROLES = [
    'admin',
    'mesero',
    'cocina',
    'repartidor',
    'empleado'
  ];


  const POINT_PERMISSIONS = [
    {
      key:
        'charge',
      label:
        'Acceder al módulo de cobro',
      help:
        'Permiso maestro. Es necesario para iniciar un cobro.'
    },
    {
      key:
        'chargePoint',
      label:
        'Cobrar con Mercado Pago Point',
      help:
        'Permite enviar el total de una cuenta a una terminal Point.'
    },
    {
      key:
        'pointCancel',
      label:
        'Cancelar cobro Point pendiente',
      help:
        'Permite cancelar una operación Point que todavía no terminó.'
    },
    {
      key:
        'pointRefund',
      label:
        'Reembolsar pago Point',
      help:
        'Permite realizar un reembolso Point cuando esa función esté disponible.'
    }
  ];


  function $(
    id
  ) {
    return document
      .getElementById(id);
  }


  function escapeHtml(
    value
  ) {
    return String(
      value ?? ''
    )
      .replaceAll(
        '&',
        '&amp;'
      )
      .replaceAll(
        '<',
        '&lt;'
      )
      .replaceAll(
        '>',
        '&gt;'
      )
      .replaceAll(
        '"',
        '&quot;'
      )
      .replaceAll(
        "'",
        '&#039;'
      );
  }


  async function request(
    url,
    options = {}
  ) {
    const response =
      await fetch(
        url,
        {
          credentials:
            'same-origin',

          headers: {
            'Content-Type':
              'application/json',

            ...(
              options.headers
              || {}
            )
          },

          ...options
        }
      );

    const text =
      await response.text();

    let data = {};

    if (text) {
      try {
        data =
          JSON.parse(text);
      } catch {
        data = {
          error:
            text
        };
      }
    }

    if (!response.ok) {
      const message =
        data?.error
        || data?.message
        || (
          'Error HTTP '
          + response.status
        );

      throw new Error(
        message
      );
    }

    return data;
  }


  function setStatus(
    text,
    type = 'normal'
  ) {
    const box =
      $('mp-point-status');

    if (!box)
      return;

    box.textContent =
      text;

    box.dataset.status =
      type;
  }


  function formatDate(
    value
  ) {
    if (!value)
      return 'Sin sincronización';

    const date =
      new Date(value);

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      return String(value);
    }

    return date
      .toLocaleString(
        'es-MX'
      );
  }


  /*
   * ==========================================================
   * DIAGNOSTICO
   * ==========================================================
   */

  async function loadHealth() {
    const credentials =
      $('mp-point-credentials');

    const apiState =
      $('mp-point-api-state');

    const mode =
      $('mp-point-mode');

    if (credentials)
      credentials.textContent =
        'Comprobando…';

    if (apiState)
      apiState.textContent =
        'Comprobando…';

    try {
      const data =
        await request(
          '/api/mercadopago/health'
        );

      if (credentials) {
        credentials.textContent =
          data.configured === false
            ? 'No configuradas'
            : 'Configuradas';
      }

      if (apiState) {
        apiState.textContent =
          data.ok === false
            ? 'Requiere atención'
            : 'Backend disponible';
      }

      if (mode) {
        const test =
          data.test
          ?? data.is_test
          ?? data.sandbox;

        mode.textContent =
          test === true
            ? 'Pruebas'
            : test === false
              ? 'Producción'
              : (
                  data.mode
                  || 'Configurado'
                );
      }

      return data;

    } catch (err) {
      if (credentials)
        credentials.textContent =
          'No disponible';

      if (apiState)
        apiState.textContent =
          'Error';

      if (mode)
        mode.textContent =
          '—';

      throw err;
    }
  }


  /*
   * ==========================================================
   * TERMINALES LOCALES
   * ==========================================================
   */

  async function loadLocalTerminals() {
    const data =
      await request(
        '/api/mercadopago/terminals/local'
      );

    const terminals =
      Array.isArray(
        data?.terminals
      )
        ? data.terminals
        : [];

    renderTerminals(
      terminals
    );

    return terminals;
  }


  function terminalTitle(
    terminal
  ) {
    if (
      terminal.alias &&
      String(
        terminal.alias
      ).trim()
    ) {
      return terminal.alias;
    }

    return 'Terminal Point';
  }


  function renderTerminals(
    terminals
  ) {
    const container =
      $('mp-point-terminals');

    const count =
      $('mp-point-terminal-count');

    if (!container)
      return;

    if (count) {
      count.textContent =
        String(
          terminals.length
        );
    }

    container.replaceChildren();

    if (!terminals.length) {
      const empty =
        document.createElement(
          'div'
        );

      empty.className =
        'settings-info-box';

      empty.innerHTML =
        '<span class="material-icons-round">'
        + 'point_of_sale'
        + '</span>'
        + '<div>'
        + '<strong>No hay terminales sincronizadas</strong>'
        + '<span>'
        + 'Pulsa “Sincronizar terminales” para consultar las Point asociadas a la cuenta de Mercado Pago.'
        + '</span>'
        + '</div>';

      container.append(
        empty
      );

      return;
    }


    for (
      const terminal
      of terminals
    ) {
      const card =
        document.createElement(
          'article'
        );

      card.className =
        'settings-panel';

      card.dataset.terminalId =
        terminal.terminal_id;


      const mode =
        terminal.operating_mode
        || 'Sin informar';


      const active =
        Boolean(
          terminal.activo
        );


      const inUse =
        Boolean(
          terminal.en_uso
        );


      card.innerHTML = `
        <div class="settings-panel-toolbar">
          <div>
            <div class="settings-subtitle">
              ${escapeHtml(
                terminalTitle(
                  terminal
                )
              )}
            </div>

            <div class="muted">
              ${escapeHtml(
                terminal.terminal_id
              )}
            </div>
          </div>

          <span
            class="material-icons-round"
            title="Mercado Pago Point"
          >
            point_of_sale
          </span>
        </div>

        <div class="grid">

          <label class="settings-field">
            <span>Alias</span>

            <input
              type="text"
              class="mp-terminal-alias"
              maxlength="80"
              value="${escapeHtml(
                terminal.alias || ''
              )}"
              placeholder="Ej. Caja principal"
            >
          </label>

          <div class="settings-info-box">
            <span class="material-icons-round">
              settings_input_component
            </span>

            <div>
              <strong>Modo</strong>
              <span>
                ${escapeHtml(
                  mode
                )}
              </span>
            </div>
          </div>

          <div class="settings-info-box">
            <span class="material-icons-round">
              schedule
            </span>

            <div>
              <strong>Última detección</strong>
              <span>
                ${escapeHtml(
                  formatDate(
                    terminal.ultima_deteccion
                  )
                )}
              </span>
            </div>
          </div>

          ${
            terminal.pos_id
              ? `
                <div class="settings-info-box">
                  <span class="material-icons-round">
                    store
                  </span>

                  <div>
                    <strong>POS</strong>
                    <span>
                      ${escapeHtml(
                        terminal.pos_id
                      )}
                    </span>
                  </div>
                </div>
              `
              : ''
          }

        </div>

        <div
          class="settings-switch-list"
          style="margin-top:12px"
        >
          <label class="settings-switch-row">
            <div>
              <strong>Disponible para cobros</strong>
              <span>
                ${
                  inUse
                    ? 'Esta terminal tiene una operación Point activa.'
                    : 'Permite seleccionarla desde el POS.'
                }
              </span>
            </div>

            <input
              type="checkbox"
              class="mp-terminal-active"
              ${active ? 'checked' : ''}
              ${inUse ? 'disabled' : ''}
            >
          </label>
        </div>

        <div
          style="
            display:flex;
            justify-content:flex-end;
            margin-top:12px
          "
        >
          <button
            type="button"
            class="settings-primary-btn mp-terminal-save"
          >
            <span class="material-icons-round">
              save
            </span>
            Guardar terminal
          </button>
        </div>
      `;


      const saveButton =
        card.querySelector(
          '.mp-terminal-save'
        );

      saveButton.onclick =
        async () => {
          const alias =
            card
              .querySelector(
                '.mp-terminal-alias'
              )
              .value
              .trim();

          const activo =
            card
              .querySelector(
                '.mp-terminal-active'
              )
              .checked;

          saveButton.disabled =
            true;

          try {
            await request(
              '/api/mercadopago/terminals/'
              + encodeURIComponent(
                  terminal.terminal_id
                ),
              {
                method:
                  'PATCH',

                body:
                  JSON.stringify({
                    alias,
                    activo
                  })
              }
            );

            setStatus(
              'Terminal guardada correctamente.',
              'ok'
            );

            await loadLocalTerminals();

          } catch (err) {
            setStatus(
              err.message,
              'error'
            );

          } finally {
            saveButton.disabled =
              false;
          }
        };


      container.append(
        card
      );
    }
  }


  /*
   * ==========================================================
   * SINCRONIZAR DESDE MERCADO PAGO
   * ==========================================================
   */

  async function syncTerminals() {
    const button =
      $('mp-point-sync');

    if (button)
      button.disabled =
        true;

    setStatus(
      'Consultando terminales asociadas a Mercado Pago…'
    );

    try {
      const remote =
        await request(
          '/api/mercadopago/terminals'
        );

      const remoteList =
        remote?.terminals
        || remote?.data?.terminals
        || [];

      const local =
        await loadLocalTerminals();

      setStatus(
        'Sincronización terminada. '
        + local.length
        + ' terminal(es) registradas localmente.',
        'ok'
      );

      const apiState =
        $('mp-point-api-state');

      if (apiState)
        apiState.textContent =
          'Conexión correcta';

      const remoteCount =
        $('mp-point-remote-count');

      if (remoteCount) {
        remoteCount.textContent =
          Array.isArray(
            remoteList
          )
            ? String(
                remoteList.length
              )
            : String(
                local.length
              );
      }

    } catch (err) {
      setStatus(
        'No se pudieron sincronizar las terminales: '
        + err.message,
        'error'
      );

      const apiState =
        $('mp-point-api-state');

      if (apiState)
        apiState.textContent =
          'Error de conexión';

    } finally {
      if (button)
        button.disabled =
          false;
    }
  }


  /*
   * ==========================================================
   * PERMISOS POINT
   * ==========================================================
   */

  function currentSecurity() {
    try {
      if (
        typeof state !==
          'undefined'
        &&
        state?.security
      ) {
        return state.security;
      }
    } catch {}

    return null;
  }


  function renderPermissions() {
    const container =
      $('mp-point-permissions');

    if (!container)
      return;

    const security =
      currentSecurity();

    container.replaceChildren();

    if (!security) {
      const info =
        document.createElement(
          'div'
        );

      info.className =
        'settings-info-box';

      info.textContent =
        'Los permisos todavía se están cargando.';

      container.append(
        info
      );

      return;
    }


    for (
      const permission
      of POINT_PERMISSIONS
    ) {
      const fieldset =
        document.createElement(
          'fieldset'
        );

      const legend =
        document.createElement(
          'legend'
        );

      legend.textContent =
        permission.label;

      fieldset.append(
        legend
      );


      const help =
        document.createElement(
          'p'
        );

      help.className =
        'muted';

      help.textContent =
        permission.help;

      fieldset.append(
        help
      );


      const current =
        Array.isArray(
          security[
            permission.key
          ]
        )
          ? security[
              permission.key
            ]
          : [];


      for (
        const role
        of ROLES
      ) {
        const item =
          document.createElement(
            'label'
          );

        item.className =
          'check';


        const checkbox =
          document.createElement(
            'input'
          );

        checkbox.type =
          'checkbox';

        checkbox.value =
          role;

        checkbox.checked =
          role === 'admin'
          || current.includes(
              role
            );

        checkbox.disabled =
          role === 'admin';


        checkbox.onchange =
          () => {
            let roles =
              Array.isArray(
                security[
                  permission.key
                ]
              )
                ? [
                    ...security[
                      permission.key
                    ]
                  ]
                : [];


            if (
              checkbox.checked
            ) {
              if (
                !roles.includes(
                  role
                )
              ) {
                roles.push(
                  role
                );
              }

            } else {
              roles =
                roles.filter(
                  value =>
                    value !== role
                );
            }


            if (
              !roles.includes(
                'admin'
              )
            ) {
              roles.unshift(
                'admin'
              );
            }


            security[
              permission.key
            ] =
              roles;


            /*
             * chargePoint requiere el permiso
             * maestro charge.
             *
             * Al habilitar Point para un rol,
             * habilitamos también charge.
             */
            if (
              permission.key ===
                'chargePoint'
              &&
              checkbox.checked
              &&
              role !== 'admin'
            ) {
              const chargeRoles =
                Array.isArray(
                  security.charge
                )
                  ? [
                      ...security.charge
                    ]
                  : [
                      'admin'
                    ];

              if (
                !chargeRoles.includes(
                  role
                )
              ) {
                chargeRoles.push(
                  role
                );
              }

              security.charge =
                chargeRoles;
            }


            /*
             * Marcar configuración como modificada.
             */
            try {
              document
                .dispatchEvent(
                  new Event(
                    'input',
                    {
                      bubbles: true
                    }
                  )
                );
            } catch {}


            renderPermissions();
          };


        item.append(
          checkbox,
          document.createTextNode(
            role
          )
        );

        fieldset.append(
          item
        );
      }


      container.append(
        fieldset
      );
    }
  }


  async function savePointPermissions() {
    const button =
      $('mp-point-save-permissions');

    if (button)
      button.disabled =
        true;

    try {
      if (
        typeof save !==
          'function'
      ) {
        throw new Error(
          'El módulo central de Configuración todavía no está disponible'
        );
      }

      await save();

      setStatus(
        'Permisos Point guardados.',
        'ok'
      );

      renderPermissions();

    } catch (err) {
      setStatus(
        'No se pudieron guardar los permisos: '
        + err.message,
        'error'
      );

    } finally {
      if (button)
        button.disabled =
          false;
    }
  }


  /*
   * ==========================================================
   * INICIALIZACION
   * ==========================================================
   */

  async function refreshLocal() {
    setStatus(
      'Actualizando estado local…'
    );

    try {
      await Promise.all([
        loadHealth(),
        loadLocalTerminals()
      ]);

      setStatus(
        'Configuración Point actualizada.',
        'ok'
      );

    } catch (err) {
      setStatus(
        err.message,
        'error'
      );
    }

    renderPermissions();
  }


  function bind() {
    const sync =
      $('mp-point-sync');

    if (sync)
      sync.onclick =
        syncTerminals;


    const refresh =
      $('mp-point-refresh');

    if (refresh)
      refresh.onclick =
        refreshLocal;


    const savePermissions =
      $('mp-point-save-permissions');

    if (savePermissions) {
      savePermissions.onclick =
        savePointPermissions;
    }


    /*
     * Dar tiempo a settings-v3/settings-modules
     * para terminar de cargar state.
     */
    setTimeout(
      () => {
        refreshLocal()
          .catch(() => {});
      },
      350
    );
  }


  if (
    document.readyState ===
      'loading'
  ) {
    document
      .addEventListener(
        'DOMContentLoaded',
        bind
      );

  } else {
    bind();
  }

})();
