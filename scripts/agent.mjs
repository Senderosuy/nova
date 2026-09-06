#!/usr/bin/env node
/**
 * Coordinación multi-agente para Nova Tech Hub.
 *
 * Los locks son archivos versionados en .agent/locks/. El repositorio es el
 * único canal compartido entre agentes que trabajan en máquinas distintas.
 *
 *   node scripts/agent.mjs status
 *   node scripts/agent.mjs claim "descripción" [rutas...]
 *   node scripts/agent.mjs heartbeat
 *   node scripts/agent.mjs release
 */

import { execSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { userInfo, hostname } from "node:os";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LOCKS = join(ROOT, ".agent", "locks");
const STALE_MINUTES = 90;

const agent = (process.env.AGENT_NAME || `${userInfo().username}@${hostname()}`)
  .replace(/[^a-zA-Z0-9._@-]/g, "_");

const lockPath = (name = agent) => join(LOCKS, `${name}.json`);
const now = () => new Date().toISOString();
const minutesSince = (iso) => Math.round((Date.now() - new Date(iso).getTime()) / 60000);

function git(cmd, fallback = "") {
  try {
    return execSync(`git ${cmd}`, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return fallback;
  }
}

function readLocks() {
  if (!existsSync(LOCKS)) return [];
  return readdirSync(LOCKS)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      try {
        return JSON.parse(readFileSync(join(LOCKS, f), "utf8"));
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function overlaps(a = [], b = []) {
  if (!a.length || !b.length) return false;
  return a.some((x) => b.some((y) => x.startsWith(y) || y.startsWith(x)));
}

// ---------------------------------------------------------------- status
function status() {
  git("fetch --quiet");

  const locks = readLocks();
  console.log(`\n  Agente actual: ${agent}\n`);

  if (!locks.length) {
    console.log("  LOCKS: ninguno. El camino está libre.\n");
  } else {
    console.log("  LOCKS ACTIVOS");
    for (const l of locks) {
      const age = minutesSince(l.heartbeat || l.since);
      const stale = age > STALE_MINUTES;
      const mark = l.agent === agent ? "→" : stale ? "!" : "•";
      console.log(`   ${mark} ${l.agent}${stale ? "  [STALE]" : ""}`);
      console.log(`     tarea:  ${l.task}`);
      if (l.paths?.length) console.log(`     rutas:  ${l.paths.join(", ")}`);
      console.log(`     activo: hace ${age} min\n`);
    }
    if (locks.some((l) => l.agent !== agent && minutesSince(l.heartbeat || l.since) <= STALE_MINUTES)) {
      console.log("  ⚠ Hay otro agente trabajando. Coordiná antes de tocar sus rutas.\n");
    }
  }

  const behind = git("rev-list --count HEAD..@{u}", "0");
  const ahead = git("rev-list --count @{u}..HEAD", "0");
  if (behind !== "0") console.log(`  ⚠ Hay ${behind} commit(s) remotos sin traer. Corré: git pull --rebase\n`);
  if (ahead !== "0") console.log(`  ⚠ Tenés ${ahead} commit(s) sin pushear.\n`);

  const dirty = git("status --short");
  if (dirty) console.log(`  Cambios locales sin commitear:\n${dirty.split("\n").map((l) => "     " + l).join("\n")}\n`);

  const log = git('log --since="24 hours" --pretty=format:"     %h %an  %s"');
  console.log("  COMMITS ÚLTIMAS 24 H");
  console.log(log ? log : "     (ninguno)");

  const pend = git("status --short supabase/migrations");
  if (pend) console.log(`\n  ⚠ Migraciones sin commitear:\n${pend.split("\n").map((l) => "     " + l).join("\n")}`);
  console.log("");
}

// ---------------------------------------------------------------- claim
function claim(task, paths) {
  if (!task) {
    console.error('Uso: npm run agent:claim "descripción de la tarea" -- ruta/uno ruta/dos');
    process.exit(1);
  }

  const conflicts = readLocks().filter(
    (l) =>
      l.agent !== agent &&
      minutesSince(l.heartbeat || l.since) <= STALE_MINUTES &&
      overlaps(l.paths, paths)
  );

  if (conflicts.length) {
    console.error("\n  ✖ Conflicto: otro agente reservó rutas que se superponen.\n");
    for (const c of conflicts) {
      console.error(`     ${c.agent} — ${c.task}`);
      console.error(`     rutas: ${(c.paths || []).join(", ")}\n`);
    }
    console.error("  Elegí otra parte del sistema o dejá una nota en .agent/NOTES.md\n");
    process.exit(2);
  }

  mkdirSync(LOCKS, { recursive: true });
  const lock = { agent, task, paths, since: now(), heartbeat: now(), branch: git("rev-parse --abbrev-ref HEAD") };
  writeFileSync(lockPath(), JSON.stringify(lock, null, 2) + "\n", "utf8");

  console.log(`\n  ✓ Lock tomado por ${agent}`);
  console.log(`    tarea: ${task}`);
  if (paths.length) console.log(`    rutas: ${paths.join(", ")}`);
  console.log("\n  Commiteá el lock para que los demás lo vean:");
  console.log('    git add .agent && git commit -m "chore(agent): claim" && git push\n');
}

// ---------------------------------------------------------------- heartbeat
function heartbeat() {
  const p = lockPath();
  if (!existsSync(p)) {
    console.error("  No tenés lock activo. Usá agent:claim primero.");
    process.exit(1);
  }
  const lock = JSON.parse(readFileSync(p, "utf8"));
  lock.heartbeat = now();
  writeFileSync(p, JSON.stringify(lock, null, 2) + "\n", "utf8");
  console.log(`  ✓ Heartbeat renovado (${lock.task})`);
}

// ---------------------------------------------------------------- release
function release() {
  const p = lockPath();
  if (!existsSync(p)) {
    console.log("  No había lock que liberar.");
    return;
  }
  const lock = JSON.parse(readFileSync(p, "utf8"));
  unlinkSync(p);
  console.log(`\n  ✓ Lock liberado tras ${minutesSince(lock.since)} min — ${lock.task}`);
  console.log("\n  Antes de cerrar, confirmá:");
  console.log("    · npm run build en verde");
  console.log("    · cambios pusheados");
  console.log("    · docs/SPEC.md actualizado si cambió la lógica\n");
}

const [, , cmd, ...rest] = process.argv;
switch (cmd) {
  case "status":
    status();
    break;
  case "claim":
    claim(rest[0], rest.slice(1));
    break;
  case "heartbeat":
    heartbeat();
    break;
  case "release":
    release();
    break;
  default:
    console.log("Comandos: status | claim <tarea> [rutas...] | heartbeat | release");
}
