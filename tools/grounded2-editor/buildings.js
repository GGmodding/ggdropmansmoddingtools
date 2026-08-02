(() => {
  "use strict";

  const C = window.GroundedCsav;
  const Tech = () => window.GroundedTech;

  const TECH_TABLE = "/Game/Blueprints/Items/Table_TechTrees.Table_TechTrees";
  const ACH_PATH = "/Script/Maine.AchievementsComponent";

  /** Harvested from a late-game PREMIX slot — used as unlock catalogs. */
  const PURCHASE_CATALOG = ["MultiStoryBuildings","FoundationPebblet","FortifiedWalls","SmithingStation","TorchUpgrade","PerkHealth","CookbookOak","SignsTeenspirit","LabRadar","BandageEfficient","CanteenUpgrade","PerkStamina","SignsCreature","SCABRadar","ZiplineRecipe","LadderRecipe","CookbookHedge","PerkFallDamage","SignsCrow","ProductionBuildings","CrowRoofs","CookBookHaze","SignsDaydream","TurretPebblet","QueenBefriendRed","UpgradeCandy","SignDaydream2","QueenBefriendBlack","FloatingFoundations","PerkTeamDamage","CurvedBases","CookbookPond","SignsPond","StickyBomb","FlippersUpgrade","DivingLanternUpgrade","RecipeSetLures","WeaponUpgradeQuartzite","UpgradeMaterialsTier1","CookbookSandbox","SignsWesternYard","Wafter","Glue","SignsPicnicTable","CollectibleRadar","Tier3WeaponMint","HatWizard","CandyStaves","CookbookTermite","SignsCreature2","UpgradeJewelAugments","UpgradeJewelRaw","UpgradeMaterialsTier2","CharcoalBuilding","SignsYoked","QueenBefriendFire","HolidayChristmasTree","SignsetDecember","PerkLootLuck","CookbookBrawnyBin","SignsCreature3","RugsCreatures","SignsetIBM","FireworkLauncher","SignsNG+","RugsScience","UpgradeStationLegendary","KatanaSour","WarhammerSpicy","GreatAxeMint","GreatswordMint","ItemsBurgle","BattleAxeSpicy","GreatAxeSpicy","MaceSour","GreatswordSour","Telepotty","BattleAxeMint","MaceSpicy","KatanaMint","WarhammerSour","PickaxeSalt","SignSetApril","Scarecrow"];
  const BUILDING_CATALOG = ["LeanTo","MarkerBuilding","Campfire","FenceA","StuffedAphid","WallMountAphid","FireplaceHearth","FireplaceChimney","FireplaceChimneyVent","FireplaceChimneyTop","FireplaceChimneyHalf","PartitionC","FireplaceChimneyTopCrow","CandleA","CandleB","AwningClover","AwningCloverB","AwningCloverCorner","AwningCloverHalf","Shelf_A","WallWindow","Workbench","TableA","WallTriangleA","WallHalf","WallHalfCrenelated","Wall","WallHalfVert","WallHalfCrenelatedVert","WallQuarter","WallQuarterTriangle","Door","WallMountSpiderling","WallMountSpiderHead","StuffedSpiderOrb","WeaponUpgradeStation","CookingStation","FloorHalfGrass","ScaffoldFloor","FloorTriangleA","FenceStairsA","FenceStairsB","Stairs","StairsSpiralAcorn","RoofStraight","RoofCorner","RoofCornerSquare","RoofFlat","RoofPeaked","RoofPeakedB","RoofFlatB","StairsGrassHalf","RoofCapWallA","StairsAcorn","StairsAcornCorner","StairsAcornHalf","StairsAcornHalfCorner","StairsCorner","StairsGrassHalfCorner","RoofValleyGrass","RoofValleyLog","RoofInteriorCorner","StairsCornerInterior","StairsGrassHalfCornerInterior","StairsAcornHalfCornerInterior","StairsAcornCornerInterior","FloorQuarterGrass","RoofFlatHalf","RoofStraightHalf","RoofFlatQuarter","WallFortified","DoorLogB","WallFortifiedWindow","WallPalisade","FloorLog","FloorTriangleLog","WallLogHalf","PillarClay","PillarLog","PillarRock","FloorHalfLog","WallLogHalfVert","FloorQuarterLog","WallPalisadeHalfVert","WallQuarterLog","WallQuarterLogTriangle","Storage","TableB","CeilingMountedFireflyLight","StuffedGnat","DryingRack","StuffedBombardier","WallMountedSlimeMold","SpinningWheel","BasketballHoop","BasketballHoopWall","StuffedSpiderling","TorchHolder","WallMountedTorch","StatueAphid","WaterContainer","Sign","Refinery","StorageBig","StuffedWeevil","LogStorage","PlankStorage","BarricadeSpike","WallMountSpiderWolfHead","StuffedSpiderWolf","FoundationPebblet","FoundationRampPebblet","FoundationPebbletCurved","FoundationPebbletHalf","PathPebble","PathCurvedPebble","FoundationPebbletQuarter","FoundationClay","FoundationRampClay","FoundationClayCurved","FoundationClayHalf","FoundationClayQuarter","VanityVaseB","VanityVaseA","VanityVaseC","ArmorDummy","WeaponMount","StuffedMite","WallMountMite","WallMountTadpole","StuffedTadpole","WallMountSpiderWaterBoatman","StuffedWaterBoatman","ChairBerry","WallMountWeevil","StuffedStinkbug","WallMountStinkbug","SapCatcher","MashBowl","FenceB","MushroomGarden","StuffedLadybug","StuffedFirefly","WallMountFireflyHead","Trampoline","Ladder","BedSimple","MarkerBuildingBuoyant","WallMountLadybugHead","StuffedAntSoldier","WallMountSoldierAntHead","TargetArchery","TargetDummy","TargetArcheryStand","ChairA","ChairKoi","WallMountSpiderDivingBell","StuffedSpiderDivingBell","ZiplineAnchorGround","ZiplineAnchorWall","FloorGrassCurved","FloorGrassCurvedHalf","FloorLogCurved","FloorLogCurvedHalf","WallFortifiedCurved","WallFortifiedWindowCurved","WallGrassCurved","WallLogCurved","WallLogWindowCurved","WallPalisadeCurved","FenceCurvedA","FenceCurvedB","DoorCurved","DoorLogCurvedA","DoorLogCurvedB","WallGrassCurvedCrenelatedHalf","WallGrassCurvedHalf","WallLogCurvedHalf","FloorGrassCurvedHalfOuter","FloorLogCurvedHalfOuter","DewCollector","WallMountWaterFlea","StuffedWaterFlea","WallMountBombardierHead","WallMountLarvaHead","StuffedLarva","WallMountLadybugInfected","WallMountEvilWeevilHead","WallMountLarvaInfected","WallMountMiteInfected","WallMountSpiderWolfInfectedHead","WallMountGnatInfected","StuffedWeevilEvil","StuffedMiteInfected","StuffedGnatInfected","StuffedSpiderWolfInfected","StuffedLadybugInfected","StuffedLarvaInfected","WallMountGnat","WallMountMosquitoHead","StuffedMosquito","WallMountAntHead","StuffedAntWorker","Smelter","WallMountBeeHead","WallMountAntlion","StuffedAntlion","RoofCornerCrow","RoofCornerSquareCrow","RoofStraightCrow","RoofPeakedCrow","RoofPeakedCrowB","RoofPeakedCrowBLarge","RoofCapWallB","RoofFlatCrow","RoofFlatCrowB","RoofInteriorCornerCrow","RoofFlatCrowHalf","RoofStraightCrowHalf","RoofFlatCrowQuarter","WallMushroom","WallMushroomArchA","WallMushroomCurved","WallMushroomCurvedHalfB","WallMushroomCurvedHalf","WallMushroomHalf","WallMushroomHalfVert","WallQuarterMushroom","WallQuarterMushroomTriangle","WallMushroomHalfCrenellated","WallMushroomTriangleA","WallMushroomWindow","WallMushroomWindowCurved","DoorMushroom","DoorMushroomCurved","PillarMushroom","PetHome","StairsMushroom","StairsMushroomHalf","StairsMushroomHalfB","StairsMushroomB","StairsMushroomBCorner","StairsMushroomHalfCorner","StairsMushroomBCornerInterior","StairsMushroomHalfCornerInterior","RoofValleyMushroom","WallMountAntBlackSoldier","StuffedAntBlackSoldier","WallMountAntBlackWorker","StuffedAntBlackWorker","TotemAntHead","WallMountBossBroodmother","StuffedSpiderBroodMother","CeilingMountedBroodmotherChandelier","ChairBroodmother","WallMountWidow","WallMountWidowling","StuffedSpiderBlackWidow","StuffedSpiderlingWidow","GlueFactory","TrapTurretPebblet","FoundationBuoyant","FoundationBuoyantRamp","LureTrap","WaveSpawner","WallMountAntFireSoldier","StuffedAntFireSoldier","Shelf_B","TrashCan","HotTub","PartitionB","BedBunk","AwningCrow","AwningCrowB","AwningCrowCorner","AwningCrowHalf","WallMountBlackOx","StuffedBlackOx","StuffedWaspQueen","WallMountWaspQueenHead","ChairWaspQueen","RugBee","RugWeevil","RugMite","WallMountBossMantis","CeilingMountedMantisLight","MantisFountain","StuffedMantis","WallMountTick","StuffedMiteTick","WallMountScarab","StuffedScarab","FloorBurr","FloorBurrCurved","FloorBurrCurvedHalf","FloorHalfBurr","FloorTriangleBurr","FloorBurrCurvedHalfOuter","FloorQuarterBurr","TrapProximityBomb","WallMountMosquitoTiger","StuffedMosquitoTiger","CeilingMountedWaspQueenFan","WallMountTermiteSoldier","StuffedTermiteSoldier","StuffedMiteDust","WallMountMiteDust","WallMountMoth","StuffedMoth","WallMountTermiteKing","StuffedTermiteKing","OrganTermiteKing","WallMountTermite","StuffedTermite","LampWasp","PartitionD","StuffedWasp","WallMountWaspHead","WallMountStinkbugGreen","StuffedStinkbugGreenShield","StuffedLarvaLadybird","WallMountLarvaLadybird","StuffedBee","ScaffoldTriangleWall","ScaffoldBare","ScaffoldTriangleBare","ScaffoldBareWall","DoorFrame","DoorLogA","WallLog","WallLogWindow","WallLogTri","StorageSideTable","WallMountRolyPoly","StuffedRolyPoly"];

  const KNOWLEDGE_BULK = {
    bestiary: [
      "BestiaryWeevil", "BestiaryAphid", "BestiarySpiderWolf", "BestiaryLadybug",
      "BestiaryLarva", "BestiaryBombardier", "BestiaryFirefly", "BestiarySpiderOrb",
      "BestiaryGnat", "BestiaryMite", "BestiaryAntWorker", "BestiaryAntSoldier",
      "BestiaryBee", "BestiaryStinkbug", "BestiaryMosquito", "BestiaryWaterFlea",
      "BestiaryTadpole", "BestiaryWaterBoatman", "BestiaryBlackOx", "BestiaryTermite",
      "BestiaryWasp", "BestiaryMoth", "BestiaryScarab", "BestiaryTick",
    ],
    bossKeys: [
      "BossKeyBroodmother", "BossKeyMantis", "BossKeyWaspQueen", "BossKeyIBM",
      "BossKeyAntQueenRedKill", "BossKeyAntQueenBlackKill", "BossKeyAntQueenFireKill",
      "BossKeyAntQueenRedBefriend", "BossKeyAntQueenBlackBefriend",
      "BossKeyAntQueenFireBefriend", "BossKeyAntQueenRedInfect",
      "BossKeyAntQueenBlackInfect", "BossKeyAntQueenFireInfect",
    ],
    scabs: ["SCABManual", "ScannerBracelet"],
    passwords: [
      "PasswordPieceHedgeLab04", "PasswordPieceHedgeLab01", "PasswordPieceHedgeLab02",
      "PasswordPieceHedgeLab03", "PasswordPieceOakLab", "PasswordPiecePondLab",
    ],
  };

  function readFString(buf, off) {
    if (off < 0 || off + 4 > buf.length) return null;
    const len = new DataView(buf.buffer, buf.byteOffset + off, 4).getInt32(0, true);
    if (len <= 1 || len > 120 || off + 4 + len > buf.length) return null;
    const raw = buf.subarray(off + 4, off + 4 + len - 1);
    for (let i = 0; i < raw.length; i++) {
      const c = raw[i];
      if (c !== 0 && (c < 32 || c > 126)) return null;
    }
    let s = "";
    for (let i = 0; i < raw.length; i++) s += String.fromCharCode(raw[i]);
    if (!/^[A-Za-z][A-Za-z0-9_+.\-]*$/.test(s)) return null;
    return { s, next: off + 4 + len, len };
  }

  function encodeFString(str) {
    const s = String(str || "");
    const out = new Uint8Array(4 + s.length + 1);
    C.writeU32(out, 0, s.length + 1);
    for (let i = 0; i < s.length; i++) out[4 + i] = s.charCodeAt(i);
    out[4 + s.length] = 0;
    return out;
  }

  function indexOfAscii(buf, ascii, from) {
    const enc = new TextEncoder().encode(ascii);
    outer: for (let i = Math.max(0, from || 0); i <= buf.length - enc.length; i++) {
      for (let j = 0; j < enc.length; j++) {
        if (buf[i + j] !== enc[j]) continue outer;
      }
      return i;
    }
    return -1;
  }

  function findTechTreesEnd(buf) {
    const first = indexOfAscii(buf, TECH_TABLE, 0);
    if (first < 0) return -1;
    let t = first;
    let last = first;
    while (t >= 0 && t < first + 10000) {
      const name = readFString(buf, t + TECH_TABLE.length + 1);
      if (!name) break;
      last = name.next;
      const next = indexOfAscii(buf, TECH_TABLE, name.next);
      if (next < 0 || next > first + 10000) break;
      t = next;
    }
    return last;
  }

  function parsePurchases(rawWorld) {
    const buf = C.toBytes(rawWorld);
    const start = findTechTreesEnd(buf);
    if (start < 0 || start + 8 > buf.length) return { ok: false, entries: [] };
    const countOff = start;
    const count = C.readU32(buf, countOff);
    const unk = C.readU32(buf, countOff + 4);
    if (count < 1 || count > 500) return { ok: false, entries: [] };
    let off = countOff + 8;
    const entries = [];
    for (let i = 0; i < count; i++) {
      const fs = readFString(buf, off);
      if (!fs || fs.next + 8 > buf.length) break;
      const cost = C.readU32(buf, fs.next);
      const flag = C.readU32(buf, fs.next + 4);
      entries.push({
        name: fs.s,
        cost,
        flag,
        start: off,
        end: fs.next + 8,
        costAt: fs.next,
      });
      off = fs.next + 8;
    }
    return { ok: entries.length > 0, countOff, unk, entries, end: off };
  }

  function walkBuildingEntries(buf, nameAt) {
    let off = nameAt;
    const entries = [];
    for (;;) {
      const fs = readFString(buf, off);
      if (!fs || fs.next + 12 > buf.length) break;
      if (!/^[A-Za-z][A-Za-z0-9_]{1,60}$/.test(fs.s)) break;
      entries.push({
        name: fs.s,
        start: off,
        end: fs.next + 12,
        size: fs.next + 12 - off,
      });
      off = fs.next + 12;
      if (entries.length > 2000) break;
    }
    return entries;
  }

  function findBuildingCountOff(buf, nameAt, entryCount) {
    // Normal layout: count + unk immediately before first name.
    if (nameAt >= 8 && C.readU32(buf, nameAt - 8) === entryCount) {
      return nameAt - 8;
    }
    // Analyze/tech inserts can land between the count header and LeanTo.
    // Scan backward for a u32 matching the walked list length.
    for (let back = 8; back <= 4096; back += 4) {
      const off = nameAt - back;
      if (off < 0) break;
      if (C.readU32(buf, off) === entryCount) return off;
    }
    return nameAt >= 8 ? nameAt - 8 : -1;
  }

  function parseBuildings(rawWorld) {
    const buf = C.toBytes(rawWorld);
    // Walk from each LeanTo FString with a +12 trailer. Prefer the longest
    // coherent catalog (MarkerBuilding nearby). Do not trust nameAt-8 count
    // alone — analyzed-item inserts can sit between the real count and LeanTo.
    let best = null;
    let from = 0;
    for (;;) {
      const hit = indexOfAscii(buf, "LeanTo", from);
      if (hit < 0) break;
      from = hit + 1;
      if (hit < 4) continue;
      if (C.readU32(buf, hit - 4) !== "LeanTo".length + 1) continue;
      const nameAt = hit - 4;
      const entries = walkBuildingEntries(buf, nameAt);
      if (entries.length < 5 || entries[0].name !== "LeanTo") continue;
      const hasMarker = entries.some((e) => e.name === "MarkerBuilding");
      if (!hasMarker && entries.length < 40) continue;
      const countOff = findBuildingCountOff(buf, nameAt, entries.length);
      if (countOff < 0) continue;
      const unk = C.readU32(buf, countOff + 4);
      const candidate = {
        ok: true,
        countOff,
        unk,
        entries,
        end: entries[entries.length - 1].end,
        headerDetached: countOff + 8 !== nameAt,
      };
      if (!best || candidate.entries.length > best.entries.length) {
        best = candidate;
      }
    }
    return best || { ok: false, entries: [] };
  }

  function encodePurchase(name, cost) {
    const fs = encodeFString(name);
    const out = new Uint8Array(fs.length + 8);
    out.set(fs, 0);
    C.writeU32(out, fs.length, cost || 0);
    C.writeU32(out, fs.length + 4, 2);
    return out;
  }

  function encodeBuilding(name) {
    const fs = encodeFString(name);
    const out = new Uint8Array(fs.length + 12);
    out.set(fs, 0);
    // 0,0,1 trailer observed on unlocked buildings
    C.writeU32(out, fs.length, 0);
    C.writeU32(out, fs.length + 4, 0);
    C.writeU32(out, fs.length + 8, 1);
    return out;
  }

  function addPurchase(rawWorld, name, cost) {
    const parsed = parsePurchases(rawWorld);
    if (!parsed.ok) throw new Error("Could not parse BURG.L purchases.");
    if (parsed.entries.some((e) => e.name === name)) {
      return { bytes: C.toBytes(rawWorld), mode: "exists", added: name };
    }
    const buf = C.toBytes(rawWorld);
    const rec = encodePurchase(name, cost || 0);
    const insertAt = parsed.entries[parsed.entries.length - 1].end;
    const out = new Uint8Array(buf.length + rec.length);
    out.set(buf.subarray(0, insertAt), 0);
    out.set(rec, insertAt);
    out.set(buf.subarray(insertAt), insertAt + rec.length);
    C.writeU32(out, parsed.countOff, parsed.entries.length + 1);
    return { bytes: out, mode: "add", added: name, count: parsed.entries.length + 1 };
  }

  function addBuilding(rawWorld, name) {
    const parsed = parseBuildings(rawWorld);
    if (!parsed.ok) throw new Error("Could not parse building unlocks.");
    if (parsed.entries.some((e) => e.name === name)) {
      return { bytes: C.toBytes(rawWorld), mode: "exists", added: name };
    }
    const buf = C.toBytes(rawWorld);
    const rec = encodeBuilding(name);
    const insertAt = parsed.entries[parsed.entries.length - 1].end;
    const out = new Uint8Array(buf.length + rec.length);
    out.set(buf.subarray(0, insertAt), 0);
    out.set(rec, insertAt);
    out.set(buf.subarray(insertAt), insertAt + rec.length);
    C.writeU32(out, parsed.countOff, parsed.entries.length + 1);
    return { bytes: out, mode: "add", added: name, count: parsed.entries.length + 1 };
  }

  function unlockPurchaseCatalog(rawWorld) {
    let buf = new Uint8Array(C.toBytes(rawWorld));
    let added = 0;
    let skipped = 0;
    const have = new Set(parsePurchases(buf).entries.map((e) => e.name));
    // Also treat currently owned as catalog seeds
    const catalog = [...new Set([...PURCHASE_CATALOG, ...have])];
    for (const name of catalog) {
      if (have.has(name)) {
        skipped++;
        continue;
      }
      const r = addPurchase(buf, name, 0);
      buf = new Uint8Array(r.bytes);
      if (r.mode === "add") {
        added++;
        have.add(name);
      } else skipped++;
    }
    return { bytes: buf, added, skipped, total: catalog.length };
  }

  function unlockAllBuildingsFromSave(rawWorld, catalogNames) {
    let buf = new Uint8Array(C.toBytes(rawWorld));
    const parsed = parseBuildings(buf);
    if (!parsed.ok) throw new Error("Could not parse buildings.");
    const have = new Set(parsed.entries.map((e) => e.name));
    const catalog = catalogNames && catalogNames.length ? catalogNames : BUILDING_CATALOG;
    let added = 0;
    let skipped = 0;
    for (const name of catalog) {
      if (have.has(name)) {
        skipped++;
        continue;
      }
      const r = addBuilding(buf, name);
      buf = new Uint8Array(r.bytes);
      if (r.mode === "add") {
        added++;
        have.add(name);
      } else skipped++;
    }
    return { bytes: buf, added, skipped, total: catalog.length, owned: have.size };
  }

  function parseAchievements(rawPlayer) {
    const buf = C.toBytes(rawPlayer);
    const at = indexOfAscii(buf, ACH_PATH, 0);
    if (at < 0) return { ok: false, entries: [] };
    let off = at + ACH_PATH.length + 1;
    // G2 short-name FString
    const short = readFString(buf, off);
    if (short && /^Achievements/i.test(short.s)) off = short.next;
    if (off + 9 > buf.length) return { ok: false, entries: [] };
    if (buf[off] === 0) off += 1;
    const count = C.readU32(buf, off);
    off += 4;
    const unk = C.readU32(buf, off);
    off += 4;
    if (count < 1 || count > 200) return { ok: false, entries: [] };
    const entries = [];
    for (let i = 0; i < count; i++) {
      const fs = readFString(buf, off);
      if (!fs || fs.next + 12 > buf.length) break;
      const a = new DataView(buf.buffer, buf.byteOffset + fs.next, 4).getInt32(0, true);
      const b = new DataView(buf.buffer, buf.byteOffset + fs.next + 4, 4).getInt32(0, true);
      const c = new DataView(buf.buffer, buf.byteOffset + fs.next + 8, 4).getInt32(0, true);
      entries.push({
        id: fs.s,
        a,
        b,
        c,
        d: c,
        flagAt: fs.next + 4,
        doneAt: fs.next + 8,
        unlocked: b > 0 || c > 0,
      });
      off = fs.next + 12;
    }
    return { ok: entries.length > 0, count, unk, entries };
  }

  function completeAllAchievements(rawPlayer) {
    const parsed = parseAchievements(rawPlayer);
    if (!parsed.ok) throw new Error("Could not parse AchievementsComponent.");
    const buf = new Uint8Array(C.toBytes(rawPlayer));
    let changed = 0;
    for (const e of parsed.entries) {
      const b = new DataView(buf.buffer, buf.byteOffset + e.flagAt, 4).getInt32(0, true);
      const d = new DataView(buf.buffer, buf.byteOffset + e.doneAt, 4).getInt32(0, true);
      if (b < 1) {
        new DataView(buf.buffer, buf.byteOffset + e.flagAt, 4).setInt32(0, 1, true);
        changed++;
      }
      if (d < 1) {
        new DataView(buf.buffer, buf.byteOffset + e.doneAt, 4).setInt32(0, 1, true);
        changed++;
      }
    }
    return { bytes: buf, changed, total: parsed.entries.length };
  }

  function unlockKnowledgeBulk(rawWorld, kind) {
    const list = KNOWLEDGE_BULK[kind];
    if (!list) throw new Error("Unknown knowledge bulk kind: " + kind);
    const T = Tech();
    if (!T) throw new Error("Tech module missing.");
    let buf = new Uint8Array(C.toBytes(rawWorld));
    let added = 0;
    let skipped = 0;
    for (const name of list) {
      const r = T.addKnowledgeItem(buf, name);
      buf = new Uint8Array(r.bytes);
      if (r.mode === "add") added++;
      else skipped++;
    }
    return { bytes: buf, added, skipped, total: list.length, kind };
  }

  function unlockAllKnowledgeCategories(rawWorld) {
    let buf = new Uint8Array(C.toBytes(rawWorld));
    const summary = {};
    for (const kind of Object.keys(KNOWLEDGE_BULK)) {
      const r = unlockKnowledgeBulk(buf, kind);
      buf = new Uint8Array(r.bytes);
      summary[kind] = { added: r.added, skipped: r.skipped };
    }
    return { bytes: buf, summary };
  }

  window.GroundedProgress = Object.assign({}, window.GroundedProgress || {}, {
    parsePurchases,
    parseBuildings,
    parseAchievements,
    addPurchase,
    addBuilding,
    unlockPurchaseCatalog,
    unlockAllBuildingsFromSave,
    completeAllAchievements,
    unlockKnowledgeBulk,
    unlockAllKnowledgeCategories,
    PURCHASE_CATALOG,
    BUILDING_CATALOG,
    KNOWLEDGE_BULK,
  });
})();
