// Memoria editorial muy ligera. Persiste en disco y permite que el briefing
// referencie temas recientes ("esto sigue la línea de ayer con...").
//
// Almacenamiento: data/memory.json en la raíz del repo. El workflow de GitHub
// Actions tiene permisos `contents: write` y commitea cualquier cambio en data/
// al final de la corrida (ver .github/workflows/daily-briefing.yml).
//
// Si el archivo no existe o está corrupto, simplemente arrancamos con memoria vacía.
// Nunca rompemos la corrida por un problema de memoria.

import fs from 'node:fs/promises';
import path from 'node:path';

const MEMORY_DIR = path.resolve(process.cwd(), 'data');
const MEMORY_FILE = path.join(MEMORY_DIR, 'memory.json');
const MAX_DAYS = 7;

const EMPTY = { history: [] };

export async function loadMemory() {
  try {
    const raw = await fs.readFile(MEMORY_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.history)) return { ...EMPTY };
    return parsed;
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn(`[memory] No se pudo leer ${MEMORY_FILE}: ${err.message}`);
    }
    return { ...EMPTY };
  }
}

export async function saveMemory(memory) {
  try {
    await fs.mkdir(MEMORY_DIR, { recursive: true });
    const trimmed = {
      ...memory,
      history: (memory.history || []).slice(0, MAX_DAYS),
    };
    await fs.writeFile(MEMORY_FILE, JSON.stringify(trimmed, null, 2) + '\n', 'utf8');
    console.log(`[memory] Guardado en ${MEMORY_FILE} (${trimmed.history.length} días)`);
  } catch (err) {
    console.warn(`[memory] No se pudo escribir memoria: ${err.message}`);
  }
}

// Heurística simple: tomar las primeras N noticias y extraer temas como
// los primeros 8 tokens del título. Esto le da al modelo material para
// detectar continuidad sin necesidad de un segundo llamado a IA.
export function extractTopicsFromPicked(picked, { max = 12 } = {}) {
  const topics = [];
  for (const it of picked.slice(0, max)) {
    const t = (it.title || '').replace(/\s+/g, ' ').trim();
    if (t) topics.push(t);
  }
  return topics;
}

// Construye el bloque de contexto histórico que recibe el modelo.
// Lo dejamos compacto para no inflar tokens.
export function renderMemoryForPrompt(memory) {
  if (!memory?.history?.length) return '';
  const lines = [];
  for (const day of memory.history.slice(0, 4)) {
    if (!day?.date) continue;
    const heads = (day.headlines || []).slice(0, 6).map((h) => `  · ${h}`).join('\n');
    const summary = day.summary ? `  resumen: ${day.summary}` : '';
    lines.push(`Día ${day.date}:\n${heads}${summary ? '\n' + summary : ''}`);
  }
  return lines.join('\n\n');
}

export function appendDay(memory, { date, headlines, summary }) {
  const next = { ...memory, history: [...(memory.history || [])] };
  // Si ya existe una entrada para esa fecha, la reemplazamos.
  next.history = next.history.filter((d) => d?.date !== date);
  next.history.unshift({ date, headlines: headlines.slice(0, 12), summary: summary || null });
  return next;
}

// Extrae una "summary line" del briefing recién generado para guardarla.
// Tomamos el primer párrafo del resumen ejecutivo, recortado.
export function extractDailySummary(briefingMarkdown) {
  if (!briefingMarkdown) return null;
  const lines = briefingMarkdown.split('\n').map((l) => l.trim());
  // Buscamos la sección "Resumen ejecutivo" (case insensitive)
  let inSection = false;
  const buf = [];
  for (const l of lines) {
    if (/resumen ejecutivo/i.test(l) && /^#|^\*\*|^\d/.test(l)) { inSection = true; continue; }
    if (inSection) {
      if (!l) { if (buf.length) break; else continue; }
      if (/^#|^\d\./.test(l) && buf.length) break;
      buf.push(l);
      if (buf.join(' ').length > 320) break;
    }
  }
  const out = buf.join(' ').replace(/\s+/g, ' ').trim();
  return out ? out.slice(0, 320) : null;
}
