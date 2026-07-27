const SUPABASE_URL = "https://cepbrsqebmpghbfvwjtb.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_TSpHDb4fmePBKrXwWn3Q1A_Q0xehq7H";
const TABLE = "embarques";
const PHOTOS_TABLE = "fotos_recepcion";
const BUCKET = "recepcion-fotos";
// Configuración de Cloudinary
const CLOUDINARY_CLOUD_NAME = "ucztvmdf";
const CLOUDINARY_UPLOAD_PRESET = "preset_recepcion";

/**
 * Inserta transformaciones de Cloudinary (f_auto, q_auto, ancho límite) en la URL
 * para reducir peso/consumo de créditos sin perder calidad visual perceptible.
 * @param {string} url - URL original de Cloudinary guardada en Supabase.
 * @param {number} width - Ancho máximo deseado (px). La imagen nunca se agranda, solo se limita hacia abajo.
 */
function optimizeCloudinaryUrl(url, width = 800) {
  if (!url || typeof url !== 'string') return url;
  if (!url.includes('res.cloudinary.com') || !url.includes('/upload/')) return url;
  if (url.includes('/upload/f_auto')) return url; // ya optimizada, evita duplicar transformaciones
  return url.replace('/upload/', `/upload/f_auto,q_auto,w_${width},c_limit/`);
}

const configuredOk = !SUPABASE_URL.includes("TU-PROYECTO") && !SUPABASE_ANON_KEY.includes("TU-ANON-KEY");
if (!configuredOk) document.getElementById('config-banner').style.display = 'block';

const sb = configuredOk ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

// ---------- utilidades ----------
function toast(msg, type = 'info') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'show ' + type;
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => t.classList.remove('show'), 3800);
}

function requireConfig() {
  if (!configuredOk) {
    toast('Falta configurar Supabase (revisa CONFIG en script.js).', 'err');
    return false;
  }
  return true;
}

function toNum(v) { return v === '' || v === null || v === undefined ? null : Number(v); }
function toDateOrNull(v) { return v ? v : null; }
function fmtFecha(iso) {
  if (!iso) return '-';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

// ---------- tabs ----------
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById(btn.dataset.tab).classList.add('active');
    btn.classList.add('active');
    if (btn.dataset.tab === 'tab-monitor') cargarMonitor();
  });
});


// TAB 1: COMEX — Nuevo embarque

document.getElementById('form-nuevo').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!requireConfig()) return;

  const btn = document.getElementById('btn-guardar-nuevo');
  btn.disabled = true; btn.textContent = 'Guardando...';

  const payload = {
    proveedor: document.getElementById('n-proveedor').value.trim(),
    num_factura: document.getElementById('n-factura').value.trim(),
    descripcion_mercaderia: document.getElementById('n-descripcion').value.trim(),
    tipo_container: document.getElementById('n-container').value,
    cant_pallets_est: toNum(document.getElementById('n-pallets').value) || 0,
    cant_cajas_est: toNum(document.getElementById('n-cajas').value) || 0,
    cubicaje_m3: toNum(document.getElementById('n-cubicaje').value) || 0,
    fecha_estimada_llegada: toDateOrNull(document.getElementById('n-eta').value),
    cedis_destino: document.getElementById('n-cedis').value,
    estado_transito: 'En Origen',
    canal_aduana: 'Pendiente',
    estado_recepcion: 'En Espera'
  };

  if (!payload.proveedor || !payload.num_factura || !payload.fecha_estimada_llegada) {
    toast('Completa los campos obligatorios (*).', 'err');
    btn.disabled = false; btn.textContent = 'Guardar Registro en Base de Datos';
    return;
  }

  const { data, error } = await sb.from(TABLE).insert(payload).select().single();

  btn.disabled = false; btn.textContent = 'Guardar Registro en Base de Datos';

  if (error) {
    toast('Error al guardar: ' + error.message, 'err');
    return;
  }

  toast(`Embarque registrado: ${data.id_registro}`, 'ok');
  document.getElementById('form-nuevo').reset();
  document.getElementById('n-pallets').value = 0;
  document.getElementById('n-cajas').value = 0;
  document.getElementById('n-cubicaje').value = 0;
});


// Búsqueda compartida por N° de factura

async function buscarEmbarquePorFactura(factura) {
  const { data, error } = await sb.from(TABLE)
    .select('*')
    .ilike('num_factura', factura.trim())
    .order('fecha_creacion', { ascending: false })
    .limit(1);
  if (error) { toast('Error al buscar: ' + error.message, 'err'); return null; }
  if (!data || data.length === 0) return null;
  return data[0];
}

// TAB 2: COMEX — Estado/Canal

let registroEstadoActual = null;

async function buscarEstado() {
  if (!requireConfig()) return;
  const factura = document.getElementById('e-buscar').value;
  if (!factura.trim()) { toast('Escribe un N° de factura.', 'err'); return; }

  const r = await buscarEmbarquePorFactura(factura);
  const resultBox = document.getElementById('e-result');
  const editBox = document.getElementById('e-edit');

  if (!r) {
    resultBox.className = 'result-card show';
    resultBox.innerHTML = `No se encontró ningún embarque con la factura "<strong>${factura}</strong>".`;
    editBox.classList.remove('show');
    registroEstadoActual = null;
    return;
  }

  registroEstadoActual = r;
  resultBox.className = 'result-card show';
  resultBox.innerHTML = `
    <div class="rc-title">${r.id_registro} — ${r.proveedor}</div>
    <div class="rc-line">Factura: ${r.num_factura} | Contenedor: ${r.tipo_container || '-'}</div>
    <div class="rc-line">Estado actual: ${r.estado_transito} | Canal: ${r.canal_aduana}</div>
  `;
  document.getElementById('e-transito').value = r.estado_transito || 'En Origen';
  document.getElementById('e-canal').value = r.canal_aduana || 'Pendiente';
  document.getElementById('e-eta').value = r.fecha_estimada_llegada || '';
  document.getElementById('e-pallets').value = r.cant_pallets_est || 0;
  editBox.classList.add('show');
}

async function guardarEstado() {
  if (!requireConfig() || !registroEstadoActual) return;
  const btn = document.getElementById('btn-guardar-estado');
  btn.disabled = true; btn.textContent = 'Guardando...';

  const payload = {
    estado_transito: document.getElementById('e-transito').value,
    canal_aduana: document.getElementById('e-canal').value,
    fecha_estimada_llegada: toDateOrNull(document.getElementById('e-eta').value),
    cant_pallets_est: toNum(document.getElementById('e-pallets').value)
  };

  const { error } = await sb.from(TABLE).update(payload).eq('id', registroEstadoActual.id);
  btn.disabled = false; btn.textContent = 'Guardar Actualización';

  if (error) { toast('Error al actualizar: ' + error.message, 'err'); return; }
  toast('Estado actualizado correctamente.', 'ok');
  buscarEstado();
}

// TAB 3: LOGÍSTICA — Recepción + fotos

let registroRecepcionActual = null;
let archivosFotosSeleccionados = [];

async function buscarRecepcion() {
  if (!requireConfig()) return;
  const factura = document.getElementById('r-buscar').value;
  if (!factura.trim()) { toast('Escribe un N° de factura.', 'err'); return; }

  const r = await buscarEmbarquePorFactura(factura);
  const resultBox = document.getElementById('r-result');
  const editBox = document.getElementById('r-edit');

  if (!r) {
    resultBox.className = 'result-card show';
    resultBox.innerHTML = `No se encontró ningún embarque con la factura "<strong>${factura}</strong>".`;
    editBox.classList.remove('show');
    registroRecepcionActual = null;
    return;
  }

  registroRecepcionActual = r;
  resultBox.className = 'result-card show';
  resultBox.innerHTML = `
    <div class="rc-title">${r.id_registro} — ${r.proveedor}</div>
    <div class="rc-line">Factura: ${r.num_factura} | Pallets estimados: ${r.cant_pallets_est} | Cajas estimadas: ${r.cant_cajas_est}</div>
    <div class="rc-line">Canal aduana: ${r.canal_aduana} | Estado tránsito: ${r.estado_transito}</div>
  `;
  document.getElementById('r-fecha-real').value = r.fecha_real_llegada || '';
  document.getElementById('r-fecha-oc').value = r.fecha_entrega_oc || '';
  document.getElementById('r-oc').value = r.orden_compra || '';
  document.getElementById('r-estado').value = r.estado_recepcion || 'En Espera';
  document.getElementById('r-pallets').value = r.pallets_recibidos ?? '';
  document.getElementById('r-cajas').value = r.cajas_recibidas ?? '';
  document.getElementById('r-skus').value = r.sku_recibidos ?? '';
  archivosFotosSeleccionados = [];
  document.getElementById('r-fotos-preview').innerHTML = '';
  document.getElementById('r-fotos-input').value = '';
  editBox.classList.add('show');
}

function previsualizarFotos(event) {
  archivosFotosSeleccionados = Array.from(event.target.files);
  const preview = document.getElementById('r-fotos-preview');
  preview.innerHTML = '';
  archivosFotosSeleccionados.forEach(file => {
    const img = document.createElement('img');
    img.src = URL.createObjectURL(file);
    preview.appendChild(img);
  });
}

async function uploadToCloudinary(file) {
  if (!file) throw new Error("No se ha seleccionado ningún archivo.");

  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    const errData = await response.json();
    throw new Error(errData.error?.message || "Error al subir la imagen a Cloudinary");
  }

  const data = await response.json();
  return data.secure_url;
}

async function subirFotos(embarqueId) {
  if (!archivosFotosSeleccionados || archivosFotosSeleccionados.length === 0) {
    return [];
  }

  const urlsSubidas = [];

  for (let i = 0; i < archivosFotosSeleccionados.length; i++) {
    const file = archivosFotosSeleccionados[i];
    toast(`Subiendo foto ${i + 1} de ${archivosFotosSeleccionados.length}...`, 'info');

    const photoUrl = await uploadToCloudinary(file);

    const { data, error } = await sb
      .from(PHOTOS_TABLE)
      .insert([
        {
          embarque_id: embarqueId,
          url: photoUrl,
          created_at: new Date().toISOString()
        }
      ]);

    if (error) {
      console.error("Error al registrar foto en Supabase:", error);
      throw error;
    }

    urlsSubidas.push(photoUrl);
  }

  return urlsSubidas;
}

async function guardarRecepcion() {
  if (!registroRecepcionActual) {
    toast("Primero debes buscar y seleccionar un embarque", "err");
    return;
  }

  const btn = document.getElementById('btn-guardar-recepcion');
  btn.disabled = true; btn.textContent = 'Guardando...';

  try {
    if (archivosFotosSeleccionados.length > 0) {
      toast("Iniciando subida de fotos...", "info");
      await subirFotos(registroRecepcionActual.id);
    }

    toast("Guardando datos de recepción...", "info");

    const payload = {
      fecha_real_llegada: toDateOrNull(document.getElementById('r-fecha-real').value),
      fecha_entrega_oc: toDateOrNull(document.getElementById('r-fecha-oc').value),
      orden_compra: document.getElementById('r-oc').value.trim(),
      estado_recepcion: document.getElementById('r-estado').value,
      pallets_recibidos: toNum(document.getElementById('r-pallets').value),
      cajas_recibidas: toNum(document.getElementById('r-cajas').value),
      sku_recibidos: toNum(document.getElementById('r-skus').value)
    };

    const { error } = await sb
      .from(TABLE)
      .update(payload)
      .eq('id', registroRecepcionActual.id);

    if (error) throw error;

    toast("¡Recepción y fotos guardadas con éxito!", "ok");
    archivosFotosSeleccionados = [];

  } catch (err) {
    console.error("Error en guardarRecepcion:", err);
    toast("Ocurrió un error: " + err.message, "err");
  } finally {
    btn.disabled = false; btn.textContent = 'Guardar Recepción';
  }
}

// ==========================================================
// TAB 4: MONITOR
// ==========================================================
let datosMonitorGlobal = [];
let galeriaFotosData = {};

function abrirGaleriaFotos(embarqueId) {
  const fotos = galeriaFotosData[embarqueId] || [];
  const grid = document.getElementById('foto-modal-grid');
  const title = document.getElementById('foto-modal-title');

  if (fotos.length === 0) {
    grid.innerHTML = '<p style="color:#64748b;">No hay fotos disponibles para este embarque.</p>';
  } else {
    grid.innerHTML = fotos.map(url => {
      const urlMiniatura = optimizeCloudinaryUrl(url, 400);  // liviana, para la cuadrícula
      const urlGrande = optimizeCloudinaryUrl(url, 1600);    // más grande, solo al hacer clic
      return `
        <a href="${urlGrande}" target="_blank" rel="noopener" class="foto-modal-thumb">
          <img src="${urlMiniatura}" alt="Foto de recepción" loading="lazy">
        </a>
      `;
    }).join('');
  }

  title.textContent = `📷 Fotos de Recepción (${fotos.length})`;
  document.getElementById('foto-modal-overlay').classList.add('show');
}

function cerrarGaleriaFotos(event) {
  if (event && event.target !== event.currentTarget && event.type === 'click') return;
  document.getElementById('foto-modal-overlay').classList.remove('show');
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') cerrarGaleriaFotos();
});

async function cargarMonitor() {
  if (!requireConfig()) {
    document.getElementById('tabla-body').innerHTML =
      '<tr><td colspan="14" style="text-align:center;">Configura Supabase para ver los datos.</td></tr>';
    return;
  }

  const { data, error } = await sb.from(TABLE).select('*').order('fecha_creacion', { ascending: false });
  if (error) { toast('Error cargando monitor: ' + error.message, 'err'); return; }

  const { data: fotos } = await sb.from(PHOTOS_TABLE).select('embarque_id, url');
  fotosPorEmbarque = {};
  (fotos || []).forEach(f => {
    if (!fotosPorEmbarque[f.embarque_id]) fotosPorEmbarque[f.embarque_id] = [];
    fotosPorEmbarque[f.embarque_id].push(f.url);
  });

  datosMonitorGlobal = data;
  renderizarMonitor();
}

function renderizarMonitor() {
  const filas = datosMonitorGlobal;

  const skus = filas.reduce((s, f) => s + (f.sku_recibidos || 0), 0);
  const pallets = filas.reduce((s, f) => s + (f.pallets_recibidos ?? f.cant_pallets_est ?? 0), 0);
  const cajas = filas.reduce((s, f) => s + (f.cajas_recibidas ?? f.cant_cajas_est ?? 0), 0);
  const cubicaje = filas.reduce((s, f) => s + (Number(f.cubicaje_m3) || 0), 0);
  const proveedores = new Set(filas.map(f => f.proveedor)).size;
  const diasValidos = filas.filter(f => f.dias_almacenaje !== null && f.dias_almacenaje !== undefined);
  const promDias = diasValidos.length
    ? (diasValidos.reduce((s, f) => s + f.dias_almacenaje, 0) / diasValidos.length).toFixed(1)
    : '0.0';

  document.getElementById('kpi-skus').innerText = skus;
  document.getElementById('kpi-dias').innerText = promDias + ' días';
  document.getElementById('kpi-pallets').innerText = 'Pallets: ' + pallets;
  document.getElementById('kpi-cajas').innerText = 'Cajas: ' + cajas;
  document.getElementById('kpi-provs').innerText = proveedores;
  document.getElementById('kpi-m3').innerText = cubicaje.toFixed(1) + ' m³';

  const provSelect = document.getElementById('f-proveedor');
  const provAnterior = provSelect.value;
  const provs = [...new Set(filas.map(f => f.proveedor))];
  provSelect.innerHTML = '<option value="">Todos</option>' + provs.map(p => `<option value="${p}">${p}</option>`).join('');
  provSelect.value = provAnterior;

  const transSelect = document.getElementById('f-transito');
  const transAnterior = transSelect.value;
  const estados = [...new Set(filas.map(f => f.estado_transito))];
  transSelect.innerHTML = '<option value="">Todos</option>' + estados.map(e => `<option value="${e}">${e}</option>`).join('');
  transSelect.value = transAnterior;

  filtrarMonitor();
}

function claseCanal(canal) {
  const c = (canal || '').toLowerCase();
  if (c.includes('rojo')) return 'canal-rojo';
  if (c.includes('amarillo')) return 'canal-amarillo';
  if (c.includes('verde')) return 'canal-verde';
  return 'canal-pendiente';
}

function crearHtmlTarjeta(f) {
  return `
    <div class="prov-card">
      <span class="truck-icon">🚛</span>
      <div class="prov-name">${f.proveedor}</div>
      <div class="prov-detail"><strong>Fact:</strong> ${f.num_factura}</div>
      <div class="prov-detail"><strong>Pallets:</strong> ${f.pallets_recibidos ?? f.cant_pallets_est} | <strong>Cajas:</strong> ${f.cajas_recibidas ?? f.cant_cajas_est}</div>
      <div class="prov-detail"><strong>📅 ETA:</strong> ${fmtFecha(f.fecha_estimada_llegada)}</div>
      <span class="canal-tag ${claseCanal(f.canal_aduana)}">Canal: ${f.canal_aduana}</span>
    </div>
  `;
}

function filtrarMonitor() {
  const fProv = document.getElementById('f-proveedor').value.toLowerCase();
  const fCanal = document.getElementById('f-canal').value.toLowerCase();
  const fTrans = document.getElementById('f-transito').value.toLowerCase();
  const fBuscar = document.getElementById('f-buscar').value.toLowerCase();

  const filtrados = datosMonitorGlobal.filter(f => {
    const mProv = !fProv || (f.proveedor || '').toLowerCase() === fProv;
    const mCanal = !fCanal || (f.canal_aduana || '').toLowerCase() === fCanal;
    const mTrans = !fTrans || (f.estado_transito || '').toLowerCase() === fTrans;
    const mBuscar = !fBuscar || (f.num_factura || '').toLowerCase().includes(fBuscar);
    return mProv && mCanal && mTrans && mBuscar;
  });

  const stacks = {
    origen: document.getElementById('stack-origen'),
    transito: document.getElementById('stack-transito'),
    frontera: document.getElementById('stack-frontera'),
    aduana: document.getElementById('stack-aduana'),
    cedis: document.getElementById('stack-cedis')
  };
  Object.values(stacks).forEach(s => s.innerHTML = '');

  const activosRuta = filtrados.filter(f => {
    const estRec = (f.estado_recepcion || '').toLowerCase();
    return !estRec.includes('finalizado') && !estRec.includes('recibido');
  });

  activosRuta.forEach(f => {
    const estTr = (f.estado_transito || '').toLowerCase();
    const html = crearHtmlTarjeta(f);
    if (estTr.includes('frontera')) stacks.frontera.innerHTML += html;
    else if (estTr.includes('aduana')) stacks.aduana.innerHTML += html;
    else if (estTr.includes('tránsito') || estTr.includes('transito')) stacks.transito.innerHTML += html;
    else if (estTr.includes('cedis') || estTr.includes('arribo')) stacks.cedis.innerHTML += html;
    else stacks.origen.innerHTML += html;
  });

  const tbody = document.getElementById('tabla-body');
  if (filtrados.length === 0) {
    tbody.innerHTML = '<tr><td colspan="14" style="text-align:center;">No se encontraron registros.</td></tr>';
    return;
  }

  tbody.innerHTML = filtrados.map(f => {
    const canalStyle = { verde: 'color:#15803d;font-weight:bold;', amarillo: 'color:#b45309;font-weight:bold;', rojo: 'color:#b91c1c;font-weight:bold;' };
    const cKey = claseCanal(f.canal_aduana).replace('canal-', '');
    const fotos = fotosPorEmbarque[f.id] || (f.foto_url ? [f.foto_url] : []);
    galeriaFotosData[f.id] = fotos;
    const fotosHtml = fotos.length
      ? `<button type="button" class="foto-link" data-embarque-id="${f.id}" onclick="abrirGaleriaFotos(this.dataset.embarqueId)">📷 ${fotos.length}</button>`
      : '-';

    return `
      <tr>
        <td><code>${f.id_registro}</code></td>
        <td><strong>${f.proveedor}</strong></td>
        <td>${f.num_factura}</td>
        <td>${f.cant_pallets_est} / ${f.pallets_recibidos ?? '-'}</td>
        <td>${f.cant_cajas_est} / ${f.cajas_recibidas ?? '-'}</td>
        <td>${f.cubicaje_m3 ?? '-'}</td>
        <td>${fmtFecha(f.fecha_real_llegada)}</td>
        <td>${fmtFecha(f.fecha_entrega_oc)}</td>
        <td><strong>${f.dias_almacenaje ?? '-'}</strong></td>
        <td>${f.sku_recibidos ?? '-'}</td>
        <td><span style="${canalStyle[cKey] || ''}">${f.canal_aduana}</span></td>
        <td>${f.estado_transito}</td>
        <td>${f.estado_recepcion}</td>
        <td>${fotosHtml}</td>
      </tr>
    `;
  }).join('');
}