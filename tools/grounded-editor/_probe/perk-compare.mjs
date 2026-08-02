import { decompress as oozDecompress } from "ooz-wasm";
import fs from "fs";
import path from "path";

function unwrap(b) {
  return Buffer.from(oozDecompress(b.subarray(8, 8 + b.readUInt32LE(4)), b.readUInt32LE(0)));
}

const root = path.join(process.env.USERPROFILE, "Saved Games", "Grounded");
const slots = fs
  .readdirSync(root)
  .filter((n) => n.includes("LOGOUT") || n.includes("PREMIX") || n.includes("GameTime"))
  .slice(0, 8);

function parsePerks(host) {
  const PERK = "/Script/Maine.PerkComponent";
  const at = host.indexOf(PERK);
  if (at < 0) return null;
  let off = at + PERK.length + 1;
  const tag = host[off++];
  const count = host.readUInt32LE(off);
  off += 4;
  const unk = host.readUInt32LE(off);
  off += 4;
  const entries = [];
  for (let i = 0; i < count; i++) {
    const len = host.readInt32LE(off);
    const name = host.toString("ascii", off + 4, off + 4 + len - 1);
    const a = host.readInt32LE(off + 4 + len);
    const b = host.readInt32LE(off + 4 + len + 4);
    const c = host.readInt32LE(off + 4 + len + 8);
    entries.push({ name, a, b, c });
    off += 4 + len + 12;
  }
  return { count, entries, off };
}

for (const name of slots) {
  const hp = path.join(root, name, "HostPlayer.csav");
  if (!fs.existsSync(hp)) continue;
  try {
    const host = unwrap(fs.readFileSync(hp));
    const p = parsePerks(host);
    if (!p) continue;
    const nonzero = p.entries.filter((e) => e.a !== -1 || e.b !== 0 || e.c !== 0);
    const PUC = "/Script/Maine.PlayerUpgradeComponent";
    const u = host.indexOf(PUC);
    let perksLvl = "?";
    if (u >= 0) {
      const idx = host.indexOf("Perks", u);
      if (idx > 0) perksLvl = host.readInt32LE(idx + 6); // rough
      // better parse
      let o = u + PUC.length + 1 + 1;
      const uc = host.readUInt32LE(o);
      o += 8;
      for (let i = 0; i < uc; i++) {
        const len = host.readInt32LE(o);
        const n = host.toString("ascii", o + 4, o + 4 + len - 1);
        const level = host.readInt32LE(o + 4 + len);
        if (n === "Perks") perksLvl = level;
        o += 4 + len + 8;
      }
    }
    console.log(
      name.slice(0, 50),
      "perkEntries",
      p.count,
      "nonzero",
      nonzero.length,
      "PerksLvl",
      perksLvl,
      nonzero.slice(0, 5)
    );
  } catch (e) {
    console.log(name, "err", e.message);
  }
}
